/* Mağaza görsellerini kaynak HTML'lerden basar.
 *
 * Neden Electron: bu sayfalar gerçek bir tarayıcı motoru ister (degrade, yazı
 * tipi, SVG), ama görüntü almak için bir geliştirme sunucusu açmak gerekmesin
 * istiyoruz. Electron hem sayfayı çiziyor hem capturePage ile tam boyutta PNG
 * veriyor; her görsel kendi hedef boyutunda çiziliyor, büyük bir PNG küçültülmüyor.
 *
 * Açılır pencerenin görüntüsü de buradan geliyor: test/popup-preview.html gerçek
 * popup.html'i taklit edilmiş chrome API'siyle çiziyor, yani görsellerdeki panel
 * elle çizilmiş bir taklit değil, arayüzün kendisi.
 *
 * Kullanım:  npx electron store/src/build-images.js      (StreamMaskDesktop'taki
 *            electron kullanılabilir: cd ../StreamMaskDesktop && npx electron …)
 */
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

const SRC = __dirname;
const OUT = path.join(SRC, '..', 'out');
const ROOT = path.join(SRC, '..', '..');

/* Açılır pencere OBS ve köprü bölümleriyle birlikte 1200 pikseli aştı; ekran
 * görüntüsü çerçevesi 800 piksel. Üst kısmı alıyoruz: durum, algılama rozetleri
 * ve özel kelimeler — tanıtımda görülmesi gereken kısım zaten orası. */
const POPUP_CROP = 560;

const PAGES = [
  ['shot1.html', 'screenshot-1.png', 1280, 800],
  ['shot2.html', 'screenshot-2.png', 1280, 800],
  ['shot3.html', 'screenshot-3.png', 1280, 800],
  ['promo440.html', 'promo-440x280.png', 440, 280],
  ['marquee1400.html', 'marquee-1400x560.png', 1400, 560]
];

async function capturePage(file, out, width, height) {
  const win = new BrowserWindow({ show: false, width, height, useContentSize: true });
  win.webContents.on('did-fail-load', (e, code, desc, url) => console.error('yüklenemedi:', code, desc, url));
  await win.loadFile(path.join(SRC, file));
  await new Promise(r => setTimeout(r, 450));            // yazı tipi ve SVG yerleşsin
  // Retina ekranda capturePage 2x döner; mağaza tam 1280x800 istiyor
  const img = (await win.webContents.capturePage({ x: 0, y: 0, width, height }))
    .resize({ width, height, quality: 'best' });
  fs.writeFileSync(path.join(OUT, out), img.toPNG());
  win.destroy();
  await new Promise(r => setTimeout(r, 120));            // pencereler arası nefes payı
  console.log(out + ' (' + width + 'x' + height + ')');
}

/* Açılır pencereyi iki durumda da yakala: koruma açık ve kapalı */
async function capturePopup() {
  const win = new BrowserWindow({
    show: false, width: 520, height: 1500, useContentSize: true,
    webPreferences: { webSecurity: false }               // file:// üzerinden fetch için
  });
  await win.loadFile(path.join(ROOT, 'test', 'popup-preview.html'));
  await new Promise(r => setTimeout(r, 900));            // popup.js yüklensin

  for (const [name, on] of [['popup-on.png', true], ['popup-off.png', false]]) {
    const rect = await win.webContents.executeJavaScript(`(() => {
      const cb = document.getElementById('enabled');
      if (cb && cb.checked !== ${on}) cb.click();
      const f = document.getElementById('frame');
      const r = f.getBoundingClientRect();
      return { x: Math.round(r.x), y: Math.round(r.y),
               width: Math.round(r.width), height: Math.min(Math.round(r.height), ${POPUP_CROP}) };
    })()`);
    await new Promise(r => setTimeout(r, 250));
    const img = (await win.webContents.capturePage(rect))
      .resize({ width: rect.width, height: rect.height, quality: 'best' });
    fs.writeFileSync(path.join(SRC, name), img.toPNG());
    console.log(name + ' (' + rect.width + 'x' + rect.height + ')');
  }
  win.destroy();
  await new Promise(r => setTimeout(r, 300));
}

/* Son pencere kapanınca Electron uygulamayı sonlandırır; biz pencereleri sırayla
 * açıp kapattığımız için arada sıfıra düşüyor ve betik yarıda ölüyordu. */
app.on('window-all-closed', () => {});

app.whenReady().then(async () => {
  try {
    fs.mkdirSync(OUT, { recursive: true });
    await capturePopup();                                 // ekran görüntüleri buna dayanıyor
    for (const [file, out, w, h] of PAGES) await capturePage(file, out, w, h);
    console.log('\nhazır: store/out/');
    app.exit(0);
  } catch (e) {
    console.error(e);
    app.exit(1);
  }
});
