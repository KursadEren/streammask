/* StreamMask algılama testleri — bağımlılık yok: `npm test` ya da `node test/detect.test.js`
 *
 * Buradaki asıl değer "maskeliyor mu" değil, "maskelemediğinden emin miyiz": regex
 * tabanlı bir araçta her yeni desen sessizce fiyatı, sürüm numarasını, maç skorunu
 * ya da sipariş numarasını yemeye başlayabilir.
 */
const assert = require('assert');
const D = require('../detect.js');
const v = D.validators;

let pass = 0, fail = 0;
const failures = [];
function test(name, fn) {
  try { fn(); pass++; }
  catch (e) { fail++; failures.push(name + '\n    ' + (e && e.message || e)); }
}

const SETTINGS = {
  categories: { phone: true, email: true, id: true, iban: true, card: true, ip: true, custom: true, secret: true },
  customWords: [],
  uiLanguage: 'tr'
};
function mask(text, over, options) {
  const s = Object.assign({}, SETTINGS, over || {});
  s.categories = Object.assign({}, SETTINGS.categories, (over && over.categories) || {});
  return D.maskText(text, D.buildPatterns(s), options);
}
const masked = (text, over, options) => mask(text, over, options).out;
function unchanged(text, over) {
  const r = mask(text, over);
  assert.strictEqual(r.out, text, `maskelenmemeliydi -> ${JSON.stringify(r.out)} (${JSON.stringify(r.by)})`);
}
function changed(text, over) {
  const r = mask(text, over);
  assert.notStrictEqual(r.out, text, 'maskelenmeliydi');
  return r;
}

/* ================= doğrulayıcılar ================= */

test('luhn: gerçek test kartları', () => {
  assert.ok(v.luhn('4111111111111111'));
  assert.ok(v.luhn('5555555555554444'));
  assert.ok(!v.luhn('4111111111111112'));
  assert.ok(!v.luhn('1234567890123456'));
});

test('TCKN: iki kontrol hanesi', () => {
  assert.ok(v.tckn('10000000078'));
  assert.ok(!v.tckn('10000000079'));
  assert.ok(!v.tckn('12345678901'));
  assert.ok(!v.tckn('01000000078'), '0 ile başlayamaz');
});

test('KR 주민등록번호: tarih geçerliliği', () => {
  assert.ok(v.krRrn('900101-1234567'));
  assert.ok(!v.krRrn('901301-1234567'), '13. ay olamaz');
  assert.ok(!v.krRrn('900132-1234567'), '32. gün olamaz');
});

test('AR CUIT: mod 11', () => {
  assert.ok(v.arCuit('20123456786'));
  assert.ok(!v.arCuit('20123456785'));
});

test('BR CPF/CNPJ: yayımlanmış geçerli örnekler', () => {
  assert.ok(v.brCpf('111.444.777-35'));
  assert.ok(v.brCpf('529.982.247-25'));
  assert.ok(!v.brCpf('111.444.777-34'));
  assert.ok(!v.brCpf('111.111.111-11'), 'aynı hanenin tekrarı geçersiz');
  assert.ok(v.brCnpj('11.222.333/0001-81'));
  assert.ok(!v.brCnpj('11.222.333/0001-82'));
});

test('ES DNI/NIE: harf = sayı mod 23', () => {
  assert.ok(v.esDni('12345678Z'));
  assert.ok(!v.esDni('12345678A'));
  assert.ok(v.esDni('X1234567L'));
  assert.ok(!v.esDni('X1234567M'));
});

test('DE IdNr: ISO 7064 + tekrar kuralı', () => {
  assert.ok(v.deTaxId('86095742719'), 'spesifikasyondaki resmi örnek');
  assert.ok(!v.deTaxId('86095742718'));
  assert.ok(!v.deTaxId('02476291358'), 'ilk hane 0 olamaz (bu bir Steuernummer örneği)');
  assert.ok(!v.deTaxId('12345678901'), 'tekrarsız ilk 10 hane geçersiz');
});

test('FR NIR: 97 tümleyeni, Korsika dahil', () => {
  assert.ok(v.frNir('184127645108946'));
  assert.ok(v.frNir('1 84 12 76 451 089 46'), 'boşluklu yazım');
  assert.ok(!v.frNir('184127645108945'));
});

test('US SSN: yapısal kurallar', () => {
  assert.ok(v.usSsn('123-45-6789'));
  assert.ok(!v.usSsn('000-45-6789'));
  assert.ok(!v.usSsn('666-45-6789'));
  assert.ok(!v.usSsn('900-45-6789'));
  assert.ok(!v.usSsn('123-00-6789'));
  assert.ok(!v.usSsn('123-45-0000'));
});

test('JP マイナンバー: mod 11', () => {
  assert.ok(v.jpMyNumber('1234 5678 9018', 0, '1234 5678 9018'));
  assert.ok(!v.jpMyNumber('1234 5678 9017', 0, '1234 5678 9017'));
});

test('IT codice fiscale: CIN harfi', () => {
  assert.ok(v.itCf('RSSMRA85T10A562S'));
  assert.ok(!v.itCf('RSSMRA85T10A562T'));
});

/* ================= yanlış pozitif tuzakları ================= */

test('fiyatlar maskelenmez', () => {
  unchanged('Fiyat: 1.299,90 TL ödedim');
  unchanged('Toplam 2.500 TL tuttu');
  unchanged('Ürün 19,99 € oldu');
  unchanged('Kampanya: 1.000.000 puan dağıtıldı');
});

test('sürüm numaraları maskelenmez', () => {
  unchanged('v4.2.1.0 yayınlandı');
  unchanged('Chrome/120.0.6099.109 kullanıyorum');
  unchanged('sürüm 1.0.0.4 çıktı');
  unchanged('Electron 44.4.1 ile derlendi');
  unchanged('Blender 4.2.1.0 indirdim');
  unchanged('semver 1.2.3.4.5 garip ama IP değil');
});

test('tarih ve saat maskelenmez', () => {
  unchanged('2026-09-25 08:57 kaydı');
  unchanged('25.09.2026 14:30 buluşuyoruz');
  unchanged('Yayın 19:00-20:00 arası');
  unchanged('12/08/2025 tarihli fatura');
});

test('skorlar ve kısa sayılar maskelenmez', () => {
  unchanged('Maç 3-1 bitti');
  unchanged('Sonuç 2-0, seri 4-2');
  unchanged('Oda 12-34 numarada');
});

test('kişisel olmayan IP adresleri maskelenmez', () => {
  unchanged('127.0.0.1:8080 üzerinde çalışıyor');
  unchanged('DNS olarak 8.8.8.8 kullan');
  unchanged('Router 192.168.1.1 arayüzü');
  unchanged('Maske 255.255.255.255 broadcast');
});

test('rastgele uzun sayılar kimlik desenlerine takılmaz', () => {
  // Telefon kategorisi kapalıyken hiçbir kimlik deseni bunlara dokunmamalı
  const noPhone = { categories: { phone: false } };
  unchanged('Sipariş no: 12345678901', noPhone);
  unchanged('Kargo takip 注文番号 123456789018', Object.assign({ uiLanguage: 'ja' }, noPhone));
  unchanged('Fatura 9008712345123', noPhone);
});

/* Bilinçli tercih: ayraçsız 11+ haneli diziler telefon sayılıp maskelenir.
 * Yayın sırasında bir numarayı kaçırmak, bir sipariş numarasını fazladan
 * maskelemekten daha kötü. Bu davranış 1.1.0'dan beri böyle; testte sabitliyoruz
 * ki ileride kazara değişmesin. */
test('ayraçsız 11+ hane telefon kabul edilir (kasıtlı)', () => {
  const r = mask('Sipariş no: 12345678901');
  assert.strictEqual(r.out, 'Sipariş no: *****');
  assert.strictEqual(r.by.phone, 1);
});

test('Luhn geçmeyen 16 hane kart sayılmaz', () => {
  unchanged('Ürün kodu 1234 5678 9012 3456');
});

test('sır gibi görünmeyen değerler maskelenmez', () => {
  unchanged('password = your_password_here');
  unchanged('token: ${GITHUB_TOKEN}');
  unchanged('secret: undefined');
  unchanged('api_key = <your-key>');
  unchanged('password: changeme');
});

/* ================= gerçekten maskelenmesi gerekenler ================= */

test('telefon, e-posta, IBAN, kart, TCKN, IP', () => {
  assert.strictEqual(masked('Telefonum 0532 123 45 67'), 'Telefonum *****');
  assert.strictEqual(masked('mail: ornek@example.com'), 'mail: *****');
  assert.strictEqual(masked('IBAN TR33 0006 1005 9786 4578 4132 96'), 'IBAN *****');
  assert.strictEqual(masked('Kart 4111 1111 1111 1111'), 'Kart *****');
  assert.strictEqual(masked('TC 10000000078'), 'TC *****');
  assert.strictEqual(masked('IP 88.241.12.34'), 'IP *****');
});

test('uluslararası telefon yazımları', () => {
  changed('+90 532 123 45 67');
  changed('+1 (415) 555-0132');
  changed('11 2345-6789');
  changed('612 345 678');
});

test('özel kelimeler büyük/küçük harf duyarsız', () => {
  const r = mask('Kürşad Eren burada', { customWords: ['Kürşad'] });
  assert.ok(r.out.includes('*****'));
  assert.strictEqual(r.by.custom, 1);
});

test('sayım ve kategori dökümü', () => {
  const r = mask('ornek@example.com ve 0532 123 45 67 ve 88.241.12.34');
  assert.strictEqual(r.n, 3);
  assert.deepStrictEqual(r.by, { email: 1, phone: 1, ip: 1 });
});

/* ================= diller ve alfabeler ================= */

/* Maskeleme desen tabanlı, yani dilden bağımsız olmalı. E-posta deseni uzun süre
 * \w kullandığı için ASCII dışı adreslerde ya hiç tutmuyor ya da adresin başını
 * açıkta bırakıyordu — sızıntı olarak en kötüsü. */
test('ASCII dışı e-posta adresleri tamamen maskelenir', () => {
  for (const mail of ['müller@beispiel.de', 'kürşad@gmail.com', 'ahmet@köyhizmetleri.com',
                      'иван@mail.ru', '张伟@example.cn', 'ahmet.yilmaz@example.com']) {
    assert.strictEqual(masked(mail), '*****', mail + ' tamamen maskelenmeli');
  }
});

test('diğer kategoriler her alfabede çalışır', () => {
  changed('اتصل بي على 0532 123 45 67 شكرا');          // Arapça metinde telefon
  changed('Мой телефон 8 912 345 67 89');             // Rusça
  changed('私の番号は 090-1234-5678 です');              // Japonca
  changed('我的卡号 4111 1111 1111 1111');              // Çince, kart
  changed('Ο λογαριασμός μου GR16 0110 1250 0000 0001 2300 695');   // Yunanca, IBAN
});

test('özel kelimeler her alfabede çalışır', () => {
  changed('Это Иван Петров', { customWords: ['Иван Петров'] });
  changed('こんにちは田中太郎です', { customWords: ['田中太郎'] });
  changed('مرحبا محمد علي', { customWords: ['محمد علي'] });
});

/* JS'in "i" bayrağı Türkçe'nin noktalı/noktasız i çiftini bilmez: "İrem" ekleyen
 * kullanıcının adı "irem" yazıldığında açıkta kalıyordu. */
test('Türkçe İ/ı büyük-küçük harf eşlemesi', () => {
  const w = { customWords: ['İstanbul Caddesi'] };
  for (const text of ['İstanbul Caddesi 5', 'istanbul caddesi 5', 'İSTANBUL CADDESİ 5', 'ıstanbul caddesı 5']) {
    assert.ok(mask(text, w).n === 1, text + ' eşleşmeliydi');
  }
});

/* ================= sırlar ================= */

test('sağlayıcı anahtarları maskelenir', () => {
  changed('OPENAI sk-proj-abcdefghijklmnopqrstuvwx');
  changed('ghp_abcdefghijklmnopqrstuvwxyz0123456789');
  changed('AWS AKIAIOSFODNN7EXAMPLE');
  changed('AIzaSyA1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q');   // AIza + 35 karakter = 39
  changed('xoxb-123456789012-abcdefghijkl');
  changed('sk_live_abcdefghijklmnopqrst');
  changed('glpat-abcdefghijklmnopqrst');
  changed('eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dBjftJeZ4CVPmB92K27uhbUJU1p1r_wW1gFWFOEjXk');
  changed('-----BEGIN RSA PRIVATE KEY-----');
  changed('cüzdan 0x742d35Cc6634C0532925a3b844Bc454e4438f44e');
});

test('anahtar=değer satırında yalnızca değer maskelenir', () => {
  assert.strictEqual(masked('API_KEY=A1b2C3d4E5f6G7h8'), 'API_KEY=*****');
  assert.strictEqual(masked('Authorization: Bearer A1b2C3d4E5f6G7h8I9j0K1'), 'Authorization: Bearer *****');
  const r = mask('client_secret: "A1b2C3d4E5f6G7h8I9j0"');
  assert.ok(r.out.startsWith('client_secret: "*****'), r.out);
});

test('sır kategorisi kapatılabilir', () => {
  unchanged('ghp_abcdefghijklmnopqrstuvwxyzabcdefghij', { categories: { secret: false } });
});

/* ================= bölgeler ================= */

test('varsayılan bölgeler: eski sürümün koruması korunur', () => {
  assert.deepStrictEqual(D.defaultRegions('tr'), ['TR', 'KR', 'AR']);
  assert.deepStrictEqual(D.defaultRegions('de'), ['TR', 'KR', 'AR', 'DE']);
  assert.deepStrictEqual(D.defaultRegions('pt-BR'), ['TR', 'KR', 'AR', 'BR']);
  assert.deepStrictEqual(D.defaultRegions('en-US'), ['TR', 'KR', 'AR', 'US']);
});

test('boş bölge listesi otomatiğe dönmez', () => {
  unchanged('TC 10000000078', { idRegions: [], categories: { phone: false } });
});

test('bölge seçimi desenleri sınırlar', () => {
  // telefon deseni uzun sayı dizilerini de yakaladığı için burada kapalı
  const only = (regions) => ({ idRegions: regions, categories: { phone: false } });
  unchanged('IdNr 86095742719', only(['TR']));
  assert.strictEqual(mask('IdNr 86095742719', only(['DE'])).by.id, 1);
  unchanged('TC 10000000078', only(['DE']));
  assert.strictEqual(mask('TC 10000000078', only(['TR'])).by.id, 1);
  assert.strictEqual(mask('CPF 111.444.777-35', only(['BR'])).by.id, 1);
  assert.strictEqual(mask('DNI 12345678Z', only(['ES'])).by.id, 1);
  assert.strictEqual(mask('SSN 123-45-6789', only(['US'])).by.id, 1);
  assert.strictEqual(mask('CF RSSMRA85T10A562S', only(['IT'])).by.id, 1);
  assert.strictEqual(mask('NIR 1 84 12 76 451 089 46', only(['FR'])).by.id, 1);
  assert.strictEqual(mask('RRN 900101-1234567', only(['KR'])).by.id, 1);
});

/* ================= form alanları ================= */

/* Alan içeriği desene uyana kadar bekleyince, kullanıcı e-postasını yazarken
 * adres ekranda açıkta kalıyordu. Alanın ne olduğuna bakmak bunu kapatır. */
test('alan adından hassaslık anlaşılır', () => {
  for (const a of ['user_email', 'emailAddress', 'email', 'tel', 'phoneNumber',
                   'cc-number', 'iban', 'tckn', 'passport', 'eposta']) {
    assert.ok(D.looksLikeSensitiveField(a), a + ' hassas sayılmalı');
  }
});

test('benzer yazılan masum alanlar gizlenmez', () => {
  // "telegram" içinde "tel" geçiyor: parça eşleşmesi tam olmalı
  for (const a of ['telegram', 'username', 'kullanici_adi', 'note', 'search', 'title', 'quantity']) {
    assert.ok(!D.looksLikeSensitiveField(a), a + ' hassas sayılmamalı');
  }
});

test('yazılmakta olan içerik yakalanır', () => {
  assert.ok(D.isTypingSensitive('asdasd@gmail.c'), 'tamamlanmamış e-posta');
  assert.ok(D.isTypingSensitive('a@b'));
  assert.ok(D.isTypingSensitive('0532 123'), 'yazılmakta olan telefon');
  assert.ok(D.isTypingSensitive('4111 1111'), 'yazılmakta olan kart');
  assert.ok(!D.isTypingSensitive('merhaba dünya'));
  assert.ok(!D.isTypingSensitive('12345'), '5 hane henüz az');
  assert.ok(!D.isTypingSensitive('ab'));
});

/* ================= maske biçimleri ================= */

test('same: uzunluk korunur, düzen kaymaz', () => {
  assert.strictEqual(masked('Tel 0532 123 45 67', null, { style: 'same' }), 'Tel **** *** ** **');
  assert.strictEqual(masked('ornek@example.com', null, { style: 'same' }), '*****@*******.***');
});

test('partial: son 4 hane, e-postada alan adı kalır', () => {
  assert.strictEqual(masked('4111 1111 1111 1111', null, { style: 'partial' }), '**** **** **** 1111');
  assert.strictEqual(masked('ornek@example.com', null, { style: 'partial' }), 'o***@example.com');
  assert.strictEqual(masked('88.241.12.34', null, { style: 'partial' }), '88.*.*.*');
});

test('label: metin etiketi', () => {
  assert.strictEqual(masked('Tel 0532 123 45 67', null, { style: 'label', label: '[GİZLİ]' }), 'Tel [GİZLİ]');
});

test('sırlar ve özel kelimeler hiçbir biçimde kısmi gösterilmez', () => {
  assert.strictEqual(masked('ghp_abcdefghijklmnopqrstuvwxyz0123456789', null, { style: 'partial' }), '*****');
  assert.strictEqual(
    masked('Kürşad', { customWords: ['Kürşad'] }, { style: 'partial' }), '*****');
});

/* ================= çalıştır ================= */

for (const f of failures) console.error('✗ ' + f);
console.log(`\n${pass} geçti, ${fail} başarısız`);
process.exit(fail ? 1 : 0);
