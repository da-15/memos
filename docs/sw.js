// もちメモ service worker: オフラインでも開けるようにアプリ本体をキャッシュする
const CACHE = 'mochimemo-v48';
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/apple-touch-icon.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  // ブラウザに残っている古いファイルではなく、必ずGitHubから最新を取ってくる（cache: 'reload'）
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
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
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Google Fonts: キャッシュを先に返し、裏で更新
  if (url.host === 'fonts.googleapis.com' || url.host === 'fonts.gstatic.com') {
    e.respondWith(
      caches.open(CACHE).then(async (c) => {
        const hit = await c.match(req);
        const net = fetch(req).then((res) => { c.put(req, res.clone()); return res; }).catch(() => hit);
        return hit || net;
      })
    );
    return;
  }

  if (url.origin !== location.origin) return;

  // ページ本体: キャッシュ優先（起動速度を優先）。
  // 起動時はキャッシュしたHTMLをすぐに返し、裏側でGitHubから最新版を取得する。
  // 取得した最新版はキャッシュに保存し、次回起動時から使用する。
  // オフライン時はキャッシュしたHTMLをそのまま使用する。
  if (req.mode === 'navigate') {
    e.respondWith(
      caches.match('./index.html').then(async (hit) => {
        const update = fetch(req.url, {
          cache: 'no-cache',
          credentials: 'same-origin'
        }).then(async (res) => {
          if (res.ok) {
            const c = await caches.open(CACHE);
            await c.put('./index.html', res.clone());
          }
          return res;
        });
  
        if (hit) {
          e.waitUntil(update.catch(() => {}));
          return hit;
        }
  
        return update;
      })
    );
    return;
  }

  e.respondWith(caches.match(req).then((hit) => hit || fetch(req)));
});
