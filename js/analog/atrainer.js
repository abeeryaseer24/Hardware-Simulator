// Analog trainer: breadboard + bench instruments, compiled into an MNA circuit.
import { Circuit } from './engine.js';
import { COLS, ROWS, TOP_ROWS, BOT_ROWS, RAIL_ROWS, colX, holeId } from '../digital/model.js';

export { COLS, ROWS, TOP_ROWS, BOT_ROWS, RAIL_ROWS, colX, holeId };
export const VIEW = { w: 1010, h: 700 };

// ---------------------------------------------------------------- instrument terminals
export const APADS = {};
const pad = (id, x, y, label, group, node) => { APADS[id] = { id, x, y, label, group, node: node || id }; };
pad('p12', 58, 156, '+12 V', 'pwr');
pad('g0', 92, 156, 'GND', 'gnd', 'GND');
pad('m12', 126, 156, '−12 V', 'pwr');
pad('var1', 178, 156, 'VAR 1', 'pwr');
pad('g1', 206, 156, 'GND', 'gnd', 'GND');
pad('var2', 260, 156, 'VAR 2', 'pwr');
pad('g2', 288, 156, 'GND', 'gnd', 'GND');
pad('fg', 474, 156, 'OUT', 'fg');
pad('g3', 504, 156, 'GND', 'gnd', 'GND');
pad('dmmV', 704, 156, 'V', 'dmm');
pad('dmmC', 734, 156, 'COM', 'dmm');
pad('a1in', 798, 156, 'A1 +', 'amm');
pad('a1out', 828, 156, 'A1 −', 'amm');
pad('a2in', 898, 156, 'A2 +', 'amm');
pad('a2out', 928, 156, 'A2 −', 'amm');
pad('ch1', 372, 542, 'CH1', 'scope');
pad('ch2', 404, 542, 'CH2', 'scope');
pad('g4', 436, 542, 'GND', 'gnd', 'GND');
pad('s1a', 496, 556, 'S1', 'sw');
pad('s1b', 556, 556, 'S1', 'sw');
pad('s2a', 496, 626, 'S2', 'sw');
pad('s2b', 556, 626, 'S2', 'sw');
pad('ccp', 630, 556, 'I +', 'cc');
pad('ccn', 690, 556, 'I −', 'cc');
pad('pot1', 790, 556, '1', 'pot');
pad('potw', 850, 556, 'W', 'pot');
pad('pot3', 910, 556, '3', 'pot');

export const railHasHole = (c) => c % 6 !== 5;

export function parsePoint(id) {
  if (APADS[id]) return { kind: 'pad', ...APADS[id] };
  const m = /^(tp|tn|bp|bn|[a-j])(\d+)$/.exec(id);
  if (!m) return null;
  const col = +m[2] - 1;
  return { kind: 'hole', id, row: m[1], col, x: colX(col), y: ROWS[m[1]] };
}
export const pointXY = (id) => { const p = parsePoint(id); return p ? { x: p.x, y: p.y } : null; };
export function baseNode(id) {
  if (APADS[id]) return APADS[id].node;
  const p = parsePoint(id);
  if (!p) return id;
  if (RAIL_ROWS.includes(p.row)) return 'R:' + p.row;
  return (TOP_ROWS.includes(p.row) ? 'T' : 'B') + p.col;
}
export function describePoint(id) {
  const p = parsePoint(id);
  if (!p) return id;
  if (p.kind === 'pad') return APADS[id].label + ({ pwr: ' supply', gnd: '', fg: ' (function generator)', dmm: ' (multimeter)', amm: '', scope: ' (scope)', sw: ' switch', cc: ' (current source)', pot: ' (pot)' }[p.group] || '');
  if (RAIL_ROWS.includes(p.row)) return `${{ tp: 'top +', tn: 'top −', bp: 'bottom +', bn: 'bottom −' }[p.row]} rail, col ${p.col + 1}`;
  return `hole ${p.row}${p.col + 1}`;
}

// ---------------------------------------------------------------- parts
export const PARTS = {
  R: { name: 'Resistor', leads: 2, unit: 'Ω', def: 1000 },
  C: { name: 'Capacitor', leads: 2, unit: 'F', def: 100e-9 },
  CE: { name: 'Electrolytic capacitor', leads: 2, unit: 'F', def: 100e-6, polar: true },
  L: { name: 'Inductor', leads: 2, unit: 'H', def: 10e-3 },
  D: { name: 'Diode 1N4007', leads: 2, polar: true },
  LED: { name: 'LED', leads: 2, polar: true },
  Z: { name: 'Zener diode', leads: 2, unit: 'V', def: 5.1, polar: true },
  NPN: { name: 'NPN transistor BC547', leads: 3 },
  PNP: { name: 'PNP transistor BC557', leads: 3 },
  OA: { name: 'Op-amp µA741', leads: 8 },
};
export const LED_RGB = { red: '#ff3b30', green: '#2fe36b', yellow: '#ffd60a', blue: '#3a8bff', white: '#f4f7ff' };

// 741 pins: 1 offset, 2 IN−, 3 IN+, 4 V−, 5 offset, 6 OUT, 7 V+, 8 NC (pin 1 bottom-left)
export function opampPin(col, pin) { return pin <= 4 ? holeId('f', col + pin - 1) : holeId('e', col + (8 - pin)); }
export function partHoles(p) {
  if (p.type === 'OA') return [1, 2, 3, 4, 5, 6, 7, 8].map(n => opampPin(p.col, n));
  return p.holes;
}
export function partLabel(p) {
  const fmt = (v, u) => {
    const a = Math.abs(v); const steps = [[1e6, 'M'], [1e3, 'k'], [1, ''], [1e-3, 'm'], [1e-6, 'µ'], [1e-9, 'n'], [1e-12, 'p']];
    for (const [f, s] of steps) if (a >= f * 0.9995) return +(v / f).toPrecision(3) + ' ' + s + u;
    return v + ' ' + u;
  };
  switch (p.type) {
    case 'R': return fmt(p.value, 'Ω');
    case 'C': case 'CE': return fmt(p.value, 'F');
    case 'L': return fmt(p.value, 'H');
    case 'Z': return p.value + ' V Zener';
    case 'LED': return p.color + ' LED';
    case 'D': return '1N4007';
    case 'NPN': return 'BC547';
    case 'PNP': return 'BC557';
    case 'OA': return 'µA741';
  }
  return '';
}

class UF {
  constructor() { this.p = new Map(); }
  find(x) { if (!this.p.has(x)) this.p.set(x, x); while (this.p.get(x) !== x) { this.p.set(x, this.p.get(this.p.get(x))); x = this.p.get(x); } return x; }
  union(a, b) { const ra = this.find(a), rb = this.find(b); if (ra !== rb) this.p.set(ra, rb); }
}

export const DEFAULT_SETTINGS = () => ({
  power: true, var1: 5, var2: 5,
  fg: { wave: 'sine', freq: 1000, amp: 1, offset: 0 },
  cc: 0.005, pot: { r: 10000, pos: 0.5 }, s1: false, s2: false,
});

export class AnalogTrainer {
  constructor() {
    this.parts = [];
    this.wires = [];
    this.settings = DEFAULT_SETTINGS();
    this.circuit = new Circuit();
    this.dirty = true;
    this.issues = [];
    this.nextId = 1;
    this.window = 0.01;
  }

  // ---------------------------------------------------------------- editing
  occupied() {
    const m = new Map();
    for (const p of this.parts) partHoles(p).forEach((h, i) => m.set(h, { part: p, lead: i }));
    for (const w of this.wires) for (const h of [w.a, w.b]) if (!APADS[h]) m.set(h, { wire: w });
    return m;
  }
  nextRef(type) {
    const prefix = { R: 'R', C: 'C', CE: 'C', L: 'L', D: 'D', LED: 'D', Z: 'D', NPN: 'Q', PNP: 'Q', OA: 'U' }[type];
    const used = new Set(this.parts.map(p => p.ref));
    let i = 1;
    while (used.has(prefix + i)) i++;
    return prefix + i;
  }
  addPart(p) {
    const def = PARTS[p.type];
    const part = { id: 'p' + this.nextId++, ref: p.ref || this.nextRef(p.type), type: p.type, holes: p.holes, col: p.col, value: p.value ?? def.def, color: p.color || 'red' };
    this.parts.push(part);
    this.dirty = true;
    return part;
  }
  addWire(a, b, color) {
    const w = { id: 'w' + this.nextId++, a, b, color };
    this.wires.push(w);
    this.dirty = true;
    return w;
  }
  serialize() {
    return {
      v: 1,
      parts: this.parts.map(({ ref, type, holes, col, value, color }) => ({ ref, type, holes, col, value, color })),
      wires: this.wires.map(({ a, b, color }) => ({ a, b, color })),
      settings: structuredClone(this.settings),
    };
  }
  load(d) {
    this.parts = []; this.wires = [];
    for (const p of d.parts || []) if (PARTS[p.type]) this.addPart(p);
    for (const w of d.wires || []) if (parsePoint(w.a) && parsePoint(w.b)) this.addWire(w.a, w.b, w.color || 'blue');
    this.settings = Object.assign(DEFAULT_SETTINGS(), structuredClone(d.settings || {}));
    this.dirty = true;
  }

  // ---------------------------------------------------------------- compile to MNA
  compile() {
    const s = this.settings;
    const uf = new UF();
    for (const w of this.wires) uf.union(baseNode(w.a), baseNode(w.b));
    if (s.s1) uf.union('s1a', 's1b');
    if (s.s2) uf.union('s2a', 's2b');
    const node = (pt) => uf.find(baseNode(pt));
    this.uf = uf;
    const index = new Map();
    const pt = (root) => { if (!index.has(root)) index.set(root, index.size + 1); const k = index.get(root); return [k * 20, k * k * 20]; };
    const P = (id) => pt(node(id));
    const els = [];
    const issues = [];
    const gndRoot = node('g0');

    // usage count per node (how many things touch it)
    const usage = new Map();
    const touch = (r) => usage.set(r, (usage.get(r) || 0) + 1);
    for (const w of this.wires) { touch(node(w.a)); touch(node(w.b)); }
    for (const p of this.parts) for (const h of partHoles(p)) touch(node(h));
    this.usage = usage;

    els.push({ type: 'GND', p: [P('g0')] });
    const srcPairs = [];
    const addSource = (name, neg, pos, el) => {
      const a = node(neg), b = node(pos);
      if (!(usage.get(b) > 0 || usage.get(a) > 0)) return; // not wired, ignore
      if (a === b) { issues.push({ level: 'bad', text: `${name} is shorted: its output and ground are joined. A real supply would trip; remove the wire that joins them.` }); return; }
      const key = [a, b].sort().join('|');
      if (srcPairs.includes(key)) { issues.push({ level: 'bad', text: `${name} is connected straight across another supply. Two sources must never be tied together.` }); return; }
      srcPairs.push(key);
      els.push({ ...el, p: [pt(a), pt(b)] });
    };
    if (s.power) {
      addSource('The +12 V supply', 'g0', 'p12', { type: 'V', value: 12 });
      addSource('The −12 V supply', 'm12', 'g0', { type: 'V', value: 12 });
      addSource('VAR 1', 'g0', 'var1', { type: 'V', value: s.var1 });
      addSource('VAR 2', 'g0', 'var2', { type: 'V', value: s.var2 });
      addSource('The function generator', 'g0', 'fg', { type: 'AC', amp: s.fg.amp, freq: s.fg.freq, offset: s.fg.offset, wave: s.fg.wave });
      if ((usage.get(node('ccp')) || 0) > 0 && (usage.get(node('ccn')) || 0) > 0) els.push({ type: 'I', value: s.cc, p: [P('ccn'), P('ccp')] });
    }
    const dmm = { type: 'VM', p: [P('dmmC'), P('dmmV')] };
    els.push(dmm);
    const amms = {};
    for (const a of ['a1', 'a2']) {
      const inN = node(a + 'in'), outN = node(a + 'out');
      if (inN !== outN && (usage.get(inN) || usage.get(outN))) { amms[a] = { type: 'AM', p: [pt(inN), pt(outN)] }; els.push(amms[a]); }
    }
    // potentiometer
    const potEls = [];
    if (usage.get(node('pot1')) || usage.get(node('pot3')) || usage.get(node('potw'))) {
      const r = s.pot.r, x = s.pot.pos;
      potEls.push({ type: 'R', value: Math.max(1, r * (1 - x)), p: [P('pot1'), P('potw')] }, { type: 'R', value: Math.max(1, r * x), p: [P('potw'), P('pot3')] });
      els.push(...potEls);
    }

    this.partEls = new Map();
    for (const p of this.parts) {
      const h = partHoles(p);
      const n = h.map(node);
      if (p.type !== 'OA' && new Set(n).size < n.length) issues.push({ level: 'warn', text: `${p.ref} has two leads in the same strip, so it is shorted out and does nothing.` });
      let e = null;
      switch (p.type) {
        case 'R': e = { type: 'R', value: p.value, p: [P(h[0]), P(h[1])] }; break;
        case 'C': case 'CE': e = { type: 'C', value: p.value, p: [P(h[0]), P(h[1])] }; break;
        case 'L': e = { type: 'L', value: p.value, p: [P(h[0]), P(h[1])] }; break;
        case 'D': e = { type: 'D', p: [P(h[0]), P(h[1])] }; break;
        case 'LED': e = { type: 'LED', color: p.color, p: [P(h[0]), P(h[1])] }; break;
        case 'Z': e = { type: 'Z', vz: p.value, p: [P(h[0]), P(h[1])] }; break;
        case 'NPN': case 'PNP': e = { type: p.type, beta: 150, p: [P(h[1])], terms: [P(h[1]), P(h[0]), P(h[2])] }; break; // holes: C, B, E
        case 'OA': {
          const powered = s.power && node(h[6]) === node('p12') && node(h[3]) === node('m12');
          if (!powered) { issues.push({ level: 'warn', text: `${p.ref} (741) has no power. Pin 7 goes to +12 V and pin 4 to −12 V.` }); break; }
          e = { type: 'OA', vsat: 10.5, p: [P(h[1])], terms: [P(h[1]), P(h[2]), P(h[5])] };
          break;
        }
      }
      if (e) { e.partId = p.id; els.push(e); this.partEls.set(p.id, e); }
    }
    this.dmmEl = dmm;
    this.ammEls = amms;
    this.potEls = potEls;
    this.compileIssues = issues;
    const c = this.circuit;
    c.els = els;
    c.dt = this.window / 600;
    c.reset();
    c.dcOperatingPoint();
    this.dirty = false;
    this.nodeRoot = node;
    this.pointOf = (id) => { const r = node(id); return index.has(r) ? pt(r) : null; };
  }

  // values that change without a topology change
  syncSettings() {
    const s = this.settings;
    for (const e of this.circuit.els) {
      if (e.type === 'AC') Object.assign(e, { amp: s.fg.amp, freq: s.fg.freq, offset: s.fg.offset, wave: s.fg.wave });
    }
    // DC sources and pot are cheap to rebuild
  }

  step(n = 1) {
    if (this.dirty) this.compile();
    for (let i = 0; i < n; i++) if (!this.circuit.step()) return false;
    return true;
  }

  voltage(id) {
    if (this.dirty) this.compile();
    const r = this.nodeRoot(id);
    if (!this.usage.get(r) && !APADS[id]) return null;
    const p = this.pointOf(id);
    return p ? (this.circuit.voltageAt(p) ?? 0) : 0;
  }
  connected(id) { if (this.dirty) this.compile(); return (this.usage.get(this.nodeRoot(id)) || 0) > 0; }

  readings() {
    const dmmOn = this.connected('dmmV') && this.connected('dmmC');
    return {
      dmm: dmmOn ? this.dmmEl.reading ?? 0 : null,
      a1: this.ammEls.a1 ? this.ammEls.a1.cur ?? 0 : null,
      a2: this.ammEls.a2 ? this.ammEls.a2.cur ?? 0 : null,
      ch1: this.connected('ch1') ? this.voltage('ch1') : null,
      ch2: this.connected('ch2') ? this.voltage('ch2') : null,
    };
  }

  partState(p) {
    const e = this.partEls?.get(p.id);
    if (!e) return null;
    const V = e.type === 'NPN' || e.type === 'PNP' ? null : e.volt;
    return { V, I: e.type === 'NPN' || e.type === 'PNP' ? e.ic : e.cur, ib: e.ib };
  }

  // warnings that depend on the live operating point
  liveIssues() {
    if (this.dirty) this.compile();
    const out = [...(this.compileIssues || [])];
    for (const p of this.parts) {
      const st = this.partState(p);
      if (!st) continue;
      if (p.type === 'R' && st.V != null && Math.abs(st.V * st.I) > 0.25) out.push({ level: 'warn', text: `${p.ref} (${partLabel(p)}) dissipates ${(Math.abs(st.V * st.I)).toFixed(2)} W, more than a ¼ W resistor can handle. It would get hot.` });
      if (p.type === 'LED' && st.I > 0.03) out.push({ level: 'bad', text: `${p.ref} carries ${(st.I * 1000).toFixed(0)} mA. An LED burns out above about 30 mA; add or increase its series resistor.` });
      if (p.type === 'CE' && st.V < -0.5) out.push({ level: 'bad', text: `${p.ref} is an electrolytic capacitor connected the wrong way round. The + lead must be at the higher voltage.` });
    }
    for (const p of this.parts) {
      partHoles(p).forEach((h, i) => {
        if (p.type === 'OA' && ![1, 2, 3, 5, 6].includes(i)) return; // only pins 2, 3, 4, 6, 7 matter
        if ((this.usage.get(this.nodeRoot(h)) || 0) <= 1) out.push({ level: 'info', text: `${p.ref} ${p.type === 'OA' ? 'pin ' + (i + 1) : 'lead ' + (i + 1)} is not connected to anything else.` });
      });
    }
    return out;
  }
}

// Per-part electrical fingerprint used by the practice checker.
export function fingerprint(trainer, duration) {
  if (trainer.dirty) trainer.compile();
  const c = trainer.circuit;
  const steps = Math.max(1, Math.round(duration / c.dt));
  const acc = new Map(trainer.parts.map(p => [p.id, { vmax: 0, imax: 0, vsum: 0, n: 0 }]));
  const meter = { dmm: [], a1: [], a2: [] };
  for (let i = 0; i < steps; i++) {
    if (!c.step()) break;
    if (i < steps / 3) continue; // let transients settle a little
    for (const p of trainer.parts) {
      const st = trainer.partState(p);
      if (!st) continue;
      const a = acc.get(p.id);
      const v = st.V ?? 0, cur = st.I ?? 0;
      a.vmax = Math.max(a.vmax, Math.abs(v)); a.imax = Math.max(a.imax, Math.abs(cur)); a.vsum += Math.abs(v); a.n++;
    }
    const r = trainer.readings();
    for (const k of ['dmm', 'a1', 'a2']) if (r[k] != null) meter[k].push(r[k]);
  }
  const avg = (arr) => (arr.length ? arr.reduce((s, x) => s + x, 0) / arr.length : null);
  return {
    parts: trainer.parts.map(p => { const a = acc.get(p.id); return { ref: p.ref, type: p.type, key: partKey(p), label: partLabel(p), vmax: a.vmax, imax: a.imax, vavg: a.n ? a.vsum / a.n : 0 }; }),
    meters: { dmm: avg(meter.dmm), a1: avg(meter.a1), a2: avg(meter.a2) },
  };
}
export function partKey(p) {
  if (p.type === 'C' || p.type === 'CE') return 'C:' + (+p.value).toPrecision(3);
  if (p.type === 'LED') return 'LED:' + p.color;
  if (['R', 'L', 'Z'].includes(p.type)) return p.type + ':' + (+p.value).toPrecision(3);
  return p.type;
}
