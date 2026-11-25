// Boolean expression parsing and Quine–McCluskey minimisation.

// ---------------------------------------------------------------- parser
// Accepts: A'B + C(A+B'), !A & B | C, A ^ B, ~(A.B), ¬A·B, 0, 1
export function parseExpr(src) {
  const s = src.replace(/\s+/g, '');
  let i = 0;
  const peek = () => s[i];
  const fail = (msg) => { const e = new Error(msg + (i < s.length ? ` near “${s.slice(i, i + 6)}”` : ' at the end')); e.pos = i; throw e; };
  const startsPrimary = (c) => c && /[A-Za-z01(!~¬]/.test(c);

  function or() {
    let l = xor();
    while (peek() === '+' || peek() === '|') { i++; l = { op: 'or', a: l, b: xor() }; }
    return l;
  }
  function xor() {
    let l = and();
    while (peek() === '^' || peek() === '⊕') { i++; l = { op: 'xor', a: l, b: and() }; }
    return l;
  }
  function and() {
    let l = unary();
    for (;;) {
      const c = peek();
      if (c === '*' || c === '&' || c === '.' || c === '·') { i++; l = { op: 'and', a: l, b: unary() }; }
      else if (startsPrimary(c)) l = { op: 'and', a: l, b: unary() };
      else break;
    }
    return l;
  }
  function unary() {
    const c = peek();
    if (c === '!' || c === '~' || c === '¬') { i++; return { op: 'not', a: unary() }; }
    let p = primary();
    while (peek() === "'" || peek() === '’' || peek() === '′') { i++; p = { op: 'not', a: p }; }
    return p;
  }
  function primary() {
    const c = peek();
    if (c === undefined) fail('Expression ends too early');
    if (c === '(') {
      i++;
      const e = or();
      if (peek() !== ')') fail('Missing closing bracket');
      i++;
      return e;
    }
    if (c === '0' || c === '1') { i++; return { op: 'const', v: +c }; }
    if (/[A-Za-z]/.test(c)) { i++; return { op: 'var', name: c.toUpperCase() }; }
    fail(`Unexpected “${c}”`);
  }
  if (!s) fail('Type an expression');
  const tree = or();
  if (i < s.length) fail('Unexpected symbol');
  return tree;
}

export function varsOf(tree, set = new Set()) {
  if (tree.op === 'var') set.add(tree.name);
  if (tree.a) varsOf(tree.a, set);
  if (tree.b) varsOf(tree.b, set);
  return set;
}

export function evalExpr(t, env) {
  switch (t.op) {
    case 'const': return t.v;
    case 'var': return env[t.name] | 0;
    case 'not': return +!evalExpr(t.a, env);
    case 'and': return evalExpr(t.a, env) & evalExpr(t.b, env);
    case 'or': return evalExpr(t.a, env) | evalExpr(t.b, env);
    case 'xor': return evalExpr(t.a, env) ^ evalExpr(t.b, env);
  }
  return 0;
}

// minterm index uses the first variable as MSB
export function truthFromExpr(src, names) {
  const tree = parseExpr(src);
  const used = [...varsOf(tree)].sort();
  const vars = names || used;
  const missing = used.filter(v => !vars.includes(v));
  if (missing.length) throw new Error(`Variable ${missing.join(', ')} is not in the map. Add more variables or rename.`);
  const n = vars.length;
  const out = [];
  for (let m = 0; m < 1 << n; m++) {
    const env = {};
    vars.forEach((v, k) => { env[v] = (m >> (n - 1 - k)) & 1; });
    out.push(evalExpr(tree, env));
  }
  return { vars, values: out, used };
}

// "Σm(1,3,5) + d(2,7)" or "1,3,5" — returns {ones, dcs}
export function parseIndexList(src, max) {
  const clean = src.replace(/\s+/g, '');
  const dRe = /(?:dc|d|x)\(([^)]*)\)/i;
  const dm = clean.match(dRe);
  const main = clean.replace(dRe, '');
  const nums = (t) => (t ? (t.match(/\d+/g) || []).map(x => {
    const v = parseInt(x, 10);
    if (v >= max) throw new Error(`${x} is outside 0–${max - 1} for this many variables`);
    return v;
  }) : []);
  return { list: [...new Set(nums(main))].sort((a, b) => a - b), dcs: [...new Set(nums(dm?.[1]))].sort((a, b) => a - b) };
}

// ---------------------------------------------------------------- Quine–McCluskey
const popcount = (x) => { let c = 0; while (x) { c += x & 1; x >>= 1; } return c; };

export function minimize(n, ones, dcs = []) {
  const full = (1 << n) - 1;
  const oneSet = new Set(ones);
  const steps = [];
  if (!ones.length) return { pis: [], solutions: [[]], essential: [], steps, constant: 0 };
  if (ones.length + dcs.length === 1 << n && ones.length) {
    const pi = { value: 0, mask: full, covers: [...ones] };
    return { pis: [pi], solutions: [[0]], essential: [0], steps, constant: 1 };
  }

  // column 0
  let current = new Map();
  for (const m of [...ones, ...dcs]) current.set(`${m}/0`, { value: m, mask: 0, covers: [m], used: false });
  const primes = [];
  for (let pass = 0; current.size; pass++) {
    const list = [...current.values()];
    steps.push(list.map(t => ({ value: t.value, mask: t.mask, covers: t.covers.slice() })));
    const next = new Map();
    for (let a = 0; a < list.length; a++) {
      for (let b = a + 1; b < list.length; b++) {
        const x = list[a], y = list[b];
        if (x.mask !== y.mask) continue;
        const diff = x.value ^ y.value;
        if (popcount(diff) !== 1) continue;
        x.used = y.used = true;
        const value = x.value & ~diff, mask = x.mask | diff;
        const key = `${value}/${mask}`;
        if (!next.has(key)) next.set(key, { value, mask, covers: [...new Set([...x.covers, ...y.covers])].sort((p, q) => p - q), used: false });
      }
    }
    for (const t of list) if (!t.used) primes.push(t);
    current = next;
  }

  const pis = primes
    .map(p => ({ value: p.value, mask: p.mask, covers: p.covers }))
    .filter(p => p.covers.some(m => oneSet.has(m)))
    .sort((a, b) => popcount(b.mask) - popcount(a.mask) || a.value - b.value);

  // essential prime implicants
  const coverers = new Map(ones.map(m => [m, pis.map((p, i) => (p.covers.includes(m) ? i : -1)).filter(i => i >= 0)]));
  const essential = [...new Set([...coverers.values()].filter(c => c.length === 1).map(c => c[0]))];

  // exact minimum cover: fewest terms, then fewest literals
  const lits = (i) => n - popcount(pis[i].mask);
  let best = Infinity, bestLits = Infinity, solutions = [];
  const covered0 = new Set();
  for (const e of essential) for (const m of pis[e].covers) covered0.add(m);
  const remaining = ones.filter(m => !covered0.has(m));
  const startLits = essential.reduce((s, i) => s + lits(i), 0);
  let nodes = 0;
  function search(chosen, covered, litCount) {
    if (++nodes > 200000) return;
    const left = remaining.filter(m => !covered.has(m));
    if (!left.length) {
      const k = chosen.length;
      if (k < best || (k === best && litCount < bestLits)) { best = k; bestLits = litCount; solutions = [chosen.slice()]; }
      else if (k === best && litCount === bestLits && solutions.length < 8) solutions.push(chosen.slice());
      return;
    }
    if (chosen.length + 1 > best) return;
    // branch on the minterm with the fewest options
    let pick = left[0], opts = null;
    for (const m of left) {
      const o = coverers.get(m).filter(i => !chosen.includes(i));
      if (!opts || o.length < opts.length) { opts = o; pick = m; }
    }
    void pick;
    for (const i of opts) {
      const nc = new Set(covered);
      for (const m of pis[i].covers) nc.add(m);
      chosen.push(i);
      search(chosen, nc, litCount + lits(i));
      chosen.pop();
    }
  }
  search([...essential], covered0, startLits);
  // de-duplicate solutions that are the same set
  const seen = new Set();
  solutions = solutions.map(s => [...s].sort((a, b) => a - b)).filter(s => { const k = s.join(','); if (seen.has(k)) return false; seen.add(k); return true; });
  return { pis, solutions, essential, steps, constant: null };
}

// ---------------------------------------------------------------- formatting
export function termSOP(pi, vars) {
  const n = vars.length;
  let s = '';
  for (let k = 0; k < n; k++) {
    const bit = 1 << (n - 1 - k);
    if (pi.mask & bit) continue;
    s += vars[k] + (pi.value & bit ? '' : '′');
  }
  return s || '1';
}
export function termPOS(pi, vars) {
  const n = vars.length;
  const parts = [];
  for (let k = 0; k < n; k++) {
    const bit = 1 << (n - 1 - k);
    if (pi.mask & bit) continue;
    parts.push(vars[k] + (pi.value & bit ? '′' : ''));
  }
  if (!parts.length) return '0';
  return parts.length === 1 ? parts[0] : '(' + parts.join(' + ') + ')';
}
export function patternOf(pi, n) {
  let s = '';
  for (let k = n - 1; k >= 0; k--) s += pi.mask & (1 << k) ? '–' : (pi.value >> k) & 1;
  return s;
}
export function literalCount(pis, idx, n) { return idx.reduce((s, i) => s + (n - popcount(pis[i].mask)), 0); }

export function solveFunction(n, ones, dcs, vars) {
  const zeros = [];
  for (let m = 0; m < 1 << n; m++) if (!ones.includes(m) && !dcs.includes(m)) zeros.push(m);
  const sop = minimize(n, ones, dcs);
  const pos = minimize(n, zeros, dcs);
  const sopStr = (sol) => {
    if (sop.constant === 0) return '0';
    if (sop.constant === 1) return '1';
    return sol.map(i => termSOP(sop.pis[i], vars)).join(' + ');
  };
  const posStr = (sol) => {
    if (pos.constant === 0) return '1';
    if (pos.constant === 1) return '0';
    return sol.map(i => termPOS(pos.pis[i], vars)).join('');
  };
  return {
    sop, pos, zeros,
    sopText: sop.solutions.map(sopStr),
    posText: pos.solutions.map(posStr),
  };
}
