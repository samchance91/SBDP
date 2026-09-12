# SBDP — enabling accounts & Google sign-in

The app runs **without any setup** in two modes:
- **Try a quick split** / **Use without an account** — data stays on the device; export a `.md` copy anytime (Settings → Save session).
- Configure Supabase below to turn on **real Google accounts** that sync across devices.

You do this once. It takes ~15 minutes. You need a Google account and a (free) Supabase account. Nothing here goes in the code repo — keep secrets in the dashboards.

---

## 1. Create a Supabase project

1. Go to https://supabase.com → sign in → **New project**.
2. Name it (e.g. `sbdp`), set a database password (save it), pick a region near your users, create.
3. When it’s ready, open **Project Settings → API** and copy two values:
   - **Project URL** — `https://xxxx.supabase.co`
   - **anon public key** — a long string. (This one is safe in the browser.)
   - Leave **service_role** alone — never put it in the browser.

## 2. Create a Google OAuth client

1. Go to https://console.cloud.google.com → create/select a project.
2. **APIs & Services → OAuth consent screen**: choose **External**, fill app name + your email, add the scopes `email`, `profile`, `openid`, save. (While testing, add your own Google address under **Test users**.)
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   - Application type: **Web application**.
   - **Authorized redirect URIs** — add exactly:
     `https://xxxx.supabase.co/auth/v1/callback`  ← your Project URL + `/auth/v1/callback`
   - Create. Copy the **Client ID** and **Client secret**.

## 3. Connect Google to Supabase

1. In Supabase → **Authentication → Providers → Google** → enable.
2. Paste the **Client ID** and **Client secret** from step 2. Save.
3. **Authentication → URL Configuration**: set **Site URL** to where you host SBDP
   (e.g. `https://your-domain.com/` or `http://localhost:8000/` while testing) and add the
   same URL under **Redirect URLs**. This must match where the app runs.

## 4. Create the database

1. Supabase → **SQL Editor → New query**.
2. Paste the contents of [`supabase/schema.sql`](supabase/schema.sql) and **Run**.
   This creates the tables, membership row-level security, and the transactional
   expense write function.

## 5. Point the app at your project

The app reads `window.SBDP_ENV`. In `index.html` there’s a commented line near the top — fill it in with **only the public values**:

```html
<script>
  window.SBDP_ENV = {
    url: 'https://xxxx.supabase.co',
    anonKey: 'YOUR_PUBLIC_ANON_KEY'
  };
</script>
```

(For a real deployment, inject these at build/serve time rather than committing them. The client secret from step 2 stays in Google/Supabase only — it never appears here.)

## 6. Run it

Serve the folder over **http/https** (OAuth won’t redirect from a `file://` page):

```
cd sbdp && python -m http.server 8000   # http://localhost:8000
```

Open it, click **Continue with Google**, pick your account. On success you’re signed in — an account is created automatically on first login, your name/photo show in the sidebar, and product screens require a session (or the explicit no-account mode).

---

## What each choice means

| | No account (local) | Google account (Supabase) |
| --- | --- | --- |
| Setup | none | steps 1–5 |
| Data lives | this device only | your project’s Postgres, synced |
| Backup | Save session → `.md` | automatic |
| Invite friends | link works on-device | real expiring invite links |
| Works offline | yes | yes; syncs when back online |

## Troubleshooting

- **“redirect_uri_mismatch”** — the redirect URI in Google (step 2) must be exactly `<Project URL>/auth/v1/callback`.
- **Redirects back but not signed in** — Site URL / Redirect URLs (step 3) must match the address you’re actually on, including `http` vs `https` and trailing slash.
- **Button says “preview isn’t connected”** — `window.SBDP_ENV` isn’t set (step 5), or the page wasn’t reloaded.
- **Google “access blocked / app not verified”** — add your address as a Test user (step 2), or submit the consent screen for verification before going public.
