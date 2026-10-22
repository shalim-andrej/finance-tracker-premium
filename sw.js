const CACHE = 'finance-v4';
const ASSETS = ['./index.html', './script.js', './manifest.json'];

// Устанавливаем Service Worker
self.addEventListener('install', (e) => {
    e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
    self.skipWaiting();
});

// Активируем и чистим старый кэш
self.addEventListener('activate', (e) => {
    e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))));
    self.clients.claim();
});

// Стратегия: Сеть в приоритете, кэш только для GET-запросов
self.addEventListener('fetch', (e) => {
    if (e.request.method !== 'GET') {
        return;
    }
    e.respondWith(
        fetch(e.request).then(res => {
            const clone = res.clone();
            caches.open(CACHE).then(c => c.put(e.request, clone));
            return res;
        }).catch(() => caches.match(e.request))
    );
});