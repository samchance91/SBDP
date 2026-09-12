import { makeAdapter } from './data.js?v=4';
import { computeBalances, settle, computeShares, formatINR, toPaise, splitEven } from './money.js?v=4';
import { evaluate, roundToPaise } from './calc.js?v=4';
import { t, setLang, getLang, LANGS, needsReview } from './i18n.js?v=4';
import { icon, avatar, lockup, esc, applyTheme, getThemeMode, toast } from './ui.js?v=4';
import { Recorder, fmtTime, isSupported as audioSupported } from './audio.js?v=4';
import * as Share from './share.js?v=4';
import * as Auth from './auth.js?v=4';
import * as Local from './local.js?v=4';

const db = makeAdapter();
// No-account persistence: writes autosave to this device.
if (db.mode === 'preview') db._onPersist = (s) => Local.saveLocal(s);
const app = document.getElementById('app');
const state = { group: null, calcTarget: null, recorder: null, focusReturn: null };

// ---- helpers ---------------------------------------------------------------
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const money = (p, o) => `<span class="num">${formatINR(p, o)}</span>`;
const nameOf = (id) => db.member(id)?.name || '—';
const avatarOf = (id, extra) => avatar(db.member(id), extra);

function reviewBadge() {
  if (db.mode !== 'preview' || Auth.isSignedIn()) return '';
  return `<span class="pill" title="No backend configured — data is local preview only">${icon('info', 'i')}&nbsp;${esc(t('reviewMode'))}</span>`;
}

function go(hash) { location.hash = hash; }

// ---- shell -----------------------------------------------------------------
const NAV = [
  { key: 'home', route: '#/home', label: 'nav_home', icon: 'home' },
  { key: 'groups', route: '#/groups', label: 'nav_groups', icon: 'users' },
  { key: 'activity', route: '#/activity', label: 'nav_activity', icon: 'activity' },
  { key: 'settings', route: '#/settings', label: 'nav_settings', icon: 'settings' },
];

function shell(active, content, { title = '', subtitle = '', action = '' } = {}) {
  const sidebar = `<aside class="sidebar">
    ${lockup(true)}
    <nav class="nav" aria-label="Primary">
      ${NAV.map((n) => `<a href="${n.route}" class="${active === n.key ? 'active' : ''}">${icon(n.icon)}<span>${esc(t(n.label))}</span></a>`).join('')}
    </nav>
    <div class="bottom">
      <a href="#/language" class="nav-util row" style="padding:10px 14px;color:var(--muted);font-size:13px">${icon('globe')}<span>${esc(LANGS.find((l) => l.code === getLang()).native)}</span></a>
      <div class="rule"></div>
      ${sidebarUser()}
    </div>
  </aside>`;

  const mobileHead = `<div class="mobile-head">${lockup(false)}<a href="#/language" class="iconbtn" aria-label="${esc(t('language'))}">${icon('globe')}</a></div>`;
  const bottomnav = `<nav class="bottomnav" aria-label="Primary">
    ${NAV.map((n) => `<a href="${n.route}" class="${active === n.key ? 'active' : ''}">${icon(n.icon)}<span>${esc(t(n.label))}</span></a>`).join('')}
  </nav>`;

  const titleBar = title ? `<div class="title"><div><h1>${esc(title)}</h1>${subtitle ? `<p>${esc(subtitle)}</p>` : ''}</div>${action}</div>` : '';

  return `${sidebar}<main class="app">${mobileHead}
    <div class="top"><div class="row">${reviewBadge()}${Auth.isSignedIn() ? `<span class="pill">${icon('check')}&nbsp;Signed in</span>` : ''}</div>
      <div class="row" style="gap:14px">${saveButton()}</div></div>
    ${localBar()}
    <div class="content">${titleBar}${content}</div></main>${bottomnav}`;
}

function sidebarUser() {
  const u = Auth.currentUser();
  if (u) {
    const av = u.avatar ? `<img src="${esc(u.avatar)}" alt="" width="34" height="34" style="border-radius:50%">` : `<span class="avatar you">${esc((u.name || '?').slice(0, 2).toUpperCase())}</span>`;
    return `<div class="row">${av}<div><strong style="font-size:13px">${esc(u.name)}</strong><div class="small muted">${esc(u.email || '')}</div></div></div>`;
  }
  const label = db.localMode ? 'On this device' : 'Preview session';
  const meName = db.member(db.currentUserId)?.name || 'You';
  return `<div class="row">${avatarOf(db.currentUserId)}<div><strong style="font-size:13px">${esc(meName)}</strong><div class="small muted">${esc(label)}</div></div></div>`;
}

// Save-a-copy button appears in no-account/local mode (and whenever offline).
function saveButton() {
  if (!db.localMode && Local.isOnline()) return '';
  return `<button class="link" data-act="save" style="background:none;border:0;padding:0">${icon('arrowUpRight')} ${esc(t('saveSession'))}</button>`;
}

// A quiet banner explaining local/offline mode, with a Save action.
function localBar() {
  const offline = !Local.isOnline();
  if (!db.localMode && !offline) return '';
  const msg = offline ? t('offlineBody') : t('localDisclaimer');
  return `<div class="content" style="padding-bottom:0"><div class="notice" style="margin-top:20px">${icon('info')}
    <div class="row between" style="flex:1;gap:12px"><span>${esc(offline ? t('offlineTitle') + ' — ' : '')}${esc(msg)}</span>
    <button class="btn secondary" data-act="save" style="min-height:36px">${esc(t('saveSession'))}</button></div></div></div>`;
}

// ---- screens ---------------------------------------------------------------
const screens = {};

// A. Login
screens.login = () => {
  const example = `<div class="card receipt-card"><div class="small muted">Dinner · split 4 ways</div>
    <div class="amount num" style="margin-top:8px">${formatINR(toPaise(2400))}</div>
    <div class="rule"></div>
    <div class="row between small"><span class="muted">${esc(t('yourShare'))}</span><span class="num">${formatINR(toPaise(600))}</span></div></div>`;
  app.innerHTML = `<div class="login">
    <div class="login-left">
      ${lockup(true)}
      <div class="login-copy">
        <h1>${esc(t('benefit'))}</h1>
        <p>Split a bill, track who paid, and settle up — without the spreadsheet.</p>
        <button class="btn google" id="gbtn"><img src="assets/google-g.png" alt="">${esc(t('continueGoogle'))}</button>
        <button class="btn secondary wide" id="noacct" style="margin-top:12px">${esc(t('useWithoutAccount'))}</button>
        <div class="row" style="gap:16px;margin-top:20px">
          <a class="link" href="#/language">${icon('globe')} ${esc(LANGS.find((l) => l.code === getLang()).native)}</a>
        </div>
        <div class="notice" id="authnote" hidden></div>
        <p class="fine" style="margin-top:28px">SBDP uses Google sign-in. We only request your name and email. Your account is created automatically on first sign-in. Prefer not to sign in? “${esc(t('useWithoutAccount'))}” keeps everything on this device.</p>
      </div>
    </div>
    <div class="login-right">${lockup(false)}${example}</div>
  </div>`;

  const note = $('#authnote');
  const showState = (kind) => {
    const map = {
      redirect: ['Redirecting to Google…', 'Loading sign-in.'],
      cancelled: ['Sign-in cancelled', 'You closed the Google window. Nothing was shared.'],
      failed: ['Sign-in could not complete', 'The Google callback failed. Try again.'],
      expired: ['Session expired', 'Please sign in again to continue.'],
    };
    const [h, b] = map[kind]; note.hidden = false;
    note.innerHTML = `${icon('info')}<div><strong>${esc(h)}</strong><div>${esc(b)}</div></div>`;
  };
  $('#gbtn').onclick = async () => {
    if (Auth.configured()) {
      showState('redirect');
      try { await Auth.signInWithGoogle(state.afterLogin || '#/home'); }
      catch (e) { showState('failed'); }
      return;
    }
    // Preview: DO NOT pretend Google auth succeeded.
    note.hidden = false;
    note.innerHTML = `${icon('info')}<div><strong>Preview build — Google is not connected.</strong>
      <div>Real Google sign-in activates only with configured Supabase credentials (see SETUP.md). Use “${esc(t('tryQuick'))}” to explore sample data.</div></div>`;
  };
  $('#noacct').onclick = () => {
    db.enableLocal(Local.loadLocal());
    state.noAccount = true;
    toast(t('localDisclaimer'), 4200);
    go('#/home');
  };
  // Deep-link states for review: #/login?state=cancelled etc.
  const st = new URLSearchParams(location.hash.split('?')[1] || '').get('state');
  if (st) showState(st);
};

// B. Dashboard
screens.home = () => {
  const me = db.currentUserId;
  const uname = (db.member(me)?.name || 'there').split(' ')[0];
  const groups = db.groups();

  if (groups.length === 0) {
    app.innerHTML = shell('home', `<div class="card empty"><img src="assets/brand/empty-receipt.svg" alt="">
      <p>No groups yet. Create a group, add friends, and split your first expense.</p>
      <a class="btn" href="#/new-group">${icon('plus')} ${esc(t('createGroup'))}</a></div>`,
      { title: esc(t('nav_home')), subtitle: `Hi ${esc(uname)} — let’s set up your first split.` });
    return;
  }
  if (!state.group || !db.group(state.group)) state.group = groups[0].id;

  // Aggregate balances across ALL of the user's groups.
  let owe = 0, owed = 0;
  const groupRows = groups.map((gr) => {
    const gm = db.groupMembers(gr.id);
    const b = computeBalances(gm, db.expenses(gr.id)).bal[me] || 0;
    if (b < 0) owe += -b; else owed += b;
    const last = db.expenses(gr.id).slice(-1)[0];
    return `<a class="expense" href="#/group/${gr.id}">
      <span class="groupmark">${esc(gr.name.slice(0, 2).toUpperCase())}</span>
      <span class="desc"><strong>${esc(gr.name)}</strong><p>${gm.length} ${esc(t('members'))} · ${last ? esc(last.desc) : '—'}</p></span>
      <span class="right"><strong class="num" style="color:${b < 0 ? 'var(--error)' : 'var(--ink)'}">${formatINR(b, { sign: b !== 0 })}</strong><p>${b < 0 ? esc(t('youOwe')) : esc(t('youAreOwed'))}</p></span></a>`;
  }).join('');

  const cards = `<div class="grid">
    <div class="card balance"><div class="row"><span class="round">${icon('arrowUpRight')}</span><span class="muted small">${esc(t('youOwe'))}</span></div>
      <div class="amount num">${formatINR(owe)}</div><div class="hint">Across ${groups.length} ${groups.length === 1 ? 'group' : 'groups'}</div></div>
    <div class="card balance highlight"><div class="row"><span class="round">${icon('arrowDownLeft')}</span><span class="muted small">${esc(t('youAreOwed'))}</span></div>
      <div class="amount num">${formatINR(owed)}</div><div class="hint">${owed > 0 ? 'Settles to you' : 'Nothing outstanding'}</div></div>
  </div>`;

  const recent = db.expenses().slice().reverse().slice(0, 5).map((e) => expenseRow(e)).join('') || `<p class="muted">${esc(t('emptyExpenses'))}</p>`;

  const action = `<div class="row"><a class="iconbtn" href="#/calc" aria-label="${esc(t('calculator'))}">${icon('calc')}</a>
    <a class="btn" href="#/add">${icon('plus')} ${esc(t('addExpense'))}</a></div>`;

  app.innerHTML = shell('home', `${cards}
    <div class="cols"><div>
      <div class="section"><h2>${esc(t('recentExpenses'))}</h2><a class="link" href="#/groups">View all ${icon('chevron')}</a></div>
      <div class="card">${recent}</div>
    </div><div>
      <div class="section"><h2>${esc(t('activeGroups'))}</h2><a class="link" href="#/new-group">${icon('plus')}</a></div>
      <div class="card">${groupRows}</div>
    </div></div>`, { title: `${esc(t('nav_home'))}`, subtitle: `Hi ${esc(uname)} — here’s where things stand.`, action });
};

function expenseRow(e) {
  const { shares } = computeShares(e);
  const mine = shares[db.currentUserId] || 0;
  const payer = e.payers[0];
  return `<a class="expense" href="#/expense/${e.id}">
    <span class="round">${icon('receipt')}</span>
    <span class="desc"><strong>${esc(e.desc)}</strong><p>${esc(t('paidBy'))} ${esc(nameOf(payer.memberId))} · ${esc(e.date || '')}</p></span>
    <span class="right"><strong class="num">${formatINR(e.amountPaise)}</strong><p>${esc(t('yourShare'))} ${formatINR(mine)}</p></span></a>`;
}

// C. Groups list
screens.groups = () => {
  const q = '';
  const rows = db.groups().map((gr) => {
    const gm = db.groupMembers(gr.id);
    const invited = gm.filter((m) => m.status === 'invited').length;
    return `<a class="expense" href="#/group/${gr.id}">
      <span class="groupmark">${esc(gr.name.slice(0, 2).toUpperCase())}</span>
      <span class="desc"><strong>${esc(gr.name)}</strong><p>${gm.length} ${esc(t('members'))}${invited ? ` · ${invited} ${esc(t('invited'))}` : ''}</p></span>
      ${icon('chevron')}</a>`;
  }).join('');
  const action = `<a class="btn" href="#/new-group">${icon('plus')} ${esc(t('createGroup'))}</a>`;
  const body = db.groups().length
    ? `<div class="card"><div class="input"><span class="row">${icon('search')} <input style="border:0;height:auto;padding:0" placeholder="Search groups" aria-label="Search"></span></div></div>
       <div class="card" style="margin-top:16px">${rows}</div>`
    : `<div class="card empty"><img src="assets/brand/empty-receipt.svg" alt=""><p>No groups yet. Create one and invite friends.</p><a class="btn" href="#/new-group">${icon('plus')} ${esc(t('createGroup'))}</a></div>`;
  app.innerHTML = shell('groups', body, { title: esc(t('nav_groups')), action });
};

// New group
screens['new-group'] = () => {
  app.innerHTML = shell('groups', `<div class="narrow"><a class="link back" href="#/groups">${icon('arrowLeft')} ${esc(t('nav_groups'))}</a>
    <form class="card form" id="ng">
      <div class="field"><label class="label">Group name</label><input id="gname" placeholder="e.g. Weekend trip" required></div>
      <div class="field"><label class="label">${esc(t('splitBetween'))} <span class="muted small">(names, comma separated — email not required)</span></label>
        <input id="gpeople" placeholder="e.g. Priya, Dev, Aarav"></div>
      <details class="field"><summary class="link">More details</summary>
        <div class="field"><label class="label">Group type</label><input placeholder="Trip, Flat, Event…"></div>
        <div class="field"><label class="label">Description</label><input placeholder="Optional"></div>
      </details>
      <div class="notice">${icon('info')}<div>Members without an account show as <strong>${esc(t('invited'))}</strong> until they join. Named participants stay separate ledger entities until claimed.</div></div>
      <button class="btn wide mt16" type="submit">${esc(t('createGroup'))}</button>
    </form></div>`, { title: esc(t('createGroup')) });
  $('#ng').onsubmit = async (ev) => {
    ev.preventDefault();
    const name = $('#gname').value.trim();
    if (!name) { $('#gname').focus(); return; }
    const people = $('#gpeople').value.split(',').map((s) => s.trim()).filter(Boolean);
    const r = await db.createGroup({ name, memberNames: people });
    toast(`${t('savedPreview')} · ${name}`);
    go(`#/group/${r.id}`);
  };
};

// D. Group detail
screens.group = (id, params) => {
  const g = db.group(id) || db.group(state.group);
  if (!g) { go('#/groups'); return; }
  state.group = g.id;
  const tab = params.get('tab') || 'expenses';
  const members = db.groupMembers(g.id);
  const { bal, paid, owed, spend } = computeBalances(members, db.expenses(g.id));

  const invitedCount = members.filter((m) => m.status === 'invited').length;
  const header = `<div class="row" style="gap:14px;margin-bottom:8px">
    <div class="avatars">${members.map((m) => avatar(m)).join('')}</div>
    <div class="small muted">${members.length} ${esc(t('members'))}${invitedCount ? ` · ${invitedCount} ${esc(t('invited'))}` : ''}</div>
    <div class="row" style="margin-left:auto;gap:14px">
      <button class="link" id="invitebtn" style="background:none;border:0;padding:0">${icon('plus')} ${esc(t('inviteFriends'))}</button>
      <a class="link" href="#/share">${icon('share')} ${esc(t('share'))}</a>
      <button class="link" id="delgroup" style="background:none;border:0;padding:0;color:var(--error)">${icon('trash')} ${esc(t('deleteGroup'))}</button></div></div>
    <div class="card stats">
      <div><div class="small muted">${esc(t('groupSpending'))}</div><div class="num">${formatINR(spend)}</div></div>
      <div><div class="small muted">${esc(t('yourShare'))}</div><div class="num">${formatINR(owed[db.currentUserId])}</div></div>
      <div><div class="small muted">${esc(t('youPaid'))}</div><div class="num">${formatINR(paid[db.currentUserId])}</div></div>
    </div>`;

  const tabs = `<div class="tabs">
    <a href="#/group/${g.id}?tab=expenses" class="${tab === 'expenses' ? 'active' : ''}">${esc(t('tab_expenses'))}</a>
    <a href="#/group/${g.id}?tab=balances" class="${tab === 'balances' ? 'active' : ''}">${esc(t('tab_balances'))}</a>
    <a href="#/group/${g.id}?tab=activity" class="${tab === 'activity' ? 'active' : ''}">${esc(t('tab_activity'))}</a></div>`;

  let body = '';
  if (tab === 'expenses') {
    body = `<div class="card">${db.expenses(g.id).slice().reverse().map(expenseRow).join('') || `<p class="muted">${esc(t('emptyExpenses'))}</p>`}</div>`;
  } else if (tab === 'balances') {
    const tx = settle(bal, db.confirmedPayments(g.id));
    body = `<div class="card">${members.map((m) => {
      const b = bal[m.id];
      const label = b === 0 ? t('settledUp') : (b < 0 ? t('owes') : t('isOwed'));
      return `<div class="expense"><span>${avatar(m)}</span><span class="desc"><strong>${esc(m.name)}</strong><p>${esc(label)}</p></span>
        <span class="right num" style="color:${b < 0 ? 'var(--error)' : (b > 0 ? 'var(--good)' : 'var(--muted)')}">${formatINR(b, { sign: b !== 0 })}</span></div>`;
    }).join('')}</div>
    <div class="section mt"><h2>Suggested settlement</h2></div>
    <div class="card">${tx.map((x) => `<div class="transfer">${avatarOf(x.from)}<span class="who"><strong style="font-size:15px">${esc(nameOf(x.from))}</strong> → <strong style="font-size:15px">${esc(nameOf(x.to))}</strong></span><span class="num">${formatINR(x.paise)}</span></div>`).join('')}
      <a class="btn wide mt16" href="#/settle">${esc(t('settleUp'))}</a></div>`;
  } else {
    body = activityList(db.activity());
  }

  const action = `<a class="btn" href="#/add">${icon('plus')} ${esc(t('addExpense'))}</a>`;
  app.innerHTML = shell('groups', `${header}${tabs}${body}`, { title: esc(g.name), subtitle: `${esc(t('netSpending'))} ${formatINR(spend)}`, action });
  const ib = $('#invitebtn'); if (ib) ib.onclick = () => openInvite(g.id);
  const dg = $('#delgroup'); if (dg) dg.onclick = () => confirmDialog(`Delete “${g.name}”?`, 'This removes the group and all its expenses. This cannot be undone.', async () => { await db.deleteGroup(g.id); state.group = null; toast('Group deleted'); go('#/groups'); });
};

// Small confirm dialog for destructive actions. Restores focus on close.
function confirmDialog(title, body, onYes) {
  state.focusReturn = document.activeElement;
  const ov = document.createElement('div');
  ov.className = 'overlay'; ov.setAttribute('role', 'dialog');
  ov.innerHTML = `<div class="dialog"><div class="handle"></div>
    <h2>${esc(title)}</h2><p class="muted mt8">${esc(body)}</p>
    <div class="row" style="gap:10px;margin-top:20px"><button class="btn secondary" data-no style="flex:1">Cancel</button>
      <button class="btn" data-yes style="flex:1;background:var(--error);color:#fff">${esc(t('delete'))}</button></div></div>`;
  document.body.appendChild(ov);
  const close = () => { ov.remove(); state.focusReturn && state.focusReturn.focus && state.focusReturn.focus(); };
  ov.querySelector('[data-no]').onclick = close;
  ov.onclick = (e) => { if (e.target === ov) close(); };
  ov.querySelector('[data-yes]').onclick = async () => { close(); await onYes(); };
  ov.querySelector('[data-yes]').focus();
}

// Invite friends dialog: add by name/email, or copy a shareable invite link.
function openInvite(gid) {
  state.focusReturn = document.activeElement;
  const members = db.groupMembers(gid);
  const link = db.createInviteLink(gid);
  const ov = document.createElement('div');
  ov.className = 'overlay'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-label', t('inviteFriends'));
  ov.innerHTML = `<div class="dialog"><div class="handle"></div>
    <div class="row between"><h2>${esc(t('inviteFriends'))}</h2><button class="iconbtn" data-x aria-label="Close">${icon('x')}</button></div>
    <div class="field"><label class="label">${esc(t('addByName'))} <span class="muted small">(one per line — email optional: Name &lt;email&gt;)</span></label>
      <textarea class="input" id="invnames" rows="3" style="height:auto;padding:12px" placeholder="Priya\nDev &lt;dev@example.com&gt;"></textarea></div>
    <button class="btn wide" data-send>${esc(t('sendInvites'))}</button>
    <div class="rule"></div>
    <label class="label">${esc(t('inviteLink'))}</label>
    <div class="input"><span class="small num" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(link)}</span>
      <button class="link" data-copy>${icon('copy')} ${esc(t('copyLink'))}</button></div>
    <div class="channels" style="margin:16px 0">
      <button class="channel" data-share="whatsapp"><span>${icon('send')}</span>WhatsApp</button>
      <button class="channel" data-share="email"><span>${icon('mail')}</span>Email</button>
      <button class="channel" data-share="more"><span>${icon('share')}</span>${esc(t('moreApps'))}</button>
    </div>
    <p class="fine">Anyone can open this link — they can join with Google or use it without an account. Invited friends show as “${esc(t('invited'))}” until they join.</p>
    <div class="rule"></div>
    <div class="small muted">${members.map((m) => `<span class="pill" style="margin:2px">${esc(m.name)} · ${esc(m.status === 'joined' ? t('joined') : t('invited'))}</span>`).join('')}</div>
    </div>`;
  document.body.appendChild(ov);
  const close = () => { ov.remove(); state.focusReturn && state.focusReturn.focus && state.focusReturn.focus(); };
  const key = (e) => { if (e.key === 'Escape') { document.removeEventListener('keydown', key); close(); } };
  document.addEventListener('keydown', key);
  ov.querySelector('[data-x]').onclick = () => { document.removeEventListener('keydown', key); close(); };
  ov.onclick = (e) => { if (e.target === ov) { document.removeEventListener('keydown', key); close(); } };
  ov.querySelector('[data-copy]').onclick = async () => { (await Share.copyText(link)) ? toast('Link copied') : toast('Copy unavailable'); };
  const gname = db.group(gid)?.name || 'our group';
  const inviteMsg = `Join “${gname}” on SBDP to split and settle our expenses:\n${link}`;
  $$('[data-share]', ov).forEach((btn) => btn.onclick = async () => {
    const k = btn.dataset.share;
    if (k === 'whatsapp') window.open(Share.whatsappUrl(inviteMsg), '_blank');
    else if (k === 'email') window.open(Share.emailUrl(`Join ${gname} on SBDP`, inviteMsg), '_blank');
    else {
      const r = await Share.nativeShare({ title: `Join ${gname} on SBDP`, text: inviteMsg, url: link });
      if (r === 'unsupported') { (await Share.copyText(link)) ? toast('Link copied — paste it anywhere') : toast('Copy unavailable'); }
    }
  });
  ov.querySelector('[data-send]').onclick = async () => {
    const entries = $('#invnames', ov).value.split('\n').map((s) => s.trim()).filter(Boolean).map((line) => {
      const m = line.match(/^(.*?)\s*<([^>]+)>\s*$/);
      return m ? { name: m[1].trim() || m[2], email: m[2] } : { name: line };
    });
    if (!entries.length) { $('#invnames', ov).focus(); return; }
    const r = await db.inviteMembers(gid, entries);
    document.removeEventListener('keydown', key); close();
    toast(`${entries.length} ${entries.length === 1 ? 'friend' : 'friends'} ${t('invited').toLowerCase()}`);
    screens.group(gid, new URLSearchParams());
  };
  $('#invnames', ov).focus();
}

function activityList(items) {
  const label = { expense_added: 'added', expense_changed: 'edited', payment_reported: 'reported', receipt_confirmed: 'confirmed', group_created: 'created' };
  return `<div class="card">${items.map((a) => `<div class="expense"><span>${avatarOf(a.actor)}</span>
    <span class="desc"><strong>${esc(nameOf(a.actor))}</strong> <span class="muted">${esc(a.text)}</span><p>${esc(new Date(a.ts).toLocaleString('en-IN'))}</p></span>
    ${a.amount ? `<span class="right num">${formatINR(a.amount)}</span>` : ''}</div>`).join('')}</div>`;
}

// E. Add expense (with split modes + calculator)
const draft = { groupId: null, amountPaise: 0, desc: '', payers: [{ memberId: 'me', paise: 0 }], participants: [], split: { mode: 'equal' } };
function resetDraftFor(gid) {
  draft.groupId = gid; draft.amountPaise = 0; draft.desc = ''; draft.split = { mode: 'equal' };
  draft.payers = [{ memberId: db.currentUserId, paise: 0 }];
  draft.participants = db.groupMembers(gid).map((m) => m.id);
}
screens.add = () => {
  const groups = db.groups();
  if (!groups.length) { toast('Create a group first'); go('#/new-group'); return; }
  if (!state.group || !db.group(state.group)) state.group = groups[0].id;
  if (draft.groupId !== state.group) resetDraftFor(state.group);
  renderAdd(draft);
};
function renderAdd(d) {
  const members = db.groupMembers(state.group);
  const groups = db.groups();
  const groupPicker = groups.length > 1
    ? `<div class="field"><label class="label">Group</label><select id="grpsel" class="input" style="display:block">${groups.map((gr) => `<option value="${gr.id}" ${gr.id === state.group ? 'selected' : ''}>${esc(gr.name)}</option>`).join('')}</select></div>`
    : '';
  const modes = [['equal', 'split_equal'], ['exact', 'split_exact'], ['percent', 'split_percent'], ['shares', 'split_shares'], ['equalExtra', 'split_extra']];
  const seg = `<div class="segments" id="modes">${modes.map(([m, k]) => `<a data-mode="${m}" class="${d.split.mode === m ? 'active' : ''}" href="#!">${esc(t(k))}</a>`).join('')}</div>`;

  const chips = members.map((m) => {
    const on = d.participants.includes(m.id);
    return `<button type="button" class="chip" data-part="${m.id}" aria-pressed="${on}" style="${on ? '' : 'opacity:.45'}">${avatar(m)}${esc(m.name)}</button>`;
  }).join('');

  app.innerHTML = shell('home', `<div class="narrow"><a class="link back" href="#/group/${state.group}">${icon('arrowLeft')} Cancel</a>
    <form class="card form" id="addf">
      <div class="amount-field"><span>₹</span><input id="amt" inputmode="decimal" placeholder="0" value="${d.amountPaise ? (d.amountPaise / 100) : ''}" aria-label="${esc(t('amount'))}">
        <button type="button" class="iconbtn" id="calcbtn" aria-label="${esc(t('calculator'))}">${icon('calc')}</button></div>
      <div class="field"><label class="label">${esc(t('description'))}</label><input id="desc" value="${esc(d.desc)}" placeholder="What was this for?"></div>
      ${groupPicker}
      <div class="field"><label class="label">${esc(t('paidBy'))}</label>
        <select id="paidby" class="input" style="display:block">${members.map((m) => `<option value="${m.id}" ${d.payers[0].memberId === m.id ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</select>
        <div class="small muted mt8">Multiple payers and subset selection work independently.</div></div>
      <div class="field"><label class="label">${esc(t('splitBetween'))}</label><div class="chips">${chips}</div></div>
      <div class="field">${seg}</div>
      <div id="splitcfg"></div>
      <div class="preview" id="preview"></div>
      <div class="tools"><span class="muted small">Add a receipt or voice note after saving.</span></div>
      <button class="btn wide" type="submit">${esc(t('save'))}</button>
    </form></div>`, { title: esc(t('addExpense')) });

  const amt = $('#amt');
  const updateAmount = () => { d.amountPaise = toPaise(roundToPaise(parseFloat(amt.value) || 0)); renderCfg(); };
  amt.oninput = updateAmount;
  $('#desc').oninput = (e) => (d.desc = e.target.value);
  $('#paidby').onchange = (e) => (d.payers = [{ memberId: e.target.value, paise: d.amountPaise }]);
  $('#calcbtn').onclick = () => openCalc((val) => { amt.value = val; updateAmount(); });
  const gs = $('#grpsel'); if (gs) gs.onchange = (e) => { state.group = e.target.value; resetDraftFor(state.group); renderAdd(draft); };

  $$('#modes a').forEach((a) => a.onclick = (ev) => { ev.preventDefault(); d.split = { mode: a.dataset.mode }; renderAdd(d); });
  $$('[data-part]').forEach((b) => b.onclick = () => {
    const id = b.dataset.part;
    if (d.participants.includes(id)) d.participants = d.participants.filter((x) => x !== id);
    else d.participants.push(id);
    renderAdd(d);
  });

  function renderCfg() {
    const cfg = $('#splitcfg');
    const ids = d.participants;
    const m = d.split.mode;
    let html = '';
    if (m === 'exact') { d.split.amounts = d.split.amounts || {}; html = ids.map((id) => rowInput(id, 'amounts', '₹')).join(''); }
    else if (m === 'percent') { d.split.percents = d.split.percents || {}; html = ids.map((id) => rowInput(id, 'percents', '%')).join(''); }
    else if (m === 'shares') { d.split.shares = d.split.shares || {}; html = ids.map((id) => rowInput(id, 'shares', '×')).join(''); }
    else if (m === 'equalExtra') { d.split.extras = d.split.extras || {}; html = ids.map((id) => rowInput(id, 'extras', '+₹')).join(''); }
    cfg.innerHTML = html;
    $$('[data-cfg]', cfg).forEach((inp) => inp.oninput = () => {
      const { cfg: field, id } = inp.dataset;
      const v = parseFloat(inp.value) || 0;
      if (field === 'amounts' || field === 'extras') d.split[field][id] = toPaise(v);
      else d.split[field][id] = v;
      renderPreview();
    });
    renderPreview();
  }
  function rowInput(id, field, unit) {
    const m = db.member(id);
    const raw = d.split[field]?.[id];
    const val = (field === 'amounts' || field === 'extras') ? (raw ? raw / 100 : '') : (raw || '');
    return `<div class="split"><span class="row">${avatar(m)} ${esc(m.name)}</span>
      <span class="row" style="gap:4px"><span class="muted small">${unit}</span><input data-cfg="${field}" data-id="${id}" value="${val}" inputmode="decimal" style="width:90px;height:38px;text-align:right"></span></div>`;
  }
  function renderPreview() {
    const exp = { amountPaise: d.amountPaise, participants: d.participants, split: d.split };
    const { shares, unallocated } = computeShares(exp);
    const rows = d.participants.map((id) => `<div class="split"><span class="row">${avatarOf(id)} ${esc(nameOf(id))}</span><span class="num">${formatINR(shares[id] || 0)}</span></div>`).join('');
    let note = '';
    if (unallocated !== 0) {
      const kind = unallocated > 0 ? t('unallocated') : t('excess');
      note = `<div class="split" style="border-top:1px solid var(--border);color:${unallocated > 0 ? 'var(--warning,#8a4b00)' : 'var(--error)'}"><strong>${esc(kind)}</strong><strong class="num">${formatINR(Math.abs(unallocated))}</strong></div>`;
    }
    $('#preview').innerHTML = `<div class="small muted" style="margin-bottom:6px">Split preview</div>${rows}${note}`;
  }
  renderCfg();

  $('#addf').onsubmit = async (ev) => {
    ev.preventDefault();
    if (d.amountPaise <= 0) { toast(t('validation_amount')); amt.focus(); return; }
    d.payers = [{ memberId: $('#paidby').value, paise: d.amountPaise }];
    if (!d.participants.length) { toast('Pick at least one person'); return; }
    d.payers = [{ memberId: $('#paidby').value, paise: d.amountPaise }];
    const clientId = 'c_' + Date.now();
    await db.saveExpense({ groupId: state.group, desc: d.desc, amountPaise: d.amountPaise, payers: d.payers, participants: d.participants, split: d.split, date: new Date().toISOString().slice(0, 10) }, clientId);
    toast(Auth.isSignedIn() ? 'Saved' : (db.localMode ? t('saved') : t('savedPreview')));
    draft.groupId = null; // force a fresh draft next time
    go(`#/group/${state.group}?tab=expenses`);
  };
}

// F. Calculator (route + modal)
screens.calc = () => { screens.home(); openCalc((val) => { toast(`Result ${val} — open Add expense to use it`); }); };
function openCalc(onUse) {
  state.focusReturn = document.activeElement;
  let expr = '(850 + 650) / 2';
  const ov = document.createElement('div');
  ov.className = 'overlay'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-label', t('calculator'));
  const keys = ['(', ')', '%', 'C', '7', '8', '9', '/', '4', '5', '6', '*', '1', '2', '3', '-', '0', '.', '⌫', '+'];
  ov.innerHTML = `<div class="dialog"><div class="handle"></div>
    <div class="row between"><h2>${esc(t('calculator'))}</h2><button class="iconbtn" id="cx" aria-label="Close">${icon('x')}</button></div>
    <div class="display"><div class="small muted" id="expr"></div><div class="num" id="res">0</div></div>
    <div class="row" style="gap:8px;margin-bottom:8px"><button class="btn secondary" style="flex:1" data-ins="*1.05">+5% tax</button><button class="btn secondary" style="flex:1" data-ins="*1.1">+10% tip</button><button class="btn secondary" style="flex:1" data-ins="*0.9">−10%</button></div>
    <div class="keypad">${keys.map((k) => `<button class="key ${k === '=' ? 'equal' : ''}" data-k="${esc(k)}">${esc(k)}</button>`).join('')}
      <button class="key equal" data-k="=" style="grid-column:span 4">= ${esc(t('useResult'))} ₹</button></div>
    <p class="fine mt8">Percent divides by 100. Keyboard supported.</p></div>`;
  document.body.appendChild(ov);
  const exprEl = $('#expr', ov), resEl = $('#res', ov);
  const refresh = () => {
    exprEl.textContent = expr || '0';
    const r = evaluate(expr);
    resEl.textContent = r.ok ? String(roundToPaise(r.value)) : r.error;
    resEl.style.color = r.ok ? '' : 'var(--error)';
    return r;
  };
  const press = (k) => {
    if (k === 'C') expr = '';
    else if (k === '⌫') expr = expr.slice(0, -1);
    else if (k === '=') { const r = refresh(); if (r.ok) { onUse(roundToPaise(r.value)); close(); } return; }
    else expr += k;
    refresh();
  };
  $$('[data-k]', ov).forEach((b) => b.onclick = () => press(b.dataset.k));
  $$('[data-ins]', ov).forEach((b) => b.onclick = () => { expr = `(${expr || '0'})${b.dataset.ins}`; refresh(); });
  const key = (e) => {
    if (e.key === 'Escape') return close();
    if (e.key === 'Enter' || e.key === '=') { e.preventDefault(); return press('='); }
    if (e.key === 'Backspace') { e.preventDefault(); return press('⌫'); }
    if (/[0-9+\-*/().%]/.test(e.key)) { expr += e.key; refresh(); }
  };
  document.addEventListener('keydown', key);
  const close = () => { document.removeEventListener('keydown', key); ov.remove(); state.focusReturn && state.focusReturn.focus && state.focusReturn.focus(); };
  $('#cx', ov).onclick = close;
  ov.onclick = (e) => { if (e.target === ov) close(); };
  refresh();
  $('#cx', ov).focus();
}

// G. Expense detail + voice note
screens.expense = (id) => {
  const e = db.expense(id);
  if (!e) { go(state.group ? `#/group/${state.group}` : '#/home'); return; }
  const { shares } = computeShares(e);
  const contrib = e.payers.map((p) => `<div class="split"><span class="row">${avatarOf(p.memberId)} ${esc(nameOf(p.memberId))} <span class="muted small">${esc(t('paidBy')).toLowerCase()}</span></span><span class="num">${formatINR(p.paise)}</span></div>`).join('');
  const partRows = e.participants.map((pid) => `<div class="split"><span class="row">${avatarOf(pid)} ${esc(nameOf(pid))}</span><span class="num">${formatINR(shares[pid] || 0)}</span></div>`).join('');

  app.innerHTML = shell('home', `<div class="narrow"><a class="link back" href="#/group/${e.groupId || state.group}">${icon('arrowLeft')} ${esc(db.group(e.groupId || state.group)?.name || '')}</a>
    <div class="hero"><div class="small muted">${esc(e.desc)}</div><div class="amount num">${formatINR(e.amountPaise)}</div>
      <div class="small muted">${esc(t('paidBy'))} ${esc(nameOf(e.payers[0].memberId))} · ${esc(e.date || '')}</div></div>
    <div class="card"><div class="small muted" style="margin-bottom:6px">Payer contributions</div>${contrib}
      <div class="rule"></div><div class="small muted" style="margin-bottom:6px">Participant shares</div>${partRows}</div>

    <div class="section mt"><h2>${esc(t('voiceNote'))}</h2></div>
    <div class="card" id="voice"></div>

    <div class="card mt16"><div class="small muted">Edit history</div>
      <div class="expense" style="border:0"><span>${avatarOf(e.payers[0].memberId)}</span><span class="desc"><strong>Created</strong><p>Revision ${e.rev || 1}</p></span></div></div>

    <button class="btn secondary wide mt16" id="delexp" style="color:var(--error)">${icon('trash')} ${esc(t('deleteExpense'))}</button>
    </div>`, { title: '' });
  mountVoice($('#voice'));
  const de = $('#delexp'); if (de) de.onclick = () => confirmDialog(`Delete “${e.desc}”?`, 'This removes the expense from the group ledger.', async () => { await db.deleteExpense(e.id); toast('Expense deleted'); go(`#/group/${e.groupId || state.group}?tab=expenses`); });
};

function mountVoice(el) {
  const rec = new Recorder();
  state.recorder = rec;
  const supported = audioSupported();
  const draw = () => {
    if (!supported) {
      el.innerHTML = `<div class="notice">${icon('info')}<div>Recording isn’t supported in this browser. Add a <strong>${esc(t('typedNote'))}</strong> instead.</div></div>
        <div class="field"><textarea class="input" style="height:auto;padding:12px" placeholder="Type the note…" rows="3"></textarea></div>`;
      return;
    }
    if (rec.state === 'idle') {
      el.innerHTML = `<div class="row between"><div class="small muted">No audio yet — up to 2:00. Mic permission is asked only when you press Record.</div>
        <button class="btn" id="rec">${icon('mic')} ${esc(t('record'))}</button></div>
        <details class="mt16"><summary class="link">${esc(t('typedNote'))} instead</summary><div class="field"><textarea class="input" style="height:auto;padding:12px" rows="3" placeholder="Type the note…"></textarea></div></details>`;
      $('#rec', el).onclick = async () => { const r = await rec.start(); if (!r.ok) draw(); };
    } else if (rec.state === 'recording') {
      el.innerHTML = `<div class="audio"><button class="play" id="stop" aria-label="${esc(t('stop'))}">${icon('pause')}</button>
        <div class="wave">${Array.from({ length: 40 }, () => '<i style="height:' + (6 + Math.random() * 24) + 'px"></i>').join('')}</div>
        <span class="num" id="tmr">0:00</span></div><div class="small muted">Recording… press stop to finish.</div>`;
      rec.onTick = (ms) => { const t2 = $('#tmr', el); if (t2) t2.textContent = fmtTime(ms); };
      $('#stop', el).onclick = () => rec.stop();
    } else if (rec.state === 'recorded') {
      el.innerHTML = `<div class="audio"><button class="play" id="pp" aria-label="${esc(t('play'))}">${icon('play')}</button>
        <input type="range" id="seek" min="0" max="100" value="0" style="flex:1"><span class="num" id="pos">0:00</span></div>
        <audio id="au" src="${rec.url}" preload="metadata"></audio>
        <div class="row" style="gap:10px;margin-top:12px"><button class="btn secondary" id="disc">${esc(t('discard'))}</button><button class="btn" id="att">${esc(t('attach'))}</button></div>`;
      const au = $('#au', el), pp = $('#pp', el), seek = $('#seek', el), pos = $('#pos', el);
      pp.onclick = () => { if (au.paused) { au.play(); pp.innerHTML = icon('pause'); } else { au.pause(); pp.innerHTML = icon('play'); } };
      au.ontimeupdate = () => { if (au.duration) { seek.value = (au.currentTime / au.duration) * 100; pos.textContent = fmtTime(au.currentTime * 1000); } };
      au.onended = () => { pp.innerHTML = icon('play'); };
      seek.oninput = () => { if (au.duration) au.currentTime = (seek.value / 100) * au.duration; };
      $('#disc', el).onclick = () => { rec.discard(); draw(); };
      $('#att', el).onclick = () => { toast(db.mode === 'preview' ? t('savedPreview') : 'Attached'); };
    } else {
      const msg = { denied: t('micDenied'), unsupported: 'Recording not supported', error: 'Recording failed' }[rec.state];
      el.innerHTML = `<div class="notice">${icon('info')}<div>${esc(msg)}. Use a <strong>${esc(t('typedNote'))}</strong>.</div></div>
        <button class="btn secondary mt16" id="retry">${esc(t('record'))}</button>`;
      $('#retry', el) && ($('#retry', el).onclick = () => { rec.state = 'idle'; draw(); });
    }
  };
  rec.onState = draw;
  draw();
}

// H. Share preview
screens.share = () => {
  const g = db.group(state.group) || db.groups()[0];
  if (!g) { go('#/home'); return; }
  state.group = g.id;
  const members = db.groupMembers(g.id);
  const { bal, spend } = computeBalances(members, db.expenses(g.id));
  const tx = settle(bal);
  const stmt = Share.buildStatement({
    title: `${g.name} — SBDP statement`,
    lines: [`Group spending: ${formatINR(spend)}`, ...members.map((m) => `${m.name}: ${formatINR(bal[m.id], { sign: bal[m.id] !== 0 })}`), '', 'Settle up:', ...tx.map((x) => `${nameOf(x.from)} → ${nameOf(x.to)}: ${formatINR(x.paise)}`)],
    footer: `Created using SBDP\n${Share.appUrl()}`,
  });

  const channels = [['moreApps', 'share'], ['whatsapp', 'send'], ['telegram', 'send'], ['email', 'mail'], ['copyText', 'copy'], ['copyLink', 'link']];
  app.innerHTML = shell('groups', `<div class="narrow">
    <div class="segments" style="max-width:420px"><a class="active" href="#!">Group statement</a><a href="#!">Personal</a><a href="#!">Invitation</a></div>
    <div class="card mt16"><div class="small muted">Readable preview</div><pre style="white-space:pre-wrap;font:13px/1.6 var(--body);margin-top:10px">${esc(stmt)}</pre></div>
    <div class="notice">${icon('info')}<div>${esc(t('linkWarn'))}. Snapshot links expire in 7 days and can be revoked. Audio and receipts are excluded unless selected.</div></div>
    <div class="channels">${channels.map(([k, ic]) => `<button class="channel" data-ch="${k}"><span>${icon(ic)}</span>${esc(t(k) || k)}</button>`).join('')}</div>
    </div>`, { title: esc(t('share')) });

  $$('[data-ch]').forEach((b) => b.onclick = async () => {
    const k = b.dataset.ch;
    if (k === 'copyText') { (await Share.copyText(stmt)) ? toast('Copied text') : toast('Copy unavailable'); }
    else if (k === 'copyLink') { const link = location.origin + location.pathname + '#/share?snap=demo'; (await Share.copyText(link)) ? toast('Link copied') : toast('Copy unavailable'); }
    else if (k === 'whatsapp') window.open(Share.whatsappUrl(stmt), '_blank');
    else if (k === 'telegram') window.open(Share.telegramUrl(stmt), '_blank');
    else if (k === 'email') window.open(Share.emailUrl(`${g.name} — SBDP`, stmt), '_blank');
    else {
      const r = await Share.nativeShare({ title: `${g.name} — SBDP`, text: stmt });
      if (r === 'cancelled') { /* silent — not an error */ }
      else if (r === 'unsupported') toast('Native share unavailable — use a channel below');
    }
  });
};

// I. Settle up (pre / post confirmation states)
screens.settle = (arg, params) => {
  const g = db.group(state.group) || db.groups()[0];
  if (!g) { go('#/home'); return; }
  state.group = g.id;
  const members = db.groupMembers(g.id);
  const post = params.get('state') === 'post';
  const base = computeBalances(members, db.expenses(g.id)).bal;
  const proposed = db.proposedPayments(g.id)[0];
  const confirmedList = post && proposed ? [{ from: proposed.from, to: proposed.to, paise: proposed.paise }] : [];
  const tx = settle(base, confirmedList);

  const meera = proposed;
  const statusChip = post
    ? `<span class="pill yellow">${icon('check')} ${esc(t('confirmedReceived'))}</span>`
    : `<span class="pill">${esc(t('reportedSent'))}</span>`;

  app.innerHTML = shell('groups', `<div class="narrow"><a class="link back" href="#/group/${g.id}?tab=balances">${icon('arrowLeft')} ${esc(t('tab_balances'))}</a>
    <div class="card">${tx.map((x) => `<div class="transfer">${avatarOf(x.from)}<span class="who"><strong>${esc(nameOf(x.from))}</strong> → <strong>${esc(nameOf(x.to))}</strong></span>
      <span class="num">${formatINR(x.paise)}</span><a class="btn secondary" href="#!" data-pay="${x.from}">${esc(t('recordPayment'))}</a></div>`).join('')}
    </div>
    <details class="notice" style="cursor:pointer"><summary>How is this calculated?</summary>
      <div class="mt8">Everyone’s share is ${formatINR(computeBalances(members, db.expenses(g.id)).owed[db.currentUserId])}. We net each person’s paid vs. owed, then match debtors to creditors with the fewest transfers.</div></details>

    ${meera ? `<div class="section mt"><h2>Reported payment</h2></div>
    <div class="card"><div class="transfer">${avatarOf(meera.from)}<span class="who"><strong>${esc(nameOf(meera.from))}</strong> → <strong>${esc(nameOf(meera.to))}</strong><p class="small muted">${statusChip}</p></span>
      <span class="num">${formatINR(meera.paise)}</span></div>
      ${post ? `<div class="notice">${icon('check')}<div>Confirmed. Sam is now owed ${formatINR(settle(base, confirmedList).filter(x=>x.to===db.currentUserId).reduce((s,x)=>s+x.paise,0))}. ${esc(nameOf(meera.from))} owes ${formatINR(-(base[meera.from]+meera.paise))} — ${esc(t('remaining'))}.</div></div>`
      : `<div class="notice">${icon('info')}<div>${esc(nameOf(meera.from))} reported this. Until Sam confirms, the authoritative balance is unchanged. Opening a payment app does not confirm receipt.</div>
         <div class="row mt16" style="gap:10px"><a class="btn" href="#/settle?state=post" id="confirm">${esc(t('confirmedReceived'))}</a><button class="btn secondary">Not yet</button></div>`}
    </div>` : ''}

    <div class="segments mt16" style="max-width:320px"><a class="${!post ? 'active' : ''}" href="#/settle">Before confirm</a><a class="${post ? 'active' : ''}" href="#/settle?state=post">After confirm</a></div>
    </div>`, { title: esc(t('settleUp')) });

  $$('[data-pay]').forEach((b) => b.onclick = (e) => { e.preventDefault(); toast('Opening payment — this does not mark it received.'); });
};

// J. Activity + states
screens.activity = () => {
  app.innerHTML = shell('activity', activityList(db.activity()), { title: esc(t('nav_activity')), subtitle: 'Who did what, and when.' });
};
screens.empty = () => {
  app.innerHTML = shell('home', `<div class="card empty"><img src="assets/brand/empty-receipt.svg" alt="">
    <p>${esc(t('emptyExpenses'))}. ${esc(t('emptyHint'))}</p><a class="btn" href="#/add">${icon('plus')} ${esc(t('addExpense'))}</a></div>`, { title: esc(t('nav_home')) });
};

// K. Settings + language
screens.settings = () => {
  const mode = getThemeMode();
  const seg = (v, label) => `<a data-theme-set="${v}" href="#!" class="${mode === v ? 'active' : ''}">${esc(t(label))}</a>`;
  const u = Auth.currentUser();
  const profile = u
    ? `<div class="row">${u.avatar ? `<img src="${esc(u.avatar)}" width="40" height="40" style="border-radius:50%" alt="">` : `<span class="avatar you">${esc((u.name || '?').slice(0, 2).toUpperCase())}</span>`}<div><strong>${esc(u.name)}</strong><div class="small muted">${esc(u.email || '')}</div></div></div>`
    : `<div class="row">${avatarOf(db.currentUserId)}<div><strong>Sam</strong><div class="small muted">${db.localMode ? 'No account · on this device' : esc(t('reviewMode'))}</div></div></div>`;
  const signedIn = Auth.isSignedIn();
  app.innerHTML = shell('settings', `<div class="narrow">
    <div class="card">${profile}</div>
    <div class="card mt16"><div class="setting"><span>${esc(t('language'))}</span><a class="link" href="#/language">${esc(LANGS.find((l) => l.code === getLang()).native)} ${icon('chevron')}</a></div>
      <div class="setting"><span>${esc(t('theme'))}</span><div class="segments" style="width:auto">${seg('light', 'light')}${seg('dark', 'dark')}${seg('system', 'system')}</div></div>
      <div class="setting"><span>${esc(t('notifications'))}</span><input type="checkbox" checked style="width:auto;height:auto"></div>
    </div>
    <div class="card mt16">
      <div class="setting"><span>${esc(t('saveSession'))}<div class="small muted">Download a .md copy — works offline, no account needed</div></span><button class="link" data-act="save">${icon('arrowUpRight')} .md</button></div>
      <div class="setting"><span>${esc(t('restoreSession'))}<div class="small muted">Load a previously saved .md session</div></span><label class="link" style="cursor:pointer">${icon('receipt')} Choose file<input type="file" id="restore" accept=".md,text/markdown" hidden></label></div>
    </div>
    ${signedIn
      ? `<button class="btn secondary wide mt16" id="signout">${icon('logout')} ${esc(t('signOut'))}</button>`
      : `<button class="btn secondary wide mt16" onclick="location.hash='#/login'">${icon('logout')} ${esc(t('createAccount'))}</button>`}
  </div>`, { title: esc(t('nav_settings')) });
  $$('[data-theme-set]').forEach((a) => a.onclick = (e) => { e.preventDefault(); applyTheme(a.dataset.themeSet); screens.settings(); });
  const so = $('#signout'); if (so) so.onclick = async () => { await Auth.signOut(); go('#/login'); };
  const rf = $('#restore'); if (rf) rf.onchange = async (e) => {
    const file = e.target.files && e.target.files[0]; if (!file) return;
    try { const st = await Local.fromMarkdownFile(file); db.enableLocal(st); state.noAccount = true; toast('Session restored'); go('#/home'); }
    catch (err) { toast(err.message || 'Could not read that file'); }
  };
};

screens.language = () => {
  const cur = getLang();
  app.innerHTML = shell('settings', `<div class="narrow"><a class="link back" href="#/settings">${icon('arrowLeft')} ${esc(t('nav_settings'))}</a>
    <div class="langs">${LANGS.map((l) => `<button class="lang ${l.code === cur ? 'selected' : ''}" data-lang="${l.code}">${esc(l.native)}${l.code === cur ? icon('check') : ''}</button>`).join('')}</div>
    <div class="notice">${icon('info')}<div>Switching updates UI copy, validation and share templates. Names, descriptions and currency don’t change. Non-English copy is marked for native review.</div></div>
    ${needsReview(cur) ? `<div class="pill" style="border-color:var(--accent)">${esc(t('reviewMode'))}: needs native-language review</div>` : ''}
    </div>`, { title: esc(t('language')) });
  $$('[data-lang]').forEach((b) => b.onclick = () => { setLang(b.dataset.lang); document.documentElement.lang = b.dataset.lang; screens.language(); });
};

// Invite-link landing.
screens.join = (params) => {
  const gid = params.get('g');
  const g = db.group(gid);
  const name = g ? g.name : 'a group';
  app.innerHTML = `<div class="login"><div class="login-left">${lockup(true)}
    <div class="login-copy"><h1>You’re invited to ${esc(name)}</h1>
      <p>Join to see who paid what and settle up. Sign in with Google, or continue on this device without an account.</p>
      ${Auth.configured() ? `<button class="btn google" id="gbtn"><img src="assets/google-g.png" alt="">${esc(t('continueGoogle'))}</button>` : ''}
      <button class="btn ${Auth.configured() ? 'secondary' : ''} wide" id="joinlocal" style="margin-top:12px">${g ? 'Open ' + esc(name) : esc(t('useWithoutAccount'))}</button>
      <p class="fine mt16">${g ? '' : 'This invite link isn’t recognised on this device — the group lives where it was created.'}</p>
    </div></div><div class="login-right">${lockup(false)}</div></div>`;
  const gb = $('#gbtn'); if (gb) gb.onclick = async () => { try { await Auth.signInWithGoogle('#/group/' + gid); } catch {} };
  $('#joinlocal').onclick = () => { db.enableLocal(Local.loadLocal()); state.noAccount = true; go(g ? '#/group/' + gid : '#/home'); };
};

// Review gallery (prototype tool — outside product UI)
screens.gallery = () => {
  const items = [
    ['Login', '#/login'], ['Login · cancelled', '#/login?state=cancelled'], ['Login · failed', '#/login?state=failed'], ['Login · expired', '#/login?state=expired'],
    ['Dashboard', '#/home'], ['Groups', '#/groups'], ['Create group', '#/new-group'],
    ['Group · Expenses', '#/group/g_goa?tab=expenses'], ['Group · Balances', '#/group/g_goa?tab=balances'], ['Group · Activity', '#/group/g_goa?tab=activity'],
    ['Add expense', '#/add'], ['Expense detail + voice', '#/expense/e_stay'],
    ['Share preview', '#/share'], ['Settle · before confirm', '#/settle'], ['Settle · after confirm', '#/settle?state=post'],
    ['Activity', '#/activity'], ['Empty state', '#/empty'], ['Settings', '#/settings'], ['Language', '#/language'],
  ];
  const langShots = [['Bengali dashboard', 'bn', '#/home'], ['Hindi expense form', 'hi', '#/add'], ['Tamil group', 'ta', '#/group/g_goa'], ['Malayalam settle', 'ml', '#/settle']];
  app.innerHTML = `<div class="gallery">${lockup(true)}
    <div class="title mt"><div><h1>Prototype gallery</h1><p class="muted">Review tool — not part of the product UI. ${reviewBadge()}</p></div>
      <div class="row"><button class="btn secondary" id="tg">Toggle theme</button></div></div>
    <div class="gallery-grid">${items.map(([n, h]) => `<a class="gallery-item" href="${h}"><div class="round">${icon('arrowUpRight')}</div><h3>${esc(n)}</h3><div class="review">${esc(h)}</div></a>`).join('')}</div>
    <div class="section mt"><h2>Translated states</h2></div>
    <div class="gallery-grid">${langShots.map(([n, code, h]) => `<a class="gallery-item" href="${h}" data-set-lang="${code}"><div class="round">${icon('globe')}</div><h3>${esc(n)}</h3><div class="review">lang=${code} · ${esc(h)}</div></a>`).join('')}</div>
    </div>`;
  $('#tg').onclick = () => applyTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
  $$('[data-set-lang]').forEach((a) => a.onclick = () => { setLang(a.dataset.setLang); document.documentElement.lang = a.dataset.setLang; });
};

// ---- router ----------------------------------------------------------------
function router() {
  const raw = location.hash.replace(/^#/, '') || '/login';
  const [path, qs] = raw.split('?');
  const params = new URLSearchParams(qs || '');
  const parts = path.split('/').filter(Boolean); // e.g. ['group','g_goa']
  const name = parts[0] || 'login';
  const arg = parts[1];
  window.scrollTo(0, 0);
  // Auth gate: when real backend is configured, product routes require a session
  // unless the user explicitly chose no-account/local mode.
  const publicRoutes = new Set(['login', 'language', 'gallery', 'join']);
  if (Auth.configured() && !Auth.isSignedIn() && !db.localMode && !publicRoutes.has(name)) {
    state.afterLogin = location.hash; return screens.login(params);
  }
  try {
    if (name === 'group') screens.group(arg, params);
    else if (name === 'expense') screens.expense(arg, params);
    else if (name === 'settle') screens.settle(arg, params);
    else if (name === 'login') screens.login(params);
    else if (screens[name]) screens[name](params);
    else screens.home();
  } catch (err) {
    console.error(err);
    app.innerHTML = shell('home', `<div class="card"><div class="notice">${icon('info')}<div>Something went wrong rendering this screen. <a class="link" href="#/home">Back to Home</a></div></div><pre class="small">${esc(err.message)}</pre></div>`, { title: 'Error' });
  }
}

// Prototype helper (used by the review gallery and QA): switch language and re-render.
window.SBDP_setLang = (c) => { setLang(c); document.documentElement.lang = c; router(); };

// Export the current session to a Markdown file the user can keep / re-import.
function saveSessionFile() {
  const md = Local.toMarkdown(db.exportState ? db.exportState() : db.state);
  const stamp = new Date().toISOString().slice(0, 10);
  const ok = Local.download(`sbdp-session-${stamp}.md`, md);
  toast(ok ? `${t('saveSession')} ✓` : 'Save unavailable in this browser');
}

// Delegated actions that live outside a single screen's own wiring.
document.addEventListener('click', (e) => {
  const act = e.target.closest && e.target.closest('[data-act]');
  if (act && act.dataset.act === 'save') { e.preventDefault(); saveSessionFile(); }
});

// Offline/online: keep working, offer to save. Never block on connectivity.
window.addEventListener('offline', () => { toast(t('offlineTitle') + ' — ' + t('offlineBody'), 4000); router(); });
window.addEventListener('online', () => router());

window.addEventListener('hashchange', router);

function applyIdentity(u) {
  const key = 'sbdp-user-' + u.id;
  db._onPersist = (s) => Local.saveLocal(s, key);
  db._persistAlways = true;
  const saved = Local.loadLocal(key);
  if (saved && Array.isArray(saved.groups)) db.importState(saved);
  db.setIdentity(u);
}

async function boot() {
  applyTheme(getThemeMode());
  document.documentElement.lang = getLang();
  if (window.matchMedia) window.matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => { if (getThemeMode() === 'system') applyTheme('system'); });
  // Establish a real session (and complete any Google OAuth redirect) before render.
  await Auth.init();
  const u = Auth.currentUser();
  if (u) {
    // Signed in: personal account persisted under this user's namespace. No banner.
    applyIdentity(u);
  } else if (Local.hasLocal()) {
    // Resume a saved no-account session on this device.
    db.enableLocal(Local.loadLocal()); state.noAccount = true;
  }
  Auth.onChange((user) => { if (user) applyIdentity(user); router(); });
  if (u && (location.hash === '' || location.hash.startsWith('#/login'))) {
    const back = Auth.takeReturn(); location.hash = back || '#/home';
  }
  router();
}

if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', boot);
else boot();
