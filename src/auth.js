// Real authentication via Supabase Auth + Google OAuth.
// Activates ONLY when window.SBDP_ENV is configured (url + anonKey). Without it
// the app stays in preview mode and this module reports "not configured".
// Account creation is automatic on first Google sign-in — no password is stored.

const CDN = 'https://esm.sh/@supabase/supabase-js@2';

let client = null;
let session = null;
let lastError = null;
const listeners = new Set();

export function lastAuthError() { return lastError; }

// Resolve createClient: prefer the locally-vendored library (assets/vendor),
// fall back to the CDN only if the local script didn't load.
async function getCreateClient() {
  if (typeof window !== 'undefined' && window.supabase && window.supabase.createClient) return window.supabase.createClient;
  const mod = await import(/* @vite-ignore */ CDN);
  return mod.createClient;
}

export function configured() {
  const e = (typeof window !== 'undefined' && window.SBDP_ENV) || null;
  return !!(e && e.url && e.anonKey);
}

async function getClient() {
  if (client) return client;
  const createClient = await getCreateClient();
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
  // Surface an OAuth error returned in the callback URL (?error=...).
  try {
    const q = new URLSearchParams(location.search);
    if (q.get('error_description') || q.get('error')) lastError = q.get('error_description') || q.get('error');
  } catch {}
  try {
    const c = await getClient();
    const { data } = await c.auth.getSession();
    session = data.session;
    c.auth.onAuthStateChange((_evt, s) => { session = s; emit(); });
    // Clean the ?code / ?error params out of the URL after the exchange.
    if (location.search) { try { history.replaceState({}, '', location.pathname + location.hash); } catch {} }
    return session;
  } catch (e) {
    lastError = (e && e.message) || String(e);
    console.error('[SBDP] auth init failed', e);
    return null;
  }
}

// Redirects to Google. `returnTo` (a hash route like '#/home') is restored after
// the callback. Only basic identity scopes are requested.
export async function signInWithGoogle(returnTo = '#/home') {
  try { sessionStorage.setItem('sbdp-return', returnTo); } catch {}
  const redirectTo = location.origin + location.pathname; // must be allowlisted in Supabase
  let c;
  try { c = await getClient(); }
  catch (e) { lastError = 'Could not load the sign-in library. Check your connection and try again.'; throw new Error(lastError); }
  const { error } = await c.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo, scopes: 'openid email profile', queryParams: { prompt: 'select_account' } },
  });
  if (error) { lastError = error.message; throw error; }
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
