/*
 * Service Worker der Hero League.
 *
 * Zweck: Er macht die Seite auf Android/Chrome zuverlässig installierbar
 * (Chrome verlangt einen aktiven fetch-Handler) und gibt der installierten
 * App einen Offline-Notfall-Fallback.
 *
 * WICHTIG – Live-Daten dürfen NIE veralten:
 *  - Anfragen an /api/* und alle Nicht-GET-Requests werden gar nicht angefasst
 *    (gehen direkt ans Netz) → Ergebnisse, Tabelle und Statistiken sind immer frisch.
 *  - HTML/Navigationen laufen "network-first" (Cache nur als Offline-Fallback).
 *  - Nur statische, per Hash unveränderliche Assets werden dauerhaft gecacht.
 */

// Version bei Bedarf erhöhen: beim Aktivieren löscht der SW alle Caches mit
// abweichendem Namen → ein hängengebliebener/kaputter Asset-Cache (z. B. schwarze
// Seite nach einem Deploy) wird beim nächsten Laden automatisch bereinigt.
const CACHE = 'hl-static-v5';

// App-Shell für den Offline-Fallback. Bewusst minimal.
const SHELL = ['/', '/index.html', '/manifest.webmanifest', '/assets/icon-192.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .catch(() => undefined),
  );
  // Neue Version sofort übernehmen.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Ist diese GET-Anfrage ein unveränderliches, statisches Asset?
function isStaticAsset(url) {
  return (
    url.origin === self.location.origin &&
    (url.pathname.startsWith('/assets/') ||
      url.pathname.startsWith('/fonts/') ||
      url.pathname === '/favicon.ico' ||
      url.pathname === '/manifest.webmanifest')
  );
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Nur GET behandeln; Schreibzugriffe (POST/PUT/DELETE) unangetastet lassen.
  if (request.method !== 'GET') return;

  // Live-Daten: API niemals cachen oder verzögern.
  if (url.origin === self.location.origin && url.pathname.startsWith('/api/')) return;

  // Statische Assets: cache-first (Dateinamen sind durch Hashing eindeutig).
  if (isStaticAsset(url)) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((res) => {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => undefined);
            return res;
          }),
      ),
    );
    return;
  }

  // HTML/Navigationen: network-first, damit online immer die aktuelle Seite kommt.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put('/index.html', copy)).catch(() => undefined);
          return res;
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match('/index.html'))),
    );
    return;
  }

  // Alles andere: normal ans Netz.
});

// --- Web-Push: eingehende Push-Nachricht anzeigen ---------------------------
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = {};
  }
  const title = data.title || 'Hero League';
  const body = data.body || '';
  const url = data.url || '/admin';
  event.waitUntil(
    self.registration
      .showNotification(title, {
        body,
        icon: '/assets/icon-192.png',
        badge: '/assets/icon-192.png',
        tag: 'hl-chat',
        renotify: true,
        data: { url },
      })
      .then(() => {
        // Zahl am App-Icon setzen (iOS 16.4+/Android, installierte PWA).
        try {
          if (self.navigator && self.navigator.setAppBadge) {
            if (typeof data.badge === 'number' && data.badge > 0) self.navigator.setAppBadge(data.badge);
            else if (self.navigator.clearAppBadge) self.navigator.clearAppBadge();
            else self.navigator.setAppBadge();
          }
        } catch (e) {
          /* ignoriert */
        }
      }),
  );
});

// Klick auf die Benachrichtigung: vorhandenes Fenster fokussieren oder öffnen.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/admin';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if (client.url.includes('/admin') && 'focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
      return undefined;
    }),
  );
});
