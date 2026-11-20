# AGENTS.md

## What this repo is
- Static site, **no build step**. There is no `package.json` and no test / lint / typecheck / formatter config — don't invent `npm` scripts. Verify changes manually in a browser.
- Deploy: pushing to `main` auto-deploys to Cloudflare Pages. The `worker/` Cloudflare Worker is a **separate, manual deploy** (only when `worker/` changes).

## Run locally
```powershell
python -m http.server 4173
```
Open `http://localhost:4173` and `http://localhost:4173/admin.html`. Do **not** open with `file:///` — ES modules and Firebase imports need HTTP. For Firebase Auth tests, `localhost` must be an authorized domain in Firebase Console.

## Entry points / ownership
- `index.html` + `js/main.js` + `css/style.css` — customer landing (catalog, WA order modal, reviews, testimonials, theme, carousel).
- `admin.html` + `js/admin.js` — admin dashboard (reviews, testimonials, subscriptions, **daily income/outcome ledger**, Telegram). Modules live behind a show/hide sidebar (`#adminSidebar`, toggled by `#adminSidebarToggle`; full-height off-canvas panel from the right at all sizes); `#adminNav` buttons switch `.admin-section` panels via `data-admin-section`. Only one section is visible at a time, so don't assume it's on screen just because it's in the DOM. Prod URL is `/admin.html`; there is no `_redirects`, so `/admin` 404s unless a redirect is added in Pages.
- `js/firebase-config.js` — three exports: `firebaseConfig`, `adminEmails`, `notifyWorkerUrl`.
- `worker/` — Telegram notification worker (its own `wrangler.toml`, endpoints in `worker/src/index.js`).

## Firebase / Firestore — sharp edges
- Firebase JS SDK 10.14.1 is loaded via **dynamic import from gstatic** in both JS entry files. If the CDN fails, the static catalog still works but reviews/auth do not. `main.js` skips Firebase entirely when `projectId` starts with `PASTE_`.
- **Admin allowlist lives in two places**: `adminEmails` in `js/firebase-config.js` (UX only) and `isAdmin()` in the Firestore Rules (real access control). Adding/removing an admin requires editing both and republishing Rules.
- Firestore Security Rules are the actual security boundary; the web `apiKey` is public by design. Never set `allow read, write: if true` or commit service-account JSON / private keys / deploy tokens. Authoritative rules are in `FIREBASE_SETUP.md`; `worker/.dev.vars` is gitignored — never `git add -f` it.
- **Reviews**: created with `approved: false`; public reads only `approved: true`. Loading uses 12-per-page `startAfter` pagination plus `getCountFromServer` stats, which needs one **composite index** (`approved` asc, `createdAt` desc) — see `FIREBASE_SETUP.md` §4.1. If that index is missing, `main.js` falls back to fetching all approved reviews and sorting in the browser. `DOKUMENTASI.md` has been synced with this behavior; `FIREBASE_SETUP.md` remains authoritative for Rules and indexes.
- **Testimonials**: 4 static photos are hardcoded in `index.html`; admin uploads are compressed in-browser and stored as a **data URL directly in Firestore** (`src`, max ~950,000 chars) — no Firebase Storage.
- **Subscriptions**: `expiresAt = startedAt + durationDays`. **Renew shifts from the old `expiresAt`, not from today** — renewing a long-expired subscription can immediately re-expire it (delete + recreate instead). `stopped: true` pauses the countdown and excludes it from worker sync/notifications. Only admins can read/write this collection.
- **Transactions (catatan keuangan harian)**: `transactions/{autoId}` with `type` (`income`/`outcome`), `amount` (Rupiah), `note`, `date` (`"YYYY-MM-DD"` string used for single-field equality queries — no composite index), `createdAt`. Admin-only in Rules; the dashboard filters by `date`, sums each type, shows **Net Profit** (`income - outcome`) and **Daily Transaction Count** (entry count). A 7-day income-vs-outcome bar chart (`#keuanganChart`) comes from one range query on `date`, aggregated in the browser — no chart library, no composite index. `date` is a string (not a Timestamp) on purpose to avoid timezone drift.

## Telegram worker
- Cron is **every 1 minute** per `worker/wrangler.toml` `[triggers]` — trust `wrangler.toml` over any "10 minutes" prose in docs/comments. KV writes are throttled (`lastCron` written at most every 10 min) but notifications run each minute.
- Endpoints (`X-Sync-Secret` header required, else 401; CORS `*`): `POST /sync` (push subs, returns `notified`), `GET /status` (Telegram `getMe` + counts), `POST /test`.
- Secrets set with `npx wrangler secret put` from `worker/`: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` (comma-separated for multiple chats), `SYNC_SECRET`. KV binding is `NOTIFY_KV` (id already in `wrangler.toml`). `SYNC_SECRET` must match the `settings/telegram.syncSecret` auto-generated in the dashboard; an empty `notifyWorkerUrl` just shows "worker not connected" and leaves subscriptions usable.
- Deploy/update: `cd worker`, `npx wrangler login`, `npx wrangler deploy`.

## Conventions worth keeping
- Light **and** dark themes must both be maintained; don't add a color to only one. Light theme is a **pink/brown** palette defined by the `html[data-theme="light"]` variables in `css/style.css` (plus light-only overrides for status colors); dark keeps the original dark/red look. Theme is in `localStorage` key `theme`; an inline `<head>` script on **both** `index.html` and `admin.html` applies it before render to avoid FOUC. The click/drag/keyboard toggle logic lives in `js/theme.js` (`initThemeToggle()`), imported by both `main.js` and `admin.js` — change it there, not in a page-specific copy.
- Hero video `video/frame1arin-web.mp4` needs `muted` + `playsinline` + `width`/`height` for autoplay and to avoid layout shift. `frame1arin.mp4` / `frame2arin.mp4` are unreferenced sources.
- `WA_NUMBER`, prices (`PACKAGES` in `main.js`; values are in thousands, e.g. `"4"` = Rp 4.000), and contact handles are hardcoded.

## Docs
- `DOKUMENTASI.md` — broad handover (data model, ops, troubleshooting); verify against code before trusting details.
- `FIREBASE_SETUP.md` — authoritative Firestore Rules and composite-index instructions.
