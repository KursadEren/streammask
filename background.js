/* Yayın Kalkanı - arka plan servisi (MV3 service worker)
 * - Sekme başına maskelenen öğe sayısını rozette gösterir
 * - Yayın Modu: geçmişi chrome.storage.local'a yedekler, Chrome geçmişinden
 *   kaldırır (adres çubuğu önerilerinde görünmesin), arama önerisi ve otomatik
 *   doldurmayı kapatır. Mod kapanınca yedekteki tüm adresler geçmişe geri eklenir.
 */
importScripts('obs.js', 'bridge.js');

const DEFAULT_SETTINGS = {
  enabled: true,
  categories: { phone: true, email: true, id: true, iban: true, card: true, ip: true, custom: true },
  customWords: [],
  whitelist: [],
  blockedSites: [],
  idRegions: null,
  maskStyle: 'stars',
  obs: DEFAULT_OBS,
  bridge: DEFAULT_BRIDGE
};
const t = (k, ...subs) => chrome.i18n.getMessage(k, subs.map(String)) || k;
const HISTORY_KEY = 'yk_history_backup';
const STREAM_KEY = 'yk_stream';
const PRIVACY_KEYS = ['searchSuggestEnabled', 'autofillAddressEnabled', 'autofillCreditCardEnabled'];

/* ---------- kurulum ---------- */
chrome.runtime.onInstalled.addListener(async () => {
  const cur = await chrome.storage.local.get('settings');
  if (!cur.settings) await chrome.storage.local.set({ settings: DEFAULT_SETTINGS });
  await verifyStreamIntegrity();
  await refreshBadgeColor();
  await obsInit();
  await bridgeInit();
});
chrome.runtime.onStartup.addListener(async () => {
  await verifyStreamIntegrity();
  await refreshBadgeColor();
  await obsInit();
  await bridgeInit();
});

/* Servis çalışanı her uyanışta OBS bağlantısını tazeler; alarm da kopmuş soketi
 * fark etmek ve çalışanı uyandırmak için. */
obsInit();
bridgeInit();
chrome.alarms.onAlarm.addListener(async alarm => {
  if (alarm.name === OBS_ALARM) {
    const cfg = await obsConfig();
    if (cfg.enabled) await obsConnect();
    else { await obsDisconnect(); try { await chrome.alarms.clear(OBS_ALARM); } catch (e) {} }
  } else if (alarm.name === BRIDGE_ALARM) {
    const cfg = await bridgeConfig();
    if (cfg.enabled) await bridgeConnect();
    else { await bridgeDisconnect(); try { await chrome.alarms.clear(BRIDGE_ALARM); } catch (e) {} }
  }
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !changes.settings) return;
  const before = JSON.stringify((changes.settings.oldValue || {}).obs || {});
  const after = JSON.stringify((changes.settings.newValue || {}).obs || {});
  if (before !== after) obsInit();
  const bBefore = JSON.stringify((changes.settings.oldValue || {}).bridge || {});
  const bAfter = JSON.stringify((changes.settings.newValue || {}).bridge || {});
  if (bBefore !== bAfter) bridgeInit();
});

/* ---------- yayın modu bütünlüğü ----------
 * Tarayıcı çöktüğünde / uzantı güncellendiğinde yayın modu açık kalabilir. O sırada
 * geçmiş yedeği hâlâ yerinde mi diye bakıyoruz: yedek kaybolmuşsa sessiz kalmak en
 * kötüsü, rozete "!" koyup açılır pencerede uyarıyoruz. Gizlilik tercihleri de
 * yeniden uygulanıyor (yeniden başlatmada kontrol uzantıdan düşebiliyor). */
async function verifyStreamIntegrity() {
  const st = await chrome.storage.local.get([STREAM_KEY, HISTORY_KEY]);
  const stream = st[STREAM_KEY];
  if (!(stream && stream.on)) return;
  const backup = st[HISTORY_KEY];
  const ok = Array.isArray(backup) && backup.length >= (stream.count || 0);
  if (!ok) {
    stream.error = 'backupMissing';
    stream.backupCount = Array.isArray(backup) ? backup.length : 0;
    await chrome.storage.local.set({ [STREAM_KEY]: stream });
  } else if (stream.error) {
    delete stream.error;
    await chrome.storage.local.set({ [STREAM_KEY]: stream });
  }
  await setPrivacy(stream.privacyPrev, true);
}

/* ---------- rozet: sekme -> çerçeve -> sayı ---------- */
const tabCounts = new Map();
function tabTotal(tabId) {
  const frames = tabCounts.get(tabId);
  if (!frames) return 0;
  let t = 0;
  for (const c of frames.values()) t += c.count;
  return t;
}
function tabBy(tabId) {
  const frames = tabCounts.get(tabId);
  const by = {};
  if (frames) for (const c of frames.values()) for (const k in c.by) by[k] = (by[k] || 0) + c.by[k];
  return by;
}
let streamError = false;          // rozet için bellekte tutulur; her sayımda storage okumayalım
async function setBadge(tabId) {
  if (streamError) {
    try { await chrome.action.setBadgeText({ tabId, text: '!' }); } catch (e) {}
    return;
  }
  const n = tabTotal(tabId);
  try {
    await chrome.action.setBadgeText({ tabId, text: n ? String(n) : '' });
  } catch (e) { /* sekme kapanmış olabilir */ }
}
async function refreshBadgeColor() {
  const st = await chrome.storage.local.get(STREAM_KEY);
  const s = st[STREAM_KEY];
  const on = !!(s && s.on);
  streamError = !!(s && s.error);
  await chrome.action.setBadgeBackgroundColor({ color: (s && s.error) ? '#FF9800' : on ? '#E53935' : '#6C63FF' });
  await chrome.action.setTitle({ title: (s && s.error) ? t('badgeTitleError') : on ? t('badgeTitleLive') : t('badgeTitle') });
  if (s && s.error) { try { await chrome.action.setBadgeText({ text: '!' }); } catch (e) {} }
}
chrome.tabs.onRemoved.addListener(tabId => tabCounts.delete(tabId));
chrome.tabs.onUpdated.addListener((tabId, info) => { if (info.status === 'loading') { tabCounts.delete(tabId); setBadge(tabId); } });

/* ---------- mesajlar ---------- */
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || !msg.type) return;

  if (msg.type === 'count' && sender.tab) {
    const tabId = sender.tab.id;
    if (!tabCounts.has(tabId)) tabCounts.set(tabId, new Map());
    tabCounts.get(tabId).set(sender.frameId ?? 0, { count: msg.count | 0, by: msg.by || {} });
    setBadge(tabId);
    return;
  }
  if (msg.type === 'getCount') { sendResponse({ count: tabTotal(msg.tabId), by: tabBy(msg.tabId) }); return; }
  if (msg.type === 'getStreamState') { getStreamState().then(sendResponse); return true; }
  if (msg.type === 'setStreamMode') {
    (msg.on ? enableStreamMode() : disableStreamMode())
      .then(sendResponse)
      .catch(e => sendResponse({ ok: false, error: String(e && e.message || e) }));
    return true;
  }
  if (msg.type === 'getObsState') { obsGetState().then(sendResponse); return true; }
  if (msg.type === 'getBridgeState') { bridgeGetState().then(sendResponse); return true; }
  if (msg.type === 'bridgeReconnect') { bridgeConnect(true).then(() => bridgeGetState()).then(sendResponse); return true; }
  if (msg.type === 'obsReconnect') { obsConnect(true).then(() => obsGetState()).then(sendResponse); return true; }
  if (msg.type === 'getBackup') {
    chrome.storage.local.get(HISTORY_KEY).then(st => sendResponse({ items: st[HISTORY_KEY] || [] }));
    return true;
  }
});

/* ---------- kısayollar ---------- */
chrome.commands.onCommand.addListener(async cmd => {
  if (cmd === 'toggle-mask') {
    const cur = await chrome.storage.local.get('settings');
    const s = Object.assign({}, DEFAULT_SETTINGS, cur.settings || {});
    s.enabled = !s.enabled;
    await chrome.storage.local.set({ settings: s });
  } else if (cmd === 'toggle-stream') {
    const st = await getStreamState();
    if (st.on) await disableStreamMode(); else await enableStreamMode();
  }
});

/* ---------- Yayın Modu ---------- */
async function getStreamState() {
  const st = await chrome.storage.local.get(STREAM_KEY);
  const s = st[STREAM_KEY];
  return s && s.on
    ? { on: true, since: s.since, count: s.count, closed: s.closed || 0, error: s.error || null, backupCount: s.backupCount }
    : { on: false };
}

/* ---------- engelli siteler: yayında sekmeleri kapat ---------- */
async function blockedHosts() {
  const st = await chrome.storage.local.get('settings');
  return (st.settings && Array.isArray(st.settings.blockedSites)) ? st.settings.blockedSites : [];
}
function hostMatches(url, hosts) {
  let h = '';
  try { h = new URL(url).hostname.toLowerCase().replace(/^www\./, ''); } catch (e) { return false; }
  return hosts.some(b => h === b || h.endsWith('.' + b));
}
async function closeBlockedTab(tab) {
  const inWindow = await chrome.tabs.query({ windowId: tab.windowId });
  if (inWindow.length <= 1) {
    // pencerenin son sekmesi: kapatmak pencereyi kapatır, onun yerine engel sayfasına yönlendir
    await chrome.tabs.update(tab.id, { url: chrome.runtime.getURL('blocked.html') }).catch(() => {});
  } else {
    await chrome.tabs.remove(tab.id).catch(() => {});
  }
}
async function closeBlockedTabsNow() {
  const hosts = await blockedHosts();
  if (!hosts.length) return 0;
  const tabs = await chrome.tabs.query({});
  let n = 0;
  for (const tab of tabs) if (tab.url && hostMatches(tab.url, hosts)) { await closeBlockedTab(tab); n++; }
  return n;
}
chrome.tabs.onUpdated.addListener(async (tabId, info, tab) => {
  const url = info.url || (info.status === 'loading' ? tab.url : null);
  if (!url) return;
  const st = await chrome.storage.local.get(STREAM_KEY);
  if (!(st[STREAM_KEY] && st[STREAM_KEY].on)) return;
  const hosts = await blockedHosts();
  if (hostMatches(url, hosts)) {
    await closeBlockedTab(tab);
    const s = st[STREAM_KEY]; s.closed = (s.closed || 0) + 1;
    await chrome.storage.local.set({ [STREAM_KEY]: s });
  }
});

async function snapshotPrivacy() {
  const prev = {};
  for (const k of PRIVACY_KEYS) {
    try {
      const d = await chrome.privacy.services[k].get({});
      prev[k] = { value: d.value, control: d.levelOfControl };
    } catch (e) { prev[k] = null; }
  }
  return prev;
}
async function setPrivacy(prev, off) {
  for (const k of PRIVACY_KEYS) {
    const p = prev && prev[k];
    if (!p) continue;
    const controllable = p.control === 'controllable_by_this_extension' || p.control === 'controlled_by_this_extension';
    if (!controllable) continue;
    try {
      if (off) await chrome.privacy.services[k].set({ value: false });
      else await chrome.privacy.services[k].clear({});
    } catch (e) { /* politika ile kilitli olabilir */ }
  }
}

async function enableStreamMode() {
  const cur = await getStreamState();
  if (cur.on) return { ok: true, on: true, count: cur.count, already: true };

  const items = await chrome.history.search({ text: '', startTime: 0, maxResults: 1000000 });
  const backup = items.map(i => ({ url: i.url, title: i.title || '', lastVisitTime: i.lastVisitTime || 0, visitCount: i.visitCount || 0 }));
  const privacyPrev = await snapshotPrivacy();

  // Önce yedeği yaz ve doğrula; silme ancak yedek diske indikten sonra
  await chrome.storage.local.set({ [HISTORY_KEY]: backup });
  const check = await chrome.storage.local.get(HISTORY_KEY);
  if (!Array.isArray(check[HISTORY_KEY]) || check[HISTORY_KEY].length !== backup.length) {
    throw new Error('History backup could not be verified; nothing was deleted.');
  }
  const closed = await closeBlockedTabsNow();
  await chrome.storage.local.set({ [STREAM_KEY]: { on: true, since: Date.now(), count: backup.length, privacyPrev, closed } });

  await chrome.history.deleteAll();
  await setPrivacy(privacyPrev, true);
  await refreshBadgeColor();
  bridgePushLive(true);
  return { ok: true, on: true, count: backup.length };
}

async function disableStreamMode() {
  const st = await chrome.storage.local.get([HISTORY_KEY, STREAM_KEY]);
  const stream = st[STREAM_KEY];
  const backup = st[HISTORY_KEY] || [];
  let restored = 0, failed = 0;

  // Yayın sırasında oluşan yeni geçmiş korunur; yedektekiler eklenir.
  for (let i = 0; i < backup.length; i += 100) {
    const chunk = backup.slice(i, i + 100);
    await Promise.all(chunk.map(async it => {
      try { await chrome.history.addUrl({ url: it.url }); restored++; }
      catch (e) { failed++; }
    }));
  }
  await setPrivacy(stream && stream.privacyPrev, false);
  await chrome.storage.local.remove([HISTORY_KEY, STREAM_KEY]);
  await refreshBadgeColor();
  bridgePushLive(false);
  return { ok: true, on: false, restored, failed };
}
