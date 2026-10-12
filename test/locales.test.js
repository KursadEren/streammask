/* Çeviri bütünlüğü: 8 dilde arayüz var, yeni bir metin eklerken birini atlamak
 * çok kolay — eksik anahtar kullanıcıya ham anahtar adı olarak görünür. */
const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..', '_locales');
const locales = fs.readdirSync(dir).filter(d => fs.statSync(path.join(dir, d)).isDirectory());
const read = loc => JSON.parse(fs.readFileSync(path.join(dir, loc, 'messages.json'), 'utf8'));

const base = read('en');
const baseKeys = Object.keys(base);
let problems = 0;

const placeholders = msg => (String(msg).match(/\$[A-Z_]+\$/g) || []).sort().join(',');

for (const loc of locales) {
  const data = read(loc);
  const keys = Object.keys(data);
  for (const k of baseKeys) {
    if (!keys.includes(k)) { console.error(`✗ ${loc}: "${k}" eksik`); problems++; continue; }
    if (!data[k].message || !String(data[k].message).trim()) { console.error(`✗ ${loc}: "${k}" boş`); problems++; continue; }
    if (placeholders(data[k].message) !== placeholders(base[k].message)) {
      console.error(`✗ ${loc}: "${k}" yer tutucuları uyuşmuyor (${placeholders(data[k].message)} ≠ ${placeholders(base[k].message)})`);
      problems++;
    }
    if (base[k].placeholders && !data[k].placeholders) { console.error(`✗ ${loc}: "${k}" placeholders tanımı eksik`); problems++; }
  }
  for (const k of keys) {
    if (!baseKeys.includes(k)) { console.error(`✗ ${loc}: "${k}" İngilizce'de yok (artık kullanılmıyor olabilir)`); problems++; }
  }
}

/* Arayüzde kullanılan her anahtar gerçekten tanımlı mı? */
const used = new Set();
for (const f of ['popup.js', 'background.js', 'content.js', 'popup.html', 'blocked.html']) {
  const src = fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
  for (const m of src.matchAll(/\bt\(\s*'([A-Za-z0-9_]+)'/g)) used.add(m[1]);
  for (const m of src.matchAll(/data-i18n(?:-placeholder)?="([A-Za-z0-9_]+)"/g)) used.add(m[1]);
  for (const m of src.matchAll(/getMessage\(\s*'([A-Za-z0-9_]+)'/g)) used.add(m[1]);
  for (const m of src.matchAll(/\bi18n\(\s*'([A-Za-z0-9_]+)'/g)) used.add(m[1]);
}
for (const k of used) {
  if (!baseKeys.includes(k)) { console.error(`✗ kodda kullanılan "${k}" _locales/en içinde yok`); problems++; }
}

console.log(`\n${locales.length} dil, ${baseKeys.length} anahtar, kodda ${used.size} kullanım — ${problems ? problems + ' sorun' : 'sorun yok'}`);
process.exit(problems ? 1 : 0);
