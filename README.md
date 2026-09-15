# StreamMask – Hide Personal Info While Streaming

Yayıncılar için Chrome eklentisi (Manifest V3).

## Ne yapar?
1. **Maskeleme:** Açık sayfadaki telefon, e-posta, TC kimlik no, IBAN, kart numarası, IP adresi
   ve senin girdiğin özel kelimeleri (ad, adres, kullanıcı adı…) `*****` ile değiştirir.
   Sohbet, sonsuz kaydırma gibi dinamik içerikler de anında maskelenir. Form alanlarında
   (tel/e-posta ya da içinde özel bilgi olan input) metin nokta nokta görünür, yazmaya devam edebilirsin.
2. **Yayın Modu:** Adres çubuğuna yazarken geçmişten site/bağlantı önerisi çıkmaz.
   Chrome'un "geçmişi gizle" diye bir API'si yok; bu yüzden mod açılınca geçmiş eklentinin
   kendi deposuna yedeklenir, Chrome geçmişinden kaldırılır ve arama önerisi + adres/kart
   otomatik doldurma kapatılır. Mod kapanınca yedekteki tüm adresler geçmişe geri eklenir.
   Yayın sırasında gezdiğin siteler silinmez.

## Kurulum
1. Chrome'da `chrome://extensions` aç, sağ üstten **Geliştirici modu**'nu aç.
2. **Paketlenmemiş öğe yükle** → bu klasörü (`streammask`) seç.
3. Araç çubuğundan eklentiyi sabitle. Rozet, sayfada kaç maske uygulandığını gösterir.

Kısayollar: `Alt+Shift+M` maskeleme, `Alt+Shift+Y` Yayın Modu (chrome://extensions/shortcuts'tan değiştirilebilir).

## Sınırlar
- Geri yüklemede adresler ve başlıklar geri gelir ama ziyaret tarihleri "şimdi" olur (Chrome API kısıtı).
- Yer imleri adres çubuğunda önerilmeye devam eder (eklenti yer imlerine dokunmaz).
- Yayın Modu açıkken eklentiyi kaldırırsan yedek de gider; önce modu kapat. Popup'tan JSON yedek indirebilirsin.
- Adres çubuğundaki URL'nin kendisi ve tarayıcı arayüzü maskelenemez; Shadow DOM içindeki metinler taranmaz.

## Test
`test.html` sayfası eklenti olmadan da `content.js`'i yükleyip maskelemeyi gösterir.
