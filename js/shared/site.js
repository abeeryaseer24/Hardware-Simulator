// Shared page chrome: navigation, theme, footer, toasts and small DOM helpers.

export const AUTHOR = 'Talha Yaseer Abeer';
export const YEAR = 2026;
const REPO = 'https://github.com/abeeryaseer24/Hardware-Simulator';

const NAV = [
  { href: 'practice.html', label: 'Practice', key: 'practice' },
  { href: 'digital.html', label: 'Digital Lab', key: 'digital' },
  { href: 'analog.html', label: 'Analog Lab', key: 'analog' },
  { href: 'toolkit.html', label: 'Tools', key: 'toolkit' },
  {
    label: 'Learn', key: 'learn', items: [
      { href: 'breadboard.html', label: 'Breadboard basics', note: 'Strips, rails, pinouts, debugging', key: 'breadboard' },
      { href: 'revision.html', label: 'Revision sheet', note: 'Formulas and tables for the viva', key: 'revision' },
      { href: 'sandbox.html', label: 'Schematic sandbox', note: 'Draw any circuit as a schematic', key: 'sandbox' },
    ],
  },
  { href: 'about.html', label: 'About', key: 'about' },
];

const LOGO = `
<svg viewBox="0 0 40 40" aria-hidden="true">
  <rect width="40" height="40" rx="10" fill="#0d5c44"/>
  <rect x="12" y="8" width="16" height="24" rx="2" fill="#0f1814" stroke="#e0ad2c" stroke-width="1.3"/>
  <path d="M17.5 8a2.5 2.5 0 0 0 5 0" fill="#0d5c44" stroke="#e0ad2c" stroke-width="1.3"/>
  ${[13, 19, 25].map(y => `<rect x="8" y="${y - 1.2}" width="4" height="2.4" fill="#e0ad2c"/><rect x="28" y="${y - 1.2}" width="4" height="2.4" fill="#e0ad2c"/>`).join('')}
  <circle cx="16" cy="28" r="1.6" fill="#ff4b4b"/>
</svg>`;

const ICON_SUN = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4.2"/><path d="M12 2v2.5M12 19.5V22M4.2 4.2l1.8 1.8M18 18l1.8 1.8M2 12h2.5M19.5 12H22M4.2 19.8 6 18M18 6l1.8-1.8"/></svg>`;
const ICON_MOON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z"/></svg>`;
const CHEVRON = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="m6 9 6 6 6-6"/></svg>`;

(function applyStoredTheme() {
  const t = localStorage.getItem('bn-theme');
  if (t) document.documentElement.dataset.theme = t;
})();

export function mountChrome(active) {
  const bar = document.createElement('header');
  bar.className = 'bar';
  const links = NAV.map(n => {
    if (n.items) {
      const on = n.items.some(i => i.key === active);
      return `<button type="button" class="nav-drop" aria-haspopup="true" aria-expanded="false"${on ? ' aria-current="page"' : ''}>${n.label}${CHEVRON}</button>`;
    }
    return `<a href="${n.href}"${n.key === active ? ' aria-current="page"' : ''}>${n.label}</a>`;
  }).join('');
  bar.innerHTML = `
    <a class="bar__brand" href="index.html" aria-label="Benchnote home">${LOGO}<span class="bar__word">Benchnote</span></a>
    <nav class="nav" aria-label="Main">${links}</nav>
    <div class="bar__tools"><button class="icon-btn" id="themeBtn" type="button" aria-label="Toggle dark theme"></button></div>`;
  document.body.prepend(bar);

  // Learn dropdown
  const drop = bar.querySelector('.nav-drop');
  const learn = NAV.find(n => n.items);
  let menu = null;
  const close = () => { menu?.remove(); menu = null; drop.setAttribute('aria-expanded', 'false'); };
  drop.addEventListener('click', (e) => {
    e.stopPropagation();
    if (menu) { close(); return; }
    const r = drop.getBoundingClientRect();
    menu = document.createElement('div');
    menu.className = 'nav-menu';
    menu.setAttribute('role', 'menu');
    menu.style.left = Math.min(r.left, window.innerWidth - 250) + 'px';
    menu.style.top = r.bottom + 6 + 'px';
    menu.innerHTML = learn.items.map(i => `<a role="menuitem" href="${i.href}">${i.label}<small>${i.note}</small></a>`).join('');
    document.body.append(menu);
    drop.setAttribute('aria-expanded', 'true');
    menu.querySelector('a').focus();
  });
  document.addEventListener('click', close);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  window.addEventListener('resize', close);

  const btn = bar.querySelector('#themeBtn');
  const paint = () => {
    const dark = document.documentElement.dataset.theme === 'dark';
    btn.innerHTML = dark ? ICON_SUN : ICON_MOON;
    btn.title = dark ? 'Light theme' : 'Dark theme';
  };
  paint();
  btn.addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
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
      <span>© ${YEAR} <strong>${AUTHOR}</strong>. All rights reserved.</span>
      <nav aria-label="Footer">
        <a href="about.html">About</a>
        <a href="${REPO}">Source code</a>
      </nav>
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
  setTimeout(() => t.remove(), 3400);
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function el(tag, attrs = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') n.className = v;
    else if (k === 'html') n.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) n.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat()) if (k != null && k !== false) n.append(k);
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
  const base = m[3] && !m[1].includes('.') ? parseFloat(m[1] + '.' + m[3]) : parseFloat(m[1]);
  return base * mult[m[2]];
}

export function fmtSI(v, unit = '', digits = 3) {
  if (v == null || !isFinite(v)) return '—';
  if (Math.abs(v) < 1e-12) return '0 ' + unit;
  const a = Math.abs(v);
  const steps = [[1e9, 'G'], [1e6, 'M'], [1e3, 'k'], [1, ''], [1e-3, 'm'], [1e-6, 'µ'], [1e-9, 'n'], [1e-12, 'p']];
  for (const [f, p] of steps) {
    if (a >= f * 0.9995) return +(v / f).toPrecision(digits) + ' ' + p + unit;
  }
  return v.toExponential(2) + ' ' + unit;
}

export const FONT_LINK = 'https://fonts.googleapis.com/css2?family=Geist:wght@300..800&family=Geist+Mono:wght@400..600&display=swap';
