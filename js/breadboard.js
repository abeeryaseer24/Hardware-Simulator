import { mountChrome, mountFooter, $, el, svg } from './shared/site.js';
import { CHIPS } from './digital/chips.js';
import { pinoutSVG } from './digital/pinout.js';

mountChrome('breadboard');
mountFooter();

// ---------------------------------------------------------------- anatomy board
const COLS = 30, P = 18;
const X0 = 46;
const ROWS = { tp: 30, tn: 48, a: 86, b: 104, c: 122, d: 140, e: 158, f: 200, g: 218, h: 236, i: 254, j: 272, bp: 310, bn: 328 };
const TOP = ['a', 'b', 'c', 'd', 'e'], BOT = ['f', 'g', 'h', 'i', 'j'], RAIL = ['tp', 'tn', 'bp', 'bn'];
let split = false;

function drawAnatomy() {
  const host = $('#anatomy');
  host.replaceChildren();
  const W = X0 * 2 + (COLS - 1) * P, H = 356;
  const s = svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'anat' });
  s.append(svg('rect', { x: 8, y: 10, width: W - 16, height: H - 20, rx: 8, class: 'bb-body' }));
  s.append(svg('rect', { x: 16, y: 174, width: W - 32, height: 12, rx: 2, class: 'bb-channel' }));
  const line = (y, cls, x1 = 30, x2 = W - 30) => s.append(svg('line', { x1, x2, y1: y, y2: y, class: cls }));
  const mid = X0 + (COLS / 2 - 0.5) * P;
  for (const [r, cls, dy] of [['tp', 'rail-plus', -11], ['tn', 'rail-minus', 11], ['bp', 'rail-plus', -11], ['bn', 'rail-minus', 11]]) {
    if (split) { line(ROWS[r] + dy, cls, 30, mid - 10); line(ROWS[r] + dy, cls, mid + 10, W - 30); }
    else line(ROWS[r] + dy, cls);
  }
  const hl = svg('g');
  s.append(hl);
  const holes = svg('g');
  const hasRail = (c) => c % 6 !== 5 && !(split && (c === COLS / 2 - 1 || c === COLS / 2));
  for (let c = 0; c < COLS; c++) {
    for (const r of [...TOP, ...BOT]) holes.append(svg('rect', { x: X0 + c * P - 4, y: ROWS[r] - 4, width: 8, height: 8, rx: 1.5, class: 'hole', 'data-r': r, 'data-c': c }));
    if (hasRail(c)) for (const r of RAIL) holes.append(svg('rect', { x: X0 + c * P - 4, y: ROWS[r] - 4, width: 8, height: 8, rx: 1.5, class: 'hole', 'data-r': r, 'data-c': c }));
  }
  s.append(holes);
  const t = (x, y, txt, cls = 'anat-lab') => { const n = svg('text', { x, y, class: cls }); n.textContent = txt; s.append(n); };
  for (const r of [...TOP, ...BOT]) t(28, ROWS[r] + 4, r);
  t(26, ROWS.tp + 5, '+', 'bb-sign plus'); t(26, ROWS.tn + 5, '−', 'bb-sign minus');
  t(26, ROWS.bp + 5, '+', 'bb-sign plus'); t(26, ROWS.bn + 5, '−', 'bb-sign minus');
  host.append(s);

  const cap = $('#anatomyCap');
  s.addEventListener('pointerover', (e) => {
    const h = e.target.closest('.hole');
    if (!h) return;
    const r = h.dataset.r, c = +h.dataset.c;
    hl.replaceChildren();
    if (RAIL.includes(r)) {
      let x1 = X0 - 8, x2 = X0 + (COLS - 1) * P + 8;
      if (split) { if (c < COLS / 2) x2 = mid - 12; else x1 = mid + 12; }
      hl.append(svg('rect', { x: x1, y: ROWS[r] - 8, width: x2 - x1, height: 16, rx: 4, class: 'strip-hi' }));
      cap.textContent = `${r.endsWith('p') ? 'Positive' : 'Negative'} rail: ${split ? 'this half of the' : 'the whole'} row is one node.`;
    } else {
      const rows = TOP.includes(r) ? TOP : BOT;
      hl.append(svg('rect', { x: X0 + c * P - 8, y: ROWS[rows[0]] - 8, width: 16, height: ROWS[rows[4]] - ROWS[rows[0]] + 16, rx: 4, class: 'strip-hi' }));
      cap.textContent = `Column ${c + 1}, rows ${rows[0]}–${rows[4]}: five holes, one node. The other side of the channel is separate.`;
    }
  });
  s.addEventListener('pointerleave', () => { hl.replaceChildren(); cap.textContent = 'Point at any hole to see which holes are joined to it.'; });
}
$('#splitRails').addEventListener('change', (e) => { split = e.target.checked; drawAnatomy(); });
drawAnatomy();

// ---------------------------------------------------------------- chip figure
$('#dipFig').append(pinoutSVG(CHIPS['7408']));

// ---------------------------------------------------------------- TTL levels
(function levels() {
  const s = svg('svg', { viewBox: '0 0 420 300', class: 'levels' });
  const y = (v) => 270 - v * 50;
  const band = (x, v0, v1, cls, txt) => {
    s.append(svg('rect', { x, y: y(v1), width: 120, height: y(v0) - y(v1), class: 'lv ' + cls }));
    const t = svg('text', { x: x + 60, y: (y(v0) + y(v1)) / 2 + 4, class: 'lv-txt' }); t.textContent = txt; s.append(t);
  };
  const title = (x, txt) => { const t = svg('text', { x: x + 60, y: 14, class: 'lv-title' }); t.textContent = txt; s.append(t); };
  title(70, 'Input sees'); title(250, 'Output gives');
  band(70, 0, 0.8, 'low', 'LOW');
  band(70, 0.8, 2.0, 'undef', 'undefined');
  band(70, 2.0, 5, 'high', 'HIGH');
  band(250, 0, 0.4, 'low', 'LOW');
  band(250, 0.4, 2.7, 'undef', 'never');
  band(250, 2.7, 5, 'high', 'HIGH');
  for (const v of [0, 0.4, 0.8, 2, 2.7, 5]) {
    s.append(svg('line', { x1: 40, x2: 380, y1: y(v), y2: y(v), class: 'lv-grid' }));
    const t = svg('text', { x: 34, y: y(v) + 4, class: 'lv-v' }); t.textContent = v + ' V'; s.append(t);
  }
  $('#levelsFig').append(s);
})();

// ---------------------------------------------------------------- pinout library
const grid = $('#pinGrid');
const cards = [];
for (const c of Object.values(CHIPS)) {
  const card = el('article', { class: 'pin-card', id: 'chip-' + c.id },
    el('h3', {}, c.id),
    el('p', {}, c.name),
    pinoutSVG(c, null, { pitch: 30 }),
    el("p", { class: "pin-meta" }, `VCC on pin ${c.vcc}, GND on pin ${c.gnd}`));
  cards.push([card, (c.id + ' ' + c.name + ' ' + c.family).toLowerCase()]);
  grid.append(card);
}
$('#pinSearch').addEventListener('input', (e) => {
  const q = e.target.value.toLowerCase().trim();
  for (const [card, text] of cards) card.hidden = q && !text.includes(q);
});
if (location.hash.startsWith('#chip-')) {
  const t = document.getElementById(location.hash.slice(1));
  if (t) { t.classList.add('is-target'); setTimeout(() => t.scrollIntoView({ block: 'center' }), 50); }
}
