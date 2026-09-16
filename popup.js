const $ = id => document.getElementById(id);
const DEFAULTS = {
  enabled: true,
  categories: { phone: true, email: true, tckn: true, iban: true, card: true, ip: true, custom: true },
  customWords: [],
  whitelist: []
};
const CATS = [
  ['phone', '📵', 'Phone'], ['email', '✉️', 'E-mail'], ['tckn', '🪪', 'Turkish ID'],
  ['iban', '🏦', 'IBAN'], ['card', '💳', 'Card'], ['ip', '🌐', 'IP'], ['custom', '✏️', 'Custom']
];
let settings = structuredClone(DEFAULTS);
let tab = null, host = '';

function merge(stored) {
  const s = structuredClone(DEFAULTS);
  if (stored) {
    if (typeof stored.enabled === 'boolean') s.enabled = stored.enabled;
    if (stored.categories) Object.assign(s.categories, stored.categories);
    if (Array.isArray(stored.customWords)) s.customWords = stored.customWords;
    if (Array.isArray(stored.whitelist)) s.whitelist = stored.whitelist;
  }
  return s;
}
const save = () => chrome.storage.local.set({ settings });

function isExcluded() { return !!host && settings.whitelist.some(w => host === w || host.endsWith('.' + w)); }

function render() {
  $('enabled').checked = settings.enabled;
  $('hero').classList.toggle('off', !settings.enabled);
  $('stateText').textContent = settings.enabled ? (isExcluded() ? 'Off on this site' : 'Protection on') : 'Protection off';
  document.querySelectorAll('#cats input').forEach(cb => { cb.checked = !!settings.categories[cb.dataset.cat]; });
  // ek kelimeler
  const box = $('wordbox'), input = $('wordInput');
  box.querySelectorAll('.word').forEach(w => w.remove());
  settings.customWords.forEach((w, i) => {
    const el = document.createElement('span');
    el.className = 'word';
    el.textContent = w;
    const x = document.createElement('button'); x.textContent = '×'; x.title = 'Remove';
    x.addEventListener('click', e => { e.stopPropagation(); settings.customWords.splice(i, 1); save(); render(); });
    el.appendChild(x);
    box.insertBefore(el, input);
  });
  $('siteRow').hidden = !host;
  $('host').textContent = host;
  $('exclude').textContent = isExcluded() ? 'Include again' : 'Exclude';
}

function renderChips(by, total) {
  const c = $('chips');
  c.innerHTML = '';
  for (const [key, ic, name] of CATS) {
    if (key === 'custom' && !settings.customWords.length) continue;
    const n = by[key] || 0;
    const el = document.createElement('span');
    el.className = 'chip' + (n ? ' hit' : '');
    el.innerHTML = `<span class="ic">${ic}</span>${name}${n ? ` <b>${n}</b>` : ''}`;
    if (!settings.categories[key]) el.style.opacity = '.4';
    c.appendChild(el);
  }
  $('stateSub').textContent = !settings.enabled ? 'Page is shown as-is'
    : isExcluded() ? 'This site is excluded'
    : total ? `${total} item${total === 1 ? '' : 's'} masked on this page` : 'No personal info found on this page';
}

async function refreshCount() {
  if (!tab) return;
  const r = await chrome.runtime.sendMessage({ type: 'getCount', tabId: tab.id }).catch(() => null);
  renderChips((r && r.by) || {}, (r && r.count) || 0);
}

function fmtSince(ts) {
  const m = Math.max(0, Math.round((Date.now() - ts) / 60000));
  return m < 60 ? m + ' min' : Math.floor(m / 60) + ' h ' + (m % 60) + ' min';
}
async function refreshStream() {
  const st = await chrome.runtime.sendMessage({ type: 'getStreamState' }).catch(() => ({ on: false }));
  $('stream').checked = !!st.on;
  const card = $('streamCard');
  card.classList.toggle('on', !!st.on);
  card.innerHTML = st.on
    ? `<span class="live"><i></i>LIVE</span> · <b>${st.count}</b> history entries kept safe, turned on ${fmtSince(st.since)} ago.<br>Search suggestions and autofill are off too.`
    : 'Off. When on, your history is backed up inside the extension and removed from suggestions; it comes back when you turn it off. Nothing is deleted.';
  $('streamActions').hidden = !st.on;
}
async function setStream(on) {
  $('msg').hidden = true;
  document.body.classList.add('busy');
  const r = await chrome.runtime.sendMessage({ type: 'setStreamMode', on }).catch(e => ({ ok: false, error: String(e) }));
  document.body.classList.remove('busy');
  const m = $('msg');
  if (!r || !r.ok) { m.className = 'msg'; m.textContent = 'Error: ' + (r && r.error || 'unknown'); m.hidden = false; }
  else if (!on && typeof r.restored === 'number') { m.className = 'msg ok'; m.textContent = `${r.restored} URLs restored to history${r.failed ? ', ' + r.failed + ' failed' : ''}.`; m.hidden = false; }
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
    warn('Don\'t type numbers, cards, IBANs or e-mails: they are caught automatically and never saved here.');
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

async function init() {
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
