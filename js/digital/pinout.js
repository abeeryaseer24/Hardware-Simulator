// Draws a chip pinout as it sits on the breadboard: notch on the left,
// pin 1 bottom-left, numbering counter-clockwise.
import { svg } from '../shared/site.js';

function nameNode(x, y, name, anchorTop) {
  const t = svg('text', { x, y, class: 'po-name', transform: `rotate(-90 ${x} ${y})`, 'text-anchor': anchorTop ? 'start' : 'end' });
  if (name.startsWith('/')) {
    const ts = svg('tspan', { 'text-decoration': 'overline' });
    ts.textContent = name.slice(1);
    t.append(ts);
  } else t.textContent = name;
  return t;
}

export function pinoutSVG(def, levels = null, opts = {}) {
  const n = def.pins, half = n / 2;
  const pw = opts.pitch || 32;
  const w = half * pw + 40, h = levels ? 222 : 200;
  const s = svg('svg', { viewBox: `0 0 ${w} ${h}`, class: 'pinout', role: 'img', 'aria-label': `${def.id} pinout` });
  const bx = 20, by = levels ? 82 : 76, bw = half * pw, bh = 50;
  s.append(svg('rect', { x: bx, y: by, width: bw, height: bh, rx: 4, class: 'po-body' }));
  s.append(svg('path', { d: `M${bx},${by + bh / 2 - 8} a8,8 0 0 1 0,16`, class: 'po-notch' }));
  s.append(svg('circle', { cx: bx + 9, cy: by + bh - 9, r: 3, class: 'po-dot' }));
  const lab = svg('text', { x: bx + bw / 2, y: by + bh / 2 + 6, class: 'po-label' });
  lab.textContent = '74LS' + def.id.slice(2);
  s.append(lab);

  for (let p = 1; p <= n; p++) {
    const bottom = p <= half;
    const i = bottom ? p - 1 : n - p;
    const x = bx + pw / 2 + i * pw;
    const kind = def.kind[p];
    const lv = levels ? levels(p) : null;
    const y0 = bottom ? by + bh : by - 14;
    s.append(svg('rect', { x: x - 5, y: y0, width: 10, height: 14, rx: 1.5, class: `po-leg k-${kind}` + (lv === 1 ? ' hi' : lv === 0 ? ' lo' : '') }));
    const num = svg('text', { x, y: bottom ? by + bh - 4 : by + 13, class: 'po-num' });
    num.textContent = p;
    s.append(num);
    const name = def.names[p - 1];
    s.append(nameNode(x + 4, bottom ? by + bh + 20 : by - 20, name, !bottom));
    if (levels && kind !== 'nc') {
      const v = lv === 1 ? '1' : lv === 0 ? '0' : lv === 'X' ? '!' : '·';
      const t = svg('text', { x, y: bottom ? h - 4 : 12, class: 'po-lv' + (lv === 1 ? ' hi' : lv === 0 ? ' lo' : '') });
      t.textContent = v;
      s.append(t);
    }
  }
  return s;
}

// A compact "which pin does what" summary for a chip.
const fmtName = (n) => (n.startsWith('/') ? n.slice(1) + '̅' : n);
export function pinRoles(def) {
  const sections = new Map();
  const common = { in: [], out: [] };
  for (let p = 1; p <= def.pins; p++) {
    const k = def.kind[p];
    if (k !== 'in' && k !== 'out') continue;
    const name = def.names[p - 1];
    const m = name.replace('/', '').match(/^(\d)([A-Za-z].*)$/);
    const entry = `${fmtName(name)} (${p})`;
    if (m) {
      if (!sections.has(m[1])) sections.set(m[1], { in: [], out: [] });
      sections.get(m[1])[k].push(entry);
    } else common[k].push(entry);
  }
  const unit = def.family === 'Gates' ? 'Gate' : def.family === 'Flip-flops' ? 'Flip-flop' : 'Section';
  const rows = [];
  for (const [n, s] of [...sections].sort()) rows.push([`${unit} ${n}`, s.in.join(', ') || '—', s.out.join(', ') || '—']);
  if (common.in.length || common.out.length) rows.push([sections.size ? 'Shared' : 'All', common.in.join(', ') || '—', common.out.join(', ') || '—']);
  const t = document.createElement('table');
  t.className = 'roles';
  t.innerHTML = `<thead><tr><th></th><th>Inputs (pin)</th><th>Outputs (pin)</th></tr></thead><tbody>${rows.map(r => `<tr><th>${r[0]}</th><td>${r[1]}</td><td>${r[2]}</td></tr>`).join('')}</tbody>`;
  const wrap = document.createElement('div');
  wrap.className = 'roles-wrap';
  const pw = document.createElement('p');
  pw.className = 'roles-pwr';
  pw.innerHTML = `<span class="r-dot pwr"></span>VCC pin ${def.vcc} &nbsp; <span class="r-dot gnd"></span>GND pin ${def.gnd}${def.names.includes('NC') ? ' &nbsp; NC = not connected' : ''}`;
  wrap.append(t, pw);
  return wrap;
}
