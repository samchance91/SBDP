// Safe calculator — tokenise + shunting-yard to RPN, evaluate numerically.
// No eval / no Function. Percent is a postfix operator meaning "divide by 100".
// Precision: intermediate math in JS numbers; callers round to paise on insert.

const OPS = {
  '+': { prec: 2, assoc: 'L', fn: (a, b) => a + b },
  '-': { prec: 2, assoc: 'L', fn: (a, b) => a - b },
  '*': { prec: 3, assoc: 'L', fn: (a, b) => a * b },
  '/': { prec: 3, assoc: 'L', fn: (a, b) => a / b },
};

export function tokenize(str) {
  const tokens = [];
  let i = 0;
  const s = str.replace(/\s+/g, '');
  while (i < s.length) {
    const c = s[i];
    if (/[0-9.]/.test(c)) {
      let num = '';
      while (i < s.length && /[0-9.]/.test(s[i])) { num += s[i]; i++; }
      if ((num.match(/\./g) || []).length > 1) throw new CalcError('Malformed number');
      tokens.push({ t: 'num', v: parseFloat(num) });
      continue;
    }
    if (c === '%') { tokens.push({ t: 'pct' }); i++; continue; }
    if (c === '(') { tokens.push({ t: 'lp' }); i++; continue; }
    if (c === ')') { tokens.push({ t: 'rp' }); i++; continue; }
    if (c in OPS) {
      // unary minus / plus
      const prev = tokens[tokens.length - 1];
      const unary = !prev || prev.t === 'op' || prev.t === 'lp';
      if ((c === '-' || c === '+') && unary) { tokens.push({ t: 'num', v: 0 }); }
      tokens.push({ t: 'op', v: c });
      i++;
      continue;
    }
    throw new CalcError(`Unexpected "${c}"`);
  }
  return tokens;
}

export class CalcError extends Error {}

export function toRPN(tokens) {
  const out = []; const stack = [];
  for (const tk of tokens) {
    if (tk.t === 'num') out.push(tk);
    else if (tk.t === 'pct') out.push(tk); // postfix, apply immediately in eval
    else if (tk.t === 'op') {
      while (stack.length) {
        const top = stack[stack.length - 1];
        if (top.t === 'op' && (OPS[top.v].prec > OPS[tk.v].prec ||
          (OPS[top.v].prec === OPS[tk.v].prec && OPS[tk.v].assoc === 'L'))) {
          out.push(stack.pop());
        } else break;
      }
      stack.push(tk);
    } else if (tk.t === 'lp') stack.push(tk);
    else if (tk.t === 'rp') {
      let found = false;
      while (stack.length) { const top = stack.pop(); if (top.t === 'lp') { found = true; break; } out.push(top); }
      if (!found) throw new CalcError('Mismatched )');
    }
  }
  while (stack.length) { const top = stack.pop(); if (top.t === 'lp') throw new CalcError('Mismatched ('); out.push(top); }
  return out;
}

export function evalRPN(rpn) {
  const st = [];
  for (const tk of rpn) {
    if (tk.t === 'num') st.push(tk.v);
    else if (tk.t === 'pct') { const a = st.pop(); if (a === undefined) throw new CalcError('Syntax error'); st.push(a / 100); }
    else if (tk.t === 'op') {
      const b = st.pop(); const a = st.pop();
      if (a === undefined || b === undefined) throw new CalcError('Syntax error');
      if (tk.v === '/' && b === 0) throw new CalcError("Can't divide by zero");
      st.push(OPS[tk.v].fn(a, b));
    }
  }
  if (st.length !== 1) throw new CalcError('Syntax error');
  const r = st[0];
  if (!isFinite(r)) throw new CalcError("Can't divide by zero");
  return r;
}

// Returns { ok, value (number), error }
export function evaluate(expression) {
  try {
    if (!expression || !expression.trim()) return { ok: true, value: 0, error: null };
    const v = evalRPN(toRPN(tokenize(expression)));
    return { ok: true, value: v, error: null };
  } catch (e) {
    return { ok: false, value: null, error: e instanceof CalcError ? e.message : 'Error' };
  }
}

// Round a rupee number to paise precision (2 dp), avoiding fp drift.
export const roundToPaise = (rupees) => Math.round((rupees + Number.EPSILON) * 100) / 100;
