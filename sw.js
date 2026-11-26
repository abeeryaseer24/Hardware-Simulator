// Offline support. Every page and script is stored on the first visit, so the app keeps
// working with no internet. When online, the newest version always loads first.
const VERSION = 'bn-10';
const FILES = [
  "./",
  "about.html",
  "analog-bench.html",
  "analog.html",
  "assets/apple-touch-icon.png",
  "assets/favicon.svg",
  "assets/icon-192.png",
  "assets/icon-512.png",
  "assets/icon-maskable.png",
  "breadboard.html",
  "css/analog-lab.css",
  "css/analog.css",
  "css/base.css",
  "css/guide.css",
  "css/home.css",
  "css/kmap.css",
  "css/lab.css",
  "css/trainer.css",
  "digital.html",
  "index.html",
  "js/analog-lab.js",
  "js/analog/abench.js",
  "js/analog/aboard.js",
  "js/analog/aexperiments.js",
  "js/analog/atrainer.js",
  "js/analog/engine.js",
  "js/analog/presets.js",
  "js/analog/schematic.js",
  "js/breadboard.js",
  "js/digital-lab.js",
  "js/digital/autobuild.js",
  "js/digital/autofix.js",
  "js/digital/bench.js",
  "js/digital/board.js",
  "js/digital/chips.js",
  "js/digital/experiments.js",
  "js/digital/model.js",
  "js/digital/pinout.js",
  "js/home.js",
  "js/kmap.js",
  "js/sandbox.js",
  "js/shared/boolean.js",
  "js/shared/lab-side.js",
  "js/shared/pinch.js",
  "js/shared/share.js",
  "js/shared/wide.js",
  "js/shared/viewlock.js",
  "js/shared/site.js",
  "js/toolkit.js",
  "kmap.html",
  "logic-bench.html",
  "practice.html",
  "revision.html",
  "sandbox.html",
  "toolkit.html",
  "manifest.webmanifest"
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // fonts: keep the stored copy, download once
  if (FONT_HOSTS.includes(url.hostname)) {
    e.respondWith(caches.open(VERSION).then(async (c) => {
      const hit = await c.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok || res.type === 'opaque') c.put(req, res.clone());
      return res;
    }));
    return;
  }
  if (url.origin !== location.origin) return;

  // our own files: network first so updates show at once, stored copy when offline
  e.respondWith((async () => {
    const c = await caches.open(VERSION);
    const stored = await c.match(req, { ignoreSearch: true });
    const net = fetch(req, { cache: 'no-cache' }).then((res) => { if (res.ok) c.put(req, res.clone()); return res; });
    net.catch(() => {});
    try {
      // on a very slow connection, fall back to the stored copy after 4 s
      if (!stored) return await net;
      return await Promise.race([net, new Promise((_, no) => setTimeout(() => no(new Error('slow')), 4000))]);
    } catch {
      const hit = stored || await c.match(req, { ignoreSearch: true });
      if (hit) return hit;
      if (req.mode === 'navigate') return (await c.match('index.html')) || Response.error();
      return Response.error();
    }
  })());
});
