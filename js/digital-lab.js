import { mountChrome, toast, $, $$, el } from './shared/site.js';
import { renderSide, bindSideToggle, markDone, DIGITAL_TOOLS } from './shared/lab-side.js';
import { CHIPS, FAMILIES } from './digital/chips.js';
import { describePoint, parsePoint, pinHole, PADS } from './digital/model.js';
import { WIRE_COLORS } from './digital/board.js';
import { DigitalBench, benchToolbar } from './digital/bench.js';
import { EXPERIMENTS } from './digital/experiments.js';
import { pinoutSVG, pinRoles } from './digital/pinout.js';

mountChrome('digital');
bindSideToggle();

let exp = null;           // current experiment, null = free build
let view = 'overview';
let refSteps = [];
let stepIndex = 0;
let ghostOn = false;
let stepTimer = null;

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
  $('#saveState').textContent = 'saved on this device';
}

// ------------------------------------------------------------------ sidebar
const sideItems = EXPERIMENTS.map(e => ({ id: e.id, title: e.title, group: e.group, sub: [...new Set(e.build().chips.map(c => c.type))].join(' + ') }));
function drawSide() {
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
  $$('[data-pane]').forEach(p => { p.hidden = p.dataset.pane !== v; });
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
  // practice bench
  myBench.storeKey = 'bn-dl-' + (e ? e.id : 'free');
  myBench.stopClock();
  if (!myBench.restoreStored()) myBench.load({ chips: [], wires: [], segMode: e?.segMode || 'cc' });
  myBench.board.guide = null;
  ghostOn = false;
  myBench.board.fit();
  renderParts();
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
  const box = $('#issueBox');
  if (!box) return;
  box.replaceChildren(list.length
    ? el('ul', { class: 'issue-list' }, ...list.map(i => el('li', { class: 'lvl-' + i.level }, i.text)))
    : el('p', { class: 'hint' }, myBench.trainer.chips.length ? 'No wiring problems spotted.' : 'Your board is empty.'));
}
function renderCheckPanel() {
  const host = $('#myCheck');
  host.replaceChildren(
    exp ? el('div', {},
      el('h3', {}, 'Test your circuit'),
      el('p', { class: 'hint' }, exp.fn ? 'Runs every input combination on your board and compares the outputs with the truth table.' : 'Power-cycles your board and runs the expected clock sequence.'),
      el('button', { class: 'btn btn--primary', onclick: runCheck }, 'Check my circuit'),
      el('div', { id: 'checkOut' }),
    ) : null,
    el('p', { class: 'panel-label' }, 'What the trainer noticed'),
    el('div', { id: 'issueBox' }),
  );
  if (myBench.trainer.result) renderIssues();
}

function readPad(t, pad) { const v = t.result.read(pad); return v === null ? 'Z' : v; }
function runCheck() {
  const e = exp, t = myBench.trainer;
  myBench.stopClock();
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
  myBench.refresh();
  if (pass) { markDone(e.id); drawSide(); }
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
  $('#checkOut').replaceChildren(
    el('div', { class: 'verdict ' + (pass ? 'pass' : 'fail') },
      el('strong', {}, pass ? 'Your circuit works' : `${bad} of ${rows.length} ${e.fn ? 'rows' : 'steps'} are wrong`),
      el('span', {}, pass ? 'Marked as done in the experiment list.' : first ? 'Start here: ' + first.text : 'Red cells show what your board did versus what it should do. Z means nothing drives that output.')),
    el('div', { class: 'tt-wrap' }, el('table', { class: 'table tt' }, el('thead', {}, head), el('tbody', {}, ...body))),
  );
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
  const bench = view === 'reference' ? refBench : view === 'practice' ? myBench : null;
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

// ------------------------------------------------------------------ boot
(function boot() {
  const q = new URLSearchParams(location.search);
  const e = EXPERIMENTS.find(x => x.id === q.get('exp'));
  const v = q.get('view');
  if (e) open(e, ['overview', 'reference', 'practice'].includes(v) ? v : 'overview');
  else open(null, 'practice'); // the free breadboard is the front door
})();
