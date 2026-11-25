import { mountChrome, toast, $, $$, el, fmtSI, parseSI } from './shared/site.js';
import { renderSide, bindSideToggle, markDone } from './shared/lab-side.js';
import { AnalogBench, aBenchToolbar } from './analog/abench.js';
import { AnalogTrainer, PARTS, LED_RGB, partLabel, partKey, describePoint, fingerprint, DEFAULT_SETTINGS, parsePoint } from './analog/atrainer.js';
import { AWIRE_COLORS } from './analog/aboard.js';
import { AEXPERIMENTS } from './analog/aexperiments.js';
import { renderSchematic } from './analog/schematic.js';

mountChrome('analog');
bindSideToggle();

let exp = null;
let view = 'overview';
let refSteps = [], stepIndex = 0, stepTimer = null;
let records = [];

const notify = (m, k) => toast(m, k);
const refBench = new AnalogBench($('#refHost'), {
  readonly: true, notify,
  onSelect: (sel, b) => { if (sel?.kind === 'part') { inspect(sel, b, $('#refInspect')); refTab('inspect'); } },
  onHover: (h, b) => hoverStatus(h, b, $('#refStatus')),
  onChange: (b, why) => { if (why === 'tick') { liveMeters(b, $('#refTry')); drawScope(b, $('#refScope canvas')); } },
});
const miniBench = new AnalogBench($('#miniHost'), { readonly: true, notify });
const myBench = new AnalogBench($('#myHost'), {
  notify,
  onSelect: (sel, b) => {
    if (sel?.kind === 'placed') { $$('.part-row').forEach(x => x.setAttribute('aria-pressed', 'false')); return; }
    if (sel) { inspect(sel, b, $('#myInspectBox')); myTab('parts'); }
  },
  onHover: (h, b) => hoverStatus(h, b, $('#myStatus')),
  onChange: (b, why) => {
    if (why === 'tick') { liveMeters(b, $('#myMeters')); drawScope(b, $('#myScope canvas')); renderIssues(); return; }
    if (why !== 'settings') { renderPracticeSteps(); renderIssues(); $('#saveState').textContent = 'saved on this device'; }
  },
});
$('#refTools').append(aBenchToolbar(refBench, { editable: false }));
$('#myTools').append(aBenchToolbar(myBench, { editable: true }));

// ------------------------------------------------------------------ sidebar / tabs
const sideItems = AEXPERIMENTS.map(e => ({ id: e.id, title: e.title, group: e.group, sub: bomShort(e) }));
function bomShort(e) {
  const kinds = [...new Set(e.parts.map(p => ({ R: 'R', C: 'C', CE: 'C', L: 'L', D: 'diode', LED: 'LED', Z: 'Zener', NPN: 'BJT', PNP: 'BJT', OA: '741' }[p.type])))];
  return kinds.join(', ');
}
function drawSide() {
  renderSide({ host: $('#expList'), items: sideItems, activeId: exp?.id, filter: $('#search').value, onPick: (i) => open(AEXPERIMENTS.find(e => e.id === i.id)) });
  $('#freeBtn').classList.toggle('is-active', !exp);
}
$('#search').addEventListener('input', drawSide);
$('#freeBtn').addEventListener('click', () => open(null, 'practice'));
$$('#tabs [data-view]').forEach(b => b.addEventListener('click', () => setView(b.dataset.view)));
function setView(v) {
  if (!exp && v !== 'practice') v = 'practice';
  view = v;
  $$('#tabs [data-view]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.view === v)));
  $$('[data-pane]').forEach(p => { p.hidden = p.dataset.pane !== v; });
  if (v !== 'reference') stopPlay();
  const q = new URLSearchParams();
  if (exp) q.set('exp', exp.id); else q.set('free', '1');
  if (v !== 'overview') q.set('view', v);
  history.replaceState(null, '', '?' + q);
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

// ------------------------------------------------------------------ open
const refData = (e) => ({ parts: e.parts, wires: e.wires.map(w => ({ ...w })), settings: { ...DEFAULT_SETTINGS(), ...structuredClone(e.settings) } });
function colour(bench) { bench.t.wires.forEach(w => { w.color = bench.board.autoColor(w.a, w.b); }); bench.board.render(); }

function open(e, wantView) {
  exp = e;
  stopPlay();
  records = [];
  drawSide();
  $('#side').classList.remove('is-open');
  const tabs = $('#tabs');
  tabs.querySelector('[data-view="overview"]').hidden = !e;
  tabs.querySelector('[data-view="reference"]').hidden = !e;
  if (!e) {
    $('#crumbGroup').textContent = 'Free build';
    $('#title').textContent = 'Free build';
    $('#aim').textContent = 'An empty analog trainer. Place parts from the Parts tab, wire them to the supply and instruments, and watch the meters and scope.';
    $('#split').classList.add('ref-hidden');
    $('#showRef').hidden = true; $('#hideRef').hidden = true;
  } else {
    $('#crumbGroup').textContent = e.group;
    $('#title').textContent = e.title;
    $('#aim').textContent = e.aim;
    $('#split').classList.remove('ref-hidden');
    $('#showRef').hidden = true; $('#hideRef').hidden = false;
    renderOverview(e);
    refSteps = buildSteps(e);
    refBench.setWindow(e.window);
    setStep(refSteps.length);
    miniBench.setWindow(e.window);
    miniBench.load(refData(e));
    colour(miniBench);
    miniBench.board.fit();
    renderInstruments(refBench, $('#refTry'), e.controls, true);
    renderScopePanel($('#refScope'));
  }
  myBench.storeKey = 'bn-al-' + (e ? e.id : 'free');
  myBench.setWindow(e ? e.window : 0.01);
  if (!myBench.restoreStored()) myBench.load({ parts: [], wires: [], settings: e ? { ...DEFAULT_SETTINGS(), ...structuredClone(e.settings) } : DEFAULT_SETTINGS() });
  myBench.board.fit();
  renderParts();
  renderPracticeSteps();
  renderInstruments(myBench, $('#myMeters'), e ? null : null, false);
  renderScopePanel($('#myScope'));
  renderCheckPanel();
  document.querySelector('[data-mt="steps"]').hidden = !e;
  myTab(e ? 'steps' : 'parts');
  refTab('steps');
  setView(wantView || (e ? 'overview' : 'practice'));
}

// ------------------------------------------------------------------ overview
const PART_NAMES = { R: 'resistor', C: 'ceramic capacitor', CE: 'electrolytic capacitor', L: 'inductor', D: 'diode 1N4007', LED: 'LED', Z: 'Zener diode', NPN: 'NPN transistor BC547', PNP: 'PNP transistor BC557', OA: 'op-amp µA741' };
function bom(e) {
  const map = new Map();
  for (const p of e.parts) {
    const label = p.type === 'R' || p.type === 'C' || p.type === 'CE' || p.type === 'L' ? `${partLabel({ ...p, value: p.value })} ${PART_NAMES[p.type]}` : p.type === 'LED' ? `${p.color} LED` : p.type === 'Z' ? `${p.value} V Zener diode` : PART_NAMES[p.type];
    map.set(label, (map.get(label) || 0) + 1);
  }
  return [...map].map(([k, n]) => `${n} × ${k}`);
}
const INSTR = { var1: 'VAR 1', var2: 'VAR 2', fg: 'function generator', cc: 'current source', pot: 'potentiometer', s1: 'switch S1', s2: 'switch S2' };
function settingText(e) {
  const s = e.settings, out = [];
  if (s.var1 != null && e.wires.some(w => w.a === 'var1' || w.b === 'var1')) out.push(`VAR 1 = ${s.var1} V`);
  if (s.var2 != null && e.wires.some(w => w.a === 'var2' || w.b === 'var2')) out.push(`VAR 2 = ${s.var2} V`);
  if (e.wires.some(w => w.a === 'p12')) out.push('±12 V on for the op-amp');
  if (s.fg) out.push(`function generator: ${s.fg.wave}, ${fmtSI(s.fg.freq, 'Hz')}, ${s.fg.amp} V peak${s.fg.offset ? `, offset ${s.fg.offset} V` : ''}`);
  if (s.cc != null) out.push(`current source = ${(s.cc * 1000).toFixed(2)} mA`);
  if (s.pot) out.push(`potentiometer at ${fmtSI(s.pot.r * (1 - s.pot.pos), 'Ω')} (terminals 1–W)`);
  return out;
}
function renderOverview(e) {
  const host = $('#overview');
  const uses = (id) => e.wires.some(w => w.a === id || w.b === id);
  const instruments = ['dmmV', 'a1in', 'a2in', 'ch1', 'ch2'].filter(uses).map(id => ({ dmmV: 'multimeter', a1in: 'ammeter A1', a2in: 'ammeter A2', ch1: 'scope CH1', ch2: 'scope CH2' }[id]));
  host.replaceChildren(el('div', { class: 'ov' },
    el('div', {},
      el('div', { class: 'ov-card' }, el('h2', {}, 'Aim'), el('p', {}, e.aim)),
      el('div', { class: 'ov-card' }, el('h2', {}, 'Theory'), el('div', { html: e.theory })),
      el('div', { class: 'ov-card' }, el('h2', {}, 'Procedure'), el('ol', {},
        el('li', {}, 'With the power off, place the components on the breadboard as in the reference build.'),
        el('li', {}, 'Wire the supply and ground to the rails, then complete the circuit.'),
        el('li', {}, `Connect the ${instruments.join(', ') || 'instruments'}.`),
        el('li', {}, `Set ${settingText(e).join('; ') || 'the instruments'}.`),
        el('li', {}, e.record ? 'Switch on, vary the source as described and record each reading in the observation table (Instruments tab).' : 'Switch on and observe the waveforms on the scope.'),
        el('li', {}, 'Compare your results with the expected values below.'))),
      el('div', { class: 'ov-card' }, el('h2', {}, 'Expected result'), el('p', {}, e.expect)),
      el('div', { class: 'ov-cta' },
        el('button', { class: 'btn btn--primary', onclick: () => setView('reference') }, 'See it wired'),
        el('button', { class: 'btn', onclick: () => setView('practice') }, 'Build it yourself')),
    ),
    el('div', {},
      el('div', { class: 'ov-card' }, el('h2', {}, 'Circuit diagram'), renderSchematic(e.schematic)),
      el('div', { class: 'ov-card' }, el('h2', {}, 'Components'), el('ul', {}, ...bom(e).map(t => el('li', {}, t)))),
      el('div', { class: 'ov-card' }, el('h2', {}, 'Precautions'), el('ul', {},
        el('li', {}, 'Wire with the supply off and check polarity before switching on.'),
        el('li', {}, 'Electrolytic capacitors and diodes are polarised: the + lead and the cathode band must face the right way.'),
        el('li', {}, 'An ammeter goes in series with the branch; the multimeter goes across the part.'),
        el('li', {}, 'Never connect a supply terminal straight to ground.'))),
    ),
  ));
}

// ------------------------------------------------------------------ reference steps
function stepText(item, e) {
  if (item.kind === 'part') {
    const p = item.p;
    if (p.type === 'OA') return `Place the µA741 across the channel with pin 1 at hole f${p.col + 1}`;
    if (p.type === 'NPN' || p.type === 'PNP') return `Place the ${PART_NAMES[p.type]} with C, B, E in holes ${p.holes.join(', ')}`;
    const pol = { CE: ' (+ lead first)', D: ' (anode first)', LED: ' (anode, the long leg, first)', Z: ' (anode first, band to the cathode)' }[p.type] || '';
    return `Place ${partLabel(p)} ${PART_NAMES[p.type]} from ${p.holes[0]} to ${p.holes[1]}${pol}`;
  }
  return `Wire ${describePoint(item.w.a)} → ${describePoint(item.w.b)}`;
}
function buildSteps(e) {
  return [...e.parts.map(p => ({ kind: 'part', p })), ...e.wires.map(w => ({ kind: 'wire', w }))].map(it => ({ ...it, text: stepText(it, e) }));
}
function setStep(k) {
  stepIndex = Math.max(0, Math.min(refSteps.length, k));
  const shown = refSteps.slice(0, stepIndex);
  refBench.load({ parts: shown.filter(s => s.kind === 'part').map(s => s.p), wires: shown.filter(s => s.kind === 'wire').map(s => ({ ...s.w })), settings: { ...DEFAULT_SETTINGS(), ...structuredClone(exp.settings) } });
  colour(refBench);
  const last = shown[shown.length - 1];
  refBench.board.focusIds = new Set();
  if (last && stepIndex < refSteps.length) {
    const t = refBench.t;
    const id = last.kind === 'part' ? t.parts[t.parts.length - 1]?.id : t.wires[t.wires.length - 1]?.id;
    if (id) refBench.board.focusIds.add(id);
  }
  refBench.board.render();
  if (stepIndex === refSteps.length || stepIndex === 0) refBench.board.fit();
  renderRefSteps();
}
function renderRefSteps() {
  const host = $('#refSteps');
  const N = refSteps.length;
  const range = el('input', { type: 'range', min: 0, max: N, value: stepIndex, 'aria-label': 'Wiring step' });
  range.addEventListener('input', () => setStep(+range.value));
  host.replaceChildren(
    el('h3', {}, 'Build it up one step at a time'),
    el('p', { class: 'hint' }, 'Parts first, then wires. The newest item glows; at the end the circuit is complete and running.'),
    el('div', { class: 'stepper' }, el('button', { class: 'btn btn--sm', onclick: () => setStep(stepIndex - 1), disabled: stepIndex === 0 }, 'Back'), range, el('button', { class: 'btn btn--sm btn--primary', onclick: () => setStep(stepIndex + 1), disabled: stepIndex === N }, 'Next')),
    el('div', { class: 'stepper' }, el('span', { class: 'count' }, `${stepIndex} / ${N}`), el('span', { style: 'flex:1' }),
      el('button', { class: 'btn btn--sm', onclick: () => (stepTimer ? stopPlay() : play()) }, stepTimer ? 'Pause' : stepIndex === N ? 'Replay build' : 'Play'),
      el('button', { class: 'btn btn--sm', onclick: () => setStep(N), disabled: stepIndex === N }, 'Show all')),
    el('ol', { class: 'steps' }, ...refSteps.map((s, i) => el('li', { class: 'click ' + (i < stepIndex - 1 || (i === stepIndex - 1 && stepIndex === N) ? 'done' : i === stepIndex - 1 ? 'now' : ''), onclick: () => setStep(i + 1) }, el('span', {}, s.text)))),
  );
  host.querySelector('.now')?.scrollIntoView({ block: 'nearest' });
}
function play() { if (stepIndex >= refSteps.length) setStep(0); stepTimer = setInterval(() => { if (stepIndex >= refSteps.length) stopPlay(); else setStep(stepIndex + 1); }, 900); renderRefSteps(); }
function stopPlay() { if (stepTimer) { clearInterval(stepTimer); stepTimer = null; if (exp && view === 'reference') renderRefSteps(); } }

// ------------------------------------------------------------------ instruments panel
const RECORD = {
  var1: { label: 'VAR 1', get: (b) => b.t.settings.var1, fmt: (v) => v.toFixed(2) + ' V' },
  var2: { label: 'VAR 2', get: (b) => b.t.settings.var2, fmt: (v) => v.toFixed(2) + ' V' },
  cc: { label: 'I source', get: (b) => b.t.settings.cc, fmt: (v) => (v * 1000).toFixed(2) + ' mA' },
  pot: { label: 'Pot (1–W)', get: (b) => b.t.settings.pot.r * (1 - b.t.settings.pot.pos), fmt: (v) => fmtSI(v, 'Ω') },
  dmm: { label: 'Multimeter', get: (b) => b.readings?.dmm, fmt: (v) => (v == null ? '—' : v.toFixed(3) + ' V') },
  a1: { label: 'A1', get: (b) => b.readings?.a1, fmt: (v) => (v == null ? '—' : (v * 1000).toFixed(3) + ' mA') },
  a2: { label: 'A2', get: (b) => b.readings?.a2, fmt: (v) => (v == null ? '—' : (v * 1000).toFixed(3) + ' mA') },
  power: { label: 'P = V × I', get: (b) => (b.readings?.dmm ?? 0) * (b.readings?.a1 ?? 0), fmt: (v) => fmtSI(v, 'W') },
};

function slider(label, value, min, max, step, fmt, onInput, log) {
  const out = el('output', { class: 'ins-val' }, fmt(value));
  const toPos = (v) => (log ? Math.log10(v) : v), fromPos = (p) => (log ? 10 ** p : p);
  const r = el('input', { type: 'range', min: toPos(min), max: toPos(max), step: log ? 0.01 : step, value: toPos(value), 'aria-label': label });
  const box = el('input', { class: 'input mono ins-box', value: String(+value.toPrecision(4)), 'aria-label': label + ' value' });
  r.addEventListener('input', () => { let v = fromPos(+r.value); if (!log) v = Math.round(v / step) * step; v = +v.toPrecision(4); out.textContent = fmt(v); box.value = String(v); onInput(v); });
  box.addEventListener('change', () => { const v = parseSI(box.value); if (isFinite(v)) { const c = Math.max(min, Math.min(max, v)); r.value = toPos(c); out.textContent = fmt(c); onInput(c); } });
  return el('div', { class: 'ins-row' }, el('div', { class: 'ins-top' }, el('span', {}, label), out), el('div', { class: 'ins-ctl' }, r, box));
}

function renderInstruments(bench, host, controls, isRef) {
  const s = bench.t.settings;
  const show = (k) => !controls || controls.includes(k);
  const set = () => bench.settingsChanged();
  const items = [el('div', { class: 'live-box', 'data-live': '1' })];
  const sec = (title, ...kids) => el('div', { class: 'ins-sec' }, el('p', { class: 'panel-label' }, title), ...kids);
  if (show('var1') || show('var2')) items.push(sec('DC power supply',
    show('var1') ? slider('VAR 1', s.var1, 0, 15, 0.05, v => v.toFixed(2) + ' V', v => { s.var1 = v; set(); }) : null,
    show('var2') ? slider('VAR 2', s.var2, 0, 15, 0.05, v => v.toFixed(2) + ' V', v => { s.var2 = v; set(); }) : null,
    el('p', { class: 'hint' }, '+12 V and −12 V are fixed outputs.')));
  if (show('fg')) {
    const wave = el('div', { class: 'seg' }, ...['sine', 'square', 'triangle'].map(w => el('button', { 'aria-pressed': String(s.fg.wave === w), onclick: (ev) => { s.fg.wave = w; [...ev.currentTarget.parentNode.children].forEach(b => b.setAttribute('aria-pressed', String(b === ev.currentTarget))); set(); } }, w)));
    items.push(sec('Function generator', wave,
      slider('Frequency', s.fg.freq, 1, 100000, 1, v => fmtSI(v, 'Hz'), v => { s.fg.freq = v; set(); }, true),
      slider('Amplitude (peak)', s.fg.amp, 0.001, 15, 0.001, v => fmtSI(v, 'V'), v => { s.fg.amp = v; set(); }, true),
      slider('DC offset', s.fg.offset, -10, 10, 0.1, v => v.toFixed(1) + ' V', v => { s.fg.offset = v; set(); })));
  }
  if (show('cc')) items.push(sec('Constant-current source', slider('Current', s.cc * 1000, 0, 50, 0.005, v => v.toFixed(3) + ' mA', v => { s.cc = v / 1000; set(); })));
  if (show('pot')) items.push(sec('Potentiometer (10 kΩ)', slider('Resistance 1–W', s.pot.r * (1 - s.pot.pos), 0, s.pot.r, 10, v => fmtSI(v, 'Ω'), v => { s.pot.pos = 1 - v / s.pot.r; set(); })));
  if (show('s1') || show('s2')) items.push(sec('Switches', el('div', { class: 'sw-row' }, ...['s1', 's2'].filter(show).map(k => el('label', { class: 'sw-tog' },
    el('input', { type: 'checkbox', checked: s[k], onchange: (ev) => { s[k] = ev.target.checked; set(); } }), `${k.toUpperCase()} closed`)))));
  if (controls && !isRef) items.push(el('p', { class: 'hint' }, 'Only the controls this experiment uses are shown.'));
  // observation table
  if (exp?.record) {
    const cols = exp.record;
    const table = el('table', { class: 'table obs' });
    const draw = () => table.replaceChildren(
      el('thead', {}, el('tr', {}, el('th', {}, '#'), ...cols.map(c => el('th', {}, RECORD[c].label)))),
      el('tbody', {}, ...(records.length ? records.map((r, i) => el('tr', {}, el('td', {}, String(i + 1)), ...cols.map(c => el('td', {}, RECORD[c].fmt(r[c])))))
        : [el('tr', {}, el('td', { colspan: cols.length + 1, class: 'hint' }, 'No readings yet. Change the source, then press Record.'))])));
    draw();
    items.push(el('div', { class: 'ins-sec' }, el('p', { class: 'panel-label' }, 'Observation table'),
      el('div', { class: 'obs-actions' },
        el('button', { class: 'btn btn--sm btn--primary', onclick: () => { records.push(Object.fromEntries(cols.map(c => [c, RECORD[c].get(bench)]))); draw(); } }, 'Record reading'),
        el('button', { class: 'btn btn--sm', onclick: () => { records = []; draw(); } }, 'Clear'),
        el('button', { class: 'btn btn--sm', onclick: () => copyRecords(cols) }, 'Copy as CSV')),
      el('div', { class: 'tt-wrap' }, table)));
  }
  host.replaceChildren(...items);
  liveMeters(bench, host);
}
function copyRecords(cols) {
  const csv = [cols.map(c => RECORD[c].label).join(','), ...records.map(r => cols.map(c => RECORD[c].fmt(r[c]).replace(/[^\d.\-eE]/g, '')).join(','))].join('\n');
  navigator.clipboard?.writeText(csv).then(() => toast('Copied. Paste it into a spreadsheet to plot.', 'ok'), () => prompt('Copy:', csv));
}
function liveMeters(bench, host) {
  const box = host?.querySelector('[data-live]');
  if (!box) return;
  const r = bench.readings || {};
  const cell = (k, v, cls = '') => el('div', { class: 'meter ' + cls }, el('span', {}, k), el('b', {}, v));
  box.replaceChildren(
    cell('Multimeter', r.dmm == null ? 'not connected' : r.dmm.toFixed(3) + ' V', 'dmm'),
    cell('A1', r.a1 == null ? '—' : (r.a1 * 1000).toFixed(3) + ' mA'),
    cell('A2', r.a2 == null ? '—' : (r.a2 * 1000).toFixed(3) + ' mA'),
    cell('CH1', r.ch1 == null ? '—' : fmtSI(r.ch1, 'V'), 'c1'),
    cell('CH2', r.ch2 == null ? '—' : fmtSI(r.ch2, 'V'), 'c2'),
  );
}

// ------------------------------------------------------------------ scope panel
function renderScopePanel(host) {
  host.replaceChildren(
    el('h3', {}, 'Oscilloscope'),
    el('p', { class: 'hint' }, 'CH1 is yellow, CH2 cyan. Both are measured against ground. Connect a wire from the CH1 or CH2 terminal to the point you want to see.'),
    el('canvas', { class: 'scope-cv', height: 220 }),
    el('div', { class: 'scope-info' }),
  );
}
function drawScope(bench, cv) {
  if (!cv || cv.offsetParent === null) return;
  const dpr = devicePixelRatio || 1, w = cv.clientWidth, h = cv.clientHeight;
  if (cv.width !== Math.round(w * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
  const g = cv.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.fillStyle = '#06110d'; g.fillRect(0, 0, w, h);
  g.strokeStyle = 'rgba(160,220,190,.12)'; g.lineWidth = 1;
  for (let i = 0; i <= 10; i++) { const x = Math.round(w / 10 * i) + .5; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
  for (let j = 0; j <= 8; j++) { const y = Math.round(h / 8 * j) + .5; g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
  const buf = bench.buf, win = bench.t.window, vdiv = bench.vdiv || 1;
  if (!buf.length) return;
  const t0 = buf[buf.length - 1][0] - win;
  const info = [];
  [[1, '#f2c40f'], [2, '#23b5c9']].forEach(([k, col]) => {
    const pts = buf.filter(b => b[k] != null);
    if (!pts.length) return;
    g.strokeStyle = col; g.lineWidth = 1.8; g.beginPath();
    pts.forEach((b, i) => { const x = (b[0] - t0) / win * w, y = h / 2 - b[k] / vdiv * (h / 8); i ? g.lineTo(x, y) : g.moveTo(x, y); });
    g.stroke();
    const vs = pts.map(b => b[k]);
    const mx = Math.max(...vs), mn = Math.min(...vs);
    info.push(`CH${k}: ${fmtSI(mx - mn, 'V')} p-p, max ${fmtSI(mx, 'V')}, min ${fmtSI(mn, 'V')}`);
  });
  g.fillStyle = 'rgba(200,230,215,.75)'; g.font = '11px "Geist Mono", monospace';
  g.fillText(`${fmtSI(win / 10, 's')}/div   ${fmtSI(vdiv, 'V')}/div`, 8, 14);
  const inf = cv.parentNode.querySelector('.scope-info');
  if (inf) inf.textContent = info.join('  ·  ') || 'Nothing connected to CH1 or CH2.';
}

// ------------------------------------------------------------------ parts
const VALUE_PRESETS = {
  R: [10, 22, 47, 100, 220, 330, 470, 680, 1000, 2200, 3300, 4700, 10000, 22000, 47000, 100000, 1e6],
  C: [1e-9, 10e-9, 100e-9, 150e-9, 470e-9, 1e-6], CE: [1e-6, 10e-6, 47e-6, 100e-6, 470e-6], L: [1e-3, 10e-3, 100e-3], Z: [3.3, 5.1, 6.2, 9.1, 12],
};
const ICONS = {
  R: '<rect x="14" y="7" width="20" height="8" rx="3" fill="#d9c08f" stroke="#8a7346"/><path d="M2 11h12M34 11h12" stroke="#8a8a8a" stroke-width="2"/><rect x="18" y="7" width="2" height="8" fill="#7b4a1e"/><rect x="23" y="7" width="2" height="8" fill="#1b1b1b"/><rect x="28" y="7" width="2" height="8" fill="#d22d2d"/>',
  C: '<path d="M2 11h17M29 11h17" stroke="#8a8a8a" stroke-width="2"/><ellipse cx="24" cy="11" rx="6" ry="6" fill="#c9772f"/>',
  CE: '<path d="M2 11h12M34 11h12" stroke="#8a8a8a" stroke-width="2"/><rect x="14" y="5" width="20" height="12" rx="2" fill="#1d3a78"/><rect x="29" y="5" width="3" height="12" fill="#cfd8e8"/>',
  L: '<path d="M2 11h12M34 11h12" stroke="#8a8a8a" stroke-width="2"/><rect x="14" y="6" width="20" height="10" rx="4" fill="#2e7d4f"/>',
  D: '<path d="M2 11h14M32 11h14" stroke="#8a8a8a" stroke-width="2"/><rect x="16" y="7.5" width="16" height="7" rx="2" fill="#222"/><rect x="27" y="7.5" width="2.5" height="7" fill="#cfcfcf"/>',
  LED: '<path d="M2 11h16M30 11h16" stroke="#8a8a8a" stroke-width="2"/><circle cx="24" cy="11" r="7" fill="#ff3b30"/>',
  Z: '<path d="M2 11h14M32 11h14" stroke="#8a8a8a" stroke-width="2"/><rect x="16" y="7.5" width="16" height="7" rx="2" fill="#d98a3a"/><rect x="27" y="7.5" width="2.5" height="7" fill="#222"/>',
  NPN: '<path d="M17 18v-6M24 18v-6M31 18v-6" stroke="#8a8a8a" stroke-width="2"/><path d="M15 13V8a9 7 0 0 1 18 0v5z" fill="#222"/>',
  PNP: '<path d="M17 18v-6M24 18v-6M31 18v-6" stroke="#8a8a8a" stroke-width="2"/><path d="M15 13V8a9 7 0 0 1 18 0v5z" fill="#333"/>',
  OA: '<rect x="12" y="5" width="24" height="12" rx="2" fill="#1d2124"/><path d="M15 3v2M21 3v2M27 3v2M33 3v2M15 17v2M21 17v2M27 17v2M33 17v2" stroke="#9aa" stroke-width="2"/>',
};
const picks = {};
function renderParts() {
  const host = $('#myParts');
  const items = [el('div', { id: 'myInspectBox' })];
  if (exp) {
    items.push(el('p', { class: 'parts-group' }, 'Needed for this experiment'));
    const seen = new Set();
    const grid = el('div', { class: 'parts-grid' });
    for (const p of exp.parts) {
      const k = partKey(p) + (p.type === 'LED' ? p.color : '');
      if (seen.has(k)) continue;
      seen.add(k);
      const n = exp.parts.filter(q => partKey(q) === partKey(p) && q.type === p.type).length;
      grid.append(partButton(p.type, p.value, p.color, `${n > 1 ? n + ' × ' : ''}${partLabel(p)} ${PART_NAMES[p.type]}`));
    }
    items.push(grid);
  }
  items.push(el('p', { class: 'parts-group' }, 'Parts bin'));
  const bin = el('div', { class: 'parts-grid' });
  for (const type of Object.keys(PARTS)) {
    const def = PARTS[type];
    picks[type] ??= { value: def.def, color: 'red' };
    const row = partButton(type, null, null, def.name, true);
    bin.append(row);
  }
  items.push(bin);
  items.push(el('p', { class: 'parts-group' }, 'Wire colour'));
  const sw = el('div', { class: 'swatch-row' });
  for (const [k, v] of [['auto', 'conic-gradient(#d62b2b 0 25%, #23262a 0 50%, #e8b80c 0 75%, #1f9a4c 0)'], ...Object.entries(AWIRE_COLORS)]) {
    sw.append(el('button', { class: 'swatch' + (myBench.board.wireColor === k ? ' is-on' : ''), style: `--c:${v}`, 'aria-label': k, title: k, onclick: (e) => { myBench.board.wireColor = k; $$('.swatch', sw).forEach(b => b.classList.toggle('is-on', b === e.currentTarget)); } }));
  }
  items.push(sw);
  items.push(el('div', { class: 'keys', style: 'margin-top:16px' }, el('p', { class: 'parts-group' }, 'How to build'), el('dl', {},
    el('dt', {}, 'Two-lead part'), el('dd', {}, 'pick it, click the first hole, then the second'),
    el('dt', {}, 'Transistor'), el('dd', {}, 'click the hole for the middle (base) leg'),
    el('dt', {}, '741'), el('dd', {}, 'click where it should straddle the channel'),
    el('dt', {}, 'Wire'), el('dd', {}, 'click a hole or terminal, then another'),
    el('dt', {}, 'Remove'), el('dd', {}, 'right-click, or select and press Del'))));
  host.replaceChildren(...items);
}
function partButton(type, value, color, label, withValue) {
  const pk = picks[type] ??= { value: PARTS[type].def, color: 'red' };
  const row = el('div', { class: 'part-pick' });
  const btn = el('button', {
    class: 'part-row', 'aria-pressed': 'false',
    onclick: (ev) => {
      const on = ev.currentTarget.getAttribute('aria-pressed') !== 'true';
      $$('.part-row').forEach(b => b.setAttribute('aria-pressed', 'false'));
      if (!on) { myBench.board.setPlace(null); return; }
      ev.currentTarget.setAttribute('aria-pressed', 'true');
      myBench.board.setPlace({ type, value: value ?? pk.value, color: color ?? pk.color });
      $('#myStatus').textContent = type === 'OA' ? 'Click the breadboard where the 741 should straddle the channel.' : type === 'NPN' || type === 'PNP' ? 'Click the hole for the base (middle) leg.' : 'Click the first hole, then the second. Esc cancels.';
    },
  }, el('span', { class: 'ico', html: `<svg viewBox="0 0 48 22">${ICONS[type]}</svg>` }), el('span', { class: 'nm' }, label));
  row.append(btn);
  if (withValue && (VALUE_PRESETS[type] || type === 'LED')) {
    const sel = type === 'LED'
      ? el('select', { class: 'input pick-val', 'aria-label': 'LED colour' }, ...Object.keys(LED_RGB).map(c => el('option', { value: c, selected: pk.color === c }, c)))
      : el('select', { class: 'input pick-val', 'aria-label': PARTS[type].name + ' value' }, ...VALUE_PRESETS[type].map(v => el('option', { value: v, selected: v === pk.value }, type === 'Z' ? v + ' V' : fmtSI(v, PARTS[type].unit))));
    sel.addEventListener('change', () => { if (type === 'LED') pk.color = sel.value; else pk.value = +sel.value; if (btn.getAttribute('aria-pressed') === 'true') myBench.board.setPlace({ type, value: pk.value, color: pk.color }); });
    row.append(sel);
  }
  return row;
}

function inspect(sel, bench, host) {
  if (!host) return;
  if (!sel) { host.replaceChildren(); return; }
  const t = bench.t;
  if (sel.kind === 'wire') {
    const w = t.wires.find(x => x.id === sel.id);
    if (!w) return;
    host.replaceChildren(el('div', { class: 'insp' }, el('h3', {}, 'Wire'), el('p', { class: 'hint' }, `${describePoint(w.a)} to ${describePoint(w.b)}`),
      el('div', { class: 'swatch-row' }, ...Object.entries(AWIRE_COLORS).map(([k, v]) => el('button', { class: 'swatch' + (w.color === k ? ' is-on' : ''), style: `--c:${v}`, 'aria-label': k, onclick: () => { w.color = k; bench.board.render(); bench.save(); inspect(sel, bench, host); } }))),
      el('p', {}, el('button', { class: 'btn btn--sm', style: 'margin-top:10px', onclick: () => { bench.board.removeWire(w.id); host.replaceChildren(); } }, 'Remove wire'))));
    return;
  }
  const p = t.parts.find(x => x.id === sel.id);
  if (!p) return;
  const st = t.partState(p);
  const kids = [el('h3', {}, `${p.ref} · ${partLabel(p)}`), el('p', { class: 'hint' }, PARTS[p.type].name)];
  if (st) {
    const V = st.V, I = st.I;
    kids.push(el('div', { class: 'live-box' },
      V != null ? el('div', { class: 'meter' }, el('span', {}, 'Voltage across'), el('b', {}, fmtSI(V, 'V'))) : null,
      el('div', { class: 'meter' }, el('span', {}, p.type === 'NPN' || p.type === 'PNP' ? 'Collector current' : 'Current'), el('b', {}, fmtSI(I, 'A'))),
      V != null && ['R', 'D', 'LED', 'Z'].includes(p.type) ? el('div', { class: 'meter' }, el('span', {}, 'Power'), el('b', {}, fmtSI(Math.abs(V * I), 'W'))) : null));
  }
  if (!bench.board.readonly) {
    if (['R', 'C', 'CE', 'L', 'Z'].includes(p.type)) {
      const inp = el('input', { class: 'input mono', value: p.type === 'Z' ? String(p.value) : fmtSI(p.value, '', 4).replace(/\s/g, '') });
      inp.addEventListener('change', () => { const v = parseSI(inp.value); if (v > 0) { p.value = v; bench.changed(); inspect(sel, bench, host); } else toast('Could not read that value. Try 4.7k or 100n.', 'bad'); });
      kids.push(el('label', { class: 'field' }, el('span', {}, `Value (${PARTS[p.type].unit})`), inp));
    }
    if (p.type === 'LED') {
      const s = el('select', { class: 'input' }, ...Object.keys(LED_RGB).map(c => el('option', { value: c, selected: p.color === c }, c)));
      s.addEventListener('change', () => { p.color = s.value; bench.changed(); });
      kids.push(el('label', { class: 'field' }, el('span', {}, 'Colour'), s));
    }
    kids.push(el('p', {}, el('button', { class: 'btn btn--sm', style: 'margin-top:10px', onclick: () => { bench.board.removePart(p.id); host.replaceChildren(); } }, 'Remove part')));
  }
  host.replaceChildren(el('div', { class: 'insp' }, ...kids));
}
function hoverStatus(h, bench, line) {
  if (!h || (!h.pt && !h.part && !h.wire)) { line.textContent = ''; return; }
  const t = bench.t;
  if (h.part) {
    const st = t.partState(h.part);
    line.textContent = `${h.part.ref} ${partLabel(h.part)}${st ? ` · ${st.V != null ? 'V = ' + fmtSI(st.V, 'V') + ' · ' : ''}I = ${fmtSI(st.I, 'A')}` : ''}`;
    return;
  }
  const pt = h.pt || h.wire?.a;
  const v = t.connected(pt) ? t.voltage(pt) : null;
  line.textContent = `${describePoint(pt)}${v != null ? ' · ' + fmtSI(v, 'V', 4) + ' to ground' : ' · not connected'}`;
}

// ------------------------------------------------------------------ practice steps + check
function renderPracticeSteps() {
  const host = $('#mySteps');
  if (!exp) { host.replaceChildren(); return; }
  const fpRef = summary(refData(exp)), fpMe = summary(myBench.t.serialize());
  const have = new Map();
  for (const k of fpMe) have.set(k, (have.get(k) || 0) + 1);
  const partItems = exp.parts.map(p => {
    const k = partKey(p) + (p.type === 'LED' ? p.color : '');
    const ok = (have.get(k) || 0) > 0;
    if (ok) have.set(k, have.get(k) - 1);
    return { ok, text: stepText({ kind: 'part', p }, exp) };
  });
  void fpRef;
  const done = partItems.filter(i => i.ok).length;
  host.replaceChildren(
    el('h3', {}, 'Build checklist'),
    el('div', { class: 'progress' }, el('span', { style: `width:${(done / exp.parts.length) * 100}%` })),
    el('p', { class: 'hint' }, `${done} of ${exp.parts.length} parts on your board. You may place them in different holes from the reference, as long as the connections are the same. The Check tab tests the circuit electrically.`),
    el('ol', { class: 'steps' }, ...partItems.map(i => el('li', { class: i.ok ? 'done' : '' }, el('span', {}, i.text))),
      ...exp.wires.map(w => el('li', {}, el('span', {}, `Wire ${describePoint(w.a)} → ${describePoint(w.b)}`)))),
    el('p', { class: 'hint', style: 'margin-top:14px' }, 'Stuck? ', el('button', { class: 'btn btn--sm', onclick: copyReference }, 'Copy the reference onto my board')),
  );
}
function summary(data) { return (data.parts || []).map(p => partKey(p) + (p.type === 'LED' ? p.color : '')); }
function copyReference() {
  myBench.load(refData(exp), { fresh: false });
  colour(myBench);
  myBench.save();
  toast('Reference copied. Ctrl+Z restores your own wiring.');
}

function renderIssues() {
  const box = $('#issueBox');
  const list = myBench.t.dirty ? [] : myBench.t.liveIssues();
  const serious = list.filter(i => i.level !== 'info').length;
  $('#issueBadge').hidden = !serious;
  $('#issueBadge').textContent = serious;
  if (!box) return;
  const key = list.map(i => i.text).join('|');
  if (box.dataset.key === key) return;
  box.dataset.key = key;
  box.replaceChildren(list.length ? el('ul', { class: 'issue-list' }, ...list.map(i => el('li', { class: 'lvl-' + i.level }, i.text)))
    : el('p', { class: 'hint' }, myBench.t.parts.length ? 'No wiring problems spotted.' : 'Your board is empty.'));
}
function renderCheckPanel() {
  $('#myCheck').replaceChildren(
    exp ? el('div', {}, el('h3', {}, 'Test your circuit'),
      el('p', { class: 'hint' }, 'Runs your board and the reference side by side with the experiment\'s instrument settings, then compares the voltage across and current through every part.'),
      el('button', { class: 'btn btn--primary', onclick: runCheck }, 'Check my circuit'),
      el('div', { id: 'checkOut' })) : null,
    el('p', { class: 'panel-label' }, 'What the trainer noticed'),
    el('div', { id: 'issueBox' }));
}

function runCheck() {
  const e = exp;
  const mk = (data) => { const t = new AnalogTrainer(); t.load(data); t.settings = { ...DEFAULT_SETTINGS(), ...structuredClone(e.settings) }; if (e.id === 'rc-charge') t.settings.s1 = true; t.window = e.window; return t; };
  const dur = e.window * (e.scope ? 1.5 : 0.2);
  const A = fingerprint(mk(refData(e)), dur), B = fingerprint(mk(myBench.t.serialize()), dur);
  const rows = [];
  const keys = [...new Set([...A.parts, ...B.parts].map(p => p.key))];
  let pass = true;
  const close = (x, y, abs) => Math.abs(x - y) <= 0.04 * Math.max(Math.abs(x), Math.abs(y)) + abs;
  for (const k of keys) {
    const ra = A.parts.filter(p => p.key === k).sort((a, b) => a.vavg - b.vavg || a.imax - b.imax);
    const rb = B.parts.filter(p => p.key === k).sort((a, b) => a.vavg - b.vavg || a.imax - b.imax);
    const n = Math.max(ra.length, rb.length);
    for (let i = 0; i < n; i++) {
      const a = ra[i], b = rb[i];
      if (!b) { pass = false; rows.push({ label: a.label, want: a, got: null, msg: 'missing from your board' }); continue; }
      if (!a) { pass = false; rows.push({ label: b.label + ' (' + b.ref + ')', want: null, got: b, msg: 'not in this experiment' }); continue; }
      const ok = close(a.vmax, b.vmax, 0.05) && close(a.imax, b.imax, 2e-5);
      if (!ok) pass = false;
      rows.push({ label: `${a.label} (${b.ref})`, want: a, got: b, ok });
    }
  }
  if (pass) { markDone(e.id); drawSide(); }
  const fmt = (p) => (p ? `${fmtSI(p.vmax, 'V')}, ${fmtSI(p.imax, 'A')}` : '—');
  const meterNotes = [];
  for (const k of ['dmm', 'a1', 'a2']) {
    const a = A.meters[k], b = B.meters[k];
    if (a != null && (b == null || !close(a, b, k === 'dmm' ? 0.05 : 2e-5))) meterNotes.push(`${k === 'dmm' ? 'The multimeter' : k.toUpperCase()} should read about ${k === 'dmm' ? a.toFixed(2) + ' V' : (a * 1000).toFixed(2) + ' mA'}${b == null ? ', but it is not connected on your board' : `, yours reads ${k === 'dmm' ? b.toFixed(2) + ' V' : (b * 1000).toFixed(2) + ' mA'}`}.`);
  }
  const issue = myBench.t.liveIssues().find(i => i.level !== 'info');
  $('#checkOut').replaceChildren(
    el('div', { class: 'verdict ' + (pass ? 'pass' : 'fail') },
      el('strong', {}, pass ? 'Your circuit works' : 'Not quite there yet'),
      el('span', {}, pass ? 'Every part sees the same voltage and current as in the reference. Marked as done.' : issue ? 'Start here: ' + issue.text : 'The rows in red differ from the reference. Check the connections around those parts.')),
    meterNotes.length ? el('ul', { class: 'issue-list', style: 'margin-bottom:10px' }, ...meterNotes.map(t => el('li', { class: 'lvl-warn' }, t))) : '',
    el('div', { class: 'tt-wrap' }, el('table', { class: 'table tt check-t' },
      el('thead', {}, el('tr', {}, el('th', {}, 'Part'), el('th', {}, 'Expected peak V, I'), el('th', {}, 'Yours'))),
      el('tbody', {}, ...rows.map(r => el('tr', { class: r.ok ? '' : 'bad' }, el('td', { class: 'note-cell' }, r.label), el('td', {}, fmt(r.want)), el('td', { class: r.ok ? '' : 'miss' }, r.msg || fmt(r.got))))))),
  );
}

// ------------------------------------------------------------------ keyboard
document.addEventListener('keydown', (e) => {
  if (e.target.matches('input, textarea, select') || view !== 'practice') return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? myBench.doRedo() : myBench.doUndo(); return; }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); myBench.doRedo(); return; }
  if (e.key === 'Escape') { if (myBench.board.cancel()) $$('.part-row').forEach(b => b.setAttribute('aria-pressed', 'false')); return; }
  if (e.key === 'Delete' || e.key === 'Backspace') { if (myBench.board.deleteSelected()) $('#myInspectBox')?.replaceChildren(); }
});

// ------------------------------------------------------------------ boot
(function boot() {
  const q = new URLSearchParams(location.search);
  if (q.get('free')) return open(null, 'practice');
  const e = AEXPERIMENTS.find(x => x.id === q.get('exp')) || AEXPERIMENTS[0];
  const v = q.get('view');
  open(e, ['overview', 'reference', 'practice'].includes(v) ? v : 'overview');
})();
void parsePoint;
