import { mountChrome, mountFooter, $, el, svg, parseSI, fmtSI } from './shared/site.js';
import { truthFromExpr, solveFunction } from './shared/boolean.js';

mountChrome('toolkit');
mountFooter();

const tools = $('#tools');
function card(id, title, intro, wide = false) {
  const c = el('section', { class: 'tool' + (wide ? ' t-wide' : ''), id }, el('h2', {}, title), intro ? el('p', {}, intro) : null);
  tools.append(c);
  return c;
}
function num(labelText, value, attrs = {}) {
  const input = el('input', { class: 'input mono', value, spellcheck: 'false', ...attrs });
  const f = el('label', { class: 'field' }, el('span', {}, labelText), input);
  return { f, input, get v() { return parseSI(input.value); } };
}
const E12 = [1, 1.2, 1.5, 1.8, 2.2, 2.7, 3.3, 3.9, 4.7, 5.6, 6.8, 8.2];
function nearestE12(v, up = true) {
  const dec = 10 ** Math.floor(Math.log10(v));
  const cands = [...E12.map(x => x * dec), 10 * dec];
  return up ? cands.find(x => x >= v * 0.999) : cands.reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a));
}

// ---------------------------------------------------------------- resistor colours
(function resistor() {
  const c = card('resistor', 'Resistor colour code', 'Pick the bands from left to right, or type a value to get its bands.', true);
  const COLORS = [
    ['black', '#1b1b1b', 0, 1], ['brown', '#7b4a1e', 1, 10], ['red', '#d22d2d', 2, 100], ['orange', '#ef7d1a', 3, 1e3],
    ['yellow', '#f2d01b', 4, 1e4], ['green', '#1f9a4c', 5, 1e5], ['blue', '#2563c9', 6, 1e6], ['violet', '#7d4bc4', 7, 1e7],
    ['grey', '#8a8a8a', 8, 1e8], ['white', '#f4f4f4', 9, 1e9], ['gold', '#c9a227', null, 0.1], ['silver', '#bfc4c8', null, 0.01],
  ];
  const TOL = { brown: '±1 %', red: '±2 %', green: '±0.5 %', blue: '±0.25 %', violet: '±0.1 %', gold: '±5 %', silver: '±10 %', none: '±20 %' };
  let bands = 4;
  const st = { d1: 'yellow', d2: 'violet', d3: 'black', mul: 'red', tol: 'gold' };
  const seg = el('div', { class: 'seg', role: 'group' },
    el('button', { 'aria-pressed': 'true', onclick: (e) => setBands(4, e) }, '4 bands'),
    el('button', { 'aria-pressed': 'false', onclick: (e) => setBands(5, e) }, '5 bands'));
  const pic = el('div');
  const picks = el('div', { class: 'band-pick' });
  const out = el('div', { class: 't-out' });
  const rev = num('Or type a value', '4.7k');
  const revOut = el('p', { class: 't-err' });
  c.append(el('div', { class: 't-row' }, seg), pic, picks, out, el('div', { class: 't-row', style: 'margin-top:14px' }, rev.f), revOut);

  function setBands(n, e) {
    bands = n;
    [...seg.children].forEach(b => b.setAttribute('aria-pressed', String(b === e.currentTarget)));
    render();
  }
  function select(key, allowed) {
    const s = el('select', { class: 'input' }, ...allowed.map(([name]) => el('option', { value: name, selected: st[key] === name }, name)));
    s.addEventListener('change', () => { st[key] = s.value; render(); });
    return s;
  }
  function render() {
    const digits = COLORS.filter(x => x[2] != null);
    const keys = bands === 4 ? ['d1', 'd2', 'mul', 'tol'] : ['d1', 'd2', 'd3', 'mul', 'tol'];
    const names = { d1: '1st digit', d2: '2nd digit', d3: '3rd digit', mul: 'Multiplier', tol: 'Tolerance' };
    picks.replaceChildren(...keys.map(k => el('label', { class: 'field' }, el('span', {}, names[k]),
      select(k, k === 'mul' ? COLORS : k === 'tol' ? COLORS.filter(x => TOL[x[0]]) : digits))));
    const d = (n) => COLORS.find(x => x[0] === n)[2];
    const m = COLORS.find(x => x[0] === st.mul)[3];
    const base = bands === 4 ? d(st.d1) * 10 + d(st.d2) : d(st.d1) * 100 + d(st.d2) * 10 + d(st.d3);
    const v = base * m;
    const tolPct = parseFloat(TOL[st.tol].replace(/[^\d.]/g, '')) / 100;
    out.innerHTML = `<span class="big">${fmtSI(v, 'Ω', 4)}</span>${TOL[st.tol]} · between <b>${fmtSI(v * (1 - tolPct), 'Ω', 4)}</b> and <b>${fmtSI(v * (1 + tolPct), 'Ω', 4)}</b>`;
    // drawing
    const s = svg('svg', { viewBox: '0 0 460 110', class: 'resistor-svg' });
    s.append(svg('line', { x1: 0, y1: 55, x2: 460, y2: 55, stroke: '#9aa3a8', 'stroke-width': 5 }));
    s.append(svg('path', { d: 'M100,25 q0,-10 20,-10 h40 q10,0 20,8 h100 q10,-8 20,-8 h40 q20,0 20,10 v60 q0,10 -20,10 h-40 q-10,0 -20,-8 h-100 q-10,8 -20,8 h-40 q-20,0 -20,-10 z', fill: '#e2c99a', stroke: '#9c8456', 'stroke-width': 2 }));
    const xs = bands === 4 ? [135, 170, 210, 320] : [130, 160, 190, 222, 320];
    keys.forEach((k, i) => {
      const col = COLORS.find(x => x[0] === st[k])[1];
      s.append(svg('rect', { x: xs[i] - 7, y: k === 'd1' || k === 'tol' ? 16 : 23, width: 14, height: k === 'd1' || k === 'tol' ? 78 : 64, fill: col, stroke: 'rgba(0,0,0,.25)' }));
    });
    pic.replaceChildren(s);
  }
  rev.input.addEventListener('input', () => {
    const v = rev.v;
    if (!(v > 0)) { revOut.textContent = ''; return; }
    const exp = Math.floor(Math.log10(v)) - (bands === 4 ? 1 : 2);
    const sig = Math.round(v / 10 ** exp);
    const ds = String(sig).padStart(bands === 4 ? 2 : 3, '0').split('').map(Number);
    const mulCol = COLORS.find(x => Math.abs(Math.log10(x[3]) - exp) < 1e-9);
    if (!mulCol || ds.length > (bands === 4 ? 2 : 3)) { revOut.textContent = 'That value is outside what colour bands can show.'; return; }
    const name = (n) => COLORS.find(x => x[2] === n)[0];
    st.d1 = name(ds[0]); st.d2 = name(ds[1]); if (bands === 5) st.d3 = name(ds[2]);
    st.mul = mulCol[0];
    revOut.textContent = '';
    render();
  });
  render();
})();

// ---------------------------------------------------------------- bases & codes
(function bases() {
  const c = card('bases', 'Number bases and codes', 'Type in any box. Negative decimals show their two\'s complement in the chosen width.', true);
  const width = el('select', { class: 'input' }, ...[4, 8, 12, 16, 32].map(w => el('option', { value: w, selected: w === 8 }, w + ' bits')));
  const f = {
    dec: num('Decimal', '45'), bin: num('Binary', ''), oct: num('Octal', ''), hex: num('Hexadecimal', ''),
  };
  const codes = el('table', { class: 'table codes' });
  const err = el('p', { class: 't-err' });
  c.append(el('div', { class: 't-row' }, el('label', { class: 'field', style: 'flex:0 0 140px' }, el('span', {}, 'Word width'), width)),
    el('div', { class: 'base-grid' }, f.dec.f, f.bin.f, f.oct.f, f.hex.f), err, codes);
  const RADIX = { dec: 10, bin: 2, oct: 8, hex: 16 };
  function from(src) {
    const raw = f[src].input.value.trim().replace(/[\s_]/g, '').replace(/^0[bxo]/i, '');
    if (!raw) return;
    const neg = raw.startsWith('-');
    const n = parseInt(raw, RADIX[src]);
    const valid = { dec: /^-?\d+$/, bin: /^[01]+$/, oct: /^[0-7]+$/, hex: /^[0-9a-f]+$/i }[src].test(raw);
    if (!valid || !Number.isFinite(n)) { err.textContent = `That is not a valid ${src === 'dec' ? 'decimal' : src === 'bin' ? 'binary' : src === 'oct' ? 'octal' : 'hex'} number.`; return; }
    err.textContent = '';
    show(n, src, neg);
  }
  function show(n, src) {
    const w = +width.value;
    const mask = 2 ** w;
    const u = ((n % mask) + mask) % mask;
    if (src !== 'dec') f.dec.input.value = String(n);
    if (src !== 'bin') f.bin.input.value = u.toString(2).padStart(w, '0');
    if (src !== 'oct') f.oct.input.value = u.toString(8);
    if (src !== 'hex') f.hex.input.value = u.toString(16).toUpperCase();
    const fits = n >= -(mask / 2) && n < mask;
    const abs = Math.abs(n);
    const gray = (abs ^ (abs >>> 1)).toString(2).padStart(Math.min(w, Math.max(1, abs.toString(2).length)), '0');
    const bcd = String(abs).split('').map(d => (+d).toString(2).padStart(4, '0')).join(' ');
    const xs3 = String(abs).split('').map(d => (+d + 3).toString(2).padStart(4, '0')).join(' ');
    const ones = (n < 0 ? (mask - 1 - abs) : n).toString(2).padStart(w, '0');
    const twos = u.toString(2).padStart(w, '0');
    const asSigned = u >= mask / 2 ? u - mask : u;
    codes.replaceChildren(el('tbody', {},
      row('Unsigned value of the bit pattern', String(u)),
      row(`Signed value (${w}-bit two's complement)`, String(asSigned)),
      row('One\'s complement', ones.slice(-w)),
      row('Two\'s complement', twos),
      row('Gray code (of |n|)', gray),
      row('BCD (8421)', bcd),
      row('Excess-3', xs3),
      fits ? null : row('Warning', `${n} does not fit in ${w} bits; showing the low ${w} bits.`),
    ));
  }
  const row = (a, b) => el('tr', {}, el('th', {}, a), el('td', {}, b));
  for (const k of Object.keys(f)) f[k].input.addEventListener('input', () => from(k));
  width.addEventListener('change', () => from('dec'));
  from('dec');
})();

// ---------------------------------------------------------------- expression to truth table
(function expr() {
  const c = card('expr', 'Expression to truth table', 'Type a Boolean expression. Use \' or ! for NOT, + for OR, juxtaposition or · for AND, ^ for XOR.', true);
  const inp = el('input', { class: 'input mono', value: "A'B + BC' + AC", spellcheck: 'false' });
  const err = el('p', { class: 't-err' });
  const out = el('div', { class: 't-out' });
  const table = el('div', { class: 'tt-tool-out' });
  const link = el('a', { class: 'btn btn--sm', href: 'kmap.html' }, 'Open this in the K-map solver');
  c.append(el('div', { class: 't-row' }, el('label', { class: 'field' }, el('span', {}, 'Expression'), inp)), err, out, el('div', { style: 'margin:10px 0' }, link), table);
  function run() {
    try {
      const { vars, values } = truthFromExpr(inp.value);
      if (vars.length > 6) throw new Error('Keep it to six variables or fewer.');
      err.textContent = '';
      const n = vars.length;
      const ones = [], zeros = [];
      values.forEach((v, m) => (v ? ones : zeros).push(m));
      const sol = n ? solveFunction(n, ones, [], vars) : null;
      out.innerHTML = `Variables <b>${vars.join(', ') || 'none'}</b><br>Σm(${ones.join(', ')})<br>ΠM(${zeros.join(', ')})` +
        (sol ? `<br>Minimal SOP <b>${sol.sopText[0]}</b><br>Minimal POS <b>${sol.posText[0]}</b>` : '');
      link.href = `kmap.html#n=${Math.max(2, n)}&v=${(vars.join('') + 'ABCDEF'.split('').filter(x => !vars.includes(x)).join('')).slice(0, Math.max(2, n))}&m=${ones.join('.')}&d=`;
      table.replaceChildren(el('table', { class: 'table' },
        el('thead', {}, el('tr', {}, ...vars.map(v => el('th', {}, v)), el('th', {}, 'F'))),
        el('tbody', {}, ...values.map((v, m) => el('tr', {}, ...vars.map((_, k) => el('td', {}, String((m >> (n - 1 - k)) & 1))), el('td', { class: 'f' }, String(v)))))));
    } catch (e) { err.textContent = e.message; }
  }
  inp.addEventListener('input', run);
  run();
})();

// ---------------------------------------------------------------- 555
(function t555() {
  const c = card('t555', '555 timer', 'Astable gives a square wave; monostable gives one pulse per trigger.');
  const mode = el('div', { class: 'seg', role: 'group' });
  const R1 = num('R1', '10k'), R2 = num('R2', '47k'), C = num('C', '10u');
  const out = el('div', { class: 't-out' });
  let m = 'astable';
  ['astable', 'monostable'].forEach(k => mode.append(el('button', { 'aria-pressed': String(k === m), onclick: (e) => { m = k; [...mode.children].forEach(b => b.setAttribute('aria-pressed', String(b === e.currentTarget))); R2.f.hidden = m !== 'astable'; R1.f.querySelector('span').textContent = m === 'astable' ? 'R1' : 'R'; run(); } }, k)));
  c.append(el('div', { class: 't-row' }, mode), el('div', { class: 't-row' }, R1.f, R2.f, C.f), out);
  function run() {
    const r1 = R1.v, r2 = R2.v, cc = C.v;
    if (m === 'astable') {
      if (!(r1 > 0 && r2 > 0 && cc > 0)) { out.textContent = 'Enter positive values.'; return; }
      const th = 0.693 * (r1 + r2) * cc, tl = 0.693 * r2 * cc, T = th + tl;
      out.innerHTML = `<span class="big">${fmtSI(1 / T, 'Hz')}</span>t<sub>HIGH</sub> = 0.693(R1+R2)C = <b>${fmtSI(th, 's')}</b><br>t<sub>LOW</sub> = 0.693·R2·C = <b>${fmtSI(tl, 's')}</b><br>Duty cycle = <b>${(th / T * 100).toFixed(1)} %</b>`;
    } else {
      if (!(r1 > 0 && cc > 0)) { out.textContent = 'Enter positive values.'; return; }
      out.innerHTML = `<span class="big">${fmtSI(1.1 * r1 * cc, 's')}</span>Pulse width T = 1.1·R·C`;
    }
  }
  [R1, R2, C].forEach(x => x.input.addEventListener('input', run));
  run();
})();

// ---------------------------------------------------------------- LED resistor
(function led() {
  const c = card('ledr', 'LED series resistor', 'R = (Vs − Vf) / I, rounded up to the next E12 value so the current stays at or below your target.');
  const Vs = num('Supply Vs', '5'), Vf = num('LED Vf', '2'), I = num('Current', '10m');
  const out = el('div', { class: 't-out' });
  c.append(el('div', { class: 't-row' }, Vs.f, Vf.f, I.f), el('p', { class: 'hint' }, 'Typical Vf: red 1.8–2 V, yellow 2 V, green 2.1 V, blue or white 3–3.3 V.'), out);
  function run() {
    const r = (Vs.v - Vf.v) / I.v;
    if (!(r > 0)) { out.textContent = 'Vs must be higher than Vf.'; return; }
    const e = nearestE12(r);
    const ia = (Vs.v - Vf.v) / e;
    out.innerHTML = `<span class="big">${fmtSI(e, 'Ω')}</span>Exact value ${fmtSI(r, 'Ω', 4)} · actual current <b>${fmtSI(ia, 'A')}</b> · resistor dissipates <b>${fmtSI(ia * ia * e, 'W')}</b>${ia * ia * e > 0.2 ? ' (use a ½ W part)' : ' (¼ W is fine)'}`;
  }
  [Vs, Vf, I].forEach(x => x.input.addEventListener('input', run));
  run();
})();

// ---------------------------------------------------------------- Ohm & divider
(function ohm() {
  const c = card('ohm', 'Ohm\'s law and voltage divider', 'Fill any two of V, I, R. The divider below uses Vout = Vin · R2 / (R1 + R2).');
  const V = num('V', '12'), I = num('I', ''), R = num('R', '1k');
  const out = el('div', { class: 't-out' });
  const Vin = num('Vin', '9'), R1 = num('R1', '10k'), R2 = num('R2', '4.7k');
  const out2 = el('div', { class: 't-out' });
  c.append(el('div', { class: 't-row' }, V.f, I.f, R.f), out, el('h3', { style: 'margin-top:16px' }, 'Divider'), el('div', { class: 't-row' }, Vin.f, R1.f, R2.f), out2);
  function run() {
    const v = V.v, i = I.v, r = R.v;
    let res;
    if (isFinite(v) && isFinite(r) && !isFinite(i)) res = { V: v, I: v / r, R: r };
    else if (isFinite(v) && isFinite(i) && !isFinite(r)) res = { V: v, I: i, R: v / i };
    else if (isFinite(i) && isFinite(r) && !isFinite(v)) res = { V: i * r, I: i, R: r };
    else if (isFinite(v) && isFinite(i) && isFinite(r)) res = { V: v, I: v / r, R: r };
    out.innerHTML = res ? `V = <b>${fmtSI(res.V, 'V')}</b> · I = <b>${fmtSI(res.I, 'A')}</b> · R = <b>${fmtSI(res.R, 'Ω')}</b> · P = <b>${fmtSI(res.V * res.I, 'W')}</b>` : 'Fill exactly two of the three.';
    const vo = Vin.v * R2.v / (R1.v + R2.v);
    out2.innerHTML = isFinite(vo) ? `<span class="big">${fmtSI(vo, 'V')}</span>Divider current ${fmtSI(Vin.v / (R1.v + R2.v), 'A')} · Thevenin resistance ${fmtSI(R1.v * R2.v / (R1.v + R2.v), 'Ω')}` : '—';
  }
  [V, I, R, Vin, R1, R2].forEach(x => x.input.addEventListener('input', run));
  run();
})();

// ---------------------------------------------------------------- RC / RL / RLC
(function rc() {
  const c = card('rc', 'RC, RL and RLC', 'Time constants, cut-off frequency, resonance and Q for a series circuit.');
  const R = num('R', '1k'), C = num('C', '100n'), L = num('L', '10m');
  const out = el('div', { class: 't-out' });
  c.append(el('div', { class: 't-row' }, R.f, C.f, L.f), out);
  function run() {
    const r = R.v, cc = C.v, l = L.v;
    const lines = [];
    if (r > 0 && cc > 0) lines.push(`RC: τ = <b>${fmtSI(r * cc, 's')}</b> · f<sub>c</sub> = 1/(2πRC) = <b>${fmtSI(1 / (2 * Math.PI * r * cc), 'Hz')}</b> · 5τ to settle = ${fmtSI(5 * r * cc, 's')}`);
    if (r > 0 && l > 0) lines.push(`RL: τ = L/R = <b>${fmtSI(l / r, 's')}</b> · f<sub>c</sub> = R/(2πL) = <b>${fmtSI(r / (2 * Math.PI * l), 'Hz')}</b>`);
    if (l > 0 && cc > 0) {
      const f0 = 1 / (2 * Math.PI * Math.sqrt(l * cc));
      const q = r > 0 ? Math.sqrt(l / cc) / r : Infinity;
      const z = r > 0 ? (r / 2) * Math.sqrt(cc / l) : 0;
      lines.push(`RLC: f<sub>0</sub> = <b>${fmtSI(f0, 'Hz')}</b> · Q = <b>${isFinite(q) ? q.toPrecision(3) : '∞'}</b> · ζ = ${z.toPrecision(3)} (${z < 1 ? 'under-damped, it rings' : z === 1 ? 'critically damped' : 'over-damped'}) · R for critical damping = ${fmtSI(2 * Math.sqrt(l / cc), 'Ω')}`);
    }
    out.innerHTML = lines.join('<br>') || 'Enter at least two values.';
  }
  [R, C, L].forEach(x => x.input.addEventListener('input', run));
  run();
})();

// ---------------------------------------------------------------- op-amp
(function opamp() {
  const c = card('opamp', 'Op-amp gain', 'Ideal op-amp. Output clips about 1.5 V inside the supply rails.');
  const Rin = num('Rin (or Rg)', '1k'), Rf = num('Rf', '10k'), Vin = num('Input peak', '0.5'), Vcc = num('Supply ±', '15');
  const out = el('div', { class: 't-out' });
  c.append(el('div', { class: 't-row' }, Rin.f, Rf.f), el('div', { class: 't-row' }, Vin.f, Vcc.f), out);
  function run() {
    const gi = -Rf.v / Rin.v, gn = 1 + Rf.v / Rin.v, rail = Vcc.v - 1.5;
    const clip = (g) => (Math.abs(g * Vin.v) > rail ? ` — clips at ±${fmtSI(rail, 'V')}` : '');
    out.innerHTML = `Inverting: gain <b>${gi.toPrecision(4)}</b> (${(20 * Math.log10(Math.abs(gi))).toFixed(1)} dB), output ${fmtSI(gi * Vin.v, 'V')} peak${clip(gi)}<br>Non-inverting: gain <b>${gn.toPrecision(4)}</b> (${(20 * Math.log10(gn)).toFixed(1)} dB), output ${fmtSI(gn * Vin.v, 'V')} peak${clip(gn)}`;
  }
  [Rin, Rf, Vin, Vcc].forEach(x => x.input.addEventListener('input', run));
  run();
})();

// ---------------------------------------------------------------- cap codes
(function capcode() {
  const c = card('capcode', 'Capacitor codes', 'Three digits on a ceramic capacitor: two significant figures and a power of ten, in picofarads. 104 is 10 × 10⁴ pF = 100 nF.');
  const code = num('Code', '104');
  const out = el('div', { class: 't-out' });
  c.append(el('div', { class: 't-row' }, code.f), out);
  function run() {
    const m = code.input.value.trim().match(/^(\d)(\d)(\d)([a-zA-Z]?)$/);
    if (!m) { out.textContent = 'Type three digits, like 103 or 474.'; return; }
    const pf = (+m[1] * 10 + +m[2]) * 10 ** +m[3];
    const tol = { J: '±5 %', K: '±10 %', M: '±20 %', Z: '+80/−20 %' }[m[4].toUpperCase()];
    out.innerHTML = `<span class="big">${fmtSI(pf * 1e-12, 'F')}</span>${pf.toLocaleString()} pF${tol ? ' · tolerance ' + tol : ''}`;
  }
  code.input.addEventListener('input', run);
  run();
})();
