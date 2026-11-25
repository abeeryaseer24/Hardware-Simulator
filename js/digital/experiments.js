// Lab experiments: reference wiring, expected behaviour and the theory blurb.
import { CHIPS } from './chips.js';
import { holeId, pinHole, railHasHole, COLS } from './model.js';

// ---------- a tiny builder so each experiment reads like a wiring list ----------
function builder() {
  const chips = [], wires = [], used = new Set();
  const take = (id) => { used.add(id); return id; };
  const rail = (row, near) => {
    for (let d = 0; d < COLS; d++) {
      for (const c of [near - d, near + d]) {
        if (c < 0 || c >= COLS || !railHasHole(c)) continue;
        const id = holeId(row, c);
        if (!used.has(id)) return take(id);
      }
    }
    throw new Error('rail full');
  };
  const api = {
    chips, wires,
    wire(a, b, note) { wires.push({ a, b, note }); },
    chip(type, col) {
      const c = { type, col };
      chips.push(c);
      const def = CHIPS[type];
      for (let p = 1; p <= def.pins; p++) used.add(pinHole(c, p));
      const h = {
        def, c,
        // a free hole in the same strip as the pin
        p(pin) {
          const hole = pinHole(c, pin);
          const col = +hole.slice(1) - 1;
          const rows = hole[0] === 'f' ? ['g', 'h', 'i', 'j'] : ['d', 'c', 'b', 'a'];
          for (const r of rows) { const id = holeId(r, col); if (!used.has(id)) return take(id); }
          throw new Error('strip full at pin ' + pin);
        },
        top(pin) { return pinHole(c, pin)[0] === 'e'; },
        col(pin) { return +pinHole(c, pin).slice(1) - 1; },
      };
      return h;
    },
    hi(near, top = true) { return rail(top ? 'tp' : 'bp', near); },
    lo(near, top = false) { return rail(top ? 'tn' : 'bn', near); },
    power(h) {
      const v = h.def.vcc, g = h.def.gnd;
      api.wire(h.p(v), h.top(v) ? api.hi(h.col(v), true) : api.hi(h.col(v), false), `${h.def.id} VCC`);
      api.wire(h.p(g), h.top(g) ? api.lo(h.col(g), true) : api.lo(h.col(g), false), `${h.def.id} GND`);
    },
    rails() {
      api.wire('vcc1', rail('tp', 1), 'supply');
      api.wire('gnd1', rail('bn', 1), 'supply');
      api.wire('vcc2', rail('bp', 2), 'supply');
      api.wire('gnd2', rail('tn', 2), 'supply');
    },
  };
  return api;
}

const make = (fn) => { const b = builder(); b.rails(); fn(b); return { chips: b.chips, wires: b.wires }; };

const bits = (n, k) => Array.from({ length: k }, (_, i) => (n >> i) & 1);

// ---------- basic gates ----------
const GATE_INFO = {
  '7408': { name: 'AND', sym: 'A·B', f: (a, b) => a & b, pins: [1, 2, 3] },
  '7432': { name: 'OR', sym: 'A+B', f: (a, b) => a | b, pins: [1, 2, 3] },
  '7400': { name: 'NAND', sym: '(A·B)′', f: (a, b) => +!(a & b), pins: [1, 2, 3] },
  '7402': { name: 'NOR', sym: '(A+B)′', f: (a, b) => +!(a | b), pins: [2, 3, 1] },
  '7486': { name: 'XOR', sym: 'A⊕B', f: (a, b) => a ^ b, pins: [1, 2, 3] },
};

const basic = Object.entries(GATE_INFO).map(([chip, g]) => ({
  id: 'gate-' + g.name.toLowerCase(),
  group: 'Logic gates',
  title: `${g.name} gate (${chip})`,
  aim: `Verify the truth table of a 2-input ${g.name} gate, Y = ${g.sym}.`,
  theory: `<p>The ${chip} holds four identical ${g.name} gates. Pin ${CHIPS[chip].vcc} is VCC and pin ${CHIPS[chip].gnd} is GND, the same on every 14-pin gate chip. Only gate 1 is used here; the other three behave the same way.</p>`,
  inputs: [{ name: 'A', sw: 1 }, { name: 'B', sw: 2 }],
  outputs: [{ name: 'Y', pad: 'led1' }],
  fn: ({ A, B }) => ({ Y: g.f(A, B) }),
  build: () => make((b) => {
    const u = b.chip(chip, 20);
    b.power(u);
    b.wire('sw1', u.p(g.pins[0]), 'A');
    b.wire('sw2', u.p(g.pins[1]), 'B');
    b.wire(u.p(g.pins[2]), 'led1', 'Y');
  }),
}));

basic.splice(2, 0, {
  id: 'gate-not', group: 'Logic gates', title: 'NOT gate (7404)',
  aim: 'Verify the inverter: Y = A′.',
  theory: '<p>The 7404 holds six inverters. Each input sits right next to its output: 1A on pin 1 drives 1Y on pin 2.</p>',
  inputs: [{ name: 'A', sw: 1 }], outputs: [{ name: 'Y', pad: 'led1' }],
  fn: ({ A }) => ({ Y: +!A }),
  build: () => make((b) => {
    const u = b.chip('7404', 20);
    b.power(u);
    b.wire('sw1', u.p(1), 'A');
    b.wire(u.p(2), 'led1', 'Y');
  }),
});

// ---------- universality ----------
const universal = [
  {
    id: 'nand-not-and', group: 'Universal gates', title: 'NAND as NOT and AND',
    aim: 'Build an inverter and an AND gate using only 7400 NAND gates.',
    theory: '<p>Tie both inputs of a NAND together and it becomes an inverter: (A·A)′ = A′. Follow a NAND with that inverter and you undo the inversion, giving AND.</p>',
    inputs: [{ name: 'A', sw: 1 }, { name: 'B', sw: 2 }],
    outputs: [{ name: 'NOT A', pad: 'led1' }, { name: 'A AND B', pad: 'led2' }],
    fn: ({ A, B }) => ({ 'NOT A': +!A, 'A AND B': A & B }),
    build: () => make((b) => {
      const u = b.chip('7400', 20);
      b.power(u);
      b.wire('sw1', u.p(1), 'A to gate 1');
      b.wire(u.p(1), u.p(2), 'tie gate 1 inputs');
      b.wire(u.p(3), 'led1', 'NOT A');
      b.wire(u.p(4), u.p(1), 'A to gate 2');
      b.wire('sw2', u.p(5), 'B to gate 2');
      b.wire(u.p(6), u.p(9), 'gate 2 out to gate 3');
      b.wire(u.p(9), u.p(10), 'tie gate 3 inputs');
      b.wire(u.p(8), 'led2', 'A AND B');
    }),
  },
  {
    id: 'nand-or', group: 'Universal gates', title: 'NAND as OR',
    aim: 'Build an OR gate from three NAND gates.',
    theory: '<p>By De Morgan, A + B = (A′·B′)′. Invert each input with a NAND, then NAND the two results.</p>',
    inputs: [{ name: 'A', sw: 1 }, { name: 'B', sw: 2 }],
    outputs: [{ name: 'A OR B', pad: 'led1' }],
    fn: ({ A, B }) => ({ 'A OR B': A | B }),
    build: () => make((b) => {
      const u = b.chip('7400', 20);
      b.power(u);
      b.wire('sw1', u.p(1), 'A');
      b.wire(u.p(1), u.p(2), 'gate 1 as inverter');
      b.wire('sw2', u.p(4), 'B');
      b.wire(u.p(4), u.p(5), 'gate 2 as inverter');
      b.wire(u.p(3), u.p(9), 'A′');
      b.wire(u.p(6), u.p(10), 'B′');
      b.wire(u.p(8), 'led1', 'A OR B');
    }),
  },
  {
    id: 'nand-xor', group: 'Universal gates', title: 'NAND as XOR',
    aim: 'Build XOR from exactly four NAND gates (one 7400).',
    theory: '<p>Let N = (A·B)′. Then A ⊕ B = ((A·N)′ · (B·N)′)′. This is the classic four-NAND XOR and it uses every gate on the chip.</p>',
    inputs: [{ name: 'A', sw: 1 }, { name: 'B', sw: 2 }],
    outputs: [{ name: 'A XOR B', pad: 'led1' }],
    fn: ({ A, B }) => ({ 'A XOR B': A ^ B }),
    build: () => make((b) => {
      const u = b.chip('7400', 20);
      b.power(u);
      b.wire('sw1', u.p(1), 'A to gate 1');
      b.wire('sw2', u.p(2), 'B to gate 1');
      b.wire(u.p(1), u.p(4), 'A to gate 2');
      b.wire(u.p(3), u.p(5), 'N to gate 2');
      b.wire(u.p(3), u.p(9), 'N to gate 3');
      b.wire(u.p(2), u.p(10), 'B to gate 3');
      b.wire(u.p(6), u.p(12), 'gate 2 out to gate 4');
      b.wire(u.p(8), u.p(13), 'gate 3 out to gate 4');
      b.wire(u.p(11), 'led1', 'A XOR B');
    }),
  },
  {
    id: 'nor-not-or', group: 'Universal gates', title: 'NOR as NOT and OR',
    aim: 'Build an inverter and an OR gate using only 7402 NOR gates.',
    theory: '<p>The 7402 pinout is different from the other gate chips: each gate has its output first (1Y on pin 1, inputs on pins 2 and 3). Tying both inputs together turns a NOR into an inverter.</p>',
    inputs: [{ name: 'A', sw: 1 }, { name: 'B', sw: 2 }],
    outputs: [{ name: 'NOT A', pad: 'led1' }, { name: 'A OR B', pad: 'led2' }],
    fn: ({ A, B }) => ({ 'NOT A': +!A, 'A OR B': A | B }),
    build: () => make((b) => {
      const u = b.chip('7402', 20);
      b.power(u);
      b.wire('sw1', u.p(2), 'A');
      b.wire(u.p(2), u.p(3), 'tie gate 1 inputs');
      b.wire(u.p(1), 'led1', 'NOT A');
      b.wire(u.p(2), u.p(5), 'A to gate 2');
      b.wire('sw2', u.p(6), 'B to gate 2');
      b.wire(u.p(4), u.p(8), 'gate 2 out to gate 3');
      b.wire(u.p(8), u.p(9), 'tie gate 3 inputs');
      b.wire(u.p(10), 'led2', 'A OR B');
    }),
  },
  {
    id: 'nor-and', group: 'Universal gates', title: 'NOR as AND',
    aim: 'Build an AND gate from three NOR gates.',
    theory: '<p>A·B = (A′ + B′)′. Invert both inputs with NOR gates, then NOR the results together.</p>',
    inputs: [{ name: 'A', sw: 1 }, { name: 'B', sw: 2 }],
    outputs: [{ name: 'A AND B', pad: 'led1' }],
    fn: ({ A, B }) => ({ 'A AND B': A & B }),
    build: () => make((b) => {
      const u = b.chip('7402', 20);
      b.power(u);
      b.wire('sw1', u.p(2), 'A');
      b.wire(u.p(2), u.p(3), 'gate 1 as inverter');
      b.wire('sw2', u.p(5), 'B');
      b.wire(u.p(5), u.p(6), 'gate 2 as inverter');
      b.wire(u.p(1), u.p(8), 'A′');
      b.wire(u.p(4), u.p(9), 'B′');
      b.wire(u.p(10), 'led1', 'A AND B');
    }),
  },
];

// ---------- arithmetic ----------
const arithmetic = [
  {
    id: 'half-adder', group: 'Adders & subtractors', title: 'Half adder',
    aim: 'Add two bits: Sum = A ⊕ B, Carry = A·B.',
    theory: '<p>One XOR gives the sum bit and one AND gives the carry. Two chips are needed because no single 74xx has both gate types.</p>',
    inputs: [{ name: 'A', sw: 1 }, { name: 'B', sw: 2 }],
    outputs: [{ name: 'Sum', pad: 'led1' }, { name: 'Carry', pad: 'led2' }],
    fn: ({ A, B }) => ({ Sum: A ^ B, Carry: A & B }),
    build: () => make((b) => {
      const x = b.chip('7486', 12), a = b.chip('7408', 30);
      b.power(x); b.power(a);
      b.wire('sw1', x.p(1), 'A');
      b.wire('sw2', x.p(2), 'B');
      b.wire(x.p(1), a.p(1), 'A to AND');
      b.wire(x.p(2), a.p(2), 'B to AND');
      b.wire(x.p(3), 'led1', 'Sum');
      b.wire(a.p(3), 'led2', 'Carry');
    }),
  },
  {
    id: 'full-adder', group: 'Adders & subtractors', title: 'Full adder',
    aim: 'Add A + B + Cin. Sum = A ⊕ B ⊕ Cin, Cout = A·B + Cin·(A ⊕ B).',
    theory: '<p>Two half adders and an OR gate. The first XOR output (A ⊕ B) is reused by both the second XOR and the second AND.</p>',
    inputs: [{ name: 'A', sw: 1 }, { name: 'B', sw: 2 }, { name: 'Cin', sw: 3 }],
    outputs: [{ name: 'Sum', pad: 'led1' }, { name: 'Cout', pad: 'led2' }],
    fn: ({ A, B, Cin }) => ({ Sum: A ^ B ^ Cin, Cout: (A & B) | (Cin & (A ^ B)) }),
    build: () => make((b) => {
      const x = b.chip('7486', 6), a = b.chip('7408', 24), o = b.chip('7432', 42);
      b.power(x); b.power(a); b.power(o);
      b.wire('sw1', x.p(1), 'A');
      b.wire('sw2', x.p(2), 'B');
      b.wire(x.p(3), x.p(4), 'A⊕B to XOR 2');
      b.wire('sw3', x.p(5), 'Cin');
      b.wire(x.p(6), 'led1', 'Sum');
      b.wire(x.p(1), a.p(1), 'A to AND 1');
      b.wire(x.p(2), a.p(2), 'B to AND 1');
      b.wire(x.p(3), a.p(4), 'A⊕B to AND 2');
      b.wire(x.p(5), a.p(5), 'Cin to AND 2');
      b.wire(a.p(3), o.p(1), 'AB to OR');
      b.wire(a.p(6), o.p(2), 'Cin(A⊕B) to OR');
      b.wire(o.p(3), 'led2', 'Cout');
    }),
  },
  {
    id: 'half-sub', group: 'Adders & subtractors', title: 'Half subtractor',
    aim: 'Compute A − B: Difference = A ⊕ B, Borrow = A′·B.',
    theory: '<p>The difference bit is the same XOR as the half adder. The borrow is raised only when you subtract 1 from 0, which is A′·B.</p>',
    inputs: [{ name: 'A', sw: 1 }, { name: 'B', sw: 2 }],
    outputs: [{ name: 'Diff', pad: 'led1' }, { name: 'Borrow', pad: 'led2' }],
    fn: ({ A, B }) => ({ Diff: A ^ B, Borrow: +!A & B }),
    build: () => make((b) => {
      const x = b.chip('7486', 4), n = b.chip('7404', 22), a = b.chip('7408', 40);
      b.power(x); b.power(n); b.power(a);
      b.wire('sw1', x.p(1), 'A');
      b.wire('sw2', x.p(2), 'B');
      b.wire(x.p(3), 'led1', 'Diff');
      b.wire(x.p(1), n.p(1), 'A to inverter');
      b.wire(n.p(2), a.p(1), 'A′ to AND');
      b.wire(x.p(2), a.p(2), 'B to AND');
      b.wire(a.p(3), 'led2', 'Borrow');
    }),
  },
  {
    id: 'adder-7483', group: 'Adders & subtractors', title: '4-bit adder (7483)',
    aim: 'Add two 4-bit numbers. A on S1–S4, B on S5–S8, result on L1–L5.',
    theory: '<p>The 7483 is four full adders with the carry chained inside. Watch the odd power pins: VCC is pin 5 and GND is pin 12, not the corners. C0 is grounded so nothing extra is added.</p>',
    inputs: [1, 2, 3, 4].map(i => ({ name: 'A' + i, sw: i })).concat([1, 2, 3, 4].map(i => ({ name: 'B' + i, sw: i + 4 }))),
    outputs: [1, 2, 3, 4].map(i => ({ name: 'S' + i, pad: 'led' + i })).concat([{ name: 'C4', pad: 'led5' }]),
    fn: (v) => {
      const a = v.A1 | v.A2 << 1 | v.A3 << 2 | v.A4 << 3, b = v.B1 | v.B2 << 1 | v.B3 << 2 | v.B4 << 3;
      const s = bits(a + b, 5);
      return { S1: s[0], S2: s[1], S3: s[2], S4: s[3], C4: s[4] };
    },
    build: () => make((b) => {
      const u = b.chip('7483', 26);
      b.power(u);
      [10, 8, 3, 1].forEach((p, i) => b.wire('sw' + (i + 1), u.p(p), 'A' + (i + 1)));
      [11, 7, 4, 16].forEach((p, i) => b.wire('sw' + (i + 5), u.p(p), 'B' + (i + 1)));
      b.wire(u.p(13), b.lo(u.col(13), true), 'C0 to GND');
      [9, 6, 2, 15].forEach((p, i) => b.wire(u.p(p), 'led' + (i + 1), 'S' + (i + 1)));
      b.wire(u.p(14), 'led5', 'C4');
    }),
  },
  {
    id: 'comparator-7485', group: 'Adders & subtractors', title: '4-bit comparator (7485)',
    aim: 'Compare A (S1–S4) with B (S5–S8). L1 = A>B, L2 = A=B, L3 = A<B.',
    theory: '<p>The cascade inputs let you chain comparators for wider words. For a single chip, tie IA=B HIGH and the other two LOW, otherwise the A=B output never lights.</p>',
    inputs: [0, 1, 2, 3].map(i => ({ name: 'A' + i, sw: i + 1 })).concat([0, 1, 2, 3].map(i => ({ name: 'B' + i, sw: i + 5 }))),
    outputs: [{ name: 'A>B', pad: 'led1' }, { name: 'A=B', pad: 'led2' }, { name: 'A<B', pad: 'led3' }],
    fn: (v) => {
      const a = v.A0 | v.A1 << 1 | v.A2 << 2 | v.A3 << 3, b = v.B0 | v.B1 << 1 | v.B2 << 2 | v.B3 << 3;
      return { 'A>B': +(a > b), 'A=B': +(a === b), 'A<B': +(a < b) };
    },
    build: () => make((b) => {
      const u = b.chip('7485', 26);
      b.power(u);
      [10, 12, 13, 15].forEach((p, i) => b.wire('sw' + (i + 1), u.p(p), 'A' + i));
      [9, 11, 14, 1].forEach((p, i) => b.wire('sw' + (i + 5), u.p(p), 'B' + i));
      b.wire(u.p(3), b.hi(u.col(3), false), 'IA=B HIGH');
      b.wire(u.p(2), b.lo(u.col(2), false), 'IA<B LOW');
      b.wire(u.p(4), b.lo(u.col(4), false), 'IA>B LOW');
      b.wire(u.p(5), 'led1', 'A>B');
      b.wire(u.p(6), 'led2', 'A=B');
      b.wire(u.p(7), 'led3', 'A<B');
    }),
  },
];

// ---------- combinational MSI ----------
const msi = [
  {
    id: 'mux-74153', group: 'MUX, DEMUX, encoders', title: '4-to-1 multiplexer (74153)',
    aim: 'Route one of four data inputs to the output. Select lines on S1 (A) and S2 (B), data on S3–S6.',
    theory: '<p>The select code BA picks which C input reaches Y. The strobe /1G is active-low, so it is grounded to enable the chip.</p>',
    inputs: [{ name: 'S0', sw: 1 }, { name: 'S1', sw: 2 }, { name: 'C0', sw: 3 }, { name: 'C1', sw: 4 }, { name: 'C2', sw: 5 }, { name: 'C3', sw: 6 }],
    outputs: [{ name: 'Y', pad: 'led1' }],
    fn: (v) => ({ Y: [v.C0, v.C1, v.C2, v.C3][v.S0 | v.S1 << 1] }),
    build: () => make((b) => {
      const u = b.chip('74153', 26);
      b.power(u);
      b.wire('sw1', u.p(14), 'select A');
      b.wire('sw2', u.p(2), 'select B');
      [6, 5, 4, 3].forEach((p, i) => b.wire('sw' + (i + 3), u.p(p), 'C' + i));
      b.wire(u.p(1), b.lo(u.col(1), false), '/1G enable');
      b.wire(u.p(7), 'led1', 'Y');
    }),
  },
  {
    id: 'mux-function', group: 'MUX, DEMUX, encoders', title: 'Boolean function with an 8:1 MUX (74151)',
    aim: 'Implement F(X,Y,Z) = Σm(1,2,4,7) by tying the data inputs to the rails.',
    theory: '<p>With X, Y, Z on the select lines, each data input Dn is simply the value of F for minterm n. Here D1, D2, D4 and D7 go HIGH and the rest go LOW. This F is the sum output of a full adder.</p>',
    inputs: [{ name: 'X', sw: 1 }, { name: 'Y', sw: 2 }, { name: 'Z', sw: 3 }],
    outputs: [{ name: 'F', pad: 'led1' }, { name: 'F′', pad: 'led2' }],
    fn: ({ X, Y, Z }) => { const f = [0, 1, 1, 0, 1, 0, 0, 1][X << 2 | Y << 1 | Z]; return { F: f, 'F′': +!f }; },
    build: () => make((b) => {
      const u = b.chip('74151', 26);
      b.power(u);
      b.wire('sw1', u.p(9), 'X (select C)');
      b.wire('sw2', u.p(10), 'Y (select B)');
      b.wire('sw3', u.p(11), 'Z (select A)');
      b.wire(u.p(7), b.lo(u.col(7), false), '/G enable');
      const D = [4, 3, 2, 1, 15, 14, 13, 12];
      [0, 1, 1, 0, 1, 0, 0, 1].forEach((v, i) => {
        const p = D[i];
        const top = u.top(p);
        b.wire(u.p(p), v ? b.hi(u.col(p), top) : b.lo(u.col(p), top), `D${i} ${v ? 'HIGH' : 'LOW'}`);
      });
      b.wire(u.p(5), 'led1', 'F');
      b.wire(u.p(6), 'led2', 'F′');
    }),
  },
  {
    id: 'decoder-74138', group: 'MUX, DEMUX, encoders', title: '3-to-8 decoder (74138)',
    aim: 'Decode a 3-bit code on S1–S3 onto L1–L8. Outputs are active-low: the selected LED goes dark.',
    theory: '<p>Exactly one output goes LOW, the one whose number matches CBA. The chip is enabled only when G1 is HIGH and both /G2A and /G2B are LOW.</p>',
    inputs: [{ name: 'A', sw: 1 }, { name: 'B', sw: 2 }, { name: 'C', sw: 3 }],
    outputs: Array.from({ length: 8 }, (_, i) => ({ name: 'Y' + i, pad: 'led' + (i + 1) })),
    fn: ({ A, B, C }) => { const n = A | B << 1 | C << 2; return Object.fromEntries(Array.from({ length: 8 }, (_, i) => ['Y' + i, i === n ? 0 : 1])); },
    build: () => make((b) => {
      const u = b.chip('74138', 26);
      b.power(u);
      b.wire('sw1', u.p(1), 'A');
      b.wire('sw2', u.p(2), 'B');
      b.wire('sw3', u.p(3), 'C');
      b.wire(u.p(6), b.hi(u.col(6), false), 'G1 HIGH');
      b.wire(u.p(4), b.lo(u.col(4), false), '/G2A LOW');
      b.wire(u.p(5), b.lo(u.col(5), false), '/G2B LOW');
      [15, 14, 13, 12, 11, 10, 9, 7].forEach((p, i) => b.wire(u.p(p), 'led' + (i + 1), 'Y' + i));
    }),
  },
  {
    id: 'demux-74155', group: 'MUX, DEMUX, encoders', title: '1-to-4 demultiplexer (74155)',
    aim: 'Send the data bit on S3 to one of four outputs chosen by S1 (A) and S2 (B).',
    theory: '<p>Section 1 of the 74155 is enabled when /1G is LOW and 1C is HIGH, so feeding data into 1C makes it a demux. The outputs are active-low: with data = 1 the selected output drops to 0, with data = 0 every output stays HIGH.</p>',
    inputs: [{ name: 'A', sw: 1 }, { name: 'B', sw: 2 }, { name: 'D', sw: 3 }],
    outputs: [0, 1, 2, 3].map(i => ({ name: 'Y' + i, pad: 'led' + (i + 1) })),
    fn: ({ A, B, D }) => { const n = A | B << 1; return Object.fromEntries([0, 1, 2, 3].map(i => ['Y' + i, D && i === n ? 0 : 1])); },
    build: () => make((b) => {
      const u = b.chip('74155', 26);
      b.power(u);
      b.wire('sw1', u.p(13), 'A');
      b.wire('sw2', u.p(3), 'B');
      b.wire('sw3', u.p(1), 'data into 1C');
      b.wire(u.p(2), b.lo(u.col(2), false), '/1G LOW');
      [7, 6, 5, 4].forEach((p, i) => b.wire(u.p(p), 'led' + (i + 1), '1Y' + i));
    }),
  },
  {
    id: 'encoder-74148', group: 'MUX, DEMUX, encoders', title: '8-to-3 priority encoder (74148)',
    aim: 'Encode the highest-numbered LOW input. Inputs 0–7 on S1–S8 (active-low).',
    theory: '<p>Everything on the 74148 is active-low. Pull an input LOW and the inverted binary code of the highest active input appears on /A2 /A1 /A0. /GS goes LOW when any input is active; /EO goes LOW when none are.</p>',
    inputs: Array.from({ length: 8 }, (_, i) => ({ name: 'I' + i, sw: i + 1 })),
    outputs: [{ name: 'A0', pad: 'led1' }, { name: 'A1', pad: 'led2' }, { name: 'A2', pad: 'led3' }, { name: 'GS', pad: 'led4' }, { name: 'EO', pad: 'led5' }],
    fn: (v) => {
      let k = -1;
      for (let i = 7; i >= 0; i--) if (!v['I' + i]) { k = i; break; }
      if (k < 0) return { A0: 1, A1: 1, A2: 1, GS: 1, EO: 0 };
      const n = 7 - k;
      return { A0: n & 1, A1: n >> 1 & 1, A2: n >> 2 & 1, GS: 0, EO: 1 };
    },
    build: () => make((b) => {
      const u = b.chip('74148', 26);
      b.power(u);
      [10, 11, 12, 13, 1, 2, 3, 4].forEach((p, i) => b.wire('sw' + (i + 1), u.p(p), 'input ' + i));
      b.wire(u.p(5), b.lo(u.col(5), false), '/EI LOW');
      b.wire(u.p(9), 'led1', '/A0');
      b.wire(u.p(7), 'led2', '/A1');
      b.wire(u.p(6), 'led3', '/A2');
      b.wire(u.p(14), 'led4', '/GS');
      b.wire(u.p(15), 'led5', '/EO');
    }),
  },
  {
    id: 'bcd-7seg', group: 'MUX, DEMUX, encoders', title: 'BCD to 7-segment (7447)',
    aim: 'Show the BCD number on S1–S4 (A is the LSB) on a common-anode display.',
    theory: '<p>The 7447 pulls a segment LOW to light it, which suits a common-anode display. Codes 10–15 give odd shapes on purpose: they are not valid BCD. Keep /LT, /BI and /RBI HIGH for normal operation.</p>',
    segMode: 'ca',
    inputs: [{ name: 'A', sw: 1 }, { name: 'B', sw: 2 }, { name: 'C', sw: 3 }, { name: 'D', sw: 4 }],
    outputs: ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map(s => ({ name: s, pad: 'seg' + s })),
    fn: (v) => {
      const o = CHIPS['7447'].eval((p) => ({ 7: v.A, 1: v.B, 2: v.C, 6: v.D, 3: 1, 4: 1, 5: 1 })[p] ?? 0, {});
      const map = { a: 13, b: 12, c: 11, d: 10, e: 9, f: 15, g: 14 };
      return Object.fromEntries(Object.entries(map).map(([k, p]) => [k, o[p]]));
    },
    build: () => make((b) => {
      const u = b.chip('7447', 26);
      b.power(u);
      b.wire('sw1', u.p(7), 'A');
      b.wire('sw2', u.p(1), 'B');
      b.wire('sw3', u.p(2), 'C');
      b.wire('sw4', u.p(6), 'D');
      b.wire(u.p(3), b.hi(u.col(3), false), '/LT HIGH');
      b.wire(u.p(4), b.hi(u.col(4), false), '/BI HIGH');
      b.wire(u.p(5), b.hi(u.col(5), false), '/RBI HIGH');
      [['a', 13], ['b', 12], ['c', 11], ['d', 10], ['e', 9], ['f', 15], ['g', 14]].forEach(([s, p]) => b.wire(u.p(p), 'seg' + s, 'segment ' + s));
    }),
  },
];

// ---------- sequential ----------
const pulse = 'pb1';
const sequential = [
  {
    id: 'sr-latch', group: 'Flip-flops', title: 'SR latch from NAND gates',
    aim: 'Build an active-low SR latch. S1 is /S, S2 is /R. Q on L1, Q′ on L2.',
    theory: '<p>Two cross-coupled NAND gates store one bit. Pulling /S LOW sets Q = 1, pulling /R LOW resets Q = 0. With both HIGH the latch remembers its last state. Both LOW is the forbidden input: Q and Q′ both go HIGH.</p>',
    inputs: [{ name: '/S', sw: 1 }, { name: '/R', sw: 2 }],
    outputs: [{ name: 'Q', pad: 'led1' }, { name: 'Q′', pad: 'led2' }],
    script: [
      { set: { 1: 1, 2: 0 }, expect: { Q: 0, 'Q′': 1 }, note: 'reset' },
      { set: { 1: 1, 2: 1 }, expect: { Q: 0, 'Q′': 1 }, note: 'hold after reset' },
      { set: { 1: 0, 2: 1 }, expect: { Q: 1, 'Q′': 0 }, note: 'set' },
      { set: { 1: 1, 2: 1 }, expect: { Q: 1, 'Q′': 0 }, note: 'hold after set' },
      { set: { 1: 0, 2: 0 }, expect: { Q: 1, 'Q′': 1 }, note: 'forbidden: both outputs HIGH' },
    ],
    build: () => make((b) => {
      const u = b.chip('7400', 20);
      b.power(u);
      b.wire('sw1', u.p(1), '/S');
      b.wire('sw2', u.p(5), '/R');
      b.wire(u.p(3), u.p(4), 'Q back to gate 2');
      b.wire(u.p(6), u.p(2), 'Q′ back to gate 1');
      b.wire(u.p(3), 'led1', 'Q');
      b.wire(u.p(6), 'led2', 'Q′');
    }),
  },
  {
    id: 'd-ff', group: 'Flip-flops', title: 'D flip-flop (7474)',
    aim: 'Capture D (S1) on the rising edge of the pulser P1. Q on L1, Q′ on L2.',
    theory: '<p>The 7474 copies D to Q only at the instant CLK goes from LOW to HIGH. Changing D at any other time does nothing. /PRE and /CLR are asynchronous and active-low, so they are tied HIGH here.</p>',
    inputs: [{ name: 'D', sw: 1 }],
    outputs: [{ name: 'Q', pad: 'led1' }, { name: 'Q′', pad: 'led2' }],
    script: [
      { set: { 1: 1 }, pulse, expect: { Q: 1, 'Q′': 0 }, note: 'D=1, clock' },
      { set: { 1: 0 }, expect: { Q: 1, 'Q′': 0 }, note: 'D changes, no clock: Q holds' },
      { pulse, expect: { Q: 0, 'Q′': 1 }, note: 'clock: Q follows D=0' },
      { set: { 1: 1 }, pulse, expect: { Q: 1, 'Q′': 0 }, note: 'D=1, clock' },
    ],
    build: () => make((b) => {
      const u = b.chip('7474', 20);
      b.power(u);
      b.wire('sw1', u.p(2), 'D');
      b.wire(pulse, u.p(3), 'CLK from P1');
      b.wire(u.p(4), b.hi(u.col(4), false), '/PRE HIGH');
      b.wire(u.p(1), b.hi(u.col(1), false), '/CLR HIGH');
      b.wire(u.p(5), 'led1', 'Q');
      b.wire(u.p(6), 'led2', 'Q′');
    }),
  },
  {
    id: 'jk-ff', group: 'Flip-flops', title: 'JK flip-flop (7476)',
    aim: 'Verify hold, set, reset and toggle. J on S1, K on S2, clock on P1 (falling edge).',
    theory: '<p>J=K=0 holds, J=1 K=0 sets, J=0 K=1 resets, and J=K=1 toggles on every clock. The 7476 acts on the falling edge, so the output changes when you release the pulser. Its power pins are in the middle: VCC is pin 5 and GND is pin 13.</p>',
    inputs: [{ name: 'J', sw: 1 }, { name: 'K', sw: 2 }],
    outputs: [{ name: 'Q', pad: 'led1' }, { name: 'Q′', pad: 'led2' }],
    script: [
      { set: { 1: 0, 2: 1 }, pulse, expect: { Q: 0, 'Q′': 1 }, note: 'reset' },
      { set: { 1: 0, 2: 0 }, pulse, expect: { Q: 0, 'Q′': 1 }, note: 'hold' },
      { set: { 1: 1, 2: 0 }, pulse, expect: { Q: 1, 'Q′': 0 }, note: 'set' },
      { set: { 1: 1, 2: 1 }, pulse, expect: { Q: 0, 'Q′': 1 }, note: 'toggle' },
      { pulse, expect: { Q: 1, 'Q′': 0 }, note: 'toggle again' },
    ],
    build: () => make((b) => {
      const u = b.chip('7476', 20);
      b.power(u);
      b.wire('sw1', u.p(4), 'J');
      b.wire('sw2', u.p(16), 'K');
      b.wire(pulse, u.p(1), 'CLK from P1');
      b.wire(u.p(2), b.hi(u.col(2), false), '/PRE HIGH');
      b.wire(u.p(3), b.hi(u.col(3), false), '/CLR HIGH');
      b.wire(u.p(15), 'led1', 'Q');
      b.wire(u.p(14), 'led2', 'Q′');
    }),
  },
  {
    id: 'counter-7493', group: 'Counters & registers', title: 'Mod-16 ripple counter (7493)',
    aim: 'Count clock pulses from P1 in binary on L1–L4. S1 HIGH resets the count.',
    theory: '<p>The 7493 is a ÷2 stage and a ÷8 stage. Feeding QA into CKB chains them into a 4-bit ripple counter. Both R0 pins must be HIGH to reset. Swap P1 for the CLK pad to watch it run on its own.</p>',
    inputs: [{ name: 'Reset', sw: 1 }],
    outputs: [{ name: 'QA', pad: 'led1' }, { name: 'QB', pad: 'led2' }, { name: 'QC', pad: 'led3' }, { name: 'QD', pad: 'led4' }],
    script: [
      { set: { 1: 1 }, expect: { QA: 0, QB: 0, QC: 0, QD: 0 }, note: 'reset' },
      { set: { 1: 0 }, expect: { QA: 0, QB: 0, QC: 0, QD: 0 }, note: 'release reset' },
      ...Array.from({ length: 17 }, (_, k) => {
        const n = (k + 1) % 16;
        return { pulse, expect: { QA: n & 1, QB: n >> 1 & 1, QC: n >> 2 & 1, QD: n >> 3 & 1 }, note: `pulse ${k + 1} → ${n}` };
      }),
    ],
    build: () => make((b) => {
      const u = b.chip('7493', 22);
      b.power(u);
      b.wire(pulse, u.p(14), 'clock into CKA');
      b.wire(u.p(12), u.p(1), 'QA into CKB');
      b.wire('sw1', u.p(2), 'reset R0(1)');
      b.wire(u.p(2), u.p(3), 'R0(1) to R0(2)');
      b.wire(u.p(12), 'led1', 'QA');
      b.wire(u.p(9), 'led2', 'QB');
      b.wire(u.p(8), 'led3', 'QC');
      b.wire(u.p(11), 'led4', 'QD');
    }),
  },
  {
    id: 'decade-7seg', group: 'Counters & registers', title: 'Decade counter on a display (7490 + 7447)',
    aim: 'Count 0–9 on the 7-segment display with every P1 pulse. S1 HIGH resets.',
    theory: '<p>The 7490 in BCD mode (QA fed back into CKB) counts 0 to 9 and wraps. Its four outputs drive a 7447, which drives the common-anode display. This is the classic counter lab.</p>',
    segMode: 'ca',
    inputs: [{ name: 'Reset', sw: 1 }],
    outputs: ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map(s => ({ name: s, pad: 'seg' + s })),
    script: (() => {
      const seg = (n) => {
        const o = CHIPS['7447'].eval((p) => ({ 7: n & 1, 1: n >> 1 & 1, 2: n >> 2 & 1, 6: n >> 3 & 1, 3: 1, 4: 1, 5: 1 })[p] ?? 0, {});
        return { a: o[13], b: o[12], c: o[11], d: o[10], e: o[9], f: o[15], g: o[14] };
      };
      return [
        { set: { 1: 1 }, expect: seg(0), note: 'reset shows 0' },
        { set: { 1: 0 }, expect: seg(0), note: 'release reset' },
        ...Array.from({ length: 11 }, (_, k) => ({ pulse, expect: seg((k + 1) % 10), note: `pulse ${k + 1} shows ${(k + 1) % 10}` })),
      ];
    })(),
    build: () => make((b) => {
      const c = b.chip('7490', 8), d = b.chip('7447', 34);
      b.power(c); b.power(d);
      b.wire(pulse, c.p(14), 'clock into CKA');
      b.wire(c.p(12), c.p(1), 'QA into CKB');
      b.wire('sw1', c.p(2), 'reset R0(1)');
      b.wire(c.p(2), c.p(3), 'R0(1) to R0(2)');
      b.wire(c.p(6), b.lo(c.col(6), true), 'R9(1) LOW');
      b.wire(c.p(7), b.lo(c.col(7), true), 'R9(2) LOW');
      b.wire(c.p(12), d.p(7), 'QA to A');
      b.wire(c.p(9), d.p(1), 'QB to B');
      b.wire(c.p(8), d.p(2), 'QC to C');
      b.wire(c.p(11), d.p(6), 'QD to D');
      b.wire(d.p(3), b.hi(d.col(3), false), '/LT HIGH');
      b.wire(d.p(4), b.hi(d.col(4), false), '/BI HIGH');
      b.wire(d.p(5), b.hi(d.col(5), false), '/RBI HIGH');
      [['a', 13], ['b', 12], ['c', 11], ['d', 10], ['e', 9], ['f', 15], ['g', 14]].forEach(([s, p]) => b.wire(d.p(p), 'seg' + s, 'segment ' + s));
    }),
  },
  {
    id: 'mod10-74161', group: 'Counters & registers', title: 'Mod-10 counter (74161 + NAND reset)',
    aim: 'Turn a 4-bit synchronous counter into a decade counter by clearing it at 1010.',
    theory: '<p>When the count reaches 10 (QD = QB = 1) the NAND output falls, which drives the asynchronous /CLR and snaps the count back to 0. State 10 lives for only a few nanoseconds, so you never see it on the LEDs.</p>',
    inputs: [],
    outputs: [{ name: 'QA', pad: 'led1' }, { name: 'QB', pad: 'led2' }, { name: 'QC', pad: 'led3' }, { name: 'QD', pad: 'led4' }],
    script: Array.from({ length: 12 }, (_, k) => {
      const n = (k + 1) % 10;
      return { pulse, expect: { QA: n & 1, QB: n >> 1 & 1, QC: n >> 2 & 1, QD: n >> 3 & 1 }, note: `pulse ${k + 1} → ${n}` };
    }),
    build: () => make((b) => {
      const c = b.chip('74161', 12), n = b.chip('7400', 36);
      b.power(c); b.power(n);
      b.wire(pulse, c.p(2), 'clock');
      b.wire(c.p(7), b.hi(c.col(7), false), 'ENP HIGH');
      b.wire(c.p(10), b.hi(c.col(10), true), 'ENT HIGH');
      b.wire(c.p(9), b.hi(c.col(9), true), '/LOAD HIGH');
      b.wire(c.p(13), n.p(1), 'QB to NAND');
      b.wire(c.p(11), n.p(2), 'QD to NAND');
      b.wire(n.p(3), c.p(1), 'NAND to /CLR');
      b.wire(c.p(14), 'led1', 'QA');
      b.wire(c.p(13), 'led2', 'QB');
      b.wire(c.p(12), 'led3', 'QC');
      b.wire(c.p(11), 'led4', 'QD');
    }),
  },
  {
    id: 'shift-74194', group: 'Counters & registers', title: 'Universal shift register (74194)',
    aim: 'Load, shift right and shift left. Mode S0/S1 on S1/S2, serial-right data on S3, parallel data on S5–S8.',
    theory: '<p>S1 S0 = 00 holds, 01 shifts right (data enters at QA), 10 shifts left (data enters at QD) and 11 loads A–D in parallel, all on the rising clock edge. /CLR is tied HIGH.</p>',
    inputs: [{ name: 'S0', sw: 1 }, { name: 'S1', sw: 2 }, { name: 'SR', sw: 3 }, { name: 'SL', sw: 4 }],
    outputs: [{ name: 'QA', pad: 'led1' }, { name: 'QB', pad: 'led2' }, { name: 'QC', pad: 'led3' }, { name: 'QD', pad: 'led4' }],
    script: [
      { set: { 1: 1, 2: 1, 5: 1, 6: 0, 7: 1, 8: 0 }, pulse, expect: { QA: 1, QB: 0, QC: 1, QD: 0 }, note: 'parallel load 1010' },
      { set: { 1: 1, 2: 0, 3: 0 }, pulse, expect: { QA: 0, QB: 1, QC: 0, QD: 1 }, note: 'shift right, SR=0' },
      { set: { 3: 1 }, pulse, expect: { QA: 1, QB: 0, QC: 1, QD: 0 }, note: 'shift right, SR=1' },
      { set: { 1: 0, 2: 1, 4: 1 }, pulse, expect: { QA: 0, QB: 1, QC: 0, QD: 1 }, note: 'shift left, SL=1' },
      { set: { 1: 0, 2: 0 }, pulse, expect: { QA: 0, QB: 1, QC: 0, QD: 1 }, note: 'hold' },
    ],
    build: () => make((b) => {
      const u = b.chip('74194', 26);
      b.power(u);
      b.wire('sw1', u.p(9), 'S0');
      b.wire('sw2', u.p(10), 'S1');
      b.wire('sw3', u.p(2), 'serial right in');
      b.wire('sw4', u.p(7), 'serial left in');
      [3, 4, 5, 6].forEach((p, i) => b.wire('sw' + (i + 5), u.p(p), 'parallel ' + 'ABCD'[i]));
      b.wire(pulse, u.p(11), 'clock');
      b.wire(u.p(1), b.hi(u.col(1), false), '/CLR HIGH');
      [15, 14, 13, 12].forEach((p, i) => b.wire(u.p(p), 'led' + (i + 1), 'Q' + 'ABCD'[i]));
    }),
  },
];

export const EXPERIMENTS = [...basic, ...universal, ...arithmetic, ...msi, ...sequential];
export const EXP_GROUPS = [...new Set(EXPERIMENTS.map(e => e.group))];
