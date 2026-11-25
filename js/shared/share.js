// Share a breadboard as a link. The whole circuit is packed into the part of the URL
// after '#', so nothing is uploaded anywhere: the link itself carries the circuit.
import { toast } from './site.js';

const b64url = (bytes) => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const unb64url = (str) => {
  const s = atob(str.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
};
const canZip = typeof CompressionStream === 'function' && typeof DecompressionStream === 'function';

async function pipe(bytes, stream) {
  const out = new Response(new Blob([bytes]).stream().pipeThrough(stream));
  return new Uint8Array(await out.arrayBuffer());
}

export async function encodeCircuit(data) {
  const raw = new TextEncoder().encode(JSON.stringify(data));
  if (canZip) return 'z' + b64url(await pipe(raw, new CompressionStream('deflate-raw')));
  return 'j' + b64url(raw);
}

export async function decodeCircuit(code) {
  const kind = code[0], bytes = unb64url(code.slice(1));
  const raw = kind === 'z' ? await pipe(bytes, new DecompressionStream('deflate-raw')) : bytes;
  return JSON.parse(new TextDecoder().decode(raw));
}

// Build the link for this page and hand it to the phone's share sheet, or copy it.
export async function shareCircuit(data, title = 'My circuit') {
  const empty = !(data.parts?.length || data.chips?.length || data.wires?.length);
  if (empty) { toast('The board is empty. Build something first, then share it.'); return; }
  const url = new URL(location.href);
  url.searchParams.delete('exam');
  if (url.searchParams.has('view')) url.searchParams.set('view', 'practice');
  url.hash = 'c=' + await encodeCircuit(data);
  const link = url.toString();
  if (navigator.share && matchMedia('(pointer: coarse)').matches) {
    try { await navigator.share({ title, text: 'Open my circuit on Benchnote:', url: link }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  try { await navigator.clipboard.writeText(link); toast('Link copied. Paste it to a friend and they get this exact circuit.', 'ok'); }
  catch { prompt('Copy this link:', link); }
}

// If the page was opened from a shared link, return the circuit (once) and tidy the URL.
export async function takeSharedCircuit() {
  const m = location.hash.match(/^#c=([A-Za-z0-9_-]+)$/);
  if (!m) return null;
  history.replaceState(null, '', location.pathname + location.search);
  try { return await decodeCircuit(m[1]); }
  catch { toast('That shared link is broken or incomplete.'); return null; }
}

export const SHARE_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="2.6"/><circle cx="6" cy="12" r="2.6"/><circle cx="18" cy="19" r="2.6"/><path d="m8.3 10.8 7.4-4.4M8.3 13.2l7.4 4.4"/></svg>';
