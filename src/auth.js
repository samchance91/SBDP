// Real authentication via Supabase Auth + Google OAuth.
// Activates ONLY when window.SBDP_ENV is configured (url + anonKey). Without it
// the app stays in preview mode and this module reports "not configured".
// Account creation is automatic on first Google sign-in — no password is stored.

const CDN = 'https://esm.sh/@supabase/supabase-js@2';

let client = null;
let session = null;
const listeners = new Set();

export function configured() {
  const e = (typeof window !== 'undefined' && window.SBDP_ENV) || null;
  return !!(e && e.url && e.anonKey);
}

async function getClient() {
  if (client) return client;
  const { createClient } = await import(/* @vite-ignore */ CDN);
  client = createClient(window.SBDP_ENV.url, window.SBDP_ENV.anonKey, {
    auth: { flowType: 'pkce', detectSessionInUrl: true, persistSession: true, autoRefreshToken: true },
  });
  return client;
}

function emit() { listeners.forEach((fn) => { try { fn(currentUser()); } catch {} }); }
export function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

// Call once at startup. Establishes the session (and completes an OAuth redirect
// via detectSessionInUrl) before the first render.
export async function init() {
  if (!configured()) return null;
  try {
    const c = await getClient();
    const { data } = await c.auth.getSession();
    session = data.session;
    c.auth.onAuthStateChange((_evt, s) => { session = s; emit(); });
    return session;
  } catch (e) {
    console.error('[SBDP] auth init failed', e);
    return null;
  }
}

// Redirects to Google. `returnTo` (a hash route like '#/home') is restored after
// the callback. Only basic identity scopes are requested.
export async function signInWithGoogle(returnTo = '#/home') {
  const c = await getClient();
  try { sessionStorage.setItem('sbdp-return', returnTo); } catch {}
  const redirectTo = location.origin + location.pathname; // must be allowlisted in Supabase
  const { error } = await c.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo, scopes: 'openid email profile', queryParams: { prompt: 'select_account' } },
  });
  if (error) throw error;
}

export function takeReturn() {
  try { const r = sessionStorage.getItem('sbdp-return'); sessionStorage.removeItem('sbdp-return'); return r; } catch { return null; }
}

export async function signOut() {
  if (client) { try { await client.auth.signOut(); } catch {} }
  session = null; emit();
}

export function currentUser() {
  if (!configured()) return null;
  const u = session && session.user;
  if (!u) return null;
  const m = u.user_metadata || {};
  return { id: u.id, name: m.full_name || m.name || u.email, email: u.email, avatar: m.avatar_url || m.picture || null };
}

export function isSignedIn() { return !!currentUser(); }

// Expose the authenticated client so the data layer can run RLS-guarded queries.
export async function supabase() { return configured() ? getClient() : null; }
