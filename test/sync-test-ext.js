/* test-ext.html'i test.html'den üretir: gerçek uzantıyla açılan sürümde sayfanın
 * kendi betiklerini yüklememesi gerekir (uzantı zaten enjekte eder, iki kopya
 * birbiriyle yarışır). İki dosyayı elle senkron tutmak yerine `npm run sync` */
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
let h = fs.readFileSync(path.join(root, 'test.html'), 'utf8');
h = h
  .replace(/^.*<script>window\.__YK_SETTINGS.*\n/m, '')
  .replace(/^.*<script src="(shadow-hook|detect|content)\.js"><\/script>.*\n/gm, '')
  .replace(/<p><code>chrome<\/code> API'si[\s\S]*?<\/p>\n/,
    '<p><span class="ok">Yeşil</span> bloklar maskelenmeli, <span class="no">kırmızı</span> bloklar <b>maskelenmemeli</b>.</p>\n')
  .replace('<h2>StreamMask test sayfası</h2>',
    '<h2>StreamMask test sayfası <small style="font-weight:400;font-size:13px">(uzantı modu)</small></h2>\n' +
    '<p><b>Bu dosya üretilir — düzenleme test.html üzerinde yapılır (npm run sync).</b> ' +
    'Uzantıyı <code>chrome://extensions</code> üzerinden yükleyip bu sayfayı açın; ' +
    'özel kelime testi için açılır pencereye <code>Ahmet Yılmaz</code> ve <code>Bağdat Caddesi</code> ekleyin.</p>');
fs.writeFileSync(path.join(root, 'test-ext.html'), h);
console.log('test-ext.html üretildi (' + h.length + ' bayt)');
