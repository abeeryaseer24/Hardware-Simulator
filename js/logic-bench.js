import { mountChrome, toast, $, $$, el } from './shared/site.js';
import { CHIPS, FAMILIES } from './digital/chips.js';
import { Trainer, describePoint, parsePoint, pinHole, PADS, baseNode } from './digital/model.js';
import { Board, WIRE_COLORS } from './digital/board.js';
import { EXPERIMENTS, EXP_GROUPS } from './digital/experiments.js';
import { pinoutSVG } from './digital/pinout.js';

mountChrome('logic');

const trainer = new Trainer();
const STORE = 'bn-logic-v1';
let currentExp = null;
let guideOn = false;
let lastSnap = '';
const undo = [], redo = [];

// ------------------------------------------------------------------ board + hooks
const board = new Board($('#boardHost'), trainer, {
  change(transient) { refresh(); if (!transient) snapshot(); },
  select(sel) { if (sel) showInspect(sel); },
  hover(info) { hoverInfo(info); },
  notify(msg, kind) { toast(msg, kind); },
  toggleSwitch(i) { trainer.switches[i] ^= 1; refresh(); },
  pulser(i, down) { trainer.pulsers[i] = down ? 1 : 0; refresh(); },
  power() { trainer.power = !trainer.power; refresh(); toast(trainer.power ? 'Trainer on' : 'Trainer off'); },
  clock(cmd) { clockCmd(cmd); },
  segMode() { trainer.segMode = trainer.segMode === 'cc' ? 'ca' : 'cc'; refresh(); snapshot(); },
  placed() { $$('.chip-btn').forEach(b => b.setAttribute('aria-pressed', 'false')); },
});

function refresh() {
  trainer.solve();
  board.render();
  renderIssues();
  if (currentExp && guideOn) updateGuideStep();
  analyzerSample();
  save();
  if (inspectSel) showInspect(inspectSel, true);
}

function snapshot() {
  const s = JSON.stringify(trainer.serialize());
  if (s === lastSnap) return;
  if (lastSnap) { undo.push(lastSnap); if (undo.length > 120) undo.shift(); }
  redo.length = 0;
  lastSnap = s;
  syncUndoButtons();
}
function restore(json) {
  trainer.load(JSON.parse(json));
  lastSnap = json;
  board.selected = null;
  refresh();
  syncUndoButtons();
}
function syncUndoButtons() {
  $('#undoBtn').disabled = !undo.length;
  $('#redoBtn').disabled = !redo.length;
}
$('#undoBtn').onclick = () => { if (!undo.length) return; redo.push(lastSnap); restore(undo.pop()); };
$('#redoBtn').onclick = () => { if (!redo.length) return; undo.push(lastSnap); restore(redo.pop()); };

function save() {
  try { localStorage.setItem(STORE, JSON.stringify(trainer.serialize())); } catch { /* storage full or blocked */ }
}

// ------------------------------------------------------------------ clock
const FREQS = [0.5, 1, 2, 5, 10];
let fi = 1, clockTimer = null;
function clockCmd(cmd) {
  if (cmd === 'run') {
    if (clockTimer) { clearInterval(clockTimer); clockTimer = null; }
    else startClock();
  } else if (cmd === 'fast') { fi = Math.min(FREQS.length - 1, fi + 1); if (clockTimer) startClock(); }
  else if (cmd === 'slow') { fi = Math.max(0, fi - 1); if (clockTimer) startClock(); }
  else if (cmd === 'step') {
    if (clockTimer) { clearInterval(clockTimer); clockTimer = null; }
    trainer.clock = 1; refresh();
    setTimeout(() => { trainer.clock = 0; refresh(); }, 160);
  }
  board.setClockInfo(FREQS[fi], !!clockTimer);
}
function startClock() {
  clearInterval(clockTimer);
  clockTimer = setInterval(() => { trainer.clock ^= 1; refresh(); }, 500 / FREQS[fi]);
}

// ------------------------------------------------------------------ left panel
$$('[data-tab]').forEach(b => b.addEventListener('click', () => {
  $$('[data-tab]').forEach(x => x.setAttribute('aria-selected', x === b ? 'true' : 'false'));
  $$('[data-pane]').forEach(p => { p.hidden = p.dataset.pane !== b.dataset.tab; });
}));

function renderExpList(filter = '') {
  const host = $('#expList');
  host.replaceChildren();
  const f = filter.toLowerCase();
  for (const g of EXP_GROUPS) {
    const items = EXPERIMENTS.filter(e => e.group === g && (!f || (e.title + ' ' + e.aim + ' ' + e.group).toLowerCase().includes(f)));
    if (!items.length) continue;
    host.append(el('h4', { class: 'exp-group' }, g));
    const ul = el('ul');
    for (const e of items) {
      const chips = [...new Set(e.build().chips.map(c => c.type))];
      ul.append(el('li', {}, el('button', {
        class: 'exp-item' + (currentExp?.id === e.id ? ' is-active' : ''),
        onclick: () => openExperiment(e),
      }, el('span', { class: 'exp-title' }, e.title), el('span', { class: 'exp-chips' }, chips.join(' + ')))));
    }
    host.append(ul);
  }
  if (!host.children.length) host.append(el('p', { class: 'hint' }, 'Nothing matches. Try a chip number like 7483.'));
}
$('#expSearch').addEventListener('input', (e) => renderExpList(e.target.value));

function renderChipList() {
  const host = $('#chipList');
  for (const fam of FAMILIES) {
    host.append(el('h4', { class: 'exp-group' }, fam));
    const grid = el('div', { class: 'chip-grid' });
    for (const c of Object.values(CHIPS).filter(c => c.family === fam)) {
      grid.append(el('button', {
        class: 'chip-btn', 'aria-pressed': 'false', title: c.name,
        onclick: (ev) => {
          const on = ev.currentTarget.getAttribute('aria-pressed') !== 'true';
          $$('.chip-btn').forEach(b => b.setAttribute('aria-pressed', 'false'));
          if (on) {
            ev.currentTarget.setAttribute('aria-pressed', 'true');
            board.setMode('place', c.id);
            showChipSheet(c);
            status(`Placing ${c.id}. Click the breadboard to drop it, Esc to cancel.`);
          } else { board.setMode('wire'); status(''); }
        },
      }, el('span', { class: 'chip-num' }, c.id), el('span', { class: 'chip-name' }, c.name)));
    }
    host.append(grid);
  }
}

// ------------------------------------------------------------------ right panel
function rtab(name) {
  $$('[data-rtab]').forEach(x => x.setAttribute('aria-selected', x.dataset.rtab === name ? 'true' : 'false'));
  $$('[data-rpane]').forEach(p => { p.hidden = p.dataset.rpane !== name; });
}
$$('[data-rtab]').forEach(b => b.addEventListener('click', () => rtab(b.dataset.rtab)));
$('#drawerBtn').onclick = () => $('#rightPanel').classList.toggle('is-open');

function renderSheetEmpty() {
  const s = $('#sheet');
  s.replaceChildren(
    el('h3', {}, 'Pick an experiment'),
    el('p', {}, 'Choose one from the list on the left. You get the aim, a short theory note, the switch and LED mapping, a step-by-step wiring guide, and an automatic checker.'),
    el('p', {}, 'Or build freely: open the Chips tab, drop a chip on the board, and click two holes to run a wire.'),
    el('div', { class: 'keys' },
      el('h4', {}, 'Handy keys'),
      el('dl', {},
        el('dt', {}, el('kbd', {}, '1'), '–', el('kbd', {}, '8')), el('dd', {}, 'flip switches S1–S8'),
        el('dt', {}, el('kbd', {}, 'Space')), el('dd', {}, 'press pulser P1'),
        el('dt', {}, el('kbd', {}, 'Del')), el('dd', {}, 'remove the selected wire or chip'),
        el('dt', {}, el('kbd', {}, 'Esc')), el('dd', {}, 'cancel the wire you are drawing'),
        el('dt', {}, el('kbd', {}, 'Ctrl'), '+', el('kbd', {}, 'Z')), el('dd', {}, 'undo'),
        el('dt', {}, 'Right-click'), el('dd', {}, 'remove a wire or chip'),
      )),
  );
}

function openExperiment(e) {
  currentExp = e;
  guideOn = false;
  board.guide = null;
  renderExpList($('#expSearch').value);
  rtab('sheet');
  if (window.innerWidth > 760) $('#rightPanel').classList.add('is-open');
  const ref = e.build();
  const s = $('#sheet');
  const io = el('table', { class: 'table io-table' },
    el('thead', {}, el('tr', {}, el('th', {}, 'Trainer'), el('th', {}, 'Signal'))),
    el('tbody', {},
      ...e.inputs.map(i => el('tr', {}, el('td', {}, 'S' + i.sw), el('td', {}, i.name))),
      ...e.outputs.map(o => el('tr', {}, el('td', {}, PADS[o.pad].group === 'seg' ? 'seg ' + PADS[o.pad].label : PADS[o.pad].label), el('td', {}, o.name))),
    ));
  const chips = [...new Set(ref.chips.map(c => c.type))];
  s.replaceChildren(
    el('p', { class: 'sheet-group' }, e.group),
    el('h3', {}, e.title),
    el('p', { class: 'aim' }, e.aim),
    el('div', { class: 'theory', html: e.theory }),
    el('p', { class: 'panel-label' }, 'Chips needed'),
    el('div', { class: 'chip-tags' }, ...chips.map(c => el('button', { class: 'chip-tag', onclick: () => showChipSheet(CHIPS[c]) }, c))),
    el('p', { class: 'panel-label' }, 'Connections'),
    io,
    el('div', { class: 'sheet-actions' },
      el('button', { class: 'btn btn--mask', id: 'guideBtn', onclick: toggleGuide }, 'Guide me'),
      el('button', { class: 'btn', onclick: () => buildFor(e) }, 'Build it for me'),
      el('button', { class: 'btn btn--gold', onclick: () => runCheck(e) }, 'Check my circuit'),
    ),
    el('div', { id: 'guideSteps' }),
    el('div', { id: 'checkOut' }),
  );
  if (e.segMode) { trainer.segMode = e.segMode; refresh(); }
}

function toggleGuide() {
  guideOn = !guideOn;
  const btn = $('#guideBtn');
  btn.textContent = guideOn ? 'Hide guide' : 'Guide me';
  if (!guideOn) { board.guide = null; $('#guideSteps').replaceChildren(); board.render(); return; }
  const ref = currentExp.build();
  board.guide = { chips: ref.chips, wires: ref.wires, step: 0 };
  if (currentExp.segMode) trainer.segMode = currentExp.segMode;
  board.focusBreadboard();
  updateGuideStep();
  board.render();
}

function refName(guide, idx) { return 'U' + (idx + 1); }

function describeForGuide(pt, guide) {
  const p = parsePoint(pt);
  if (p.kind === 'hole' && !/^(tp|tn|bp|bn)$/.test(p.row)) {
    for (let i = 0; i < guide.chips.length; i++) {
      const c = guide.chips[i];
      const def = CHIPS[c.type];
      for (let pin = 1; pin <= def.pins; pin++) {
        const h = parsePoint(pinHole(c, pin));
        const sameSide = 'abcde'.includes(h.row) === 'abcde'.includes(p.row);
        if (h.col === p.col && sameSide) return `${refName(guide, i)} pin ${pin} (${def.names[pin - 1].replace('/', '¬')}) — hole ${pt}`;
      }
    }
  }
  return describePoint(pt);
}

function updateGuideStep() {
  const g = board.guide;
  if (!g) return;
  const host = $('#guideSteps');
  if (!host) return;
  const placed = (c) => trainer.chips.some(x => x.type === c.type && x.col === c.col);
  const chipsDone = g.chips.every(placed);
  const doneW = g.wires.map(w => trainer.wires.some(x => board.sameConn(x, w)));
  g.step = doneW.indexOf(false);
  const items = [];
  g.chips.forEach((c, i) => {
    items.push(el('li', { class: placed(c) ? 'done' : 'todo' },
      el('strong', {}, `Place ${c.type} as ${refName(g, i)}`), ` with pin 1 at hole f${c.col + 1}. The dashed outline shows where.`));
  });
  g.wires.forEach((w, i) => {
    const cls = doneW[i] ? 'done' : chipsDone && i === g.step ? 'now' : 'todo';
    items.push(el('li', { class: cls },
      w.note ? el('strong', {}, w.note + ': ') : '',
      `${describeForGuide(w.a, g)} → ${describeForGuide(w.b, g)}`));
  });
  const total = g.chips.length + g.wires.length;
  const done = g.chips.filter(placed).length + doneW.filter(Boolean).length;
  host.replaceChildren(
    el('div', { class: 'progress' }, el('span', { style: `width:${(done / total) * 100}%` })),
    el('p', { class: 'panel-label' }, done === total ? 'All steps done. Run the checker.' : `${done} of ${total} steps done`),
    el('ol', { class: 'steps' }, ...items),
  );
  const now = host.querySelector('.now');
  if (now) now.scrollIntoView({ block: 'nearest' });
  board.renderGuide();
}

function buildFor(e) {
  const ref = e.build();
  trainer.load({ chips: ref.chips.map((c, i) => ({ ...c, ref: 'U' + (i + 1) })), wires: ref.wires.map(w => ({ a: w.a, b: w.b, color: 'blue' })), switches: trainer.switches, segMode: e.segMode || trainer.segMode });
  // colour the wires the way a careful student would
  trainer.wires.forEach((w) => { w.color = board.autoColor(w.a, w.b); });
  trainer.power = true;
  board.focusBreadboard();
  refresh();
  snapshot();
  toast('Reference circuit built. Try the switches, then break it on purpose and see what changes.', 'ok');
}

// ------------------------------------------------------------------ checker
function readPad(pad) {
  const v = trainer.result.read(pad);
  return v === null ? 'Z' : v;
}

function runCheck(e) {
  const out = $('#checkOut');
  const savedSw = trainer.switches.slice(), savedP = trainer.pulsers.slice();
  const savedClock = trainer.clock, savedPower = trainer.power;
  if (clockTimer) { clearInterval(clockTimer); clockTimer = null; board.setClockInfo(FREQS[fi], false); }
  trainer.power = true; trainer.clock = 0; trainer.pulsers = [0, 0];
  if (e.segMode) trainer.segMode = e.segMode;
  const rows = [];
  let pass = true;

  if (e.fn) {
    const k = e.inputs.length;
    for (let n = 0; n < (1 << k); n++) {
      const vars = {};
      e.inputs.forEach((inp, i) => {
        const bit = (n >> (k - 1 - i)) & 1;
        trainer.switches[inp.sw - 1] = bit;
        vars[inp.name] = bit;
      });
      trainer.solve();
      const exp = e.fn(vars);
      const got = Object.fromEntries(e.outputs.map(o => [o.name, readPad(o.pad)]));
      const ok = e.outputs.every(o => got[o.name] === exp[o.name]);
      if (!ok) pass = false;
      rows.push({ vars, exp, got, ok });
    }
  } else if (e.script) {
    // power-cycle so counters start from zero, like switching the kit on
    for (const c of trainer.chips) { c.state = {}; c.outs = {}; }
    trainer.solve();
    for (const step of e.script) {
      if (step.set) for (const [sw, v] of Object.entries(step.set)) trainer.switches[+sw - 1] = v;
      trainer.solve();
      if (step.pulse) {
        trainer.pulsers[0] = 1; trainer.solve();
        trainer.pulsers[0] = 0; trainer.solve();
      }
      const got = Object.fromEntries(e.outputs.map(o => [o.name, readPad(o.pad)]));
      const ok = e.outputs.every(o => got[o.name] === step.expect[o.name]);
      if (!ok) pass = false;
      rows.push({ note: step.note, exp: step.expect, got, ok });
    }
  }

  trainer.switches = savedSw; trainer.pulsers = savedP; trainer.clock = savedClock; trainer.power = savedPower;
  refresh();

  const bad = rows.filter(r => !r.ok).length;
  const head = e.fn
    ? el('tr', {}, ...e.inputs.map(i => el('th', {}, i.name)), ...e.outputs.map(o => el('th', { class: 'out' }, o.name)))
    : el('tr', {}, el('th', {}, 'Step'), ...e.outputs.map(o => el('th', { class: 'out' }, o.name)));
  const body = rows.map(r => el('tr', { class: r.ok ? '' : 'bad' },
    ...(e.fn ? e.inputs.map(i => el('td', {}, String(r.vars[i.name]))) : [el('td', { class: 'note-cell' }, r.note)]),
    ...e.outputs.map(o => {
      const ok = r.got[o.name] === r.exp[o.name];
      return el('td', { class: 'out' + (ok ? '' : ' miss'), title: ok ? '' : `expected ${r.exp[o.name]}` },
        String(r.got[o.name]), ok ? '' : el('small', {}, ' want ' + r.exp[o.name]));
    })));
  const firstIssue = trainer.result.issues.find(i => i.level !== 'info');
  out.replaceChildren(
    el('div', { class: 'verdict ' + (pass ? 'pass' : 'fail') },
      el('strong', {}, pass ? 'Circuit works' : `${bad} of ${rows.length} ${e.fn ? 'rows' : 'steps'} wrong`),
      el('span', {}, pass
        ? (e.fn ? 'Every row of the truth table matches.' : 'Every step of the sequence matches.')
        : firstIssue ? 'Start here: ' + firstIssue.text : 'Red cells show what your LEDs did versus what they should do. Z means the output is not connected to anything driven.')),
    el('div', { class: 'tt-wrap' }, el('table', { class: 'table tt' }, el('thead', {}, head), el('tbody', {}, ...body))),
  );
  out.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

// ------------------------------------------------------------------ inspector
let inspectSel = null;
function showChipSheet(def) {
  const host = $('#inspect');
  host.replaceChildren(
    el('h3', {}, def.id),
    el('p', {}, def.name),
    pinoutSVG(def),
    el('p', { class: 'hint' }, `Power: pin ${def.vcc} to +5V, pin ${def.gnd} to GND. Pin names with a bar on top are active-low.`),
  );
  rtab('inspect');
}

function showInspect(sel, quiet) {
  inspectSel = sel;
  const host = $('#inspect');
  if (sel.kind === 'chip') {
    const c = trainer.chips.find(x => x.id === sel.id);
    if (!c) { inspectSel = null; return; }
    const def = CHIPS[c.type];
    const lv = (p) => (c.powered ? trainer.result.read(pinHole(c, p)) : null);
    host.replaceChildren(
      el('h3', {}, `${c.ref} · ${c.type}`),
      el('p', {}, def.name),
      el('p', { class: 'chip-state ' + (c.burnt ? 'bad' : c.powered ? 'ok' : 'warn') }, c.burnt ? 'Burnt out' : c.powered ? 'Powered, live pin levels below' : 'Not powered'),
      pinoutSVG(def, lv),
      el('p', { class: 'hint' }, 'Drag the chip sideways to move it. Wires stay in their holes, so check them after a move.'),
      el('button', { class: 'btn btn--sm', onclick: () => { board.removeChip(c.id); host.replaceChildren(); inspectSel = null; } }, 'Remove chip'),
    );
  } else if (sel.kind === 'wire') {
    const w = trainer.wires.find(x => x.id === sel.id);
    if (!w) { inspectSel = null; return; }
    const lv = trainer.result.read(w.a);
    host.replaceChildren(
      el('h3', {}, 'Wire'),
      el('p', {}, `${describePoint(w.a)} to ${describePoint(w.b)}`),
      el('p', { class: 'level-pill l-' + String(lv) }, 'Level: ' + (lv === 1 ? 'HIGH' : lv === 0 ? 'LOW' : lv === 'X' ? 'conflict' : 'floating')),
      el('p', { class: 'panel-label' }, 'Colour'),
      el('div', { class: 'swatch-row' }, ...Object.entries(WIRE_COLORS).map(([k, v]) => el('button', {
        class: 'swatch' + (w.color === k ? ' is-on' : ''), style: `--c:${v}`, title: k, 'aria-label': k,
        onclick: () => { w.color = k; refresh(); snapshot(); },
      }))),
      el('button', { class: 'btn btn--sm', onclick: () => { board.removeWire(w.id); host.replaceChildren(); inspectSel = null; } }, 'Remove wire'),
    );
  }
  if (!quiet) rtab('inspect');
}

function hoverInfo({ point, chip }) {
  if (!point && !chip) { status(''); return; }
  if (point) {
    const lv = trainer.levelOfPoint(point);
    const lvTxt = lv === 1 ? 'HIGH' : lv === 0 ? 'LOW' : lv === 'X' ? 'CONFLICT' : 'floating';
    const net = trainer.netOf(point);
    const drv = trainer.result?.drivers.get(net);
    const occ = trainer.occupied().get(point);
    let what = describePoint(point);
    if (occ?.chip) what += ` — ${occ.chip.ref} pin ${occ.pin} (${CHIPS[occ.chip.type].names[occ.pin - 1]})`;
    status(`${what} · ${lvTxt}${drv?.length ? ' · driven by ' + drv.map(d => d.src).join(', ') : ''}`);
  } else if (chip) {
    status(`${chip.ref}: ${chip.type} ${CHIPS[chip.type].name}${chip.powered ? '' : ' (no power)'}`);
  }
}

function status(t) { $('#statusLine').textContent = t; }

function renderIssues() {
  const list = trainer.result.issues;
  const host = $('#issues');
  const serious = list.filter(i => i.level !== 'info').length;
  const badge = $('#issueBadge');
  badge.hidden = !serious;
  badge.textContent = serious;
  if (!list.length) {
    host.replaceChildren(el('h3', {}, 'No problems found'), el('p', {}, trainer.chips.length ? 'Every chip is powered and nothing is fighting. That does not prove the logic is right; the checker on the lab sheet does that.' : 'The board is empty. Place a chip or pick an experiment.'));
    return;
  }
  host.replaceChildren(
    el('h3', {}, 'What the trainer noticed'),
    el('ul', { class: 'issue-list' }, ...list.map(i => el('li', { class: 'lvl-' + i.level }, i.text))),
  );
}

// ------------------------------------------------------------------ logic analyzer
const AN_CH = [
  { name: 'CLK', read: () => (trainer.power ? trainer.clock : 0) },
  { name: 'P1', read: () => trainer.pulsers[0] },
  ...Array.from({ length: 6 }, (_, i) => ({ name: 'L' + (i + 1), read: () => (trainer.result.leds[i] ? 1 : 0) })),
];
let samples = [];
function analyzerSample() {
  const v = AN_CH.map(c => c.read());
  const last = samples[samples.length - 1];
  if (last && last.every((x, i) => x === v[i])) return;
  samples.push(v);
  if (samples.length > 64) samples.shift();
  drawAnalyzer();
}
function drawAnalyzer() {
  const host = $('#anBody');
  if (!host || $('#analyzer').classList.contains('is-collapsed')) return;
  const W = 900, rowH = 20, labW = 40;
  const n = Math.max(samples.length, 2);
  const step = (W - labW - 10) / Math.max(24, n);
  const H = AN_CH.length * rowH + 6;
  let paths = '';
  AN_CH.forEach((c, ci) => {
    const y0 = ci * rowH + 4, hi = y0 + 3, lo = y0 + rowH - 5;
    let d = '';
    samples.forEach((s, i) => {
      const x = labW + i * step, y = s[ci] ? hi : lo;
      d += (i === 0 ? `M${x},${y}` : ` L${x},${y}`) + ` L${x + step},${y}`;
    });
    paths += `<text x="2" y="${lo - 1}" class="an-lab">${c.name}</text><path d="${d}" class="an-trace ${ci === 0 ? 'clk' : ci === 1 ? 'pb' : ''}"/>`;
    paths += `<line x1="${labW}" x2="${W}" y1="${y0 + rowH - 1}" y2="${y0 + rowH - 1}" class="an-grid"/>`;
  });
  host.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" class="an-svg">${paths}</svg>`;
}
$('#anToggle').onclick = () => {
  const a = $('#analyzer');
  a.classList.toggle('is-collapsed');
  $('#anToggle').setAttribute('aria-expanded', a.classList.contains('is-collapsed') ? 'false' : 'true');
  drawAnalyzer();
};
$('#anClear').onclick = () => { samples = []; analyzerSample(); };

// ------------------------------------------------------------------ toolbar
$('#zoomIn').onclick = () => board.zoom(1 / 1.25);
$('#zoomOut').onclick = () => board.zoom(1.25);
$('#zoomFit').onclick = () => board.fit();
$('#zoomBB').onclick = () => board.focusBreadboard();
$('#levelBtn').onclick = (e) => {
  board.levelView = !board.levelView;
  e.currentTarget.setAttribute('aria-pressed', String(board.levelView));
  board.render();
  status(board.levelView ? 'Logic view: red wires are HIGH, blue are LOW, grey are floating, orange are fighting.' : '');
};
$('#styleBtn').onclick = (e) => {
  board.wireStyle = board.wireStyle === 'arc' ? 'straight' : 'arc';
  e.currentTarget.textContent = board.wireStyle === 'arc' ? 'Arched' : 'Straight';
  board.render();
};
$('#clearBtn').onclick = () => {
  if (!trainer.chips.length && !trainer.wires.length) return;
  trainer.chips = []; trainer.wires = [];
  board.selected = null;
  refresh(); snapshot();
  toast('Board cleared. Ctrl+Z brings it back.');
};

const sw = $('#swatches');
const swOpts = [['auto', 'conic-gradient(#d62b2b 0 25%, #23262a 0 50%, #e8b80c 0 75%, #1f9a4c 0)'], ...Object.entries(WIRE_COLORS)];
for (const [k, v] of swOpts) {
  sw.append(el('button', {
    class: 'swatch' + (k === 'auto' ? ' is-on' : ''), role: 'radio', 'aria-checked': k === 'auto' ? 'true' : 'false',
    style: `--c:${v}`, title: k === 'auto' ? 'Automatic: red for +5V, black for GND, yellow for inputs, green for outputs' : k, 'aria-label': k,
    onclick: (e) => {
      board.wireColor = k;
      $$('.swatch', sw).forEach(b => { b.classList.toggle('is-on', b === e.currentTarget); b.setAttribute('aria-checked', b === e.currentTarget ? 'true' : 'false'); });
    },
  }));
}

function encodeShare() {
  const json = JSON.stringify(trainer.serialize());
  return btoa(unescape(encodeURIComponent(json))).replace(/=+$/, '');
}
$('#shareBtn').onclick = async () => {
  const url = location.origin + location.pathname + '#c=' + encodeShare();
  try { await navigator.clipboard.writeText(url); toast('Link copied. Anyone who opens it sees this exact board.', 'ok'); }
  catch { prompt('Copy this link:', url); }
};
$('#exportBtn').onclick = () => {
  const blob = new Blob([JSON.stringify(trainer.serialize(), null, 1)], { type: 'application/json' });
  const a = el('a', { href: URL.createObjectURL(blob), download: (currentExp ? currentExp.id : 'circuit') + '.json' });
  a.click();
  URL.revokeObjectURL(a.href);
};
$('#importBtn').onclick = () => $('#importFile').click();
$('#importFile').onchange = async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  try { restore(JSON.stringify(JSON.parse(await f.text()))); snapshot(); toast('Circuit opened.', 'ok'); }
  catch { toast('That file is not a saved Benchnote circuit.', 'bad'); }
  e.target.value = '';
};

// ------------------------------------------------------------------ keyboard
document.addEventListener('keydown', (e) => {
  if (e.target.matches('input, textarea, select')) return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); $(e.shiftKey ? '#redoBtn' : '#undoBtn').click(); return; }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); $('#redoBtn').click(); return; }
  if (e.key >= '1' && e.key <= '8' && !e.ctrlKey && !e.altKey) { trainer.switches[+e.key - 1] ^= 1; refresh(); return; }
  if (e.key === ' ' && !e.repeat) { e.preventDefault(); trainer.pulsers[0] = 1; refresh(); return; }
  if (e.key === 'Escape') { if (board.cancel()) { $$('.chip-btn').forEach(b => b.setAttribute('aria-pressed', 'false')); status(''); } return; }
  if (e.key === 'Delete' || e.key === 'Backspace') { if (board.deleteSelected()) { $('#inspect').replaceChildren(); inspectSel = null; } }
});
document.addEventListener('keyup', (e) => {
  if (e.key === ' ' && trainer.pulsers[0]) { trainer.pulsers[0] = 0; refresh(); }
});

// ------------------------------------------------------------------ boot
function boot() {
  let loaded = false;
  const m = location.hash.match(/#c=([\w+/-]+)/);
  if (m) {
    try { trainer.load(JSON.parse(decodeURIComponent(escape(atob(m[1]))))); loaded = true; toast('Opened the shared circuit.'); }
    catch { toast('That share link is damaged.', 'bad'); }
    history.replaceState(null, '', location.pathname);
  }
  if (!loaded) {
    try { const s = localStorage.getItem(STORE); if (s) trainer.load(JSON.parse(s)); } catch { /* ignore */ }
  }
  renderExpList();
  renderChipList();
  renderSheetEmpty();
  const want = new URLSearchParams(location.search).get('exp');
  const pre = EXPERIMENTS.find(x => x.id === want);
  board.setClockInfo(FREQS[fi], false);
  if (trainer.chips.length || trainer.wires.length) board.focusBreadboard();
  refresh();
  snapshot();
  syncUndoButtons();
  if (pre) openExperiment(pre);
}
boot();
