// No-account / offline mode. Progress is kept on THIS device only (localStorage)
// and can be exported to a Markdown file so it survives with no backend and can be
// restored later. Nothing here contacts a server. The user is told, plainly, that
// without an account their data lives only on this device.

const KEY = 'sbdp-local-session';

// An optional key lets each signed-in user persist under their own namespace
// (sbdp-user-<uid>), separate from the shared no-account session.
export function hasLocal(key = KEY) { try { return !!localStorage.getItem(key); } catch { return false; } }
export function loadLocal(key = KEY) { try { const r = localStorage.getItem(key); return r ? JSON.parse(r) : null; } catch { return null; } }
export function saveLocal(state, key = KEY) { try { localStorage.setItem(key, JSON.stringify(state)); return true; } catch { return false; } }
export function clearLocal(key = KEY) { try { localStorage.removeItem(key); } catch {} }

export function isOnline() { return typeof navigator === 'undefined' ? true : navigator.onLine !== false; }

function inr(p) { const n = Math.abs(p); return `₹${(n / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`; }

// Human-readable Markdown with an embedded, machine-readable state block so the
// same file can be re-imported to continue exactly where you left off.
export function toMarkdown(state) {
  const m = (id) => (state.members.find((x) => x.id === id) || {}).name || id;
  const lines = [];
  lines.push('# SBDP — saved session');
  lines.push('');
  lines.push(`_Split Bills, Divide Payments. by Propelr.in — exported ${new Date().toLocaleString('en-IN')}_`);
  lines.push('');
  lines.push('> Local, no-account copy. Import this file in SBDP (Settings → Restore) to continue. Amounts are INR.');
  lines.push('');
  state.groups.forEach((g) => {
    lines.push(`## ${g.name}`);
    const mem = g.memberIds.map(m).join(', ');
    lines.push(`Members: ${mem}`);
    lines.push('');
    lines.push('| Expense | Paid by | Amount |');
    lines.push('| --- | --- | ---: |');
    state.expenses.filter((e) => e.groupId === g.id).forEach((e) => {
      lines.push(`| ${e.desc} | ${m(e.payers[0].memberId)} | ${inr(e.amountPaise)} |`);
    });
    lines.push('');
  });
  lines.push('<!-- Do not edit below: SBDP restore data -->');
  lines.push('```json');
  lines.push(JSON.stringify(state));
  lines.push('```');
  lines.push('');
  return lines.join('\n');
}

// Trigger a browser download. Works on a normally-hosted static site.
export function download(filename, text, type = 'text/markdown') {
  try {
    const blob = new Blob([text], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  } catch { return false; }
}

// Parse a previously exported .md back into a state object.
export async function fromMarkdownFile(file) {
  const text = await file.text();
  const match = text.match(/```json\s*([\s\S]*?)```/);
  if (!match) throw new Error('This file has no SBDP restore data.');
  const state = JSON.parse(match[1].trim());
  if (!state || !Array.isArray(state.groups)) throw new Error('Unrecognised session file.');
  return state;
}
