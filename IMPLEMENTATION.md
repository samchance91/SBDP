# SBDP — implementation note

An interactive, high-fidelity prototype of **SBDP — Split Bills, Divide Payments. by Propelr.in**.
Mobile-first, framework-free ES modules; the design-pack tokens, fonts and brand SVGs are reused verbatim.

## Run

```
cd sbdp
python -m http.server 8000   # then open http://localhost:8000
```
No build step. Requires a modern browser (ES modules, `MediaRecorder`, `navigator.share` used with capability checks).

## What is real vs. preview

| Area | Implemented now | Needs configuration |
| --- | --- | --- |
| Money engine | ✅ integer-paise splits (equal / exact / percent / shares / equal+extra), multiple payers, subset selection, unallocated/excess, greedy settlement, Indian grouping — `src/money.js` | — |
| Calculator | ✅ shunting-yard, no `eval`, ÷0 guard, percent = ÷100, tip/tax/discount, keyboard, "Use ₹" insert rounded to paise — `src/calc.js` | — |
| Locales | ✅ 8 catalogues, live switch, draft preserved, names/currency never translated — `src/i18n.js` | native-speaker review (all non-English marked `needsReview`) |
| Voice note | ✅ real `MediaRecorder` capture/playback, 2-min cap, permission-on-Record, tracks stopped on exit, typed fallback, denied/unsupported states — `src/audio.js` | — (no transcription is implied) |
| Sharing | ✅ `navigator.share` + WhatsApp/Telegram/Email/clipboard fallbacks, capability-detected, cancel is silent — `src/share.js` | WhatsApp/Telegram brand assets for production |
| Theme | ✅ Light/Dark/System, persisted, reduced-motion respected — `src/ui.js` | — |
| Data | ✅ `PreviewAdapter` (in-memory fixtures, idempotent saves, edit history, proposed vs confirmed payments) — `src/data.js` | `SupabaseAdapter` (contract stubbed) |
| Auth | ⛔ preview never fakes Google success | real Google OAuth via Supabase |
| Persistence / RLS | schema + RLS + transactional RPC written — `supabase/schema.sql` | apply to a Supabase project |

## Enabling the real Supabase backend

1. Create a Supabase project; run `supabase/schema.sql` (tables, membership RLS, `save_expense` transactional RPC).
2. In Supabase Auth enable **Google**; in Google Cloud create an OAuth client. Authorised redirect: `https://<project>.supabase.co/auth/v1/callback`. Allowlist the app return route. Request only basic identity scopes.
3. Copy `.env.example` → `.env.local`. Keep `SUPABASE_SERVICE_ROLE_KEY`, `GOOGLE_CLIENT_SECRET` **server-side only**; only `SUPABASE_URL` + `SUPABASE_ANON_KEY` may reach the browser.
4. Set `window.SBDP_ENV = { url, anonKey }` (server-injected) in `index.html`, bundle `@supabase/supabase-js`, and complete `SupabaseAdapter` in `src/data.js` against the same method interface as `PreviewAdapter`.

When `window.SBDP_ENV` is absent the app runs the preview adapter and shows a **"Preview data"** badge; the sign-in button explicitly states Google is not connected. A preview sign-in is never presented as a successful Google auth, and opening a payment/share app never marks a payment received.

## Key invariants (enforced)

- All money is integer paise; splits always sum exactly to the total (remainder distributed deterministically).
- Payers must sum to the amount; participant shares must sum to the amount (DB `save_expense` rejects otherwise).
- Proposed partial payment (Meera ₹1,000) and the unequal draft stay **out** of the authoritative ledger until saved/confirmed.
- `client_id` idempotency + `revision` history on expenses; membership-based RLS; payee-only payment confirmation.

## Structure

```
sbdp/
  index.html            app shell, env hook
  styles/base.css       design-pack components (reused)
  styles/app.css        additions (warning token, a11y, reflow guards)
  src/money.js          integer-paise engine + settlement
  src/calc.js           safe calculator
  src/i18n.js           8 locale catalogues
  src/data.js           preview + supabase adapters, seed fixtures
  src/audio.js          MediaRecorder wrapper
  src/share.js          native share + fallbacks
  src/ui.js             icons, theme, toast, lockup
  src/app.js            router + all screens
  supabase/schema.sql   tables, RLS, transactional RPC
  .env.example
```

Prototype-only controls (the review gallery at `#/gallery`, deep-linked auth states, language QA hook `window.SBDP_setLang`) are labelled as tools and must be removed for production.
