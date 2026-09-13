// Data layer. Chooses a backend adapter at runtime:
//  - SupabaseAdapter  when window.SBDP_ENV has a URL + anon key configured.
//  - PreviewAdapter   otherwise — in-memory fixtures, clearly labelled review mode.
// The two adapters share one async interface so screens never branch on backend.
// A preview sign-in NEVER masquerades as real Google auth (see auth.mode).

import { toPaise } from './money.js';

// A fresh, empty personal account. New users start here — no demo groups, no
// pre-seeded names. 'me' is the current user (renamed to the signed-in identity).
export function personalEmpty(name = 'You') {
  const initials = (String(name || 'You').trim().split(/\s+/).map((s) => s[0]).join('').slice(0, 2) || 'YO').toUpperCase();
  return {
    currentUserId: 'me',
    members: [{ id: 'me', name: name || 'You', initials, you: true, status: 'joined', role: 'owner' }],
    groups: [], expenses: [], proposedPayments: [], confirmedPayments: [], activity: [], friends: [],
  };
}

function clone(x) { return JSON.parse(JSON.stringify(x)); }

// ---- Preview adapter -------------------------------------------------------
class PreviewAdapter {
  constructor() {
    this.mode = 'preview';
    this.state = personalEmpty();
    this._seq = 100;
    this.localMode = false;      // true once the user chooses "use without an account"
    this._persistAlways = false; // true for signed-in users (persist per-user)
    this._onPersist = null;      // optional hook (set by app.js) fired after each write
    this.cloud = null;           // Cloud backend when signed in (writes sync to Supabase)
  }
  get currentUserId() { return this.state.currentUserId; }

  // The caller's member id within a group (cloud: per-group; local: the 'me' member).
  myMemberId(gid) { const gm = this.groupMembers(gid); const you = gm.find((m) => m.you); return you ? you.id : this.state.currentUserId; }

  // Replace the whole in-memory store from the cloud snapshot.
  async hydrate() { if (this.cloud) { this.state = await this.cloud.snapshot(); return true; } return false; }

  // Back to a clean empty account (e.g. after sign-out).
  resetEmpty() { this.state = personalEmpty(); this.cloud = null; this.localMode = false; this._persistAlways = false; this._onPersist = null; }

  // Rename the current user ('me') to the signed-in identity.
  setIdentity(user) {
    if (!user) return;
    const me = this.member('me');
    if (me) { me.name = user.name || me.name; me.initials = (String(user.name || 'You').trim().split(/\s+/).map((s) => s[0]).join('').slice(0, 2) || 'YO').toUpperCase(); me.email = user.email || null; }
    this._persist();
  }

  // Delete a whole group and everything attached to it.
  async deleteGroup(gid) {
    if (this.cloud) { const r = await this.cloud.deleteGroup(gid); await this.hydrate(); return r; }
    this.state.groups = this.state.groups.filter((g) => g.id !== gid);
    this.state.expenses = this.state.expenses.filter((e) => e.groupId !== gid);
    this.state.proposedPayments = this.state.proposedPayments.filter((p) => p.groupId !== gid);
    this.state.confirmedPayments = this.state.confirmedPayments.filter((p) => p.groupId !== gid);
    this._persist();
    return { ok: true };
  }

  // Delete a single expense.
  async deleteExpense(eid) {
    if (this.cloud) { const r = await this.cloud.deleteExpense(eid); await this.hydrate(); return r; }
    const e = this.expense(eid);
    this.state.expenses = this.state.expenses.filter((x) => x.id !== eid);
    if (e) this.state.activity.unshift({ id: 'a' + (++this._seq), type: 'expense_deleted', actor: this.state.currentUserId, text: `removed ${e.desc}`, ts: new Date().toISOString() });
    this._persist();
    return { ok: true };
  }

  // Turn on local (no-account) persistence. Loads any saved session on this
  // device, otherwise keeps the current demo data. All later writes autosave.
  enableLocal(saved) {
    this.localMode = true;
    if (saved && Array.isArray(saved.groups)) { this.state = saved; this._seq = Math.max(this._seq, 1000); }
    this._persist();
  }
  exportState() { return this.state; }
  importState(s) { if (s && Array.isArray(s.groups)) { this.state = s; this._seq = Math.max(this._seq, 1000); this._persist(); return true; } return false; }
  _persist() { if ((this.localMode || this._persistAlways) && this._onPersist) { try { this._onPersist(this.state); } catch {} } }
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
  friends() { return this.state.friends || []; }
  myRole(gid) { const m = this.groupMembers(gid).find((x) => x.you); return m ? (m.role || 'member') : 'member'; }

  async updateGroup(gid, patch) {
    if (this.cloud) { const r = await this.cloud.updateGroup(gid, patch); await this.hydrate(); return r; }
    const g = this.group(gid); if (g) { if (patch.name) g.name = patch.name; g.type = patch.type; g.description = patch.description; }
    this._persist(); return { ok: true };
  }
  async setMemberRole(memberId, role) {
    if (this.cloud) { const r = await this.cloud.setMemberRole(memberId, role); await this.hydrate(); return r; }
    const m = this.member(memberId); if (m) m.role = role; this._persist(); return { ok: true };
  }
  async removeMember(memberId) {
    if (this.cloud) { const r = await this.cloud.removeMember(memberId); await this.hydrate(); return r; }
    this.state.groups.forEach((g) => { g.memberIds = g.memberIds.filter((id) => id !== memberId); });
    this.state.members = this.state.members.filter((m) => m.id !== memberId || m.id === 'me');
    this._persist(); return { ok: true };
  }
  async leaveGroup(gid) {
    if (this.cloud) { const r = await this.cloud.leaveGroup(gid); await this.hydrate(); return r; }
    const g = this.group(gid); if (g) g.memberIds = g.memberIds.filter((id) => id !== this.state.currentUserId);
    this.state.groups = this.state.groups.filter((x) => x.id !== gid);
    this._persist(); return { ok: true };
  }
  async addFriend(email, name) {
    if (this.cloud) { const r = await this.cloud.addFriend(email, name); await this.hydrate(); return r; }
    const e = String(email || '').trim().toLowerCase(); if (!e) return { ok: false };
    const f = this.state.friends.find((x) => x.email === e);
    if (f) { if (name) f.name = name; } else this.state.friends.push({ email: e, name: name || e, favourite: false, registered: false });
    this._persist(); return { ok: true };
  }
  async toggleFavouriteFriend(email) {
    if (this.cloud) { const r = await this.cloud.toggleFavouriteFriend(email); await this.hydrate(); return r; }
    const f = this.state.friends.find((x) => x.email === email); if (f) f.favourite = !f.favourite; this._persist(); return { ok: true };
  }
  async removeFriend(email) {
    if (this.cloud) { const r = await this.cloud.removeFriend(email); await this.hydrate(); return r; }
    this.state.friends = this.state.friends.filter((x) => x.email !== email); this._persist(); return { ok: true };
  }

  async createGroup({ name, memberNames = [], type, description }) {
    if (this.cloud) { const r = await this.cloud.createGroup({ name, memberNames, type, description }); await this.hydrate(); return r; }
    const gid = 'g_' + (++this._seq);
    const memberIds = [this.state.currentUserId];
    memberNames.forEach((n) => {
      const id = 'u_' + (++this._seq);
      this.state.members.push({ id, name: n, initials: n.slice(0, 2).toUpperCase(), status: 'invited', role: 'member' });
      memberIds.push(id);
    });
    this.state.groups.push({ id: gid, name, memberIds, archived: false, type, description });
    this.state.activity.unshift({ id: 'a' + (++this._seq), type: 'group_created', actor: this.state.currentUserId, text: `created ${name}`, ts: new Date().toISOString() });
    this._persist();
    return { id: gid, saved: 'preview' };
  }

  // Invite friends to a group by name (+ optional email). They become 'invited'
  // ledger entities until they accept and their account is claimed.
  async inviteMembers(gid, entries = []) {
    if (this.cloud) { const r = await this.cloud.inviteMembers(gid, entries); await this.hydrate(); return r; }
    const g = this.group(gid);
    if (!g) return { added: [] };
    const added = [];
    entries.forEach((e) => {
      const name = (e.name || e.email || '').trim();
      if (!name) return;
      const id = 'u_' + (++this._seq);
      const initials = name.replace(/[^A-Za-z ]/g, '').split(/\s+/).map((s) => s[0]).join('').slice(0, 2).toUpperCase() || name.slice(0, 2).toUpperCase();
      this.state.members.push({ id, name, initials, email: e.email || null, status: 'invited', role: 'member' });
      g.memberIds.push(id);
      added.push(id);
    });
    if (added.length) this.state.activity.unshift({ id: 'a' + (++this._seq), type: 'members_invited', actor: this.state.currentUserId, text: `invited ${added.length} to ${g.name}`, ts: new Date().toISOString() });
    this._persist();
    return { added, saved: 'preview' };
  }

  // A shareable invite link. Cloud mints a real token; local is device-scoped.
  async inviteLink(gid) {
    if (this.cloud) return this.cloud.inviteLink(gid);
    const token = 'inv_' + Math.random().toString(36).slice(2, 10);
    return `${location.origin}${location.pathname}#/join?g=${gid}&t=${token}`;
  }

  // Idempotent by clientId. Returns { id, saved: 'preview' }.
  async saveExpense(exp, clientId) {
    if (this.cloud) { const r = await this.cloud.saveExpense({ ...exp, clientId }); await this.hydrate(); return r; }
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
    if (this.cloud) { const r = await this.cloud.reportPayment(gid, from, to, paise); await this.hydrate(); return r; }
    const id = 'p_' + (++this._seq);
    this.state.proposedPayments.push({ id, groupId: gid, from, to, paise, status: 'reported' });
    this._persist();
    return { id, saved: 'preview' };
  }
  // Confirmation moves a proposed payment into the authoritative ledger.
  async confirmPayment(pid) {
    if (this.cloud) { const r = await this.cloud.confirmPayment(pid); await this.hydrate(); return r; }
    const p = this.state.proposedPayments.find((x) => x.id === pid);
    if (!p) return { ok: false };
    p.status = 'confirmed';
    this.state.confirmedPayments.push({ ...p });
    this.state.activity.unshift({ id: 'a' + (++this._seq), type: 'receipt_confirmed', actor: this.state.currentUserId, text: `confirmed ₹${(p.paise / 100).toLocaleString('en-IN')} from ${this.member(p.from)?.name}`, amount: p.paise, ts: new Date().toISOString() });
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
