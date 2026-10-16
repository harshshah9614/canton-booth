// Offline-first service worker.
// - App shell + public assets (styles, libraries, official hall maps): cached on install, refreshed in the background.
// - Dashboard tabs (d/*.html): private; the app downloads them from Google Drive after sign-in into the DASH cache.
const CACHE = 'canton-booth-v2.3.0';
const DASH = 'canton-dash';
const SHELL = ['./', './index.html', './app.js', './config.js', './manifest.webmanifest', './assets.json', './jsqr.js',
  './icon-192.png', './icon-512.png', './apple-touch-icon.png'];

// one dropped request on a weak connection must not abort the whole update: each file gets 3 tries
async function store(c, url) {
  for (let i = 0; i < 3; i++) {
    try {
      const res = await fetch(new Request(url, { cache: 'reload' }));   // skips the browser's 10-minute HTTP cache
      if (res.ok) { await c.put(url, res); return true; }
    } catch (err) { /* retry */ }
    await new Promise(r => setTimeout(r, 700 * (i + 1)));
  }
  return false;
}

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(async c => {
    const ok = await Promise.all(SHELL.map(u => store(c, u)));
    if (ok.includes(false)) throw new Error('app files not downloaded - the update retries next time the app opens');
    const list = await (await fetch('./assets.json', { cache: 'no-store' })).json();
    await Promise.all(list.map(p => store(c, './' + p)));   // a missing map must not disable offline mode
  }).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE && k !== DASH).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

const MISSING = `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Not downloaded</title>
<body style="font:16px -apple-system,Segoe UI,Roboto,sans-serif;padding:32px 22px;color:#0f172a;background:#f4f6fb">
<h2>This dashboard page is not on the phone yet</h2>
<p>Open the booth app, connect to the internet once (Wi-Fi, roaming or VPN), then tap <b>Dashboard &rarr; Download dashboard</b>.</p>
<p><a href="../index.html" style="color:#4338ca;font-weight:700">&larr; Back to the booth app</a></p></body>`;

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.includes('/d/')) {
    e.respondWith(caches.open(DASH).then(c => c.match(url.origin + url.pathname))
      .then(hit => hit || new Response(MISSING, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })));
    return;
  }
  const nav = e.request.mode === 'navigate';
  const key = nav ? './index.html' : e.request;
  e.respondWith(caches.open(CACHE).then(async cache => {
    const hit = await cache.match(key, { ignoreSearch: true });
    const fresh = fetch(new Request(nav ? './index.html' : e.request.url, { cache: 'no-cache' })).then(res => {
      if (res.ok) cache.put(key, res.clone());
      return res;
    }).catch(() => hit);
    return hit || fresh;
  }));
});
