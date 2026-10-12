/* Manifest bütünlüğü: adı geçen her dosya gerçekten var mı, sürümler tutuyor mu,
 * yayındaki uzantıyı güncelleme kullanıcıdan yeni izin isteyecek mi?
 *
 * Sonuncusu önemli: uyarı gösteren bir izin eklemek Chrome'un güncellemeyi tüm
 * kullanıcılarda devre dışı bırakmasına yol açar, onlar elle onaylayana kadar
 * koruma kapalı kalır. Bu yüzden izin listesi burada kilitli.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
let fail = 0;
const bad = (m) => { console.error('✗ ' + m); fail++; };

/* 1.1.x'te yayımlanan izinler + yalnızca uyarısız olanlar eklenebilir */
const SHIPPED = ['storage', 'unlimitedStorage', 'history', 'privacy', 'tabs', 'activeTab'];
const SILENT_OK = ['alarms', 'idle', 'contextMenus', 'scripting'];

for (const p of manifest.permissions || []) {
  if (!SHIPPED.includes(p) && !SILENT_OK.includes(p)) {
    bad(`"${p}" izni kullanıcıya uyarı gösterir: güncelleme herkeste devre dışı kalır`);
  }
}
if (manifest.host_permissions && manifest.host_permissions.length) {
  bad('host_permissions eklendi: yayındaki uzantıda yeni onay ister');
}

/* Dosya referansları */
const files = [];
for (const cs of manifest.content_scripts || []) files.push(...(cs.js || []), ...(cs.css || []));
if (manifest.background && manifest.background.service_worker) files.push(manifest.background.service_worker);
if (manifest.action && manifest.action.default_popup) files.push(manifest.action.default_popup);
for (const size in (manifest.icons || {})) files.push(manifest.icons[size]);
for (const size in ((manifest.action || {}).default_icon || {})) files.push(manifest.action.default_icon[size]);
for (const war of manifest.web_accessible_resources || []) files.push(...(war.resources || []));

for (const f of new Set(files)) {
  if (!fs.existsSync(path.join(root, f))) bad(`manifest "${f}" dosyasını gösteriyor ama dosya yok`);
}

/* importScripts ile yüklenenler de pakete girmeli */
const bg = fs.readFileSync(path.join(root, manifest.background.service_worker), 'utf8');
const imported = [...bg.matchAll(/importScripts\(([^)]*)\)/g)]
  .flatMap(m => [...m[1].matchAll(/['"]([^'"]+)['"]/g)].map(x => x[1]));
for (const f of imported) {
  if (!fs.existsSync(path.join(root, f))) bad(`importScripts "${f}" dosyasını yüklüyor ama dosya yok`);
}

/* Gölge kök kancası ana dünyada ve içerik betiğinden önce çalışmalı */
const hook = (manifest.content_scripts || []).find(cs => (cs.js || []).includes('shadow-hook.js'));
if (!hook) bad('shadow-hook.js içerik betiği olarak kayıtlı değil: Shadow DOM maskelenmez');
else {
  if (hook.world !== 'MAIN') bad('shadow-hook.js "world": "MAIN" olmalı, izole dünyada attachShadow yaması işe yaramaz');
  if (hook.run_at !== 'document_start') bad('shadow-hook.js document_start olmalı, yoksa erken gölge kökler kaçar');
}
const main = (manifest.content_scripts || []).find(cs => (cs.js || []).includes('content.js'));
if (!main) bad('content.js içerik betiği olarak kayıtlı değil');
else if (main.js.indexOf('detect.js') === -1) bad('detect.js content.js ile birlikte yüklenmeli (algılama çekirdeği)');
else if (main.js.indexOf('detect.js') > main.js.indexOf('content.js')) bad('detect.js content.js\'ten önce gelmeli');

/* Sürüm tutarlılığı */
if (manifest.version !== pkg.version) bad(`sürümler uyuşmuyor: manifest ${manifest.version}, package.json ${pkg.version}`);
if (!/^\d+\.\d+\.\d+$/.test(manifest.version)) bad('sürüm numarası x.y.z biçiminde olmalı');

/* Mağaza sınırı */
const en = JSON.parse(fs.readFileSync(path.join(root, '_locales', 'en', 'messages.json'), 'utf8'));
for (const loc of fs.readdirSync(path.join(root, '_locales'))) {
  const m = JSON.parse(fs.readFileSync(path.join(root, '_locales', loc, 'messages.json'), 'utf8'));
  if (m.appDesc.message.length > 132) bad(`${loc}: appDesc ${m.appDesc.message.length} karakter (mağaza sınırı 132)`);
}
if (manifest.short_name && manifest.short_name.length > 12) bad('short_name en fazla 12 karakter olabilir');

console.log(`\nmanifest ${manifest.version} — ${fail ? fail + ' sorun' : 'sorun yok'}`);
process.exit(fail ? 1 : 0);
