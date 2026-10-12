/* obs-websocket 5 kimlik doğrulaması:
 *   secret = base64(sha256(şifre + tuz))
 *   auth   = base64(sha256(secret + meydan))
 *
 * Zincirdeki tek bir bayt/kodlama hatası şifre korumalı her OBS'de entegrasyonu
 * sessizce çalışmaz hale getirir — ve bu ancak gerçek OBS'ye bağlanınca fark
 * edilir. Sabit bir "beklenen çıktı" yazmak yerine aynı algoritmayı tamamen
 * ayrı bir yoldan (Node crypto, utf8 digest) hesaplayıp karşılaştırıyoruz:
 * obs.js WebCrypto + elle base64 kullanıyor, asıl risk de orada.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const nodeCrypto = require('crypto');

const src = fs.readFileSync(path.join(__dirname, '..', 'obs.js'), 'utf8');
const sandbox = {
  crypto: globalThis.crypto,
  TextEncoder,
  btoa: s => Buffer.from(s, 'binary').toString('base64'),
  setInterval, clearInterval, setTimeout,
  WebSocket: function () {},
  chrome: { storage: { local: { get: async () => ({}) } }, alarms: { create: async () => {} } },
  console
};
vm.createContext(sandbox);
/* const bildirimleri VM'de global nesneye düşmez (sözcüksel kapsamda kalır),
 * bu yüzden okumak istediklerimizi aynı betiğin sonunda dışarı veriyoruz. */
const exported = vm.runInContext(src + '\n;({ OBS_SUB_OUTPUTS, OBS_PING_MS, DEFAULT_OBS });', sandbox);

const sha256b64 = s => nodeCrypto.createHash('sha256').update(s, 'utf8').digest('base64');
const reference = (password, salt, challenge) => sha256b64(sha256b64(password + salt) + challenge);

const CASES = [
  ['supersecretpassword', 'lM1GncleQOaCu9lT1yeUZhFYnqhsLLP1G5lAGo3ixaI=', '+IxH4CnCiqpX1rM9scsNynZzbOe4KhDeYcTNS3PDaeY='],
  ['', 'c2FsdA==', 'Y2hhbGxlbmdl'],
  ['şifre-ümlaut-ß', 'dGVzdC1zYWx0', 'dGVzdC1jaGFsbGVuZ2U='],     // ASCII dışı şifre: UTF-8 kodlaması
  ['p'.repeat(200), 'bG9uZy1zYWx0', 'bG9uZy1jaGFsbGVuZ2U='],
  ['\u0000ÿ binary', 'YmluLXNhbHQ=', 'YmluLWNoYWxsZW5nZQ==']  // yüksek bayt: btoa yolu
];

(async () => {
  let fail = 0;
  for (const [pwd, salt, challenge] of CASES) {
    const got = await sandbox.obsAuth(pwd, salt, challenge);
    const want = reference(pwd, salt, challenge);
    if (got !== want) {
      fail++;
      console.error(`✗ auth uyuşmuyor (şifre uzunluğu ${pwd.length})\n  bağımsız: ${want}\n  obs.js  : ${got}`);
    }
  }

  // Outputs biti olmadan StreamStateChanged olayı OBS'den hiç gelmez
  if (exported.OBS_SUB_OUTPUTS !== 64) {
    fail++;
    console.error('✗ eventSubscriptions Outputs biti 64 olmalı, bulunan: ' + exported.OBS_SUB_OUTPUTS);
  }
  // Servis çalışanı 30 sn boşta kalınca kapanır: ping bunun altında olmalı
  if (!(exported.OBS_PING_MS > 0 && exported.OBS_PING_MS < 30000)) {
    fail++;
    console.error('✗ ping aralığı 30 sn altında olmalı, bulunan: ' + exported.OBS_PING_MS);
  }
  if (exported.DEFAULT_OBS.enabled !== false) {
    fail++;
    console.error('✗ OBS varsayılan olarak kapalı gelmeli');
  }

  console.log(`\n${CASES.length + 3 - fail} geçti, ${fail} başarısız (OBS protokolü)`);
  process.exit(fail ? 1 : 0);
})();
