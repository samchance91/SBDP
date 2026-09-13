// Shared UI primitives: Lucide-style inline icons, avatars, brand lockup, theme,
// toast, and small DOM helpers. Icons use 2px strokes per the Propelr guide.

const PATHS = {
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/>',
  users: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20a6 6 0 0 1 12 0"/><path d="M16 5.2a3.2 3.2 0 0 1 0 5.6"/><path d="M21 20a6 6 0 0 0-4-5.6"/>',
  activity: '<path d="M3 12h4l2 6 4-14 2 8h6"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  calc: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 7h8M8 12h.01M12 12h.01M16 12v5M8 16h.01M12 16h.01"/>',
  arrowLeft: '<path d="M15 18l-6-6 6-6"/>',
  arrowUpRight: '<path d="M7 17 17 7M7 7h10v10"/>',
  arrowDownLeft: '<path d="M17 7 7 17M17 17H7V7"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M6 11a6 6 0 0 0 12 0M12 17v4"/>',
  play: '<path d="M7 4v16l13-8z"/>',
  pause: '<path d="M8 4v16M16 4v16"/>',
  share: '<circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M8.2 10.8 15.8 7.2M8.2 13.2l7.6 3.6"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>',
  link: '<path d="M10 13a5 5 0 0 0 7 0l2-2a5 5 0 0 0-7-7l-1 1M14 11a5 5 0 0 0-7 0l-2 2a5 5 0 0 0 7 7l1-1"/>',
  check: '<path d="M4 12l5 5L20 6"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  send: '<path d="M22 2 11 13M22 2l-7 20-4-9-9-4z"/>',
  receipt: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>',
  chevron: '<path d="M9 6l6 6-6 6"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18"/>',
  moon: '<path d="M20 14A8 8 0 0 1 10 4a8 8 0 1 0 10 10z"/>',
  bell: '<path d="M18 9a6 6 0 1 0-12 0c0 6-2 7-2 7h16s-2-1-2-7"/><path d="M10 21a2 2 0 0 0 4 0"/>',
  logout: '<path d="M15 4h4v16h-4"/><path d="M10 8l-4 4 4 4M6 12h9"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 8h.01M11 12h1v4h1"/>',
  trash: '<path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13"/>',
  edit: '<path d="M4 20h4L18 10l-4-4L4 16z"/><path d="M13 5l4 4"/>',
  tag: '<path d="M3 11V4h7l10 10-7 7L3 11z"/><circle cx="7.5" cy="7.5" r="1.3"/>',
  calendar: '<rect x="4" y="5" width="16" height="16" rx="2"/><path d="M4 9h16M9 3v4M15 3v4"/>',
  note: '<path d="M5 4h11l3 3v13H5z"/><path d="M9 9h6M9 13h6M9 17h4"/>',
  // Category icons
  food: '<path d="M5 3v8a2 2 0 0 0 4 0V3M7 11v10M15 3c-1.5 0-2 3-2 5s.5 3 2 3 2-1 2-3-.5-5-2-5zM17 11v10"/>',
  grocery: '<circle cx="9" cy="20" r="1.4"/><circle cx="17" cy="20" r="1.4"/><path d="M3 4h2l2.5 12h10l2-8H6"/>',
  transport: '<path d="M5 16V9l2-4h10l2 4v7M5 16h14M5 16v2M19 16v2"/><circle cx="8" cy="16" r="1.2"/><circle cx="16" cy="16" r="1.2"/>',
  fuel: '<path d="M5 21V5a2 2 0 0 1 2-2h5a2 2 0 0 1 2 2v16M4 21h11M14 9h3l2 2v6a2 2 0 0 1-2 2"/>',
  hotel: '<path d="M3 20V8h9a4 4 0 0 1 4 4v2h5v6M3 14h18M3 20h18"/>',
  travel: '<path d="M2 12l20-7-4 16-5-6-5 3-1-4-5-2z"/>',
  rent: '<path d="M3 10.5 12 3l9 7.5M5 9.5V21h14V9.5"/>',
  utilities: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
  entertainment: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
  shopping: '<path d="M6 8h12l-1 12H7z"/><path d="M9 8a3 3 0 0 1 6 0"/>',
  healthcare: '<path d="M12 21s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 11c0 5.5-7 10-7 10z"/>',
  education: '<path d="M3 8l9-4 9 4-9 4-9-4z"/><path d="M7 10v5c0 1 2.5 3 5 3s5-2 5-3v-5"/>',
  subscription: '<path d="M4 12a8 8 0 0 1 14-5l2 2M20 12a8 8 0 0 1-14 5l-2-2M18 4v5h-5M6 20v-5h5"/>',
  gift: '<rect x="4" y="9" width="16" height="11" rx="1"/><path d="M2 9h20v3H2zM12 9v11M12 9S9 3 6.5 5 12 9 12 9zM12 9s3-6 5.5-4S12 9 12 9z"/>',
  briefcase: '<rect x="3" y="8" width="18" height="12" rx="2"/><path d="M8 8V6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 13h18"/>',
  misc: '<circle cx="6" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="18" cy="12" r="1.5"/>',
};

export function icon(name, cls = 'i') {
  return `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${PATHS[name] || ''}</svg>`;
}

export function avatar(m, extra = '') {
  const you = m && m.you ? ' you' : '';
  return `<span class="avatar${you} ${extra}" title="${m ? esc(m.name) : ''}">${m ? esc(m.initials) : '?'}</span>`;
}

export function lockup(sub = true) {
  return `<div class="brand"><img src="assets/brand/sbdp-icon.svg" alt="" width="36" height="36"><div>
    <strong>SBDP</strong>${sub ? `<div class="tag muted">Split Bills, Divide Payments.</div><div class="credit">by Propelr.in</div>` : ''}</div></div>`;
}

export function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---- Theme -----------------------------------------------------------------
const THEME_KEY = 'sbdp-theme';
export function applyTheme(mode) {
  const root = document.documentElement;
  if (mode === 'system' || !mode) {
    root.removeAttribute('data-theme');
    const dark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    root.setAttribute('data-theme', dark ? 'dark' : 'light');
    root.dataset.themeMode = 'system';
  } else {
    root.setAttribute('data-theme', mode);
    root.dataset.themeMode = mode;
  }
  try { localStorage.setItem(THEME_KEY, mode || 'system'); } catch {}
}
export function getThemeMode() {
  try { return localStorage.getItem(THEME_KEY) || 'system'; } catch { return 'system'; }
}

// ---- Toast (non-alarming, transient) --------------------------------------
export function toast(msg, ms = 2600) {
  const el = document.createElement('div');
  el.className = 'toast'; el.setAttribute('role', 'status'); el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 200); }, ms);
}
