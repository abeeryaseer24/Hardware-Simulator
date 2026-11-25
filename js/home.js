import { mountChrome, mountFooter, $, el, svg } from './shared/site.js';

mountChrome('home');
mountFooter();

// ---------------------------------------------------------------- hero demo
const GATES = [
  { chip: '7408', name: 'AND', f: (a, b) => a & b, expr: 'Y = A·B' },
  { chip: '7432', name: 'OR', f: (a, b) => a | b, expr: 'Y = A + B' },
  { chip: '7400', name: 'NAND', f: (a, b) => +!(a & b), expr: 'Y = (A·B)′' },
  { chip: '7402', name: 'NOR', f: (a, b) => +!(a | b), expr: 'Y = (A + B)′' },
  { chip: '7486', name: 'XOR', f: (a, b) => a ^ b, expr: 'Y = A ⊕ B' },
  { chip: '74266', name: 'XNOR', f: (a, b) => +(a === b), expr: 'Y = (A ⊕ B)′' },
];
const state = { a: 1, b: 0, g: 0 };

const SHAPES = {
  AND: 'M0,0 H26 A30,30 0 0 1 26,60 H0 Z',
  OR: 'M0,0 Q16,30 0,60 Q44,60 64,30 Q44,0 0,0 Z',
  XOR: 'M8,0 Q24,30 8,60 Q50,60 70,30 Q50,0 8,0 Z',
};

const host = $('#demo');
const s = svg('svg', { viewBox: '0 0 520 290', class: 'demo-svg' });
s.innerHTML = `
  <defs>
    <radialGradient id="dGlow"><stop offset="0" stop-color="rgba(255,70,60,.75)"/><stop offset="1" stop-color="rgba(255,70,60,0)"/></radialGradient>
    <linearGradient id="dChip" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2d3236"/><stop offset="1" stop-color="#14171a"/></linearGradient>
  </defs>`;
host.append(s);

const wires = {
  a: svg('path', { d: 'M96,84 H180 V118 H222', class: 'd-wire' }),
  b: svg('path', { d: 'M96,206 H180 V172 H222', class: 'd-wire' }),
  y: svg('path', { d: 'M368,145 H430', class: 'd-wire' }),
};
s.append(wires.a, wires.b, wires.y);

function sw(y, key) {
  const g = svg('g', { class: 'd-sw', role: 'switch', tabindex: 0, 'aria-label': 'Input ' + key.toUpperCase() });
  g.append(svg('rect', { x: 30, y: y - 30, width: 30, height: 60, rx: 6, class: 'd-slot' }));
  const lever = svg('rect', { x: 34, y: y - 26, width: 22, height: 26, rx: 4, class: 'd-lever' });
  g.append(lever);
  const lab = svg('text', { x: 14, y: y + 6, class: 'd-lab' }); lab.textContent = key.toUpperCase();
  const val = svg('text', { x: 76, y: y + 6, class: 'd-val' });
  g.append(lab, val);
  g.append(svg('circle', { cx: 96, cy: y, r: 5, class: 'd-pad' }));
  const flip = () => { state[key] ^= 1; paint(); };
  g.addEventListener('click', flip);
  g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); flip(); } });
  s.append(g);
  return { lever, val, g };
}
const swA = sw(84, 'a'), swB = sw(206, 'b');

// the chip with a gate drawn on its lid
const chip = svg('g', { class: 'd-chip', role: 'button', tabindex: 0, 'aria-label': 'Change gate type' });
for (let i = 0; i < 7; i++) {
  chip.append(svg('rect', { x: 230 + i * 19, y: 62, width: 8, height: 12, class: 'd-leg' }));
  chip.append(svg('rect', { x: 230 + i * 19, y: 216, width: 8, height: 12, class: 'd-leg' }));
}
chip.append(svg('rect', { x: 222, y: 72, width: 146, height: 146, rx: 6, class: 'd-body' }));
chip.append(svg('path', { d: 'M222,133 a12,12 0 0 1 0,24', class: 'd-notch' }));
const gateShape = svg('path', { class: 'd-gate', transform: 'translate(262,115)' });
const bubble = svg('circle', { cx: 0, cy: 0, r: 5, class: 'd-gate d-bubble' });
const xorArc = svg('path', { d: 'M0,0 Q16,30 0,60', class: 'd-gate-line', transform: 'translate(262,115)' });
const chipLabel = svg('text', { x: 295, y: 98, class: 'd-chiplab' });
const gateName = svg('text', { x: 295, y: 205, class: 'd-gatename' });
chip.append(gateShape, xorArc, bubble, chipLabel, gateName);
chip.append(svg('path', { d: 'M222,118 H262 M222,172 H262', class: 'd-inner' }));
const outStub = svg('path', { class: 'd-inner' });
chip.append(outStub);
const cycle = () => { state.g = (state.g + 1) % GATES.length; paint(true); };
chip.addEventListener('click', cycle);
chip.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); cycle(); } });
s.append(chip);

// LED
const glow = svg('circle', { cx: 452, cy: 145, r: 40, fill: 'url(#dGlow)', class: 'd-glow' });
const led = svg('circle', { cx: 452, cy: 145, r: 18, class: 'd-led' });
const yLab = svg('text', { x: 452, y: 196, class: 'd-lab mid' }); yLab.textContent = 'Y';
const yVal = svg('text', { x: 452, y: 222, class: 'd-val mid' });
s.append(glow, led, svg('ellipse', { cx: 446, cy: 138, rx: 5, ry: 3, class: 'd-shine' }), yLab, yVal);

// truth table under the drawing
const table = el('table', { class: 'd-tt' });
const exprLine = el('p', { class: 'd-expr' });
host.append(exprLine, table);

function paint(changedGate) {
  const g = GATES[state.g];
  const y = g.f(state.a, state.b);
  for (const [k, w] of [['a', swA], ['b', swB]]) {
    const on = state[k];
    w.lever.setAttribute('y', on ? (k === 'a' ? 58 : 180) : (k === 'a' ? 84 : 206));
    w.lever.classList.toggle('on', !!on);
    w.val.textContent = on;
    w.g.setAttribute('aria-checked', String(!!on));
    wires[k].setAttribute('class', 'd-wire ' + (on ? 'hi' : 'lo'));
  }
  wires.y.setAttribute('class', 'd-wire ' + (y ? 'hi' : 'lo'));
  led.classList.toggle('on', !!y);
  glow.classList.toggle('on', !!y);
  yVal.textContent = y;

  const base = g.name.replace(/^N(?=AND|OR)/, '').replace(/^XN/, 'X');
  const neg = g.name.startsWith('N') || g.name === 'XNOR';
  const shape = base === 'AND' ? SHAPES.AND : SHAPES.OR;
  gateShape.setAttribute('d', shape);
  xorArc.style.display = base === 'XOR' ? '' : 'none';
  xorArc.setAttribute('transform', 'translate(254,115)');
  const tipX = base === 'AND' ? 262 + 56 : 262 + 64;
  bubble.style.display = neg ? '' : 'none';
  bubble.setAttribute('cx', tipX + 5);
  bubble.setAttribute('cy', 145);
  outStub.setAttribute('d', `M${neg ? tipX + 10 : tipX},145 H368`);
  chipLabel.textContent = '74LS' + g.chip.slice(2);
  gateName.textContent = g.name;
  exprLine.textContent = g.expr;
  if (changedGate) { chip.classList.remove('pop'); void chip.getBoundingClientRect(); chip.classList.add('pop'); }

  table.replaceChildren(
    el('thead', {}, el('tr', {}, el('th', {}, 'A'), el('th', {}, 'B'), el('th', {}, 'Y'))),
    el('tbody', {}, ...[[0, 0], [0, 1], [1, 0], [1, 1]].map(([a, b]) => el('tr', { class: a === state.a && b === state.b ? 'now' : '' },
      el('td', {}, String(a)), el('td', {}, String(b)), el('td', {}, String(g.f(a, b)))))),
  );
}
paint();

