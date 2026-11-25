// Trainer geometry, connectivity and the logic solver.
import { CHIPS } from './chips.js';

export const P = 15;            // hole pitch in SVG units
export const COLS = 60;
export const X0 = 62;
export const VIEW = { w: 1010, h: 700 };

export const ROWS = {
  tp: 222, tn: 237,
  a: 270, b: 285, c: 300, d: 315, e: 330,
  f: 360, g: 375, h: 390, i: 405, j: 420,
  bp: 453, bn: 468,
};
export const TOP_ROWS = ['a', 'b', 'c', 'd', 'e'];
export const BOT_ROWS = ['f', 'g', 'h', 'i', 'j'];
export const RAIL_ROWS = ['tp', 'tn', 'bp', 'bn'];
export const RAIL_NAMES = { tp: 'top + rail', tn: 'top − rail', bp: 'bottom + rail', bn: 'bottom − rail' };

export const colX = (c) => X0 + c * P;
export const railHasHole = (c) => c % 6 !== 5;

// ---- trainer pads (everything that is not a breadboard hole) ----
export const PADS = {};
const pad = (id, x, y, label, group) => { PADS[id] = { id, x, y, label, group }; };

for (let i = 0; i < 8; i++) pad('led' + (i + 1), 78 + i * 50, 132, 'L' + (i + 1), 'led');
['a', 'b', 'c', 'd', 'e', 'f', 'g'].forEach((s, i) => pad('seg' + s, 497 + i * 22, 168, s, 'seg'));
pad('probe', 712, 150, 'Probe', 'probe');
pad('clk1', 846, 150, 'CLK', 'clk');
pad('clk2', 870, 150, 'CLK', 'clk');
pad('clkn', 900, 150, 'CLK̅', 'clkn');
for (let i = 0; i < 3; i++) pad('vcc' + (i + 1), 66 + i * 26, 540, '+5V', 'vcc');
for (let i = 0; i < 3; i++) pad('gnd' + (i + 1), 66 + i * 26, 600, 'GND', 'gnd');
for (let i = 0; i < 8; i++) pad('sw' + (i + 1), 262 + i * 58, 530, 'S' + (i + 1), 'sw');
pad('pb1', 776, 530, 'P1', 'pb');
pad('pb1n', 802, 530, 'P1̅', 'pbn');
pad('pb2', 876, 530, 'P2', 'pb');
pad('pb2n', 902, 530, 'P2̅', 'pbn');

// ---- point ids ----
// breadboard: "a12" style (row + 1-based column), rails "tp12". pads: their id.
export function holeId(row, col) { return row + (col + 1); }
export function parsePoint(id) {
  if (PADS[id]) return { kind: 'pad', id, ...PADS[id] };
  const m = id.match(/^(tp|tn|bp|bn|[a-j])(\d+)$/);
  if (!m) return null;
  const row = m[1], col = +m[2] - 1;
  return { kind: 'hole', id, row, col, x: colX(col), y: ROWS[row] };
}
export function pointXY(id) {
  const p = parsePoint(id);
  return p ? { x: p.x, y: p.y } : null;
}

// Electrical node a point belongs to before any wires
export function baseNode(id) {
  if (PADS[id]) {
    const g = PADS[id].group;
    if (g === 'vcc') return 'VCC';
    if (g === 'gnd') return 'GND';
    if (g === 'clk') return 'CLK';
    return id;
  }
  const p = parsePoint(id);
  if (!p) return id;
  if (RAIL_ROWS.includes(p.row)) return 'R:' + p.row;
  return (TOP_ROWS.includes(p.row) ? 'T' : 'B') + p.col;
}

export function allHoles() {
  const out = [];
  for (let c = 0; c < COLS; c++) {
    for (const r of [...TOP_ROWS, ...BOT_ROWS]) out.push(holeId(r, c));
    if (railHasHole(c)) for (const r of RAIL_ROWS) out.push(holeId(r, c));
  }
  return out;
}

export function describePoint(id) {
  const p = parsePoint(id);
  if (!p) return id;
  if (p.kind === 'pad') {
    const g = p.group;
    if (g === 'led') return 'LED ' + p.label;
    if (g === 'sw') return 'switch ' + p.label;
    if (g === 'seg') return '7-seg input ' + p.label;
    if (g === 'vcc') return '+5V supply';
    if (g === 'gnd') return 'GND';
    if (g === 'clk') return 'clock output';
    if (g === 'clkn') return 'inverted clock';
    if (g === 'pb') return 'pulser ' + p.label;
    if (g === 'pbn') return 'pulser ' + p.label.replace('̅', '') + ' (inverted)';
    return p.label;
  }
  if (RAIL_ROWS.includes(p.row)) return `${RAIL_NAMES[p.row]} (col ${p.col + 1})`;
  return `hole ${p.row}${p.col + 1}`;
}

// ---- chips on the board ----
// pin 1 sits bottom-left (row f), numbering runs counter-clockwise.
export function pinHole(chip, pin) {
  const n = CHIPS[chip.type].pins;
  const half = n / 2;
  if (pin <= half) return holeId('f', chip.col + pin - 1);
  return holeId('e', chip.col + (n - pin));
}
export function chipSpan(type) { return CHIPS[type].pins / 2; }

// ---- union find ----
class UF {
  constructor() { this.p = new Map(); }
  find(x) {
    if (!this.p.has(x)) this.p.set(x, x);
    let r = x;
    while (this.p.get(r) !== r) r = this.p.get(r);
    let c = x;
    while (this.p.get(c) !== r) { const n = this.p.get(c); this.p.set(c, r); c = n; }
    return r;
  }
  union(a, b) {
    const ra = this.find(a), rb = this.find(b);
    if (ra !== rb) this.p.set(ra, rb);
  }
}

// ---- the solver ----
export class Trainer {
  constructor() {
    this.chips = [];      // {id, type, col, ref, burnt, state, outs}
    this.wires = [];      // {id, a, b, color}
    this.switches = Array(8).fill(0);
    this.pulsers = [0, 0];
    this.power = true;
    this.clock = 0;
    this.segMode = 'cc';
    this.result = null;
    this.nextId = 1;
  }

  // Build nets: map from point/base node -> net root
  buildNets() {
    const uf = new UF();
    for (const w of this.wires) uf.union(baseNode(w.a), baseNode(w.b));
    this.uf = uf;
    return uf;
  }
  netOf(pointId) { return this.uf.find(baseNode(pointId)); }

  solve() {
    const uf = this.buildNets();
    const net = (pt) => uf.find(baseNode(pt));
    const vccNet = uf.find('VCC'), gndNet = uf.find('GND');

    // fixed drivers
    const fixed = new Map(); // net -> [{src, v}]
    const add = (m, n, src, v) => { if (!m.has(n)) m.set(n, []); m.get(n).push({ src, v }); };
    if (this.power) {
      add(fixed, vccNet, '+5V supply', 1);
      add(fixed, gndNet, 'GND', 0);
      for (let i = 0; i < 8; i++) add(fixed, net('sw' + (i + 1)), 'switch S' + (i + 1), this.switches[i]);
      add(fixed, net('pb1'), 'pulser P1', this.pulsers[0]);
      add(fixed, net('pb1n'), 'pulser P1̅', +!this.pulsers[0]);
      add(fixed, net('pb2'), 'pulser P2', this.pulsers[1]);
      add(fixed, net('pb2n'), 'pulser P2̅', +!this.pulsers[1]);
      add(fixed, net('clk1'), 'clock', this.clock);
      add(fixed, net('clkn'), 'inverted clock', +!this.clock);
    }

    const issues = [];
    const shorted = this.power && vccNet === gndNet;

    // decide which chips are powered
    for (const c of this.chips) {
      const def = CHIPS[c.type];
      c.state ??= {};
      c.outs ??= {};
      const nv = net(pinHole(c, def.vcc)), ng = net(pinHole(c, def.gnd));
      c.reversed = this.power && nv === gndNet && ng === vccNet && !shorted;
      if (c.reversed) c.burnt = true;
      c.powered = this.power && !shorted && !c.burnt && nv === vccNet && ng === gndNet;
      if (!c.powered) { c.outs = {}; c.state = c.burnt ? c.state : {}; }
    }

    let values = new Map();
    let drivers;
    const settle = () => {
      drivers = new Map(fixed);
      for (const [k, arr] of fixed) drivers.set(k, arr.slice());
      for (const c of this.chips) {
        if (!c.powered) continue;
        for (const [pin, v] of Object.entries(c.outs)) {
          add(drivers, net(pinHole(c, +pin)), `${c.ref} pin ${pin}`, v);
        }
      }
      values = new Map();
      for (const [n, arr] of drivers) {
        const hi = arr.some(d => d.v === 1), lo = arr.some(d => d.v === 0);
        values.set(n, hi && lo ? 'X' : hi ? 1 : 0);
      }
    };

    let oscillating = false;
    for (let iter = 0; ; iter++) {
      settle();
      if (iter > 80) { oscillating = true; break; }
      let changed = false;
      for (const c of this.chips) {
        if (!c.powered) continue;
        const def = CHIPS[c.type];
        const read = (pin) => {
          const v = values.get(net(pinHole(c, pin)));
          return v === 0 ? 0 : 1; // floating TTL inputs read HIGH
        };
        const o = def.eval(read, c.state);
        for (const p of def.out) {
          if (o[p] !== c.outs[p]) { changed = true; }
        }
        c.outs = o;
      }
      if (!changed) break;
    }

    // ---- diagnostics ----
    if (shorted) issues.push({ level: 'bad', text: '+5V is shorted straight to GND. A real trainer would blow its fuse — remove the wire that joins the two rails.' });
    if (oscillating) issues.push({ level: 'warn', text: 'The circuit never settles: there is a feedback loop that keeps toggling (for example an inverter feeding itself).' });

    // nets that have something attached (used to decide what to complain about)
    const usage = new Map();
    const use = (n, what) => { if (!usage.has(n)) usage.set(n, []); usage.get(n).push(what); };
    for (const w of this.wires) { use(net(w.a), 'wire'); use(net(w.b), 'wire'); }

    for (const [n, arr] of drivers) {
      const hi = arr.filter(d => d.v === 1), lo = arr.filter(d => d.v === 0);
      if (hi.length && lo.length && !(shorted && n === vccNet)) {
        issues.push({ level: 'bad', net: n, text: `Output conflict: ${hi[0].src} drives HIGH while ${lo[0].src} drives LOW on the same node.` });
      }
    }

    let unusedFloating = 0;
    for (const c of this.chips) {
      const def = CHIPS[c.type];
      if (c.burnt) {
        issues.push({ level: 'bad', chip: c.id, text: `${c.ref} (${c.type}) is burnt — ${c.reversed ? 'VCC and GND were swapped' : 'it was powered backwards earlier'}. Delete it and place a fresh chip.` });
        continue;
      }
      if (!this.power) continue;
      const nv = net(pinHole(c, def.vcc)), ng = net(pinHole(c, def.gnd));
      if (!c.powered && !shorted) {
        const miss = [];
        if (nv !== vccNet) miss.push(`pin ${def.vcc} (VCC) to +5V`);
        if (ng !== gndNet) miss.push(`pin ${def.gnd} (GND) to ground`);
        issues.push({ level: 'warn', chip: c.id, text: `${c.ref} (${c.type}) has no power. Connect ${miss.join(' and ')}.` });
        continue;
      }
      for (let p = 1; p <= def.pins; p++) {
        if (def.kind[p] !== 'in') continue;
        const n = net(pinHole(c, p));
        if (!values.has(n)) {
          if (usage.has(n)) issues.push({ level: 'warn', chip: c.id, pin: p, text: `${c.ref} pin ${p} (${def.names[p - 1]}) is wired but nothing drives it. TTL reads that as HIGH.` });
          else unusedFloating++;
        }
      }
    }
    if (unusedFloating) issues.push({ level: 'info', text: `${unusedFloating} unused chip input${unusedFloating > 1 ? 's are' : ' is'} floating. Harmless here, but in the lab tie unused inputs to a rail.` });

    for (let i = 1; i <= 8; i++) {
      const n = net('led' + i);
      if (usage.has(n) && !values.has(n) && this.power) issues.push({ level: 'info', text: `LED L${i} is wired to a node with no driver, so it stays off.` });
    }

    const read = (pt) => {
      if (!this.power) return null;
      const v = values.get(net(pt));
      return v === undefined ? null : v;
    };
    this.result = {
      values, drivers, issues, shorted, oscillating, read,
      leds: Array.from({ length: 8 }, (_, i) => read('led' + (i + 1)) === 1),
      seg: ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map(s => {
        const v = read('seg' + s);
        return this.segMode === 'cc' ? v === 1 : v === 0;
      }),
      probe: read('probe'),
    };
    return this.result;
  }

  levelOfPoint(pt) {
    if (!this.result) return null;
    return this.result.read(pt);
  }

  // ---- editing helpers ----
  occupied() {
    const s = new Map();
    for (const c of this.chips) {
      const n = CHIPS[c.type].pins;
      for (let p = 1; p <= n; p++) s.set(pinHole(c, p), { chip: c, pin: p });
    }
    for (const w of this.wires) {
      if (!PADS[w.a]) s.set(w.a, { wire: w });
      if (!PADS[w.b]) s.set(w.b, { wire: w });
    }
    return s;
  }

  canPlaceChip(type, col, ignoreId) {
    const span = chipSpan(type);
    if (col < 0 || col + span > COLS) return false;
    const occ = this.occupied();
    for (let c = col; c < col + span; c++) {
      for (const r of ['e', 'f']) {
        const o = occ.get(holeId(r, c));
        if (o && !(o.chip && o.chip.id === ignoreId)) return false;
      }
    }
    return true;
  }

  nextRef() {
    const used = new Set(this.chips.map(c => c.ref));
    let i = 1;
    while (used.has('U' + i)) i++;
    return 'U' + i;
  }

  addChip(type, col) {
    const c = { id: 'c' + this.nextId++, type, col, ref: this.nextRef(), burnt: false };
    this.chips.push(c);
    return c;
  }

  addWire(a, b, color) {
    const w = { id: 'w' + this.nextId++, a, b, color };
    this.wires.push(w);
    return w;
  }

  serialize() {
    return {
      v: 1,
      chips: this.chips.map(({ type, col, ref }) => ({ type, col, ref })),
      wires: this.wires.map(({ a, b, color }) => ({ a, b, color })),
      switches: this.switches.slice(),
      segMode: this.segMode,
    };
  }

  load(data) {
    this.chips = [];
    this.wires = [];
    for (const c of data.chips || []) if (CHIPS[c.type]) this.chips.push({ id: 'c' + this.nextId++, type: c.type, col: c.col, ref: c.ref, burnt: false });
    for (const w of data.wires || []) if (parsePoint(w.a) && parsePoint(w.b)) this.wires.push({ id: 'w' + this.nextId++, ...w });
    if (data.switches) this.switches = data.switches.slice(0, 8);
    if (data.segMode) this.segMode = data.segMode;
  }
}
