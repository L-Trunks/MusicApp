// MusicApp Service Worker
const CACHE_NAME = 'musicapp-v1';
const STREAM_CACHE_NAME = 'musicapp-stream-v1';
const STREAM_CACHE_MAX = 100; // 最多缓存曲数，超出时删除最久未播放
const META_KEY_URL = '/__musicapp_stream_meta__';
const STATIC_ASSETS = [
  '/',
  '/manifest.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME && k !== STREAM_CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

function getMetaRequest() {
  return new Request(self.location.origin + META_KEY_URL);
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // 音视频流：边听边存，LRU 淘汰
  if (url.pathname.startsWith('/api/stream/') && event.request.method === 'GET') {
    const hasRange = event.request.headers.get('Range');
    event.respondWith(
      caches.open(STREAM_CACHE_NAME).then((cache) => {
        const metaReq = getMetaRequest();
        const getMeta = () =>
          cache.match(metaReq).then((r) => (r ? r.json() : Promise.resolve([])));

        if (hasRange) {
          return fetch(event.request);
        }

        return getMeta()
          .then((urlList) => cache.match(event.request).then((cached) => {
            if (cached) {
              const u = event.request.url;
              const next = urlList.filter((x) => x !== u).concat(u);
              return cache.put(metaReq, new Response(JSON.stringify(next))).then(() => cached);
            }
            return null;
          }))
          .then((cached) => {
            if (cached) return cached;
            return fetch(event.request).then((res) => {
              if (!res.ok || (res.status !== 200 && res.status !== 206)) return res;
              const clone = res.clone();
              return getMeta().then((urlList) => {
                urlList.push(event.request.url);
                while (urlList.length > STREAM_CACHE_MAX) {
                  const oldUrl = urlList.shift();
                  if (oldUrl) cache.delete(new Request(oldUrl));
                }
                return cache.put(metaReq, new Response(JSON.stringify(urlList)));
              }).then(() => cache.put(event.request, clone)).then(() => res);
            });
          });
      })
    );
    return;
  }

  // 其他 API 不缓存
  if (url.pathname.startsWith('/api/')) {
    return;
  }

  // 导航请求（页面）：网络优先，离线时返回缓存
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return res;
        })
        .catch(() => caches.match('/'))
    );
    return;
  }

  // 静态资源：缓存优先
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((res) => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return res;
      });
    })
  );
});
