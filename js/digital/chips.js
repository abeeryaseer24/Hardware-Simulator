// 74-series chip library. Pin numbers follow the TI / Fairchild datasheets.
// eval(v, s): v(pin) reads the logic level (0/1) on a pin, s is per-chip state.
// Returns { pin: 0|1 } for every output pin it drives.

const AND = (a, b) => a & b;
const OR = (a, b) => a | b;
const XOR = (a, b) => a ^ b;
const nand = (...x) => +!x.every(Boolean);
const nor = (...x) => +!x.some(Boolean);

function quad(op, layout, invert = false) {
  return (v) => {
    const o = {};
    for (const [a, b, y] of layout) {
      const r = op(v(a), v(b));
      o[y] = invert ? +!r : r;
    }
    return o;
  };
}

const L_00 = [[1, 2, 3], [4, 5, 6], [9, 10, 8], [12, 13, 11]];
const N_00 = ['1A', '1B', '1Y', '2A', '2B', '2Y', 'GND', '3Y', '3A', '3B', '4Y', '4A', '4B', 'VCC'];
const L_02 = [[2, 3, 1], [5, 6, 4], [8, 9, 10], [11, 12, 13]];
const N_02 = ['1Y', '1A', '1B', '2Y', '2A', '2B', 'GND', '3A', '3B', '3Y', '4A', '4B', '4Y', 'VCC'];
const L_04 = [[1, 2], [3, 4], [5, 6], [9, 8], [11, 10], [13, 12]];
const N_04 = ['1A', '1Y', '2A', '2Y', '3A', '3Y', 'GND', '4Y', '4A', '5Y', '5A', '6Y', '6A', 'VCC'];
const L_10 = [[1, 2, 13, 12], [3, 4, 5, 6], [9, 10, 11, 8]];
const N_10 = ['1A', '1B', '2A', '2B', '2C', '2Y', 'GND', '3Y', '3A', '3B', '3C', '1Y', '1C', 'VCC'];
const L_20 = [[1, 2, 4, 5, 6], [9, 10, 12, 13, 8]];
const N_20 = ['1A', '1B', 'NC', '1C', '1D', '1Y', 'GND', '2Y', '2A', '2B', 'NC', '2C', '2D', 'VCC'];

const multi = (fn, layout) => (v) => {
  const o = {};
  for (const g of layout) {
    const ins = g.slice(0, -1).map(v);
    o[g[g.length - 1]] = fn(...ins);
  }
  return o;
};

const SEG7 = [
  0b1111110, 0b0110000, 0b1101101, 0b1111001, 0b0110011, 0b1011011, 0b0011111, 0b1110000,
  0b1111111, 0b1110011, 0b0001101, 0b0011001, 0b0100011, 0b1001011, 0b0001111, 0b0000000,
];
const SEG_PINS = [13, 12, 11, 10, 9, 15, 14]; // a b c d e f g

function bcdTo7(activeLow) {
  return (v) => {
    const n = v(7) | (v(1) << 1) | (v(2) << 2) | (v(6) << 3);
    const lt = v(3), bi = v(4), rbi = v(5);
    let bits = SEG7[n];
    if (!bi) bits = 0;
    else if (!lt) bits = 0b1111111;
    else if (!rbi && n === 0) bits = 0;
    const o = {};
    SEG_PINS.forEach((p, i) => {
      const on = (bits >> (6 - i)) & 1;
      o[p] = activeLow ? +!on : on;
    });
    return o;
  };
}

// Edge helpers. prev values live in the chip state.
function edge(v, s, pin, falling) {
  const cur = v(pin);
  const before = s['e' + pin];
  s['e' + pin] = cur;
  if (before === undefined) return false;
  return falling ? before === 1 && cur === 0 : before === 0 && cur === 1;
}

function dff(v, s, k, { d, clk, pre, clr, q, qn }) {
  const p = v(pre), c = v(clr);
  const e = edge(v, s, clk, false);
  if (!p && !c) return { [q]: 1, [qn]: 1 };
  if (!p) s[k] = 1;
  else if (!c) s[k] = 0;
  else if (e) s[k] = v(d);
  return { [q]: s[k] | 0, [qn]: +!(s[k] | 0) };
}

function jkff(v, s, k, { j, kk, clk, pre, clr, q, qn }) {
  const p = v(pre), c = v(clr);
  const e = edge(v, s, clk, true);
  if (!p && !c) return { [q]: 1, [qn]: 1 };
  if (!p) s[k] = 1;
  else if (!c) s[k] = 0;
  else if (e) {
    const J = v(j), K = v(kk), Q = s[k] | 0;
    s[k] = J && K ? +!Q : J ? 1 : K ? 0 : Q;
  }
  return { [q]: s[k] | 0, [qn]: +!(s[k] | 0) };
}

export const CHIPS = {
  '7400': { name: 'Quad 2-input NAND', family: 'Gates', pins: 14, names: N_00, out: [3, 6, 8, 11], eval: quad(AND, L_00, true) },
  '7402': { name: 'Quad 2-input NOR', family: 'Gates', pins: 14, names: N_02, out: [1, 4, 10, 13], eval: quad(OR, L_02, true) },
  '7404': { name: 'Hex inverter', family: 'Gates', pins: 14, names: N_04, out: [2, 4, 6, 8, 10, 12],
    eval: (v) => Object.fromEntries(L_04.map(([a, y]) => [y, +!v(a)])) },
  '7408': { name: 'Quad 2-input AND', family: 'Gates', pins: 14, names: N_00, out: [3, 6, 8, 11], eval: quad(AND, L_00) },
  '7410': { name: 'Triple 3-input NAND', family: 'Gates', pins: 14, names: N_10, out: [12, 6, 8], eval: multi(nand, L_10) },
  '7411': { name: 'Triple 3-input AND', family: 'Gates', pins: 14, names: N_10, out: [12, 6, 8], eval: multi((...x) => +x.every(Boolean), L_10) },
  '7414': { name: 'Hex Schmitt-trigger inverter', family: 'Gates', pins: 14, names: N_04, out: [2, 4, 6, 8, 10, 12],
    eval: (v) => Object.fromEntries(L_04.map(([a, y]) => [y, +!v(a)])) },
  '7420': { name: 'Dual 4-input NAND', family: 'Gates', pins: 14, names: N_20, out: [6, 8], eval: multi(nand, L_20) },
  '7427': { name: 'Triple 3-input NOR', family: 'Gates', pins: 14, names: N_10, out: [12, 6, 8], eval: multi(nor, L_10) },
  '7432': { name: 'Quad 2-input OR', family: 'Gates', pins: 14, names: N_00, out: [3, 6, 8, 11], eval: quad(OR, L_00) },
  '7486': { name: 'Quad 2-input XOR', family: 'Gates', pins: 14, names: N_00, out: [3, 6, 8, 11], eval: quad(XOR, L_00) },

  '7483': {
    name: '4-bit binary full adder', family: 'Arithmetic', pins: 16, vcc: 5, gnd: 12,
    names: ['A4', 'S3', 'A3', 'B3', 'VCC', 'S2', 'B2', 'A2', 'S1', 'A1', 'B1', 'GND', 'C0', 'C4', 'S4', 'B4'],
    out: [9, 6, 2, 15, 14],
    eval: (v) => {
      const a = v(10) | v(8) << 1 | v(3) << 2 | v(1) << 3;
      const b = v(11) | v(7) << 1 | v(4) << 2 | v(16) << 3;
      const s = a + b + v(13);
      return { 9: s & 1, 6: s >> 1 & 1, 2: s >> 2 & 1, 15: s >> 3 & 1, 14: s >> 4 & 1 };
    },
  },
  '74283': {
    name: '4-bit binary full adder (fast carry)', family: 'Arithmetic', pins: 16,
    names: ['S2', 'B2', 'A2', 'S1', 'A1', 'B1', 'C0', 'GND', 'C4', 'S4', 'B4', 'A4', 'S3', 'A3', 'B3', 'VCC'],
    out: [4, 1, 13, 10, 9],
    eval: (v) => {
      const a = v(5) | v(3) << 1 | v(14) << 2 | v(12) << 3;
      const b = v(6) | v(2) << 1 | v(15) << 2 | v(11) << 3;
      const s = a + b + v(7);
      return { 4: s & 1, 1: s >> 1 & 1, 13: s >> 2 & 1, 10: s >> 3 & 1, 9: s >> 4 & 1 };
    },
  },
  '7485': {
    name: '4-bit magnitude comparator', family: 'Arithmetic', pins: 16,
    names: ['B3', 'IA<B', 'IA=B', 'IA>B', 'A>B', 'A=B', 'A<B', 'GND', 'B0', 'A0', 'B1', 'A1', 'A2', 'B2', 'A3', 'VCC'],
    out: [5, 6, 7],
    eval: (v) => {
      const a = v(10) | v(12) << 1 | v(13) << 2 | v(15) << 3;
      const b = v(9) | v(11) << 1 | v(14) << 2 | v(1) << 3;
      if (a > b) return { 5: 1, 6: 0, 7: 0 };
      if (a < b) return { 5: 0, 6: 0, 7: 1 };
      const lt = v(2), eq = v(3), gt = v(4);
      return { 5: +(!eq && !lt), 6: eq, 7: +(!eq && !gt) };
    },
  },

  '74138': {
    name: '3-to-8 line decoder / demux', family: 'Decoders', pins: 16,
    names: ['A', 'B', 'C', '/G2A', '/G2B', 'G1', '/Y7', 'GND', '/Y6', '/Y5', '/Y4', '/Y3', '/Y2', '/Y1', '/Y0', 'VCC'],
    out: [15, 14, 13, 12, 11, 10, 9, 7],
    eval: (v) => {
      const Y = [15, 14, 13, 12, 11, 10, 9, 7];
      const en = v(6) && !v(4) && !v(5);
      const n = v(1) | v(2) << 1 | v(3) << 2;
      return Object.fromEntries(Y.map((p, i) => [p, en && i === n ? 0 : 1]));
    },
  },
  '74139': {
    name: 'Dual 2-to-4 line decoder', family: 'Decoders', pins: 16,
    names: ['/1G', '1A', '1B', '/1Y0', '/1Y1', '/1Y2', '/1Y3', 'GND', '/2Y3', '/2Y2', '/2Y1', '/2Y0', '2B', '2A', '/2G', 'VCC'],
    out: [4, 5, 6, 7, 12, 11, 10, 9],
    eval: (v) => {
      const o = {};
      const sec = (g, a, b, ys) => {
        const n = v(a) | v(b) << 1;
        ys.forEach((p, i) => { o[p] = !v(g) && i === n ? 0 : 1; });
      };
      sec(1, 2, 3, [4, 5, 6, 7]);
      sec(15, 14, 13, [12, 11, 10, 9]);
      return o;
    },
  },
  '74155': {
    name: 'Dual 2-to-4 decoder / demux', family: 'Decoders', pins: 16,
    names: ['1C', '/1G', 'B', '/1Y3', '/1Y2', '/1Y1', '/1Y0', 'GND', '/2Y0', '/2Y1', '/2Y2', '/2Y3', 'A', '/2G', '/2C', 'VCC'],
    out: [7, 6, 5, 4, 9, 10, 11, 12],
    eval: (v) => {
      const n = v(13) | v(3) << 1;
      const e1 = !v(2) && v(1), e2 = !v(14) && !v(15);
      const o = {};
      [7, 6, 5, 4].forEach((p, i) => { o[p] = e1 && i === n ? 0 : 1; });
      [9, 10, 11, 12].forEach((p, i) => { o[p] = e2 && i === n ? 0 : 1; });
      return o;
    },
  },
  '7447': {
    name: 'BCD to 7-segment decoder (active-low, common anode)', family: 'Decoders', pins: 16,
    names: ['B', 'C', '/LT', '/BI', '/RBI', 'D', 'A', 'GND', '/e', '/d', '/c', '/b', '/a', '/g', '/f', 'VCC'],
    out: SEG_PINS, eval: bcdTo7(true),
  },
  '7448': {
    name: 'BCD to 7-segment decoder (active-high, common cathode)', family: 'Decoders', pins: 16,
    names: ['B', 'C', '/LT', '/BI', '/RBI', 'D', 'A', 'GND', 'e', 'd', 'c', 'b', 'a', 'g', 'f', 'VCC'],
    out: SEG_PINS, eval: bcdTo7(false),
  },
  '74148': {
    name: '8-to-3 priority encoder', family: 'Encoders & MUX', pins: 16,
    names: ['/4', '/5', '/6', '/7', '/EI', '/A2', '/A1', 'GND', '/A0', '/0', '/1', '/2', '/3', '/GS', '/EO', 'VCC'],
    out: [6, 7, 9, 14, 15],
    eval: (v) => {
      const IN = [10, 11, 12, 13, 1, 2, 3, 4];
      if (v(5)) return { 6: 1, 7: 1, 9: 1, 14: 1, 15: 1 };
      let k = -1;
      for (let i = 7; i >= 0; i--) if (!v(IN[i])) { k = i; break; }
      if (k < 0) return { 6: 1, 7: 1, 9: 1, 14: 1, 15: 0 };
      const n = 7 - k;
      return { 6: n >> 2 & 1, 7: n >> 1 & 1, 9: n & 1, 14: 0, 15: 1 };
    },
  },
  '74147': {
    name: '10-to-4 priority encoder (decimal to BCD)', family: 'Encoders & MUX', pins: 16,
    names: ['/4', '/5', '/6', '/7', '/8', '/C', '/B', 'GND', '/A', '/9', '/1', '/2', '/3', '/D', 'NC', 'VCC'],
    out: [14, 6, 7, 9],
    eval: (v) => {
      const IN = { 1: 11, 2: 12, 3: 13, 4: 1, 5: 2, 6: 3, 7: 4, 8: 5, 9: 10 };
      let k = 0;
      for (let i = 9; i >= 1; i--) if (!v(IN[i])) { k = i; break; }
      const n = 15 - k;
      return { 14: n >> 3 & 1, 6: n >> 2 & 1, 7: n >> 1 & 1, 9: n & 1 };
    },
  },
  '74151': {
    name: '8-to-1 multiplexer', family: 'Encoders & MUX', pins: 16,
    names: ['D3', 'D2', 'D1', 'D0', 'Y', '/W', '/G', 'GND', 'C', 'B', 'A', 'D7', 'D6', 'D5', 'D4', 'VCC'],
    out: [5, 6],
    eval: (v) => {
      if (v(7)) return { 5: 0, 6: 1 };
      const D = [4, 3, 2, 1, 15, 14, 13, 12];
      const y = v(D[v(11) | v(10) << 1 | v(9) << 2]);
      return { 5: y, 6: +!y };
    },
  },
  '74153': {
    name: 'Dual 4-to-1 multiplexer', family: 'Encoders & MUX', pins: 16,
    names: ['/1G', 'B', '1C3', '1C2', '1C1', '1C0', '1Y', 'GND', '2Y', '2C0', '2C1', '2C2', '2C3', 'A', '/2G', 'VCC'],
    out: [7, 9],
    eval: (v) => {
      const n = v(14) | v(2) << 1;
      return { 7: v(1) ? 0 : v([6, 5, 4, 3][n]), 9: v(15) ? 0 : v([10, 11, 12, 13][n]) };
    },
  },
  '74157': {
    name: 'Quad 2-to-1 multiplexer', family: 'Encoders & MUX', pins: 16,
    names: ['S', '1A', '1B', '1Y', '2A', '2B', '2Y', 'GND', '3Y', '3B', '3A', '4Y', '4B', '4A', '/G', 'VCC'],
    out: [4, 7, 9, 12],
    eval: (v) => {
      const g = v(15), s = v(1);
      const pick = (a, b) => (g ? 0 : v(s ? b : a));
      return { 4: pick(2, 3), 7: pick(5, 6), 9: pick(11, 10), 12: pick(14, 13) };
    },
  },

  '7474': {
    name: 'Dual D flip-flop (positive edge)', family: 'Flip-flops', pins: 14, seq: true,
    names: ['/1CLR', '1D', '1CLK', '/1PRE', '1Q', '/1Q', 'GND', '/2Q', '2Q', '/2PRE', '2CLK', '2D', '/2CLR', 'VCC'],
    out: [5, 6, 9, 8],
    eval: (v, s) => ({
      ...dff(v, s, 'q1', { d: 2, clk: 3, pre: 4, clr: 1, q: 5, qn: 6 }),
      ...dff(v, s, 'q2', { d: 12, clk: 11, pre: 10, clr: 13, q: 9, qn: 8 }),
    }),
  },
  '7476': {
    name: 'Dual JK flip-flop (negative edge, preset & clear)', family: 'Flip-flops', pins: 16, seq: true, vcc: 5, gnd: 13,
    names: ['1CLK', '/1PRE', '/1CLR', '1J', 'VCC', '2CLK', '/2PRE', '/2CLR', '2J', '/2Q', '2Q', '2K', 'GND', '/1Q', '1Q', '1K'],
    out: [15, 14, 11, 10],
    eval: (v, s) => ({
      ...jkff(v, s, 'q1', { j: 4, kk: 16, clk: 1, pre: 2, clr: 3, q: 15, qn: 14 }),
      ...jkff(v, s, 'q2', { j: 9, kk: 12, clk: 6, pre: 7, clr: 8, q: 11, qn: 10 }),
    }),
  },
  '74112': {
    name: 'Dual JK flip-flop (negative edge)', family: 'Flip-flops', pins: 16, seq: true,
    names: ['1CLK', '1K', '1J', '/1PRE', '1Q', '/1Q', '/2Q', 'GND', '2Q', '/2PRE', '2J', '2K', '2CLK', '/2CLR', '/1CLR', 'VCC'],
    out: [5, 6, 9, 7],
    eval: (v, s) => ({
      ...jkff(v, s, 'q1', { j: 3, kk: 2, clk: 1, pre: 4, clr: 15, q: 5, qn: 6 }),
      ...jkff(v, s, 'q2', { j: 11, kk: 12, clk: 13, pre: 10, clr: 14, q: 9, qn: 7 }),
    }),
  },

  '7490': {
    name: 'Decade counter (÷2 and ÷5)', family: 'Counters & registers', pins: 14, seq: true, vcc: 5, gnd: 10,
    names: ['CKB', 'R0(1)', 'R0(2)', 'NC', 'VCC', 'R9(1)', 'R9(2)', 'QC', 'QB', 'GND', 'QD', 'QA', 'NC', 'CKA'],
    out: [12, 9, 8, 11],
    eval: (v, s) => {
      const ea = edge(v, s, 14, true), eb = edge(v, s, 1, true);
      s.a ??= 0; s.b ??= 0;
      if (v(6) && v(7)) { s.a = 1; s.b = 4; }
      else if (v(2) && v(3)) { s.a = 0; s.b = 0; }
      else {
        if (ea) s.a ^= 1;
        if (eb) s.b = (s.b + 1) % 5;
      }
      return { 12: s.a, 9: s.b & 1, 8: s.b >> 1 & 1, 11: s.b >> 2 & 1 };
    },
  },
  '7493': {
    name: '4-bit binary ripple counter (÷2 and ÷8)', family: 'Counters & registers', pins: 14, seq: true, vcc: 5, gnd: 10,
    names: ['CKB', 'R0(1)', 'R0(2)', 'NC', 'VCC', 'NC', 'NC', 'QC', 'QB', 'GND', 'QD', 'QA', 'NC', 'CKA'],
    out: [12, 9, 8, 11],
    eval: (v, s) => {
      const ea = edge(v, s, 14, true), eb = edge(v, s, 1, true);
      s.a ??= 0; s.b ??= 0;
      if (v(2) && v(3)) { s.a = 0; s.b = 0; }
      else {
        if (ea) s.a ^= 1;
        if (eb) s.b = (s.b + 1) & 7;
      }
      return { 12: s.a, 9: s.b & 1, 8: s.b >> 1 & 1, 11: s.b >> 2 & 1 };
    },
  },
  '4017': {
    name: 'CMOS decade counter / divider, 10 decoded outputs', family: 'Counters & registers', pins: 16, seq: true,
    names: ['Q5', 'Q1', 'Q0', 'Q2', 'Q6', 'Q7', 'Q3', 'VSS', 'Q8', 'Q4', 'Q9', 'CO', 'INH', 'CLK', 'RST', 'VDD'],
    out: [3, 2, 4, 7, 10, 1, 5, 6, 9, 11, 12],
    eval: (v, s) => {
      const e = edge(v, s, 14, false);
      s.n ??= 0;
      if (v(15)) s.n = 0;
      else if (e && !v(13)) s.n = (s.n + 1) % 10;
      const Q = [3, 2, 4, 7, 10, 1, 5, 6, 9, 11];
      return { ...Object.fromEntries(Q.map((p, i) => [p, +(i === s.n)])), 12: +(s.n < 5) };
    },
  },
  '74161': {
    name: 'Synchronous 4-bit counter (async clear)', family: 'Counters & registers', pins: 16, seq: true,
    names: ['/CLR', 'CLK', 'A', 'B', 'C', 'D', 'ENP', 'GND', '/LOAD', 'ENT', 'QD', 'QC', 'QB', 'QA', 'RCO', 'VCC'],
    out: [14, 13, 12, 11, 15],
    eval: (v, s) => {
      const e = edge(v, s, 2, false);
      s.n ??= 0;
      if (!v(1)) s.n = 0;
      else if (e) {
        if (!v(9)) s.n = v(3) | v(4) << 1 | v(5) << 2 | v(6) << 3;
        else if (v(7) && v(10)) s.n = (s.n + 1) & 15;
      }
      return { 14: s.n & 1, 13: s.n >> 1 & 1, 12: s.n >> 2 & 1, 11: s.n >> 3 & 1, 15: +(v(10) && s.n === 15) };
    },
  },
  '74194': {
    name: '4-bit bidirectional universal shift register', family: 'Counters & registers', pins: 16, seq: true,
    names: ['/CLR', 'SR', 'A', 'B', 'C', 'D', 'SL', 'GND', 'S0', 'S1', 'CLK', 'QD', 'QC', 'QB', 'QA', 'VCC'],
    out: [15, 14, 13, 12],
    eval: (v, s) => {
      const e = edge(v, s, 11, false);
      s.r ??= [0, 0, 0, 0];
      if (!v(1)) s.r = [0, 0, 0, 0];
      else if (e) {
        const m = v(9) | v(10) << 1;
        const r = s.r;
        if (m === 1) s.r = [v(2), r[0], r[1], r[2]];
        else if (m === 2) s.r = [r[1], r[2], r[3], v(7)];
        else if (m === 3) s.r = [v(3), v(4), v(5), v(6)];
      }
      return { 15: s.r[0], 14: s.r[1], 13: s.r[2], 12: s.r[3] };
    },
  },
  '74164': {
    name: '8-bit serial-in parallel-out shift register', family: 'Counters & registers', pins: 14, seq: true,
    names: ['A', 'B', 'QA', 'QB', 'QC', 'QD', 'GND', 'CLK', '/CLR', 'QE', 'QF', 'QG', 'QH', 'VCC'],
    out: [3, 4, 5, 6, 10, 11, 12, 13],
    eval: (v, s) => {
      const e = edge(v, s, 8, false);
      s.r ??= [0, 0, 0, 0, 0, 0, 0, 0];
      if (!v(9)) s.r = [0, 0, 0, 0, 0, 0, 0, 0];
      else if (e) s.r = [v(1) & v(2), ...s.r.slice(0, 7)];
      const P = [3, 4, 5, 6, 10, 11, 12, 13];
      return Object.fromEntries(P.map((p, i) => [p, s.r[i]]));
    },
  },
};

for (const [id, c] of Object.entries(CHIPS)) {
  c.id = id;
  c.vcc ??= c.pins;
  c.gnd ??= c.pins / 2;
  c.kind = {};
  for (let p = 1; p <= c.pins; p++) {
    const n = c.names[p - 1];
    c.kind[p] = p === c.vcc || p === c.gnd ? 'pwr' : n === 'NC' ? 'nc' : c.out.includes(p) ? 'out' : 'in';
  }
}

export const FAMILIES = [...new Set(Object.values(CHIPS).map(c => c.family))];
