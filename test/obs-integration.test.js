/* OBS entegrasyonunun uçtan uca davranışı, sahte bir obs-websocket sunucusuna karşı.
 *
 * obs-auth.test.js yalnızca kimlik doğrulama zincirini kontrol ediyor. Asıl soru
 * şu: OBS "yayın başladı" dediğinde koruma gerçekten açılıyor mu, yayın bitince
 * kullanıcının önceki durumu geri geliyor mu? Gerçek OBS olmadan bunu sınamanın
 * tek yolu karşı tarafı taklit etmek — uzantı tarafındaki kod gerçek.
 *
 * Çalıştırma: npm run obs:live
 * (Node 20'de global WebSocket --experimental-websocket bayrağı ister; uzantı
 *  tarayıcıdaki WebSocket'i kullanıyor, testte de gerçeğini kullanmak istiyoruz.)
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const ws = require('./ws-server.js');

if (typeof WebSocket === 'undefined') {
  console.error('Bu test global WebSocket istiyor. Node 20 icin: node --experimental-websocket ' +
    'test/obs-integration.test.js  (ya da npm run obs:live)');
  process.exit(1);
}

const PORT = 47655;
const PASSWORD = 'gizli-sifre';
const sha256b64 = s => crypto.createHash('sha256').update(s, 'utf8').digest('base64');

let pass = 0, fail = 0;
const ok = (name, cond, detail) => {
  if (cond) { pass++; return; }
  fail++;
  console.error('✗ ' + name + (detail ? '\n    ' + detail : ''));
};
const wait = ms => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 3000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (await fn()) return true; await wait(25); }
  return false;
}

/* ---------- sahte OBS ---------- */
function fakeObs({ requireAuth, onIdentified }) {
  const state = { streaming: false, recording: false, clients: [], identified: 0 };
  const salt = 'c2FsdA==';
  const challenge = 'Y2hhbGxlbmdl';
  state.ready = ws.start({
    port: PORT,
    onConnect: client => {
      state.clients.push(client);
      client.send({ op: 0, d: Object.assign({ obsWebSocketVersion: '5.4.0', rpcVersion: 1 },
        requireAuth ? { authentication: { challenge, salt } } : {}) });
    },
    onMessage: (msg, client) => {
      if (msg.op === 1) {                                  // Identify
        if (requireAuth) {
          const want = sha256b64(sha256b64(PASSWORD + salt) + challenge);
          state.lastAuth = msg.d && msg.d.authentication;
          if (state.lastAuth !== want) { client.send({ op: 5, d: { eventType: 'AuthFailed' } }); client.close(); return; }
        }
        state.subscriptions = msg.d && msg.d.eventSubscriptions;
        state.identified++;
        client.send({ op: 2, d: { negotiatedRpcVersion: 1 } });
        if (onIdentified) onIdentified(state, client);
        return;
      }
      if (msg.op === 6) {                                  // istek
        const t = msg.d.requestType;
        const data = t === 'GetStreamStatus' ? { outputActive: state.streaming }
          : t === 'GetRecordStatus' ? { outputActive: state.recording }
          : {};
        client.send({ op: 7, d: { requestType: t, requestId: msg.d.requestId, requestStatus: { result: true }, responseData: data } });
      }
    }
  });
  state.emit = (eventType, outputActive) => {
    for (const c of state.clients) c.send({ op: 5, d: { eventType, eventData: { outputActive } } });
  };
  return state;
}

/* ---------- uzantı tarafı: obs.js'i taklit edilmiş chrome ile yükle ---------- */
function loadExtension(initialSettings, streamAlreadyOn) {
  const store = { settings: initialSettings };
  const listeners = [];
  const calls = { enable: 0, disable: 0 };
  const streamState = { on: !!streamAlreadyOn };

  const sandbox = {
    WebSocket, crypto, TextEncoder, console, setTimeout, clearTimeout, setInterval, clearInterval,
    btoa: s => Buffer.from(s, 'binary').toString('base64'),
    chrome: {
      storage: {
        local: {
          get: keys => {
            const list = typeof keys === 'string' ? [keys] : Array.isArray(keys) ? keys : Object.keys(keys || {});
            const out = {};
            for (const k of list) if (k in store) out[k] = JSON.parse(JSON.stringify(store[k]));
            return Promise.resolve(out);
          },
          set: obj => {
            for (const k in obj) store[k] = JSON.parse(JSON.stringify(obj[k]));
            listeners.forEach(fn => fn());
            return Promise.resolve();
          },
          remove: () => Promise.resolve()
        },
        onChanged: { addListener: fn => listeners.push(fn) }
      },
      alarms: { create: () => Promise.resolve(), clear: () => Promise.resolve() },
      action: { setBadgeText: () => Promise.resolve(), setBadgeBackgroundColor: () => Promise.resolve(), setTitle: () => Promise.resolve() },
      i18n: { getMessage: k => k }
    },
    // background.js'ten gelen bağımlılıklar
    getStreamState: () => Promise.resolve(streamState.on ? { on: true, count: 3 } : { on: false }),
    enableStreamMode: () => { calls.enable++; streamState.on = true; return Promise.resolve({ ok: true }); },
    disableStreamMode: () => { calls.disable++; streamState.on = false; return Promise.resolve({ ok: true }); }
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'obs.js'), 'utf8'), sandbox);
  return { sandbox, store, calls, streamState };
}

const baseSettings = (obs) => ({
  enabled: false,
  categories: { phone: true, email: true },
  obs: Object.assign({ enabled: true, port: PORT, password: PASSWORD,
    triggers: { stream: true, record: false },
    apply: { mask: true, stream: true }, revert: true }, obs)
});

/* ================= testler ================= */
(async () => {
  /* 1. Şifreli bağlantı, yayın başlat/bitir döngüsü */
  {
    const obs = fakeObs({ requireAuth: true });
    await obs.ready;
    const ext = loadExtension(baseSettings());
    await ext.sandbox.obsInit();

    ok('OBS ile el sıkışıp kimlik doğruladı', await until(() => obs.identified === 1));
    ok('Outputs olaylarına abone oldu (64)', obs.subscriptions === 64, 'bulunan: ' + obs.subscriptions);
    ok('durum "bağlı" olarak kaydedildi',
      await until(async () => (await ext.sandbox.obsGetState()).connected === true));

    obs.streaming = true;
    obs.emit('StreamStateChanged', true);
    ok('yayın başlayınca maskeleme açıldı', await until(() => ext.store.settings.enabled === true));
    ok('yayın başlayınca Yayın Modu açıldı', await until(() => ext.calls.enable === 1));

    obs.streaming = false;
    obs.emit('StreamStateChanged', false);
    ok('yayın bitince maskeleme kapandı', await until(() => ext.store.settings.enabled === false));
    ok('yayın bitince Yayın Modu kapandı', await until(() => ext.calls.disable === 1));

    await ext.sandbox.obsDisconnect();
    (await obs.ready).stop();
  }

  /* 2. Kullanıcının zaten açık bıraktığı ayar, yayın bitince kapatılmamalı */
  {
    const obs = fakeObs({ requireAuth: false });
    await obs.ready;
    const s = baseSettings();
    s.enabled = true;                                   // maskelemeyi kendi açmış
    const ext = loadExtension(s, true);                 // Yayın Modu'nu da kendi açmış
    await ext.sandbox.obsInit();
    await until(async () => (await ext.sandbox.obsGetState()).connected === true);

    obs.emit('StreamStateChanged', true);
    await wait(250);
    obs.emit('StreamStateChanged', false);
    await wait(250);
    ok('yayın öncesi açık olan maskeleme açık kaldı', ext.store.settings.enabled === true,
      'enabled = ' + ext.store.settings.enabled);
    ok('yayın öncesi açık olan Yayın Modu kapatılmadı', ext.calls.disable === 0,
      'disable çağrısı: ' + ext.calls.disable);
    ok('zaten açık olan Yayın Modu tekrar açılmadı', ext.calls.enable === 0,
      'enable çağrısı: ' + ext.calls.enable);

    await ext.sandbox.obsDisconnect();
    (await obs.ready).stop();
  }

  /* 3. Yanlış şifre: bağlanmamalı, durum hata olmalı */
  {
    const obs = fakeObs({ requireAuth: true });
    await obs.ready;
    const s = baseSettings();
    s.obs.password = 'yanlis';
    const ext = loadExtension(s);
    await ext.sandbox.obsInit();
    await wait(600);
    const st = await ext.sandbox.obsGetState();
    ok('yanlış şifreyle bağlanmadı', st.connected !== true, JSON.stringify(st));
    ok('yanlış şifreyle koruma açılmadı', ext.store.settings.enabled === false);

    await ext.sandbox.obsDisconnect();
    (await obs.ready).stop();
  }

  /* 4. Kayıt tetikleyicisi (yayına girmeden test etmenin yolu) */
  {
    const obs = fakeObs({ requireAuth: false });
    await obs.ready;
    const s = baseSettings({ triggers: { stream: false, record: true } });
    const ext = loadExtension(s);
    await ext.sandbox.obsInit();
    await until(async () => (await ext.sandbox.obsGetState()).connected === true);

    obs.emit('StreamStateChanged', true);              // yayın tetikleyicisi kapalı
    await wait(250);
    ok('kapalı tetikleyici koruma açmadı', ext.store.settings.enabled === false);

    obs.emit('RecordStateChanged', true);
    ok('kayıt başlayınca koruma açıldı', await until(() => ext.store.settings.enabled === true));

    await ext.sandbox.obsDisconnect();
    (await obs.ready).stop();
  }

  console.log(`\n${pass} geçti, ${fail} başarısız (OBS entegrasyonu)`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
