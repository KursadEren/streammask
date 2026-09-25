const $ = id => document.getElementById(id);
const DEFAULTS = {
  enabled: true,
  categories: { phone: true, email: true, id: true, iban: true, card: true, ip: true, custom: true },
  customWords: [],
  whitelist: [],
  blockedSites: []
};
const t = (k, ...subs) => chrome.i18n.getMessage(k, subs.map(String)) || k;
const CATS = [
  ['phone', '📵', 'catPhone'], ['email', '✉️', 'catEmail'], ['id', '🪪', 'catId'],
  ['iban', '🏦', 'catIban'], ['card', '💳', 'catCard'], ['ip', '🌐', 'catIp'], ['custom', '✏️', 'catCustom']
];
function applyI18n() {
  document.documentElement.lang = chrome.i18n.getUILanguage();
  document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => { el.placeholder = t(el.dataset.i18nPlaceholder); });
}
let settings = structuredClone(DEFAULTS);
let tab = null, host = '';

function merge(stored) {
  const s = structuredClone(DEFAULTS);
  if (stored) {
    if (typeof stored.enabled === 'boolean') s.enabled = stored.enabled;
    if (stored.categories) Object.assign(s.categories, stored.categories);
    if (stored.categories && typeof stored.categories.id !== 'boolean' && typeof stored.categories.tckn === 'boolean') s.categories.id = stored.categories.tckn;
    if (Array.isArray(stored.customWords)) s.customWords = stored.customWords;
    if (Array.isArray(stored.whitelist)) s.whitelist = stored.whitelist;
    if (Array.isArray(stored.blockedSites)) s.blockedSites = stored.blockedSites;
  }
  return s;
}
const save = () => chrome.storage.local.set({ settings });

function isExcluded() { return !!host && settings.whitelist.some(w => host === w || host.endsWith('.' + w)); }

function render() {
  $('enabled').checked = settings.enabled;
  $('hero').classList.toggle('off', !settings.enabled);
  $('stateText').textContent = settings.enabled ? (isExcluded() ? t('offOnThisSite') : t('protectionOn')) : t('protectionOff');
  document.querySelectorAll('#cats input').forEach(cb => { cb.checked = !!settings.categories[cb.dataset.cat]; });
  // ek kelimeler
  const box = $('wordbox'), input = $('wordInput');
  box.querySelectorAll('.word').forEach(w => w.remove());
  settings.customWords.forEach((w, i) => {
    const el = document.createElement('span');
    el.className = 'word';
    el.textContent = w;
    const x = document.createElement('button'); x.textContent = '×'; x.title = t('remove');
    x.addEventListener('click', e => { e.stopPropagation(); settings.customWords.splice(i, 1); save(); render(); });
    el.appendChild(x);
    box.insertBefore(el, input);
  });
  // engelli siteler
  const bbox = $('blockbox'), binput = $('blockInput');
  bbox.querySelectorAll('.word').forEach(w => w.remove());
  settings.blockedSites.forEach((w, i) => {
    const el = document.createElement('span');
    el.className = 'word'; el.style.background = 'linear-gradient(135deg,#ff5c5c,#b3262e)';
    el.textContent = w;
    const x = document.createElement('button'); x.textContent = '×'; x.title = t('remove');
    x.addEventListener('click', e => { e.stopPropagation(); settings.blockedSites.splice(i, 1); save(); render(); });
    el.appendChild(x);
    bbox.insertBefore(el, binput);
  });
  $('siteRow').hidden = !host;
  $('host').textContent = host;
  $('exclude').textContent = isExcluded() ? t('includeAgain') : t('exclude');
}

function renderChips(by, total) {
  const c = $('chips');
  c.innerHTML = '';
  for (const [key, ic, nameKey] of CATS) {
    if (key === 'custom' && !settings.customWords.length) continue;
    const n = by[key] || 0;
    const el = document.createElement('span');
    el.className = 'chip' + (n ? ' hit' : '');
    el.innerHTML = `<span class="ic">${ic}</span>${t(nameKey)}${n ? ` <b>${n}</b>` : ''}`;
    if (!settings.categories[key]) el.style.opacity = '.4';
    c.appendChild(el);
  }
  $('stateSub').textContent = !settings.enabled ? t('pageAsIs')
    : isExcluded() ? t('siteExcluded')
    : total ? (total === 1 ? t('maskedOne') : t('maskedCount', total)) : t('maskedNone');
}

async function refreshCount() {
  if (!tab) return;
  const r = await chrome.runtime.sendMessage({ type: 'getCount', tabId: tab.id }).catch(() => null);
  renderChips((r && r.by) || {}, (r && r.count) || 0);
}

function fmtSince(ts) {
  const m = Math.max(0, Math.round((Date.now() - ts) / 60000));
  return m < 60 ? t('minutes', m) : t('hours', Math.floor(m / 60), m % 60);
}
async function refreshStream() {
  const st = await chrome.runtime.sendMessage({ type: 'getStreamState' }).catch(() => ({ on: false }));
  $('stream').checked = !!st.on;
  const card = $('streamCard');
  card.classList.toggle('on', !!st.on);
  card.innerHTML = st.on
    ? `<span class="live"><i></i>${t('live')}</span> · ${t('streamOn', st.count, fmtSince(st.since)).replace(String(st.count), `<b>${st.count}</b>`)}<br>${t('streamOn2')}${st.closed ? ' ' + t('blockClosed', st.closed) + '.' : ''}`
    : t('streamOff');
  $('streamActions').hidden = !st.on;
}
async function setStream(on) {
  $('msg').hidden = true;
  document.body.classList.add('busy');
  const r = await chrome.runtime.sendMessage({ type: 'setStreamMode', on }).catch(e => ({ ok: false, error: String(e) }));
  document.body.classList.remove('busy');
  const m = $('msg');
  if (!r || !r.ok) { m.className = 'msg'; m.textContent = t('errorPrefix') + ' ' + (r && r.error || t('unknown')); m.hidden = false; }
  else if (!on && typeof r.restored === 'number') { m.className = 'msg ok'; m.textContent = t('restored', r.restored) + (r.failed ? ', ' + t('restoredFailed', r.failed) : '') + '.'; m.hidden = false; }
  await refreshStream();
}

const LOOKS_SENSITIVE = [
  /[\w.+-]+@[\w-]+\.[\w.-]+/,                 // e-posta
  /(?:\d[ .-]?){9,}/,                            // 9+ rakam: telefon, kart, TC, IBAN
  /\b[A-Z]{2}\d{2}(?:\s?[A-Z0-9]{4}){3,}/,      // IBAN
];
function warn(text) {
  const m = $('wordMsg'); m.textContent = text; m.hidden = false;
  clearTimeout(warn.t); warn.t = setTimeout(() => { m.hidden = true; }, 4000);
}
function addWord(raw) {
  const w = raw.trim();
  if (w.length < 2) return;
  if (LOOKS_SENSITIVE.some(re => re.test(w))) {
    $('wordInput').value = '';
    warn(t('wordWarn'));
    return;
  }
  if (!settings.customWords.some(x => x.toLowerCase() === w.toLowerCase())) {
    settings.customWords.push(w);
    settings.categories.custom = true;
    save();
  }
  $('wordInput').value = '';
  render();
}

function normalizeHost(raw) {
  let s = raw.trim().toLowerCase();
  if (!s) return '';
  try { if (/^[a-z]+:\/\//.test(s)) s = new URL(s).hostname; } catch (e) {}
  s = s.replace(/^www\./, '').split('/')[0];
  return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(s) ? s : '';
}
function addBlocked(raw) {
  const h = normalizeHost(raw);
  $('blockInput').value = '';
  if (!h) return;
  if (!settings.blockedSites.includes(h)) { settings.blockedSites.push(h); save(); }
  render();
}
async function init() {
  applyI18n();
  settings = merge((await chrome.storage.local.get('settings')).settings);
  const forced = new URLSearchParams(location.search).get('tab');   // test: popup'ı sekmede açarken hedef sekme
  if (forced) tab = await chrome.tabs.get(+forced).catch(() => null);
  if (!tab) [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  try { host = tab && tab.url && /^https?:/.test(tab.url) ? new URL(tab.url).hostname : ''; } catch (e) { host = ''; }
  render(); refreshCount(); refreshStream();
  setInterval(refreshCount, 1000);

  $('enabled').addEventListener('change', e => { settings.enabled = e.target.checked; save(); render(); });
  document.querySelectorAll('#cats input').forEach(cb => cb.addEventListener('change', e => { settings.categories[cb.dataset.cat] = e.target.checked; save(); }));
  $('wordbox').addEventListener('click', () => $('wordInput').focus());
  $('wordInput').addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addWord(e.target.value); }
    else if (e.key === 'Backspace' && !e.target.value && settings.customWords.length) { settings.customWords.pop(); save(); render(); }
  });
  $('wordInput').addEventListener('blur', e => { if (e.target.value.trim()) addWord(e.target.value); });
  $('blockbox').addEventListener('click', () => $('blockInput').focus());
  $('blockInput').addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ',' || e.key === ' ') { e.preventDefault(); addBlocked(e.target.value); }
    else if (e.key === 'Backspace' && !e.target.value && settings.blockedSites.length) { settings.blockedSites.pop(); save(); render(); }
  });
  $('blockInput').addEventListener('blur', e => { if (e.target.value.trim()) addBlocked(e.target.value); });
  $('exclude').addEventListener('click', () => {
    if (!host) return;
    const i = settings.whitelist.indexOf(host);
    if (i >= 0) settings.whitelist.splice(i, 1); else settings.whitelist.push(host);
    save(); render();
  });
  $('stream').addEventListener('change', e => setStream(e.target.checked));
  $('download').addEventListener('click', async () => {
    const r = await chrome.runtime.sendMessage({ type: 'getBackup' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(r.items || [], null, 1)], { type: 'application/json' }));
    a.download = 'streammask-history-backup.json'; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  });
  chrome.storage.onChanged.addListener((ch, area) => {
    if (area !== 'local') return;
    if (ch.settings) { settings = merge(ch.settings.newValue); render(); }
    if (ch.yk_stream) refreshStream();
  });
}
init();
