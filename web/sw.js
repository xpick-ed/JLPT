// PWA service worker: precache the app shell, serve same-origin GET via
// stale-while-revalidate. Cross-origin (Worker sync, GIS, Google Fonts) is
// never intercepted — those always go to the network.
const CACHE = 'jlpt-pwa-v36';   // bump on each release to refresh the shell
const SHELL = [
  './', './index.html', './style.css', './config.js', './manifest.json',
  './js/app.js', './js/ui.js', './js/store.js', './js/session.js', './js/srs.js', './js/progress.js',
  './js/audio.js', './js/bgm.js', './js/combo.js', './js/achievements.js', './js/stats.js', './js/vocab-test.js', './js/exam.js', './js/ghost.js', './js/sync.js', './js/auth.js', './js/furigana.js',
  './js/modes/match.js', './js/modes/typing.js', './js/modes/quiz.js', './js/modes/listening.js', './js/modes/vocab-cloze.js', './js/modes/particle.js', './js/modes/homophone.js', './js/modes/dictation.js', './js/modes/shadow.js', './js/modes/conjug.js', './js/modes/strokes.js', './js/conjugate.js', './js/coach.js', './js/pitch.js', './js/reader.js',
  './js/modes/falling.js', './js/modes/grammar-cloze.js', './js/modes/grammar-order.js', './js/modes/grammar-dict.js',
  './js/modes/reading.js',
  './icons/icon-192.png', './icons/icon-512.png',
  './data/n5.json', './data/n4.json', './data/n3.json', './data/n2.json', './data/n1.json',
  './data/grammar_n5.json', './data/grammar_n4.json', './data/grammar_n3.json', './data/grammar_n2.json', './data/grammar_n1.json',
  './data/grammar_order_n5.json', './data/grammar_order_n4.json', './data/grammar_order_n3.json', './data/grammar_order_n2.json', './data/grammar_order_n1.json',
  './data/strokes_n5.json', './data/strokes_n4.json', './data/strokes_n3.json', './data/strokes_n2.json', './data/strokes_n1.json',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;                      // sync PUT/POST → network
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;       // cross-origin → network (Worker/GIS/fonts)
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(req);
    const network = fetch(req)
      .then((res) => { if (res && res.ok) cache.put(req, res.clone()); return res; })
      .catch(() => null);
    e.waitUntil(network);                                // finish the background revalidation
    return cached || (await network) || new Response('', { status: 504 });
  })());
});
