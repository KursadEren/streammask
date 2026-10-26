/* Masaüstü köprüsünün uzantı tarafı, sahte bir masaüstü sunucusuna karşı.
 *
 * Masaüstü deposundaki test sunucunun çerçevelemesini sınıyor; buradaki ise
 * istemciyi: eşleştirme kodu gönderiliyor mu, uygulama yayına geçince tarayıcıda
 * koruma açılıyor mu, buradaki Yayın Modu uygulamaya iletiliyor mu, ve kod
 * reddedilince sonsuza kadar yeniden denemiyor mu.
 *
 * Çalıştırma: npm run bridge:live
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ws = require('./ws-server.js');

if (typeof WebSocket === 'undefined') {
  console.error('Bu test global WebSocket istiyor: npm run bridge:live');
  process.exit(1);
}

const PORT = 47812;
const TOKEN = 'dogru-eslestirme-kodu';

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

/* ---------- sahte masaüstü uygulaması ---------- */
async function fakeDesktop({ token = TOKEN } = {}) {
  const state = { live: false, authed: 0, rejected: 0, commands: [], clients: [] };
  const server = await ws.start({
    port: PORT,
    onConnect: client => { state.clients.push(client); client.authed = false; },
    onMessage: (msg, client) => {
      if (!client.authed) {
        // Gerçek uygulama durum koduyla kapatır; istemci kararını buna göre verir
        if (msg.type !== 'hello' || msg.token !== token) { state.rejected++; client.close(1008, 'bad token'); return; }
        client.authed = true;
        state.authed++;
        client.send({ type: 'state', live: state.live });
        return;
      }
      if (msg.type === 'live') {
        state.commands.push(msg.on);
        state.live = !!msg.on;
        state.goLive(state.live);          // gerçek uygulama durumu geri yayınlar
      }
      else if (msg.type === 'get') client.send({ type: 'state', live: state.live });
    }
  });
  state.goLive = on => {
    state.live = on;
    for (const c of state.clients) if (c.authed) c.send({ type: 'state', live: on });
  };
  state.stop = server.stop;
  return state;
}

/* ---------- uzantı tarafı ---------- */
function loadExtension(settings, streamAlreadyOn) {
  const store = { settings };
  const calls = { enable: 0, disable: 0 };
  const streamState = { on: !!streamAlreadyOn };
  const sandbox = {
    WebSocket, console, setTimeout, clearTimeout, setInterval, clearInterval,
    chrome: {
      storage: {
        local: {
          get: keys => {
            const list = typeof keys === 'string' ? [keys] : Array.isArray(keys) ? keys : Object.keys(keys || {});
            const out = {};
            for (const k of list) if (k in store) out[k] = JSON.parse(JSON.stringify(store[k]));
            return Promise.resolve(out);
          },
          set: obj => { for (const k in obj) store[k] = JSON.parse(JSON.stringify(obj[k])); return Promise.resolve(); },
          remove: () => Promise.resolve()
        },
        onChanged: { addListener: () => {} }
      },
      alarms: { create: () => Promise.resolve(), clear: () => Promise.resolve() }
    },
    getStreamState: () => Promise.resolve(streamState.on ? { on: true, count: 2 } : { on: false }),
    enableStreamMode: () => { calls.enable++; streamState.on = true; return Promise.resolve({ ok: true }); },
    disableStreamMode: () => { calls.disable++; streamState.on = false; return Promise.resolve({ ok: true }); }
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'bridge.js'), 'utf8'), sandbox);
  return { sandbox, store, calls, streamState };
}

const settings = (over) => ({
  enabled: false,
  bridge: Object.assign({ enabled: true, port: PORT, token: TOKEN,
    apply: { mask: true, stream: true }, push: true }, over)
});

(async () => {
  /* 1. Eşleşme, uygulama yayına geçiyor, sonra bitiriyor */
  {
    const app = await fakeDesktop();
    const ext = loadExtension(settings());
    await ext.sandbox.bridgeInit();

    ok('eşleştirme kodu kabul edildi', await until(() => app.authed === 1));
    ok('durum "bağlı" kaydedildi',
      await until(async () => (await ext.sandbox.bridgeGetState()).connected === true));

    app.goLive(true);
    ok('uygulama yayına geçince maskeleme açıldı', await until(() => ext.store.settings.enabled === true));
    ok('uygulama yayına geçince Yayın Modu açıldı', await until(() => ext.calls.enable === 1));

    app.goLive(false);
    ok('uygulama bitirince Yayın Modu kapandı', await until(() => ext.calls.disable === 1));

    await ext.sandbox.bridgeDisconnect();
    app.stop();
  }

  /* 2. Buradaki Yayın Modu uygulamaya iletilir */
  {
    const app = await fakeDesktop();
    const ext = loadExtension(settings());
    await ext.sandbox.bridgeInit();
    await until(async () => (await ext.sandbox.bridgeGetState()).connected === true);

    await ext.sandbox.bridgePushLive(true);
    ok('Yayın Modu açılınca uygulamaya iletildi',
      await until(() => app.commands.length === 1 && app.commands[0] === true),
      JSON.stringify(app.commands));

    await ext.sandbox.bridgePushLive(false);
    ok('Yayın Modu kapanınca uygulamaya iletildi',
      await until(() => app.commands.length === 2 && app.commands[1] === false),
      JSON.stringify(app.commands));

    await ext.sandbox.bridgeDisconnect();
    app.stop();
  }

  /* 3. Yanlış kod: reddedilmeli ve yeniden denenmemeli */
  {
    const app = await fakeDesktop();
    const s = settings();
    s.bridge.token = 'yanlis-kod';
    const ext = loadExtension(s);
    await ext.sandbox.bridgeInit();

    ok('yanlış kod reddedildi', await until(() => app.rejected >= 1));
    ok('durum "kod reddedildi" oldu',
      await until(async () => (await ext.sandbox.bridgeGetState()).error === 'badToken'));

    const before = app.rejected;
    await wait(1200);
    ok('reddedilen kodla yeniden denenmedi', app.rejected === before,
      'deneme sayısı ' + before + ' -> ' + app.rejected);

    await ext.sandbox.bridgeDisconnect();
    app.stop();
  }

  /* 4. Kullanıcının önceden açtığı Yayın Modu, uygulama bitirince kapatılmamalı */
  {
    const app = await fakeDesktop();
    const ext = loadExtension(settings(), true);
    await ext.sandbox.bridgeInit();
    await until(async () => (await ext.sandbox.bridgeGetState()).connected === true);

    app.goLive(true);
    await wait(250);
    app.goLive(false);
    await wait(250);
    ok('zaten açık olan Yayın Modu tekrar açılmadı', ext.calls.enable === 0, 'enable: ' + ext.calls.enable);

    await ext.sandbox.bridgeDisconnect();
    app.stop();
  }

  console.log(`\n${pass} geçti, ${fail} başarısız (köprü istemcisi)`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
