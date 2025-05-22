const CACHE_NAME = 'finanse-pwa-cache-v2';
const urlsToCache = [
    '/',
    '/index.html',
    '/script.js',
    'https://cdn.tailwindcss.com',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/webfonts/fa-solid-900.woff2',
    'https://cdn.jsdelivr.net/npm/chart.js',
    './favicon.png',
];

self.addEventListener('install', event => {
    console.log('Service Worker: Instalacja');
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('Service Worker: Buforowanie zasobów aplikacji');
                const requests = urlsToCache.map(url => {
                    if (url.startsWith('http')) {
                        return new Request(url, { mode: 'cors' });
                    }
                    return url;
                });
                return cache.addAll(requests)
                    .catch(err => {
                        console.warn('Service Worker: Nie udało się zbuforować niektórych zasobów (tryb cors), próba z no-cors dla CDN');
                        const cdnRequestsNoCors = urlsToCache.map(url => {
                            if (url.startsWith('http')) return new Request(url, {mode: 'no-cors'});
                            return url;
                        });
                        return cache.addAll(cdnRequestsNoCors);
                    });
            })
            .catch(err => {
                console.error('Service Worker: Błąd podczas buforowania', err);
            })
    );
});

self.addEventListener('activate', event => {
    console.log('Service Worker: Aktywacja');
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cache => {
                    if (cache !== CACHE_NAME) {
                        console.log('Service Worker: Usuwanie starego cache', cache);
                        return caches.delete(cache);
                    }
                })
            );
        })
    );
    return self.clients.claim();
});

self.addEventListener('fetch', event => {
    if (event.request.method !== 'GET' || event.request.url.startsWith('chrome-extension://')) {
        return;
    }

    event.respondWith(
        caches.match(event.request)
            .then(response => {
                if (response) {
                    return response;
                }
                return fetch(event.request).then(
                    networkResponse => {
                        if (!networkResponse || networkResponse.status !== 200 || (networkResponse.type !== 'basic' && networkResponse.type !== 'cors' && networkResponse.type !== 'opaque')) {
                            return networkResponse;
                        }
                        const responseToCache = networkResponse.clone();
                        caches.open(CACHE_NAME)
                            .then(cache => {
                                cache.put(event.request, responseToCache);
                            });
                        return networkResponse;
                    }
                ).catch(error => {
                    console.error('Service Worker: Błąd pobierania z sieci:', event.request.url, error);
                });
            })
    );
});

self.addEventListener('push', event => {
    console.log('Service Worker: Otrzymano powiadomienie push');
    const data = event.data ? event.data.json() : { title: 'Nowe Powiadomienie!', body: 'Sprawdź co nowego w aplikacji.', icon: '/favicon.png' };
    event.waitUntil(
        self.registration.showNotification(data.title, {
            body: data.body,
            icon: data.icon,
            badge: '/icons/icon-72x72.png'
        })
    );
});

self.addEventListener('notificationclick', event => {
    console.log('Service Worker: Kliknięto powiadomienie');
    event.notification.close();
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
            for (let i = 0; i < clientList.length; i++) {
                let client = clientList[i];
                if (client.url === self.registration.scope && 'focus' in client) {
                    return client.focus();
                }
            }
            if (clients.openWindow) {
                return clients.openWindow(self.registration.scope);
            }
        })
    );
});