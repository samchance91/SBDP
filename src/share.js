// Sharing helpers. Uses the native Web Share sheet where available and sensible
// fallbacks (WhatsApp/Telegram/Email deep links, clipboard) elsewhere. The OS and
// browser decide which app targets exist; we never claim every installed app.
// Cancelling a share is a normal outcome — never surfaced as an error or "sent".

export function canNativeShare(data) {
  if (typeof navigator === 'undefined' || !navigator.share) return false;
  if (data && navigator.canShare) { try { return navigator.canShare(data); } catch { return false; } }
  return true;
}

// Returns 'shared' | 'cancelled' | 'unsupported'
export async function nativeShare(data) {
  if (!canNativeShare(data)) return 'unsupported';
  try { await navigator.share(data); return 'shared'; }
  catch (e) { if (e && e.name === 'AbortError') return 'cancelled'; return 'unsupported'; }
}

export function whatsappUrl(text) { return `https://wa.me/?text=${encodeURIComponent(text)}`; }
export function telegramUrl(text, url = '') { return `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`; }
export function emailUrl(subject, body) { return `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`; }

export async function copyText(text) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(text); return true; }
  } catch { /* fall through */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    const ok = document.execCommand('copy'); ta.remove(); return ok;
  } catch { return false; }
}

// Build the plain-text statement for a group (English or active locale copy is
// applied by the caller; names and descriptions are passed through untranslated).
export function buildStatement({ title, lines, footer }) {
  return [title, '', ...lines, '', footer].filter((x) => x !== undefined).join('\n');
}
