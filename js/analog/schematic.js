// Static circuit-diagram renderer used on the experiment overview.
import { svg, fmtSI } from '../shared/site.js';
import { terminals, G } from './engine.js';

function valueLabel(e) {
  if (e.label && (!['R', 'C', 'L'].includes(e.type) || !e.value)) return e.label;
  const v = e.value;
  const base = {
    R: () => fmtSI(v, 'Ω'), C: () => fmtSI(v, 'F'), L: () => fmtSI(v, 'H'), V: () => fmtSI(v, 'V'), I: () => fmtSI(v, 'A'),
    AC: () => `${fmtSI(e.amp, 'V')} ${fmtSI(e.freq, 'Hz')}`, Z: () => `${e.vz} V`, LED: () => 'LED',
  }[e.type];
  const txt = base ? base() : '';
  return e.label ? `${e.label} ${txt}` : txt;
}

function body(type, L, e) {
  const g = svg('g');
  const add = (tag, a) => { const n = svg(tag, a); g.append(n); return n; };
  const lead = (x1, x2) => add('line', { x1, y1: 0, x2, y2: 0, class: 'sc-w' });
  const c = L / 2, h = Math.min(20, c - 2);
  switch (type) {
    case 'R': { lead(0, c - h); lead(c + h, L); let d = `M${c - h},0`; for (let i = 0; i < 6; i++) d += ` L${c - h + (2 * h / 6) * (i + 0.5)},${i % 2 ? 6 : -6}`; add('path', { d: d + ` L${c + h},0`, class: 'sc-s' }); break; }
    case 'C': lead(0, c - 4); lead(c + 4, L); add('line', { x1: c - 4, y1: -13, x2: c - 4, y2: 13, class: 'sc-s thick' }); add('line', { x1: c + 4, y1: -13, x2: c + 4, y2: 13, class: 'sc-s thick' }); break;
    case 'L': { lead(0, c - h); lead(c + h, L); let d = `M${c - h},0`; const r = h / 4; for (let i = 0; i < 4; i++) d += ` a${r},${r} 0 0 1 ${2 * r},0`; add('path', { d, class: 'sc-s' }); break; }
    case 'V': lead(0, c - 4); lead(c + 4, L); add('line', { x1: c - 4, y1: -8, x2: c - 4, y2: 8, class: 'sc-s thick' }); add('line', { x1: c + 4, y1: -15, x2: c + 4, y2: 15, class: 'sc-s' }); add('text', { x: c + 13, y: -9, class: 'sc-pm' }).textContent = '+'; break;
    case 'AC': case 'I': case 'VM': case 'AM': {
      lead(0, c - 15); lead(c + 15, L);
      add('circle', { cx: c, cy: 0, r: 15, class: 'sc-s fillbg' });
      if (type === 'AC') add('path', { d: e.wave === 'square' ? `M${c - 9},4 v-8 h9 v8 h9 v-8` : `M${c - 9},0 q4.5,-10 9,0 q4.5,10 9,0`, class: 'sc-s thin' });
      else if (type === 'I') add('path', { d: `M${c - 8},0 H${c + 7} M${c + 2},-5 L${c + 8},0 L${c + 2},5`, class: 'sc-s thin' });
      else add('text', { x: c, y: 5, class: 'sc-letter' }).textContent = type === 'VM' ? 'V' : 'A';
      break;
    }
    case 'D': case 'LED': case 'Z':
      lead(0, c - 9); lead(c + 9, L);
      add('path', { d: `M${c - 9},-9 L${c + 8},0 L${c - 9},9 Z`, class: 'sc-s fill' });
      if (type === 'Z') add('path', { d: `M${c + 4},-12 L${c + 8},-9 V9 L${c + 12},12`, class: 'sc-s' });
      else add('line', { x1: c + 9, y1: -10, x2: c + 9, y2: 10, class: 'sc-s' });
      if (type === 'LED') add('path', { d: `M${c - 2},-12 l6,-8 M${c + 5},-10 l6,-8`, class: 'sc-s thin' });
      break;
    case 'SW': lead(0, c - 14); lead(c + 14, L); add('circle', { cx: c - 14, cy: 0, r: 2.6, class: 'sc-s fill' }); add('circle', { cx: c + 14, cy: 0, r: 2.6, class: 'sc-s fill' }); add('line', { x1: c - 14, y1: 0, x2: c + 13, y2: -12, class: 'sc-s' }); break;
    default: lead(0, L);
  }
  return g;
}

export function renderSchematic(els) {
  const root = svg('svg', { class: 'schem', role: 'img', 'aria-label': 'Circuit diagram' });
  const pts = [];
  const count = new Map();
  const bump = (p) => { const k = p.join(','); count.set(k, (count.get(k) || 0) + 1); };
  for (const e of els) {
    for (const t of terminals(e)) { pts.push(t); bump(t); }
    if (e.type === 'wire') {
      const [A, B] = e.p;
      root.append(svg('line', { x1: A[0], y1: A[1], x2: B[0], y2: B[1], class: 'sc-w' }));
    } else if (e.type === 'GND') {
      const [x, y] = e.p[0];
      root.append(svg('path', { d: `M${x},${y} v10 M${x - 12},${y + 10} h24 M${x - 7},${y + 15} h14 M${x - 3},${y + 20} h6`, class: 'sc-s' }));
      pts.push([x, y + 22]);
    } else if (e.type === 'OA') {
      const [x, y] = e.p[0], [tm, tp] = terminals(e);
      root.append(svg('path', { d: `M${x},${tm[1]} h12 M${x},${tp[1]} h12 M${x + 68},${y} H${x + 80}`, class: 'sc-w' }));
      root.append(svg('path', { d: `M${x + 12},${y - 34} L${x + 68},${y} L${x + 12},${y + 34} Z`, class: 'sc-s fillbg' }));
      const a = svg('text', { x: x + 19, y: tm[1] + 5, class: 'sc-pm big' }); a.textContent = '−';
      const b = svg('text', { x: x + 19, y: tp[1] + 5, class: 'sc-pm big' }); b.textContent = '+';
      root.append(a, b);
      pts.push([x + 40, y - 36], [x + 40, y + 36]);
    } else if (e.type === 'NPN' || e.type === 'PNP') {
      const [x, y] = e.p[0], f = e.flip ? -1 : 1, [, tc, te] = terminals(e);
      root.append(svg('circle', { cx: x + 28, cy: y, r: 20, class: 'sc-s fillbg' }));
      root.append(svg('path', { d: `M${x},${y} H${x + 18} M${x + 18},${y - 12} V${y + 12} M${x + 18},${y - 6 * f} L${x + 40},${y - 20 * f} V${tc[1]} M${x + 18},${y + 6 * f} L${x + 40},${y + 20 * f} V${te[1]}`, class: 'sc-s' }));
      const t = svg('text', { x: x + 52, y: y + 4, class: 'sc-val' }); t.textContent = e.type; root.append(t);
    } else {
      const [A, B] = e.p;
      const L = Math.hypot(B[0] - A[0], B[1] - A[1]);
      const ang = Math.atan2(B[1] - A[1], B[0] - A[0]) * 180 / Math.PI;
      const g = svg('g', { transform: `translate(${A[0]},${A[1]}) rotate(${ang})` });
      g.append(body(e.type, L, e));
      root.append(g);
      const txt = valueLabel(e);
      if (txt) {
        const mx = (A[0] + B[0]) / 2, my = (A[1] + B[1]) / 2;
        const nx = -(B[1] - A[1]) / (L || 1), ny = (B[0] - A[0]) / (L || 1);
        const side = Math.abs(ny) > Math.abs(nx) ? (ny > 0 ? -1 : 1) : (nx > 0 ? 1 : -1);
        const lx = mx + nx * 22 * side, ly = my + ny * 22 * side;
        const t = svg('text', { x: lx, y: ly + 4, class: 'sc-val', 'text-anchor': Math.abs(nx) > 0.5 ? (nx * side > 0 ? 'start' : 'end') : 'middle' });
        t.textContent = txt;
        root.append(t);
        pts.push([lx + (Math.abs(nx) > 0.5 ? nx * side * 70 : 0), ly]);
      }
    }
  }
  for (const [k, n] of count) if (n >= 3) { const [x, y] = k.split(',').map(Number); root.append(svg('circle', { cx: x, cy: y, r: 3.4, class: 'sc-dot' })); }
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  const x0 = Math.min(...xs) - 30, y0 = Math.min(...ys) - 30, x1 = Math.max(...xs) + 30, y1 = Math.max(...ys) + 20;
  root.setAttribute('viewBox', `${x0} ${y0} ${x1 - x0} ${y1 - y0}`);
  void G;
  return root;
}
