// View lock for the boards: stray swipes, scrolls and drags never move the board.
// Zooming and moving stay available through deliberate gestures:
//   zoom  - pinch (phone or trackpad), Ctrl/Cmd + scroll, or the + / - buttons
//   move  - two-finger drag on a phone, Space + drag or middle-button drag on a computer
// Unlocked, the board behaves as before, except a trackpad swipe pans instead of zooming.
import { el, toast } from './site.js';

const KEY = 'bn-viewlock';
let locked = (() => { try { const v = localStorage.getItem(KEY); return v === null ? true : v === '1'; } catch { return true; } })();
const boards = new Set();
let space = false;
let hinted = false;

export const isLocked = () => locked;

export function setLocked(v) {
  locked = !!v;
  try { localStorage.setItem(KEY, locked ? '1' : '0'); } catch { /* private mode */ }
  document.dispatchEvent(new CustomEvent('viewlockchange', { detail: locked }));
}

const touchDevice = () => typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
function hintOnce() {
  if (hinted) return;
  hinted = true;
  toast(touchDevice()
    ? 'The board is locked in place. Pinch to zoom, drag with two fingers to move it.'
    : 'The board is locked in place. Pinch or Ctrl + scroll to zoom, hold Space and drag to move it.');
}

const hovered = () => [...boards].some(b => b._hover);
addEventListener('keydown', (e) => {
  if (e.code !== 'Space') return;
  if (e.target.closest?.('input, textarea, select, [contenteditable]') || !hovered()) return;
  e.preventDefault();
  if (!space) { space = true; boards.forEach(b => b.svg.classList.add('is-spacepan')); }
});
const endSpace = () => { space = false; boards.forEach(b => b.svg.classList.remove('is-spacepan')); };
addEventListener('keyup', (e) => { if (e.code === 'Space') endSpace(); });
addEventListener('blur', endSpace);

// board needs: svg, vb, applyView(), zoom(f, cx, cy), toSvg(e)
export function addViewControls(board) {
  boards.add(board);
  const s = board.svg;
  s.addEventListener('pointerenter', () => { board._hover = true; });
  s.addEventListener('pointerleave', () => { board._hover = false; });

  // a deliberate "move the board" gesture, allowed even when locked
  board.forcePan = (e) => e.button === 1 || (space && board._hover);
  // may a plain drag on empty board move it?
  board.dragPans = () => !locked;
  // locked + one finger on empty board: scroll the page instead, like any other content
  board.lockedTouchScroll = (dy) => { hintOnce(); window.scrollBy(0, dy); };
  board.lockedHint = hintOnce;

  s.addEventListener('wheel', (e) => {
    if (e.ctrlKey || e.metaKey) {
      // trackpad pinch arrives as Ctrl + wheel; Ctrl + mouse wheel zooms too
      e.preventDefault();
      const p = board.toSvg(e);
      board.zoom(Math.exp(Math.max(-0.5, Math.min(0.5, e.deltaY * 0.01))), p.x, p.y);
      return;
    }
    if (locked) { hintOnce(); return; }  // the board stays put; the page may scroll
    e.preventDefault();
    const mouseWheel = e.deltaMode === 1 || (e.deltaX === 0 && Math.abs(e.deltaY) >= 40 && Number.isInteger(e.deltaY));
    if (mouseWheel) {
      const p = board.toSvg(e);
      board.zoom(e.deltaY > 0 ? 1.12 : 1 / 1.12, p.x, p.y);
      return;
    }
    // trackpad two-finger swipe: move the board, don't zoom it
    const r = s.getBoundingClientRect(), k = board.vb.w / (r.width || 1);
    board.vb.x += e.deltaX * k; board.vb.y += e.deltaY * k;
    board.applyView();
  }, { passive: false });
}

const ICON_LOCK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="9" rx="1"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';
const ICON_OPEN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="9" rx="1"/><path d="M8 11V8a4 4 0 0 1 7.5-2"/></svg>';

export function lockButton() {
  const btn = el('button', { class: 'tb-lock' });
  const paint = () => {
    btn.innerHTML = `${locked ? ICON_LOCK : ICON_OPEN}<span>${locked ? 'Locked' : 'Unlocked'}</span>`;
    btn.setAttribute('aria-pressed', String(locked));
    btn.title = locked
      ? 'The board stays put. Zoom: pinch, Ctrl + scroll or the buttons. Move: two fingers, or Space + drag. Click to unlock.'
      : 'Swipes and drags move the board. Click to lock it in place.';
  };
  paint();
  btn.addEventListener('click', () => {
    setLocked(!locked);
    toast(locked
      ? (touchDevice() ? 'Board locked. Pinch to zoom, two fingers to move.' : 'Board locked. Pinch or Ctrl + scroll to zoom, Space + drag to move.')
      : 'Board unlocked. Drag an empty spot or swipe to move it.');
  });
  document.addEventListener('viewlockchange', paint);
  return btn;
}
