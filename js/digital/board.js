// Breadboard trainer renderer + pointer interaction.
import { svg } from '../shared/site.js';
import { addPinch } from '../shared/pinch.js';
import { addViewControls } from '../shared/viewlock.js';
import { CHIPS } from './chips.js';
import {
  P, COLS, VIEW, ROWS, TOP_ROWS, BOT_ROWS, RAIL_ROWS, PADS,
  colX, railHasHole, holeId, parsePoint, pointXY, pinHole, chipSpan, describePoint, baseNode,
} from './model.js';

export const WIRE_COLORS = {
  red: '#d62b2b', black: '#23262a', blue: '#2563c9', green: '#1f9a4c',
  yellow: '#e8b80c', orange: '#ec7a1c', white: '#f1f1ec', purple: '#7d4bc4',
};
const LEVEL_COL = { 1: '#ff4848', 0: '#3d6fd6', X: '#ff9f1a', null: '#8d9892' };

export class Board {
  constructor(host, trainer, hooks) {
    this.host = host;
    this.t = trainer;
    this.hooks = hooks;           // { change(), select(info), hover(info) }
    this.wireColor = 'auto';
    this.wireStyle = 'arc';
    this.levelView = false;
    this.mode = 'wire';           // wire | place
    this.placeType = null;
    this.pending = null;          // first endpoint while drawing a wire
    this.hoverPt = null;
    this.selected = null;         // {kind:'wire'|'chip', id}
    this.guide = null;            // {chips:[], wires:[], step}
    this.vb = { x: 0, y: 0, w: VIEW.w, h: VIEW.h };
    this.readonly = false;
    this.focusWire = null;
    this.build();
  }

  // ------------------------------------------------------------------ static art
  build() {
    const s = svg('svg', { class: 'trainer', viewBox: `0 0 ${VIEW.w} ${VIEW.h}`, role: 'img', 'aria-label': 'Digital trainer with breadboard' });
    this.svg = s;
    const defs = svg('defs');
    defs.innerHTML = `
      <linearGradient id="ledOn" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffb3a8"/><stop offset=".5" stop-color="#ff2d2d"/><stop offset="1" stop-color="#b30f0f"/></linearGradient>
      <radialGradient id="ledGlow"><stop offset="0" stop-color="rgba(255,60,50,.65)"/><stop offset="1" stop-color="rgba(255,60,50,0)"/></radialGradient>
      <linearGradient id="chipBody" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2b2f33"/><stop offset="1" stop-color="#15181a"/></linearGradient>
      <filter id="soft" x="-20%" y="-20%" width="140%" height="160%"><feDropShadow dx="0" dy="1.5" stdDeviation="1.4" flood-opacity=".45"/></filter>`;
    s.append(defs);

    // trainer case
    s.append(svg('rect', { x: 8, y: 8, width: VIEW.w - 16, height: VIEW.h - 16, rx: 14, class: 't-case' }));
    s.append(this.panel(30, 26, 450, 150, 'Output LEDs — lit when the input is HIGH'));
    s.append(this.panel(484, 26, 180, 160, '7-segment display'));
    s.append(this.panel(668, 26, 120, 160, 'Logic probe'));
    s.append(this.panel(792, 26, 188, 160, 'Clock generator'));
    s.append(this.panel(30, 500, 170, 176, 'Power supply'));
    s.append(this.panel(214, 500, 512, 176, 'Input switches — up = HIGH'));
    s.append(this.panel(740, 500, 240, 176, 'Pulsers — hold for HIGH'));

    // breadboard
    const bb = svg('g', { class: 'bb' });
    bb.append(svg('rect', { x: 36, y: 204, width: 940, height: 284, rx: 6, class: 'bb-body' }));
    bb.append(svg('rect', { x: 44, y: 340, width: 924, height: 10, rx: 2, class: 'bb-channel' }));
    const railLine = (y, cls) => bb.append(svg('line', { x1: 52, x2: 960, y1: y, y2: y, class: cls }));
    railLine(ROWS.tp - 9, 'rail-plus'); railLine(ROWS.tn + 9, 'rail-minus');
    railLine(ROWS.bp - 9, 'rail-plus'); railLine(ROWS.bn + 9, 'rail-minus');
    const lab = (x, y, t, cls = 'bb-label') => { const n = svg('text', { x, y, class: cls }); n.textContent = t; bb.append(n); };
    for (const r of RAIL_ROWS) {
      const plus = r.endsWith('p');
      lab(48, ROWS[r] + 4, plus ? '+' : '−', plus ? 'bb-sign plus' : 'bb-sign minus');
      lab(964, ROWS[r] + 4, plus ? '+' : '−', plus ? 'bb-sign plus' : 'bb-sign minus');
    }
    for (const r of [...TOP_ROWS, ...BOT_ROWS]) { lab(48, ROWS[r] + 3.5, r); lab(962, ROWS[r] + 3.5, r); }
    for (let c = 0; c < COLS; c++) {
      if (c === 0 || (c + 1) % 5 === 0) { lab(colX(c), 258, String(c + 1), 'bb-num'); lab(colX(c), 438, String(c + 1), 'bb-num'); }
    }
    // column strips shown on hover
    this.stripLayer = svg('g', { class: 'strips' });
    bb.append(this.stripLayer);
    const holes = svg('g', { class: 'holes' });
    for (let c = 0; c < COLS; c++) {
      for (const r of [...TOP_ROWS, ...BOT_ROWS]) holes.append(svg('rect', { x: colX(c) - 3.2, y: ROWS[r] - 3.2, width: 6.4, height: 6.4, rx: 1.2, class: 'hole', 'data-pt': holeId(r, c) }));
      if (railHasHole(c)) for (const r of RAIL_ROWS) holes.append(svg('rect', { x: colX(c) - 3.2, y: ROWS[r] - 3.2, width: 6.4, height: 6.4, rx: 1.2, class: 'hole', 'data-pt': holeId(r, c) }));
    }
    bb.append(holes);
    s.append(bb);

    this.buildTop(s);
    this.buildBottom(s);

    // pads
    const pads = svg('g', { class: 'pads' });
    for (const p of Object.values(PADS)) {
      pads.append(svg('circle', { cx: p.x, cy: p.y, r: 6.5, class: 'pad pad-' + p.group, 'data-pt': p.id }));
      pads.append(svg('circle', { cx: p.x, cy: p.y, r: 2.6, class: 'pad-hole' }));
    }
    s.append(pads);

    this.hiLayer = svg('g', { class: 'hi-layer' });
    this.chipLayer = svg('g', { class: 'chip-layer' });
    this.guideLayer = svg('g', { class: 'guide-layer' });
    this.wireLayer = svg('g', { class: 'wire-layer' });
    this.overLayer = svg('g', { class: 'over-layer' });
    s.append(this.hiLayer, this.chipLayer, this.guideLayer, this.wireLayer, this.overLayer);

    this.host.append(s);
    this.bindPointer();
    this.applyView();
  }

  panel(x, y, w, h, title) {
    const g = svg('g', { class: 't-panel' });
    g.append(svg('rect', { x, y, width: w, height: h, rx: 8 }));
    const t = svg('text', { x: x + 10, y: y + 17, class: 't-title' });
    t.textContent = title;
    g.append(t);
    return g;
  }

  buildTop(s) {
    const g = svg('g');
    this.ledEls = [];
    for (let i = 0; i < 8; i++) {
      const x = 78 + i * 50;
      const glow = svg('circle', { cx: x, cy: 78, r: 24, fill: 'rgba(255,60,50,.55)', class: 'led-glow' });
      const body = svg('circle', { cx: x, cy: 78, r: 12, class: 'led' });
      g.append(glow, body, svg('ellipse', { cx: x - 4, cy: 73, rx: 3.5, ry: 2.2, class: 'led-shine' }));
      const t = svg('text', { x, y: 112, class: 't-small' }); t.textContent = 'L' + (i + 1);
      g.append(t);
      this.ledEls.push({ body, glow });
    }
    // 7-seg
    const sx = 548, sy = 50;
    const segPath = {
      a: `M${sx + 8},${sy} h36 l-5,6 h-26 z`,
      b: `M${sx + 46},${sy + 2} v40 l-6,-4 v-30 z`,
      c: `M${sx + 46},${sy + 48} v40 l-6,-6 v-30 z`,
      d: `M${sx + 8},${sy + 90} h36 l-5,-6 h-26 z`,
      e: `M${sx + 6},${sy + 48} v40 l6,-6 v-30 z`,
      f: `M${sx + 6},${sy + 2} v40 l6,-4 v-30 z`,
      g: `M${sx + 9},${sy + 45} l4,-4 h26 l4,4 l-4,4 h-26 z`,
    };
    g.append(svg('rect', { x: sx - 12, y: sy - 10, width: 76, height: 110, rx: 4, class: 'seg-bezel' }));
    this.segEls = {};
    for (const [k, d] of Object.entries(segPath)) {
      const p = svg('path', { d, class: 'seg' });
      g.append(p);
      this.segEls[k] = p;
    }
    this.segModeText = svg('text', { x: 574, y: 182, class: 't-small seg-mode', role: 'button', tabindex: 0, 'data-act': 'segmode' });
    g.append(this.segModeText);
    ['a', 'b', 'c', 'd', 'e', 'f', 'g'].forEach((k, i) => {
      const t = svg('text', { x: 497 + i * 22, y: 158, class: 't-small' }); t.textContent = k; g.append(t);
    });

    // probe
    g.append(svg('rect', { x: 684, y: 52, width: 88, height: 70, rx: 5, class: 'probe-screen' }));
    this.probeText = svg('text', { x: 728, y: 94, class: 'probe-text' });
    g.append(this.probeText);
    this.probeLeds = ['HI', 'LO'].map((l, i) => {
      const c = svg('circle', { cx: 700 + i * 30, cy: 136, r: 5, class: 'probe-led' });
      const t = svg('text', { x: 712 + i * 30, y: 139, class: 't-tiny' }); t.textContent = l;
      g.append(c, t);
      return c;
    });

    // clock
    this.clkLed = svg('circle', { cx: 960, cy: 52, r: 5, class: 'probe-led' });
    g.append(this.clkLed);
    this.clkFreqText = svg('text', { x: 886, y: 76, class: 'clk-freq' });
    g.append(this.clkFreqText);
    this.clkButtons = [];
    const btn = (x, y, w, label, act) => {
      const b = svg('g', { class: 't-btn', role: 'button', tabindex: 0, 'data-act': act });
      b.append(svg('rect', { x, y, width: w, height: 22, rx: 4 }));
      const t = svg('text', { x: x + w / 2, y: y + 15 }); t.textContent = label;
      b.append(t);
      g.append(b);
      this.clkButtons.push(b);
      return b;
    };
    btn(802, 88, 40, '−', 'clk-slow');
    btn(846, 88, 82, 'Run', 'clk-run');
    btn(932, 88, 40, '+', 'clk-fast');
    btn(846, 114, 82, 'Single step', 'clk-step');
    const t1 = svg('text', { x: 858, y: 172, class: 't-tiny' }); t1.textContent = 'Q';
    const t2 = svg('text', { x: 900, y: 172, class: 't-tiny' }); t2.textContent = 'Q̅';
    g.append(t1, t2);
    s.append(g);
  }

  buildBottom(s) {
    const g = svg('g');
    // power switch
    this.pwrBtn = svg('g', { class: 't-toggle pwr', role: 'switch', tabindex: 0, 'data-act': 'power' });
    this.pwrBtn.append(svg('rect', { x: 140, y: 528, width: 42, height: 22, rx: 11, class: 'tg-track' }));
    this.pwrKnob = svg('circle', { cx: 171, cy: 539, r: 8, class: 'tg-knob' });
    this.pwrBtn.append(this.pwrKnob);
    g.append(this.pwrBtn);
    const tp = svg('text', { x: 161, y: 568, class: 't-small' }); tp.textContent = 'Power';
    this.pwrLed = svg('circle', { cx: 161, cy: 590, r: 5, class: 'probe-led' });
    g.append(tp, this.pwrLed);
    const l1 = svg('text', { x: 92, y: 562, class: 't-small' }); l1.textContent = '+5 V';
    const l2 = svg('text', { x: 92, y: 622, class: 't-small' }); l2.textContent = 'GND (0 V)';
    g.append(l1, l2);
    const help = svg('text', { x: 40, y: 660, class: 't-tiny left' });
    help.textContent = 'Run +5V and GND to the rails first';
    g.append(help);

    // switches
    this.swEls = [];
    for (let i = 0; i < 8; i++) {
      const x = 262 + i * 58;
      const sw = svg('g', { class: 't-switch', role: 'switch', tabindex: 0, 'data-act': 'sw' + i, 'aria-label': 'Switch S' + (i + 1) });
      sw.append(svg('rect', { x: x - 11, y: 556, width: 22, height: 58, rx: 4, class: 'sw-slot' }));
      const lever = svg('rect', { x: x - 8, y: 560, width: 16, height: 26, rx: 3, class: 'sw-lever' });
      sw.append(lever);
      g.append(sw);
      const lab = svg('text', { x, y: 632, class: 't-small' }); lab.textContent = 'S' + (i + 1);
      const val = svg('text', { x, y: 650, class: 'sw-val' });
      g.append(lab, val);
      this.swEls.push({ sw, lever, val });
    }
    const swHelp = svg('text', { x: 470, y: 668, class: 't-tiny' });
    swHelp.textContent = 'Click a switch or press keys 1–8';
    g.append(swHelp);

    // pulsers
    this.pbEls = [];
    for (let i = 0; i < 2; i++) {
      const x = 789 + i * 100;
      const b = svg('g', { class: 't-pulser', role: 'button', tabindex: 0, 'data-act': 'pb' + i });
      b.append(svg('circle', { cx: x, cy: 590, r: 22, class: 'pb-ring' }));
      const cap = svg('circle', { cx: x, cy: 590, r: 15, class: 'pb-cap' });
      b.append(cap);
      g.append(b);
      const lab = svg('text', { x, y: 636, class: 't-small' }); lab.textContent = 'P' + (i + 1);
      g.append(lab);
      this.pbEls.push(cap);
    }
    s.append(g);
  }

  // ------------------------------------------------------------------ view / zoom
  applyView() {
    const { x, y, w, h } = this.vb;
    this.svg.setAttribute('viewBox', `${x} ${y} ${w} ${h}`);
  }
  zoom(f, cx, cy) {
    const v = this.vb;
    const nw = Math.min(VIEW.w * 1.4, Math.max(220, v.w * f));
    const k = nw / v.w;
    if (cx == null) { cx = v.x + v.w / 2; cy = v.y + v.h / 2; }
    v.x = cx - (cx - v.x) * k;
    v.y = cy - (cy - v.y) * k;
    v.w = nw;
    v.h = v.h * k;
    this.applyView();
  }
  fit() { this.vb = { x: 0, y: 0, w: VIEW.w, h: VIEW.h }; this.applyView(); }
  focusBreadboard() {
    // match the stage's shape so a tall phone screen still zooms in on the holes
    const r = this.svg.getBoundingClientRect();
    if (!(r.width > 0 && r.height > 0)) { requestAnimationFrame(() => { if (this.svg.getBoundingClientRect().width > 0) this.focusBreadboard(); }); }
    const a = r.width > 0 && r.height > 0 ? r.width / r.height : 3.2;
    const w = a >= 3 ? 950 : Math.max(520, Math.min(950, 570 * a));
    const h = w / a;
    this.vb = { x: 30, y: 346 - h / 2, w, h }; this.applyView();
  }

  toSvg(evt) {
    const pt = this.svg.createSVGPoint();
    pt.x = evt.clientX; pt.y = evt.clientY;
    return pt.matrixTransform(this.svg.getScreenCTM().inverse());
  }

  // nearest connection point to an svg coordinate
  hitPoint(x, y) {
    let best = null, bd = 9 * 9;
    for (const p of Object.values(PADS)) {
      const d = (p.x - x) ** 2 + (p.y - y) ** 2;
      if (d < bd * 1.6) { bd = d; best = p.id; }
    }
    if (best) return best;
    const c = Math.round((x - colX(0)) / P);
    if (c < 0 || c >= COLS) return null;
    let br = null; bd = 7.5 * 7.5;
    for (const [r, ry] of Object.entries(ROWS)) {
      if (RAIL_ROWS.includes(r) && !railHasHole(c)) continue;
      const d = (colX(c) - x) ** 2 + (ry - y) ** 2;
      if (d < bd) { bd = d; br = r; }
    }
    return br ? holeId(br, c) : null;
  }

  hitChip(x, y) {
    for (const c of this.t.chips) {
      const span = chipSpan(c.type);
      const x0 = colX(c.col) - 7, x1 = colX(c.col + span - 1) + 7;
      if (x >= x0 && x <= x1 && y >= ROWS.e + 5 && y <= ROWS.f - 5) return c;
    }
    return null;
  }

  hitWire(target) {
    const g = target.closest?.('[data-wire]');
    return g ? this.t.wires.find(w => w.id === g.dataset.wire) : null;
  }

  // ------------------------------------------------------------------ pointer
  bindPointer() {
    const s = this.svg;
    let down = null;
    this.resetGesture = () => { down = null; this.pending = null; this.renderOverlay(); };
    addPinch(this);

    addViewControls(this);

    s.addEventListener('pointerdown', (e) => {
      if (e.button === 2) return;
      const p = this.toSvg(e);
      const act = e.target.closest?.('[data-act]');
      if (act) { this.control(act.dataset.act, true); down = { act: act.dataset.act }; e.preventDefault(); return; }
      down = { x: e.clientX, y: e.clientY, lastY: e.clientY, p, moved: false, vb: { ...this.vb }, id: e.pointerId, touch: e.pointerType === 'touch' || e.pointerType === 'pen' };
      // Space + drag or the middle button always moves the board, locked or not
      if (this.forcePan(e)) { e.preventDefault(); down.force = true; s.setPointerCapture(e.pointerId); return; }
      if (this.readonly) { s.setPointerCapture(e.pointerId); return; }
      const chip = this.mode === 'wire' ? this.hitChip(p.x, p.y) : null;
      const pt = this.hitPoint(p.x, p.y);
      if (chip && !this.pending) {
        down.chip = chip; down.chipCol = chip.col;
      } else if (pt && this.mode === 'wire') {
        down.pt = pt;
      }
      s.setPointerCapture(e.pointerId);
    });

    s.addEventListener('pointermove', (e) => {
      const p = this.toSvg(e);
      if (down && !down.act) {
        const dx = e.clientX - down.x, dy = e.clientY - down.y;
        if (!down.moved && dx * dx + dy * dy > 25) down.moved = true;
        if (down.moved) {
          if (down.force) {
            const r = this.svg.getBoundingClientRect(), k = down.vb.w / r.width;
            this.vb.x = down.vb.x - dx * k; this.vb.y = down.vb.y - dy * k;
            this.applyView();
          } else if (down.chip) {
            const nc = Math.round((p.x - down.p.x) / P) + down.chipCol;
            if (nc !== down.chip.col && this.t.canPlaceChip(down.chip.type, nc, down.chip.id)) {
              down.chip.col = nc;
              this.render();
              this.hooks.change(true);
            }
          } else if (down.pt) {
            if (!this.pending) this.pending = down.pt;
          } else if (this.dragPans()) {
            const r = this.svg.getBoundingClientRect();
            const k = down.vb.w / r.width;
            this.vb.x = down.vb.x - dx * k;
            this.vb.y = down.vb.y - dy * k;
            this.applyView();
          } else if (down.touch) {
            // locked: a one-finger swipe scrolls the page, the board stays where it is
            this.lockedTouchScroll(down.lastY - e.clientY);
            down.lastY = e.clientY;
          } else this.lockedHint();
        }
      }
      this.onHover(p, e.target);
    });

    const finish = (e) => {
      if (!down) return;
      if (down.act) { this.control(down.act, false); down = null; return; }
      if (down.force) { down = null; return; }
      const p = this.toSvg(e);
      if (this.readonly) {
        if (!down.moved) { const c = this.hitChip(p.x, p.y); if (c) this.hooks.select({ kind: 'chip', id: c.id }); }
        down = null; return;
      }
      if (down.chip && down.moved) { this.hooks.change(); down = null; return; }
      if (this.mode === 'place' && !down.moved) {
        this.placeAt(p);
      } else if (!down.moved || down.pt) {
        const pt = this.hitPoint(p.x, p.y);
        const wire = this.hitWire(e.target);
        if (this.pending) {
          if (pt && pt !== this.pending) { this.tryWire(this.pending, pt); this.pending = null; }
          else if (!pt || down.moved) this.pending = null;
          // a plain click on the start point keeps it armed (click-click wiring)
        } else if (down.moved) {
          // drag that never armed a wire
        } else if (wire) {
          this.select({ kind: 'wire', id: wire.id });
        } else if (down.chip) {
          this.select({ kind: 'chip', id: down.chip.id });
        } else if (pt) {
          const occ = this.t.occupied().get(pt);
          if (occ && occ.chip) this.select({ kind: 'chip', id: occ.chip.id });
          else if (occ && occ.wire && !PADS[pt]) this.select({ kind: 'wire', id: occ.wire.id });
          else this.pending = pt;
        } else {
          this.select(null);
        }
      }
      down = null;
      this.renderOverlay();
    };
    s.addEventListener('pointerup', finish);
    s.addEventListener('pointercancel', () => { down = null; });
    s.addEventListener('pointerleave', () => { this.hoverPt = null; this.renderHighlight(); });

    s.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (this.readonly) return;
      const wire = this.hitWire(e.target);
      const p = this.toSvg(e);
      if (wire) { this.removeWire(wire.id); return; }
      const chip = this.hitChip(p.x, p.y);
      if (chip) this.removeChip(chip.id);
      this.pending = null;
      this.renderOverlay();
    });

    s.addEventListener('dblclick', (e) => {
      if (this.readonly) return;
      const wire = this.hitWire(e.target);
      if (wire) this.removeWire(wire.id);
    });

    s.addEventListener('keydown', (e) => {
      const act = e.target.closest?.('[data-act]');
      if (act && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        this.control(act.dataset.act, true);
        if (act.dataset.act.startsWith('pb')) setTimeout(() => this.control(act.dataset.act, false), 180);
      }
    });
  }

  control(act, pressed) {
    if (act.startsWith('pb')) { this.hooks.pulser(+act[2], pressed); return; }
    if (!pressed) return;
    if (act.startsWith('sw')) this.hooks.toggleSwitch(+act.slice(2));
    else if (act === 'power') this.hooks.power();
    else if (act === 'segmode') this.hooks.segMode();
    else if (act.startsWith('clk')) this.hooks.clock(act.slice(4));
  }

  onHover(p, target) {
    let pt = this.hitPoint(p.x, p.y);
    const wire = this.hitWire(target);
    const chip = !pt || /^[ef]\d/.test(pt) ? this.hitChip(p.x, p.y) : null;
    this.hoverWire = wire ? wire.id : null;
    if (this.mode === 'place') {
      this.ghostCol = Math.round((p.x - colX(0)) / P) - Math.floor(chipSpan(this.placeType) / 2) + 1;
      this.renderOverlay();
      return;
    }
    if (pt !== this.hoverPt || this.hoverChip !== chip?.id || this.lastHoverWire !== this.hoverWire) {
      this.hoverPt = pt;
      this.hoverChip = chip?.id;
      this.lastHoverWire = this.hoverWire;
      this.renderHighlight();
      this.hooks.hover({ point: pt, chip, wire });
    }
    if (this.pending) { this.cursor = p; this.renderOverlay(); }
  }

  // ------------------------------------------------------------------ edits
  // an occupied hole stands for its whole strip: use the nearest free hole in it
  freeInStrip(h) {
    if (PADS[h]) return h;
    const occ = this.t.occupied();
    if (!occ.has(h)) return h;
    const p = parsePoint(h);
    const cands = [];
    if (RAIL_ROWS.includes(p.row)) {
      for (let d = 1; d < COLS; d++) for (const c of [p.col - d, p.col + d]) if (c >= 0 && c < COLS && railHasHole(c)) cands.push(holeId(p.row, c));
    } else {
      const rows = TOP_ROWS.includes(p.row) ? TOP_ROWS : BOT_ROWS;
      const i = rows.indexOf(p.row);
      rows.map((r, k) => [r, Math.abs(k - i)]).sort((x, y) => x[1] - y[1]).forEach(([r]) => cands.push(holeId(r, p.col)));
    }
    return cands.find(c => !occ.has(c)) || null;
  }

  tryWire(a, b) {
    const fa = this.freeInStrip(a), fb = this.freeInStrip(b);
    if (!fa || !fb) { this.hooks.notify('That strip is full. Use a hole in another column.', 'bad'); return; }
    a = fa; b = fb;
    if (baseNode(a) === baseNode(b)) { this.hooks.notify('Both ends are already connected through the breadboard strip, so that wire would do nothing.'); return; }
    let color = this.wireColor;
    if (color === 'auto') color = this.autoColor(a, b);
    this.t.addWire(a, b, color);
    this.hooks.change();
  }

  autoColor(a, b) {
    this.t.buildNets();
    const n = [this.t.netOf(a), this.t.netOf(b)];
    if (n.includes(this.t.uf.find('VCC')) || [a, b].some(x => /^(tp|bp)/.test(x) || PADS[x]?.group === 'vcc')) return 'red';
    if (n.includes(this.t.uf.find('GND')) || [a, b].some(x => /^(tn|bn)/.test(x) || PADS[x]?.group === 'gnd')) return 'black';
    const pads = [a, b].map(x => PADS[x]?.group);
    if (pads.includes('sw') || pads.includes('pb') || pads.includes('pbn')) return 'yellow';
    if (pads.includes('led') || pads.includes('seg')) return 'green';
    if (pads.includes('clk') || pads.includes('clkn')) return 'purple';
    return ['blue', 'orange', 'white', 'green'][this.t.wires.length % 4];
  }

  placeAt(p) {
    const span = chipSpan(this.placeType);
    const col = Math.round((p.x - colX(0)) / P) - Math.floor(span / 2) + 1;
    if (!this.t.canPlaceChip(this.placeType, col)) { this.hooks.notify('A chip has to straddle the centre channel on free holes.', 'bad'); return; }
    const c = this.t.addChip(this.placeType, col);
    this.hooks.change();
    this.select({ kind: 'chip', id: c.id });
    this.hooks.placed?.();
  }

  removeWire(id) {
    this.t.wires = this.t.wires.filter(w => w.id !== id);
    if (this.selected?.id === id) this.selected = null;
    this.hooks.change();
  }
  removeChip(id) {
    this.t.chips = this.t.chips.filter(c => c.id !== id);
    if (this.selected?.id === id) this.selected = null;
    this.hooks.change();
  }
  deleteSelected() {
    if (!this.selected) return false;
    if (this.selected.kind === 'wire') this.removeWire(this.selected.id);
    else this.removeChip(this.selected.id);
    this.hooks.select(null);
    return true;
  }
  select(sel) {
    this.selected = sel;
    this.render();
    this.hooks.select(sel);
  }
  setMode(mode, type) {
    this.mode = mode;
    this.placeType = type || null;
    this.pending = null;
    this.svg.classList.toggle('is-placing', mode === 'place');
    this.renderOverlay();
  }
  cancel() {
    if (this.pending) { this.pending = null; this.renderOverlay(); return true; }
    if (this.mode === 'place') { this.setMode('wire'); this.hooks.placed?.(); return true; }
    if (this.selected) { this.select(null); return true; }
    return false;
  }

  // ------------------------------------------------------------------ dynamic render
  render() {
    this.renderChips();
    this.renderWires();
    this.renderIndicators();
    this.renderHighlight();
    this.renderGuide();
    this.renderOverlay();
  }

  renderChips() {
    const L = this.chipLayer;
    L.replaceChildren();
    const res = this.t.result;
    for (const c of this.t.chips) {
      const def = CHIPS[c.type];
      const span = def.pins / 2;
      const x0 = colX(c.col) - 6.5, x1 = colX(c.col + span - 1) + 6.5;
      const g = svg('g', { class: 'chip' + (this.selected?.id === c.id ? ' is-selected' : '') + (c.burnt ? ' is-burnt' : '') + (c.powered ? ' is-powered' : ''), 'data-chip': c.id });
      // legs
      for (let p = 1; p <= def.pins; p++) {
        const { x, y } = pointXY(pinHole(c, p));
        const lv = c.powered && res ? res.read(pinHole(c, p)) : null;
        g.append(svg('rect', { x: x - 2.6, y: y - 3, width: 5.2, height: 6, rx: 1, class: 'leg' + (lv === 1 ? ' hi' : lv === 0 ? ' lo' : '') }));
      }
      g.append(svg('rect', { x: x0, y: ROWS.e + 2, width: x1 - x0, height: ROWS.f - ROWS.e - 4, rx: 2.5, class: 'chip-body' }));
      g.append(svg('path', { d: `M${x0},${(ROWS.e + ROWS.f) / 2 - 4.5} a4.5,4.5 0 0 1 0,9`, class: 'chip-notch' }));
      g.append(svg('circle', { cx: x0 + 4.5, cy: ROWS.f - 6.5, r: 1.4, class: 'chip-dot' }));
      const t = svg('text', { x: (x0 + x1) / 2 + 2, y: (ROWS.e + ROWS.f) / 2 + 1, class: 'chip-label' });
      t.textContent = c.type.startsWith('74') ? '74LS' + c.type.slice(2) : 'CD' + c.type;
      const r = svg('text', { x: (x0 + x1) / 2 + 2, y: (ROWS.e + ROWS.f) / 2 + 9, class: 'chip-ref' });
      r.textContent = c.ref;
      g.append(t, r);
      if (c.burnt) {
        g.append(svg('path', { d: `M${(x0 + x1) / 2 - 8},${ROWS.e - 2} q-6,-14 4,-22 q10,-8 2,-20`, class: 'smoke' }));
      }
      L.append(g);
    }
  }

  wirePath(a, b) {
    const A = pointXY(a), B = pointXY(b);
    if (this.wireStyle === 'straight') return `M${A.x},${A.y} L${B.x},${B.y}`;
    const dx = B.x - A.x, dy = B.y - A.y;
    const len = Math.hypot(dx, dy) || 1;
    const lift = Math.min(60, 10 + len * 0.18);
    // bow upward on screen (like a wire arcing above the board)
    let nx = -dy / len, ny = dx / len;
    if (ny > 0) { nx = -nx; ny = -ny; }
    const mx = (A.x + B.x) / 2 + nx * lift, my = (A.y + B.y) / 2 + ny * lift;
    return `M${A.x},${A.y} Q${mx},${my} ${B.x},${B.y}`;
  }

  renderWires() {
    const L = this.wireLayer;
    L.replaceChildren();
    const res = this.t.result;
    const hoverNet = this.hoverNet();
    for (const w of this.t.wires) {
      const d = this.wirePath(w.a, w.b);
      const lv = res ? res.read(w.a) : null;
      const col = this.levelView ? LEVEL_COL[lv] : WIRE_COLORS[w.color] || w.color;
      const sel = this.selected?.id === w.id;
      const inNet = hoverNet && this.t.netOf(w.a) === hoverNet;
      const dim = hoverNet && !inNet;
      const g = svg('g', { class: 'wire' + (sel ? ' is-selected' : '') + (this.focusWire === w.id ? ' is-focus' : '') + (inNet ? ' in-net' : '') + (dim ? ' is-dim' : '') + (this.levelView && lv === 1 ? ' is-live' : ''), 'data-wire': w.id });
      g.append(svg('path', { d, class: 'w-hit' }));
      g.append(svg('path', { d, class: 'w-shadow' }));
      g.append(svg('path', { d, class: 'w-core', stroke: col }));
      g.append(svg('path', { d, class: 'w-gloss' }));
      if (this.levelView && lv === 1) g.append(svg('path', { d, class: 'w-flow' }));
      for (const pt of [w.a, w.b]) {
        const { x, y } = pointXY(pt);
        g.append(svg('circle', { cx: x, cy: y, r: 3.3, class: 'w-end', fill: col }));
      }
      const t = svg('title');
      t.textContent = `${describePoint(w.a)} ↔ ${describePoint(w.b)}  (right-click or double-click to remove)`;
      g.append(t);
      L.append(g);
    }
  }

  hoverNet() {
    if (!this.t.uf) this.t.buildNets();
    if (this.hoverWire) { const w = this.t.wires.find(x => x.id === this.hoverWire); if (w) return this.t.netOf(w.a); }
    if (this.hoverPt) return this.t.netOf(this.hoverPt);
    return null;
  }

  renderHighlight() {
    const L = this.hiLayer;
    L.replaceChildren();
    this.stripLayer.replaceChildren();
    const net = this.hoverNet();
    if (!net) { this.wireLayer.classList.remove('has-focus'); this.renderWires(); return; }
    // every base node belonging to this net
    const nodes = new Set();
    const consider = (base) => { if (this.t.uf.find(base) === net) nodes.add(base); };
    for (let c = 0; c < COLS; c++) { consider('T' + c); consider('B' + c); }
    for (const r of RAIL_ROWS) consider('R:' + r);
    for (const p of Object.values(PADS)) consider(baseNode(p.id));
    for (const n of nodes) {
      if (n[0] === 'T' || n[0] === 'B') {
        const c = +n.slice(1);
        const rows = n[0] === 'T' ? TOP_ROWS : BOT_ROWS;
        this.stripLayer.append(svg('rect', { x: colX(c) - 5.5, y: ROWS[rows[0]] - 6, width: 11, height: ROWS[rows[4]] - ROWS[rows[0]] + 12, rx: 3, class: 'strip-hi' }));
      } else if (n.startsWith('R:')) {
        const r = n.slice(2);
        this.stripLayer.append(svg('rect', { x: colX(0) - 6, y: ROWS[r] - 5.5, width: colX(COLS - 1) - colX(0) + 12, height: 11, rx: 3, class: 'strip-hi' }));
      } else {
        for (const p of Object.values(PADS)) if (baseNode(p.id) === n) L.append(svg('circle', { cx: p.x, cy: p.y, r: 10, class: 'pad-hi' }));
      }
    }
    this.renderWires();
  }

  renderIndicators() {
    const t = this.t, res = t.result;
    res?.leds.forEach((on, i) => {
      this.ledEls[i].body.classList.toggle('on', on);
      this.ledEls[i].glow.classList.toggle('on', on);
    });
    ['a', 'b', 'c', 'd', 'e', 'f', 'g'].forEach((k, i) => this.segEls[k].classList.toggle('on', !!res?.seg[i]));
    this.segModeText.textContent = t.segMode === 'cc' ? 'Common cathode (click)' : 'Common anode (click)';
    const pv = res?.probe;
    this.probeText.textContent = !t.power ? 'OFF' : pv === 1 ? 'HIGH' : pv === 0 ? 'LOW' : pv === 'X' ? 'CLASH' : 'FLOAT';
    this.probeText.setAttribute('class', 'probe-text ' + (pv === 1 ? 'hi' : pv === 0 ? 'lo' : pv === 'X' ? 'x' : ''));
    this.probeLeds[0].classList.toggle('on-hi', pv === 1);
    this.probeLeds[1].classList.toggle('on-lo', pv === 0);
    this.swEls.forEach((s, i) => {
      const on = t.switches[i];
      s.lever.setAttribute('y', on ? 560 : 584);
      s.lever.classList.toggle('on', !!on);
      s.val.textContent = on ? '1' : '0';
      s.sw.setAttribute('aria-checked', on ? 'true' : 'false');
    });
    this.pbEls.forEach((c, i) => c.classList.toggle('down', !!t.pulsers[i]));
    this.pwrKnob.setAttribute('cx', t.power ? 171 : 151);
    this.pwrBtn.classList.toggle('on', t.power);
    this.pwrBtn.setAttribute('aria-checked', t.power ? 'true' : 'false');
    this.pwrLed.classList.toggle('on-hi', t.power && !res?.shorted);
    this.pwrLed.classList.toggle('on-x', !!res?.shorted);
    this.clkLed.classList.toggle('on-hi', t.power && !!t.clock);
  }

  setClockInfo(hz, running) {
    this.clkFreqText.textContent = hz < 1 ? `${hz} Hz` : `${hz} Hz`;
    const run = this.clkButtons.find(b => b.dataset.act === 'clk-run');
    run.querySelector('text').textContent = running ? 'Stop' : 'Run';
    run.classList.toggle('active', running);
  }

  renderGuide() {
    const L = this.guideLayer;
    L.replaceChildren();
    const g = this.guide;
    if (!g) return;
    for (const c of g.chips) {
      if (this.t.chips.some(x => x.type === c.type && x.col === c.col)) continue;
      const span = chipSpan(c.type);
      const x0 = colX(c.col) - 6.5, x1 = colX(c.col + span - 1) + 6.5;
      L.append(svg('rect', { x: x0, y: ROWS.e - 4, width: x1 - x0, height: ROWS.f - ROWS.e + 8, rx: 3, class: 'ghost-chip' }));
      const t = svg('text', { x: (x0 + x1) / 2, y: (ROWS.e + ROWS.f) / 2 + 3, class: 'ghost-label' });
      t.textContent = c.type;
      L.append(t);
    }
    g.wires.forEach((w, i) => {
      const done = this.t.wires.some(x => this.sameConn(x, w));
      if (done) return;
      const active = i === g.step;
      const p = svg('path', { d: this.wirePath(w.a, w.b), class: 'ghost-wire' + (active ? ' is-active' : '') });
      L.append(p);
      if (active) {
        for (const pt of [w.a, w.b]) {
          const { x, y } = pointXY(pt);
          L.append(svg('circle', { cx: x, cy: y, r: 7, class: 'ghost-end' }));
        }
      }
    });
  }

  // a guide wire counts as done if some real wire joins the same two strips
  sameConn(x, w) {
    const A = baseNode(x.a), B = baseNode(x.b), a = baseNode(w.a), b = baseNode(w.b);
    return (A === a && B === b) || (A === b && B === a);
  }

  renderOverlay() {
    const L = this.overLayer;
    L.replaceChildren();
    if (this.pending) {
      const A = pointXY(this.pending);
      L.append(svg('circle', { cx: A.x, cy: A.y, r: 6, class: 'pending-end' }));
      if (this.cursor) {
        const tgt = this.hitPoint(this.cursor.x, this.cursor.y);
        const B = tgt ? pointXY(tgt) : this.cursor;
        L.append(svg('line', { x1: A.x, y1: A.y, x2: B.x, y2: B.y, class: 'rubber' }));
        if (tgt) L.append(svg('circle', { cx: B.x, cy: B.y, r: 6, class: 'pending-end' }));
      }
    }
    if (this.mode === 'place' && this.placeType && this.ghostCol != null) {
      const span = chipSpan(this.placeType);
      const ok = this.t.canPlaceChip(this.placeType, this.ghostCol);
      const c0 = Math.max(0, Math.min(COLS - span, this.ghostCol));
      const x0 = colX(c0) - 6.5, x1 = colX(c0 + span - 1) + 6.5;
      L.append(svg('rect', { x: x0, y: ROWS.e - 4, width: x1 - x0, height: ROWS.f - ROWS.e + 8, rx: 3, class: 'place-ghost' + (ok ? '' : ' bad') }));
      const t = svg('text', { x: (x0 + x1) / 2, y: (ROWS.e + ROWS.f) / 2 + 3, class: 'ghost-label' });
      t.textContent = this.placeType;
      L.append(t);
    }
    if (this.hoverPt && !this.pending && this.mode === 'wire') {
      const { x, y } = pointXY(this.hoverPt);
      L.append(svg('circle', { cx: x, cy: y, r: 5.5, class: 'hover-ring' }));
    }
  }
}
