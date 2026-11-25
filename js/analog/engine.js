// Transient circuit solver: modified nodal analysis, backward-Euler companions,
// Newton–Raphson for the non-linear parts.

export const G = 20; // grid pitch (px)

export const TYPES = {
  wire: { n: 2, label: 'Wire' },
  R: { n: 2, label: 'Resistor', unit: 'Ω', def: { value: 1000 } },
  C: { n: 2, label: 'Capacitor', unit: 'F', def: { value: 1e-6 } },
  L: { n: 2, label: 'Inductor', unit: 'H', def: { value: 10e-3 } },
  V: { n: 2, label: 'DC voltage source', unit: 'V', def: { value: 5 } },
  AC: { n: 2, label: 'AC / signal source', unit: 'V', def: { amp: 5, freq: 1000, offset: 0, wave: 'sine' } },
  I: { n: 2, label: 'Current source', unit: 'A', def: { value: 1e-3 } },
  D: { n: 2, label: 'Diode', def: { model: 'si' } },
  LED: { n: 2, label: 'LED', def: { color: 'red' } },
  Z: { n: 2, label: 'Zener diode', unit: 'V', def: { vz: 5.1 } },
  SW: { n: 2, label: 'Switch', def: { closed: false } },
  VM: { n: 2, label: 'Voltmeter' },
  AM: { n: 2, label: 'Ammeter' },
  GND: { n: 1, label: 'Ground' },
  OA: { n: 3, label: 'Op-amp', def: { vsat: 13.5, flip: false } },
  NPN: { n: 3, label: 'NPN transistor', def: { beta: 100, flip: false } },
  PNP: { n: 3, label: 'PNP transistor', def: { beta: 100, flip: false } },
};

export const LED_COLORS = {
  red: { vf: 1.8, rgb: '#ff3b30' },
  green: { vf: 2.1, rgb: '#2fe36b' },
  yellow: { vf: 2.0, rgb: '#ffd60a' },
  blue: { vf: 3.0, rgb: '#3a8bff' },
  white: { vf: 3.1, rgb: '#f4f7ff' },
};

// terminal points of an element in px
export function terminals(e) {
  if (e.terms) return e.terms;
  const [x, y] = e.p[0];
  switch (e.type) {
    case 'GND': return [[x, y]];
    case 'OA': {
      const f = e.flip ? -1 : 1;
      return [[x, y - G * f], [x, y + G * f], [x + 4 * G, y]]; // in-, in+, out
    }
    case 'NPN': case 'PNP': {
      const f = e.flip ? -1 : 1;
      return [[x, y], [x + 2 * G, y - 2 * G * f], [x + 2 * G, y + 2 * G * f]]; // base, collector, emitter
    }
    default: return [e.p[0], e.p[1]];
  }
}

const key = (p) => p[0] + ',' + p[1];

class UF {
  constructor() { this.p = new Map(); }
  find(x) {
    if (!this.p.has(x)) this.p.set(x, x);
    while (this.p.get(x) !== x) { this.p.set(x, this.p.get(this.p.get(x))); x = this.p.get(x); }
    return x;
  }
  union(a, b) { const ra = this.find(a), rb = this.find(b); if (ra !== rb) this.p.set(ra, rb); }
}

function onSegment(p, a, b) {
  if (key(p) === key(a) || key(p) === key(b)) return false;
  const cross = (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
  if (Math.abs(cross) > 1e-6) return false;
  const dot = (p[0] - a[0]) * (b[0] - a[0]) + (p[1] - a[1]) * (b[1] - a[1]);
  const len = (b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2;
  return dot > 0 && dot < len;
}

function pnjlim(vnew, vold, vt, vcrit) {
  if (vnew > vcrit && Math.abs(vnew - vold) > 2 * vt) {
    if (vold > 0) {
      const arg = 1 + (vnew - vold) / vt;
      vnew = arg > 0 ? vold + vt * Math.log(arg) : vcrit;
    } else vnew = vt * Math.log(vnew / vt);
  }
  return vnew;
}

const VT = 0.025852;
const ZOFF = 0.715; // shifts the Zener knee so |V| = Vz at about 10 mA

function solveLinear(A, b) {
  const n = b.length;
  for (let c = 0; c < n; c++) {
    let piv = c, best = Math.abs(A[c][c]);
    for (let r = c + 1; r < n; r++) { const v = Math.abs(A[r][c]); if (v > best) { best = v; piv = r; } }
    if (best < 1e-18) return null;
    if (piv !== c) { [A[c], A[piv]] = [A[piv], A[c]]; [b[c], b[piv]] = [b[piv], b[c]]; }
    const inv = 1 / A[c][c];
    for (let r = c + 1; r < n; r++) {
      const f = A[r][c] * inv;
      if (f === 0) continue;
      const Ar = A[r], Ac = A[c];
      for (let k = c; k < n; k++) Ar[k] -= f * Ac[k];
      b[r] -= f * b[c];
    }
  }
  const x = new Float64Array(n);
  for (let r = n - 1; r >= 0; r--) {
    let s = b[r];
    for (let k = r + 1; k < n; k++) s -= A[r][k] * x[k];
    x[r] = s / A[r][r];
  }
  return x;
}

export class Circuit {
  constructor() {
    this.els = [];
    this.t = 0;
    this.dt = 5e-6;
    this.dirty = true;
    this.error = null;
    this.warning = null;
  }

  // ---------------------------------------------------------------- topology
  compile() {
    const uf = new UF();
    const wires = this.els.filter(e => e.type === 'wire' || (e.type === 'SW' && e.closed));
    for (const w of wires) uf.union(key(w.p[0]), key(w.p[1]));
    // T-junctions: a terminal that lands in the middle of a wire joins it
    const allTerms = [];
    for (const e of this.els) for (const t of terminals(e)) allTerms.push(t);
    for (const w of this.els.filter(e => e.type === 'wire')) {
      for (const t of allTerms) if (onSegment(t, w.p[0], w.p[1])) uf.union(key(t), key(w.p[0]));
    }
    for (const e of this.els) for (const t of terminals(e)) uf.find(key(t));

    // ground
    const gnds = this.els.filter(e => e.type === 'GND');
    let groundRoot = gnds.length ? uf.find(key(gnds[0].p[0])) : null;
    for (const g of gnds.slice(1)) uf.union(key(g.p[0]), key(gnds[0].p[0]));
    if (gnds.length) groundRoot = uf.find(key(gnds[0].p[0]));
    this.warning = null;
    if (!groundRoot) {
      const src = this.els.find(e => e.type === 'V' || e.type === 'AC');
      if (src) { groundRoot = uf.find(key(terminals(src)[0])); this.warning = 'No ground symbol, so the negative side of the first source is treated as 0 V.'; }
    }

    const nodeIndex = new Map(); // root -> index (ground = -1)
    let n = 0;
    for (const [k] of uf.p) {
      const r = uf.find(k);
      if (nodeIndex.has(r)) continue;
      nodeIndex.set(r, r === groundRoot ? -1 : n++);
    }
    this.uf = uf;
    this.nodeIndex = nodeIndex;
    this.nNodes = n;
    const node = (p) => nodeIndex.get(uf.find(key(p)));

    // extra MNA rows for voltage-defined elements
    let m = n;
    for (const e of this.els) {
      e._n = terminals(e).map(node);
      e._k = -1;
      if (e.type === 'V' || e.type === 'AC' || e.type === 'AM' || e.type === 'OA') e._k = m++;
      e._st ??= {};
    }
    this.size = m;
    this.x = new Float64Array(m);
    this.dirty = false;
  }

  nodeOf(p) {
    if (this.dirty) this.compile();
    const r = this.uf.p.has(key(p)) ? this.uf.find(key(p)) : null;
    return r == null ? null : this.nodeIndex.get(r);
  }
  voltageAt(p) {
    let i = this.nodeOf(p);
    if (i == null) {
      const w = this.els.find(e => e.type === 'wire' && onSegment(p, e.p[0], e.p[1]));
      if (!w) return null;
      i = this.nodeOf(w.p[0]);
      if (i == null) return null;
    }
    return i < 0 ? 0 : this.x[i];
  }

  // Settle to the DC operating point: capacitors open, inductors shorted,
  // sources frozen at t = 0. Leaves the reactive state charged accordingly.
  dcOperatingPoint() {
    if (this.dirty) this.compile();
    const keepDt = this.dt;
    this.dt = 1e3;
    this.dcMode = true;
    for (let i = 0; i < 6; i++) { this.t = -this.dt; this.step(); }
    this.dcMode = false;
    this.dt = keepDt;
    this.t = 0;
  }
  sameNode(p, q) {
    if (this.dirty) this.compile();
    return this.uf.find(key(p)) === this.uf.find(key(q));
  }

  sourceValue(e, t) {
    if (e.type === 'V') return e.value;
    if (this.dcMode) return e.offset;
    const w = 2 * Math.PI * e.freq * t;
    const ph = (e.freq * t) % 1;
    let s;
    if (e.wave === 'square') s = ph < 0.5 ? 1 : -1;
    else if (e.wave === 'triangle') s = ph < 0.5 ? 4 * ph - 1 : 3 - 4 * ph;
    else if (e.wave === 'sawtooth') s = 2 * ph - 1;
    else s = Math.sin(w);
    return e.offset + e.amp * s;
  }

  // ---------------------------------------------------------------- one time step
  step() {
    if (this.dirty) this.compile();
    const N = this.size, nn = this.nNodes, dt = this.dt, t = this.t + dt;
    const x = this.x;
    const v = (i) => (i < 0 ? 0 : x[i]);
    let converged = false;
    let iter = 0;
    const MAXIT = 60;
    for (; iter < MAXIT; iter++) {
      const A = Array.from({ length: N }, () => new Float64Array(N));
      const b = new Float64Array(N);
      const addG = (i, j, g) => { if (i >= 0 && j >= 0) A[i][j] += g; };
      const cond = (a, c, g) => { addG(a, a, g); addG(c, c, g); addG(a, c, -g); addG(c, a, -g); };
      const inj = (i, cur) => { if (i >= 0) b[i] += cur; }; // current injected into node i
      // gmin to ground keeps floating nodes solvable
      for (let i = 0; i < nn; i++) A[i][i] += 1e-12;

      let nonlinearMoved = false;
      for (const e of this.els) {
        const [a, c, d] = e._n;
        const s = e._st;
        switch (e.type) {
          case 'R': cond(a, c, 1 / Math.max(e.value, 1e-6)); break;
          case 'VM': cond(a, c, 1e-9); break;
          case 'SW': if (!e.closed) cond(a, c, 1e-12); break;
          case 'I': inj(a, -e.value); inj(c, e.value); break;
          case 'C': {
            const g = e.value / dt;
            const vp = s.v ?? 0;
            // i = g·v − g·v_prev  →  the history term moves to the right-hand side
            cond(a, c, g); inj(a, g * vp); inj(c, -g * vp);
            break;
          }
          case 'L': {
            const g = dt / e.value;
            const ip = s.i ?? 0;
            cond(a, c, g); inj(a, -ip); inj(c, ip);
            break;
          }
          case 'V': case 'AC': case 'AM': {
            const k = e._k;
            // a = negative, c = positive
            if (c >= 0) { A[c][k] += 1; A[k][c] += 1; }
            if (a >= 0) { A[a][k] -= 1; A[k][a] -= 1; }
            b[k] = e.type === 'AM' ? 0 : this.sourceValue(e, t);
            break;
          }
          case 'D': case 'LED': case 'Z': {
            const p = diodeParams(e);
            const vd = s.vd ?? 0;
            let I = p.is * (Math.exp(vd / p.nvt) - 1);
            let g = (p.is / p.nvt) * Math.exp(vd / p.nvt);
            if (e.type === 'Z') {
              const ex = Math.exp(-(vd + e.vz - ZOFF) / p.nvt);
              I -= p.is * ex;
              g += (p.is / p.nvt) * ex;
            }
            g += 1e-12;
            const ieq = I - g * vd;
            cond(a, c, g); inj(a, -ieq); inj(c, ieq);
            break;
          }
          case 'NPN': case 'PNP': {
            // terminals: base a, collector c, emitter d
            const pol = e.type === 'NPN' ? 1 : -1;
            const bf = e.beta, br = 1, is = 1e-14;
            const vbe = s.vbe ?? 0, vbc = s.vbc ?? 0;
            const ef = Math.exp(vbe / VT), er = Math.exp(vbc / VT);
            const If = is * (ef - 1), Ir = is * (er - 1);
            const gf = (is / VT) * ef + 1e-12, gr = (is / VT) * er + 1e-12;
            const Ic = If - Ir * (1 + 1 / br), Ib = If / bf + Ir / br;
            const dIc = { be: gf, bc: -gr * (1 + 1 / br) }, dIb = { be: gf / bf, bc: gr / br };
            // linearise around the (limited) junction voltages; currents flow into the device
            const kC = pol * (Ic - dIc.be * vbe - dIc.bc * vbc);
            const kB = pol * (Ib - dIb.be * vbe - dIb.bc * vbc);
            const K = { c: kC, b: kB, e: -(kC + kB) };
            const J = {
              c: { b: dIc.be + dIc.bc, c: -dIc.bc, e: -dIc.be },
              b: { b: dIb.be + dIb.bc, c: -dIb.bc, e: -dIb.be },
            };
            J.e = { b: -(J.c.b + J.b.b), c: -(J.c.c + J.b.c), e: -(J.c.e + J.b.e) };
            const nodeOf = { b: a, c, e: d };
            for (const r of ['c', 'b', 'e']) {
              const ri = nodeOf[r];
              if (ri < 0) continue;
              for (const q of ['b', 'c', 'e']) addG(ri, nodeOf[q], J[r][q]);
              b[ri] -= K[r];
            }
            break;
          }
          case 'OA': {
            // in- a, in+ c, out d ; out = vsat * tanh(A vd / vsat)
            const k = e._k, Aol = 1e5, vs = e.vsat;
            const vd = s.vd ?? 0;
            const th = Math.tanh((Aol * vd) / vs);
            const f = vs * th, fp = Aol * (1 - th * th);
            if (d >= 0) { A[d][k] += 1; A[k][d] += 1; }
            if (c >= 0) A[k][c] -= fp;
            if (a >= 0) A[k][a] += fp;
            b[k] = f - fp * vd;
            break;
          }
        }
      }
      const sol = solveLinear(A, b);
      if (!sol) { this.error = 'The circuit cannot be solved. Look for a voltage source shorted by a wire, or two sources in parallel.'; return false; }

      // update non-linear operating points with limiting
      let maxDelta = 0;
      for (let i = 0; i < N; i++) maxDelta = Math.max(maxDelta, Math.abs(sol[i] - x[i]));
      x.set(sol);
      for (const e of this.els) {
        const [a, c, d] = e._n, s = e._st;
        if (e.type === 'D' || e.type === 'LED' || e.type === 'Z') {
          const p = diodeParams(e);
          let vn = v(a) - v(c);
          const old = s.vd ?? 0;
          const vzz = e.vz - ZOFF;
          if (e.type === 'Z' && vn < -vzz + 0.1) {
            const rn = pnjlim(-vn - vzz, -old - vzz, p.nvt, p.vcrit);
            vn = -(rn + vzz);
          } else vn = pnjlim(vn, old, p.nvt, p.vcrit);
          if (Math.abs(vn - old) > 1e-6) nonlinearMoved = true;
          s.vd = vn;
        } else if (e.type === 'NPN' || e.type === 'PNP') {
          const pol = e.type === 'NPN' ? 1 : -1;
          const vcrit = VT * Math.log(VT / (Math.SQRT2 * 1e-14));
          const nbe = pnjlim(pol * (v(a) - v(d)), s.vbe ?? 0, VT, vcrit);
          const nbc = pnjlim(pol * (v(a) - v(c)), s.vbc ?? 0, VT, vcrit);
          if (Math.abs(nbe - (s.vbe ?? 0)) > 1e-6 || Math.abs(nbc - (s.vbc ?? 0)) > 1e-6) nonlinearMoved = true;
          s.vbe = nbe; s.vbc = nbc;
        } else if (e.type === 'OA') {
          let vd = v(c) - v(a);
          const old = s.vd ?? 0;
          // limit the step in tanh's argument unless both ends sit deep in the same rail
          const k = 1e5 / e.vsat;
          const uo = old * k, un = vd * k;
          const deep = Math.abs(uo) > 4 && Math.abs(un) > 4 && Math.sign(uo) === Math.sign(un);
          if (!deep && Math.abs(un - uo) > 4) vd = (uo + Math.sign(un - uo) * 4) / k;
          if (Math.abs(vd - old) > 1e-9) nonlinearMoved = true;
          s.vd = vd;
        }
      }
      if (!nonlinearMoved && maxDelta < 1e-6) { converged = true; break; }
      if (!this.els.some(e => /^(D|LED|Z|NPN|PNP|OA)$/.test(e.type))) { converged = true; break; }
    }

    // commit reactive state and compute branch currents
    for (const e of this.els) {
      const [a, c] = e._n, s = e._st;
      const vab = v(a) - v(c);
      switch (e.type) {
        case 'R': e.cur = vab / e.value; break;
        case 'C': { const vp = s.v ?? 0; e.cur = (e.value / dt) * (vab - vp); s.v = vab; break; }
        case 'L': { const ip = s.i ?? 0; e.cur = ip + (dt / e.value) * vab; s.i = e.cur; break; }
        case 'V': case 'AC': case 'AM': e.cur = -x[e._k]; break;
        case 'I': e.cur = e.value; break;
        case 'D': case 'LED': case 'Z': {
          const p = diodeParams(e);
          let I = p.is * (Math.exp(vab / p.nvt) - 1);
          if (e.type === 'Z') I -= p.is * Math.exp(-(vab + e.vz - ZOFF) / p.nvt);
          e.cur = I;
          break;
        }
        case 'SW': e.cur = e.closed ? null : 0; break;
        case 'VM': e.cur = 0; break;
        case 'OA': e.cur = -x[e._k]; break;
        case 'NPN': case 'PNP': {
          const pol = e.type === 'NPN' ? 1 : -1;
          const is = 1e-14, ef = Math.exp((s.vbe ?? 0) / VT), er = Math.exp((s.vbc ?? 0) / VT);
          const If = is * (ef - 1), Ir = is * (er - 1);
          e.ic = pol * (If - Ir * 2); e.ib = pol * (If / e.beta + Ir);
          e.cur = e.ic;
          break;
        }
        default: e.cur = 0;
      }
      e.volt = vab;
      if (e.type === 'VM') e.reading = -vab;
    }
    this.t = t;
    this.error = converged ? null : this.error;
    this.lastIter = iter;
    return true;
  }

  reset() {
    this.t = 0;
    for (const e of this.els) { e._st = {}; e.cur = 0; e.volt = 0; }
    this.dirty = true;
  }
}

function diodeParams(e) {
  if (e.type === 'LED') {
    const vf = (LED_COLORS[e.color] || LED_COLORS.red).vf;
    // choose Is so that 10 mA flows at the rated forward voltage
    const nvt = 2 * VT;
    const is = 0.01 / Math.exp(vf / nvt);
    return { is, nvt, vcrit: nvt * Math.log(nvt / (Math.SQRT2 * is)) };
  }
  const is = 1e-14, nvt = VT;
  return { is, nvt, vcrit: nvt * Math.log(nvt / (Math.SQRT2 * is)) };
}
