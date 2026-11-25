import { mountChrome, toast, $, $$, el } from './shared/site.js';
import { renderSide, bindSideToggle, markDone, DIGITAL_TOOLS } from './shared/lab-side.js';
import { CHIPS, FAMILIES } from './digital/chips.js';
import { describePoint, parsePoint, pinHole, PADS, Trainer, holeId, baseNode } from './digital/model.js';
import { WIRE_COLORS } from './digital/board.js';
import { DigitalBench, benchToolbar } from './digital/bench.js';
import { EXPERIMENTS } from './digital/experiments.js';
import { pinoutSVG, pinRoles } from './digital/pinout.js';
import { solveFunction, truthFromExpr, parseIndexList, termSOP, termPOS } from './shared/boolean.js';
import { buildLogic } from './digital/autobuild.js';
import { diagnose, autoFix, describeNode } from './digital/autofix.js';
import { takeSharedCircuit } from './shared/share.js';

mountChrome('digital');
bindSideToggle();

let exp = null;           // current experiment, null = free build
let view = 'overview';
let refSteps = [];
let stepIndex = 0;
let ghostOn = false;
let stepTimer = null;
let mode = 'practice';   // practice | fault | exam
let fault = null;
let examTimer = null, examStart = 0, examLimit = 0;

// ------------------------------------------------------------------ benches
const notify = (m, k) => toast(m, k);
const refBench = new DigitalBench($('#refHost'), {
  readonly: true, notify,
  onSelect: (sel, b) => showInspect(sel, b, $('#refInspect')),
  onHover: (info, b) => hoverStatus(info, b, $('#refStatus')),
});
const miniBench = new DigitalBench($('#miniHost'), { readonly: true, notify });
const myBench = new DigitalBench($('#myHost'), {
  notify,
  onChange: () => afterMyChange(),
  onSelect: (sel, b) => { if (sel?.kind === 'placed') { $$('.part-row').forEach(x => x.setAttribute('aria-pressed', 'false')); return; } if (sel) { showInspect(sel, b, $('#myInspect')); myTab('inspect'); } },
  onHover: (info, b) => hoverStatus(info, b, $('#myStatus')),
});
$('#refTools').append(benchToolbar(refBench, { editable: false }));
$('#myTools').append(benchToolbar(myBench, { editable: true }));

function afterMyChange() {
  if (!myBench.trainer.result) return;
  renderIssues();
  if (exp) renderPracticeSteps();
  const u = myBench._undoBtns;
  if (u) { u.undo.disabled = !myBench.undo.length; u.redo.disabled = !myBench.redo.length; }
  $('#saveState').textContent = myBench.storeKey ? 'saved on this device' : '';
}

// ------------------------------------------------------------------ sidebar
const sideItems = EXPERIMENTS.map(e => ({ id: e.id, title: e.title, group: e.group, sub: [...new Set(e.build().chips.map(c => c.type))].join(' + ') }));
function drawSide() {
  $('#examBtn')?.classList.toggle('is-active', mode === 'exam');
  renderSide({ host: $('#expList'), items: sideItems, activeId: exp?.id, filter: $('#search').value, onPick: (i) => open(EXPERIMENTS.find(e => e.id === i.id)), extra: [DIGITAL_TOOLS] });
  $('#freeBtn').classList.toggle('is-active', !exp);
}
$('#search').addEventListener('input', drawSide);
$('#freeBtn').addEventListener('click', () => open(null, 'practice'));

// ------------------------------------------------------------------ tabs
$$('#tabs [data-view]').forEach(b => b.addEventListener('click', () => setView(b.dataset.view)));
function setView(v) {
  if (!exp && v !== 'practice') v = 'practice';
  view = v;
  $$('#tabs [data-view]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.view === v)));
  const pane = v === 'fault' ? 'practice' : v;
  $$('[data-pane]').forEach(p => { p.hidden = p.dataset.pane !== pane; });
  if (v === 'fault' && mode !== 'fault') enterFault();
  else if (v !== 'fault' && mode === 'fault') leavePractice();
  if (v !== 'reference') stopStepPlay();
  syncUrl();
}
function syncUrl() {
  const q = new URLSearchParams();
  if (exp) q.set('exp', exp.id); else q.set('free', '1');
  if (view !== 'overview') q.set('view', view);
  history.replaceState(null, '', '?' + q.toString());
}

function panelTabs(group, attr, paneAttr, name) {
  $$(`[data-group="${group}"] [${attr}]`).forEach(b => b.setAttribute('aria-selected', String(b.getAttribute(attr) === name)));
  $$(`[${paneAttr}]`).forEach(p => { p.hidden = p.getAttribute(paneAttr) !== name; });
}
const refTab = (n) => panelTabs('ref', 'data-rt', 'data-rp', n);
const myTab = (n) => panelTabs('my', 'data-mt', 'data-mp', n);
$$('[data-rt]').forEach(b => b.addEventListener('click', () => refTab(b.dataset.rt)));
$$('[data-mt]').forEach(b => b.addEventListener('click', () => myTab(b.dataset.mt)));

$('#hideRef').addEventListener('click', () => { $('#split').classList.add('ref-hidden'); $('#showRef').hidden = false; });
$('#showRef').addEventListener('click', () => { $('#split').classList.remove('ref-hidden'); $('#showRef').hidden = true; });

// ------------------------------------------------------------------ open experiment
function refData(e) {
  const r = e.build();
  return { chips: r.chips.map((c, i) => ({ ...c, ref: 'U' + (i + 1) })), wires: r.wires.map(w => ({ a: w.a, b: w.b, color: 'blue', note: w.note })), segMode: e.segMode || 'cc' };
}
function colourWires(bench) {
  bench.trainer.wires.forEach(w => { w.color = bench.board.autoColor(w.a, w.b); });
  bench.refresh();
}

function open(e, wantView) {
  exp = e;
  mode = 'practice';
  stopExamTimer();
  $('#tabs').hidden = false;
  $('[data-mt="task"]').hidden = true;
  $('[data-mt="check"]').hidden = false;
  $('[data-mt="logic"]').hidden = false;
  stopStepPlay();
  drawSide();
  $('#side').classList.remove('is-open');
  const tabs = $('#tabs');
  if (!e) {
    $('#crumbGroup').textContent = 'Free breadboard';
    $('#title').textContent = 'Free breadboard';
    $('#aim').textContent = 'Build any digital circuit you like. Pick chips from the Parts tab, drag wires between holes, and test it with the switches, LEDs, clock and logic probe.';
    tabs.querySelector('[data-view="overview"]').hidden = true;
    tabs.querySelector('[data-view="reference"]').hidden = true;
    $('#split').classList.add('ref-hidden', 'no-ref');
    $('#showRef').hidden = true;
    $('#hideRef').hidden = true;
  } else {
    $('#crumbGroup').textContent = e.group;
    $('#title').textContent = e.title;
    $('#aim').textContent = e.aim;
    tabs.querySelector('[data-view="overview"]').hidden = false;
    tabs.querySelector('[data-view="reference"]').hidden = false;
    $('#split').classList.remove('ref-hidden', 'no-ref');
    $('#showRef').hidden = true;
    $('#hideRef').hidden = false;
    renderOverview(e);
    // reference bench
    refSteps = buildSteps(e);
    setStep(refSteps.length);
    renderTry(e);
    miniBench.load(refData(e));
    colourWires(miniBench);
    miniBench.board.fit();
  }
  $('#tabs [data-view="fault"]').hidden = !e;
  loadPracticeBoard();
  renderParts();
  renderLogicPanel();
  renderPracticeSteps();
  renderCheckPanel();
  $('#myInspect').replaceChildren(el('p', { class: 'empty' }, 'Click a chip or wire on your board to inspect it.'));
  $('#refInspect').replaceChildren(el('p', { class: 'empty' }, 'Click a chip to see its pinout with live pin levels.'));
  $$('#tabs [data-mt="steps"]');
  document.querySelector('[data-mt="steps"]').hidden = !e;
  myTab(e ? 'steps' : 'parts');
  document.querySelector('#tabs [data-view="practice"]').innerHTML = e ? '<span class="num">3</span>Practice' : 'Breadboard';
  setView(wantView || (e ? 'overview' : 'practice'));
}

// ------------------------------------------------------------------ overview
function truthRows(e) {
  if (!e.fn) return null;
  const k = e.inputs.length;
  const rows = [];
  for (let n = 0; n < (1 << k); n++) {
    const vars = {};
    e.inputs.forEach((inp, i) => { vars[inp.name] = (n >> (k - 1 - i)) & 1; });
    rows.push({ vars, out: e.fn(vars) });
  }
  return rows;
}
function padLabel(pad) { const p = PADS[pad]; return p.group === 'seg' ? 'segment ' + p.label : p.label; }

function renderOverview(e) {
  const host = $('#overview');
  const chips = [...new Set(e.build().chips.map(c => c.type))];
  const ref = e.build();
  const rows = truthRows(e);
  const left = el('div', {},
    el('div', { class: 'ov-card' }, el('h2', {}, 'Aim'), el('p', {}, e.aim)),
    el('div', { class: 'ov-card' }, el('h2', {}, 'Theory'), el('div', { html: e.theory })),
    el('div', { class: 'ov-card' }, el('h2', {}, 'Procedure'),
      el('ol', {},
        el('li', {}, `Place ${chips.map(c => 'a ' + c).join(', ')} across the centre channel of the breadboard.`),
        el('li', {}, 'Connect the trainer\'s +5 V and GND to the power rails, then each chip\'s VCC and GND pin to those rails.'),
        el('li', {}, `Wire the inputs from the switches and the outputs to the LEDs as listed in Connections (${ref.wires.length} wires in the reference build).`),
        el('li', {}, e.fn ? 'Switch the trainer on and go through every input combination, noting the LEDs in the truth table.' : 'Switch the trainer on and apply the inputs and clock pulses in the order shown in Expected sequence.'),
        el('li', {}, 'Compare your observations with the expected results.'),
      )),
    el('div', { class: 'ov-card' }, el('h2', {}, 'Precautions'),
      el('ul', {},
        el('li', {}, 'Make all connections with the power off, and check VCC and GND before switching on.'),
        el('li', {}, 'Every chip must straddle the centre channel with the notch facing the same way.'),
        el('li', {}, 'Tie unused inputs to a rail instead of leaving them floating.'),
      )),
    el('div', { class: 'ov-cta' },
      el('button', { class: 'btn btn--primary', onclick: () => setView('reference') }, 'See it wired'),
      el('button', { class: 'btn', onclick: () => setView('practice') }, 'Build it yourself')),
  );
  const conn = el('table', { class: 'table' },
    el('thead', {}, el('tr', {}, el('th', {}, 'Trainer'), el('th', {}, 'Signal'), el('th', {}, ''))),
    el('tbody', {},
      ...e.inputs.map(i => el('tr', {}, el('td', { class: 'mono' }, 'S' + i.sw), el('td', {}, i.name), el('td', { class: 'hint' }, 'input'))),
      ...e.outputs.map(o => el('tr', {}, el('td', { class: 'mono' }, padLabel(o.pad)), el('td', {}, o.name), el('td', { class: 'hint' }, 'output'))),
    ));
  let expected;
  if (rows) {
    expected = el('div', { class: 'ov-card' }, el('h2', {}, 'Truth table'),
      el('div', { class: 'tt-wrap', style: 'max-height:420px' }, el('table', { class: 'table tt' },
        el('thead', {}, el('tr', {}, ...e.inputs.map(i => el('th', {}, i.name)), ...e.outputs.map(o => el('th', { class: 'out' }, o.name)))),
        el('tbody', {}, ...rows.map(r => el('tr', {}, ...e.inputs.map(i => el('td', {}, String(r.vars[i.name]))), ...e.outputs.map(o => el('td', { class: 'out' }, String(r.out[o.name])))))))));
  } else {
    expected = el('div', { class: 'ov-card' }, el('h2', {}, 'Expected sequence'),
      el('div', { class: 'tt-wrap', style: 'max-height:420px' }, el('table', { class: 'table tt' },
        el('thead', {}, el('tr', {}, el('th', {}, 'Step'), ...e.outputs.map(o => el('th', { class: 'out' }, o.name)))),
        el('tbody', {}, ...e.script.map(s => el('tr', {}, el('td', { class: 'note-cell' }, s.note), ...e.outputs.map(o => el('td', { class: 'out' }, String(s.expect[o.name])))))))));
  }
  const right = el('div', {},
    el('div', { class: 'ov-card' }, el('h2', {}, 'Connections'), conn),
    expected,
    el('div', { class: 'ov-card' }, el('h2', {}, chips.length > 1 ? 'Chips used' : 'Chip used'),
      ...chips.map(c => el('div', { class: 'chip-block' }, el('p', { style: 'margin:0' }, el('strong', {}, c), ' ', CHIPS[c].name), pinoutSVG(CHIPS[c]), pinRoles(CHIPS[c])))),
  );
  host.replaceChildren(el('div', { class: 'ov' }, left, right));
}

// ------------------------------------------------------------------ reference: wiring steps
function buildSteps(e) {
  const r = e.build();
  const steps = r.chips.map((c, i) => ({ kind: 'chip', chip: c, idx: i, text: `Place ${c.type} as U${i + 1}, pin 1 at hole f${c.col + 1}` }));
  r.wires.forEach((w, i) => steps.push({ kind: 'wire', wire: w, idx: i, text: `${w.note ? w.note + ': ' : ''}${guideName(w.a, r.chips)} → ${guideName(w.b, r.chips)}` }));
  return steps;
}
function guideName(pt, chips) {
  const p = parsePoint(pt);
  if (p.kind === 'hole' && !/^(tp|tn|bp|bn)$/.test(p.row)) {
    for (let i = 0; i < chips.length; i++) {
      const def = CHIPS[chips[i].type];
      for (let pin = 1; pin <= def.pins; pin++) {
        const h = parsePoint(pinHole(chips[i], pin));
        if (h.col === p.col && 'abcde'.includes(h.row) === 'abcde'.includes(p.row)) return `U${i + 1} pin ${pin} (${def.names[pin - 1].replace('/', '¬')})`;
      }
    }
  }
  return describePoint(pt);
}

function setStep(k) {
  stepIndex = Math.max(0, Math.min(refSteps.length, k));
  const r = exp.build();
  const shown = refSteps.slice(0, stepIndex);
  const chips = shown.filter(s => s.kind === 'chip').map(s => ({ ...s.chip, ref: 'U' + (s.idx + 1) }));
  const wires = shown.filter(s => s.kind === 'wire').map(s => ({ a: s.wire.a, b: s.wire.b, color: 'blue' }));
  refBench.load({ chips, wires, segMode: exp.segMode || 'cc', switches: refBench.trainer.switches });
  refBench.trainer.wires.forEach(w => { w.color = refBench.board.autoColor(w.a, w.b); });
  const last = shown[shown.length - 1];
  refBench.board.focusWire = last?.kind === 'wire' && stepIndex < refSteps.length ? refBench.trainer.wires[refBench.trainer.wires.length - 1]?.id : null;
  refBench.refresh();
  if (stepIndex === 0 || stepIndex === refSteps.length) refBench.board.fit();
  void r;
  renderRefSteps();
}

function renderRefSteps() {
  const host = $('#refSteps');
  const N = refSteps.length;
  const range = el('input', { type: 'range', min: 0, max: N, value: stepIndex, 'aria-label': 'Wiring step' });
  range.addEventListener('input', () => setStep(+range.value));
  const playing = !!stepTimer;
  host.replaceChildren(
    el('h3', {}, 'Build it up one connection at a time'),
    el('p', { class: 'hint' }, 'Drag the slider or press Next. The newest wire glows. At the end you have the full working circuit.'),
    el('div', { class: 'stepper' },
      el('button', { class: 'btn btn--sm', onclick: () => setStep(stepIndex - 1), disabled: stepIndex === 0 }, 'Back'),
      range,
      el('button', { class: 'btn btn--sm btn--primary', onclick: () => setStep(stepIndex + 1), disabled: stepIndex === N }, 'Next'),
    ),
    el('div', { class: 'stepper' },
      el('span', { class: 'count' }, `${stepIndex} / ${N}`),
      el('span', { style: 'flex:1' }),
      el('button', { class: 'btn btn--sm', onclick: () => (playing ? stopStepPlay() : playSteps()) }, playing ? 'Pause' : (stepIndex === N ? 'Replay build' : 'Play')),
      el('button', { class: 'btn btn--sm', onclick: () => setStep(N), disabled: stepIndex === N }, 'Show all'),
    ),
    el('ol', { class: 'steps' }, ...refSteps.map((s, i) => el('li', {
      class: 'click ' + (i < stepIndex - 1 || (i === stepIndex - 1 && stepIndex === N) ? 'done' : i === stepIndex - 1 ? 'now' : ''),
      onclick: () => setStep(i + 1),
    }, el('span', {}, s.text)))),
  );
  host.querySelector('.now')?.scrollIntoView({ block: 'nearest' });
}
function playSteps() {
  if (stepIndex >= refSteps.length) setStep(0);
  stepTimer = setInterval(() => {
    if (stepIndex >= refSteps.length) { stopStepPlay(); return; }
    setStep(stepIndex + 1);
  }, 900);
  renderRefSteps();
}
function stopStepPlay() { if (stepTimer) { clearInterval(stepTimer); stepTimer = null; if (exp && view === 'reference') renderRefSteps(); } }

// ------------------------------------------------------------------ reference: try it
function renderTry(e) {
  const host = $('#refTry');
  const rows = truthRows(e);
  const items = [el('h3', {}, 'Drive the reference circuit')];
  if (rows) {
    items.push(el('p', { class: 'hint' }, 'Click a row to set the switches. The LEDs on the trainer should match the highlighted outputs.'));
    const tbody = el('tbody');
    const table = el('div', { class: 'tt-wrap' }, el('table', { class: 'table tt' },
      el('thead', {}, el('tr', {}, ...e.inputs.map(i => el('th', {}, `${i.name} (S${i.sw})`)), ...e.outputs.map(o => el('th', { class: 'out' }, o.name)))), tbody));
    rows.forEach((r) => {
      const tr = el('tr', { class: 'click', onclick: () => {
        setStep(refSteps.length);
        const sw = Array(8).fill(null);
        e.inputs.forEach(i => { sw[i.sw - 1] = r.vars[i.name]; });
        refBench.setSwitches(sw);
        $$('tr', tbody).forEach(x => x.classList.toggle('now', x === tr));
      } }, ...e.inputs.map(i => el('td', {}, String(r.vars[i.name]))), ...e.outputs.map(o => el('td', { class: 'out' }, String(r.out[o.name]))));
      tbody.append(tr);
    });
    items.push(table);
  } else {
    items.push(el('p', { class: 'hint' }, 'Set the switches listed below, then press the pulser P1 on the trainer (or Space) to clock the circuit.'));
    items.push(el('table', { class: 'table' }, el('tbody', {}, ...e.inputs.map(i => el('tr', {}, el('td', { class: 'mono' }, 'S' + i.sw), el('td', {}, i.name))))));
    items.push(el('button', { class: 'btn btn--sm btn--primary', onclick: () => { refBench.trainer.pulsers[0] = 1; refBench.refresh(); setTimeout(() => { refBench.trainer.pulsers[0] = 0; refBench.refresh(); }, 150); } }, 'Pulse P1'));
  }
  host.replaceChildren(...items);
}

// ------------------------------------------------------------------ practice: parts
function renderParts() {
  const host = $('#myParts');
  const need = exp ? [...new Set(exp.build().chips.map(c => c.type))] : [];
  const items = [];
  // one-tap strip for the chips used in almost every lab
  const quick = el('div', { class: 'quick' }, ...['7400', '7402', '7404', '7408', '7432', '7486', '7474'].map(id => el('button', {
    class: 'qp', 'aria-pressed': 'false', title: CHIPS[id].name,
    onclick: (ev) => {
      const on = ev.currentTarget.getAttribute('aria-pressed') !== 'true';
      $$('.qp, .part-row').forEach(b => b.setAttribute('aria-pressed', 'false'));
      if (on) { ev.currentTarget.setAttribute('aria-pressed', 'true'); myBench.board.setMode('place', id); $('#myStatus').textContent = `Placing ${id}: click the breadboard. Esc cancels.`; }
      else myBench.board.setMode('wire');
    },
  }, id)));
  items.push(el('p', { class: 'parts-group' }, 'Common chips'), quick);
  const row = (c) => el('button', {
    class: 'part-row', 'aria-pressed': 'false', title: c.name,
    onclick: (ev) => {
      const on = ev.currentTarget.getAttribute('aria-pressed') !== 'true';
      $$('.part-row').forEach(b => b.setAttribute('aria-pressed', 'false'));
      if (on) {
        ev.currentTarget.setAttribute('aria-pressed', 'true');
        myBench.board.setMode('place', c.id);
        $('#myStatus').textContent = `Placing ${c.id}: click the breadboard where it should sit. Esc cancels.`;
      } else myBench.board.setMode('wire');
    },
  }, el('span', { class: 'num' }, c.id), el('span', { class: 'nm' }, c.name));
  if (need.length) {
    items.push(el('p', { class: 'parts-group' }, 'Needed for this experiment'), el('div', { class: 'parts-grid' }, ...need.map(id => row(CHIPS[id]))));
  }
  items.push(el('p', { class: 'parts-group' }, 'Wire colour'));
  const sw = el('div', { class: 'swatch-row' });
  const opts = [['auto', 'conic-gradient(#d62b2b 0 25%, #23262a 0 50%, #e8b80c 0 75%, #1f9a4c 0)'], ...Object.entries(WIRE_COLORS)];
  for (const [k, v] of opts) {
    sw.append(el('button', {
      class: 'swatch' + (myBench.board.wireColor === k ? ' is-on' : ''), style: `--c:${v}`, title: k === 'auto' ? 'Automatic colours' : k, 'aria-label': k,
      onclick: (e) => { myBench.board.wireColor = k; $$('.swatch', sw).forEach(b => b.classList.toggle('is-on', b === e.currentTarget)); },
    }));
  }
  items.push(sw, el('p', { class: 'hint', style: 'margin-top:6px' }, 'Automatic: red for +5 V, black for GND, yellow for inputs, green for outputs.'));
  items.push(el('p', { class: 'parts-group' }, 'All chips'));
  for (const fam of FAMILIES) {
    const d = el('details', { class: 'side-group' }, el('summary', {}, fam, el('span', { class: 'count' }, String(Object.values(CHIPS).filter(c => c.family === fam).length))));
    d.append(el('div', { class: 'parts-grid', style: 'margin:4px 0 8px' }, ...Object.values(CHIPS).filter(c => c.family === fam).map(row)));
    items.push(d);
  }
  items.push(el('div', { class: 'keys', style: 'margin-top:16px' }, el('p', { class: 'parts-group' }, 'How to build'),
    el('dl', {},
      el('dt', {}, 'Wire'), el('dd', {}, 'drag from any hole, chip pin or terminal to another'),
      el('dt', {}, 'Remove'), el('dd', {}, 'right-click a wire or chip, or select and press Del'),
      el('dt', {}, 'Move chip'), el('dd', {}, 'drag it sideways'),
      el('dt', {}, el('kbd', {}, '1'), '–', el('kbd', {}, '8')), el('dd', {}, 'flip switches'),
      el('dt', {}, el('kbd', {}, 'Space')), el('dd', {}, 'hold pulser P1'),
      el('dt', {}, el('kbd', {}, 'Ctrl'), ' ', el('kbd', {}, 'Z')), el('dd', {}, 'undo'))));
  host.replaceChildren(...items);
}

// ------------------------------------------------------------------ practice: guided steps
function renderPracticeSteps() {
  const host = $('#mySteps');
  if (!exp) { host.replaceChildren(); return; }
  const r = exp.build();
  const t = myBench.trainer;
  const placed = (c) => t.chips.some(x => x.type === c.type && x.col === c.col);
  const doneW = r.wires.map(w => t.wires.some(x => myBench.board.sameConn(x, w)));
  const firstOpen = doneW.indexOf(false);
  const chipsDone = r.chips.every(placed);
  const total = r.chips.length + r.wires.length;
  const done = r.chips.filter(placed).length + doneW.filter(Boolean).length;
  if (ghostOn) { myBench.board.guide = { chips: r.chips, wires: r.wires, step: firstOpen }; myBench.board.renderGuide(); }
  const ghost = el('label', { class: 'hint', style: 'display:flex;gap:8px;align-items:center;cursor:pointer;margin:8px 0 12px' },
    el('input', { type: 'checkbox', checked: ghostOn, onchange: (e) => { ghostOn = e.target.checked; if (!ghostOn) { myBench.board.guide = null; myBench.board.renderGuide(); } renderPracticeSteps(); } }),
    'Show dashed outlines on my board');
  host.replaceChildren(
    el('h3', {}, 'Your progress'),
    el('div', { class: 'progress' }, el('span', { style: `width:${(done / total) * 100}%` })),
    el('p', { class: 'hint' }, done === total ? 'Everything is in place. Open the Check tab to test it.' : `${done} of ${total} done. The same steps as the reference; place them anywhere that matches.`),
    ghost,
    el('ol', { class: 'steps' },
      ...r.chips.map((c, i) => el('li', { class: placed(c) ? 'done' : !chipsDone ? 'now' : '' }, el('span', {}, `Place ${c.type} as U${i + 1}, pin 1 at hole f${c.col + 1}`))),
      ...r.wires.map((w, i) => el('li', { class: doneW[i] ? 'done' : chipsDone && i === firstOpen ? 'now' : '' }, el('span', {}, w.note ? el('strong', {}, w.note + ': ') : '', `${guideName(w.a, r.chips)} → ${guideName(w.b, r.chips)}`)))),
    el('p', { class: 'hint', style: 'margin-top:14px' }, 'Stuck? ', el('button', { class: 'btn btn--sm', onclick: copyReference }, 'Copy the reference onto my board')),
  );
}
function copyReference() {
  myBench.load(refData(exp), { fresh: false });
  colourWires(myBench);
  myBench.snapshot();
  myBench.board.focusBreadboard();
  toast('Reference copied. Ctrl+Z puts your own wiring back.');
}

// ------------------------------------------------------------------ practice: check
function renderIssues() {
  const list = myBench.trainer.result.issues;
  const serious = list.filter(i => i.level !== 'info').length;
  $('#issueBadge').hidden = !serious;
  $('#issueBadge').textContent = serious;
  for (const box of $$('#issueBox, #issueBoxF')) box.replaceChildren(list.length
    ? el('ul', { class: 'issue-list' }, ...list.map(i => el('li', { class: 'lvl-' + i.level }, i.text)))
    : el('p', { class: 'hint' }, myBench.trainer.chips.length ? 'No wiring problems spotted.' : 'Your board is empty.'));
}
function renderCheckPanel() {
  const host = $('#myCheck');
  host.replaceChildren(
    exp ? el('div', {},
      el('h3', {}, 'Test your circuit'),
      el('p', { class: 'hint' }, exp.fn ? 'Runs every input combination on your board and compares the outputs with the truth table.' : 'Power-cycles your board and runs the expected clock sequence.'),
      el('button', { class: 'btn btn--primary', onclick: () => runCheck() }, 'Check my circuit'),
      el('div', { id: 'checkOut' }),
    ) : null,
    el('p', { class: 'panel-label' }, 'What the trainer noticed'),
    el('div', { id: 'issueBox' }),
  );
  if (myBench.trainer.result) renderIssues();
}

function readPad(t, pad) { const v = t.result.read(pad); return v === null ? 'Z' : v; }
function evaluate(e, t) {
  const saved = { sw: t.switches.slice(), p: t.pulsers.slice(), c: t.clock, pw: t.power };
  t.power = true; t.clock = 0; t.pulsers = [0, 0];
  if (e.segMode) t.segMode = e.segMode;
  const rows = [];
  let pass = true;
  if (e.fn) {
    const k = e.inputs.length;
    for (let n = 0; n < (1 << k); n++) {
      const vars = {};
      e.inputs.forEach((inp, i) => { const bit = (n >> (k - 1 - i)) & 1; t.switches[inp.sw - 1] = bit; vars[inp.name] = bit; });
      t.solve();
      const want = e.fn(vars);
      const got = Object.fromEntries(e.outputs.map(o => [o.name, readPad(t, o.pad)]));
      const ok = e.outputs.every(o => got[o.name] === want[o.name]);
      if (!ok) pass = false;
      rows.push({ vars, want, got, ok });
    }
  } else {
    for (const c of t.chips) { c.state = {}; c.outs = {}; }
    t.solve();
    for (const s of e.script) {
      if (s.set) for (const [sw, v] of Object.entries(s.set)) t.switches[+sw - 1] = v;
      t.solve();
      if (s.pulse) { t.pulsers[0] = 1; t.solve(); t.pulsers[0] = 0; t.solve(); }
      const got = Object.fromEntries(e.outputs.map(o => [o.name, readPad(t, o.pad)]));
      const ok = e.outputs.every(o => got[o.name] === s.expect[o.name]);
      if (!ok) pass = false;
      rows.push({ note: s.note, want: s.expect, got, ok });
    }
  }
  t.switches = saved.sw; t.pulsers = saved.p; t.clock = saved.c; t.power = saved.pw;
  return { pass, rows };
}
function runCheck(outEl = $('#checkOut'), { mark = true } = {}) {
  const e = exp, t = myBench.trainer;
  myBench.stopClock();
  const { pass, rows } = evaluate(e, t);
  myBench.refresh();
  if (pass && mark) { markDone(e.id); drawSide(); }
  const bad = rows.filter(r => !r.ok).length;
  const first = t.result.issues.find(i => i.level !== 'info');
  const head = e.fn
    ? el('tr', {}, ...e.inputs.map(i => el('th', {}, i.name)), ...e.outputs.map(o => el('th', { class: 'out' }, o.name)))
    : el('tr', {}, el('th', {}, 'Step'), ...e.outputs.map(o => el('th', { class: 'out' }, o.name)));
  const body = rows.map(r => el('tr', { class: r.ok ? '' : 'bad' },
    ...(e.fn ? e.inputs.map(i => el('td', {}, String(r.vars[i.name]))) : [el('td', { class: 'note-cell' }, r.note)]),
    ...e.outputs.map(o => {
      const ok = r.got[o.name] === r.want[o.name];
      return el('td', { class: 'out' + (ok ? '' : ' miss') }, String(r.got[o.name]), ok ? '' : el('small', {}, ' want ' + r.want[o.name]));
    })));
  outEl.replaceChildren(
    el('div', { class: 'verdict ' + (pass ? 'pass' : 'fail') },
      el('strong', {}, pass ? 'Your circuit works' : `${bad} of ${rows.length} ${e.fn ? 'rows' : 'steps'} are wrong`),
      el('span', {}, pass ? 'Marked as done in the experiment list.' : first ? 'Start here: ' + first.text : 'Red cells show what your board did versus what it should do. Z means nothing drives that output.')),
    !pass && mode === 'practice' ? fixPanel(e, outEl) : null,
    el('div', { class: 'tt-wrap' }, el('table', { class: 'table tt' }, el('thead', {}, head), el('tbody', {}, ...body))),
  );
  return pass;
}

// ------------------------------------------------------------------ inspector + status
function showInspect(sel, bench, host) {
  const t = bench.trainer;
  if (!sel) return;
  if (sel.kind === 'chip') {
    const c = t.chips.find(x => x.id === sel.id);
    if (!c) return;
    const def = CHIPS[c.type];
    const lv = (p) => (c.powered ? t.result.read(pinHole(c, p)) : null);
    host.replaceChildren(
      el('h3', {}, `${c.ref} · ${c.type}`), el('p', { class: 'hint' }, def.name),
      el('p', { class: 'chip-state ' + (c.burnt ? 'bad' : c.powered ? 'ok' : 'warn') }, c.burnt ? 'Burnt out' : c.powered ? 'Powered. Live pin levels below.' : 'Not powered'),
      pinoutSVG(def, lv),
      pinRoles(def),
      bench.board.readonly ? null : el('button', { class: 'btn btn--sm', onclick: () => { bench.board.removeChip(c.id); host.replaceChildren(); } }, 'Remove chip'),
    );
    if (bench === refBench) refTab('inspect');
  } else if (sel.kind === 'wire') {
    const w = t.wires.find(x => x.id === sel.id);
    if (!w) return;
    const lv = t.result.read(w.a);
    host.replaceChildren(
      el('h3', {}, 'Wire'), el('p', {}, `${describePoint(w.a)} to ${describePoint(w.b)}`),
      el('p', {}, 'Level: ', el('strong', {}, lv === 1 ? 'HIGH' : lv === 0 ? 'LOW' : lv === 'X' ? 'conflict' : 'floating')),
      el('p', { class: 'panel-label' }, 'Colour'),
      el('div', { class: 'swatch-row' }, ...Object.entries(WIRE_COLORS).map(([k, v]) => el('button', {
        class: 'swatch' + (w.color === k ? ' is-on' : ''), style: `--c:${v}`, 'aria-label': k,
        onclick: () => { w.color = k; bench.refresh(); bench.snapshot(); showInspect(sel, bench, host); },
      }))),
      el('p', {}, el('button', { class: 'btn btn--sm', style: 'margin-top:12px', onclick: () => { bench.board.removeWire(w.id); host.replaceChildren(); } }, 'Remove wire')),
    );
  }
}
function hoverStatus({ point, chip }, bench, line) {
  const t = bench.trainer;
  if (!point && !chip) { line.textContent = ''; return; }
  if (point) {
    const lv = t.levelOfPoint(point);
    const occ = t.occupied().get(point);
    let what = describePoint(point);
    if (occ?.chip) what += ` — ${occ.chip.ref} pin ${occ.pin} (${CHIPS[occ.chip.type].names[occ.pin - 1]})`;
    const drv = t.result?.drivers.get(t.netOf(point));
    line.textContent = `${what} · ${lv === 1 ? 'HIGH' : lv === 0 ? 'LOW' : lv === 'X' ? 'CONFLICT' : 'floating'}${drv?.length ? ' · driven by ' + drv.map(d => d.src).join(', ') : ''}`;
  } else line.textContent = `${chip.ref}: ${chip.type} ${CHIPS[chip.type].name}${chip.powered ? '' : ' (no power)'}`;
}

// ------------------------------------------------------------------ keyboard
document.addEventListener('keydown', (e) => {
  if (e.target.matches('input, textarea, select')) return;
  const bench = view === 'reference' ? refBench : view === 'practice' || view === 'fault' ? myBench : null;
  if (!bench) return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && bench === myBench) { e.preventDefault(); e.shiftKey ? myBench.doRedo() : myBench.doUndo(); return; }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y' && bench === myBench) { e.preventDefault(); myBench.doRedo(); return; }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key >= '1' && e.key <= '8') { bench.toggleSwitch(+e.key - 1); return; }
  if (e.key === ' ' && !e.repeat) { e.preventDefault(); bench.trainer.pulsers[0] = 1; bench.refresh(); return; }
  if (e.key === 'Escape' && bench === myBench) { if (myBench.board.cancel()) $$('.part-row').forEach(b => b.setAttribute('aria-pressed', 'false')); return; }
  if ((e.key === 'Delete' || e.key === 'Backspace') && bench === myBench) myBench.board.deleteSelected();
});
document.addEventListener('keyup', (e) => {
  if (e.key !== ' ') return;
  for (const b of [refBench, myBench]) if (b.trainer.pulsers[0]) { b.trainer.pulsers[0] = 0; b.refresh(); }
});



// ------------------------------------------------------------------ practice board loading
function loadPracticeBoard() {
  myBench.storeKey = 'bn-dl-' + (exp ? exp.id : 'free');
  myBench.stopClock();
  if (!myBench.restoreStored()) myBench.load({ chips: [], wires: [], segMode: exp?.segMode || 'cc' });
  myBench.board.guide = null;
  myBench.board.focusWire = null;
  ghostOn = false;
  if (innerWidth < 760) myBench.board.focusBreadboard(); else myBench.board.fit();
  openShared();
}
async function openShared() {
  const data = await takeSharedCircuit();
  if (!data || !Array.isArray(data.chips)) return;
  const mine = myBench.trainer.serialize();
  if ((mine.chips.length || mine.wires.length) && !confirm('Open the shared circuit? It replaces what is on your board now (Undo brings yours back).')) return;
  myBench.load(data, { fresh: false });
  toast('Opened a shared circuit. It is saved on this device now.', 'ok');
}
function leavePractice() {
  mode = 'practice';
  $('[data-mt="logic"]').hidden = false;
  $('[data-mt="task"]').hidden = true;
  $('[data-mt="steps"]').hidden = !exp;
  $('[data-mt="check"]').hidden = false;
  $('#split').classList.toggle('ref-hidden', !exp);
  $('#showRef').hidden = true;
  $('#hideRef').hidden = !exp;
  loadPracticeBoard();
  renderPracticeSteps();
  renderCheckPanel();
  myTab(exp ? 'steps' : 'parts');
}

// ------------------------------------------------------------------ find the fault
const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const GATE_SWAP = ['7400', '7408', '7432', '7486'];
function makeFault(e) {
  const base = refData(e);
  const isPower = (w) => /supply|VCC|GND/.test(w.note || '');
  const signal = base.wires.map((w, i) => i).filter(i => !isPower(base.wires[i]));
  const kinds = [];
  for (const i of signal) {
    kinds.push(() => {
      const d = structuredClone(base); const w = d.wires.splice(i, 1)[0];
      return { data: d, ghost: w, text: `A wire is missing: ${w.note ? w.note + ', ' : ''}${describePoint(w.a)} to ${describePoint(w.b)}.` };
    });
    kinds.push(() => {
      const d = structuredClone(base); const w = d.wires[i];
      const end = parsePoint(w.b).kind === 'hole' ? 'b' : parsePoint(w.a).kind === 'hole' ? 'a' : null;
      if (!end) return null;
      const p = parsePoint(w[end]);
      if (/^(tp|tn|bp|bn)$/.test(p.row)) return null;
      const used = new Set(d.wires.flatMap(x => [x.a, x.b]));
      for (const dc of shuffle([1, -1])) {
        const h = holeId(p.row, p.col + dc);
        if (p.col + dc < 0 || used.has(h) || baseNode(h) === baseNode(w[end])) continue;
        const right = w[end];
        w[end] = h;
        return { data: d, wireIndex: i, text: `${w.note ? w.note + ': ' : 'A wire '}one end is in hole ${h}, one column off. It belongs in the strip of ${right}.` };
      }
      return null;
    });
  }
  base.wires.forEach((w, i) => {
    if (!/VCC|GND/.test(w.note || '')) return;
    kinds.push(() => { const d = structuredClone(base); d.wires.splice(i, 1); return { data: d, ghost: w, text: `${w.note.replace(' VCC', ' has no VCC').replace(' GND', ' has no ground')}: the wire ${describePoint(w.a)} to ${describePoint(w.b)} is missing.` }; });
  });
  base.chips.forEach((c, i) => {
    if (!GATE_SWAP.includes(c.type)) return;
    kinds.push(() => {
      const d = structuredClone(base); const wrong = shuffle(GATE_SWAP.filter(x => x !== c.type))[0];
      d.chips[i].type = wrong;
      return { data: d, text: `${c.ref || 'U' + (i + 1)} is a ${wrong}, but this circuit needs a ${c.type}. Same pinout, wrong gate.` };
    });
  });
  for (const k of shuffle(kinds)) {
    const f = k();
    if (!f) continue;
    const t = new Trainer();
    t.load(f.data);
    t.power = true;
    if (!evaluate(e, t).pass) return f;
  }
  return null;
}
function enterFault() {
  mode = 'fault';
  $('[data-mt="logic"]').hidden = true;
  myBench.storeKey = null;
  $('#split').classList.add('ref-hidden');
  $('#showRef').hidden = false;
  $('[data-mt="steps"]').hidden = true;
  $('[data-mt="check"]').hidden = true;
  const tab = $('[data-mt="task"]');
  tab.hidden = false;
  tab.textContent = 'Fault';
  newFault();
  myTab('task');
}
function newFault() {
  fault = makeFault(exp);
  myBench.board.guide = null;
  myBench.board.focusWire = null;
  if (fault) { myBench.load(fault.data); colourWires(myBench); myBench.board.fit(); }
  renderFaultPanel();
}
function renderFaultPanel() {
  const host = $('#myTask');
  if (!fault) { host.replaceChildren(el('p', { class: 'hint' }, 'This circuit is too small to hide a fault in. Try another example.')); return; }
  const out = el('div');
  const reveal = el('div');
  host.replaceChildren(
    el('h3', {}, 'Something on this board is wrong'),
    el('p', { class: 'hint' }, 'The circuit was wired correctly and then one thing was broken: a missing wire, a wire one hole off, a chip without power or the wrong chip. Test it with the switches and the logic probe, find the fault, fix it, then press Check.'),
    el('div', { class: 'mode-actions' },
      el('button', { class: 'btn btn--primary', onclick: () => { if (runCheck(out, { mark: false })) out.prepend(el('p', { class: 'mode-win' }, 'Fault found and fixed.')); } }, 'Check'),
      el('button', { class: 'btn', onclick: () => {
        reveal.replaceChildren(el('div', { class: 'note' }, el('strong', {}, 'The fault: '), fault.text));
        if (fault.ghost) { myBench.board.guide = { chips: [], wires: [fault.ghost], step: 0 }; myBench.board.renderGuide(); }
        if (fault.wireIndex != null) { myBench.board.focusWire = myBench.trainer.wires[fault.wireIndex]?.id; myBench.board.render(); }
      } }, 'Show me'),
      el('button', { class: 'btn btn--ghost', onclick: newFault }, 'New fault')),
    reveal, out,
    el('details', { class: 'hint-box' }, el('summary', {}, 'Hint: what the trainer noticed'), el('div', { id: 'issueBoxF' })),
  );
  renderIssues();
}

// ------------------------------------------------------------------ lab exam practice
function stopExamTimer() { if (examTimer) { clearInterval(examTimer); examTimer = null; } }
function openExam() {
  const e = EXPERIMENTS[Math.floor(Math.random() * EXPERIMENTS.length)];
  open(e, 'practice');
  mode = 'exam';
  $('#tabs').hidden = true;
  $('[data-mt="logic"]').hidden = true;
  $('#crumbGroup').textContent = 'Lab exam practice';
  $('#title').textContent = 'Lab exam practice';
  $('#aim').textContent = 'A random experiment, an empty board and a clock. Build it without the reference, then submit.';
  $('#split').classList.add('ref-hidden');
  $('#showRef').hidden = true; $('#hideRef').hidden = true;
  myBench.storeKey = null;
  myBench.load({ chips: [], wires: [], segMode: e.segMode || 'cc' });
  myBench.board.fit();
  $('[data-mt="steps"]').hidden = true;
  $('[data-mt="check"]').hidden = true;
  const tab = $('[data-mt="task"]');
  tab.hidden = false;
  tab.textContent = 'Task';
  renderExamPanel(e);
  myTab('task');
  drawSide();
  $('#examBtn').classList.add('is-active');
  $('#freeBtn').classList.remove('is-active');
  $('#saveState').textContent = '';
  history.replaceState(null, '', '?exam=1');
}
function renderExamPanel(e) {
  const host = $('#myTask');
  const clock = el('div', { class: 'exam-clock' }, '20:00');
  const minutes = el('select', { class: 'input exam-min', 'aria-label': 'Time limit' }, ...[10, 15, 20, 30, 45].map(m => el('option', { value: m, selected: m === 20 }, `${m} min`)));
  const result = el('div');
  const chips = [...new Set(e.build().chips.map(c => c.type))];
  const startBtn = el('button', { class: 'btn btn--primary', onclick: () => {
    stopExamTimer();
    examLimit = +minutes.value * 60; examStart = Date.now();
    startBtn.textContent = 'Restart timer';
    examTimer = setInterval(() => {
      const left = Math.max(0, examLimit - (Date.now() - examStart) / 1000);
      clock.textContent = `${String(Math.floor(left / 60)).padStart(2, '0')}:${String(Math.floor(left % 60)).padStart(2, '0')}`;
      clock.classList.toggle('low', left < 60);
      if (!left) { stopExamTimer(); submit(true); }
    }, 250);
  } }, 'Start timer');
  function submit(timeUp) {
    stopExamTimer();
    const used = examStart ? Math.round((Date.now() - examStart) / 1000) : null;
    const pass = runCheck(result, { mark: false });
    result.prepend(el('div', { class: 'exam-score ' + (pass ? 'pass' : 'fail') },
      el('strong', {}, timeUp ? (pass ? 'Time up, but it works' : 'Time is up') : pass ? 'Pass' : 'Not working yet'),
      el('span', {}, used != null ? `Time used: ${Math.floor(used / 60)} min ${used % 60} s.` : 'The timer was not running.'),
      el('button', { class: 'btn btn--sm', onclick: () => open(e, 'reference') }, 'See the reference build')));
  }
  host.replaceChildren(
    el('div', { class: 'exam-head' }, clock, minutes, startBtn),
    el('div', { class: 'task-card' },
      el('p', { class: 'panel-label', style: 'margin-top:0' }, 'Your task'),
      el('h3', {}, e.title),
      el('p', {}, e.aim),
      el('p', { class: 'panel-label' }, 'Connections'),
      el('table', { class: 'table' }, el('tbody', {},
        ...e.inputs.map(i => el('tr', {}, el('td', { class: 'mono' }, 'S' + i.sw), el('td', {}, i.name + ' (input)'))),
        ...e.outputs.map(o => el('tr', {}, el('td', { class: 'mono' }, padLabel(o.pad)), el('td', {}, o.name + ' (output)'))))),
      el('p', { class: 'hint' }, `Chips available: ${chips.join(', ')}. Pinouts are in the Parts tab and in Breadboard basics.`)),
    el('div', { class: 'mode-actions' },
      el('button', { class: 'btn btn--primary', onclick: () => submit(false) }, 'Submit'),
      el('button', { class: 'btn btn--ghost', onclick: openExam }, 'New task'),
      el('button', { class: 'btn btn--ghost', onclick: () => open(null, 'practice') }, 'Leave exam')),
    result,
  );
}
$('#examBtn').addEventListener('click', openExam);

// ------------------------------------------------------------------ auto-correct
function fixPanel(e, outEl) {
  const list = el('div');
  const show = () => {
    const t = myBench.trainer, d = diagnose(e.build(), t);
    const items = [
      ...d.missingChips.map(c => `Add a ${c.type} (${CHIPS[c.type].name}). The reference has it with pin 1 at hole f${c.col + 1}.`),
      ...d.wrong.map(w => `Remove the wire ${describePoint(w.a)} → ${describePoint(w.b)}. It connects points that should not be joined.`),
      ...d.missing.map(m => `Add a wire: ${describeNode(m.a, t)} → ${describeNode(m.b, t)}${m.note ? ` (${m.note})` : ''}.`),
    ];
    const ids = new Set(d.wrong.map(w => w.id));
    myBench.board.focusWire = d.wrong[0]?.id || null;
    myBench.board.render();
    list.replaceChildren(items.length
      ? el('ol', { class: 'fix-list' }, ...items.map(t => el('li', {}, t)))
      : el('p', { class: 'hint' }, 'The wiring matches the reference. Check chip orientation, the power switch and the switch settings.'));
    void ids;
  };
  return el('div', { class: 'fix-box' },
    el('p', { class: 'fix-head' }, 'Stuck? The trainer can compare your wiring with the reference.'),
    el('div', { class: 'mode-actions', style: 'margin:6px 0' },
      el('button', { class: 'btn btn--sm', onclick: show }, 'Show what is wrong'),
      el('button', { class: 'btn btn--sm btn--primary', onclick: () => {
        const n = autoFix(e.build(), myBench.trainer, (a, b) => myBench.board.autoColor(a, b));
        myBench.board.focusWire = null;
        myBench.refresh(); myBench.snapshot();
        toast(n ? `Made ${n} change${n > 1 ? 's' : ''}. Ctrl+Z undoes them.` : 'Nothing to fix in the wiring.', n ? 'ok' : '');
        runCheck(outEl);
      } }, 'Fix it for me')),
    list);
}

// ------------------------------------------------------------------ logic helper (expression → K-map → wired board)
const logic = { n: 3, text: '' };
const olbHTML = (t) => t.replace(/([A-Z])′/g, '<span class="olb">$1</span>');
function solveLogic() {
  const names = 'ABCD'.slice(0, logic.n).split('');
  const t = logic.text.trim();
  if (!t) return { names, empty: true };
  let ones = [], dcs = [];
  if (/^[\dΣmM(),\s+d]+$/.test(t) && /\d/.test(t)) ({ list: ones, dcs } = parseIndexList(t, 1 << logic.n));
  else {
    const used = [...new Set(t.toUpperCase().match(/[A-Z]/g) || [])];
    const extra = used.filter(v => !names.includes(v));
    if (extra.length) throw new Error(`Use the variables ${names.join(', ')} (or pick more variables). ${extra.join(', ')} is not one of them.`);
    ones = truthFromExpr(t, names).values.map((v, i) => (v ? i : -1)).filter(i => i >= 0);
  }
  return { names, ones, dcs, sol: solveFunction(logic.n, ones, dcs, names) };
}
function renderLogicPanel() {
  const host = $('#myLogic');
  if (!host) return;
  const input = el('input', { class: 'input mono', value: logic.text, spellcheck: 'false', placeholder: "A'B + BC   or   1, 3, 5, 7  d(2)", 'aria-label': 'Expression or minterms' });
  const out = el('div', { class: 'lg-out' });
  const seg = el('div', { class: 'seg' }, ...[2, 3, 4].map(k => el('button', { 'aria-pressed': String(logic.n === k), onclick: (e) => { logic.n = k; [...seg.children].forEach(b => b.setAttribute('aria-pressed', String(b === e.currentTarget))); update(); renderKeys(); } }, `${k} inputs`)));
  const keys = el('div', { class: 'lg-keys' });
  const ins = (v) => { const a = input.selectionStart ?? input.value.length; input.value = input.value.slice(0, a) + v + input.value.slice(input.selectionEnd ?? a); input.focus(); input.setSelectionRange(a + v.length, a + v.length); logic.text = input.value; update(); };
  function renderKeys() {
    keys.replaceChildren(...'ABCD'.slice(0, logic.n).split('').map(v => el('button', { class: 'kp var', type: 'button', onclick: () => ins(v) }, v)),
      ...[["'", "'"], ['+', ' + '], ['(', '('], [')', ')']].map(([l, v]) => el('button', { class: 'kp', type: 'button', onclick: () => ins(v) }, l)),
      el('button', { class: 'kp kp--muted', type: 'button', onclick: () => { input.value = input.value.slice(0, -1); logic.text = input.value; update(); } }, '⌫'));
  }
  function update() {
    let r;
    try { r = solveLogic(); } catch (e) { out.replaceChildren(el('p', { class: 'expr-msg err' }, e.message)); return; }
    if (r.empty) { out.replaceChildren(el('p', { class: 'hint' }, 'Type a Boolean expression or a list of minterms. The minimal form appears here, and one click wires it on your board.')); return; }
    const { names, ones, dcs, sol } = r;
    // compact K-map
    const G = [0, 1, 3, 2];
    const rb = logic.n >= 3 ? (logic.n === 4 ? 2 : 1) : 1, cb = logic.n - rb;
    const rowsG = rb === 1 ? [0, 1] : G, colsG = cb === 1 ? [0, 1] : G;
    const bits = (v, k) => v.toString(2).padStart(k, '0');
    const kmap = el('table', { class: 'lg-kmap' },
      el('thead', {}, el('tr', {}, el('th', {}, names.slice(0, rb).join('') + '\\' + names.slice(rb).join('')), ...colsG.map(c => el('th', {}, bits(c, cb))))),
      el('tbody', {}, ...rowsG.map(rw => el('tr', {}, el('th', {}, bits(rw, rb)), ...colsG.map(c => { const m = (rw << cb) | c; const v = ones.includes(m) ? '1' : dcs.includes(m) ? 'X' : '0'; return el('td', { class: 'v' + v }, v); })))));
    const terms = (sol.sop.solutions[0] || []).map(i => { const p = sol.sop.pis[i]; const t = []; for (let k = 0; k < logic.n; k++) { const bit = 1 << (logic.n - 1 - k); if (!(p.mask & bit)) t.push({ v: k, neg: !(p.value & bit) }); } return t; });
    const build = (style) => {
      const res = buildLogic({ terms, n: logic.n, constant: sol.sop.constant, style });
      if (res.error) { toast(res.error, 'bad'); return; }
      const t = myBench.trainer;
      if ((t.chips.length || t.wires.length) && !confirm('Replace what is on your board with this circuit? Ctrl+Z brings your board back.')) return;
      myBench.load({ chips: res.chips.map((c, i) => ({ ...c, ref: 'U' + (i + 1) })), wires: res.wires.map(w => ({ a: w.a, b: w.b, color: 'blue' })), segMode: t.segMode }, { fresh: false });
      colourWires(myBench);
      myBench.snapshot();
      myBench.board.fit();
      toast(`Wired with ${res.chips.length} chip${res.chips.length > 1 ? 's' : ''}. Flip ${names.map((v, i) => 'S' + (i + 1)).join(', ')} and watch L1.`, 'ok');
    };
    out.replaceChildren(
      el('div', { class: 'lg-res' },
        el('p', {}, el('span', { class: 'lg-k' }, 'SOP'), el('span', { class: 'lg-e', html: 'F = ' + olbHTML(sol.sopText[0] ?? '0') })),
        el('p', {}, el('span', { class: 'lg-k' }, 'POS'), el('span', { class: 'lg-e', html: 'F = ' + olbHTML(sol.posText[0] ?? '1') })),
        el('p', { class: 'hint' }, `Σm(${ones.join(', ') || '—'})${dcs.length ? ` + d(${dcs.join(', ')})` : ''}`)),
      kmap,
      el('p', { class: 'panel-label' }, 'Put it on the breadboard'),
      el('p', { class: 'hint' }, `Inputs ${names.map((v, i) => `${v} = S${i + 1}`).join(', ')}; output F = L1.`),
      el('div', { class: 'mode-actions' },
        el('button', { class: 'btn btn--primary btn--sm', onclick: () => build('andor') }, 'Wire it (AND–OR)'),
        el('button', { class: 'btn btn--sm', onclick: () => build('nand') }, 'Wire it (NAND only)')),
      el('a', { class: 'lg-link', href: `kmap.html#n=${logic.n}&v=${names.join('')}&m=${ones.join('.')}&d=${dcs.join('.')}` }, 'Open in the full K-map solver (groups and working)'),
    );
  }
  input.addEventListener('input', () => { logic.text = input.value; update(); });
  renderKeys();
  host.replaceChildren(
    el('h3', {}, 'Logic helper'),
    el('p', { class: 'hint' }, 'Simplify a function and wire it, without leaving the board.'),
    seg, el('div', { style: 'height:10px' }), input, keys, out);
  update();
}

// ------------------------------------------------------------------ boot
(function boot() {
  const q = new URLSearchParams(location.search);
  const e = EXPERIMENTS.find(x => x.id === q.get('exp'));
  const v = q.get('view');
  if (q.get('exam')) openExam();
  else if (e) open(e, ['overview', 'reference', 'practice', 'fault'].includes(v) ? v : 'overview');
  else open(null, 'practice'); // the free breadboard is the front door
})();
