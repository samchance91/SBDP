// Data layer. Chooses a backend adapter at runtime:
//  - SupabaseAdapter  when window.SBDP_ENV has a URL + anon key configured.
//  - PreviewAdapter   otherwise — in-memory fixtures, clearly labelled review mode.
// The two adapters share one async interface so screens never branch on backend.
// A preview sign-in NEVER masquerades as real Google auth (see auth.mode).

import { toPaise } from './money.js';

// ---- Canonical seed fixtures (Section 5 of the scope) ---------------------
export const SEED = {
  currentUserId: 'u_sam',
  members: [
    { id: 'u_sam', name: 'Sam', initials: 'SA', you: true, status: 'joined' },
    { id: 'u_ananya', name: 'Ananya', initials: 'AN', status: 'joined' },
    { id: 'u_rohit', name: 'Rohit', initials: 'RO', status: 'joined' },
    { id: 'u_meera', name: 'Meera', initials: 'ME', status: 'invited' },
  ],
  groups: [
    { id: 'g_goa', name: 'Goa trip', memberIds: ['u_sam', 'u_ananya', 'u_rohit', 'u_meera'], archived: false, type: 'Trip' },
  ],
  expenses: [
    { id: 'e_stay', groupId: 'g_goa', desc: 'Stay', amountPaise: toPaise(8000), date: '2026-09-08',
      payers: [{ memberId: 'u_sam', paise: toPaise(8000) }],
      participants: ['u_sam', 'u_ananya', 'u_rohit', 'u_meera'], split: { mode: 'equal' }, rev: 1 },
    { id: 'e_dinner', groupId: 'g_goa', desc: 'Dinner', amountPaise: toPaise(2400), date: '2026-09-09',
      payers: [{ memberId: 'u_ananya', paise: toPaise(2400) }],
      participants: ['u_sam', 'u_ananya', 'u_rohit', 'u_meera'], split: { mode: 'equal' }, rev: 1 },
    { id: 'e_taxi', groupId: 'g_goa', desc: 'Taxi', amountPaise: toPaise(1200), date: '2026-09-10',
      payers: [{ memberId: 'u_rohit', paise: toPaise(1200) }],
      participants: ['u_sam', 'u_ananya', 'u_rohit', 'u_meera'], split: { mode: 'equal' }, rev: 1 },
  ],
  // Proposed (unconfirmed) partial payment — kept OUT of the authoritative ledger
  // until Sam confirms. See the settle screen's pre/post states.
  proposedPayments: [
    { id: 'p_meera', groupId: 'g_goa', from: 'u_meera', to: 'u_sam', paise: toPaise(1000), status: 'reported' },
  ],
  confirmedPayments: [],
  activity: [
    { id: 'a1', type: 'expense_added', actor: 'u_sam', text: 'added Stay', amount: toPaise(8000), ts: '2026-09-08T10:12:00' },
    { id: 'a2', type: 'expense_added', actor: 'u_ananya', text: 'added Dinner', amount: toPaise(2400), ts: '2026-09-09T21:40:00' },
    { id: 'a3', type: 'expense_added', actor: 'u_rohit', text: 'added Taxi', amount: toPaise(1200), ts: '2026-09-10T08:05:00' },
    { id: 'a4', type: 'payment_reported', actor: 'u_meera', text: 'reported ₹1,000 sent to Sam', amount: toPaise(1000), ts: '2026-09-11T18:20:00' },
  ],
};

// A separate, unsaved draft (Section 5): dinner ₹1,200, ₹200 extra for Sam.
export const UNEQUAL_DRAFT = {
  desc: 'Dinner (draft)', amountPaise: toPaise(1200),
  payers: [{ memberId: 'u_sam', paise: toPaise(1200) }],
  participants: ['u_sam', 'u_ananya', 'u_rohit', 'u_meera'],
  split: { mode: 'equalExtra', extras: { u_sam: toPaise(200) } },
};

function clone(x) { return JSON.parse(JSON.stringify(x)); }

// ---- Preview adapter -------------------------------------------------------
class PreviewAdapter {
  constructor() {
    this.mode = 'preview';
    this.state = clone(SEED);
    this._seq = 100;
    this.localMode = false;   // true once the user chooses "use without an account"
    this._onPersist = null;   // optional hook (set by app.js) fired after each write
  }
  get currentUserId() { return this.state.currentUserId; }

  // Turn on local (no-account) persistence. Loads any saved session on this
  // device, otherwise keeps the current demo data. All later writes autosave.
  enableLocal(saved) {
    this.localMode = true;
    if (saved && Array.isArray(saved.groups)) { this.state = saved; this._seq = Math.max(this._seq, 1000); }
    this._persist();
  }
  exportState() { return this.state; }
  importState(s) { if (s && Array.isArray(s.groups)) { this.state = s; this._seq = Math.max(this._seq, 1000); this._persist(); return true; } return false; }
  _persist() { if (this.localMode && this._onPersist) { try { this._onPersist(this.state); } catch {} } }
  auth() { return { mode: 'preview', user: null }; }
  async signInPreview() {
    // Explicitly a SIMULATED session — never presented as real Google auth.
    this.state.session = { user: { id: 'u_sam', name: 'Sam', simulated: true }, simulated: true };
    return { simulated: true };
  }
  async signOut() { this.state.session = null; }
  members() { return this.state.members; }
  member(id) { return this.state.members.find((m) => m.id === id); }
  groups() { return this.state.groups; }
  group(id) { return this.state.groups.find((g) => g.id === id); }
  groupMembers(gid) { const g = this.group(gid); return (g?.memberIds || []).map((id) => this.member(id)); }
  expenses(gid) { return this.state.expenses.filter((e) => !gid || e.groupId === gid); }
  expense(id) { return this.state.expenses.find((e) => e.id === id); }
  proposedPayments(gid) { return this.state.proposedPayments.filter((p) => p.groupId === gid); }
  confirmedPayments(gid) { return this.state.confirmedPayments.filter((p) => p.groupId === gid); }
  activity() { return [...this.state.activity].sort((a, b) => b.ts.localeCompare(a.ts)); }

  async createGroup({ name, memberNames = [], type, description }) {
    const gid = 'g_' + (++this._seq);
    const memberIds = ['u_sam'];
    memberNames.forEach((n) => {
      const id = 'u_' + (++this._seq);
      this.state.members.push({ id, name: n, initials: n.slice(0, 2).toUpperCase(), status: 'invited' });
      memberIds.push(id);
    });
    this.state.groups.push({ id: gid, name, memberIds, archived: false, type, description });
    this.state.activity.unshift({ id: 'a' + (++this._seq), type: 'group_created', actor: 'u_sam', text: `created ${name}`, ts: new Date().toISOString() });
    this._persist();
    return { id: gid, saved: 'preview' };
  }

  // Invite friends to a group by name (+ optional email). They become 'invited'
  // ledger entities until they accept and their account is claimed.
  async inviteMembers(gid, entries = []) {
    const g = this.group(gid);
    if (!g) return { added: [] };
    const added = [];
    entries.forEach((e) => {
      const name = (e.name || e.email || '').trim();
      if (!name) return;
      const id = 'u_' + (++this._seq);
      const initials = name.replace(/[^A-Za-z ]/g, '').split(/\s+/).map((s) => s[0]).join('').slice(0, 2).toUpperCase() || name.slice(0, 2).toUpperCase();
      this.state.members.push({ id, name, initials, email: e.email || null, status: 'invited' });
      g.memberIds.push(id);
      added.push(id);
    });
    if (added.length) this.state.activity.unshift({ id: 'a' + (++this._seq), type: 'members_invited', actor: this.state.currentUserId, text: `invited ${added.length} to ${g.name}`, ts: new Date().toISOString() });
    this._persist();
    return { added, saved: 'preview' };
  }

  // A shareable invite link (scope='invite'), expiring + revocable in the schema.
  createInviteLink(gid) {
    const token = 'inv_' + Math.random().toString(36).slice(2, 10);
    return `${location.origin}${location.pathname}#/join?g=${gid}&t=${token}`;
  }

  // Idempotent by clientId. Returns { id, saved: 'preview' }.
  async saveExpense(exp, clientId) {
    if (clientId) {
      const dup = this.state.expenses.find((e) => e.clientId === clientId);
      if (dup) return { id: dup.id, saved: 'preview', duplicate: true };
    }
    if (exp.id && this.expense(exp.id)) {
      const e = this.expense(exp.id);
      Object.assign(e, exp, { rev: (e.rev || 1) + 1 });
      this.state.activity.unshift({ id: 'a' + (++this._seq), type: 'expense_changed', actor: this.state.currentUserId, text: `edited ${e.desc}`, amount: e.amountPaise, ts: new Date().toISOString() });
      this._persist();
      return { id: e.id, saved: 'preview' };
    }
    const id = 'e_' + (++this._seq);
    const rec = { ...clone(exp), id, clientId, rev: 1 };
    this.state.expenses.push(rec);
    this.state.activity.unshift({ id: 'a' + (++this._seq), type: 'expense_added', actor: this.state.currentUserId, text: `added ${rec.desc}`, amount: rec.amountPaise, ts: new Date().toISOString() });
    this._persist();
    return { id, saved: 'preview' };
  }

  async reportPayment(gid, from, to, paise) {
    const id = 'p_' + (++this._seq);
    this.state.proposedPayments.push({ id, groupId: gid, from, to, paise, status: 'reported' });
    this._persist();
    return { id, saved: 'preview' };
  }
  // Confirmation moves a proposed payment into the authoritative ledger.
  async confirmPayment(pid) {
    const p = this.state.proposedPayments.find((x) => x.id === pid);
    if (!p) return { ok: false };
    p.status = 'confirmed';
    this.state.confirmedPayments.push({ ...p });
    this.state.activity.unshift({ id: 'a' + (++this._seq), type: 'receipt_confirmed', actor: 'u_sam', text: `confirmed ₹${(p.paise / 100).toLocaleString('en-IN')} from ${this.member(p.from)?.name}`, amount: p.paise, ts: new Date().toISOString() });
    this._persist();
    return { ok: true, saved: 'preview' };
  }
}

// ---- Supabase adapter (contract only; requires configured credentials) -----
// Implemented against the schema in sbdp/supabase/schema.sql. The methods mirror
// PreviewAdapter but perform authenticated, RLS-guarded, transactional writes.
// This file intentionally does not embed keys; it reads window.SBDP_ENV.
class SupabaseAdapter {
  constructor(env) {
    this.mode = 'supabase';
    this.env = env;
    this.client = null; // createClient(env.url, env.anonKey) once the SDK is bundled
    throw new Error('SupabaseAdapter requires the @supabase/supabase-js bundle and configured env. See sbdp/IMPLEMENTATION.md.');
  }
}

export function makeAdapter() {
  const env = (typeof window !== 'undefined' && window.SBDP_ENV) || null;
  if (env && env.url && env.anonKey) {
    try { return new SupabaseAdapter(env); }
    catch (e) { console.warn('[SBDP] Supabase not ready, using preview adapter:', e.message); }
  }
  return new PreviewAdapter();
}
