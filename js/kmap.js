import { mountChrome, toast, $, $$, el, svg } from './shared/site.js';
import { renderSide, bindSideToggle, DIGITAL_TOOLS } from './shared/lab-side.js';
import { EXPERIMENTS } from './digital/experiments.js';
import { solveFunction, truthFromExpr, parseIndexList, termSOP, termPOS, patternOf, literalCount } from './shared/boolean.js';

mountChrome('digital');
bindSideToggle();

// ---------------------------------------------------------------- sidebar
const sideItems = EXPERIMENTS.map(e => ({ id: e.id, title: e.title, group: e.group, sub: [...new Set(e.build().chips.map(c => c.type))].join(' + ') }));
const drawSide = () => renderSide({ host: $('#expList'), items: sideItems, activeId: 'kmap', filter: $('#search').value, onPick: (i) => { location.href = 'digital.html?exp=' + i.id; }, extra: [DIGITAL_TOOLS] });
$('#search').addEventListener('input', drawSide);
drawSide();

// ---------------------------------------------------------------- state
const GRAY = { 1: [0, 1], 2: [0, 1, 3, 2] };
const GROUP_COLORS = ['#c9901a', '#e5383b', '#2563c9', '#1f9a4c', '#7d4bc4', '#ec7a1c', '#1aa3b8', '#c2185b'];
const CELL = 62;
const METHODS = [
  { id: 'map', name: 'Karnaugh map', desc: 'Click cells on the map', icon: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18M15 3v18M3 9h18M3 15h18"/>' },
  { id: 'tt', name: 'Truth table', desc: 'Pick 0, 1 or X for each row', icon: '<path d="M4 5h16M4 10h16M4 15h16M4 20h16M10 5v15"/>' },
  { id: 'expr', name: 'Boolean expression', desc: "Type or tap, like A'B + C", icon: '<path d="M5 18 9 6l4 12M6.5 14h5M15 9h5M17.5 6.5v5M15 17h5"/>' },
  { id: 'min', name: 'Minterms', desc: 'Rows where F = 1, as Σm', icon: '<path d="M17 5H7l6 7-6 7h10"/>' },
  { id: 'max', name: 'Maxterms', desc: 'Rows where F = 0, as ΠM', icon: '<path d="M6 5h12M8 5v14M16 5v14"/>' },
];
const st = {
  n: 4, names: ['A', 'B', 'C', 'D'],
  cells: Array(16).fill(0),
  method: 'map', show: 'sop',
  sol: { sop: 0, pos: 0 },
  expr: '', exprDc: '', minText: '', maxText: '', dcText: '',
};
let result = null;

const bitsStr = (v, k) => v.toString(2).padStart(k, '0');
const popc = (x) => { let c = 0; while (x) { c += x & 1; x >>= 1; } return c; };
const exprHTML = (t) => t.replace(/([A-Z])′/g, '<span class="olb">$1</span>');

// ---------------------------------------------------------------- method picker
const methodsHost = $('#methods');
for (const m of METHODS) {
  methodsHost.append(el('button', {
    class: 'method', role: 'radio', 'aria-checked': String(m.id === st.method), 'data-m': m.id,
    onclick: () => setMethod(m.id),
  },
  el('span', { class: 'method__dot', 'aria-hidden': 'true' }),
  el('span', { class: 'method__ico', html: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${m.icon}</svg>` }),
  el('span', { class: 'method__txt' }, el('strong', {}, m.name), el('small', {}, m.desc))));
}
function setMethod(id) {
  st.method = id;
  // carry the current function over instead of wiping it
  if (result) {
    const dcs = result.dcs.join(', ');
    if (id === 'expr') { st.expr = result.sop.constant === 0 ? '' : (result.sopText[0] || '').replace(/′/g, "'"); st.exprDc = dcs ? `d(${dcs})` : ''; }
    if (id === 'min') { st.minText = result.ones.join(', '); st.dcText = dcs; }
    if (id === 'max') { st.maxText = result.zeros.join(', '); st.dcText = dcs; }
  }
  $$('.method').forEach(b => b.setAttribute('aria-checked', String(b.dataset.m === id)));
  $('#inputName').textContent = { map: 'Fill the map', tt: 'Fill the truth table', expr: 'Type the expression', min: 'List the minterms', max: 'List the maxterms' }[id];
  renderInput();
  drawMaps();
}

// ---------------------------------------------------------------- settings
$('#nSel').addEventListener('change', () => setN(+$('#nSel').value));
function setN(k) {
  st.n = k;
  const typed = $('#names').value.toUpperCase().replace(/[^A-Z]/g, '');
  const def = 'ABCDEF'.slice(0, k);
  st.names = (typed.length >= k && new Set(typed.slice(0, k)).size === k ? typed.slice(0, k) : def).split('');
  $('#names').value = st.names.join('');
  $('#nSel').value = String(k);
  st.cells = Array(1 << k).fill(0);
  if (st.method === 'expr' && st.expr) applyExpr(true);
  else update();
  renderInput();
}
$('#names').addEventListener('input', () => {
  const v = $('#names').value.toUpperCase().replace(/[^A-Z]/g, '');
  if (v.length === st.n && new Set(v).size === st.n) { st.names = v.split(''); renderInput(); update(); }
});
$('#names').addEventListener('blur', () => { $('#names').value = st.names.join(''); });
$$('[data-fill]').forEach(b => b.addEventListener('click', () => {
  st.cells = st.cells.map(() => +b.dataset.fill);
  st.expr = ''; st.exprDc = ''; st.minText = ''; st.maxText = ''; st.dcText = '';
  renderInput();
  update();
}));

// ---------------------------------------------------------------- input panels
function renderInput() {
  const host = $('#inputPanel');
  host.replaceChildren();
  if (st.method === 'map') {
    host.append(el('p', { class: 'hint' }, 'Click a cell to cycle 0 → 1 → X. Drag across cells to paint. Shift-click puts an X (don\'t care) directly. The map below is your input.'));
    return;
  }
  if (st.method === 'tt') { host.append(truthInput()); return; }
  if (st.method === 'expr') { host.append(exprInput()); return; }
  host.append(listInput(st.method));
}

function truthInput() {
  const tbody = el('tbody');
  st.cells.forEach((v, m) => {
    const pick = el('div', { class: 'tri', role: 'radiogroup', 'aria-label': `Output for row ${m}` },
      ...[0, 1, 'x'].map(o => el('button', {
        'aria-checked': String(v === o), role: 'radio', class: 'tri__b tri--' + o,
        onclick: () => { st.cells[m] = o; update(); [...pick.children].forEach((b, i) => b.setAttribute('aria-checked', String([0, 1, 'x'][i] === o))); },
      }, o === 'x' ? 'X' : String(o))));
    tbody.append(el('tr', {}, el('td', { class: 'mi' }, String(m)), ...st.names.map((_, k) => el('td', {}, String((m >> (st.n - 1 - k)) & 1))), el('td', { class: 'out' }, pick)));
  });
  return el('div', { class: 'tt-input' }, el('table', { class: 'table km-tt' },
    el('thead', {}, el('tr', {}, el('th', {}, '#'), ...st.names.map(v => el('th', {}, v)), el('th', { class: 'out' }, 'Output F'))), tbody));
}

function exprInput() {
  const ta = el('textarea', { class: 'input mono expr-ta', rows: 2, spellcheck: 'false', placeholder: "For example  A'B + BC'D + (A + C)D", value: st.expr });
  ta.value = st.expr;
  const dc = el('input', { class: 'input mono', spellcheck: 'false', placeholder: "Optional, for example  AB'C  or  d(3, 7)", value: st.exprDc });
  const err = el('p', { class: 'expr-msg' });
  const insert = (s) => {
    const a = ta.selectionStart ?? ta.value.length, b = ta.selectionEnd ?? ta.value.length;
    ta.value = ta.value.slice(0, a) + s + ta.value.slice(b);
    ta.focus();
    ta.setSelectionRange(a + s.length, a + s.length);
    run();
  };
  const key = (label, val, cls = '') => el('button', { class: 'kp ' + cls, type: 'button', onclick: () => insert(val) }, label);
  const pad = el('div', { class: 'keypad' },
    el('div', { class: 'kp-row' }, el('span', { class: 'kp-lab' }, 'Variables'), ...st.names.map(v => key(v, v, 'var'))),
    el('div', { class: 'kp-row' }, el('span', { class: 'kp-lab' }, 'Operators'),
      key("NOT  '", "'"), key('AND  ·', '·'), key('OR  +', ' + '), key('XOR  ⊕', ' ⊕ '), key('(', '('), key(')', ')'),
      el('button', { class: 'kp kp--muted', type: 'button', onclick: () => { ta.value = ta.value.slice(0, -1); run(); ta.focus(); } }, '⌫'),
      el('button', { class: 'kp kp--muted', type: 'button', onclick: () => { ta.value = ''; run(); ta.focus(); } }, 'Clear')),
  );
  function run() {
    st.expr = ta.value; st.exprDc = dc.value;
    const msg = applyExpr();
    err.textContent = msg || (st.expr.trim() ? 'Reading your expression live.' : 'Write AND as juxtaposition (AB), · or *; NOT as \' or !; OR as +.');
    err.classList.toggle('err', !!msg);
  }
  ta.addEventListener('input', run);
  dc.addEventListener('input', run);
  setTimeout(run);
  return el('div', { class: 'expr-box' }, pad,
    el('label', { class: 'field' }, el('span', {}, 'Expression (SOP, POS or any mix)'), ta), err,
    el('label', { class: 'field' }, el('span', {}, "Don't cares (optional): an expression or a list in d( )"), dc));
}

function applyExpr(silent) {
  if (!st.expr.trim()) { st.cells = Array(1 << st.n).fill(0); update(); return ''; }
  try {
    const used = [...new Set(st.expr.toUpperCase().match(/[A-Z]/g) || [])];
    const extra = used.filter(v => !st.names.includes(v));
    if (extra.length) {
      const all = [...new Set([...st.names, ...used])].sort();
      if (all.length > 6) throw new Error('At most six variables.');
      if (all.length > st.n) {
        st.n = all.length; st.names = all; $('#names').value = all.join(''); $('#nSel').value = String(all.length);
        if (!silent) setTimeout(renderInput);
      } else {
        throw new Error(`${extra.join(', ')} is not one of the variables (${st.names.join(', ')}). Rename them above.`);
      }
    }
    const { values } = truthFromExpr(st.expr, st.names);
    let dcs = [];
    const d = st.exprDc.trim();
    if (d) {
      if (/^d?\s*\(?[\d,\s]+\)?$/i.test(d)) dcs = parseIndexList('d(' + d.replace(/^d\s*\(|\)$/gi, '') + ')', 1 << st.n).dcs;
      else dcs = truthFromExpr(d, st.names).values.map((v, i) => (v ? i : -1)).filter(i => i >= 0);
    }
    st.cells = values.map((v, i) => (dcs.includes(i) && !v ? 'x' : v));
    update();
    return '';
  } catch (e) { return e.message; }
}

function listInput(kind) {
  const max = (1 << st.n) - 1;
  const main = el('input', { class: 'input mono', spellcheck: 'false', placeholder: kind === 'min' ? 'For example  1, 3, 5, 7' : 'For example  0, 2, 4', value: kind === 'min' ? st.minText : st.maxText });
  const dc = el('input', { class: 'input mono', spellcheck: 'false', placeholder: 'For example  6, 9', value: st.dcText });
  const msg = el('p', { class: 'expr-msg' });
  function run() {
    if (kind === 'min') st.minText = main.value; else st.maxText = main.value;
    st.dcText = dc.value;
    try {
      const { list } = parseIndexList(main.value, 1 << st.n);
      const { list: dcs } = parseIndexList(dc.value, 1 << st.n);
      const clash = list.filter(x => dcs.includes(x));
      if (clash.length) throw new Error(`${clash.join(', ')} is listed both as a ${kind === 'min' ? 'minterm' : 'maxterm'} and a don't care.`);
      st.cells = Array.from({ length: 1 << st.n }, (_, m) => (dcs.includes(m) ? 'x' : kind === 'min' ? +list.includes(m) : +!list.includes(m)));
      msg.textContent = list.length ? `${kind === 'min' ? 'Σm' : 'ΠM'}(${list.join(', ')})${dcs.length ? ` + d(${dcs.join(', ')})` : ''}` : 'Separate numbers with commas or spaces.';
      msg.classList.remove('err');
      update();
    } catch (e) { msg.textContent = e.message; msg.classList.add('err'); }
  }
  main.addEventListener('input', run);
  dc.addEventListener('input', run);
  setTimeout(run);
  return el('div', { class: 'list-box' },
    el('label', { class: 'field' }, el('span', {}, el('span', {}, kind === 'min' ? 'Minterms (rows where F = 1)' : 'Maxterms (rows where F = 0)'), el('span', { class: 'tag', style: 'margin-left:8px' }, `range 0–${max}`)), main),
    el('label', { class: 'field' }, el('span', {}, "Don't cares (optional)"), dc), msg);
}

// ---------------------------------------------------------------- solve
function update() {
  const ones = [], dcs = [];
  st.cells.forEach((v, m) => { if (v === 1) ones.push(m); else if (v === 'x') dcs.push(m); });
  result = solveFunction(st.n, ones, dcs, st.names);
  result.ones = ones; result.dcs = dcs;
  st.sol = { sop: 0, pos: 0 };
  drawMaps(); drawResults(); drawTT(); drawPI(); drawCircuit(); drawQM();
  try { history.replaceState(null, '', '#' + shareHash()); } catch { /* file:// */ }
}

// ---------------------------------------------------------------- map
function layout(n) {
  if (n === 2) return { sel: 0, rb: 1, cb: 1 };
  if (n === 3) return { sel: 0, rb: 1, cb: 2 };
  if (n === 4) return { sel: 0, rb: 2, cb: 2 };
  if (n === 5) return { sel: 1, rb: 2, cb: 2 };
  return { sel: 2, rb: 2, cb: 2 };
}
const mintermAt = (L, s, r, c) => (s << (L.rb + L.cb)) | (GRAY[L.rb][r] << L.cb) | GRAY[L.cb][c];
const cycle = (v) => (v === 0 ? 1 : v === 1 ? 'x' : 0);

function drawMaps() {
  const host = $('#mapHost');
  host.replaceChildren();
  const L = layout(st.n);
  const R = 1 << L.rb, C = 1 << L.cb, nMaps = 1 << L.sel;
  const pad = { l: 70, t: 64 };
  const mapW = pad.l + C * CELL + 18, mapH = pad.t + R * CELL + 18;
  const cols = nMaps === 4 ? 2 : nMaps;
  const titleH = nMaps > 1 ? 26 : 0;
  const W = mapW * cols, H = (mapH + titleH) * Math.ceil(nMaps / cols);
  const editable = st.method === 'map';
  const root = svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'km-svg' + (editable ? ' is-edit' : ''), role: 'grid', 'aria-label': `${st.n}-variable Karnaugh map` });
  const selN = st.names.slice(0, L.sel), rowN = st.names.slice(L.sel, L.sel + L.rb), colN = st.names.slice(L.sel + L.rb);
  const sol = st.show === 'sop' ? result.sop : result.pos;
  const chosen = sol.solutions[st.sol[st.show]] || [];
  for (let s = 0; s < nMaps; s++) {
    const gx = (s % cols) * mapW, gy = Math.floor(s / cols) * (mapH + titleH) + titleH;
    const g = svg('g', { transform: `translate(${gx},${gy})` });
    if (nMaps > 1) { const t = svg('text', { x: pad.l + (C * CELL) / 2, y: -8, class: 'km-sub-title' }); t.textContent = selN.map((v, k) => `${v} = ${(s >> (L.sel - 1 - k)) & 1}`).join(', '); g.append(t); }
    g.append(svg('line', { x1: pad.l - 46, y1: pad.t - 46, x2: pad.l, y2: pad.t, class: 'km-diag' }));
    const rl = svg('text', { x: pad.l - 42, y: pad.t - 6, class: 'km-varlab', 'text-anchor': 'start' }); rl.textContent = rowN.join('');
    const cl = svg('text', { x: pad.l - 4, y: pad.t - 34, class: 'km-varlab', 'text-anchor': 'end' }); cl.textContent = colN.join('');
    g.append(rl, cl);
    for (let c = 0; c < C; c++) { const t = svg('text', { x: pad.l + c * CELL + CELL / 2, y: pad.t - 12, class: 'km-gray' }); t.textContent = bitsStr(GRAY[L.cb][c], L.cb); g.append(t); }
    for (let r = 0; r < R; r++) { const t = svg('text', { x: pad.l - 12, y: pad.t + r * CELL + CELL / 2 + 5, class: 'km-gray', 'text-anchor': 'end' }); t.textContent = bitsStr(GRAY[L.rb][r], L.rb); g.append(t); }
    for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
      const m = mintermAt(L, s, r, c), v = st.cells[m];
      const cg = svg('g', { class: 'km-cell v-' + v, 'data-m': m, role: 'gridcell', tabindex: editable ? 0 : -1, 'aria-label': `minterm ${m}: ${v === 'x' ? "don't care" : v}` });
      cg.append(svg('rect', { x: pad.l + c * CELL, y: pad.t + r * CELL, width: CELL, height: CELL, class: 'km-rect' }));
      const idx = svg('text', { x: pad.l + c * CELL + 5, y: pad.t + r * CELL + 13, class: 'km-idx' }); idx.textContent = m;
      const val = svg('text', { x: pad.l + c * CELL + CELL / 2, y: pad.t + r * CELL + CELL / 2 + 8, class: 'km-val' }); val.textContent = v === 'x' ? 'X' : v;
      cg.append(idx, val);
      g.append(cg);
    }
    g.append(svg('rect', { x: pad.l, y: pad.t, width: C * CELL, height: R * CELL, class: 'km-frame' }));
    const cp = svg('clipPath', { id: 'kc' + s });
    cp.append(svg('rect', { x: pad.l - 1, y: pad.t - 1, width: C * CELL + 2, height: R * CELL + 2 }));
    g.append(cp);
    const gl = svg('g', { 'clip-path': `url(#kc${s})` });
    chosen.forEach((pi, gi) => drawGroup(gl, sol.pis[pi], gi, s, L, R, C, pad));
    g.append(gl);
    root.append(g);
  }
  host.append(root);
  $('#mapHint').textContent = editable ? 'Click to cycle 0, 1, X. Drag to paint. Groups that wrap round an edge are drawn open at that edge.' : 'This map follows your input above. Switch the input method to "Karnaugh map" to edit cells directly.';
  bindMap(root, editable);
}

function runs(set, size) {
  const sorted = [...set].sort((a, b) => a - b);
  const out = []; let cur = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) { if (sorted[i] === sorted[i - 1] + 1) cur.push(sorted[i]); else { out.push(cur); cur = [sorted[i]]; } }
  out.push(cur);
  const wraps = out.length > 1 && set.size < size;
  return out.map(r => ({ from: r[0], to: r[r.length - 1], openStart: wraps && r[0] === 0, openEnd: wraps && r[r.length - 1] === size - 1 }));
}
function drawGroup(layer, pi, gi, s, L, R, C, pad) {
  const rows = new Set(), cols = new Set();
  for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
    const m = mintermAt(L, s, r, c);
    if ((m & ~pi.mask) === (pi.value & ~pi.mask)) { rows.add(r); cols.add(c); }
  }
  if (!rows.size) return;
  const color = GROUP_COLORS[gi % GROUP_COLORS.length];
  const inset = 5 + (gi % 4) * 3.5;
  for (const rr of runs(rows, R)) for (const cr of runs(cols, C)) {
    let x = pad.l + cr.from * CELL + inset, y = pad.t + rr.from * CELL + inset;
    let w = (cr.to - cr.from + 1) * CELL - inset * 2, h = (rr.to - rr.from + 1) * CELL - inset * 2;
    if (cr.openStart) { x -= 30; w += 30; } if (cr.openEnd) w += 30;
    if (rr.openStart) { y -= 30; h += 30; } if (rr.openEnd) h += 30;
    layer.append(svg('rect', { x, y, width: w, height: h, rx: 16, class: 'km-loop', stroke: color, fill: color }));
  }
}
let painting = null;
function bindMap(root, editable) {
  const cellOf = (t) => t.closest?.('.km-cell');
  root.addEventListener('pointerover', (e) => {
    const c = cellOf(e.target);
    if (!c) return;
    const m = +c.dataset.m;
    $('#cellInfo').textContent = `m${m} = ${bitsStr(m, st.n)} = ${st.names.map((v, k) => v + ((m >> (st.n - 1 - k)) & 1 ? '' : '′')).join('')}`;
    if (editable && painting !== null && e.buttons && st.cells[m] !== painting) { st.cells[m] = painting; update(); }
  });
  if (!editable) return;
  root.addEventListener('pointerdown', (e) => {
    const c = cellOf(e.target);
    if (!c) return;
    e.preventDefault();
    const m = +c.dataset.m;
    painting = e.shiftKey ? 'x' : cycle(st.cells[m]);
    st.cells[m] = painting;
    update();
  });
  root.addEventListener('keydown', (e) => {
    const c = cellOf(e.target);
    if (!c || !(e.key === 'Enter' || e.key === ' ')) return;
    e.preventDefault();
    const m = +c.dataset.m;
    st.cells[m] = cycle(st.cells[m]);
    update();
    $(`.km-cell[data-m="${m}"]`)?.focus();
  });
}
document.addEventListener('pointerup', () => { painting = null; });
$$('[data-show]').forEach(b => b.addEventListener('click', () => {
  st.show = b.dataset.show;
  $$('[data-show]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
  drawMaps(); drawPI(); drawQM();
}));

// ---------------------------------------------------------------- results
function costInfo(sol, idx, n, isPos) {
  if (sol.constant != null) return 'A constant: no gates needed.';
  const terms = idx.length, lits = literalCount(sol.pis, idx, n);
  const multi = idx.filter(i => n - popc(sol.pis[i].mask) > 1).length;
  const inv = new Set();
  idx.forEach(i => { const p = sol.pis[i]; for (let k = 0; k < n; k++) { const bit = 1 << (n - 1 - k); if (p.mask & bit) continue; if (isPos ? (p.value & bit) : !(p.value & bit)) inv.add(k); } });
  const g = multi + (terms > 1 ? 1 : 0);
  return `${terms} term${terms === 1 ? '' : 's'}, ${lits} literal${lits === 1 ? '' : 's'}, ${g} gate${g === 1 ? '' : 's'}${inv.size ? ` and ${inv.size} inverter${inv.size > 1 ? 's' : ''}` : ''}`;
}
function drawResults() {
  const s = result, si = st.sol.sop, pi = st.sol.pos;
  $('#sopOut').innerHTML = 'F = ' + exprHTML(s.sopText[si] ?? '0');
  $('#posOut').innerHTML = 'F = ' + exprHTML(s.posText[pi] ?? '1');
  $('#sopMeta').textContent = costInfo(s.sop, s.sop.solutions[si] || [], st.n, false);
  $('#posMeta').textContent = costInfo(s.pos, s.pos.solutions[pi] || [], st.n, true);
  altList('#sopAlt', s.sopText, 'sop'); altList('#posAlt', s.posText, 'pos');
  const dc = s.dcs.length ? ` + d(${s.dcs.join(', ')})` : '';
  const sop = s.sop.solutions[si] || [], pos = s.pos.solutions[pi] || [];
  const nand = s.sop.constant != null ? '—' : '( ' + sop.map(i => `(${termSOP(s.sop.pis[i], st.names)})′`).join(' · ') + ' )′';
  const nor = s.pos.constant != null ? '—' : '( ' + pos.map(i => `(${termPOS(s.pos.pis[i], st.names).replace(/^\(|\)$/g, '')})′`).join(' + ') + ' )′';
  $('#forms').replaceChildren(
    el('dt', {}, 'Σm'), el('dd', {}, (s.ones.length ? `Σm(${s.ones.join(', ')})` : 'none') + dc),
    el('dt', {}, 'ΠM'), el('dd', {}, (s.zeros.length ? `ΠM(${s.zeros.join(', ')})` : 'none') + dc),
    el('dt', {}, 'NAND only'), el('dd', { html: 'F = ' + exprHTML(nand) }),
    el('dt', {}, 'NOR only'), el('dd', { html: 'F = ' + exprHTML(nor) }),
  );
}
function altList(sel, texts, key) {
  const host = $(sel);
  host.replaceChildren();
  if (texts.length < 2) return;
  host.append(el('p', { class: 'alt-head' }, `${texts.length} equally small answers:`));
  host.append(el('div', { class: 'alt-row' }, ...texts.map((t, i) => el('button', {
    class: 'alt-btn', 'aria-pressed': String(st.sol[key] === i), html: exprHTML(t),
    onclick: () => { st.sol[key] = i; st.show = key; $$('[data-show]').forEach(x => x.setAttribute('aria-pressed', String(x.dataset.show === key))); drawMaps(); drawResults(); drawCircuit(); drawPI(); },
  }))));
}
$$('[data-copy]').forEach(b => b.addEventListener('click', async () => {
  const txt = 'F = ' + (b.dataset.copy === 'sop' ? result.sopText[st.sol.sop] : result.posText[st.sol.pos]).replace(/([A-Z])′/g, "$1'");
  try { await navigator.clipboard.writeText(txt); toast('Copied ' + txt, 'ok'); } catch { prompt('Copy:', txt); }
}));
function shareHash() {
  const ones = [], dcs = [];
  st.cells.forEach((v, m) => { if (v === 1) ones.push(m); else if (v === 'x') dcs.push(m); });
  return `n=${st.n}&v=${st.names.join('')}&m=${ones.join('.')}&d=${dcs.join('.')}`;
}
$('#shareBtn').addEventListener('click', async () => {
  const url = location.origin + location.pathname + '#' + shareHash();
  try { await navigator.clipboard.writeText(url); toast('Link copied.', 'ok'); } catch { prompt('Copy this link:', url); }
});

// ---------------------------------------------------------------- working tabs
$$('[data-work]').forEach(b => b.addEventListener('click', () => {
  $$('[data-work]').forEach(x => x.setAttribute('aria-selected', String(x === b)));
  $$('[data-wpane]').forEach(p => { p.hidden = p.dataset.wpane !== b.dataset.work; });
}));

function drawTT() {
  const head = el('tr', {}, el('th', {}, '#'), ...st.names.map(v => el('th', {}, v)), el('th', { class: 'out' }, 'F'), el('th', {}, 'Term'));
  const rows = st.cells.map((v, m) => el('tr', { class: 'r-' + v },
    el('td', { class: 'mi' }, String(m)), ...st.names.map((_, k) => el('td', {}, String((m >> (st.n - 1 - k)) & 1))),
    el('td', { class: 'out' }, v === 'x' ? 'X' : String(v)),
    el('td', { class: 'mi', html: v === 1 ? 'm' + m + ' = ' + exprHTML(st.names.map((n, k) => n + ((m >> (st.n - 1 - k)) & 1 ? '' : '′')).join('')) : v === 0 ? 'M' + m : 'd' + m })));
  $('#ttTable').replaceChildren(el('thead', {}, head), el('tbody', {}, ...rows));
}

function drawPI() {
  const key = st.show;
  const sol = result[key];
  const chosen = sol.solutions[st.sol[key]] || [];
  const host = $('#piTable');
  if (!sol.pis.length || sol.constant != null) {
    host.replaceChildren(el('p', { class: 'hint' }, sol.constant != null ? 'The function is constant, so there is nothing to group.' : 'No cells to group yet.'));
    $('#piChart').replaceChildren();
    return;
  }
  const fmt = key === 'sop' ? termSOP : termPOS;
  const color = (i) => { const k = chosen.indexOf(i); return k >= 0 ? GROUP_COLORS[k % GROUP_COLORS.length] : 'transparent'; };
  host.replaceChildren(el('table', { class: 'table pi-table' },
    el('thead', {}, el('tr', {}, el('th', {}, ''), el('th', {}, 'Pattern'), el('th', {}, key === 'sop' ? 'Product term' : 'Sum term'), el('th', {}, 'Covers'), el('th', {}, ''))),
    el('tbody', {}, ...sol.pis.map((p, i) => el('tr', { class: chosen.includes(i) ? 'used' : '' },
      el('td', {}, el('span', { class: 'pi-dot', style: `background:${color(i)}` })),
      el('td', { class: 'mono' }, patternOf(p, st.n)),
      el('td', { html: exprHTML(fmt(p, st.names)) }),
      el('td', { class: 'mono' }, p.covers.join(', ')),
      el('td', {}, sol.essential.includes(i) ? el('span', { class: 'tag tag--ess' }, 'essential') : chosen.includes(i) ? el('span', { class: 'tag' }, 'used') : ''))))));
  const targets = key === 'sop' ? result.ones : result.zeros;
  $('#piChart').replaceChildren(el('table', { class: 'table pi-chart' },
    el('thead', {}, el('tr', {}, el('th', {}, ''), ...targets.map(m => el('th', { class: 'mono' }, String(m))))),
    el('tbody', {}, ...sol.pis.map((p, i) => el('tr', { class: chosen.includes(i) ? 'used' : '' },
      el('th', { html: exprHTML(fmt(p, st.names)) }),
      ...targets.map(m => {
        const hit = p.covers.includes(m), only = hit && sol.pis.filter(q => q.covers.includes(m)).length === 1;
        return el('td', { class: hit ? (only ? 'hit only' : 'hit') : '' }, hit ? (only ? '◉' : '●') : '');
      }))))));
}

function drawQM() {
  const host = $('#qmSteps');
  const key = st.show, sol = result[key];
  host.replaceChildren();
  if (!sol.steps.length) { host.append(el('p', { class: 'hint' }, 'Nothing to combine.')); return; }
  host.append(el('p', { class: 'qm-intro' }, key === 'sop'
    ? 'Quine–McCluskey method. Column 1 lists the minterms and don\'t cares grouped by their number of 1s. Pairs from neighbouring groups that differ in exactly one bit merge, and that bit becomes a dash. Terms that never merge are the prime implicants (✱).'
    : 'For POS the same method runs on the 0s (maxterms) and don\'t cares; each prime implicant then becomes a sum term.'));
  sol.steps.forEach((col, ci) => {
    const by = new Map();
    for (const t of col) { const k = popc(t.value & ~t.mask); if (!by.has(k)) by.set(k, []); by.get(k).push(t); }
    const isPrime = (t) => sol.pis.some(p => p.value === t.value && p.mask === t.mask);
    host.append(el('table', { class: 'table qm-col' },
      el('caption', {}, ci === 0 ? 'Column 1' : `Column ${ci + 1}`),
      el('thead', {}, el('tr', {}, el('th', {}, '1s'), el('th', {}, 'Covers'), el('th', {}, 'Pattern'))),
      el('tbody', {}, ...[...by.keys()].sort((a, b) => a - b).flatMap((k, gi) => by.get(k).map((t, ti) => el('tr', { class: (ti === 0 && gi > 0 ? 'grp ' : '') + (isPrime(t) ? 'prime' : '') },
        el('td', {}, ti === 0 ? String(k) : ''), el('td', { class: 'mono' }, t.covers.join(',')), el('td', { class: 'mono' }, patternOf(t, st.n) + (isPrime(t) ? ' ✱' : ''))))))));
  });
}

const AND_PATH = (x, y, h) => `M${x},${y} h${h * 0.5} a${h / 2},${h / 2} 0 0 1 0,${h} h-${h * 0.5} z`;
const OR_PATH = (x, y, h) => `M${x},${y} q${h * 0.35},${h / 2} 0,${h} q${h * 0.9},0 ${h * 1.15},-${h / 2} q-${h * 0.25},-${h / 2} -${h * 1.15},-${h / 2} z`;
function drawCircuit() {
  const host = $('#circuit');
  host.replaceChildren();
  const sol = result.sop, idx = sol.solutions[st.sol.sop] || [];
  if (sol.constant != null || !idx.length) { host.append(el('p', { class: 'hint' }, sol.constant === 1 ? 'F is always 1: tie the output to +5 V.' : 'F is always 0: tie the output to GND.')); return; }
  const terms = idx.map(i => { const p = sol.pis[i], lits = []; for (let k = 0; k < st.n; k++) { const bit = 1 << (st.n - 1 - k); if (!(p.mask & bit)) lits.push({ v: st.names[k], neg: !(p.value & bit) }); } return lits; });
  let y = 20;
  const placed = terms.map(t => { const h = Math.max(34, t.length * 16 + 6); const r = { y, h, t }; y += h + 16; return r; });
  const H = Math.max(y + 10, 120), W = 640;
  const s = svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'circuit' });
  const orH = Math.max(40, terms.length * 14), orY = H / 2 - orH / 2, orX = 430;
  const text = (x, yy, t, bar) => { const n = svg('text', { x, y: yy, class: 'c-lit' }); if (bar) { const ts = svg('tspan', { 'text-decoration': 'overline' }); ts.textContent = t; n.append(ts); } else n.textContent = t; return n; };
  const orIn = (x, yy, gi) => { const iy = orY + (orH / (terms.length + 1)) * (gi + 1); const mid = 330 + gi * 6; s.append(svg('path', { d: `M${x},${yy} H${mid} V${iy} H${orX + 8}`, class: 'c-wire' })); };
  placed.forEach((g, gi) => {
    const color = GROUP_COLORS[gi % GROUP_COLORS.length], gx = 200;
    if (g.t.length === 1) { const L = g.t[0], ty = g.y + g.h / 2; s.append(text(30, ty + 5, L.v, L.neg)); s.append(svg('path', { d: `M70,${ty} H${gx + g.h}`, class: 'c-wire' })); orIn(gx + g.h, ty, gi); return; }
    s.append(svg('path', { d: AND_PATH(gx, g.y, g.h), class: 'c-gate', stroke: color }));
    g.t.forEach((L, li) => {
      const py = g.y + (g.h / (g.t.length + 1)) * (li + 1);
      s.append(text(30, py + 5, L.v, L.neg));
      if (L.neg) {
        s.append(svg('path', { d: `M70,${py} H96`, class: 'c-wire' }), svg('path', { d: `M96,${py - 7} l14,7 l-14,7 z`, class: 'c-inv' }), svg('circle', { cx: 113, cy: py, r: 3, class: 'c-inv' }), svg('path', { d: `M116,${py} H${gx}`, class: 'c-wire' }));
      } else s.append(svg('path', { d: `M70,${py} H${gx}`, class: 'c-wire' }));
    });
    orIn(gx + g.h, g.y + g.h / 2, gi);
  });
  if (terms.length > 1) { s.append(svg('path', { d: OR_PATH(orX, orY, orH), class: 'c-gate or' })); s.append(svg('path', { d: `M${orX + orH * 1.15},${H / 2} H${W - 60}`, class: 'c-wire' })); }
  else s.append(svg('path', { d: `M${orX},${orY + orH / 2} H${W - 60}`, class: 'c-wire' }));
  const f = svg('text', { x: W - 50, y: H / 2 + 6, class: 'c-out' }); f.textContent = 'F'; s.append(f);
  host.append(s);
}

// ---------------------------------------------------------------- boot
(function boot() {
  const h = new URLSearchParams(location.hash.slice(1));
  const q = new URLSearchParams(location.search);
  const n = +h.get('n');
  if (n >= 2 && n <= 6) {
    const names = (h.get('v') || '').toUpperCase();
    $('#names').value = names.length === n ? names : 'ABCDEF'.slice(0, n);
    st.n = n; st.names = $('#names').value.split(''); $('#nSel').value = String(n);
    const parse = (s) => (s ? s.split('.').map(Number).filter(x => Number.isInteger(x) && x < 1 << n) : []);
    const ones = parse(h.get('m')), dcs = parse(h.get('d'));
    st.cells = Array.from({ length: 1 << n }, (_, m) => (dcs.includes(m) ? 'x' : ones.includes(m) ? 1 : 0));
  } else {
    [0, 2, 5, 7, 8, 10, 13, 15].forEach(m => { st.cells[m] = 1; });
    st.cells[6] = 'x';
  }
  update();
  setMethod(METHODS.some(m => m.id === q.get('mode')) ? q.get('mode') : 'map');
})();
