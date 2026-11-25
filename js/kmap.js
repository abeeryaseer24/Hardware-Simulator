import { mountChrome, mountFooter, toast, $, $$, el, svg } from './shared/site.js';
import { solveFunction, truthFromExpr, parseIndexList, termSOP, termPOS, patternOf, literalCount } from './shared/boolean.js';

mountChrome('kmap');
mountFooter();

const GRAY = { 1: [0, 1], 2: [0, 1, 3, 2] };
const GROUP_COLORS = ['#c9901a', '#e5383b', '#2563c9', '#1f9a4c', '#7d4bc4', '#ec7a1c', '#1aa3b8', '#c2185b'];
const CELL = 62;

const st = {
  n: 4,
  names: ['A', 'B', 'C', 'D'],
  cells: Array(16).fill(0),     // 0 | 1 | 'x'
  brush: 'cycle',
  show: 'sop',
  mode: 'min',
  solIndex: { sop: 0, pos: 0 },
};
let result = null;

// ---------------------------------------------------------------- layout of the map
function layout(n) {
  // returns { sel: bits for submap select, rb: row bits, cb: col bits, maps: [[r,c] grid of submaps] }
  if (n === 2) return { sel: 0, rb: 1, cb: 1 };
  if (n === 3) return { sel: 0, rb: 1, cb: 2 };
  if (n === 4) return { sel: 0, rb: 2, cb: 2 };
  if (n === 5) return { sel: 1, rb: 2, cb: 2 };
  return { sel: 2, rb: 2, cb: 2 };
}
const mintermAt = (L, s, r, c) => (s << (L.rb + L.cb)) | (GRAY[L.rb][r] << L.cb) | GRAY[L.cb][c];
const bitsStr = (v, k) => v.toString(2).padStart(k, '0');

// ---------------------------------------------------------------- controls
const nSeg = $('#nSeg');
for (let k = 2; k <= 6; k++) {
  nSeg.append(el('button', { 'aria-pressed': String(k === st.n), 'data-n': k, onclick: () => setN(k) }, String(k)));
}
function setN(k, keep = false) {
  const old = st.cells, oldN = st.n;
  st.n = k;
  const def = 'ABCDEF'.slice(0, k);
  const typed = $('#names').value.toUpperCase().replace(/[^A-Z]/g, '');
  st.names = (typed.length >= k ? typed.slice(0, k) : def).split('');
  if (new Set(st.names).size !== k) st.names = def.split('');
  $('#names').value = st.names.join('');
  st.cells = Array(1 << k).fill(0);
  if (keep) for (let m = 0; m < Math.min(old.length, st.cells.length); m++) st.cells[m] = old[m];
  void oldN;
  $$('[data-n]').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.n === k)));
  update();
}
$('#names').addEventListener('input', () => {
  const v = $('#names').value.toUpperCase().replace(/[^A-Z]/g, '');
  if (v.length === st.n && new Set(v).size === st.n) { st.names = v.split(''); update(); }
});
$('#names').addEventListener('blur', () => { $('#names').value = st.names.join(''); });

$$('[data-brush]').forEach(b => b.addEventListener('click', () => {
  st.brush = b.dataset.brush;
  $$('[data-brush]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
}));
$$('[data-show]').forEach(b => b.addEventListener('click', () => {
  st.show = b.dataset.show;
  $$('[data-show]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
  drawMaps();
}));
$$('[data-fill]').forEach(b => b.addEventListener('click', () => {
  const f = b.dataset.fill;
  st.cells = st.cells.map(v => (f === 'rand' ? (Math.random() < 0.12 ? 'x' : Math.random() < 0.5 ? 1 : 0) : f === 'invert' ? (v === 'x' ? 'x' : +!v) : +f));
  update();
}));

const HELP = {
  min: ['1, 3, 5, 7  d(2, 6)', 'Comma-separated minterm numbers (the rows where F = 1). Put don\'t cares in d( ).'],
  max: ['0, 2, 4  d(6)', 'Maxterm numbers: the rows where F = 0. Every other row becomes 1.'],
  expr: ["A'B + C(A + D')", "Use ' or ! for NOT, + or | for OR, nothing or · for AND, ^ for XOR. Single-letter variables from the names above."],
};
$$('[data-mode]').forEach(b => b.addEventListener('click', () => {
  st.mode = b.dataset.mode;
  $$('[data-mode]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
  $('#entry').placeholder = HELP[st.mode][0];
  $('#entryHelp').textContent = HELP[st.mode][1];
  $('#entryHelp').classList.remove('err');
}));

$('#entryForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const src = $('#entry').value.trim();
  const help = $('#entryHelp');
  try {
    if (st.mode === 'expr') {
      const used = [...new Set(src.toUpperCase().match(/[A-Z]/g) || [])];
      const extra = used.filter(v => !st.names.includes(v));
      if (extra.length) {
        // grow the map if the expression needs more variables than are shown
        const all = [...new Set([...st.names, ...used])].sort();
        if (all.length > 6) throw new Error('At most six variables.');
        if (all.length > st.n) { $('#names').value = all.join(''); setN(all.length); }
      }
      const { values } = truthFromExpr(src, st.names);
      st.cells = values.slice();
    } else {
      const max = 1 << st.n;
      const { list, dcs } = parseIndexList(src, max);
      if (st.mode === 'min') st.cells = Array.from({ length: max }, (_, m) => (dcs.includes(m) ? 'x' : list.includes(m) ? 1 : 0));
      else st.cells = Array.from({ length: max }, (_, m) => (dcs.includes(m) ? 'x' : list.includes(m) ? 0 : 1));
    }
    help.textContent = 'Loaded. ' + HELP[st.mode][1];
    help.classList.remove('err');
    update();
  } catch (err) {
    help.textContent = err.message;
    help.classList.add('err');
  }
});

// ---------------------------------------------------------------- solve + render
function update() {
  const ones = [], dcs = [];
  st.cells.forEach((v, m) => { if (v === 1) ones.push(m); else if (v === 'x') dcs.push(m); });
  result = solveFunction(st.n, ones, dcs, st.names);
  result.ones = ones; result.dcs = dcs;
  st.solIndex = { sop: 0, pos: 0 };
  drawMaps();
  drawResults();
  drawTruthTable();
  drawPI();
  drawCircuit();
  drawQM();
  try { history.replaceState(null, '', '#' + shareHash()); } catch { /* file:// */ }
}

function cycle(v) {
  if (st.brush !== 'cycle') return st.brush === 'x' ? 'x' : +st.brush;
  return v === 0 ? 1 : v === 1 ? 'x' : 0;
}

function drawMaps() {
  const host = $('#mapHost');
  host.replaceChildren();
  const L = layout(st.n);
  const R = 1 << L.rb, C = 1 << L.cb;
  const nMaps = 1 << L.sel;
  const pad = { l: 70, t: 64 };
  const mapW = pad.l + C * CELL + 18, mapH = pad.t + R * CELL + 18;
  const gridCols = nMaps === 4 ? 2 : nMaps;
  const W = mapW * gridCols, H = mapH * Math.ceil(nMaps / gridCols) + (nMaps > 1 ? 26 * Math.ceil(nMaps / gridCols) : 0);
  const root = svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'km-svg', role: 'grid', 'aria-label': `${st.n}-variable Karnaugh map` });
  const selNames = st.names.slice(0, L.sel), rowNames = st.names.slice(L.sel, L.sel + L.rb), colNames = st.names.slice(L.sel + L.rb);

  const sol = st.show === 'none' ? null : st.show === 'sop' ? result.sop : result.pos;
  const chosen = sol ? (sol.solutions[st.solIndex[st.show]] || []) : [];

  for (let s = 0; s < nMaps; s++) {
    const gx = (s % gridCols) * mapW, gy = Math.floor(s / gridCols) * (mapH + (nMaps > 1 ? 26 : 0));
    const g = svg('g', { transform: `translate(${gx},${gy + (nMaps > 1 ? 26 : 0)})` });
    if (nMaps > 1) {
      const t = svg('text', { x: pad.l + (C * CELL) / 2, y: -8, class: 'km-sub-title' });
      t.textContent = selNames.map((v, k) => `${v} = ${(s >> (L.sel - 1 - k)) & 1}`).join(', ');
      g.append(t);
    }
    // corner label
    g.append(svg('line', { x1: pad.l - 46, y1: pad.t - 46, x2: pad.l, y2: pad.t, class: 'km-diag' }));
    const rl = svg('text', { x: pad.l - 40, y: pad.t - 6, class: 'km-varlab', 'text-anchor': 'start' }); rl.textContent = rowNames.join('');
    const cl = svg('text', { x: pad.l - 4, y: pad.t - 34, class: 'km-varlab', 'text-anchor': 'end' }); cl.textContent = colNames.join('');
    g.append(rl, cl);
    for (let c = 0; c < C; c++) {
      const t = svg('text', { x: pad.l + c * CELL + CELL / 2, y: pad.t - 12, class: 'km-gray', 'data-col': c });
      t.textContent = bitsStr(GRAY[L.cb][c], L.cb);
      g.append(t);
    }
    for (let r = 0; r < R; r++) {
      const t = svg('text', { x: pad.l - 12, y: pad.t + r * CELL + CELL / 2 + 5, class: 'km-gray', 'text-anchor': 'end', 'data-row': r });
      t.textContent = bitsStr(GRAY[L.rb][r], L.rb);
      g.append(t);
    }
    // cells
    for (let r = 0; r < R; r++) {
      for (let c = 0; c < C; c++) {
        const m = mintermAt(L, s, r, c);
        const v = st.cells[m];
        const cg = svg('g', { class: 'km-cell v-' + v, 'data-m': m, role: 'gridcell', tabindex: 0, 'aria-label': `minterm ${m}, value ${v === 'x' ? "don't care" : v}` });
        cg.append(svg('rect', { x: pad.l + c * CELL, y: pad.t + r * CELL, width: CELL, height: CELL, class: 'km-rect' }));
        const idx = svg('text', { x: pad.l + c * CELL + 5, y: pad.t + r * CELL + 13, class: 'km-idx' }); idx.textContent = m;
        const val = svg('text', { x: pad.l + c * CELL + CELL / 2, y: pad.t + r * CELL + CELL / 2 + 9, class: 'km-val' }); val.textContent = v === 'x' ? 'X' : v;
        cg.append(idx, val);
        g.append(cg);
      }
    }
    g.append(svg('rect', { x: pad.l, y: pad.t, width: C * CELL, height: R * CELL, class: 'km-frame' }));

    // groups
    const clipId = `clip${s}`;
    const cp = svg('clipPath', { id: clipId });
    cp.append(svg('rect', { x: pad.l - 1, y: pad.t - 1, width: C * CELL + 2, height: R * CELL + 2 }));
    g.append(cp);
    const gl = svg('g', { 'clip-path': `url(#${clipId})`, class: 'km-groups' });
    chosen.forEach((pi, gi) => drawGroup(gl, sol.pis[pi], gi, s, L, R, C, pad));
    g.append(gl);
    root.append(g);
  }
  host.append(root);
  bindMap(root);
}

function runs(set, size) {
  const sorted = [...set].sort((a, b) => a - b);
  const out = [];
  let cur = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === sorted[i - 1] + 1) cur.push(sorted[i]);
    else { out.push(cur); cur = [sorted[i]]; }
  }
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
  for (const rr of runs(rows, R)) {
    for (const cr of runs(cols, C)) {
      let x = pad.l + cr.from * CELL + inset, y = pad.t + rr.from * CELL + inset;
      let w = (cr.to - cr.from + 1) * CELL - inset * 2, h = (rr.to - rr.from + 1) * CELL - inset * 2;
      if (cr.openStart) { x -= 30; w += 30; }
      if (cr.openEnd) w += 30;
      if (rr.openStart) { y -= 30; h += 30; }
      if (rr.openEnd) h += 30;
      layer.append(svg('rect', { x, y, width: w, height: h, rx: 16, class: 'km-loop', stroke: color, fill: color }));
    }
  }
}

let painting = null;
function bindMap(root) {
  const cellOf = (t) => t.closest?.('.km-cell');
  root.addEventListener('pointerdown', (e) => {
    const c = cellOf(e.target);
    if (!c) return;
    e.preventDefault();
    const m = +c.dataset.m;
    const nv = e.shiftKey ? 'x' : cycle(st.cells[m]);
    painting = nv;
    st.cells[m] = nv;
    update();
  });
  root.addEventListener('pointerover', (e) => {
    const c = cellOf(e.target);
    if (!c) return;
    const m = +c.dataset.m;
    $('#cellInfo').textContent = `m${m} = ${bitsStr(m, st.n)} → ${st.names.map((v, k) => v + ((m >> (st.n - 1 - k)) & 1 ? '' : '′')).join('')}`;
    if (painting !== null && e.buttons) {
      if (st.cells[m] !== painting) { st.cells[m] = painting; update(); }
    }
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

// ---------------------------------------------------------------- results
function costInfo(sol, idx, n, isPos) {
  if (sol.constant != null) return 'Constant, no gates needed.';
  const terms = idx.length;
  const lits = literalCount(sol.pis, idx, n);
  const multi = idx.filter(i => n - popc(sol.pis[i].mask) > 1).length;
  const inv = new Set();
  idx.forEach(i => {
    const p = sol.pis[i];
    for (let k = 0; k < n; k++) {
      const bit = 1 << (n - 1 - k);
      if (p.mask & bit) continue;
      const complemented = isPos ? (p.value & bit) : !(p.value & bit);
      if (complemented) inv.add(k);
    }
  });
  const g2 = multi + (terms > 1 ? 1 : 0);
  return `${terms} term${terms === 1 ? '' : 's'}, ${lits} literal${lits === 1 ? '' : 's'}, ${g2} ${isPos ? 'OR/AND' : 'AND/OR'} gate${g2 === 1 ? '' : 's'}${inv.size ? ` + ${inv.size} inverter${inv.size > 1 ? 's' : ''}` : ''}`;
}
const popc = (x) => { let c = 0; while (x) { c += x & 1; x >>= 1; } return c; };

function exprHTML(text) {
  return text.replace(/([A-Z])′/g, '<span class="ov">$1</span>');
}

function drawResults() {
  const s = result;
  const sopI = st.solIndex.sop, posI = st.solIndex.pos;
  $('#sopOut').innerHTML = 'F = ' + exprHTML(s.sopText[sopI] ?? '0');
  $('#posOut').innerHTML = 'F = ' + exprHTML(s.posText[posI] ?? '1');
  $('#sopMeta').textContent = costInfo(s.sop, s.sop.solutions[sopI] || [], st.n, false);
  $('#posMeta').textContent = costInfo(s.pos, s.pos.solutions[posI] || [], st.n, true);
  altList('#sopAlt', s.sopText, 'sop');
  altList('#posAlt', s.posText, 'pos');

  const sigma = s.ones.length ? `Σm(${s.ones.join(', ')})` : 'none';
  const pi = s.zeros.length ? `ΠM(${s.zeros.join(', ')})` : 'none';
  const dc = s.dcs.length ? ` + d(${s.dcs.join(', ')})` : '';
  const sop = s.sop.solutions[sopI] || [], pos = s.pos.solutions[posI] || [];
  const nandForm = s.sop.constant != null ? '—' : sop.length === 1
    ? `((${termSOP(s.sop.pis[sop[0]], st.names)})′)′`
    : '( ' + sop.map(i => `(${termSOP(s.sop.pis[i], st.names)})′`).join(' · ') + ' )′';
  const norForm = s.pos.constant != null ? '—' : pos.length === 1
    ? `((${termPOS(s.pos.pis[pos[0]], st.names).replace(/^\(|\)$/g, '')})′)′`
    : '( ' + pos.map(i => `(${termPOS(s.pos.pis[i], st.names).replace(/^\(|\)$/g, '')})′`).join(' + ') + ' )′';
  $('#forms').replaceChildren(
    el('dt', {}, 'Minterms'), el('dd', {}, sigma + dc),
    el('dt', {}, 'Maxterms'), el('dd', {}, pi + dc),
    el('dt', {}, 'NAND only'), el('dd', { html: 'F = ' + exprHTML(nandForm) }),
    el('dt', {}, 'NOR only'), el('dd', { html: 'F = ' + exprHTML(norForm) }),
  );
}

function altList(sel, texts, key) {
  const host = $(sel);
  host.replaceChildren();
  if (texts.length < 2) return;
  host.append(el('p', { class: 'alt-head' }, `${texts.length} equally small answers. Pick one to draw it:`));
  const row = el('div', { class: 'alt-row' });
  texts.forEach((t, i) => row.append(el('button', {
    class: 'alt-btn', 'aria-pressed': String(st.solIndex[key] === i), html: exprHTML(t),
    onclick: () => { st.solIndex[key] = i; if (st.show !== key) { st.show = key; $$('[data-show]').forEach(x => x.setAttribute('aria-pressed', String(x.dataset.show === key))); } drawMaps(); drawResults(); drawCircuit(); drawPI(); },
  })));
  host.append(row);
}

$$('[data-copy]').forEach(b => b.addEventListener('click', async () => {
  const which = b.dataset.copy;
  const txt = 'F = ' + (which === 'sop' ? result.sopText[st.solIndex.sop] : result.posText[st.solIndex.pos]).replace(/([A-Z])′/g, "$1'");
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

// ---------------------------------------------------------------- truth table
function drawTruthTable() {
  const t = $('#ttTable');
  const head = el('tr', {}, el('th', {}, 'm'), ...st.names.map(v => el('th', {}, v)), el('th', { class: 'f' }, 'F'));
  const rows = st.cells.map((v, m) => el('tr', { class: 'r-' + v },
    el('td', { class: 'mi' }, String(m)),
    ...st.names.map((_, k) => el('td', {}, String((m >> (st.n - 1 - k)) & 1))),
    el('td', { class: 'f' }, el('button', {
      class: 'f-btn', 'aria-label': `Row ${m}, F = ${v}`,
      onclick: () => { st.cells[m] = cycle(v); update(); },
    }, v === 'x' ? 'X' : String(v)))));
  t.replaceChildren(el('thead', {}, head), el('tbody', {}, ...rows));
}

// ---------------------------------------------------------------- prime implicants
function drawPI() {
  const key = st.show === 'pos' ? 'pos' : 'sop';
  const sol = result[key];
  const chosen = new Set(sol.solutions[st.solIndex[key]] || []);
  const host = $('#piTable');
  if (!sol.pis.length || sol.constant != null) {
    host.replaceChildren(el('p', { class: 'hint' }, sol.constant != null ? 'The function is constant, so there is nothing to group.' : 'No 1s on the map yet.'));
    $('#piChart').replaceChildren();
    return;
  }
  const fmt = key === 'sop' ? termSOP : termPOS;
  const color = (i) => {
    const order = [...(sol.solutions[st.solIndex[key]] || [])];
    const k = order.indexOf(i);
    return k >= 0 ? GROUP_COLORS[k % GROUP_COLORS.length] : 'transparent';
  };
  host.replaceChildren(el('table', { class: 'table pi-table' },
    el('thead', {}, el('tr', {}, el('th', {}, ''), el('th', {}, 'Pattern'), el('th', {}, key === 'sop' ? 'Term' : 'Sum term'), el('th', {}, 'Covers'), el('th', {}, ''))),
    el('tbody', {}, ...sol.pis.map((p, i) => el('tr', { class: chosen.has(i) ? 'used' : '' },
      el('td', {}, el('span', { class: 'pi-dot', style: `background:${color(i)}` })),
      el('td', { class: 'mono' }, patternOf(p, st.n)),
      el('td', { html: exprHTML(fmt(p, st.names)) }),
      el('td', { class: 'mono' }, p.covers.join(', ')),
      el('td', {}, sol.essential.includes(i) ? el('span', { class: 'tag-ess' }, 'essential') : chosen.has(i) ? el('span', { class: 'tag-used' }, 'used') : ''),
    )))));

  const targets = key === 'sop' ? result.ones : result.zeros;
  const chart = el('table', { class: 'table pi-chart' },
    el('thead', {}, el('tr', {}, el('th', {}, ''), ...targets.map(m => el('th', { class: 'mono' }, String(m))))),
    el('tbody', {}, ...sol.pis.map((p, i) => el('tr', { class: chosen.has(i) ? 'used' : '' },
      el('th', { html: exprHTML(fmt(p, st.names)) }),
      ...targets.map(m => {
        const only = p.covers.includes(m) && sol.pis.filter(q => q.covers.includes(m)).length === 1;
        return el('td', { class: p.covers.includes(m) ? (only ? 'hit only' : 'hit') : '' }, p.covers.includes(m) ? (only ? '◉' : '●') : '');
      })))));
  $('#piChart').replaceChildren(chart);
}

// ---------------------------------------------------------------- gate diagram
const AND_PATH = (x, y, h) => `M${x},${y} h${h * 0.5} a${h / 2},${h / 2} 0 0 1 0,${h} h-${h * 0.5} z`;
const OR_PATH = (x, y, h) => `M${x},${y} q${h * 0.35},${h / 2} 0,${h} q${h * 0.9},0 ${h * 1.15},-${h / 2} q-${h * 0.25},-${h / 2} -${h * 1.15},-${h / 2} z`;

function drawCircuit() {
  const host = $('#circuit');
  host.replaceChildren();
  const sol = result.sop;
  const idx = sol.solutions[st.solIndex.sop] || [];
  if (sol.constant != null || !idx.length) {
    host.append(el('p', { class: 'hint' }, sol.constant === 1 ? 'F is always 1: tie the output to +5V.' : 'F is always 0: tie the output to GND.'));
    return;
  }
  const terms = idx.map(i => {
    const p = sol.pis[i];
    const lits = [];
    for (let k = 0; k < st.n; k++) {
      const bit = 1 << (st.n - 1 - k);
      if (!(p.mask & bit)) lits.push({ v: st.names[k], neg: !(p.value & bit) });
    }
    return lits;
  });
  const gateH = (k) => Math.max(34, k * 16 + 6);
  let y = 20;
  const placed = terms.map(t => { const h = gateH(t.length); const r = { y, h, t }; y += h + 16; return r; });
  const H = Math.max(y + 10, 120);
  const W = 640;
  const s = svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'circuit' });
  const orH = Math.max(40, terms.length * 14);
  const orY = H / 2 - orH / 2, orX = 430;
  placed.forEach((g, gi) => {
    const color = GROUP_COLORS[gi % GROUP_COLORS.length];
    const gx = 200;
    if (g.t.length === 1) {
      // a single literal passes straight through to the OR
      const L = g.t[0];
      const ty = g.y + g.h / 2;
      s.append(text(30, ty + 4, L.v + (L.neg ? '′' : ''), 'c-lit', L.neg));
      s.append(svg('path', { d: `M70,${ty} H${gx + g.h * 1.0}`, class: 'c-wire' }));
      orInput(s, gx + g.h, ty, gi);
      return;
    }
    s.append(svg('path', { d: AND_PATH(gx, g.y, g.h), class: 'c-gate', stroke: color }));
    g.t.forEach((L, li) => {
      const py = g.y + (g.h / (g.t.length + 1)) * (li + 1);
      s.append(text(30, py + 4, L.v + (L.neg ? '′' : ''), 'c-lit', L.neg));
      if (L.neg) {
        s.append(svg('path', { d: `M70,${py} H96`, class: 'c-wire' }));
        s.append(svg('path', { d: `M96,${py - 7} l14,7 l-14,7 z`, class: 'c-inv' }));
        s.append(svg('circle', { cx: 113, cy: py, r: 3, class: 'c-inv' }));
        s.append(svg('path', { d: `M116,${py} H${gx}`, class: 'c-wire' }));
      } else s.append(svg('path', { d: `M70,${py} H${gx}`, class: 'c-wire' }));
    });
    orInput(s, gx + g.h, g.y + g.h / 2, gi);
  });
  function orInput(svgEl, x, yy, gi) {
    const iy = orY + (orH / (terms.length + 1)) * (gi + 1);
    const mid = 330 + gi * 6;
    svgEl.append(svg('path', { d: `M${x},${yy} H${mid} V${iy} H${orX + 8}`, class: 'c-wire' }));
  }
  if (terms.length > 1) {
    s.append(svg('path', { d: OR_PATH(orX, orY, orH), class: 'c-gate or' }));
    s.append(svg('path', { d: `M${orX + orH * 1.15},${H / 2} H${W - 60}`, class: 'c-wire' }));
  } else {
    s.append(svg('path', { d: `M${orX},${orY + orH / 2} H${W - 60}`, class: 'c-wire' }));
  }
  s.append(text(W - 50, H / 2 + 5, 'F', 'c-out'));
  host.append(s);
}
function text(x, y, t, cls, bar) {
  const n = svg('text', { x, y, class: cls });
  if (bar) { const ts = svg('tspan', { 'text-decoration': 'overline' }); ts.textContent = t.replace('′', ''); n.append(ts); }
  else n.textContent = t;
  return n;
}

// ---------------------------------------------------------------- QM steps
function drawQM() {
  const host = $('#qmSteps');
  const key = st.show === 'pos' ? 'pos' : 'sop';
  const sol = result[key];
  host.replaceChildren();
  if (!sol.steps.length) { host.append(el('p', { class: 'hint' }, 'Nothing to combine.')); return; }
  host.append(el('p', {}, key === 'sop'
    ? 'Start with the minterms and don\'t cares, grouped by how many 1s they contain. Pairs in neighbouring groups that differ in one bit merge, and that bit becomes a dash. Anything that never merges is a prime implicant.'
    : 'For POS the solver runs the same method on the 0s (the maxterms), then complements each group into a sum term.'));
  sol.steps.forEach((col, ci) => {
    const byOnes = new Map();
    for (const t of col) {
      const k = popc(t.value & ~t.mask);
      if (!byOnes.has(k)) byOnes.set(k, []);
      byOnes.get(k).push(t);
    }
    const isPrime = (t) => sol.pis.some(p => p.value === t.value && p.mask === t.mask);
    const table = el('table', { class: 'table qm-col' },
      el('caption', {}, ci === 0 ? 'Column 1: single minterms' : `Column ${ci + 1}: merged ${ci} time${ci > 1 ? 's' : ''}`),
      el('thead', {}, el('tr', {}, el('th', {}, '1s'), el('th', {}, 'Covers'), el('th', {}, 'Pattern'))),
      el('tbody', {}, ...[...byOnes.keys()].sort((a, b) => a - b).flatMap((k, gi) => byOnes.get(k).map((t, ti) => el('tr', { class: (ti === 0 && gi > 0 ? 'grp ' : '') + (isPrime(t) ? 'prime' : '') },
        el('td', {}, ti === 0 ? String(k) : ''),
        el('td', { class: 'mono' }, t.covers.join(',')),
        el('td', { class: 'mono' }, patternOf(t, st.n) + (isPrime(t) ? ' ✱' : '')),
      )))));
    host.append(table);
  });
  host.append(el('p', { class: 'hint' }, '✱ marks a prime implicant (it could not be merged any further).'));
}

// ---------------------------------------------------------------- boot
function boot() {
  const h = new URLSearchParams(location.hash.slice(1));
  const n = +h.get('n');
  if (n >= 2 && n <= 6) {
    const names = (h.get('v') || '').toUpperCase();
    $('#names').value = names.length === n ? names : 'ABCDEF'.slice(0, n);
    setN(n);
    const parse = (s) => (s ? s.split('.').map(Number).filter(x => Number.isInteger(x) && x < 1 << n) : []);
    const ones = parse(h.get('m')), dcs = parse(h.get('d'));
    st.cells = Array.from({ length: 1 << n }, (_, m) => (dcs.includes(m) ? 'x' : ones.includes(m) ? 1 : 0));
    update();
  } else {
    // a classic textbook example so the page is never empty
    st.cells = Array(16).fill(0);
    [0, 2, 5, 7, 8, 10, 13, 15].forEach(m => { st.cells[m] = 1; });
    st.cells[6] = 'x';
    update();
  }
}
boot();
