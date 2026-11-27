// もちメモ service worker: オフラインでも開けるようにアプリ本体をキャッシュする
const CACHE = 'mochimemo-v28';
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

  // ページ本体: ネット優先（更新をすぐ反映）、オフライン時はキャッシュ。
  // GitHub Pagesは「10分間は使い回してよい」と返すので、cache: 'no-cache' で毎回GitHubに確認する
  // （変わっていなければ中身は送られてこないので、通信はほとんど増えない）
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' })
        .then((res) => {
          // ちゃんと取れたときだけオフライン用に保存する。GitHub がエラーを返したときは、保存してあるページを出す
          if (!res.ok) return caches.match('./index.html').then((hit) => hit || res);
          const copy = res.clone(); caches.open(CACHE).then((c) => c.put('./index.html', copy));
          return res;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  e.respondWith(caches.match(req).then((hit) => hit || fetch(req)));
});
