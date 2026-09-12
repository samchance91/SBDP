# SBDP — Split Bills, Divide Payments.
**by Propelr.in**

Interactive, mobile-first expense-splitting prototype. Framework-free ES modules, real money engine (integer paise), calculator, 8 locales, microphone voice notes, capability-detected sharing, Light/Dark/System themes, and a Supabase (Google auth + Postgres + private Storage) backend contract.

## Run
```
cd sbdp && python -m http.server 8000   # http://localhost:8000
```

- **`index.html`** — app shell. Open `#/gallery` for the review gallery of every screen/state.
- **`IMPLEMENTATION.md`** — real vs. preview, and how to enable Supabase.
- **`VERIFICATION.md`** — numeric/interaction/responsive/script/a11y checks.
- **`screens-generated/`** — exported screenshots (mobile + desktop, dark, translated).
- **`supabase/schema.sql`** — tables, membership RLS, transactional expense RPC.
- **`.env.example`** — required configuration (no secrets committed).

Without configured credentials the app runs a clearly-labelled **preview** adapter; the Google button never fakes a successful sign-in.
