// Wide workbench: the board and its side panel fill the whole screen.
// On a phone it also asks to turn sideways, so the breadboard runs along the long edge.
import { el } from './site.js';

const ICON_ON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="6" width="19" height="12" rx="2"/><path d="M7 10v4M17 10v4"/></svg>';
const ICON_OFF = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/></svg>';
const touch = () => typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

export function wideButton(host, refit) {
  const view = () => host.closest('.lab-view') || host.closest('.pane');
  const label = (on) => `${on ? ICON_OFF : ICON_ON}<span>${on ? 'Exit' : touch() ? 'Landscape' : 'Full screen'}</span>`;
  const btn = el('button', { title: 'Fill the screen with the board (turns a phone sideways)', 'aria-pressed': 'false', class: 'tb-wide', html: label(false) });

  const apply = (on) => {
    const v = view();
    if (!v) return;
    v.classList.toggle('is-full', on);
    document.body.classList.toggle('has-full', on);
    // toasts live in <body>; in real full screen only the full-screen element is drawn
    const toasts = document.querySelector('.toast-host');
    if (toasts) (on ? v : document.body).append(toasts);
    btn.setAttribute('aria-pressed', String(on));
    btn.innerHTML = label(on);
    requestAnimationFrame(() => requestAnimationFrame(refit));
  };

  btn.addEventListener('click', async () => {
    const v = view();
    if (!v) return;
    const on = !v.classList.contains('is-full');
    apply(on);
    try {
      if (on) {
        if (v.requestFullscreen && !document.fullscreenElement) await v.requestFullscreen({ navigationUI: 'hide' });
        await screen.orientation?.lock?.('landscape');
      } else {
        screen.orientation?.unlock?.();
        if (document.fullscreenElement) await document.exitFullscreen();
      }
    } catch { /* iPhone and desktop browsers may refuse; the in-page layout still works */ }
  });

  // leaving full screen with Esc or the phone's back gesture also leaves the wide layout
  document.addEventListener('fullscreenchange', () => {
    const v = view();
    if (!document.fullscreenElement && v?.classList.contains('is-full')) apply(false);
  });
  addEventListener('orientationchange', () => { if (view()?.classList.contains('is-full')) setTimeout(refit, 250); });
  addEventListener('resize', () => { if (view()?.classList.contains('is-full')) requestAnimationFrame(refit); });
  return btn;
}
