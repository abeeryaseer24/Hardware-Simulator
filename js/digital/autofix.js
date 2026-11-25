// Compare a student's board with the reference circuit and work out the fixes.
// No guessing involved: the reference netlist is known, so this is plain graph comparison.
import { CHIPS } from './chips.js';
import { parsePoint, pinHole, baseNode, holeId, railHasHole, COLS, PADS, describePoint, TOP_ROWS, BOT_ROWS, RAIL_ROWS } from './model.js';

class UF {
  constructor() { this.p = new Map(); }
  find(x) { if (!this.p.has(x)) this.p.set(x, x); while (this.p.get(x) !== x) { this.p.set(x, this.p.get(this.p.get(x))); x = this.p.get(x); } return x; }
  union(a, b) { const ra = this.find(a), rb = this.find(b); if (ra !== rb) this.p.set(ra, rb); }
}
const GROUP_PAD = { VCC: 'vcc1', GND: 'gnd1', CLK: 'clk1' };

// a hole (or pad) that sits in the given base node
function pointIn(node) {
  if (GROUP_PAD[node]) return GROUP_PAD[node];
  if (PADS[node]) return node;
  if (node.startsWith('R:')) { const row = node.slice(2); for (let c = 0; c < COLS; c++) if (railHasHole(c)) return holeId(row, c); }
  const col = +node.slice(1);
  return holeId(node[0] === 'T' ? 'a' : 'j', col);
}

export function diagnose(ref, t) {
  // 1. pair every reference chip with one of the student's chips of the same type
  const used = new Set();
  const pair = ref.chips.map((rc) => {
    const cands = t.chips.filter(c => c.type === rc.type && !used.has(c.id)).sort((a, b) => Math.abs(a.col - rc.col) - Math.abs(b.col - rc.col));
    const c = cands[0];
    if (c) used.add(c.id);
    return c || null;
  });
  const missingChips = ref.chips.map((rc, i) => (pair[i] ? null : { ...rc, index: i })).filter(Boolean);
  const extraChips = t.chips.filter(c => !used.has(c.id));

  // 2. translate a reference point into the student's layout (chip pins follow the chip)
  const pinAt = new Map();
  ref.chips.forEach((rc, i) => {
    if (!pair[i]) return;
    for (let p = 1; p <= CHIPS[rc.type].pins; p++) pinAt.set(baseNode(pinHole(rc, p)), baseNode(pinHole(pair[i], p)));
  });
  const tr = (pt) => { const n = baseNode(pt); return pinAt.get(n) ?? n; };

  // 3. reference nets, expressed in the student's node names
  const refUF = new UF();
  const known = new Set();
  for (const w of ref.wires) { const a = tr(w.a), b = tr(w.b); known.add(a); known.add(b); refUF.union(a, b); }
  for (const n of pinAt.values()) known.add(n);

  // 4. student nets
  const myUF = new UF();
  for (const w of t.wires) myUF.union(baseNode(w.a), baseNode(w.b));

  // wrong wires: join two nodes the reference keeps apart
  const wrong = t.wires.filter(w => {
    const a = baseNode(w.a), b = baseNode(w.b);
    return known.has(a) && known.has(b) && refUF.find(a) !== refUF.find(b);
  });
  // check the rest of the board after removing the wrong wires
  const fixUF = new UF();
  for (const w of t.wires) if (!wrong.includes(w)) fixUF.union(baseNode(w.a), baseNode(w.b));
  const missing = [];
  for (const w of ref.wires) {
    const a = tr(w.a), b = tr(w.b);
    if (fixUF.find(a) !== fixUF.find(b)) { missing.push({ a, b, note: w.note }); fixUF.union(a, b); }
  }
  return { missingChips, extraChips, wrong, missing, pair };
}

export function describeNode(node, t) {
  for (const c of t.chips) {
    const def = CHIPS[c.type];
    for (let p = 1; p <= def.pins; p++) if (baseNode(pinHole(c, p)) === node) return `${c.ref} pin ${p} (${def.names[p - 1].replace('/', '¬')})`;
  }
  return describePoint(pointIn(node)).replace(/ \(col \d+\)$/, '');
}

function freeInStrip(t, h) {
  if (PADS[h]) return h;
  const occ = t.occupied();
  if (!occ.has(h)) return h;
  const p = parsePoint(h);
  const cands = [];
  if (RAIL_ROWS.includes(p.row)) { for (let d = 1; d < COLS; d++) for (const c of [p.col - d, p.col + d]) if (c >= 0 && c < COLS && railHasHole(c)) cands.push(holeId(p.row, c)); }
  else { const rows = TOP_ROWS.includes(p.row) ? TOP_ROWS : BOT_ROWS; rows.forEach(r => cands.push(holeId(r, p.col))); }
  return cands.find(c => !occ.has(c)) || null;
}

// apply the fixes to the trainer; returns the number of changes
export function applyFixes(d, t, colorOf = () => 'blue') {
  let changes = 0;
  // place missing chips where the reference had them, if those holes are free
  for (const rc of d.missingChips) {
    if (t.canPlaceChip(rc.type, rc.col)) { t.addChip(rc.type, rc.col); changes++; }
  }
  t.wires = t.wires.filter(w => !d.wrong.includes(w));
  changes += d.wrong.length;
  for (const m of d.missing) {
    const a = freeInStrip(t, pointIn(m.a)), b = freeInStrip(t, pointIn(m.b));
    if (!a || !b) continue;
    t.addWire(a, b, colorOf(a, b));
    changes++;
  }
  return changes;
}

// repeat until nothing changes (placing a chip can reveal more missing wires)
export function autoFix(ref, t, colorOf) {
  let total = 0;
  for (let i = 0; i < 4; i++) { const d = diagnose(ref, t); const n = applyFixes(d, t, colorOf); total += n; if (!n) break; }
  return total;
}
