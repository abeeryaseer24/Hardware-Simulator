import { mountChrome, toast, $, $$, el, svg, parseSI, fmtSI } from './shared/site.js';
import { Circuit, TYPES, LED_COLORS, G, terminals } from './analog/engine.js';
import { PRESETS } from './analog/presets.js';

mountChrome('sandbox');

const STORE = 'bn-sandbox-v1';
const circuit = new Circuit();
let preset = null;
let running = true;
let tool = 'select';
let selected = null;
let probes = [null, null];
let windowT = 4e-3;
let showDots = true, showVolt = true;
let lastSnap = '';
const undo = [], redo = [];
let nextId = 1;

// ------------------------------------------------------------------ svg scaffold
const host = $('#schHost');
const root = svg('svg', { class: 'sch', role: 'img', 'aria-label': 'Circuit schematic' });
const gridLayer = svg('g');
const wireLayer = svg('g', { class: 'l-wires' });
const elLayer = svg('g', { class: 'l-els' });
const dotLayer = svg('g', { class: 'l-dots' });
const overLayer = svg('g', { class: 'l-over' });
root.append(gridLayer, wireLayer, elLayer, dotLayer, overLayer);
host.append(root);
let vb = { x: -20, y: -60, w: 760, h: 460 };
const applyVB = () => root.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
applyVB();

const snap = (v) => Math.round(v / G) * G;
function toSvg(e) {
  const pt = root.createSVGPoint();
  pt.x = e.clientX; pt.y = e.clientY;
  return pt.matrixTransform(root.getScreenCTM().inverse());
}

// ------------------------------------------------------------------ element factory
function makeEl(type, p, extra = {}) {
  return { id: nextId++, type, ...structuredClone(TYPES[type].def || {}), p, ...extra };
}
function loadEls(list) {
  circuit.els = list.map(e => makeEl(e.type, e.p.map(q => [...q]), Object.fromEntries(Object.entries(e).filter(([k]) => !['type', 'p', 'id'].includes(k)))));
  circuit.reset();
}
function serialize() {
  return {
    v: 1,
    els: circuit.els.map(e => {
      const o = { type: e.type, p: e.p };
      for (const k of Object.keys(TYPES[e.type].def || {})) o[k] = e[k];
      return o;
    }),
    probes, dt: circuit.dt, window: windowT,
  };
}

// ------------------------------------------------------------------ drawing helpers
function vColor(v) {
  if (!showVolt || v == null || !isFinite(v)) return '#9aa7a0';
  const max = Math.max(1, vMax);
  const t = Math.max(-1, Math.min(1, v / max));
  const mix = (a, b, k) => a.map((x, i) => Math.round(x + (b[i] - x) * k));
  const grey = [154, 167, 160], pos = [255, 196, 61], neg = [77, 208, 255];
  const c = t >= 0 ? mix(grey, pos, Math.sqrt(t)) : mix(grey, neg, Math.sqrt(-t));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}
let vMax = 1;

function label(e) {
  const v = e.value;
  switch (e.type) {
    case 'R': return fmtSI(v, 'Ω');
    case 'C': return fmtSI(v, 'F');
    case 'L': return fmtSI(v, 'H');
    case 'V': return fmtSI(v, 'V');
    case 'I': return fmtSI(v, 'A');
    case 'AC': return `${fmtSI(e.amp, 'V')} ${fmtSI(e.freq, 'Hz')}`;
    case 'Z': return `${e.vz} V`;
    case 'LED': return e.color;
    default: return '';
  }
}

// body drawn in local coords: lead from 0 to L, body centred at L/2
function body(type, L, e) {
  const c = L / 2;
  const g = svg('g', { class: 'body' });
  const add = (tag, a) => { const n = svg(tag, a); g.append(n); return n; };
  const lead = (x1, x2) => add('line', { x1, y1: 0, x2, y2: 0, class: 'lead' });
  const h = Math.min(20, c - 2);
  switch (type) {
    case 'R': {
      lead(0, c - h); lead(c + h, L);
      let d = `M${c - h},0`;
      const n = 6;
      for (let i = 0; i < n; i++) d += ` L${c - h + (2 * h / n) * (i + 0.5)},${i % 2 ? 6 : -6}`;
      d += ` L${c + h},0`;
      add('path', { d, class: 'sym' });
      break;
    }
    case 'C':
      lead(0, c - 4); lead(c + 4, L);
      add('line', { x1: c - 4, y1: -13, x2: c - 4, y2: 13, class: 'sym plate' });
      add('line', { x1: c + 4, y1: -13, x2: c + 4, y2: 13, class: 'sym plate' });
      break;
    case 'L': {
      lead(0, c - h); lead(c + h, L);
      let d = `M${c - h},0`;
      const r = h / 4;
      for (let i = 0; i < 4; i++) d += ` a${r},${r} 0 0 1 ${2 * r},0`;
      add('path', { d, class: 'sym' });
      break;
    }
    case 'V':
      lead(0, c - 4); lead(c + 4, L);
      add('line', { x1: c - 4, y1: -8, x2: c - 4, y2: 8, class: 'sym plate' });
      add('line', { x1: c + 4, y1: -15, x2: c + 4, y2: 15, class: 'sym' });
      add('text', { x: c + 12, y: -9, class: 'pm' }).textContent = '+';
      break;
    case 'AC': case 'I': case 'VM': case 'AM': {
      lead(0, c - 15); lead(c + 15, L);
      add('circle', { cx: c, cy: 0, r: 15, class: 'sym ring' });
      if (type === 'AC') {
        const w = e.wave;
        const d = w === 'square' ? `M${c - 9},4 v-8 h9 v8 h9 v-8`
          : w === 'triangle' ? `M${c - 9},4 l4.5,-8 l9,8 l4.5,-8`
            : w === 'sawtooth' ? `M${c - 9},4 l9,-8 v8 l9,-8 v8`
              : `M${c - 9},0 q4.5,-10 9,0 q4.5,10 9,0`;
        add('path', { d, class: 'sym thin' });
        add('text', { x: c + 19, y: -12, class: 'pm' }).textContent = '+';
      } else if (type === 'I') {
        add('path', { d: `M${c - 8},0 H${c + 7} M${c + 2},-5 L${c + 8},0 L${c + 2},5`, class: 'sym thin' });
      } else {
        add('text', { x: c, y: 5, class: 'meter-letter' }).textContent = type === 'VM' ? 'V' : 'A';
        add('text', { x: c + 19, y: -10, class: 'pm' }).textContent = '+';
      }
      break;
    }
    case 'D': case 'LED': case 'Z': {
      lead(0, c - 9); lead(c + 9, L);
      add('path', { d: `M${c - 9},-9 L${c + 8},0 L${c - 9},9 Z`, class: 'sym fillsym' });
      if (type === 'Z') add('path', { d: `M${c + 4},-12 L${c + 8},-9 V9 L${c + 12},12`, class: 'sym' });
      else add('line', { x1: c + 9, y1: -10, x2: c + 9, y2: 10, class: 'sym' });
      if (type === 'LED') {
        add('path', { d: `M${c - 2},-12 l6,-8 M${c + 1},-20 l3,0 l0,3 M${c + 5},-10 l6,-8 M${c + 8},-18 l3,0 l0,3`, class: 'sym thin' });
        const glow = add('circle', { cx: c, cy: 0, r: 16, class: 'led-glow', fill: (LED_COLORS[e.color] || LED_COLORS.red).rgb });
        glow.dataset.glow = '1';
      }
      break;
    }
    case 'SW': {
      lead(0, c - 14); lead(c + 14, L);
      add('circle', { cx: c - 14, cy: 0, r: 2.6, class: 'sym fillsym' });
      add('circle', { cx: c + 14, cy: 0, r: 2.6, class: 'sym fillsym' });
      add('line', { x1: c - 14, y1: 0, x2: c + 13, y2: e.closed ? 0 : -12, class: 'sym lever' });
      break;
    }
    default: lead(0, L);
  }
  return g;
}

function drawTwo(e) {
  const [A, B] = e.p;
  const L = Math.hypot(B[0] - A[0], B[1] - A[1]);
  const ang = Math.atan2(B[1] - A[1], B[0] - A[0]) * 180 / Math.PI;
  const g = svg('g', { class: 'el t-' + e.type + (selected === e.id ? ' is-sel' : ''), 'data-id': e.id });
  const inner = svg('g', { transform: `translate(${A[0]},${A[1]}) rotate(${ang})` });
  const b = body(e.type, L, e);
  // colour the two leads by their terminal voltages
  const leads = b.querySelectorAll('.lead');
  if (leads[0]) leads[0].setAttribute('stroke', vColor(circuit.voltageAt(A)));
  if (leads[1]) leads[1].setAttribute('stroke', vColor(circuit.voltageAt(B)));
  inner.append(svg('line', { x1: 0, y1: 0, x2: L, y2: 0, class: 'hit' }), b);
  g.append(inner);
  // label upright, offset to the side
  const txt = label(e);
  const mx = (A[0] + B[0]) / 2, my = (A[1] + B[1]) / 2;
  const nx = -(B[1] - A[1]) / (L || 1), ny = (B[0] - A[0]) / (L || 1);
  const side = Math.abs(ny) > Math.abs(nx) ? (ny > 0 ? -1 : 1) : (nx > 0 ? 1 : -1);
  const off = e.type === 'VM' || e.type === 'AM' ? 26 : 22;
  const lx = mx + nx * off * side, ly = my + ny * off * side;
  if (txt) {
    const t = svg('text', { x: lx, y: ly + 4, class: 'val', 'text-anchor': Math.abs(nx) > 0.5 ? (nx * side > 0 ? 'start' : 'end') : 'middle' });
    t.textContent = txt;
    g.append(t);
  }
  if (e.type === 'VM' || e.type === 'AM') {
    const r = e.type === 'VM' ? fmtSI(e.reading ?? 0, 'V', 4) : fmtSI(e.cur ?? 0, 'A', 4);
    const t = svg('text', { x: lx, y: ly + 4, class: 'reading', 'text-anchor': Math.abs(nx) > 0.5 ? (nx * side > 0 ? 'start' : 'end') : 'middle', 'data-reading': e.id });
    t.textContent = r;
    g.append(t);
  }
  return g;
}

function drawGround(e) {
  const [x, y] = e.p[0];
  const g = svg('g', { class: 'el t-GND' + (selected === e.id ? ' is-sel' : ''), 'data-id': e.id });
  g.append(svg('path', { d: `M${x},${y} v10 M${x - 12},${y + 10} h24 M${x - 7},${y + 15} h14 M${x - 3},${y + 20} h6`, class: 'sym' }));
  g.append(svg('rect', { x: x - 14, y: y - 2, width: 28, height: 26, class: 'hit-box' }));
  return g;
}

function drawOpamp(e) {
  const [x, y] = e.p[0];
  const f = e.flip ? -1 : 1;
  const g = svg('g', { class: 'el t-OA' + (selected === e.id ? ' is-sel' : ''), 'data-id': e.id });
  const [tm, tp, to] = terminals(e);
  g.append(svg('line', { x1: x, y1: tm[1], x2: x + 12, y2: tm[1], class: 'lead', stroke: vColor(circuit.voltageAt(tm)) }));
  g.append(svg('line', { x1: x, y1: tp[1], x2: x + 12, y2: tp[1], class: 'lead', stroke: vColor(circuit.voltageAt(tp)) }));
  g.append(svg('line', { x1: x + 68, y1: y, x2: to[0], y2: y, class: 'lead', stroke: vColor(circuit.voltageAt(to)) }));
  g.append(svg('path', { d: `M${x + 12},${y - 34} L${x + 68},${y} L${x + 12},${y + 34} Z`, class: 'sym oa-body' }));
  const t1 = svg('text', { x: x + 18, y: tm[1] + 5, class: 'pm big' }); t1.textContent = '−';
  const t2 = svg('text', { x: x + 18, y: tp[1] + 5, class: 'pm big' }); t2.textContent = '+';
  g.append(t1, t2);
  g.append(svg('rect', { x: x, y: y - 36, width: 80, height: 72, class: 'hit-box' }));
  void f;
  return g;
}

function drawBJT(e) {
  const [x, y] = e.p[0];
  const f = e.flip ? -1 : 1;
  const g = svg('g', { class: 'el t-BJT' + (selected === e.id ? ' is-sel' : ''), 'data-id': e.id });
  const [tb, tc, te] = terminals(e);
  g.append(svg('circle', { cx: x + 28, cy: y, r: 20, class: 'sym ring' }));
  g.append(svg('line', { x1: x, y1: y, x2: x + 18, y2: y, class: 'lead', stroke: vColor(circuit.voltageAt(tb)) }));
  g.append(svg('line', { x1: x + 18, y1: y - 12, x2: x + 18, y2: y + 12, class: 'sym plate' }));
  g.append(svg('path', { d: `M${x + 18},${y - 6 * f} L${x + 40},${y - 20 * f} V${tc[1]}`, class: 'lead', stroke: vColor(circuit.voltageAt(tc)) }));
  g.append(svg('path', { d: `M${x + 18},${y + 6 * f} L${x + 40},${y + 20 * f} V${te[1]}`, class: 'lead', stroke: vColor(circuit.voltageAt(te)) }));
  // emitter arrow: out for NPN, in for PNP
  const ax = x + 18 + 22 * 0.62, ay = y + (6 + 14 * 0.62) * f;
  const dir = e.type === 'NPN' ? 1 : -1;
  const ux = 22 / 26 * dir, uy = 14 / 26 * f * dir;
  g.append(svg('path', { d: `M${ax + ux * 5},${ay + uy * 5} L${ax - ux * 4 - uy * 4},${ay - uy * 4 + ux * 4} L${ax - ux * 4 + uy * 4},${ay - uy * 4 - ux * 4} Z`, class: 'sym fillsym' }));
  const t = svg('text', { x: x + 54, y: y + 4, class: 'val', 'text-anchor': 'start' }); t.textContent = e.type;
  g.append(t);
  g.append(svg('rect', { x: x, y: y - 42, width: 48, height: 84, class: 'hit-box' }));
  return g;
}

// ------------------------------------------------------------------ render
function render() {
  wireLayer.replaceChildren();
  elLayer.replaceChildren();
  dotLayer.replaceChildren();
  // node voltage range for colouring
  vMax = 1;
  if (circuit.x) for (let i = 0; i < circuit.nNodes; i++) vMax = Math.max(vMax, Math.abs(circuit.x[i] || 0));

  const count = new Map();
  const bump = (p) => { const k = p[0] + ',' + p[1]; count.set(k, (count.get(k) || 0) + 1); };

  for (const e of circuit.els) {
    for (const t of terminals(e)) bump(t);
    if (e.type === 'wire') {
      const [A, B] = e.p;
      const g = svg('g', { class: 'el t-wire' + (selected === e.id ? ' is-sel' : ''), 'data-id': e.id });
      g.append(svg('line', { x1: A[0], y1: A[1], x2: B[0], y2: B[1], class: 'hit' }));
      g.append(svg('line', { x1: A[0], y1: A[1], x2: B[0], y2: B[1], class: 'wire', stroke: vColor(circuit.voltageAt(A)) }));
      wireLayer.append(g);
      continue;
    }
    let g;
    if (e.type === 'GND') g = drawGround(e);
    else if (e.type === 'OA') g = drawOpamp(e);
    else if (e.type === 'NPN' || e.type === 'PNP') g = drawBJT(e);
    else g = drawTwo(e);
    elLayer.append(g);
    if (TYPES[e.type].n === 2 && e.type !== 'wire' && e.type !== 'VM') {
      const [A, B] = e.p;
      const d = svg('line', { x1: A[0], y1: A[1], x2: B[0], y2: B[1], class: 'cdots', 'data-dots': e.id });
      dotLayer.append(d);
    }
  }
  // T-junctions on wire interiors count as joins too
  for (const w of circuit.els.filter(e => e.type === 'wire')) {
    for (const e of circuit.els) for (const t of terminals(e)) {
      const [A, B] = w.p;
      const cross = (B[0] - A[0]) * (t[1] - A[1]) - (B[1] - A[1]) * (t[0] - A[0]);
      if (cross !== 0) continue;
      const dot = (t[0] - A[0]) * (B[0] - A[0]) + (t[1] - A[1]) * (B[1] - A[1]);
      const len = (B[0] - A[0]) ** 2 + (B[1] - A[1]) ** 2;
      if (dot > 0 && dot < len) { bump(t); bump(t); }
    }
  }
  for (const [k, n] of count) {
    const [x, y] = k.split(',').map(Number);
    if (n >= 3) wireLayer.append(svg('circle', { cx: x, cy: y, r: 3.6, class: 'junction', fill: vColor(circuit.voltageAt([x, y])) }));
    else if (n === 1) wireLayer.append(svg('circle', { cx: x, cy: y, r: 2.6, class: 'open-end' }));
  }
  // probes
  probes.forEach((p, i) => {
    if (!p) return;
    const g = svg('g', { class: 'probe ch' + (i + 1) });
    g.append(svg('path', { d: `M${p[0]},${p[1]} l-7,-16 h14 z`, class: 'probe-tip' }));
    const t = svg('text', { x: p[0], y: p[1] - 20, class: 'probe-lab' }); t.textContent = 'CH' + (i + 1);
    g.append(t);
    overLayer.append(g);
  });
  liveUpdate(0);
}

// per-frame updates that don't need a full redraw
const dotOffset = new Map();
function liveUpdate(dtReal) {
  for (const d of dotLayer.children) {
    const id = +d.dataset.dots;
    const e = circuit.els.find(x => x.id === id);
    if (!e) continue;
    const I = e.cur ?? 0;
    const a = Math.abs(I);
    if (!showDots || !running || a < 1e-7 || !isFinite(I)) { d.style.opacity = 0; continue; }
    d.style.opacity = 1;
    const speed = Math.min(90, Math.max(6, Math.log10(a / 1e-7) * 14));
    const off = (dotOffset.get(id) || 0) - Math.sign(I) * speed * dtReal;
    dotOffset.set(id, off % 64);
    d.setAttribute('stroke-dashoffset', off % 64);
  }
  for (const t of root.querySelectorAll('[data-reading]')) {
    const e = circuit.els.find(x => x.id === +t.dataset.reading);
    if (e) t.textContent = e.type === 'VM' ? fmtSI(e.reading ?? 0, 'V', 4) : fmtSI(e.cur ?? 0, 'A', 4);
  }
  for (const gl of elLayer.querySelectorAll('[data-glow]')) {
    const id = +gl.closest('[data-id]').dataset.id;
    const e = circuit.els.find(x => x.id === id);
    const I = Math.max(0, e?.cur ?? 0);
    gl.style.opacity = Math.min(1, I / 0.012);
  }
}

// ------------------------------------------------------------------ hit testing
function distSeg(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy || 1;
  let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}
function hitEl(p) {
  let best = null, bd = 9;
  for (const e of circuit.els) {
    let d;
    if (e.type === 'GND') d = Math.hypot(p[0] - e.p[0][0], p[1] - e.p[0][1] - 10) - 8;
    else if (e.type === 'OA') { const [x, y] = e.p[0]; d = p[0] >= x && p[0] <= x + 80 && Math.abs(p[1] - y) <= 36 ? 0 : 99; }
    else if (e.type === 'NPN' || e.type === 'PNP') { const [x, y] = e.p[0]; d = p[0] >= x && p[0] <= x + 48 && Math.abs(p[1] - y) <= 42 ? 0 : 99; }
    else d = distSeg(p, e.p[0], e.p[1]) - (e.type === 'wire' ? 0 : 4);
    if (e.type === 'wire') d += 2; // prefer components over wires
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}

// ------------------------------------------------------------------ interaction
let drag = null;
root.addEventListener('pointerdown', (ev) => {
  if (ev.button === 2) return;
  const p = toSvg(ev);
  const sp = [snap(p.x), snap(p.y)];
  root.setPointerCapture(ev.pointerId);
  if (tool === 'probe1' || tool === 'probe2') {
    const i = tool === 'probe1' ? 0 : 1;
    probes[i] = sp;
    scopeClear();
    setTool('select');
    render(); save();
    return;
  }
  if (tool === 'select') {
    const sel = circuit.els.find(e => e.id === selected);
    if (sel && TYPES[sel.type].n === 2) {
      for (let k = 0; k < 2; k++) if (Math.hypot(sel.p[k][0] - p.x, sel.p[k][1] - p.y) < 9) { drag = { kind: 'end', e: sel, k, moved: false }; return; }
    }
    const e = hitEl([p.x, p.y]);
    if (e) { drag = { kind: 'move', e, start: sp, orig: e.p.map(q => [...q]), moved: false, x: ev.clientX, y: ev.clientY }; select(e.id); return; }
    drag = { kind: 'pan', x: ev.clientX, y: ev.clientY, vb: { ...vb }, moved: false };
    return;
  }
  // placing
  const n = TYPES[tool].n;
  if (n === 2) drag = { kind: 'place', a: sp, b: sp, moved: false, x: ev.clientX, y: ev.clientY };
  else {
    const e = makeEl(tool, [sp]);
    circuit.els.push(e);
    changed();
    select(e.id);
  }
});

root.addEventListener('pointermove', (ev) => {
  const p = toSvg(ev);
  const sp = [snap(p.x), snap(p.y)];
  if (drag) {
    if (drag.x != null && Math.hypot(ev.clientX - drag.x, ev.clientY - drag.y) > 4) drag.moved = true;
    if (drag.kind === 'pan') {
      drag.moved = true;
      const r = root.getBoundingClientRect();
      const k = vb.w / r.width;
      vb.x = drag.vb.x - (ev.clientX - drag.x) * k;
      vb.y = drag.vb.y - (ev.clientY - drag.y) * k;
      applyVB();
    } else if (drag.kind === 'move' && drag.moved) {
      const dx = sp[0] - drag.start[0], dy = sp[1] - drag.start[1];
      drag.e.p = drag.orig.map(q => [q[0] + dx, q[1] + dy]);
      circuit.dirty = true;
      render();
    } else if (drag.kind === 'end') {
      drag.moved = true;
      drag.e.p[drag.k] = sp;
      circuit.dirty = true;
      render();
    } else if (drag.kind === 'place') {
      drag.b = sp;
      ghost(drag.a, drag.b);
    }
  }
  hover([p.x, p.y], sp);
});

root.addEventListener('pointerup', () => {
  if (!drag) return;
  const d = drag;
  drag = null;
  if (d.kind === 'place') {
    let b = d.b;
    if (b[0] === d.a[0] && b[1] === d.a[1]) {
      if (tool === 'wire') { clearGhost(); return; }
      b = [d.a[0] + 4 * G, d.a[1]];
    }
    const e = makeEl(tool, [d.a, b]);
    circuit.els.push(e);
    clearGhost();
    changed();
    select(e.id);
  } else if (d.kind === 'move' || d.kind === 'end') {
    if (d.moved) changed();
    else if (d.e.type === 'SW') { d.e.closed = !d.e.closed; circuit.dirty = true; changed(); renderInspector(); toast(d.e.closed ? 'Switch closed' : 'Switch opened'); }
  } else if (d.kind === 'pan' && !d.moved) select(null);
});

root.addEventListener('wheel', (ev) => {
  ev.preventDefault();
  const p = toSvg(ev);
  const f = ev.deltaY > 0 ? 1.12 : 1 / 1.12;
  const nw = Math.max(200, Math.min(3000, vb.w * f));
  const k = nw / vb.w;
  vb.x = p.x - (p.x - vb.x) * k; vb.y = p.y - (p.y - vb.y) * k;
  vb.w = nw; vb.h *= k;
  applyVB();
}, { passive: false });

root.addEventListener('contextmenu', (ev) => {
  ev.preventDefault();
  const p = toSvg(ev);
  const e = hitEl([p.x, p.y]);
  if (e) removeEl(e.id);
});

function ghost(a, b) {
  overLayer.querySelector('.ghost')?.remove();
  const g = svg('g', { class: 'ghost' });
  if (tool === 'wire') g.append(svg('line', { x1: a[0], y1: a[1], x2: b[0], y2: b[1], class: 'wire' }));
  else {
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (L > 0) {
      const ang = Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI;
      const inner = svg('g', { transform: `translate(${a[0]},${a[1]}) rotate(${ang})` });
      inner.append(body(tool, L, makeEl(tool, [a, b])));
      g.append(inner);
    }
  }
  overLayer.append(g);
}
function clearGhost() { overLayer.querySelector('.ghost')?.remove(); }

function hover(p, sp) {
  const e = hitEl(p);
  if (e && e.type !== 'wire') { status(describe(e)); return; }
  const v = circuit.voltageAt(sp);
  if (v != null) status(`Node at (${sp[0] / G}, ${sp[1] / G}): ${fmtSI(v, 'V', 4)}`);
  else status(tool === 'select' ? 'Drag empty space to pan, scroll to zoom. Right-click a part to delete it.' : `${TYPES[tool].label}: drag from one end to the other.`);
}

function describe(e) {
  const V = Math.abs(e.volt ?? 0), I = e.cur ?? 0;
  switch (e.type) {
    case 'R': return `Resistor ${label(e)} · V = ${fmtSI(V, 'V')} · I = ${fmtSI(Math.abs(I), 'A')} · P = ${fmtSI(V * Math.abs(I), 'W')}`;
    case 'C': return `Capacitor ${label(e)} · V = ${fmtSI(e.volt, 'V')} · I = ${fmtSI(I, 'A')}`;
    case 'L': return `Inductor ${label(e)} · I = ${fmtSI(I, 'A')} · V = ${fmtSI(e.volt, 'V')}`;
    case 'V': case 'AC': return `${TYPES[e.type].label} · delivering ${fmtSI(I, 'A')} · P = ${fmtSI(Math.abs(e.volt * I), 'W')}`;
    case 'D': case 'LED': case 'Z': return `${TYPES[e.type].label} · Vd = ${fmtSI(e.volt, 'V')} · I = ${fmtSI(I, 'A')}`;
    case 'SW': return `Switch, ${e.closed ? 'closed' : 'open'}. Click to flip it.`;
    case 'VM': return `Voltmeter reads ${fmtSI(e.reading ?? 0, 'V', 4)}`;
    case 'AM': return `Ammeter reads ${fmtSI(I, 'A', 4)}`;
    case 'NPN': case 'PNP': return `${e.type} · Ic = ${fmtSI(e.ic ?? 0, 'A')} · Ib = ${fmtSI(e.ib ?? 0, 'A')} · β = ${e.beta}`;
    case 'OA': return `Op-amp · output ${fmtSI(circuit.voltageAt(terminals(e)[2]) ?? 0, 'V')}`;
    case 'GND': return 'Ground: the 0 V reference';
    default: return TYPES[e.type].label;
  }
}

function status(t) { $('#statusLine').textContent = t; }

// ------------------------------------------------------------------ editing
function changed() {
  circuit.dirty = true;
  render();
  snapshot();
  save();
  renderMeters();
}
function removeEl(id) {
  circuit.els = circuit.els.filter(e => e.id !== id);
  if (selected === id) select(null);
  changed();
}
function select(id) {
  selected = id;
  render();
  renderInspector();
}
function setTool(t) {
  tool = t;
  $$('.part-btn').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.tool === t)));
  root.classList.toggle('is-placing', t !== 'select');
  $('#probe1Btn').classList.toggle('is-on', t === 'probe1');
  $('#probe2Btn').classList.toggle('is-on', t === 'probe2');
  if (t === 'probe1' || t === 'probe2') status(`Click any node or wire to clip the ${t === 'probe1' ? 'CH1' : 'CH2'} probe there.`);
}

function snapshot() {
  const s = JSON.stringify(serialize());
  if (s === lastSnap) return;
  if (lastSnap) { undo.push(lastSnap); if (undo.length > 100) undo.shift(); }
  redo.length = 0;
  lastSnap = s;
  $('#undoBtn').disabled = !undo.length; $('#redoBtn').disabled = true;
}
function restore(json, keepState) {
  const d = JSON.parse(json);
  loadEls(d.els || []);
  probes = d.probes || [null, null];
  if (d.dt) circuit.dt = d.dt;
  if (d.window) setWindow(d.window);
  lastSnap = json;
  if (!keepState) circuit.dcOperatingPoint();
  selected = null;
  render(); renderInspector(); renderMeters(); save();
  $('#undoBtn').disabled = !undo.length; $('#redoBtn').disabled = !redo.length;
}
$('#undoBtn').onclick = () => { if (!undo.length) return; redo.push(lastSnap); restore(undo.pop()); };
$('#redoBtn').onclick = () => { if (!redo.length) return; undo.push(lastSnap); restore(redo.pop()); };
function save() { try { localStorage.setItem(STORE, JSON.stringify(serialize())); } catch { /* ignore */ } }

// ------------------------------------------------------------------ panels
$$('[data-tab]').forEach(b => b.addEventListener('click', () => {
  $$('[data-tab]').forEach(x => x.setAttribute('aria-selected', String(x === b)));
  $$('[data-pane]').forEach(p => { p.hidden = p.dataset.pane !== b.dataset.tab; });
}));
$$('[data-rtab]').forEach(b => b.addEventListener('click', () => rtab(b.dataset.rtab)));
function rtab(n) {
  $$('[data-rtab]').forEach(x => x.setAttribute('aria-selected', String(x.dataset.rtab === n)));
  $$('[data-rpane]').forEach(p => { p.hidden = p.dataset.rpane !== n; });
  if (n === 'meters') renderMeters();
}
$('#drawerBtn').onclick = () => $('#rightPanel').classList.toggle('is-open');

function renderPresets() {
  const hostEl = $('#presetList');
  const groups = [...new Set(PRESETS.map(p => p.group))];
  for (const g of groups) {
    hostEl.append(el('h4', { class: 'exp-group' }, g));
    const ul = el('ul', { class: 'preset-ul' });
    for (const p of PRESETS.filter(x => x.group === g)) {
      ul.append(el('li', {}, el('button', { class: 'exp-item' + (preset?.id === p.id ? ' is-active' : ''), 'data-preset': p.id, onclick: () => openPreset(p) },
        el('span', { class: 'exp-title' }, p.title))));
    }
    hostEl.append(ul);
  }
}

const PART_ICONS = {
  select: '<path d="M5 3l14 8-6 1.5L10 19z"/>',
  wire: '<path d="M3 17h6V7h12"/><circle cx="3" cy="17" r="1.6"/><circle cx="21" cy="7" r="1.6"/>',
  R: '<path d="M2 12h4l1.5-4 3 8 3-8 3 8 1.5-4h4"/>',
  C: '<path d="M2 12h8M14 12h8M10 5v14M14 5v14"/>',
  L: '<path d="M2 12h3a2.5 2.5 0 0 1 5 0 2.5 2.5 0 0 1 5 0 2.5 2.5 0 0 1 5 0h2"/>',
  V: '<path d="M2 12h8M14 12h8M10 8v8M14 4v16"/>',
  AC: '<circle cx="12" cy="12" r="8"/><path d="M7.5 12q2.25-5 4.5 0t4.5 0"/>',
  I: '<circle cx="12" cy="12" r="8"/><path d="M7 12h9M13 9l3 3-3 3"/>',
  D: '<path d="M2 12h6M16 12h6M8 6l8 6-8 6z M16 6v12"/>',
  LED: '<path d="M2 12h6M16 12h6M8 7l8 5-8 5z M16 7v10M12 5l3-3M15 6l3-3"/>',
  Z: '<path d="M2 12h6M16 12h6M8 6l8 6-8 6z M14 4l2 2v12l2 2"/>',
  SW: '<path d="M2 14h5M17 14h5M7 14l9-6"/><circle cx="7" cy="14" r="1.5"/><circle cx="17" cy="14" r="1.5"/>',
  GND: '<path d="M12 3v9M5 12h14M8 16h8M11 20h2"/>',
  OA: '<path d="M5 4v16l15-8z M2 8h3M2 16h3M20 12h3"/>',
  NPN: '<circle cx="13" cy="12" r="9"/><path d="M2 12h7M9 7v10M9 10l6-5M9 14l6 5M13 17l2 2-3 0"/>',
  PNP: '<circle cx="13" cy="12" r="9"/><path d="M2 12h7M9 7v10M9 10l6-5M9 14l6 5M11 14l-2 0 1 2"/>',
  VM: '<circle cx="12" cy="12" r="8"/><path d="M9 9l3 7 3-7"/>',
  AM: '<circle cx="12" cy="12" r="8"/><path d="M9 16l3-8 3 8M10 13h4"/>',
};
function renderParts() {
  const list = $('#partList');
  const groups = [
    ['Tools', ['select', 'wire']],
    ['Passive', ['R', 'C', 'L', 'SW']],
    ['Sources', ['V', 'AC', 'I', 'GND']],
    ['Semiconductors', ['D', 'LED', 'Z', 'NPN', 'PNP', 'OA']],
    ['Meters', ['VM', 'AM']],
  ];
  for (const [g, items] of groups) {
    list.append(el('h4', { class: 'exp-group' }, g));
    const grid = el('div', { class: 'part-grid' });
    for (const t of items) {
      const name = t === 'select' ? 'Select / move' : TYPES[t].label;
      grid.append(el('button', { class: 'part-btn', 'data-tool': t, 'aria-pressed': String(t === tool), onclick: () => setTool(t) },
        el('span', { class: 'part-ico', html: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${PART_ICONS[t]}</svg>` }),
        el('span', {}, name)));
    }
    list.append(grid);
  }
  list.append(el('p', { class: 'hint' }, 'Keys: W wire, R resistor, C capacitor, Esc to stop placing, Del to delete, T to rotate the selected part, F to flip a transistor or op-amp.'));
}

function field(labelText, input, hint) {
  return el('label', { class: 'field insp-field' }, el('span', {}, labelText), input, hint ? el('small', { class: 'hint' }, hint) : null);
}

function valueEditor(e, key, unit, min = 1e-12) {
  const inp = el('input', { class: 'input mono', value: fmtSI(e[key], '', 4).replace(/\s/g, ''), spellcheck: 'false' });
  const lg = Math.log10(Math.max(Math.abs(e[key]), min));
  const range = el('input', { type: 'range', min: lg - 2, max: lg + 2, step: 0.01, value: lg, class: 'sweep', 'aria-label': 'Sweep value' });
  inp.addEventListener('change', () => {
    const v = parseSI(inp.value);
    if (!isFinite(v)) { toast('Could not read that value. Try 4.7k, 100n or 2.2M.', 'bad'); return; }
    e[key] = v; changed(); renderInspector();
  });
  range.addEventListener('input', () => {
    const v = +(10 ** +range.value).toPrecision(3);
    e[key] = v;
    inp.value = fmtSI(v, '', 3).replace(/\s/g, '');
    render();
  });
  range.addEventListener('change', () => { snapshot(); save(); });
  return el('div', { class: 'val-edit' }, el('div', { class: 'val-row' }, inp, el('span', { class: 'unit' }, unit)), range);
}

function renderInspector() {
  const box = $('#inspect');
  const e = circuit.els.find(x => x.id === selected);
  if (!e) {
    box.replaceChildren(
      preset ? el('div', { class: 'about' }, el('p', { class: 'sheet-group' }, preset.group), el('h3', {}, preset.title), el('p', {}, preset.about)) : el('h3', {}, 'Nothing selected'),
      el('p', { class: 'hint' }, 'Click a part to edit its value. Drag the slider under a value to sweep it while the circuit runs.'),
      el('div', { class: 'legend' },
        el('p', { class: 'panel-label' }, 'Reading the schematic'),
        el('ul', {},
          el('li', {}, el('span', { class: 'sw pos' }), 'positive voltage'),
          el('li', {}, el('span', { class: 'sw zero' }), '0 V (ground)'),
          el('li', {}, el('span', { class: 'sw neg' }), 'negative voltage'),
          el('li', {}, el('span', { class: 'sw dots' }), 'moving dots: current, faster means more'),
          el('li', {}, el('span', { class: 'sw junc' }), 'a dot where wires join; crossings without a dot are not connected'),
        )),
    );
    return;
  }
  const items = [el('h3', {}, TYPES[e.type].label)];
  if (['R', 'C', 'L', 'V', 'I'].includes(e.type)) items.push(field('Value', valueEditor(e, 'value', TYPES[e.type].unit)));
  if (e.type === 'Z') items.push(field('Zener voltage', valueEditor(e, 'vz', 'V', 0.1)));
  if (e.type === 'AC') {
    const wave = el('select', { class: 'input' }, ...['sine', 'square', 'triangle', 'sawtooth'].map(w => el('option', { value: w, selected: e.wave === w }, w)));
    wave.addEventListener('change', () => { e.wave = wave.value; changed(); });
    items.push(field('Waveform', wave), field('Amplitude (peak)', valueEditor(e, 'amp', 'V', 1e-3)), field('Frequency', valueEditor(e, 'freq', 'Hz', 1e-2)));
    const off = el('input', { class: 'input mono', value: e.offset });
    off.addEventListener('change', () => { const v = parseSI(off.value); if (isFinite(v)) { e.offset = v; changed(); } });
    items.push(field('DC offset', off));
  }
  if (e.type === 'LED') {
    const c = el('select', { class: 'input' }, ...Object.keys(LED_COLORS).map(k => el('option', { value: k, selected: e.color === k }, `${k} (Vf ≈ ${LED_COLORS[k].vf} V)`)));
    c.addEventListener('change', () => { e.color = c.value; changed(); });
    items.push(field('Colour', c));
  }
  if (e.type === 'SW') items.push(el('button', { class: 'btn btn--mask', onclick: () => { e.closed = !e.closed; changed(); renderInspector(); } }, e.closed ? 'Open the switch' : 'Close the switch'));
  if (e.type === 'NPN' || e.type === 'PNP') {
    const b = el('input', { class: 'input mono', value: e.beta });
    b.addEventListener('change', () => { const v = +b.value; if (v > 0) { e.beta = v; changed(); } });
    items.push(field('Current gain β (hFE)', b));
  }
  if (e.type === 'OA') {
    const s = el('input', { class: 'input mono', value: e.vsat });
    s.addEventListener('change', () => { const v = +s.value; if (v > 0) { e.vsat = v; changed(); } });
    items.push(field('Output swing ± (V)', s, 'About 1.5 V below a ±15 V supply.'));
  }
  items.push(el('div', { class: 'live', id: 'liveBox' }));
  const btns = el('div', { class: 'sheet-actions' });
  if (TYPES[e.type].n === 2) btns.append(el('button', { class: 'btn btn--sm', onclick: () => rotate(e) }, 'Rotate 90°'), el('button', { class: 'btn btn--sm', onclick: () => { e.p = [e.p[1], e.p[0]]; changed(); } }, 'Reverse'));
  if (TYPES[e.type].n === 3) btns.append(el('button', { class: 'btn btn--sm', onclick: () => { e.flip = !e.flip; changed(); } }, 'Flip'));
  btns.append(el('button', { class: 'btn btn--sm', onclick: () => removeEl(e.id) }, 'Delete'));
  items.push(btns);
  box.replaceChildren(...items);
  updateLiveBox();
  rtab('inspect');
}
function updateLiveBox() {
  const box = $('#liveBox');
  const e = circuit.els.find(x => x.id === selected);
  if (!box || !e) return;
  box.textContent = describe(e);
}
function rotate(e) {
  const [A, B] = e.p;
  const dx = B[0] - A[0], dy = B[1] - A[1];
  e.p = [A, [A[0] - dy, A[1] + dx]];
  changed();
}

function renderMeters() {
  const box = $('#meters');
  if (box.hidden) return;
  const rows = [];
  for (const e of circuit.els) {
    if (e.type === 'wire' || e.type === 'GND') continue;
    let v = '', i = '', pw = '';
    const V = e.type === 'VM' ? e.reading : e.volt, I = e.cur;
    if (V != null) v = fmtSI(V, 'V');
    if (I != null && e.type !== 'VM') i = fmtSI(I, 'A');
    if (['R', 'D', 'LED', 'Z'].includes(e.type) && V != null && I != null) pw = fmtSI(Math.abs(V * I), 'W');
    if (e.type === 'NPN' || e.type === 'PNP') { i = 'Ic ' + fmtSI(e.ic ?? 0, 'A'); v = 'Ib ' + fmtSI(e.ib ?? 0, 'A'); }
    if (e.type === 'OA') { v = fmtSI(circuit.voltageAt(terminals(e)[2]) ?? 0, 'V'); i = fmtSI(e.cur ?? 0, 'A'); }
    rows.push(el('tr', { class: selected === e.id ? 'sel' : '', onclick: () => select(e.id) },
      el('td', {}, TYPES[e.type].label + (label(e) ? ' ' + label(e) : '')), el('td', {}, v), el('td', {}, i), el('td', {}, pw)));
  }
  box.replaceChildren(
    el('h3', {}, 'Every part, live'),
    el('p', { class: 'hint' }, 'Voltage across, current through and power dissipated. Click a row to select that part.'),
    el('table', { class: 'table meter-table' }, el('thead', {}, el('tr', {}, el('th', {}, 'Part'), el('th', {}, 'V'), el('th', {}, 'I'), el('th', {}, 'P'))), el('tbody', {}, ...rows)),
  );
}

// ------------------------------------------------------------------ presets
function openPreset(p) {
  preset = p;
  loadEls(p.els);
  probes = (p.probes || []).map(q => [q[0] * G, q[1] * G]);
  while (probes.length < 2) probes.push(null);
  circuit.dt = p.dt;
  setWindow(p.window);
  circuit.dcOperatingPoint();
  selected = null;
  scopeClear();
  fit();
  render(); renderInspector(); renderMeters();
  snapshot(); save();
  $$('[data-preset]').forEach(b => b.classList.toggle('is-active', b.dataset.preset === p.id));
  if (window.innerWidth > 760) $('#rightPanel').classList.add('is-open');
  running = true; syncRun();
}

function fit() {
  const pts = circuit.els.flatMap(e => terminals(e).concat(e.p));
  if (!pts.length) { vb = { x: -20, y: -60, w: 760, h: 460 }; applyVB(); return; }
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  const x0 = Math.min(...xs) - 70, x1 = Math.max(...xs) + 90, y0 = Math.min(...ys) - 70, y1 = Math.max(...ys) + 60;
  const r = root.getBoundingClientRect();
  const aspect = (r.width || 800) / (r.height || 450);
  let w = x1 - x0, h = y1 - y0;
  if (w / h < aspect) { const nw = h * aspect; vb = { x: x0 - (nw - w) / 2, y: y0, w: nw, h }; }
  else { const nh = w / aspect; vb = { x: x0, y: y0 - (nh - h) / 2, w, h: nh }; }
  applyVB();
}

// ------------------------------------------------------------------ oscilloscope
const canvas = $('#scope');
const ctx = canvas.getContext('2d');
let buf = [];             // [t, v1, v2]
const TDIVS = [1e-6, 2e-6, 5e-6, 1e-5, 2e-5, 5e-5, 1e-4, 2e-4, 5e-4, 1e-3, 2e-3, 5e-3, 1e-2, 2e-2, 5e-2, 0.1, 0.2, 0.5];
const tsel = $('#tdiv');
for (const t of TDIVS) tsel.append(el('option', { value: t }, fmtSI(t, 's')));
tsel.addEventListener('change', () => { windowT = +tsel.value * 10; scopeClear(); save(); });
function setWindow(w) {
  let best = TDIVS[0];
  for (const t of TDIVS) if (Math.abs(Math.log(t * 10 / w)) < Math.abs(Math.log(best * 10 / w))) best = t;
  windowT = best * 10;
  tsel.value = String(best);
}
function scopeClear() { buf = []; }
function scopeSample() {
  const v1 = probes[0] ? circuit.voltageAt(probes[0]) : null;
  const v2 = probes[1] ? circuit.voltageAt(probes[1]) : null;
  buf.push([circuit.t, v1, v2]);
  const cut = circuit.t - windowT * 1.02;
  let k = 0;
  while (k < buf.length && buf[k][0] < cut) k++;
  if (k > 0) buf.splice(0, k);
  if (buf.length > 4000) buf = buf.filter((_, i) => i % 2 === 0);
}
function niceDiv(x) {
  const steps = [0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50];
  for (const s of steps) if (x <= s * 4) return s;
  return 50;
}
function drawScope() {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (canvas.width !== Math.round(w * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#06110d';
  ctx.fillRect(0, 0, w, h);
  // graticule 10 x 8
  ctx.strokeStyle = 'rgba(160, 220, 190, .12)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 10; i++) { const x = Math.round((w / 10) * i) + .5; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
  for (let j = 0; j <= 8; j++) { const y = Math.round((h / 8) * j) + .5; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
  ctx.strokeStyle = 'rgba(160, 220, 190, .28)';
  ctx.beginPath(); ctx.moveTo(0, h / 2 + .5); ctx.lineTo(w, h / 2 + .5); ctx.stroke();

  const vsel = $('#vdiv').value;
  const info = [];
  [1, 2].forEach((ch) => {
    const vals = buf.map(b => b[ch]).filter(v => v != null);
    if (!vals.length) { info.push(null); return; }
    const mx = Math.max(...vals.map(Math.abs));
    const div = vsel === 'auto' ? niceDiv(mx || 0.01) : +vsel;
    const color = ch === 1 ? '#f2c40f' : '#23b5c9';
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    const t0 = circuit.t - windowT;
    let started = false;
    for (const b of buf) {
      if (b[ch] == null) continue;
      const x = ((b[0] - t0) / windowT) * w;
      const y = h / 2 - (b[ch] / div) * (h / 8);
      if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
    }
    ctx.stroke();
    const vmin = Math.min(...vals), vmax = Math.max(...vals);
    const avg = vals.reduce((s, v) => s + v, 0) / vals.length;
    const rms = Math.sqrt(vals.reduce((s, v) => s + v * v, 0) / vals.length);
    info.push({ div, vpp: vmax - vmin, avg, rms, now: vals[vals.length - 1] });
  });
  ctx.fillStyle = 'rgba(200, 230, 215, .7)';
  ctx.font = '11px "Martian Mono", monospace';
  ctx.fillText(`${fmtSI(windowT / 10, 's')}/div`, w - 110, 14);
  [['#ch1Info', info[0]], ['#ch2Info', info[1]]].forEach(([sel, d]) => {
    $(sel).textContent = d ? `${fmtSI(d.div, 'V')}/div · now ${fmtSI(d.now, 'V')} · p-p ${fmtSI(d.vpp, 'V')} · avg ${fmtSI(d.avg, 'V')} · rms ${fmtSI(d.rms, 'V')}` : 'not connected';
  });
}
$('#probe1Btn').onclick = () => setTool(tool === 'probe1' ? 'select' : 'probe1');
$('#probe2Btn').onclick = () => setTool(tool === 'probe2' ? 'select' : 'probe2');

// ------------------------------------------------------------------ main loop
let speedMul = 1;
$('#speed').addEventListener('input', (e) => { speedMul = 10 ** +e.target.value; });
let lastFrame = performance.now(), frameCount = 0, simCarry = 0;
function loop(now) {
  const dtReal = Math.min(0.05, (now - lastFrame) / 1000);
  lastFrame = now;
  if (running && circuit.els.length) {
    // aim to sweep one scope window in about 2.5 s
    simCarry += (windowT / 2.5) * speedMul * dtReal / circuit.dt;
    const stepsWanted = Math.floor(simCarry);
    simCarry = Math.min(simCarry - stepsWanted, 50);
    const steps = Math.min(stepsWanted, 600);
    const t0 = performance.now();
    for (let i = 0; i < steps; i++) {
      if (!circuit.step()) { running = false; syncRun(); toast(circuit.error, 'bad'); break; }
      scopeSample();
      if (performance.now() - t0 > 14) break;
    }
    frameCount++;
    if (frameCount % 4 === 0) { render(); updateLiveBox(); if (!$('#meters').hidden) renderMeters(); }
    else liveUpdate(dtReal);
    $('#simTime').textContent = 't = ' + fmtSI(circuit.t, 's');
  }
  drawScope();
  requestAnimationFrame(loop);
}

function syncRun() {
  $('#runBtn').textContent = running ? 'Pause' : 'Run';
  $('#runBtn').setAttribute('aria-pressed', String(running));
}
$('#runBtn').onclick = () => { running = !running; syncRun(); };
$('#resetBtn').onclick = () => { circuit.reset(); circuit.dcOperatingPoint(); scopeClear(); render(); toast('Restarted from the DC operating point.'); };
$('#clearBtn').onclick = () => { if (!circuit.els.length) return; circuit.els = []; preset = null; probes = [null, null]; scopeClear(); changed(); renderInspector(); toast('Cleared. Ctrl+Z brings it back.'); };
$('#fitBtn').onclick = fit;
$('#dotsBtn').onclick = (e) => { showDots = !showDots; e.currentTarget.setAttribute('aria-pressed', String(showDots)); };
$('#voltBtn').onclick = (e) => { showVolt = !showVolt; e.currentTarget.setAttribute('aria-pressed', String(showVolt)); render(); };

$('#shareBtn').onclick = async () => {
  const url = location.origin + location.pathname + '#c=' + btoa(unescape(encodeURIComponent(JSON.stringify(serialize())))).replace(/=+$/, '');
  try { await navigator.clipboard.writeText(url); toast('Link copied.', 'ok'); } catch { prompt('Copy this link:', url); }
};
$('#exportBtn').onclick = () => {
  const blob = new Blob([JSON.stringify(serialize(), null, 1)], { type: 'application/json' });
  const a = el('a', { href: URL.createObjectURL(blob), download: (preset?.id || 'circuit') + '-analog.json' });
  a.click();
  URL.revokeObjectURL(a.href);
};
$('#importBtn').onclick = () => $('#importFile').click();
$('#importFile').onchange = async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  try { const j = JSON.stringify(JSON.parse(await f.text())); restore(j); snapshot(); fit(); toast('Circuit opened.', 'ok'); }
  catch { toast('That file is not a saved analog circuit.', 'bad'); }
  e.target.value = '';
};

document.addEventListener('keydown', (e) => {
  if (e.target.matches('input, textarea, select')) return;
  const k = e.key.toLowerCase();
  if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); $(e.shiftKey ? '#redoBtn' : '#undoBtn').click(); return; }
  if ((e.ctrlKey || e.metaKey) && k === 'y') { e.preventDefault(); $('#redoBtn').click(); return; }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (k === ' ') { e.preventDefault(); $('#runBtn').click(); return; }
  if (k === 'escape') { setTool('select'); clearGhost(); return; }
  if (k === 'delete' || k === 'backspace') { if (selected) removeEl(selected); return; }
  const sel = circuit.els.find(x => x.id === selected);
  if (k === 't' && sel && TYPES[sel.type].n === 2) { rotate(sel); return; }
  if (k === 'f' && sel && TYPES[sel.type].n === 3) { sel.flip = !sel.flip; changed(); return; }
  const map = { w: 'wire', r: 'R', c: 'C', l: 'L', v: 'V', d: 'D', g: 'GND', s: 'SW' };
  if (map[k]) setTool(map[k]);
});

// ------------------------------------------------------------------ boot
renderPresets();
renderParts();
(function boot() {
  const m = location.hash.match(/#c=([\w+/-]+)/);
  if (m) {
    try { restore(decodeURIComponent(escape(atob(m[1])))); history.replaceState(null, '', location.pathname); fit(); toast('Opened the shared circuit.'); snapshot(); requestAnimationFrame(loop); return; }
    catch { toast('That share link is damaged.', 'bad'); }
  }
  const want = new URLSearchParams(location.search).get('c');
  const p = PRESETS.find(x => x.id === want);
  if (p) openPreset(p);
  else {
    const s = localStorage.getItem(STORE);
    if (s) { try { restore(s); fit(); } catch { openPreset(PRESETS[0]); } }
    else openPreset(PRESETS[0]);
  }
  snapshot();
  requestAnimationFrame(loop);
})();
