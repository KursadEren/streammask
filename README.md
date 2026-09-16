# StreamMask – Hide Personal Info While Streaming

Chrome extension (Manifest V3) for streamers and anyone who shares their screen.

## What it does
1. **Masking:** phone numbers, e-mail addresses, Turkish national IDs (checksum-validated), IBANs, card numbers (Luhn-validated), IP addresses and your own custom words (name, street, username…) are replaced with `*****` on the open page. Chat, notifications and infinite-scroll content are masked as they appear. Phone/e-mail inputs and any field containing personal info are shown as dots while you keep typing.
2. **Stream Mode:** no history suggestions while you type in the address bar. Chrome has no "hide history" API, so the extension backs up your history into its own local storage, removes it from Chrome, and turns off search suggestions and address/card autofill. When you turn the mode off, every URL is restored. Sites visited during the stream are kept.

## Install (unpacked)
1. Open `chrome://extensions`, enable **Developer mode**.
2. **Load unpacked** → select this folder (`streammask`).
3. Pin the extension. The badge shows how many items are masked on the page.

Shortcuts: `Alt+Shift+M` masking, `Alt+Shift+Y` Stream Mode.

## Privacy
No data leaves the browser. Settings are stored only on the device (not synced). The custom word box rejects numbers, cards, IBANs and e-mails. Policy: https://kursaderen.github.io/streammask/privacy.html

## Limits
- Restored history entries show "now" as their visit time (Chrome API limitation).
- Bookmarks are still suggested in the address bar.
- The URL in the address bar and the browser UI itself cannot be masked; text inside Shadow DOM is not scanned.

## Store assets
`store/` holds the listing text (`LISTING.md`), the privacy policy and the rendered images in `store/out/`.
