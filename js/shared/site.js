// Shared page chrome: top bar, theme, footer, toasts.

const PAGES = [
  { href: 'index.html', label: 'Home', key: 'home' },
  { href: 'logic-bench.html', label: 'Logic bench', key: 'logic' },
  { href: 'kmap.html', label: 'K-map solver', key: 'kmap' },
  { href: 'analog-bench.html', label: 'Analog bench', key: 'analog' },
  { href: 'breadboard.html', label: 'Breadboard 101', key: 'breadboard' },
  { href: 'toolkit.html', label: 'Toolkit', key: 'toolkit' },
  { href: 'revision.html', label: 'Revision sheet', key: 'revision' },
];

const LOGO = `
<svg viewBox="0 0 40 40" aria-hidden="true">
  <rect x="9" y="5" width="22" height="30" rx="2" fill="#16201b" stroke="#d4a73a" stroke-width="1.2"/>
  <path d="M17 5a3 3 0 0 0 6 0" fill="#0f3d30" stroke="#d4a73a" stroke-width="1.2"/>
  ${[11, 17, 23, 29].map(y => `<rect x="4" y="${y - 1.5}" width="5" height="3" fill="#d4a73a"/><rect x="31" y="${y - 1.5}" width="5" height="3" fill="#d4a73a"/>`).join('')}
  <circle cx="13.5" cy="30" r="1.6" fill="#e5383b"/>
</svg>`;

const ICON_SUN = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4.2"/><path d="M12 2v2.5M12 19.5V22M4.2 4.2l1.8 1.8M18 18l1.8 1.8M2 12h2.5M19.5 12H22M4.2 19.8 6 18M18 6l1.8-1.8"/></svg>`;
const ICON_MOON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z"/></svg>`;

export function applyStoredTheme() {
  const t = localStorage.getItem('bn-theme');
  if (t) document.documentElement.dataset.theme = t;
}
applyStoredTheme();

export function mountChrome(active) {
  const bar = document.createElement('header');
  bar.className = 'bar';
  bar.innerHTML = `
    <a class="bar__brand" href="index.html" aria-label="Benchnote home">
      ${LOGO}
      <span class="bar__word">Benchnote<small>EEE lab simulator</small></span>
    </a>
    <nav aria-label="Sections" style="display:flex;flex:1;min-width:0">
      <ul class="fingers">
        ${PAGES.filter(p => p.key !== 'home').map(p => `<li><a href="${p.href}"${p.key === active ? ' aria-current="page"' : ''}>${p.label}</a></li>`).join('')}
      </ul>
    </nav>
    <div class="bar__tools">
      <button class="icon-btn" id="themeBtn" type="button" aria-label="Toggle dark theme"></button>
    </div>`;
  document.body.prepend(bar);

  const btn = bar.querySelector('#themeBtn');
  const paint = () => {
    const dark = document.documentElement.dataset.theme === 'dark';
    btn.innerHTML = dark ? ICON_SUN : ICON_MOON;
    btn.title = dark ? 'Lab lights on' : 'Lab lights off';
  };
  paint();
  btn.addEventListener('click', () => {
    const dark = document.documentElement.dataset.theme === 'dark';
    const next = dark ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    localStorage.setItem('bn-theme', next);
    paint();
    document.dispatchEvent(new CustomEvent('themechange'));
  });

  const host = document.createElement('div');
  host.className = 'toast-host';
  host.setAttribute('role', 'status');
  host.setAttribute('aria-live', 'polite');
  document.body.append(host);
}

export function mountFooter() {
  const f = document.createElement('footer');
  f.className = 'footer';
  f.innerHTML = `
    <div class="wrap">
      <span class="footer__silk">Benchnote</span>
      <span>Runs entirely in your browser. Nothing is uploaded, no account needed.</span>
      <span><a href="https://github.com/abeeryaseer24/Hardware-Simulator">Source on GitHub</a></span>
    </div>`;
  document.body.append(f);
}

export function toast(msg, kind = '') {
  const host = document.querySelector('.toast-host');
  if (!host) return;
  const t = document.createElement('div');
  t.className = 'toast' + (kind ? ' toast--' + kind : '');
  t.textContent = msg;
  host.append(t);
  setTimeout(() => t.remove(), 3200);
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function el(tag, attrs = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') n.className = v;
    else if (k === 'html') n.innerHTML = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) n.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat()) if (k != null) n.append(k);
  return n;
}

export const SVGNS = 'http://www.w3.org/2000/svg';
export function svg(tag, attrs = {}) {
  const n = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) n.setAttribute(k, v);
  return n;
}

// Parse engineering values: 4.7k, 10u, 2M2, 100n, 1meg, 0.5m
export function parseSI(str) {
  if (typeof str === 'number') return str;
  const s = String(str).trim().replace(/Ω|ohm|F|H|V|A|Hz|s$/gi, '').trim();
  const m = s.match(/^([-+]?\d*\.?\d+(?:e[-+]?\d+)?)\s*(meg|[pnuµmkKMG])?(\d*)$/);
  if (!m) return NaN;
  const mult = { p: 1e-12, n: 1e-9, u: 1e-6, 'µ': 1e-6, m: 1e-3, k: 1e3, K: 1e3, M: 1e6, meg: 1e6, G: 1e9 };
  if (!m[2]) return m[3] ? NaN : parseFloat(m[1]);
  // "4k7" style: the prefix doubles as the decimal point
  const base = m[3] && !m[1].includes('.') ? parseFloat(m[1] + '.' + m[3]) : parseFloat(m[1]);
  return base * mult[m[2]];
}

export function fmtSI(v, unit = '', digits = 3) {
  if (!isFinite(v)) return '—';
  if (v === 0) return '0 ' + unit;
  const a = Math.abs(v);
  const steps = [[1e9, 'G'], [1e6, 'M'], [1e3, 'k'], [1, ''], [1e-3, 'm'], [1e-6, 'µ'], [1e-9, 'n'], [1e-12, 'p']];
  for (const [f, p] of steps) {
    if (a >= f * 0.9995) return +(v / f).toPrecision(digits) + ' ' + p + unit;
  }
  return v.toExponential(2) + ' ' + unit;
}
