// Analog trainer renderer and pointer handling.
import { svg, fmtSI } from '../shared/site.js';
import { addPinch } from '../shared/pinch.js';
import {
  VIEW, APADS, COLS, ROWS, TOP_ROWS, BOT_ROWS, RAIL_ROWS, colX, holeId, railHasHole,
  parsePoint, pointXY, baseNode, partHoles, opampPin, PARTS, LED_RGB, partLabel, describePoint, DIP8, THREE, LEG_NAMES, isDip, dipCount,
} from './atrainer.js';

const P = 15;
const ROW_ORDER = ['tp', 'tn', 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'bp', 'bn'];
function shiftHole(h, dc, dr) {
  const m = /^(tp|tn|bp|bn|[a-j])(\d+)$/.exec(h);
  if (!m) return null;
  const ri = ROW_ORDER.indexOf(m[1]) + dr, col = +m[2] - 1 + dc;
  if (ri < 0 || ri >= ROW_ORDER.length || col < 0 || col >= COLS) return null;
  const row = ROW_ORDER[ri];
  if (RAIL_ROWS.includes(row) && !railHasHole(col)) return null;
  return holeId(row, col);
}
export const AWIRE_COLORS = {
  red: '#d62b2b', black: '#23262a', blue: '#2563c9', green: '#1f9a4c',
  yellow: '#e8b80c', orange: '#ec7a1c', white: '#f1f1ec', purple: '#7d4bc4',
};
// instrument leads drawn as real probes
const PROBES = {
  dmmV: { label: 'V', color: '#d62b2b', kind: 'needle' },
  dmmC: { label: 'COM', color: '#23262a', kind: 'needle' },
  ch1: { label: 'CH1', color: '#f2c40f', kind: 'clip', dark: true },
  ch2: { label: 'CH2', color: '#23b5c9', kind: 'clip', dark: true },
  ch1g: { label: 'CH1 ⏚', color: '#23262a', kind: 'clip' },
  ch2g: { label: 'CH2 ⏚', color: '#23262a', kind: 'clip' },
  a1in: { label: 'A1 +', color: '#ec7a1c', kind: 'needle' },
  a1out: { label: 'A1 −', color: '#23262a', kind: 'needle' },
  a2in: { label: 'A2 +', color: '#ec7a1c', kind: 'needle' },
  a2out: { label: 'A2 −', color: '#23262a', kind: 'needle' },
};
const BAND = ['#1b1b1b', '#7b4a1e', '#d22d2d', '#ef7d1a', '#f2d01b', '#1f9a4c', '#2563c9', '#7d4bc4', '#8a8a8a', '#f4f4f4'];

function resistorBands(v) {
  if (!(v > 0)) return [BAND[0], BAND[0], BAND[0]];
  const exp = Math.floor(Math.log10(v)) - 1;
  const sig = Math.round(v / 10 ** exp);
  const d1 = Math.floor(sig / 10) % 10, d2 = sig % 10;
  const m = exp < 0 ? (exp === -1 ? '#c9a227' : '#bfc4c8') : BAND[Math.min(9, exp)];
  return [BAND[d1], BAND[d2], m];
}

export class AnalogBoard {
  static count = 0;
  constructor(host, trainer, hooks) {
    this.host = host;
    this.t = trainer;
    this.hooks = hooks;
    this.readonly = false;
    this.mode = 'wire';
    this.place = null;          // { type, value, color }
    this.firstHole = null;      // first click while placing a 2-lead part
    this.preview = null;        // touch: part shown where it will go, waiting for "Place"
    this.touch = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
    this.pending = null;        // first end of a wire
    this.wireColor = 'auto';
    this.selected = null;
    this.focusIds = new Set();
    this.vb = { x: 0, y: 0, w: VIEW.w, h: VIEW.h };
    this.uid = ++AnalogBoard.count;
    this.build();
  }

  // ------------------------------------------------------------------ static art
  build() {
    const s = svg('svg', { class: 'trainer atrainer', viewBox: `0 0 ${VIEW.w} ${VIEW.h}`, role: 'img', 'aria-label': 'Analog trainer with breadboard' });
    this.svg = s;
    const defs = svg('defs');
    defs.innerHTML = `<linearGradient id="chipBody" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2b2f33"/><stop offset="1" stop-color="#15181a"/></linearGradient>
      <filter id="soft" x="-20%" y="-20%" width="140%" height="160%"><feDropShadow dx="0" dy="1.5" stdDeviation="1.4" flood-opacity=".45"/></filter>
      <clipPath id="scopeClip${this.uid}"><rect x="44" y="524" width="300" height="140"/></clipPath>
      <radialGradient id="ledHalo"><stop offset="0" stop-color="#fff" stop-opacity=".9"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>`;
    s.append(defs);
    s.append(svg('rect', { x: 8, y: 8, width: VIEW.w - 16, height: VIEW.h - 16, rx: 14, class: 't-case' }));
    const panel = (x, y, w, h, title) => {
      const g = svg('g', { class: 't-panel' });
      g.append(svg('rect', { x, y, width: w, height: h, rx: 8 }));
      const t = svg('text', { x: x + 10, y: y + 17, class: 't-title' }); t.textContent = title; g.append(t);
      s.append(g);
    };
    panel(30, 26, 290, 150, 'DC power supply');
    panel(330, 26, 200, 150, 'Function generator');
    panel(540, 26, 220, 150, 'Digital multimeter (DC volts)');
    panel(770, 26, 210, 150, 'DC ammeters');
    panel(30, 500, 420, 176, 'Oscilloscope inputs (ground is common)');
    panel(460, 500, 130, 176, 'Switches');
    panel(600, 500, 130, 176, 'Current source');
    panel(740, 500, 240, 176, 'Potentiometer 10 kΩ');

    // displays
    const disp = (x, y, w, h, cls = '') => {
      s.append(svg('rect', { x, y, width: w, height: h, rx: 4, class: 'a-screen ' + cls }));
      const t = svg('text', { x: x + w - 8, y: y + h / 2 + 6, class: 'a-digits ' + cls });
      s.append(t);
      return t;
    };
    this.dVar1 = disp(150, 54, 78, 30); this.dVar2 = disp(232, 54, 78, 30);
    this.dFix = svg('text', { x: 92, y: 74, class: 'a-small mid' }); this.dFix.textContent = '±12 V fixed'; s.append(this.dFix);
    this.dFg1 = disp(344, 52, 172, 26, 'fg'); this.dFg2 = disp(344, 82, 172, 26, 'fg');
    this.dDmm = disp(556, 52, 188, 50, 'big');
    this.dA1 = disp(784, 52, 84, 30); this.dA2 = disp(884, 52, 84, 30);
    const lab = (x, y, t, cls = 'a-small mid') => { const n = svg('text', { x, y, class: cls }); n.textContent = t; s.append(n); return n; };
    lab(189, 100, 'VAR 1'); lab(271, 100, 'VAR 2'); lab(826, 100, 'A1'); lab(926, 100, 'A2');
    lab(650, 122, 'Connect V and COM across the part');
    this.dCc = disp(612, 586, 106, 28);
    this.dPot = disp(752, 586, 216, 28);

    // mini scope screen
    s.append(svg('rect', { x: 44, y: 524, width: 300, height: 140, rx: 5, class: 'a-scope' }));
    for (let i = 1; i < 10; i++) s.append(svg('line', { x1: 44 + i * 30, x2: 44 + i * 30, y1: 524, y2: 664, class: 'a-grid' }));
    for (let j = 1; j < 8; j++) s.append(svg('line', { x1: 44, x2: 344, y1: 524 + j * 17.5, y2: 524 + j * 17.5, class: 'a-grid' }));
    this.tr1 = svg('polyline', { class: 'a-tr ch1', points: '', 'clip-path': `url(#scopeClip${this.uid})` });
    this.tr2 = svg('polyline', { class: 'a-tr ch2', points: '', 'clip-path': `url(#scopeClip${this.uid})` });
    s.append(this.tr1, this.tr2);
    this.scopeTxt = lab(194, 518, '', 'a-tiny mid');

    // switches + power
    this.swEls = {};
    for (const [k, y] of [['s1', 556], ['s2', 626]]) {
      const g = svg('g', { class: 't-toggle', role: 'switch', tabindex: 0, 'data-act': k });
      g.append(svg('rect', { x: 508, y: y - 11, width: 36, height: 22, rx: 11, class: 'tg-track' }));
      const knob = svg('circle', { cx: 519, cy: y, r: 8, class: 'tg-knob' });
      g.append(knob);
      s.append(g);
      lab(526, y + 26, k.toUpperCase());
      this.swEls[k] = { g, knob };
    }
    this.pwr = svg('g', { class: 't-toggle pwr', role: 'switch', tabindex: 0, 'data-act': 'power' });
    this.pwr.append(svg('rect', { x: 40, y: 110, width: 40, height: 22, rx: 11, class: 'tg-track' }));
    this.pwrKnob = svg('circle', { cx: 69, cy: 121, r: 8, class: 'tg-knob' });
    this.pwr.append(this.pwrKnob);
    s.append(this.pwr);
    lab(100, 125, 'Power', 'a-small');
    // pot buttons
    const btn = (x, y, w, t, act) => {
      const g = svg('g', { class: 't-btn', role: 'button', tabindex: 0, 'data-act': act });
      g.append(svg('rect', { x, y, width: w, height: 22, rx: 4 }));
      const tx = svg('text', { x: x + w / 2, y: y + 15 }); tx.textContent = t; g.append(tx);
      s.append(g);
    };
    btn(752, 624, 50, '◀', 'pot-dn'); btn(918, 624, 50, '▶', 'pot-up');
    lab(860, 640, 'turn', 'a-tiny mid');
    btn(612, 624, 50, '−', 'cc-dn'); btn(668, 624, 50, '+', 'cc-up');

    // breadboard (same geometry as the digital trainer)
    const bb = svg('g', { class: 'bb' });
    bb.append(svg('rect', { x: 36, y: 204, width: 940, height: 284, rx: 6, class: 'bb-body' }));
    bb.append(svg('rect', { x: 44, y: 340, width: 924, height: 10, rx: 2, class: 'bb-channel' }));
    const line = (y, cls) => bb.append(svg('line', { x1: 52, x2: 960, y1: y, y2: y, class: cls }));
    line(ROWS.tp - 9, 'rail-plus'); line(ROWS.tn + 9, 'rail-minus'); line(ROWS.bp - 9, 'rail-plus'); line(ROWS.bn + 9, 'rail-minus');
    const t = (x, y, txt, cls = 'bb-label') => { const n = svg('text', { x, y, class: cls }); n.textContent = txt; bb.append(n); };
    for (const r of RAIL_ROWS) { const plus = r.endsWith('p'); t(48, ROWS[r] + 4, plus ? '+' : '−', 'bb-sign ' + (plus ? 'plus' : 'minus')); t(964, ROWS[r] + 4, plus ? '+' : '−', 'bb-sign ' + (plus ? 'plus' : 'minus')); }
    for (const r of [...TOP_ROWS, ...BOT_ROWS]) { t(48, ROWS[r] + 3.5, r); t(962, ROWS[r] + 3.5, r); }
    for (let c = 0; c < COLS; c++) if (c === 0 || (c + 1) % 5 === 0) { t(colX(c), 258, String(c + 1), 'bb-num'); t(colX(c), 438, String(c + 1), 'bb-num'); }
    this.stripLayer = svg('g');
    bb.append(this.stripLayer);
    const holes = svg('g');
    for (let c = 0; c < COLS; c++) {
      for (const r of [...TOP_ROWS, ...BOT_ROWS]) holes.append(svg('rect', { x: colX(c) - 3.2, y: ROWS[r] - 3.2, width: 6.4, height: 6.4, rx: 1.2, class: 'hole' }));
      if (railHasHole(c)) for (const r of RAIL_ROWS) holes.append(svg('rect', { x: colX(c) - 3.2, y: ROWS[r] - 3.2, width: 6.4, height: 6.4, rx: 1.2, class: 'hole' }));
    }
    bb.append(holes);
    s.append(bb);

    // pads
    const pads = svg('g');
    for (const p of Object.values(APADS)) {
      pads.append(svg('circle', { cx: p.x, cy: p.y, r: 7, class: 'pad apad-' + p.group + (p.id === 'dmmV' ? ' red' : '') + (p.id === 'm12' ? ' neg' : '') }));
      pads.append(svg('circle', { cx: p.x, cy: p.y, r: 2.8, class: 'pad-hole' }));
      const tl = svg('text', { x: p.x, y: p.y - 12, class: 'a-tiny mid' }); tl.textContent = p.label; pads.append(tl);
    }
    s.append(pads);

    this.hiLayer = svg('g');
    this.partLayer = svg('g');
    this.wireLayer = svg('g');
    this.overLayer = svg('g');
    s.append(this.hiLayer, this.partLayer, this.wireLayer, this.overLayer);
    this.host.append(s);
    this.bind();
    this.applyView();
  }

  applyView() { const { x, y, w, h } = this.vb; this.svg.setAttribute('viewBox', `${x} ${y} ${w} ${h}`); }
  zoom(f, cx, cy) {
    const v = this.vb, nw = Math.min(VIEW.w * 1.4, Math.max(220, v.w * f)), k = nw / v.w;
    if (cx == null) { cx = v.x + v.w / 2; cy = v.y + v.h / 2; }
    v.x = cx - (cx - v.x) * k; v.y = cy - (cy - v.y) * k; v.w = nw; v.h *= k;
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
  // phone: zoom until holes sit about a fingertip apart, keeping the current spot centred
  comfortZoom() {
    const r = this.svg.getBoundingClientRect();
    if (!(r.width > 0 && r.height > 0)) return;
    const upp = P / 24;
    const w = Math.max(220, r.width * upp), h = w * (r.height / r.width);
    if (this.vb.w <= w * 1.05) return;
    const cx = Math.max(36 + w / 2, Math.min(976 - w / 2, this.vb.x + this.vb.w / 2));
    this.vb = { x: cx - w / 2, y: 346 - h / 2, w, h };
    this.applyView();
  }
  toSvg(e) { const pt = this.svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY; return pt.matrixTransform(this.svg.getScreenCTM().inverse()); }

  // board units per screen pixel: a finger needs a bigger catch radius than a mouse
  unitsPerPx() { const r = this.svg.getBoundingClientRect(); return r.width > 0 ? this.vb.w / r.width : 1; }
  tol(units, px) { return Math.max(units, (this.touch ? px : 0) * this.unitsPerPx()); }

  hitPoint(x, y) {
    const padR = this.tol(10.5, 20);
    for (const p of Object.values(APADS)) if ((p.x - x) ** 2 + (p.y - y) ** 2 < padR * padR) return p.id;
    const c = Math.round((x - colX(0)) / P);
    if (c < 0 || c >= COLS) return null;
    let best = null, bd = Math.min(7.5, P / 2) ** 2;
    // a finger can land a little off: still pick the nearest hole in this column
    if (this.touch) bd = Math.max(bd, Math.min(this.tol(7.5, 16), 12) ** 2);
    for (const [r, ry] of Object.entries(ROWS)) {
      if (RAIL_ROWS.includes(r) && !railHasHole(c)) continue;
      const d = (colX(c) - x) ** 2 + (ry - y) ** 2;
      if (d < bd) { bd = d; best = r; }
    }
    return best ? holeId(best, c) : null;
  }
  // the bare wire of a two-lead part, between its body and a hole, grabs that end
  legAt(x, y) {
    const part = this.hitPart(x, y);
    if (!part || isDip(part.type) || THREE.includes(part.type)) return null;
    const [A, B] = part.holes.map(pointXY);
    const len = Math.hypot(B.x - A.x, B.y - A.y) || 1;
    const along = ((x - A.x) * (B.x - A.x) + (y - A.y) * (B.y - A.y)) / len;
    const body = { D: 9, Z: 9, LED: 7, C: 6.5 }[part.type] ?? Math.min(14, len / 2 - 3);
    if (along < len / 2 - body - 1) return { part, idx: 0 };
    if (along > len / 2 + body + 1) return { part, idx: 1 };
    return null;
  }

  hitPart(x, y) {
    const near = this.tol(6, 14);
    for (const p of this.t.parts) {
      if (isDip(p.type)) {
        if (x >= colX(p.col) - 8 && x <= colX(p.col + dipCount(p) / 2 - 1) + 8 && y >= ROWS.e - 4 && y <= ROWS.f + 4) return p;
        continue;
      }
      const pts = p.holes.map(pointXY);
      if (THREE.includes(p.type)) {
        if (Math.abs(x - pts[1].x) < 22 && y > pts[1].y - 30 && y < pts[1].y + 4) return p;
        continue;
      }
      const [A, B] = pts;
      const dx = B.x - A.x, dy = B.y - A.y, l2 = dx * dx + dy * dy || 1;
      const k = Math.max(0, Math.min(1, ((x - A.x) * dx + (y - A.y) * dy) / l2));
      const mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2;
      if (Math.hypot(x - (A.x + k * dx), y - (A.y + k * dy)) < near && Math.hypot(x - mx, y - my) < Math.sqrt(l2) / 2 - 3) return p;
    }
    return null;
  }

  // ------------------------------------------------------------------ pointer
  bind() {
    const s = this.svg;
    let down = null;
    this.resetGesture = () => { down = null; this.pending = null; this.firstHole = null; this.renderOverlay(); };
    addPinch(this);
    s.addEventListener('wheel', (e) => { e.preventDefault(); const p = this.toSvg(e); this.zoom(e.deltaY > 0 ? 1.12 : 1 / 1.12, p.x, p.y); }, { passive: false });
    s.addEventListener('pointerdown', (e) => {
      if (e.button === 2) return;
      const act = e.target.closest?.('[data-act]');
      if (act) { e.preventDefault(); this.hooks.control(act.dataset.act); return; }
      this.touch = e.pointerType === 'touch' || e.pointerType === 'pen';
      const p = this.toSvg(e);
      const pt = this.hitPoint(p.x, p.y);
      down = { x: e.clientX, y: e.clientY, vb: { ...this.vb }, moved: false, p, pt };
      if (!this.readonly && this.mode !== 'place') {
        const onLead = pt && this.t.occupied().get(pt)?.part;
        const leg = onLead && !isDip(onLead.type) ? { part: onLead, idx: onLead.holes.indexOf(pt) } : this.legAt(p.x, p.y);
        if (leg) {
          // grab one leg: drag it to any free hole (a short across one strip is allowed)
          down.lead = leg;
        } else {
          const part = this.hitPart(p.x, p.y);
          if (part && !onLead) { down.part = part; down.orig = isDip(part.type) ? part.col : part.holes.slice(); down.row0 = this.nearestRow(p.y); }
        }
      } else if (!this.readonly && this.preview?.holes && pt) {
        const i = this.preview.holes.indexOf(pt);
        if (i >= 0 && !THREE.includes(this.preview.type)) down.pvIdx = i;
      }
      s.setPointerCapture(e.pointerId);
    });
    s.addEventListener('pointermove', (e) => {
      const p = this.toSvg(e);
      this.cursor = p;
      if (down) {
        const dx = e.clientX - down.x, dy = e.clientY - down.y;
        if (!down.moved && dx * dx + dy * dy > 30) down.moved = true;
        if (down.moved) {
          if (this.readonly || (!down.pt && !down.part)) {
            const r = s.getBoundingClientRect(), k = down.vb.w / r.width;
            this.vb.x = down.vb.x - dx * k; this.vb.y = down.vb.y - dy * k; this.applyView();
          } else if (this.mode === 'place') {
            if (down.pvIdx != null) this.dragPreviewEnd(down.pvIdx, p);
            else if (down.pt && !APADS[down.pt] && !isDip(this.place.type) && !THREE.includes(this.place.type)) this.firstHole = down.pt;
          } else if (down.lead) {
            this.dragLead(down, p);
          } else if (down.part) {
            this.dragPart(down, p);
          } else if (down.pt) {
            this.pending = down.pt;
          }
        }
      }
      this.onHover(p, e.target);
    });
    s.addEventListener('pointerup', (e) => {
      if (!down) return;
      const d = down; down = null;
      const p = this.toSvg(e);
      const pt = this.hitPoint(p.x, p.y);
      if (this.readonly) {
        if (!d.moved) { const part = this.hitPart(p.x, p.y); if (part) this.hooks.select({ kind: 'part', id: part.id }); }
        return;
      }
      if (this.mode === 'place') {
        if (d.pvIdx != null) { this.renderOverlay(); return; }
        let plan = null;
        if (d.moved && this.firstHole && pt && pt !== this.firstHole) plan = this.planTwo(this.firstHole, pt);
        else if (!d.moved || !this.firstHole) plan = this.planTap(p, pt);
        this.firstHole = null;
        if (plan?.err) this.hooks.notify(plan.err, 'bad');
        else if (plan) {
          // on a phone the part waits as a preview so a slip of the finger costs nothing
          if (this.touch) { this.preview = plan; this.renderDock(); }
          else this.addPart(plan);
        }
        this.renderOverlay();
        return;
      }
      if (d.lead) {
        if (d.moved) {
          if (d.didMove) {
            this.hooks.change();
            const lp = d.lead.part;
            if (!THREE.includes(lp.type) && baseNode(lp.holes[0]) === baseNode(lp.holes[1])) this.hooks.notify(`${lp.ref} now has both leads in one strip, so it is shorted out.`);
          }
          return;
        }
        return this.select({ kind: 'part', id: d.lead.part.id });
      }
      if (d.part) {
        if (d.moved) { if (d.didMove) this.hooks.change(); return; }
        return this.select({ kind: 'part', id: d.part.id });
      }
      if (d.moved) {
        if (this.pending && pt && pt !== this.pending) this.tryWire(this.pending, pt);
        this.pending = null;
        this.renderOverlay();
        return;
      }
      const wire = e.target.closest?.('[data-wire]');
      if (this.pending) {
        if (pt && pt !== this.pending) this.tryWire(this.pending, pt);
        this.pending = null;
        this.renderOverlay();
        return;
      }
      if (wire) return this.select({ kind: 'wire', id: wire.dataset.wire });
      if (pt) {
        const occ = this.t.occupied().get(pt);
        if (occ?.part) return this.select({ kind: 'part', id: occ.part.id });
        if (occ?.wire) return this.select({ kind: 'wire', id: occ.wire.id });
        this.pending = pt;
        this.renderOverlay();
        return;
      }
      this.select(null);
    });
    s.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (this.readonly) return;
      const wire = e.target.closest?.('[data-wire]');
      if (wire) return this.removeWire(wire.dataset.wire);
      const p = this.toSvg(e);
      const part = this.hitPart(p.x, p.y);
      if (part) this.removePart(part.id);
      this.cancel();
    });
    s.addEventListener('pointerleave', () => { this.hover = null; this.renderHighlight(); });
    s.addEventListener('keydown', (e) => {
      const act = e.target.closest?.('[data-act]');
      if (act && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); this.hooks.control(act.dataset.act); }
    });
  }

  nearestRow(y) {
    let best = 0, bd = 1e9;
    ROW_ORDER.forEach((r, i) => { const d = Math.abs(ROWS[r] - y); if (d < bd) { bd = d; best = i; } });
    return best;
  }

  // move a part by whole holes while it is being dragged
  dragPart(d, p) {
    const part = d.part;
    const dc = Math.round((p.x - d.p.x) / P);
    const occ = this.t.occupied();
    const free = (h) => h && !APADS[h] && (!occ.has(h) || occ.get(h).part === part);
    if (isDip(part.type)) {
      const col = d.orig + dc;
      if (col === part.col || col < 0 || col + dipCount(part) / 2 > COLS) return;
      if (!partHoles({ ...part, col }).every(free)) return;
      part.col = col;
    } else {
      const dr = this.nearestRow(p.y) - d.row0;
      const next = d.orig.map(h => shiftHole(h, dc, dr));
      if (!next.every(free) || next.join() === part.holes.join()) return;
      part.holes = next;
    }
    d.didMove = true;
    this.t.dirty = true;
    this.render();
  }

  // move a single leg to whichever free hole is under the pointer
  dragLead(d, p) {
    const { part, idx } = d.lead;
    const tgt = this.hitPoint(p.x, p.y);
    if (!tgt || APADS[tgt] || tgt === part.holes[idx]) return;
    const occ = this.t.occupied().get(tgt);
    if (occ && occ.part !== part) return;
    if (part.holes.includes(tgt)) return;
    const T = pointXY(tgt);
    if (part.holes.some((h, i) => i !== idx && Math.hypot(pointXY(h).x - T.x, pointXY(h).y - T.y) > P * 14)) return;
    part.holes[idx] = tgt;
    d.didMove = true;
    this.t.dirty = true;
    this.render();
  }

  dragPreviewEnd(i, p) {
    const pv = this.preview, tgt = this.hitPoint(p.x, p.y);
    if (!pv || !tgt || APADS[tgt] || pv.holes.includes(tgt) || this.t.occupied().has(tgt)) return;
    const other = pointXY(pv.holes[1 - i]), T = pointXY(tgt);
    if (Math.hypot(other.x - T.x, other.y - T.y) > P * 14) return;
    pv.holes[i] = tgt;
    this.renderOverlay(); this.renderDock();
  }

  // where a tap would put the part: returns a part spec, or { err }
  planTap(p, pt) {
    const pl = this.place;
    const occ = this.t.occupied();
    const free = (h) => h && !APADS[h] && !occ.has(h);
    if (isDip(pl.type)) {
      const n = dipCount(pl);
      const col = Math.round((p.x - colX(0)) / P) - Math.floor(n / 4);
      const holes = partHoles({ type: pl.type, chip: pl.chip, col });
      if (col < 0 || col + n / 2 > COLS || !holes.every(free)) return { err: 'A chip has to straddle the centre channel on free holes.' };
      return { type: pl.type, chip: pl.chip, col };
    }
    if (THREE.includes(pl.type)) {
      const ph = pt && parsePoint(pt);
      if (!ph || ph.kind !== 'hole' || RAIL_ROWS.includes(ph.row)) return { err: 'Tap a breadboard hole for the middle (base) leg.' };
      const holes = [holeId(ph.row, ph.col - 1), pt, holeId(ph.row, ph.col + 1)];
      if (ph.col < 1 || ph.col > COLS - 2 || !holes.every(free)) return { err: 'The three legs need three free holes side by side.' };
      return { type: pl.type, holes };
    }
    if (!free(pt)) return { err: pt && APADS[pt] ? 'Parts go on the breadboard. Drag a wire to reach the instruments.' : 'Tap a free breadboard hole.' };
    const ph = parsePoint(pt);
    const cands = [];
    if (ph.row === 'tp' || ph.row === 'tn') cands.push(holeId(ph.row === 'tp' ? 'b' : 'a', ph.col));
    else if (ph.row === 'bp' || ph.row === 'bn') cands.push(holeId(ph.row === 'bp' ? 'j' : 'i', ph.col));
    else for (const dc of [4, -4, 3, -3, 5, -5, 2, -2, 6, -6]) if (ph.col + dc >= 0 && ph.col + dc < COLS) cands.push(holeId(ph.row, ph.col + dc));
    const other = cands.find(h => free(h) && baseNode(h) !== baseNode(pt));
    if (!other) return { err: 'No room next to that hole. Try another spot, or drag from one hole to another to set the length.' };
    return { type: pl.type, holes: [pt, other], value: pl.value, color: pl.color };
  }

  planTwo(a, b) {
    const pl = this.place;
    const occ = this.t.occupied();
    if ([a, b].some(h => APADS[h] || occ.has(h))) return { err: 'Both ends need free breadboard holes.' };
    const A = pointXY(a), B = pointXY(b);
    if (Math.hypot(A.x - B.x, A.y - B.y) > 15 * 14) return { err: 'Leads that far apart would not reach. Keep parts within about 14 holes.' };
    return { type: pl.type, holes: [a, b], value: pl.value, color: pl.color };
  }

  confirmPreview() {
    const pv = this.preview;
    if (!pv) return;
    const occ = this.t.occupied();
    if (partHoles(pv).some(h => occ.has(h))) { this.hooks.notify('Something is already in one of those holes.', 'bad'); return; }
    this.preview = null;
    this.addPart(pv);
    this.renderOverlay(); this.renderDock();
  }

  // an occupied hole stands for its whole strip: use the nearest free hole in it
  freeInStrip(h) {
    if (APADS[h]) return h;
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

  addPart(spec) {
    const p = this.t.addPart({ ...spec, value: spec.value ?? this.place?.value, color: spec.color ?? this.place?.color, chip: spec.chip ?? this.place?.chip });
    this.hooks.change();
    const shorted = p.holes?.length === 2 && baseNode(p.holes[0]) === baseNode(p.holes[1]);
    this.hooks.notify(shorted ? `${p.ref} placed with both leads in one strip, so it is shorted out.` : `${p.ref} placed. ${this.touch ? 'Tap' : 'Click'} it to change its value, or drag a leg to move that end.`);
  }

  tryWire(a, b) {
    const fa = this.freeInStrip(a), fb = this.freeInStrip(b);
    if (!fa || !fb) { this.hooks.notify('That strip is full. Use a hole in another strip.', 'bad'); return; }
    a = fa; b = fb;
    if (baseNode(a) === baseNode(b)) { this.hooks.notify('Those two points are already connected through the strip.'); return; }
    let color = this.wireColor;
    if (color === 'auto') color = this.autoColor(a, b);
    this.t.addWire(a, b, color);
    this.hooks.change();
  }
  autoColor(a, b) {
    const g = [a, b].map(x => APADS[x]?.id || '');
    const rows = [a, b].map(x => parsePoint(x)?.row);
    if (g.some(x => /^g\d$/.test(x)) || rows.some(r => r === 'tn' || r === 'bn') || g.includes('dmmC')) return 'black';
    if (g.some(x => ['p12', 'var1', 'var2'].includes(x)) || rows.some(r => r === 'tp')) return 'red';
    if (g.includes('m12') || rows.includes('bp')) return 'blue';
    if (g.includes('fg')) return 'yellow';
    if (g.includes('ch1')) return 'yellow';
    if (g.includes('ch2')) return 'purple';
    if (g.some(x => /^a\d/.test(x))) return 'orange';
    if (g.includes('dmmV')) return 'red';
    return ['green', 'white', 'orange', 'blue'][this.t.wires.length % 4];
  }

  removeWire(id) { this.t.wires = this.t.wires.filter(w => w.id !== id); this.t.dirty = true; if (this.selected?.id === id) this.selected = null; this.hooks.change(); }
  removePart(id) { this.t.parts = this.t.parts.filter(p => p.id !== id); this.t.dirty = true; if (this.selected?.id === id) this.selected = null; this.hooks.change(); }
  deleteSelected() {
    if (!this.selected) return false;
    if (this.selected.kind === 'wire') this.removeWire(this.selected.id); else this.removePart(this.selected.id);
    this.hooks.select(null);
    return true;
  }
  select(sel) { this.selected = sel; this.render(); this.hooks.select(sel); }
  setPlace(spec) {
    this.place = spec;
    this.mode = spec ? 'place' : 'wire';
    this.firstHole = null; this.pending = null; this.preview = null;
    if (spec && this.selected) { this.selected = null; this.renderParts(); }
    this.svg.classList.toggle('is-placing', !!spec);
    this.renderOverlay(); this.renderDock();
  }
  cancel() {
    if (this.preview) { this.preview = null; this.renderOverlay(); this.renderDock(); return true; }
    if (this.pending || this.firstHole) { this.pending = null; this.firstHole = null; this.renderOverlay(); return true; }
    if (this.mode === 'place') { this.setPlace(null); this.hooks.placed?.(); return true; }
    if (this.selected) { this.select(null); return true; }
    return false;
  }

  onHover(p, target) {
    const pt = this.hitPoint(p.x, p.y);
    if (!this.readonly && this.mode !== 'place') {
      const occ = pt && this.t.occupied().get(pt)?.part;
      const grab = (occ && !isDip(occ.type)) || this.legAt(p.x, p.y) ? 'grab' : this.hitPart(p.x, p.y) ? 'move' : '';
      if (this.svg.style.cursor !== grab) this.svg.style.cursor = grab;
    }
    const wire = target.closest?.('[data-wire]');
    const part = pt && !APADS[pt] && this.t.occupied().get(pt)?.part ? null : this.hitPart(p.x, p.y);
    const key = (pt || '') + '|' + (wire?.dataset.wire || '') + '|' + (part?.id || '');
    if (key !== this.hoverKey) {
      this.hoverKey = key;
      this.hover = { pt, wire: wire ? this.t.wires.find(w => w.id === wire.dataset.wire) : null, part };
      this.renderHighlight();
      this.hooks.hover(this.hover);
    }
    if (this.pending || this.firstHole || this.mode === 'place') this.renderOverlay();
  }

  // ------------------------------------------------------------------ dynamic render
  render() { this.renderParts(); this.renderWires(); this.renderIndicators(); this.renderHighlight(); this.renderOverlay(); this.renderDock(); }

  // touch action bar over the board: what is happening now, and the buttons a phone has no keys for
  renderDock() {
    if (this.readonly) return;
    if (!this.dock) {
      this.dock = document.createElement('div');
      this.dock.className = 'board-dock';
      this.dock.addEventListener('pointerdown', (e) => e.stopPropagation());
      this.dock.addEventListener('click', (e) => {
        const b = e.target.closest('[data-dock]');
        if (!b) return;
        const a = b.dataset.dock;
        if (a === 'place') this.confirmPreview();
        else if (a === 'redo') { this.preview = null; this.renderOverlay(); this.renderDock(); }
        else if (a === 'stop') { this.setPlace(null); this.hooks.placed?.(); }
        else if (a === 'delete') this.deleteSelected();
        else if (a === 'edit') this.hooks.edit?.(this.selected);
        else if (a === 'done') this.select(null);
      });
      this.host.append(this.dock);
    }
    const name = (spec) => {
      const nm = PARTS[spec.type]?.name || spec.type;
      if (spec.type === 'IC' || isDip(spec.type)) return spec.chip || nm;
      const lab = partLabel({ ...spec });
      return lab.toLowerCase().includes(nm.toLowerCase()) ? lab : `${lab} ${nm.toLowerCase()}`.trim();
    };
    const btn = (a, label, cls = '') => `<button type="button" class="dock-btn ${cls}" data-dock="${a}">${label}</button>`;
    let html = '';
    if (this.mode === 'place' && this.place) {
      if (this.preview) {
        const where = this.preview.holes ? this.preview.holes.join(' → ') : 'across the channel';
        html = `<div class="dock-txt"><b>${name(this.place)}</b><span>${where}${this.preview.holes && !THREE.includes(this.preview.type) ? ' · drag an end to adjust' : ''}</span></div>${btn('redo', 'Cancel')}${btn('place', 'Place', 'is-go')}`;
      } else if (this.touch) {
        html = `<div class="dock-txt"><b>${name(this.place)}</b><span>${isDip(this.place.type) ? 'Tap where the chip should sit' : THREE.includes(this.place.type) ? 'Tap the hole for the middle leg' : 'Tap a hole · two fingers to pan or zoom'}</span></div>${btn('stop', 'Done')}`;
      }
    } else if (this.touch && this.selected) {
      const isWire = this.selected.kind === 'wire';
      const p = !isWire && this.t.parts.find(x => x.id === this.selected.id);
      if (isWire || p) {
        html = `<div class="dock-txt"><b>${isWire ? 'Wire' : `${p.ref} · ${partLabel(p)}`}</b><span>${isWire ? 'selected' : isDip(p.type) ? 'drag the body to move' : 'drag a leg to move that end'}</span></div>${p ? btn('edit', 'Edit') : ''}${btn('delete', 'Delete', 'is-bad')}${btn('done', 'Done')}`;
      }
    }
    this.dock.innerHTML = html;
    this.dock.hidden = !html;
  }

  renderParts() {
    const L = this.partLayer;
    L.replaceChildren();
    for (const p of this.t.parts) L.append(this.drawPart(p, false));
  }

  drawPart(p, ghost) {
    const sel = this.selected?.id === p.id;
    const g = svg('g', { class: 'apart' + (sel ? ' is-selected' : '') + (this.focusIds.has(p.id) ? ' is-focus' : '') + (ghost ? ' is-ghost' : ''), 'data-part': p.id });
    if (isDip(p.type)) {
      const n = dipCount(p);
      const x0 = colX(p.col) - 6.5, x1 = colX(p.col + n / 2 - 1) + 6.5;
      for (const h of partHoles(p)) { const { x, y } = pointXY(h); g.append(svg('rect', { x: x - 2.6, y: y - 3, width: 5.2, height: 6, rx: 1, class: 'leg' })); }
      g.append(svg('rect', { x: x0, y: ROWS.e + 2, width: x1 - x0, height: ROWS.f - ROWS.e - 4, rx: 2.5, class: 'chip-body' }));
      g.append(svg('path', { d: `M${x0},${(ROWS.e + ROWS.f) / 2 - 4.5} a4.5,4.5 0 0 1 0,9`, class: 'chip-notch' }));
      g.append(svg('circle', { cx: x0 + 4.5, cy: ROWS.f - 6.5, r: 1.4, class: 'chip-dot' }));
      const t = svg('text', { x: (x0 + x1) / 2 + 2, y: (ROWS.e + ROWS.f) / 2 + 3, class: 'chip-label' }); t.textContent = partLabel(p);
      g.append(t);
      return g;
    }
    const pts = p.holes.map(pointXY);
    if (THREE.includes(p.type) && !['NPN', 'PNP'].includes(p.type)) {
      // TO-220 package: metal tab, black body, three legs
      const mid = pts[1], top = mid.y - 30;
      for (const q of pts) g.append(svg('line', { x1: q.x, y1: q.y, x2: q.x, y2: top + 22, class: 'a-lead' }));
      g.append(svg('rect', { x: mid.x - 19, y: top - 9, width: 38, height: 11, rx: 2, class: 'a-tab' }));
      g.append(svg('circle', { cx: mid.x, cy: top - 3.5, r: 2.6, class: 'a-tabhole' }));
      g.append(svg('rect', { x: mid.x - 19, y: top + 1, width: 38, height: 22, rx: 2, class: 'a-to220' }));
      const t = svg('text', { x: mid.x, y: top + 15, class: 'a-partlab inv' }); t.textContent = partLabel(p); g.append(t);
      LEG_NAMES[p.type].forEach((L, i) => { const tt = svg('text', { x: pts[i].x, y: pts[i].y + 11, class: 'a-pin' }); tt.textContent = L; g.append(tt); });
      return g;
    }
    if (p.type === 'NPN' || p.type === 'PNP') {
      const [c, b, e] = pts;
      const top = b.y - 22;
      for (const q of pts) g.append(svg('line', { x1: q.x, y1: q.y, x2: q.x, y2: top + 10, class: 'a-lead' }));
      g.append(svg('path', { d: `M${c.x - 6},${top + 12} V${top + 4} A13,10 0 0 1 ${e.x + 6},${top + 4} V${top + 12} Z`, class: 'a-to92' }));
      const t = svg('text', { x: b.x, y: top + 6, class: 'a-partlab inv' }); t.textContent = p.type === 'NPN' ? '547' : '557'; g.append(t);
      ['C', 'B', 'E'].forEach((L, i) => { const tt = svg('text', { x: pts[i].x, y: pts[i].y + 11, class: 'a-pin' }); tt.textContent = L; g.append(tt); });
      return g;
    }
    const [A, B] = pts;
    const ang = Math.atan2(B.y - A.y, B.x - A.x) * 180 / Math.PI;
    const len = Math.hypot(B.x - A.x, B.y - A.y);
    g.append(svg('line', { x1: A.x, y1: A.y, x2: B.x, y2: B.y, class: 'a-lead' }));
    for (const q of pts) g.append(svg('circle', { cx: q.x, cy: q.y, r: 2.2, class: 'a-foot' }));
    const body = svg('g', { transform: `translate(${(A.x + B.x) / 2},${(A.y + B.y) / 2}) rotate(${ang})` });
    const half = Math.min(14, len / 2 - 3);
    switch (p.type) {
      case 'R': {
        body.append(svg('rect', { x: -half, y: -4.5, width: half * 2, height: 9, rx: 3.5, class: 'a-res' }));
        const bands = resistorBands(p.value);
        [-0.55, -0.25, 0.05].forEach((k, i) => body.append(svg('rect', { x: k * half * 2 - 1.2, y: -4.5, width: 2.6, height: 9, fill: bands[i] })));
        body.append(svg('rect', { x: half * 0.62, y: -4.5, width: 2.6, height: 9, fill: '#c9a227' }));
        break;
      }
      case 'C': body.append(svg('ellipse', { cx: 0, cy: 0, rx: 6.5, ry: 6, class: 'a-cer' })); break;
      case 'CE':
        body.append(svg('rect', { x: -half, y: -6.5, width: half * 2, height: 13, rx: 2.5, class: 'a-elec' }));
        body.append(svg('rect', { x: half - 6, y: -6.5, width: 4, height: 13, class: 'a-elec-stripe' }));
        break;
      case 'L':
        body.append(svg('rect', { x: -half, y: -5, width: half * 2, height: 10, rx: 4, class: 'a-ind' }));
        for (const k of [-0.4, -0.1, 0.2]) body.append(svg('rect', { x: k * half * 2, y: -5, width: 2, height: 10, fill: '#cfa32b' }));
        break;
      case 'D': case 'Z':
        body.append(svg('rect', { x: -9, y: -3.6, width: 18, height: 7.2, rx: 2, class: p.type === 'D' ? 'a-diode' : 'a-zener' }));
        body.append(svg('rect', { x: 4.5, y: -3.6, width: 2.6, height: 7.2, class: p.type === 'D' ? 'a-band' : 'a-band dark' }));
        break;
      case 'LED': {
        const col = LED_RGB[p.color] || LED_RGB.red;
        const glow = svg('circle', { cx: 0, cy: 0, r: 16, fill: col, class: 'a-glow', 'data-glow': p.id });
        body.append(glow, svg('circle', { cx: 0, cy: 0, r: 7, fill: col, class: 'a-led' }), svg('circle', { cx: -2, cy: -2, r: 2, class: 'led-shine' }));
        break;
      }
    }
    g.append(body);
    if (!ghost && (sel || this.showLabels)) {
      const t = svg('text', { x: (A.x + B.x) / 2, y: Math.min(A.y, B.y) - 9, class: 'a-partlab' });
      t.textContent = `${p.ref} ${partLabel(p)}`;
      g.append(t);
    }
    return g;
  }

  wirePath(a, b) {
    const A = pointXY(a), B = pointXY(b);
    const dx = B.x - A.x, dy = B.y - A.y, len = Math.hypot(dx, dy) || 1;
    const lift = Math.min(60, 10 + len * 0.18);
    let nx = -dy / len, ny = dx / len;
    if (ny > 0) { nx = -nx; ny = -ny; }
    return `M${A.x},${A.y} Q${(A.x + B.x) / 2 + nx * lift},${(A.y + B.y) / 2 + ny * lift} ${B.x},${B.y}`;
  }

  renderWires() {
    const L = this.wireLayer;
    L.replaceChildren();
    const net = this.hoverNet();
    for (const w of this.t.wires) {
      const d = this.wirePath(w.a, w.b);
      const col = AWIRE_COLORS[w.color] || w.color;
      const inNet = net && this.t.uf?.find(baseNode(w.a)) === net;
      const probe = PROBES[w.a] ? { pad: w.a, tip: w.b } : PROBES[w.b] ? { pad: w.b, tip: w.a } : null;
      const g = svg('g', { class: 'wire' + (probe ? ' is-probe' : '') + (this.selected?.id === w.id ? ' is-selected' : '') + (inNet ? ' in-net' : '') + (net && !inNet ? ' is-dim' : '') + (this.focusIds.has(w.id) ? ' is-focus' : ''), 'data-wire': w.id });
      if (probe && !APADS[probe.tip]) {
        // instrument lead: thick cable, a probe tip where it meets the board, and a label
        const P2 = PROBES[probe.pad];
        g.append(svg('path', { d, class: 'w-hit' }), svg('path', { d, class: 'p-shadow' }), svg('path', { d, class: 'p-core', stroke: P2.color }));
        const A = pointXY(probe.pad), B = pointXY(probe.tip);
        const ang = Math.atan2(B.y - A.y, B.x - A.x) * 180 / Math.PI;
        const tip = svg('g', { transform: `translate(${B.x},${B.y}) rotate(${ang})` });
        if (P2.kind === 'clip') {
          tip.append(svg('rect', { x: -17, y: -3.6, width: 12, height: 7.2, rx: 2, fill: P2.color, class: 'p-body' }),
            svg('path', { d: 'M-5,-2.2 C1,-2.2 2,2.2 -1,2.2', class: 'p-hook' }));
        } else {
          tip.append(svg('rect', { x: -19, y: -3.4, width: 13, height: 6.8, rx: 2.5, fill: P2.color, class: 'p-body' }),
            svg('path', { d: 'M-6,-1.6 L0,0 L-6,1.6 Z', class: 'p-needle' }));
        }
        g.append(tip);
        const lx = B.x - Math.cos(ang * Math.PI / 180) * 30, ly = B.y - Math.sin(ang * Math.PI / 180) * 30 - 9;
        const tw = P2.label.length * 5.6 + 8;
        g.append(svg('rect', { x: lx - tw / 2, y: ly - 7, width: tw, height: 12, rx: 3, fill: P2.color, class: 'p-tag' }));
        const tt = svg('text', { x: lx, y: ly + 2, class: 'p-tagt' + (P2.dark ? ' dark' : '') }); tt.textContent = P2.label; g.append(tt);
        g.append(svg('circle', { cx: A.x, cy: A.y, r: 4.2, class: 'w-end', fill: P2.color }));
      } else {
        g.append(svg('path', { d, class: 'w-hit' }), svg('path', { d, class: 'w-shadow' }), svg('path', { d, class: 'w-core', stroke: col }), svg('path', { d, class: 'w-gloss' }));
        for (const pt of [w.a, w.b]) { const { x, y } = pointXY(pt); g.append(svg('circle', { cx: x, cy: y, r: 3.3, class: 'w-end', fill: col })); }
      }
      const t = svg('title'); t.textContent = `${describePoint(w.a)} ↔ ${describePoint(w.b)}`; g.append(t);
      L.append(g);
    }
  }

  hoverNet() {
    const h = this.hover;
    if (!h || !this.t.uf) return null;
    if (h.wire) return this.t.uf.find(baseNode(h.wire.a));
    if (h.pt) return this.t.uf.find(baseNode(h.pt));
    return null;
  }

  renderHighlight() {
    this.stripLayer.replaceChildren();
    this.hiLayer.replaceChildren();
    const net = this.hoverNet();
    if (net) {
      const uf = this.t.uf;
      for (let c = 0; c < COLS; c++) {
        for (const [k, rows] of [['T', TOP_ROWS], ['B', BOT_ROWS]]) {
          if (uf.find(k + c) !== net) continue;
          this.stripLayer.append(svg('rect', { x: colX(c) - 5.5, y: ROWS[rows[0]] - 6, width: 11, height: ROWS[rows[4]] - ROWS[rows[0]] + 12, rx: 3, class: 'strip-hi' }));
        }
      }
      for (const r of RAIL_ROWS) if (uf.find('R:' + r) === net) this.stripLayer.append(svg('rect', { x: colX(0) - 6, y: ROWS[r] - 5.5, width: colX(COLS - 1) - colX(0) + 12, height: 11, rx: 3, class: 'strip-hi' }));
      for (const p of Object.values(APADS)) if (uf.find(p.node) === net) this.hiLayer.append(svg('circle', { cx: p.x, cy: p.y, r: 11, class: 'pad-hi' }));
    }
    this.renderWires();
  }

  renderOverlay() {
    const L = this.overLayer;
    L.replaceChildren();
    const c = this.cursor;
    const start = this.pending || this.firstHole;
    // grab handles on the legs of the selected part, so it is obvious each end can move
    const sp = !this.readonly && this.selected?.kind === 'part' && this.t.parts.find(x => x.id === this.selected.id);
    if (sp && !isDip(sp.type)) for (const h of sp.holes) { const { x, y } = pointXY(h); L.append(svg('circle', { cx: x, cy: y, r: this.touch ? 6.5 : 5, class: 'lead-handle' })); }
    if (this.preview && !start) {
      const g = this.drawPart({ id: '_pv', ...this.preview }, true);
      g.classList.add('is-preview');
      L.append(g);
      if (this.preview.holes && !THREE.includes(this.preview.type)) for (const h of this.preview.holes) { const { x, y } = pointXY(h); L.append(svg('circle', { cx: x, cy: y, r: 7, class: 'lead-handle is-preview' })); }
      return;
    }
    if (start) {
      const A = pointXY(start);
      L.append(svg('circle', { cx: A.x, cy: A.y, r: 6, class: 'pending-end' }));
      if (c) {
        const tgt = this.hitPoint(c.x, c.y);
        const B = tgt ? pointXY(tgt) : c;
        if (this.firstHole && tgt && tgt !== this.firstHole && !APADS[tgt]) {
          L.append(this.drawPart({ id: '_g', type: this.place.type, holes: [this.firstHole, tgt], value: this.place.value, color: this.place.color }, true));
        } else L.append(svg('line', { x1: A.x, y1: A.y, x2: B.x, y2: B.y, class: 'rubber' }));
      }
    } else if (this.mode === 'place' && c && this.place) {
      const pt = this.hitPoint(c.x, c.y);
      if (isDip(this.place.type)) {
        const n = dipCount(this.place);
        const col = Math.max(0, Math.min(COLS - n / 2, Math.round((c.x - colX(0)) / P) - Math.floor(n / 4)));
        L.append(this.drawPart({ id: '_g', type: this.place.type, chip: this.place.chip, col }, true));
      } else if (THREE.includes(this.place.type) && pt && parsePoint(pt)?.kind === 'hole') {
        const ph = parsePoint(pt);
        if (ph.col > 0 && ph.col < COLS - 1 && !RAIL_ROWS.includes(ph.row)) L.append(this.drawPart({ id: '_g', type: this.place.type, holes: [holeId(ph.row, ph.col - 1), pt, holeId(ph.row, ph.col + 1)] }, true));
      } else if (pt) {
        const { x, y } = pointXY(pt);
        L.append(svg('circle', { cx: x, cy: y, r: 6, class: 'hover-ring' }));
      }
    } else if (this.hover?.pt && !this.readonly) {
      const { x, y } = pointXY(this.hover.pt);
      L.append(svg('circle', { cx: x, cy: y, r: 5.5, class: 'hover-ring' }));
    }
  }

  // live instrument displays
  renderIndicators(readings, scopeBuf) {
    const s = this.t.settings;
    const on = s.power;
    this.dVar1.textContent = on ? s.var1.toFixed(2) + ' V' : '';
    this.dVar2.textContent = on ? s.var2.toFixed(2) + ' V' : '';
    this.dFg1.textContent = on ? `${s.fg.wave.toUpperCase()}  ${fmtSI(s.fg.freq, 'Hz')}` : '';
    this.dFg2.textContent = on ? `${s.fg.amp.toFixed(s.fg.amp < 0.1 ? 3 : 2)} Vpk  off ${s.fg.offset.toFixed(1)} V` : '';
    this.dCc.textContent = on ? (s.cc * 1000).toFixed(2) + ' mA' : '';
    this.dPot.textContent = `1–W ${fmtSI(s.pot.r * (1 - s.pot.pos), 'Ω')}  W–3 ${fmtSI(s.pot.r * s.pot.pos, 'Ω')}`;
    this.pwrKnob.setAttribute('cx', on ? 69 : 51);
    this.pwr.classList.toggle('on', on);
    for (const k of ['s1', 's2']) { this.swEls[k].knob.setAttribute('cx', s[k] ? 533 : 519); this.swEls[k].g.classList.toggle('on', !!s[k]); this.swEls[k].g.setAttribute('aria-checked', String(!!s[k])); }
    if (readings) {
      const r = readings;
      this.dDmm.textContent = r.dmm == null ? (on ? '— — —' : '') : (r.dmm >= 0 ? ' ' : '') + r.dmm.toFixed(Math.abs(r.dmm) < 10 ? 3 : 2) + ' V';
      this.dA1.textContent = r.a1 == null ? '' : (r.a1 * 1000).toFixed(2) + ' mA';
      this.dA2.textContent = r.a2 == null ? '' : (r.a2 * 1000).toFixed(2) + ' mA';
      // LED glow
      for (const gl of this.partLayer.querySelectorAll('[data-glow]')) {
        const p = this.t.parts.find(x => x.id === gl.dataset.glow);
        const st = p && this.t.partState(p);
        gl.style.opacity = st ? Math.max(0, Math.min(0.9, (st.I ?? 0) / 0.012)) : 0;
      }
    }
    if (scopeBuf) this.drawMiniScope(scopeBuf);
  }

  drawMiniScope({ buf, window, vdiv }) {
    const t1 = buf.length ? buf[buf.length - 1][0] : 0, t0 = t1 - window;
    const toPts = (k) => buf.filter(b => b[k] != null).map(b => `${(44 + ((b[0] - t0) / window) * 300).toFixed(1)},${(594 - (b[k] / vdiv) * 17.5).toFixed(1)}`).join(' ');
    this.tr1.setAttribute('points', toPts(1));
    this.tr2.setAttribute('points', toPts(2));
    this.scopeTxt.textContent = buf.length ? `${fmtSI(window / 10, 's')}/div   ${fmtSI(vdiv, 'V')}/div` : '';
  }
}
