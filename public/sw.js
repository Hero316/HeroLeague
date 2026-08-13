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
const CACHE = 'hl-static-v8';

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
  // WICHTIG: NUR erfolgreiche (200, same-origin) Antworten cachen. Sonst würde
  // eine 404/Fehlerseite – z. B. wenn während eines Deploys ein JS-Chunk kurz
  // fehlt – dauerhaft gecacht und die Seite bliebe leer hängen.
  if (isStaticAsset(url)) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((res) => {
            if (res && res.ok && res.status === 200 && res.type === 'basic') {
              const copy = res.clone();
              caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => undefined);
            }
            return res;
          }),
      ),
    );
    return;
  }

  // HTML/Navigationen: network-first, damit online immer die aktuelle Seite kommt.
  // Ebenfalls nur erfolgreiche Antworten als Offline-Fallback ablegen.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put('/index.html', copy)).catch(() => undefined);
          }
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

  // Ziel-Chat aus der URL (?c=…) herauslesen – nur bei Chat-Pushs gesetzt.
  let convId = null;
  try {
    convId = new URL(url, self.location.origin).searchParams.get('c');
  } catch (e) {
    convId = null;
  }

  event.waitUntil(
    (async () => {
      // „Bin ich eh schon drin?" – Wenn genau dieser Chat gerade sichtbar offen
      // ist (gleiches Gerät, App im Vordergrund), KEINE Push-Benachrichtigung
      // zeigen (wie WhatsApp). Erkennung über die offene Unterhaltung in der URL
      // (?c=…), die der Chat live mitführt. Nur relevant für Chat-Pushs.
      if (convId) {
        try {
          const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
          const openHere = wins.some((c) => {
            if (c.visibilityState !== 'visible') return false;
            try {
              return new URL(c.url).searchParams.get('c') === convId;
            } catch (e) {
              return false;
            }
          });
          if (openHere) return; // still: kein Banner, Badge unverändert lassen
        } catch (e) {
          /* im Zweifel Benachrichtigung zeigen */
        }
      }

      await self.registration.showNotification(title, {
        body,
        icon: '/assets/icon-192.png',
        badge: '/assets/icon-192.png',
        tag: 'hl-chat',
        renotify: true,
        data: { url },
      });

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
    })(),
  );
});

// Klick auf die Benachrichtigung: im PASSENDEN Fenster öffnen. Da fast alle
// Benachrichtigungen jetzt in die Team-App (/chat) führen, bevorzugen wir ein
// bereits offenes Team-App-Fenster und schicken es per Deep-Link ans Ziel –
// sonst neu öffnen (Android öffnet /chat automatisch in der installierten
// Team-App, weil deren Scope /chat ist). So landet man nicht mal in der App,
// mal auf der Website.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/chat';
  let wantsChat = true;
  try {
    wantsChat = new URL(url, self.location.origin).pathname.startsWith('/chat');
  } catch (e) {
    wantsChat = true;
  }
  event.waitUntil(
    (async () => {
      const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      // Fenster im passenden Bereich bevorzugen (Team-App für /chat-Ziele).
      let target = null;
      for (const client of list) {
        let path = '/';
        try {
          path = new URL(client.url).pathname;
        } catch (e) {
          /* ignorieren */
        }
        const inScope = wantsChat ? path.startsWith('/chat') : !path.startsWith('/chat');
        if (inScope) {
          target = client;
          break;
        }
      }
      if (!target && list.length) target = list[0];
      if (target) {
        if ('navigate' in target) {
          try {
            const c = await target.navigate(url);
            return c && c.focus ? c.focus() : target.focus && target.focus();
          } catch (e) {
            return target.focus && target.focus();
          }
        }
        return target.focus && target.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
      return undefined;
    })(),
  );
});
