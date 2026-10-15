# Chrome Web Store — 1.2.0 yükleme kontrol listesi

Paket: `store/streammask-1.2.0.zip` (71 KB, 32 dosya)
Konsol: https://chrome.google.com/webstore/devconsole

## 1. Package
**Upload new package** → `streammask-1.2.0.zip`
Sürüm 1.2.0 olarak görünmeli (1.1.0'ın üstüne yazar).

## 2. Store listing
Değişen tek alan **Description**. Tam metin `LISTING.md` → "Detailed description" bölümünde.
1.1.0'a göre eklenenler:
- "WHAT IT MASKS" → 10 ülke kimlik desteği, API anahtarları, IP istisnaları
- "HOW IT WORKS" → Shadow DOM, maske biçimleri
- Yeni bölümler: OBS INTEGRATION, STREAMMASK DESKTOP

Summary (manifest'ten otomatik gelir, elle girilmez):
`For streamers: masks phone numbers, e-mails, IDs, IBANs, cards, IPs and API keys with *****. Stream Mode hides history suggestions.`

Ekran görüntüleri ve promo görselleri değişmedi — dokunma.

## 3. Privacy practices
Burada yalnızca **yeni izin için gerekçe** istenecek. Yapıştır:

> The extension connects to OBS Studio's local WebSocket server (127.0.0.1) so that
> masking turns on automatically when the user starts streaming. Because an MV3 service
> worker is terminated when idle, a periodic alarm is used to wake it and re-establish
> the connection if it dropped. The alarm does no other work.

Diğer alanlar 1.1.0'daki gibi kalır (hepsi `LISTING.md` → "Permission justifications").

- **Remote code: No.** OBS ve masaüstü bağlantıları yalnızca JSON durum bilgisi taşır,
  127.0.0.1'e gider, kod indirmez.
- **Data usage:** değişmedi. Tek ekleme: OBS şifresi ve masaüstü eşleştirme kodu da
  cihazda `chrome.storage.local` içinde saklanır, hiçbir yere gönderilmez.

## 4. İncelemede dikkat çekebilecek nokta
`shadow-hook.js` artık sayfanın ana dünyasında (`"world": "MAIN"`) çalışıyor. Sorulursa:

> shadow-hook.js runs in the page's main world for one reason: attachShadow() emits no
> MutationObserver record, and a content script in an isolated world cannot observe the
> page's own calls. The file wraps attachShadow and dispatches a custom event so the
> extension can mask personal data inside Shadow DOM. It reads no page data, sends
> nothing anywhere, and loads no remote code.

## 5. Submit for review
Yayına alma tamamen sende — inceleme genelde birkaç gün sürer.
