// Experiment sidebar shared by the lab pages.
import { el, $ } from './site.js';

const DONE_KEY = 'bn-done';
export function doneSet() { try { return new Set(JSON.parse(localStorage.getItem(DONE_KEY) || '[]')); } catch { return new Set(); } }
export function markDone(id) { const s = doneSet(); s.add(id); localStorage.setItem(DONE_KEY, JSON.stringify([...s])); }

/**
 * items: [{ id, title, group, sub }]
 * extra: [{ label, items:[{ id, title, sub, href }] }] groups rendered after experiments (links)
 */
export function renderSide({ host, items, activeId, onPick, extra = [], filter = '' }) {
  host.replaceChildren();
  const f = filter.toLowerCase().trim();
  const done = doneSet();
  const groups = [...new Set(items.map(i => i.group))];
  for (const g of groups) {
    const list = items.filter(i => i.group === g && (!f || (i.title + ' ' + (i.sub || '') + ' ' + g).toLowerCase().includes(f)));
    if (!list.length) continue;
    const open = !!f || list.some(i => i.id === activeId) || g === groups[0];
    const d = el('details', { class: 'side-group', open });
    d.append(el('summary', {}, g, el('span', { class: 'count' }, String(list.length))));
    const ul = el('ul');
    for (const i of list) {
      ul.append(el('li', {}, el('button', {
        class: 'side-item' + (i.id === activeId ? ' is-active' : ''),
        onclick: () => onPick(i),
      }, el('span', { class: 't' }, i.title, done.has(i.id) ? el('span', { class: 'done', title: 'Checked and working' }, '✓') : null),
      i.sub ? el('span', { class: 's' }, i.sub) : null)));
    }
    d.append(ul);
    host.append(d);
  }
  for (const g of extra) {
    const d = el('details', { class: 'side-group', open: true });
    d.append(el('summary', {}, g.label));
    const ul = el('ul');
    for (const i of g.items) {
      ul.append(el('li', {}, el('a', { class: 'side-item' + (i.id === activeId ? ' is-active' : ''), href: i.href, style: 'text-decoration:none' },
        el('span', { class: 't' }, i.title), i.sub ? el('span', { class: 's' }, i.sub) : null)));
    }
    d.append(ul);
    host.append(d);
  }
  if (!host.children.length) host.append(el('p', { class: 'empty' }, 'Nothing matches that search.'));
}

export function bindSideToggle() {
  const side = $('#side'), btn = $('#sideBtn');
  if (!side || !btn) return;
  btn.addEventListener('click', (e) => { e.stopPropagation(); side.classList.toggle('is-open'); });
  document.addEventListener('click', (e) => { if (!side.contains(e.target) && e.target !== btn) side.classList.remove('is-open'); });
}

export const DIGITAL_TOOLS = {
  label: 'Logic tools',
  items: [
    { id: 'kmap', title: 'K-Map solver', sub: 'SOP, POS, 2–6 variables', href: 'kmap.html' },
  ],
};
