# StreamMask – Hide Personal Info While Streaming

Chrome extension (Manifest V3) for streamers and anyone who shares their screen.

## What it does

1. **Masking:** phone numbers, e-mail addresses, national ID numbers (checksum-validated for 10 countries), IBANs, card numbers (Luhn-validated), IP addresses, **API keys and tokens**, and your own custom words (name, street, username…) are replaced on the open page. Chat, notifications and infinite-scroll content are masked as they appear, **inside Shadow DOM too**. Phone/e-mail inputs and any field containing personal info are shown as dots while you keep typing.
2. **Stream Mode:** no history suggestions while you type in the address bar. Chrome has no "hide history" API, so the extension backs up your history into its own local storage, removes it from Chrome, and turns off search suggestions and address/card autofill. When you turn the mode off, every URL is restored. Sites visited during the stream are kept.
3. **OBS integration:** masking and Stream Mode turn on by themselves the moment you hit "Start Streaming" in OBS, and go back to how they were when the stream ends.
4. **StreamMask Desktop bridge:** one switch for the browser and the [desktop app](https://github.com/KursadEren/streammask-desktop) — going live in either one protects both.

## Install (unpacked)

1. Open `chrome://extensions`, enable **Developer mode**.
2. **Load unpacked** → select this folder (`streammask`).
3. Pin the extension. The badge shows how many items are masked on the page.

Shortcuts: `Alt+Shift+M` masking, `Alt+Shift+Y` Stream Mode.

## What is detected

| Category | Notes |
|---|---|
| Phone | International formats; dates, times, versions and prices are filtered out |
| E-mail | |
| ID number | TR TCKN, KR 주민등록번호, AR CUIT/CUIL, BR CPF + CNPJ, ES DNI/NIE, DE IdNr, FR NIR, US SSN, JP マイナンバー, IT codice fiscale — all checksum-validated |
| IBAN | |
| Card | Luhn-validated |
| IP | Well-known addresses (localhost, public DNS, router gateways) are left alone |
| API key | OpenAI/Anthropic, GitHub, GitLab, AWS, Google, Slack, Stripe, npm, SendGrid, Telegram, JWTs, `KEY=value` lines, `Bearer` tokens, private-key headers, BTC/ETH wallet addresses |
| Custom | Your own words, case-insensitive |

**ID numbers by country:** only the countries selected under Advanced are checked — fewer countries means fewer false positives. The default follows your browser language (plus TR/KR/AR, which earlier versions already shipped).

## Mask style

`*****` (default), **same length** (keeps page layout from shifting), **last 4 visible**, or a **label**. API keys and your custom words are never shown partially, whatever the style.

## OBS

In OBS: **Tools → WebSocket Server Settings → Enable WebSocket server**, then copy the port and password into the extension popup. Needs OBS 28 or newer (obs-websocket 5 ships with it); no extra plugin. The connection only goes to `127.0.0.1` and no new Chrome permission is involved.

You can trigger on streaming, on recording, or both, and choose what turns on (masking, Stream Mode). Whatever was already on before you went live is left as it was when the stream ends.

## Block list (Stream Mode)

Add sites (bank, e-mail, DMs…) under "Close these sites while live". Their tabs are closed the moment Stream Mode turns on, and again if one opens during the stream. If it is the last tab of a window it is redirected to a blocked page instead of closing the window.

## Privacy

No data leaves the browser. Settings are stored only on the device (not synced). The custom word box rejects numbers, cards, IBANs and e-mails. The OBS password and the desktop pairing code are stored locally and only used for `127.0.0.1` connections. Policy: https://kursaderen.github.io/streammask/privacy.html

**Back up before a long stream:** while Stream Mode is on, your history lives only inside the extension. If the extension is removed in that state, the backup goes with it — use "Download backup (JSON)". If the browser crashes while Stream Mode is on, the extension checks the backup at startup and warns you with an `!` badge if it is missing.

## Limits

- Restored history entries show "now" as their visit time (Chrome API limitation).
- Bookmarks are still suggested in the address bar.
- The URL in the address bar and the browser UI itself cannot be masked.
- Closed (`mode: 'closed'`) Shadow DOM cannot be read by any extension, so it is not masked.
- Text drawn into `<canvas>` or baked into images/video is not text, so it cannot be masked.
- `contenteditable` areas are left alone on purpose, so masking never corrupts what you are typing.
- Unseparated runs of 11+ digits are treated as phone numbers. This is deliberate: masking an order number by mistake is better than missing a phone number on stream.

## Development

```bash
npm test        # detection unit tests (false-positive traps included)
npm run locales # every UI string present in all 8 languages
npm run sync    # regenerate test-ext.html from test.html
npm run check   # all of the above
```

- `detect.js` — detection core, no DOM: patterns, checksum validators, mask styles. Runs both as a content script and under Node, which is what makes it testable.
- `content.js` — DOM side: scanning, MutationObserver, Shadow DOM, form fields, restore.
- `shadow-hook.js` — runs in the page's main world; tells the content script when a shadow root is attached (`attachShadow` produces no mutation record, and an isolated world cannot patch the page's prototypes).
- `background.js` + `obs.js` + `bridge.js` — service worker: badge, Stream Mode, OBS, desktop bridge.
- `test.html` — manual QA page; works without the extension (preview mode) and with it (`test-ext.html`).
- `test/popup-preview.html` — renders the popup in a normal tab with a stubbed `chrome.*` API, for layout and translation checks.

## Store assets

`store/` holds the listing text (`LISTING.md`), the privacy policy and the rendered images in `store/out/`.
