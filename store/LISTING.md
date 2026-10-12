# Chrome Web Store – Listing (StreamMask)

## Name
StreamMask – Hide Personal Info While Streaming

## Languages
English (default) + es, ko, tr, pt_BR, de, fr, ja via _locales. Store texts for es/ko: LISTING_es_ko.md

## Summary (from manifest, max 132 chars)
For streamers: masks phone numbers, e-mails, IDs, IBANs, cards, IPs and API keys with *****. Stream Mode hides history suggestions.

## Category
Productivity (alternative: Privacy & Security)

## Language
English

## Detailed description
StreamMask is a privacy shield for anyone who streams or shares their screen. It finds everything on the open page that counts as personal information and covers it with *****, so you can focus on the stream.

WHAT IT MASKS
• Phone numbers (local and international formats)
• E-mail addresses
• ID numbers from 10 countries, all checksum-validated: Turkish TCKN, Korean resident registration number, Argentine CUIT/CUIL, Brazilian CPF and CNPJ, Spanish DNI/NIE, German IdNr, French NIR, US SSN, Japanese My Number, Italian codice fiscale. You pick which countries are checked, so you don't pay for false positives from the other nine.
• IBANs
• Credit/debit card numbers (Luhn-validated)
• IP addresses (localhost, public DNS and router gateways are left alone)
• API keys and tokens: OpenAI, Anthropic, GitHub, GitLab, AWS, Google, Slack, Stripe, npm, SendGrid, Telegram, JWTs, "KEY=value" lines, Bearer tokens, private-key headers, BTC/ETH wallet addresses. If you code on stream, this is the one that saves you.
• Your own custom words: name, street, username…

HOW IT WORKS
• The page is scanned the moment it opens, so nothing flashes on screen.
• Chat, notifications, infinite scroll and other dynamic content are masked as they appear — inside Shadow DOM too, which is what most modern web apps are built from.
• Pick how masks look: ***** , same length as the original (so the page layout doesn't shift), last 4 digits visible, or a label. API keys and your own words are never shown partially.
• Phone/e-mail inputs and any field containing personal info are shown as dots while you keep typing normally.
• The badge shows how many items are masked on the page.
• Turn it off and the original text comes back without reloading.
• Shortcuts: Alt+Shift+M masking, Alt+Shift+Y Stream Mode.
• Exclude any site with one click.

OBS INTEGRATION
Connect the extension to OBS (Tools → WebSocket Server Settings) and protection stops depending on your memory: the moment you hit "Start Streaming", masking and Stream Mode turn on by themselves, and when the stream ends everything goes back to how it was. Works on recording too. The connection only goes to 127.0.0.1 — nothing is sent anywhere.

STREAMMASK DESKTOP
If you also use the StreamMask desktop app (macOS), pair them: going live in either one hides your apps, silences notifications and turns masking on in the browser. One switch.

STREAM MODE
While you type in the address bar, sites and links you visited before don't appear as suggestions. Your history is not deleted: when Stream Mode turns on, the history is backed up inside the extension and removed from Chrome's suggestion list; search suggestions and address/card autofill are switched off too. When the stream ends and you turn the mode off, every URL is restored to history and the sites you visited during the stream are kept. Sites on your block list (bank, e-mail…) have their tabs closed automatically while you are live.

PRIVACY
StreamMask sends nothing anywhere, needs no account and uses no analytics. Everything happens inside the browser; settings are stored only on this device and are not even synced with Google.

KNOWN LIMITS
• Restored history entries show "now" as their visit time (Chrome API limitation).
• Bookmarks are still suggested in the address bar.
• The URL in the address bar and the browser UI itself cannot be masked.

## Single purpose
Prevent the personal information of users who stream or share their screen (phone, e-mail, ID, bank and IP details, user-added words) from appearing on web pages and in the browser's address-bar suggestions.

## Permission justifications
- **Host permissions (<all_urls>) / content script:** personal information can appear on any site, so masking must run on every page. The script only replaces page text in place with *****; no content is read out, stored or transmitted.
- **storage:** user settings (category choices, custom words, excluded sites) and Stream Mode's temporary history backup are stored only on the device (chrome.storage.local).
- **unlimitedStorage:** Stream Mode temporarily backs up the user's entire browsing history; the default storage quota is not enough for large histories.
- **history:** the core of Stream Mode: read and back up history, remove it from suggestions, and re-add it when the mode is turned off. The user explicitly starts this with the toggle in the popup. History is never sent anywhere.
- **privacy:** while Stream Mode is on, temporarily turn off search suggestions and address/card autofill (so personal data does not appear in dropdowns); previous values are restored when the mode is turned off.
- **tabs:** update the badge counter per tab and show the active tab's hostname in the popup ("exclude this site").
- **activeTab:** interact with the current tab when the popup opens.
- **Remote code:** none. All code is in the package.

## Data usage
- No personal data is collected, transmitted or sold.
- Website content is processed only on the device to replace text in place; it is not stored.
- Browsing history is stored only on the device, only while Stream Mode is on, solely to restore it.
- Settings are kept in chrome.storage.local on the device only.
- The custom word box rejects phone/card/IBAN/e-mail-like input; such data is never saved by the extension.
- Certifications: (1) not sold or transferred outside approved use cases, (2) not used for purposes unrelated to the single purpose, (3) not used for creditworthiness or lending.

## Privacy policy URL
https://kursaderen.github.io/streammask/privacy.html (GitHub Pages, repo: https://github.com/KursadEren/streammask)

## Homepage / support URL
- Homepage: https://kursaderen.github.io/streammask/
- Support: https://github.com/KursadEren/streammask/issues

## Images (store/out)
- icon128.png → Store icon (128×128)
- screenshot-1.png, screenshot-2.png, screenshot-3.png → Screenshots (1280×800)
- promo-440x280.png → Small promo tile
- marquee-1400x560.png → Marquee promo tile
