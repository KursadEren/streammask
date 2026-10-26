/* StreamMask - masaüstü köprüsü (arka plan servisinde importScripts ile yüklenir)
 *
 * StreamMask Desktop ile tek anahtar: uygulamada "Yayına geç" dendiğinde tarayıcıda
 * maskeleme ve Yayın Modu açılır; buradan Yayın Modu açıldığında da uygulama
 * uygulamaları gizler, bildirimleri susturur.
 *
 * Bağlantı yalnızca 127.0.0.1'e açılır ve uygulamanın ürettiği eşleştirme kodu
 * gönderilir. Kod olmadan sunucu bağlantıyı kapatır — çünkü herhangi bir web
 * sayfası da localhost'a WebSocket açabilir.
 */

const BRIDGE_KEY = 'yk_bridge';
const BRIDGE_ALARM = 'streammask-bridge';
const BRIDGE_PING_MS = 20000;

const DEFAULT_BRIDGE = {
  enabled: false,
  port: 47811,
  token: '',
  apply: { mask: true, stream: true },   // uygulama yayına geçince burada ne açılsın
  push: true                             // buradaki Yayın Modu uygulamaya da iletilsin
};

let bridgeSocket = null;
let bridgePing = null;
let bridgeRetry = 0;
let bridgeLive = false;
let bridgeSuppress = false;              // kendi gönderdiğimiz komutun geri dönüşünü yutma

async function bridgeConfig() {
  const st = await chrome.storage.local.get('settings');
  const cfg = (st.settings && st.settings.bridge) || {};
  return {
    enabled: !!cfg.enabled,
    port: Number(cfg.port) > 0 ? Number(cfg.port) : DEFAULT_BRIDGE.port,
    token: typeof cfg.token === 'string' ? cfg.token : '',
    apply: Object.assign({}, DEFAULT_BRIDGE.apply, cfg.apply),
    push: cfg.push !== false
  };
}
async function bridgeSetState(patch) {
  const st = await chrome.storage.local.get(BRIDGE_KEY);
  const next = Object.assign({ connected: false, live: false, error: null }, st[BRIDGE_KEY], patch);
  await chrome.storage.local.set({ [BRIDGE_KEY]: next });
  return next;
}
async function bridgeGetState() {
  const st = await chrome.storage.local.get(BRIDGE_KEY);
  return st[BRIDGE_KEY] || { connected: false, live: false, error: null };
}

function bridgeSend(obj) {
  if (bridgeSocket && bridgeSocket.readyState === WebSocket.OPEN) {
    bridgeSocket.send(JSON.stringify(obj));
    return true;
  }
  return false;
}

async function bridgeConnect(force) {
  const cfg = await bridgeConfig();
  if (!cfg.enabled || !cfg.token) { await bridgeDisconnect(); return; }
  if (bridgeSocket && (bridgeSocket.readyState === WebSocket.OPEN || bridgeSocket.readyState === WebSocket.CONNECTING)) {
    if (!force) return;
    try { bridgeSocket.close(); } catch (e) {}
  }
  let ws;
  try { ws = new WebSocket(`ws://127.0.0.1:${cfg.port}`); }
  catch (e) { await bridgeSetState({ connected: false, error: 'connectFailed' }); return; }
  bridgeSocket = ws;

  ws.addEventListener('open', () => {
    bridgeSend({ type: 'hello', token: cfg.token });
    clearInterval(bridgePing);
    bridgePing = setInterval(() => { if (!bridgeSend({ type: 'get' })) { clearInterval(bridgePing); bridgePing = null; } }, BRIDGE_PING_MS);
  });

  ws.addEventListener('message', async ev => {
    let msg;
    try { msg = JSON.parse(ev.data); } catch (e) { return; }
    if (msg.type !== 'state') return;
    bridgeRetry = 0;
    await bridgeSetState({ connected: true, error: null, live: !!msg.live });
    await bridgeLiveChanged(!!msg.live);
  });

  ws.addEventListener('close', async ev => {
    if (bridgeSocket === ws) bridgeSocket = null;
    clearInterval(bridgePing); bridgePing = null;
    // 1008: eşleştirme kodu reddedildi — tekrar denemek anlamsız, kullanıcı düzeltmeli
    const badToken = ev && ev.code === 1008;
    await bridgeSetState({ connected: false, error: badToken ? 'badToken' : null });
    if (badToken) return;
    const cfg2 = await bridgeConfig();
    if (cfg2.enabled) {
      bridgeRetry = Math.min(bridgeRetry + 1, 6);
      setTimeout(() => bridgeConnect(), Math.min(30000, 2000 * bridgeRetry));
    }
  });

  ws.addEventListener('error', async () => { await bridgeSetState({ connected: false, error: 'connectFailed' }); });
}

async function bridgeDisconnect() {
  clearInterval(bridgePing); bridgePing = null;
  if (bridgeSocket) {
    const s = bridgeSocket;
    bridgeSocket = null;
    try { s.close(); } catch (e) {}
  }
  await bridgeSetState({ connected: false, live: false });
}

/* Uygulama yayına geçti/çıktı: burada karşılığını uygula */
async function bridgeLiveChanged(live) {
  if (bridgeLive === live) return;
  bridgeLive = live;
  if (bridgeSuppress) return;                 // bu değişikliği biz tetikledik
  const cfg = await bridgeConfig();
  const st = await chrome.storage.local.get('settings');
  const settings = st.settings || {};

  if (live) {
    if (cfg.apply.mask && settings.enabled === false) {
      await chrome.storage.local.set({ settings: Object.assign({}, settings, { enabled: true }) });
    }
    if (cfg.apply.stream) {
      const cur = await getStreamState();
      if (!cur.on) { try { await enableStreamMode(); } catch (e) { await bridgeSetState({ error: String(e && e.message || e) }); } }
    }
  } else if (cfg.apply.stream) {
    const cur = await getStreamState();
    if (cur.on) { try { await disableStreamMode(); } catch (e) { /* açılır pencereden elle kapatılabilir */ } }
  }
}

/* Buradaki Yayın Modu değişti: uygulamaya ilet */
async function bridgePushLive(on) {
  const cfg = await bridgeConfig();
  if (!cfg.enabled || !cfg.push) return;
  if (bridgeLive === on) return;
  bridgeSuppress = true;
  /* Yerel durumu beklemeden güncelliyoruz: karşı taraftan yankı gelmezse ya da
   * gecikirse bir sonraki komut "zaten o durumdayız" diye yutuluyordu. */
  if (bridgeSend({ type: 'live', on })) bridgeLive = on;
  setTimeout(() => { bridgeSuppress = false; }, 1500);
}

async function bridgeInit() {
  const cfg = await bridgeConfig();
  if (!cfg.enabled) { await bridgeSetState({ connected: false }); return; }
  try { await chrome.alarms.create(BRIDGE_ALARM, { periodInMinutes: 1 }); } catch (e) {}
  await bridgeConnect();
}
