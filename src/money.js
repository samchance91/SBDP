// SBDP money engine — all arithmetic in integer paise (1 rupee = 100 paise).
// No floating point is used for stored balances; only presentational formatting divides.

export const toPaise = (rupees) => Math.round(Number(rupees) * 100);
export const paise = (n) => Math.trunc(n);

// Indian digit grouping, tabular. Accepts paise, returns e.g. "₹1,23,456.00".
export function formatINR(p, { sign = false, symbol = true } = {}) {
  const neg = p < 0;
  const abs = Math.abs(p);
  const rupees = Math.trunc(abs / 100);
  const pa = String(abs % 100).padStart(2, '0');
  // Indian grouping: last 3 digits, then groups of 2.
  const s = String(rupees);
  let grouped;
  if (s.length <= 3) grouped = s;
  else {
    const last3 = s.slice(-3);
    let rest = s.slice(0, -3);
    const parts = [];
    while (rest.length > 2) { parts.unshift(rest.slice(-2)); rest = rest.slice(0, -2); }
    if (rest) parts.unshift(rest);
    grouped = parts.join(',') + ',' + last3;
  }
  const body = `${symbol ? '₹' : ''}${grouped}.${pa}`;
  if (sign) return `${neg ? '−' : '+'}${body}`;
  return `${neg ? '−' : ''}${body}`;
}

// Distribute a total across n participants as evenly as possible in paise.
// Remainder paise are assigned deterministically to the first participants,
// so the sum of shares always equals the total exactly.
export function splitEven(totalPaise, ids) {
  const n = ids.length;
  if (n === 0) return {};
  const base = Math.trunc(totalPaise / n);
  let rem = totalPaise - base * n; // 0..n-1, can be negative if total<0
  const out = {};
  ids.forEach((id, i) => {
    let extra = 0;
    if (rem > 0) { extra = 1; rem -= 1; }
    out[id] = base + extra;
  });
  return out;
}

// Compute each participant's share (owed) for a single expense.
// Returns { shares: {id: paise}, allocated: paise, unallocated: paise }
export function computeShares(expense) {
  const total = expense.amountPaise;
  const ids = expense.participants;
  const cfg = expense.split || { mode: 'equal' };
  let shares = {};
  ids.forEach((id) => (shares[id] = 0));

  switch (cfg.mode) {
    case 'equal':
      shares = splitEven(total, ids);
      break;

    case 'exact': {
      ids.forEach((id) => (shares[id] = paise(cfg.amounts?.[id] || 0)));
      break;
    }

    case 'percent': {
      // Percent means value/100. Allocate proportionally, largest-remainder rounding.
      const raw = ids.map((id) => {
        const pct = Number(cfg.percents?.[id] || 0);
        return { id, exact: (total * pct) / 100 };
      });
      let assigned = 0;
      raw.forEach((r) => { r.floor = Math.trunc(r.exact); assigned += r.floor; shares[r.id] = r.floor; });
      let leftover = total - assigned;
      raw.sort((a, b) => (b.exact - b.floor) - (a.exact - a.floor));
      for (let i = 0; i < raw.length && leftover > 0; i++) { shares[raw[i].id] += 1; leftover -= 1; }
      break;
    }

    case 'shares': {
      const weights = ids.map((id) => ({ id, w: Number(cfg.shares?.[id] || 0) }));
      const totalW = weights.reduce((s, x) => s + x.w, 0);
      if (totalW <= 0) break;
      let assigned = 0;
      weights.forEach((x) => { x.exact = (total * x.w) / totalW; x.floor = Math.trunc(x.exact); assigned += x.floor; shares[x.id] = x.floor; });
      let leftover = total - assigned;
      weights.sort((a, b) => (b.exact - b.floor) - (a.exact - a.floor));
      for (let i = 0; i < weights.length && leftover > 0; i++) { shares[weights[i].id] += 1; leftover -= 1; }
      break;
    }

    case 'equalExtra': {
      // Each participant may carry a fixed extra; the remainder is split equally.
      const extras = {};
      let sumExtra = 0;
      ids.forEach((id) => { const e = paise(cfg.extras?.[id] || 0); extras[id] = e; sumExtra += e; });
      const base = splitEven(total - sumExtra, ids);
      ids.forEach((id) => (shares[id] = base[id] + extras[id]));
      break;
    }
    default:
      shares = splitEven(total, ids);
  }

  const allocated = ids.reduce((s, id) => s + shares[id], 0);
  return { shares, allocated, unallocated: total - allocated };
}

// Sum of what each payer put in for an expense.
export function paidTotal(expense) {
  return (expense.payers || []).reduce((s, p) => s + paise(p.paise), 0);
}

// Aggregate balances across a set of expenses for a member list.
// balance > 0  => member is owed (net creditor). balance < 0 => member owes.
export function computeBalances(members, expenses) {
  const bal = {}; const paid = {}; const owed = {};
  members.forEach((m) => { bal[m.id] = 0; paid[m.id] = 0; owed[m.id] = 0; });
  let spend = 0;
  expenses.forEach((e) => {
    spend += e.amountPaise;
    (e.payers || []).forEach((p) => { paid[p.memberId] = (paid[p.memberId] || 0) + paise(p.paise); });
    const { shares } = computeShares(e);
    Object.entries(shares).forEach(([id, s]) => { owed[id] = (owed[id] || 0) + s; });
  });
  members.forEach((m) => { bal[m.id] = (paid[m.id] || 0) - (owed[m.id] || 0); });
  return { bal, paid, owed, spend };
}

// Greedy minimal settlement. Returns [{from, to, paise}] with from=debtor, to=creditor.
// `payments` is a list of confirmed payments [{from,to,paise}] already netted out.
export function settle(balances, confirmed = []) {
  const net = { ...balances };
  confirmed.forEach((p) => { net[p.from] += p.paise; net[p.to] -= p.paise; });
  const debtors = []; const creditors = [];
  Object.entries(net).forEach(([id, v]) => {
    if (v < 0) debtors.push({ id, amt: -v });
    else if (v > 0) creditors.push({ id, amt: v });
  });
  debtors.sort((a, b) => b.amt - a.amt);
  creditors.sort((a, b) => b.amt - a.amt);
  const tx = [];
  let i = 0, j = 0;
  while (i < debtors.length && j < creditors.length) {
    const d = debtors[i], c = creditors[j];
    const m = Math.min(d.amt, c.amt);
    if (m > 0) tx.push({ from: d.id, to: c.id, paise: m });
    d.amt -= m; c.amt -= m;
    if (d.amt === 0) i++;
    if (c.amt === 0) j++;
  }
  return tx;
}
