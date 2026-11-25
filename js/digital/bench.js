// A self-contained digital trainer: model + board + clock + undo history.
import { el } from '../shared/site.js';
import { Trainer } from './model.js';
import { Board } from './board.js';
import { shareCircuit, SHARE_ICON } from '../shared/share.js';

const FREQS = [0.5, 1, 2, 5, 10];

export class DigitalBench {
  constructor(host, { readonly = false, onChange, onSelect, onHover, notify, storeKey } = {}) {
    this.host = host;
    this.trainer = new Trainer();
    this.onChange = onChange || (() => {});
    this.storeKey = storeKey;
    this.undo = []; this.redo = []; this.lastSnap = '';
    this.fi = 1; this.clockTimer = null;
    const t = this.trainer;
    this.board = new Board(host, t, {
      change: (transient) => { this.refresh(); if (!transient) this.snapshot(); },
      select: (sel) => onSelect?.(sel, this),
      hover: (info) => onHover?.(info, this),
      notify: (m, k) => notify?.(m, k),
      toggleSwitch: (i) => { t.switches[i] ^= 1; this.refresh(); },
      pulser: (i, d) => { t.pulsers[i] = d ? 1 : 0; this.refresh(); },
      power: () => { t.power = !t.power; this.refresh(); },
      clock: (cmd) => this.clockCmd(cmd),
      segMode: () => { t.segMode = t.segMode === 'cc' ? 'ca' : 'cc'; this.refresh(); this.snapshot(); },
      placed: () => onSelect?.({ kind: 'placed' }, this),
    });
    this.board.readonly = readonly;
    this.board.setClockInfo(FREQS[this.fi], false);
  }

  refresh() {
    this.trainer.solve();
    this.board.render();
    if (this.storeKey) { try { localStorage.setItem(this.storeKey, JSON.stringify(this.trainer.serialize())); } catch { /* full */ } }
    this.onChange(this);
  }

  load(data, { fresh = true } = {}) {
    this.trainer.load(data);
    this.trainer.power = true;
    this.board.selected = null;
    if (fresh) { this.undo = []; this.redo = []; this.lastSnap = ''; }
    this.refresh();
    this.snapshot();
  }

  restoreStored() {
    if (!this.storeKey) return false;
    try {
      const s = localStorage.getItem(this.storeKey);
      if (!s) return false;
      this.load(JSON.parse(s));
      return true;
    } catch { return false; }
  }

  snapshot() {
    const s = JSON.stringify(this.trainer.serialize());
    if (s === this.lastSnap) return;
    if (this.lastSnap) { this.undo.push(this.lastSnap); if (this.undo.length > 120) this.undo.shift(); }
    this.redo.length = 0;
    this.lastSnap = s;
    this.onChange(this);
  }
  doUndo() { if (!this.undo.length) return; this.redo.push(this.lastSnap); this.applySnap(this.undo.pop()); }
  doRedo() { if (!this.redo.length) return; this.undo.push(this.lastSnap); this.applySnap(this.redo.pop()); }
  applySnap(json) {
    this.trainer.load(JSON.parse(json));
    this.lastSnap = json;
    this.board.selected = null;
    this.refresh();
  }

  clear() {
    this.trainer.chips = []; this.trainer.wires = [];
    this.board.selected = null;
    this.refresh(); this.snapshot();
  }

  clockCmd(cmd) {
    if (cmd === 'run') {
      if (this.clockTimer) { clearInterval(this.clockTimer); this.clockTimer = null; } else this.startClock();
    } else if (cmd === 'fast') { this.fi = Math.min(FREQS.length - 1, this.fi + 1); if (this.clockTimer) this.startClock(); }
    else if (cmd === 'slow') { this.fi = Math.max(0, this.fi - 1); if (this.clockTimer) this.startClock(); }
    else if (cmd === 'step') {
      this.stopClock();
      this.trainer.clock = 1; this.refresh();
      setTimeout(() => { this.trainer.clock = 0; this.refresh(); }, 160);
    }
    this.board.setClockInfo(FREQS[this.fi], !!this.clockTimer);
  }
  startClock() {
    clearInterval(this.clockTimer);
    this.clockTimer = setInterval(() => { this.trainer.clock ^= 1; this.refresh(); }, 500 / FREQS[this.fi]);
  }
  stopClock() {
    if (this.clockTimer) { clearInterval(this.clockTimer); this.clockTimer = null; this.board.setClockInfo(FREQS[this.fi], false); }
  }

  toggleSwitch(i) { this.trainer.switches[i] ^= 1; this.refresh(); }
  setSwitches(vals) { vals.forEach((v, i) => { if (v != null) this.trainer.switches[i] = v; }); this.refresh(); }
}

// Small dark toolbar for a bench stage
export function benchToolbar(bench, { editable }) {
  const b = (label, title, fn, attrs = {}) => el('button', { title, onclick: fn, ...attrs, html: label });
  const view = el('div', { class: 'tool-group', role: 'group', 'aria-label': 'View' },
    b('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="6.5"/><path d="M11 8v6M8 11h6M16 16l4.5 4.5"/></svg>', 'Zoom in', () => bench.board.zoom(1 / 1.25)),
    b('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="6.5"/><path d="M8 11h6M16 16l4.5 4.5"/></svg>', 'Zoom out', () => bench.board.zoom(1.25)),
    b('Board', 'Zoom to the breadboard', () => bench.board.focusBreadboard()),
    b('Whole kit', 'Show the whole trainer', () => bench.board.fit()),
  );
  const lv = b('Logic levels', 'Colour every wire by its logic level', (e) => {
    bench.board.levelView = !bench.board.levelView;
    e.currentTarget.setAttribute('aria-pressed', String(bench.board.levelView));
    bench.board.render();
  }, { 'aria-pressed': 'false' });
  const groups = [view, el('div', { class: 'tool-group' }, lv)];
  if (editable) {
    const undo = b('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></svg>', 'Undo (Ctrl+Z)', () => bench.doUndo());
    const redo = b('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 14 5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/></svg>', 'Redo (Ctrl+Y)', () => bench.doRedo());
    const clear = b('Clear', 'Remove every chip and wire', () => bench.clear());
    groups.push(el('div', { class: 'tool-group' }, undo, redo, clear));
    groups.push(el('div', { class: 'tool-group' }, b(SHARE_ICON + '<span>Share</span>', 'Send this circuit to a friend as a link', () => shareCircuit(bench.trainer.serialize(), 'My digital circuit'), { class: 'tb-share' })));
    bench._undoBtns = { undo, redo };
  }
  return el('div', { class: 'stage-toolbar' }, ...groups);
}
