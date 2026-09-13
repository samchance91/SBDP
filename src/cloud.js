// Cloud backend: reads/writes the user's data in Supabase Postgres via the
// SECURITY DEFINER functions in supabase/sync.sql. Transforms the server
// snapshot into the in-memory store shape the screens already understand.
// Every group's data is shared across all its members, on every device.

import { computeShares } from './money.js?v=10';

const initialsOf = (name) => (String(name || '?').trim().split(/\s+/).map((s) => s[0]).join('').slice(0, 2) || '?').toUpperCase();

export class Cloud {
  constructor(client) { this.c = client; }

  async _rpc(fn, args) {
    const { data, error } = await this.c.rpc(fn, args || {});
    if (error) throw new Error(error.message || String(error));
    return data;
  }

  // Pull everything the user can see and shape it like the local store.
  async snapshot() {
    const snap = await this._rpc('app_snapshot');
    const members = []; const groups = []; const expenses = [];
    const proposedPayments = []; const confirmedPayments = [];
    const seen = new Set();
    (snap.groups || []).forEach((g) => {
      const memberIds = [];
      (g.members || []).forEach((m) => {
        memberIds.push(m.id);
        if (!seen.has(m.id)) {
          seen.add(m.id);
          members.push({ id: m.id, name: m.display_name, initials: initialsOf(m.display_name), you: !!m.is_me, status: m.status, role: m.role || 'member' });
        }
      });
      groups.push({ id: g.id, name: g.name, type: g.type, description: g.description, memberIds, archived: false, createdBy: g.created_by });
      (g.expenses || []).forEach((e) => {
        const split = Object.assign({ mode: e.split_mode }, e.split_config || {});
        expenses.push({
          id: e.id, groupId: g.id, desc: e.description, amountPaise: e.amount_paise, date: e.spent_on, time: e.spent_at || null,
          category: e.category || null, notes: e.notes || null, tags: Array.isArray(e.tags) ? e.tags : [],
          payers: (e.payers || []).map((p) => ({ memberId: p.member_id, paise: p.paise })),
          participants: (e.participants || []).map((p) => p.member_id),
          split, rev: e.revision,
        });
      });
      (g.payments || []).forEach((p) => {
        const rec = { id: p.id, groupId: g.id, from: p.from_member, to: p.to_member, paise: p.paise, status: p.status };
        (p.status === 'confirmed' ? confirmedPayments : proposedPayments).push(rec);
      });
    });
    const friends = (snap.friends || []).map((f) => ({ email: f.email, name: f.name || f.email, favourite: !!f.favourite, registered: !!f.registered }));
    return { currentUserId: null, members, groups, expenses, proposedPayments, confirmedPayments, activity: [], friends };
  }

  async updateGroup(gid, { name, type, description }) { await this._rpc('update_group', { p_group: gid, p_name: name, p_type: type ?? null, p_description: description ?? null }); return { ok: true }; }
  async setMemberRole(memberId, role) { await this._rpc('set_member_role', { p_member: memberId, p_role: role }); return { ok: true }; }
  async removeMember(memberId) { await this._rpc('remove_member', { p_member: memberId }); return { ok: true }; }
  async leaveGroup(gid) { await this._rpc('leave_group', { p_group: gid }); return { ok: true }; }
  async addFriend(email, name) { await this._rpc('add_friend', { p_email: email, p_name: name ?? null }); return { ok: true }; }
  async toggleFavouriteFriend(email) { await this._rpc('toggle_favourite_friend', { p_email: email }); return { ok: true }; }
  async removeFriend(email) { await this._rpc('remove_friend', { p_email: email }); return { ok: true }; }

  async createGroup({ name, memberNames = [], type = null, description = null }) {
    const r = await this._rpc('create_group', { p_name: name, p_type: type, p_description: description });
    for (const n of memberNames) { if (n && n.trim()) await this._rpc('add_group_member', { p_group: r.group_id, p_name: n.trim(), p_email: null }); }
    return { id: r.group_id };
  }

  async inviteMembers(gid, entries = []) {
    for (const e of entries) await this._rpc('add_group_member', { p_group: gid, p_name: e.name || e.email || 'Friend', p_email: e.email || null });
    return { added: entries.map(() => 1) };
  }

  async inviteLink(gid) {
    const token = await this._rpc('create_invite_link', { p_group: gid });
    return `${location.origin}${location.pathname}#/join?token=${encodeURIComponent(token)}`;
  }

  async join(token) { return this._rpc('join_group', { p_token: token }); }

  async saveExpense(exp) {
    const { shares } = computeShares({ amountPaise: exp.amountPaise, participants: exp.participants, split: exp.split });
    const { mode, ...cfg } = exp.split || { mode: 'equal' };
    const payload = {
      group_id: exp.groupId, description: exp.desc || '', amount_paise: exp.amountPaise,
      spent_on: exp.date || new Date().toISOString().slice(0, 10), spent_at: exp.time || null,
      category: exp.category || null, notes: exp.notes || null, tags: exp.tags || [],
      split_mode: mode, split_config: cfg, client_id: exp.clientId || null,
      payers: (exp.payers || []).map((p) => ({ member_id: p.memberId, paise: p.paise })),
      participants: exp.participants.map((id) => ({ member_id: id, share_paise: shares[id] || 0 })),
    };
    const id = await this._rpc('save_expense', { payload });
    return { id };
  }

  async deleteGroup(gid) { await this._rpc('delete_group', { p_group: gid }); return { ok: true }; }
  async deleteExpense(eid) { await this._rpc('delete_expense', { p_expense: eid }); return { ok: true }; }
  async reportPayment(gid, from, to, paise) { const id = await this._rpc('report_payment', { p_group: gid, p_from: from, p_to: to, p_paise: paise }); return { id }; }
  async confirmPayment(pid) { await this._rpc('confirm_payment', { p_payment: pid }); return { ok: true }; }
}
