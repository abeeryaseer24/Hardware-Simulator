// Two-finger pinch zoom and pan for an SVG board (digital or analog).
// The board must expose: svg, vb {x,y,w,h}, applyView(), and resetGesture() to drop
// whatever single-finger action had started.
export function addPinch(board, { minW = 160, maxW = 1400 } = {}) {
  const pts = new Map();
  let start = null;
  const s = board.svg;
  const dist = () => { const [a, b] = [...pts.values()]; return Math.hypot(a.x - b.x, a.y - b.y) || 1; };
  const mid = () => { const [a, b] = [...pts.values()]; return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; };

  s.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'touch') return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 2) {
      board.resetGesture?.();
      const r = s.getBoundingClientRect();
      start = { d: dist(), m: mid(), vb: { ...board.vb }, r };
      e.stopImmediatePropagation();
    }
  }, true);

  s.addEventListener('pointermove', (e) => {
    if (!pts.has(e.pointerId)) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size < 2 || !start) return;
    e.stopImmediatePropagation();
    const { vb: v0, r, m: m0 } = start;
    const k = start.d / dist();
    const w = Math.max(minW, Math.min(maxW, v0.w * k));
    const h = v0.h * (w / v0.w);
    // keep the point under the fingers' midpoint fixed, and follow the midpoint as it moves
    const ux = v0.x + ((m0.x - r.left) / r.width) * v0.w;
    const uy = v0.y + ((m0.y - r.top) / r.height) * v0.h;
    const m = mid();
    board.vb.w = w; board.vb.h = h;
    board.vb.x = ux - ((m.x - r.left) / r.width) * w;
    board.vb.y = uy - ((m.y - r.top) / r.height) * h;
    board.applyView();
  }, true);

  const end = (e) => {
    if (!pts.has(e.pointerId)) return;
    const wasPinch = pts.size === 2;
    pts.delete(e.pointerId);
    if (wasPinch) { start = null; e.stopImmediatePropagation(); board.resetGesture?.(); }
  };
  s.addEventListener('pointerup', end, true);
  s.addEventListener('pointercancel', end, true);
}
