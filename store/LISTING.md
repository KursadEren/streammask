# Chrome Web Store – Mağaza Girişi (StreamMask)

## Ad
StreamMask – Hide Personal Info While Streaming

## Kısa özet (132 karakter sınırı)
Yayında kişisel bilgin ekrana düşmesin: telefon, e-posta, TC, IBAN, kart ve IP anında ***** olur. Yayın Modu geçmiş önerilerini gizler.

## Kategori
Üretkenlik (Productivity) — alternatif: Gizlilik ve Güvenlik

## Dil
Türkçe

## Ayrıntılı açıklama
StreamMask, canlı yayın yapan ve ekranını paylaşan herkes için hazırlanmış bir gizlilik kalkanıdır. Açık olan sayfada kişisel bilgi sayılan her şeyi bulur ve ***** ile perdeler; sen yayına odaklanırsın.

NE PERDELER?
• Telefon numaraları (Türk ve uluslararası formatlar)
• E-posta adresleri
• TC Kimlik numaraları (sağlama doğrulamalı, yanlış alarm vermez)
• IBAN'lar
• Kredi/banka kartı numaraları (Luhn doğrulamalı)
• IP adresleri
• Senin eklediğin özel kelimeler: adın, soyadın, adresin, kullanıcı adın…

NASIL ÇALIŞIR?
• Sayfa açılır açılmaz tarama yapılır; bilgiler ekrana yansımadan perdelenir.
• Sohbet, bildirim, sonsuz kaydırma gibi sonradan gelen içerikler de anında perdelenir.
• Form alanlarında (telefon, e-posta ya da içinde özel bilgi olan kutular) metin nokta nokta görünür, yazmaya devam edebilirsin.
• Rozet, sayfada kaç maske uygulandığını gösterir.
• Kapatınca orijinal metin sayfa yenilemeden geri gelir.
• Kısayollar: Alt+Shift+M maskeleme, Alt+Shift+Y Yayın Modu.
• İstediğin siteyi tek tıkla hariç tutabilirsin.

YAYIN MODU
Adres çubuğuna bir şey yazarken daha önce girdiğin siteler ve bağlantılar öneri olarak çıkmaz. Geçmişin silinmez: Yayın Modu açılınca geçmiş eklentinin kendi deposuna yedeklenir ve Chrome'un öneri listesinden kaldırılır; arama önerileri ile adres/kart otomatik doldurma da kapanır. Yayın bitip modu kapattığında tüm adresler geçmişe geri yüklenir, yayın sırasında gezdiğin siteler de korunur.

GİZLİLİK
StreamMask hiçbir veriyi dışarı göndermez, hesap istemez, analitik kullanmaz. Tüm işlem tarayıcının içinde olur; ayarların yalnızca bu cihazda saklanır, Google ile bile eşitlenmez.

BİLİNEN SINIRLAR
• Geri yüklenen geçmişte ziyaret tarihleri "şimdi" olarak görünür (Chrome API kısıtı).
• Yer imleri adres çubuğunda önerilmeye devam eder.
• Adres çubuğundaki URL'nin kendisi ve tarayıcı arayüzü perdelenemez.

## Tek amaç (Single purpose) açıklaması
Ekran paylaşan/yayın yapan kullanıcıların kişisel bilgilerinin (telefon, e-posta, kimlik, banka ve IP bilgileri, özel kelimeler) web sayfalarında ve tarayıcı önerilerinde görünmesini engellemek.

## İzin gerekçeleri (Permission justifications)
- **Host permissions (<all_urls>) / content script:** Kişisel bilgiler herhangi bir sitede görünebileceği için maskeleme tüm sayfalarda çalışmalıdır. Betik yalnızca sayfa metnini yerinde değiştirir; hiçbir veri okunup dışarı gönderilmez.
- **storage:** Kullanıcı ayarları (kategori seçimleri, ek kelimeler, hariç tutulan siteler) ve Yayın Modu'nun geçmiş yedeği yalnızca cihaz üzerinde (chrome.storage.local) saklanır.
- **unlimitedStorage:** Yayın Modu, kullanıcının tüm tarama geçmişini geçici olarak yedekler; büyük geçmişlerde 5 MB varsayılan sınır yetmez.
- **history:** Yayın Modu'nun temel işlevi: geçmişi okuyup yedeklemek, öneri listesinden kaldırmak ve mod kapanınca geri eklemek. Kullanıcı bu işlemi popup'taki anahtarla açıkça başlatır.
- **privacy:** Yayın Modu açıkken arama önerileri ile adres/kart otomatik doldurmayı geçici olarak kapatır (kişisel bilgilerin açılır listelerde görünmesini önlemek için); mod kapanınca önceki değerler geri yüklenir.
- **tabs:** Popup'ın aktif sekmenin alan adını göstermesi ("bu siteyi hariç tut") ve rozet sayacını sekme bazında güncellemek için.
- **activeTab:** Popup açıldığında geçerli sekmeyle etkileşim için.
- **Uzak kod kullanımı:** Yok. Tüm kod paket içindedir.

## Veri kullanımı beyanı (Privacy practices)
- Kişisel veri toplanmaz, iletilmez, satılmaz.
- Web sitesi içeriği yalnızca cihaz üzerinde, yerinde değiştirmek için işlenir; saklanmaz.
- Tarama geçmişi yalnızca kullanıcı Yayın Modu'nu açtığında, cihaz üzerinde, geri yüklemek amacıyla saklanır.
- Kullanıcı ayarları chrome.storage.local'da, yalnızca cihaz üzerinde tutulur.
- Ek kelime kutusu telefon/kart/IBAN/e-posta benzeri girdiyi reddeder; bu bilgiler hiçbir zaman eklentiye kaydedilmez.

## Gizlilik politikası
store/privacy.html dosyası — herkese açık bir URL'de yayınlanmalı (ör. https://upneo.space/streammask/privacy.html) ve konsolda "Privacy policy URL" alanına girilmelidir.

## Görseller (store/out)
- icon128.png → Store icon (128×128)
- screenshot-1.png, screenshot-2.png, screenshot-3.png → Screenshots (1280×800)
- promo-440x280.png → Small promo tile
- marquee-1400x560.png → Marquee promo tile
