// Turn a minimal SOP into a wired breadboard: AND–OR (7404/7408/7432) or NAND only (7400/7410/7420).
import { make } from './experiments.js';

const SLOTS = {
  '7404': [[1, 2], [3, 4], [5, 6], [9, 8], [11, 10], [13, 12]],
  '7408': [[1, 2, 3], [4, 5, 6], [9, 10, 8], [12, 13, 11]],
  '7432': [[1, 2, 3], [4, 5, 6], [9, 10, 8], [12, 13, 11]],
  '7400': [[1, 2, 3], [4, 5, 6], [9, 10, 8], [12, 13, 11]],
  '7410': [[1, 2, 13, 12], [3, 4, 5, 6], [9, 10, 11, 8]],
  '7420': [[1, 2, 4, 5, 6], [9, 10, 12, 13, 8]],
};
const COLS = [1, 9, 17, 25, 33, 41, 49];

/**
 * terms: array of product terms, each an array of { v: variable index, neg: bool }
 * n: number of variables (inputs on S1..Sn), output on L1
 * constant: 0 | 1 | null
 */
export function buildLogic({ terms, n, constant, style = 'andor' }) {
  let error = null;
  let result;
  try {
    result = make((b) => {
      const pools = {};
      let next = 0;
      const gate = (type) => {
        let pool = pools[type];
        if (!pool || !pool.free.length) {
          if (next >= COLS.length) throw new Error('This function needs more than seven chips. Simplify it, or build part of it by hand.');
          const u = b.chip(type, COLS[next++]);
          b.power(u);
          pool = pools[type] = { u, free: SLOTS[type].slice() };
        }
        return { u: pool.u, pins: pool.free.shift() };
      };
      // a signal is either a switch pad or a chip output pin
      const src = (sig) => (typeof sig === 'string' ? sig : sig.u.p(sig.pin));
      const lit = (v) => 'sw' + (v + 1);
      const notCache = {};
      const not = (v) => {
        if (notCache[v]) return notCache[v];
        if (style === 'nand') {
          const g = gate('7400');
          b.wire(lit(v), g.u.p(g.pins[0]), `NOT input ${'ABCD'[v]}`);
          b.wire(g.u.p(g.pins[0]), g.u.p(g.pins[1]), 'tie inputs');
          return (notCache[v] = { u: g.u, pin: g.pins[2] });
        }
        const g = gate('7404');
        b.wire(lit(v), g.u.p(g.pins[0]), `NOT input ${'ABCD'[v]}`);
        return (notCache[v] = { u: g.u, pin: g.pins[1] });
      };
      const sigOf = (l) => (l.neg ? not(l.v) : lit(l.v));
      // n-input gate built from 2-input gates (AND-OR style)
      const chain = (type, sigs, label) => {
        let acc = sigs[0];
        for (let i = 1; i < sigs.length; i++) {
          const g = gate(type);
          b.wire(src(acc), g.u.p(g.pins[0]), label);
          b.wire(src(sigs[i]), g.u.p(g.pins[1]), label);
          acc = { u: g.u, pin: g.pins[2] };
        }
        return acc;
      };
      // single NAND with up to four inputs
      const nandN = (sigs, label) => {
        const type = sigs.length <= 2 ? '7400' : sigs.length === 3 ? '7410' : '7420';
        if (sigs.length > 4) throw new Error('A term has more than four inputs; the NAND-only build supports up to four.');
        const g = gate(type);
        const ins = g.pins.slice(0, -1);
        ins.forEach((p, i) => b.wire(src(sigs[Math.min(i, sigs.length - 1)]), g.u.p(p), label));
        return { u: g.u, pin: g.pins[g.pins.length - 1] };
      };

      // NAND of any number of inputs: chunks of four, re-ANDed, then NANDed again
      const nandMany = (sigs, label) => {
        if (sigs.length <= 4) return nandN(sigs, label);
        const ands = [];
        for (let i = 0; i < sigs.length; i += 4) ands.push(nandN([nandN(sigs.slice(i, i + 4), label)], label));
        return nandMany(ands, label);
      };

      if (constant != null) {
        b.wire(constant ? b.hi(1, true) : b.lo(1, true), 'led1', `F is always ${constant}`);
        return;
      }
      let out;
      if (style === 'nand') {
        // F = NAND( NAND(term1), NAND(term2), ... ); a one-literal term enters inverted
        const level1 = terms.map((t, i) => (t.length === 1 ? sigOf({ ...t[0], neg: !t[0].neg }) : nandMany(t.map(sigOf), `term ${i + 1}`)));
        out = level1.length === 1 ? (terms[0].length === 1 ? sigOf(terms[0][0]) : nandN([level1[0]], 'invert')) : nandMany(level1, 'output NAND');
      } else {
        const level1 = terms.map((t, i) => chain('7408', t.map(sigOf), `term ${i + 1}`));
        out = chain('7432', level1, 'OR');
      }
      b.wire(src(out), 'led1', 'F');
    });
  } catch (e) { error = e.message; }
  return error ? { error } : result;
}
