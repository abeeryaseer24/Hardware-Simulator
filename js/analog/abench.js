// Analog bench: trainer model + board + real-time loop + scope buffer + undo.
import { el } from '../shared/site.js';
import { AnalogTrainer } from './atrainer.js';
import { AnalogBoard } from './aboard.js';
import { shareCircuit, SHARE_ICON } from '../shared/share.js';

const benches = new Set();
let last = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  for (const b of benches) if (b.visible()) b.tick(dt);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

export class AnalogBench {
  constructor(host, { readonly = false, storeKey, onChange, onSelect, onHover, notify } = {}) {
    this.host = host;
    this.t = new AnalogTrainer();
    this.storeKey = storeKey;
    this.onChange = onChange || (() => {});
    this.notify = notify || (() => {});
    this.undo = []; this.redo = []; this.lastSnap = '';
    this.buf = [];
    this.carry = 0;
    this.frame = 0;
    this.dmmAvg = null;
    this.board = new AnalogBoard(host, this.t, {
      change: () => this.changed(),
      select: (sel) => onSelect?.(sel, this),
      hover: (h) => onHover?.(h, this),
      notify: (m, k) => this.notify(m, k),
      control: (act) => this.control(act),
      placed: () => onSelect?.({ kind: 'placed' }, this),
    });
    this.board.readonly = readonly;
    benches.add(this);
  }

  visible() { return this.host.offsetParent !== null; }

  // topology or value change
  changed(snap = true) {
    this.t.dirty = true;
    this.buf = [];
    this.board.render();
    if (snap) this.snapshot();
    this.save();
    this.onChange(this);
  }
  settingsChanged() {
    this.t.dirty = true;
    this.buf = [];
    this.dmmAvg = null;
    this.save();
    this.board.renderIndicators(this.t.readings ? null : null);
    this.onChange(this, 'settings');
  }
  save() { if (this.storeKey) try { localStorage.setItem(this.storeKey, JSON.stringify(this.t.serialize())); } catch { /* full */ } }

  load(data, { fresh = true } = {}) {
    this.t.load(data);
    this.board.selected = null;
    if (fresh) { this.undo = []; this.redo = []; this.lastSnap = ''; }
    this.buf = [];
    this.board.render();
    this.snapshot();
    this.onChange(this);
  }
  restoreStored() {
    if (!this.storeKey) return false;
    try { const s = localStorage.getItem(this.storeKey); if (!s) return false; this.load(JSON.parse(s)); return true; } catch { return false; }
  }
  snapshot() {
    const s = JSON.stringify({ parts: this.t.serialize().parts, wires: this.t.serialize().wires });
    if (s === this.lastSnap) return;
    if (this.lastSnap) { this.undo.push(this.lastSnap); if (this.undo.length > 100) this.undo.shift(); }
    this.redo.length = 0;
    this.lastSnap = s;
  }
  applySnap(json) {
    const d = JSON.parse(json);
    this.t.load({ ...d, settings: this.t.settings });
    this.lastSnap = json;
    this.board.selected = null;
    this.changed(false);
  }
  doUndo() { if (!this.undo.length) return; this.redo.push(this.lastSnap); this.applySnap(this.undo.pop()); }
  doRedo() { if (!this.redo.length) return; this.undo.push(this.lastSnap); this.applySnap(this.redo.pop()); }
  clear() { this.t.parts = []; this.t.wires = []; this.changed(); }

  control(act) {
    const s = this.t.settings;
    if (act === 's1' || act === 's2') { s[act] = !s[act]; this.notify(`${act.toUpperCase()} ${s[act] ? 'closed' : 'opened'}`); }
    else if (act === 'power') s.power = !s.power;
    else if (act === 'pot-up') s.pot.pos = Math.min(1, +(s.pot.pos + 0.02).toFixed(3));
    else if (act === 'pot-dn') s.pot.pos = Math.max(0, +(s.pot.pos - 0.02).toFixed(3));
    else if (act === 'cc-up') s.cc = Math.min(0.05, +(s.cc + 0.0005).toFixed(5));
    else if (act === 'cc-dn') s.cc = Math.max(0, +(s.cc - 0.0005).toFixed(5));
    this.settingsChanged();
  }

  setWindow(w) { this.t.window = w; this.t.dirty = true; this.buf = []; }

  tick(dtReal) {
    const t = this.t;
    if (!t.parts.length && !t.wires.length) { this.board.renderIndicators({ dmm: null, a1: null, a2: null }, { buf: [], window: t.window, vdiv: 1 }); return; }
    if (t.dirty) { t.compile(); this.buf = []; }
    const c = t.circuit;
    this.carry += (t.window / 2.5) * dtReal / c.dt;
    let n = Math.floor(this.carry);
    this.carry = Math.min(this.carry - n, 50);
    const t0 = performance.now();
    for (let i = 0; i < n; i++) {
      if (!c.step()) { this.notify(c.error || 'The circuit cannot be solved.', 'bad'); t.settings.power = false; t.dirty = true; break; }
      const r = t.readings();
      this.buf.push([c.t, r.ch1, r.ch2]);
      if (performance.now() - t0 > 12) break;
    }
    const cut = c.t - t.window * 1.02;
    let k = 0;
    while (k < this.buf.length && this.buf[k][0] < cut) k++;
    if (k) this.buf.splice(0, k);
    if (this.buf.length > 3000) this.buf = this.buf.filter((_, i) => i % 2 === 0);
    const r = t.readings();
    // a DC meter shows the average, not the instantaneous value
    if (r.dmm != null) { this.dmmAvg = this.dmmAvg == null ? r.dmm : this.dmmAvg + (r.dmm - this.dmmAvg) * Math.min(1, dtReal * 6); r.dmm = this.dmmAvg; } else this.dmmAvg = null;
    this.readings = r;
    this.frame++;
    const vals = this.buf.flatMap(b => [b[1], b[2]]).filter(v => v != null);
    const mx = vals.length ? Math.max(...vals.map(Math.abs)) : 1;
    const steps = [0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10];
    const vdiv = steps.find(s => mx <= s * 3.8) || 10;
    this.vdiv = vdiv;
    this.board.renderIndicators(r, { buf: this.buf, window: t.window, vdiv });
    if (this.frame % 10 === 0) this.onChange(this, 'tick');
  }
}

export function aBenchToolbar(bench, { editable }) {
  const b = (label, title, fn, attrs = {}) => el('button', { title, onclick: fn, ...attrs, html: label });
  const groups = [el('div', { class: 'tool-group' },
    b('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="6.5"/><path d="M11 8v6M8 11h6M16 16l4.5 4.5"/></svg>', 'Zoom in', () => bench.board.zoom(1 / 1.25)),
    b('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="6.5"/><path d="M8 11h6M16 16l4.5 4.5"/></svg>', 'Zoom out', () => bench.board.zoom(1.25)),
    b('Board', 'Zoom to the breadboard', () => bench.board.focusBreadboard()),
    b('Whole kit', 'Show the whole trainer', () => bench.board.fit()),
  ), el('div', { class: 'tool-group' }, b('Labels', 'Show part names and values', (e) => {
    bench.board.showLabels = !bench.board.showLabels;
    e.currentTarget.setAttribute('aria-pressed', String(bench.board.showLabels));
    bench.board.render();
  }, { 'aria-pressed': 'false' }))];
  if (editable) {
    groups.push(el('div', { class: 'tool-group' },
      b('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></svg>', 'Undo (Ctrl+Z)', () => bench.doUndo()),
      b('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 14 5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/></svg>', 'Redo (Ctrl+Y)', () => bench.doRedo()),
      b('Clear', 'Remove every part and wire', () => bench.clear())));
    groups.push(el('div', { class: 'tool-group' }, b(SHARE_ICON + '<span>Share</span>', 'Send this circuit to a friend as a link', () => shareCircuit(bench.t.serialize(), 'My circuit'), { class: 'tb-share' })));
  }
  return el('div', { class: 'stage-toolbar' }, ...groups);
}
