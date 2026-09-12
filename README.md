# SBDP — Split Bills, Divide Payments.
**by Propelr.in**

Interactive, mobile-first expense-splitting prototype. Framework-free ES modules, real money engine (integer paise), calculator, 8 locales, microphone voice notes, capability-detected sharing, Light/Dark/System themes, and a Supabase (Google auth + Postgres + private Storage) backend contract.

## Three ways to use it

- **Google account** — real sign-in via Supabase Auth; accounts are created automatically on first login and sync across devices. Setup: **[`SETUP.md`](SETUP.md)**.
- **No account** — "Use without an account" on the login screen. Data is saved on the device; export a `.md` copy anytime (Settings → Save session) and restore it later.
- **Offline** — the app keeps working with no connection and prompts you to save a copy so nothing is lost.

Invite friends to a group by name/email or a shareable invite link (Group → Invite friends).

## Run
```
cd sbdp && python -m http.server 8000   # http://localhost:8000
```

- **`SETUP.md`** — step-by-step: create Supabase + Google OAuth and turn on real accounts.
- **`index.html`** — app shell. Open `#/gallery` for the review gallery of every screen/state.
- **`IMPLEMENTATION.md`** — real vs. preview, and how to enable Supabase.
- **`VERIFICATION.md`** — numeric/interaction/responsive/script/a11y checks.
- **`screens-generated/`** — exported screenshots (mobile + desktop, dark, translated).
- **`supabase/schema.sql`** — tables, membership RLS, transactional expense RPC.
- **`.env.example`** — required configuration (no secrets committed).

Without configured credentials the app runs a clearly-labelled **preview / no-account** mode; the Google button never fakes a successful sign-in.
