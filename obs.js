/* StreamMask - OBS bağlantısı (arka plan servisinde importScripts ile yüklenir)
 *
 * Amaç: korumayı hatırlamaya bağlı bırakmamak. "Yayını Başlat"a bastığın anda
 * maskeleme ve Yayın Modu kendiliğinden açılır, yayın bitince eski haline döner.
 *
 * obs-websocket 5 protokolü (OBS 28+ ile birlikte gelir, ek eklenti gerekmez):
 *   op 0 Hello -> op 1 Identify -> op 2 Identified, sonra op 5 Event / op 7 yanıt.
 * Yeni izin gerektirmez: WebSocket bağlantıları host izinlerine tabi değil, bu
 * yüzden yayındaki uzantı güncellemede kullanıcıdan yeni onay istemez.
 *
 * MV3 servis çalışanı 30 saniye boşta kalınca kapanır; soket trafiği ömrü uzatsa
 * da garanti değil. Bu yüzden 20 saniyede bir ping atıyor ve dakikalık bir alarm
 * ile uyanıp bağlantının kopup kopmadığına bakıyoruz.
 */

const OBS_KEY = 'yk_obs';                 // durum (açılır pencere okur)
const OBS_SUB_OUTPUTS = 1 << 6;           // eventSubscriptions: Outputs
const OBS_PING_MS = 20000;
const OBS_ALARM = 'streammask-obs';

const DEFAULT_OBS = {
  enabled: false,
  port: 4455,
  password: '',
  triggers: { stream: true, record: false },
  apply: { mask: true, stream: true },
  revert: true                            // yayın bitince eski haline dön
};

let obsSocket = null;
let obsPing = null;
let obsReqId = 0;
let obsRetry = 0;
let obsOutputs = { stream: false, record: false };

/* ---------- yardımcılar ---------- */
function obsB64(buf) {
  const b = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s);
}
async function obsSha256(str) {
  return crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
}
async function obsAuth(password, salt, challenge) {
  const secret = obsB64(await obsSha256(password + salt));
  return obsB64(await obsSha256(secret + challenge));
}
async function obsConfig() {
  const st = await chrome.storage.local.get('settings');
  const cfg = (st.settings && st.settings.obs) || {};
  return {
    enabled: !!cfg.enabled,
    port: Number(cfg.port) > 0 ? Number(cfg.port) : DEFAULT_OBS.port,
    password: typeof cfg.password === 'string' ? cfg.password : '',
    triggers: Object.assign({}, DEFAULT_OBS.triggers, cfg.triggers),
    apply: Object.assign({}, DEFAULT_OBS.apply, cfg.apply),
    revert: cfg.revert !== false
  };
}
async function obsSetState(patch) {
  const st = await chrome.storage.local.get(OBS_KEY);
  const next = Object.assign({ connected: false, streaming: false, recording: false, error: null }, st[OBS_KEY], patch);
  await chrome.storage.local.set({ [OBS_KEY]: next });
  return next;
}
async function obsGetState() {
  const st = await chrome.storage.local.get(OBS_KEY);
  return st[OBS_KEY] || { connected: false, streaming: false, recording: false, error: null };
}

function obsSend(msg) {
  if (obsSocket && obsSocket.readyState === WebSocket.OPEN) {
    obsSocket.send(JSON.stringify(msg));
    return true;
  }
  return false;
}
function obsRequest(requestType, requestData) {
  return obsSend({ op: 6, d: { requestType, requestId: 'sm' + (++obsReqId), requestData } });
}

/* ---------- bağlantı ---------- */
async function obsConnect(force) {
  const cfg = await obsConfig();
  if (!cfg.enabled) { await obsDisconnect(); return; }
  if (obsSocket && (obsSocket.readyState === WebSocket.OPEN || obsSocket.readyState === WebSocket.CONNECTING)) {
    if (!force) return;
    try { obsSocket.close(); } catch (e) {}
  }
  let ws;
  try {
    ws = new WebSocket(`ws://127.0.0.1:${cfg.port}`);
  } catch (e) {
    await obsSetState({ connected: false, error: String(e && e.message || e) });
    return;
  }
  obsSocket = ws;

  ws.addEventListener('message', async ev => {
    let msg;
    try { msg = JSON.parse(ev.data); } catch (e) { return; }
    if (msg.op === 0) {                                   // Hello
      const d = msg.d || {};
      const identify = { rpcVersion: 1, eventSubscriptions: OBS_SUB_OUTPUTS };
      if (d.authentication) {
        if (!cfg.password) {
          await obsSetState({ connected: false, error: 'authRequired' });
          try { ws.close(); } catch (e) {}
          return;
        }
        identify.authentication = await obsAuth(cfg.password, d.authentication.salt, d.authentication.challenge);
      }
      obsSend({ op: 1, d: identify });
      return;
    }
    if (msg.op === 2) {                                   // Identified
      obsRetry = 0;
      await obsSetState({ connected: true, error: null });
      obsRequest('GetStreamStatus');                      // OBS zaten yayındaysa yakala
      obsRequest('GetRecordStatus');
      return;
    }
    if (msg.op === 7) {                                   // istek yanıtı
      const d = msg.d || {};
      const data = d.responseData || {};
      if (d.requestType === 'GetStreamStatus') await obsOutputChanged('stream', !!data.outputActive);
      if (d.requestType === 'GetRecordStatus') await obsOutputChanged('record', !!data.outputActive);
      return;
    }
    if (msg.op === 5) {                                   // olay
      const d = msg.d || {};
      if (d.eventType === 'StreamStateChanged') await obsOutputChanged('stream', !!(d.eventData && d.eventData.outputActive));
      if (d.eventType === 'RecordStateChanged') await obsOutputChanged('record', !!(d.eventData && d.eventData.outputActive));
    }
  });

  ws.addEventListener('close', async () => {
    if (obsSocket === ws) obsSocket = null;
    clearInterval(obsPing); obsPing = null;
    const st = await obsGetState();
    await obsSetState({ connected: false, error: st.error === 'authRequired' ? 'authRequired' : null });
    const c = await obsConfig();
    if (c.enabled) {
      obsRetry = Math.min(obsRetry + 1, 6);
      setTimeout(() => obsConnect(), Math.min(30000, 2000 * obsRetry));
    }
  });

  ws.addEventListener('error', async () => {
    await obsSetState({ connected: false, error: 'connectFailed' });
  });

  ws.addEventListener('open', () => {
    clearInterval(obsPing);
    // Servis çalışanının boşta kapanmaması ve kopan soketi fark etmek için
    obsPing = setInterval(() => {
      if (!obsRequest('GetVersion')) { clearInterval(obsPing); obsPing = null; }
    }, OBS_PING_MS);
  });
}

async function obsDisconnect() {
  clearInterval(obsPing); obsPing = null;
  if (obsSocket) {
    const s = obsSocket;
    obsSocket = null;
    try { s.close(); } catch (e) {}
  }
  await obsSetState({ connected: false, streaming: false, recording: false });
}

/* ---------- yayın/kayıt durumu değişti ---------- */
async function obsOutputChanged(kind, active) {
  if (obsOutputs[kind] === active) return;
  obsOutputs[kind] = active;
  await obsSetState(kind === 'stream' ? { streaming: active } : { recording: active });

  const cfg = await obsConfig();
  if (!cfg.triggers[kind]) return;

  // Hem yayın hem kayıt tetikleyici olabilir: biri hâlâ açıksa korumayı bırakma
  const anyActive = (cfg.triggers.stream && obsOutputs.stream) || (cfg.triggers.record && obsOutputs.record);
  if (anyActive) await obsProtectOn(cfg);
  else if (cfg.revert) await obsProtectOff(cfg);
}

/* Açarken önceki durumu not ediyoruz; kapanışta yalnızca kendi değiştirdiğimizi
 * geri alıyoruz. Maskelemeyi zaten açık tutan kullanıcının ayarı bozulmasın. */
async function obsProtectOn(cfg) {
  const st = await chrome.storage.local.get([OBS_KEY, 'settings']);
  const state = st[OBS_KEY] || {};
  if (state.held) return;
  const settings = st.settings || {};
  const streamState = await getStreamState();
  const held = { mask: settings.enabled !== false, stream: !!streamState.on };

  if (cfg.apply.mask && !held.mask) {
    await chrome.storage.local.set({ settings: Object.assign({}, settings, { enabled: true }) });
  }
  await obsSetState({ held });
  if (cfg.apply.stream && !held.stream) {
    try { await enableStreamMode(); } catch (e) { await obsSetState({ error: String(e && e.message || e) }); }
  }
}

async function obsProtectOff(cfg) {
  const st = await chrome.storage.local.get([OBS_KEY, 'settings']);
  const state = st[OBS_KEY] || {};
  const held = state.held;
  if (!held) return;
  const settings = st.settings || {};
  if (cfg.apply.mask && !held.mask && settings.enabled) {
    await chrome.storage.local.set({ settings: Object.assign({}, settings, { enabled: false }) });
  }
  await obsSetState({ held: null });
  if (cfg.apply.stream && !held.stream) {
    const cur = await getStreamState();
    if (cur.on) { try { await disableStreamMode(); } catch (e) { /* açılır pencerede elle kapatılabilir */ } }
  }
}

/* ---------- giriş noktaları ---------- */
async function obsInit() {
  const cfg = await obsConfig();
  if (!cfg.enabled) { await obsSetState({ connected: false }); return; }
  try { await chrome.alarms.create(OBS_ALARM, { periodInMinutes: 1 }); } catch (e) {}
  await obsConnect();
}
