/*
 * Service Worker der Hero League – bewusst OHNE eigenes Caching.
 *
 * Hintergrund: Ein früherer Cache-Handler konnte nach einem Deploy eine
 * veraltete oder vermischte App-Hülle ausliefern -> schwarze/leere Seite.
 * Um das dauerhaft auszuschließen, cacht dieser SW NICHTS mehr: Navigationen
 * und Assets laufen immer direkt ans Netz (die Seite ist ohnehin online-first).
 * Beim Aktivieren werden ALLE alten Caches gelöscht -> ein hängengebliebenes
 * Gerät heilt sich beim nächsten Laden von selbst. Web-Push bleibt voll erhalten.
 */

self.addEventListener('install', () => {
  // Neue Version sofort übernehmen (nicht auf alte Clients warten).
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // ALLE alten Caches restlos entfernen – heilt kaputt gecachte Zustände
      // (z. B. die schwarze Seite nach einem Deploy) beim nächsten Laden.
      try {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      } catch (e) {
        /* ignorieren */
      }
      await self.clients.claim();
    })(),
  );
});

// Bewusst KEIN Caching. Nur Navigationen als reiner Netz-Durchgriff, damit die
// App installierbar bleibt und IMMER die aktuelle Seite frisch lädt.
self.addEventListener('fetch', (event) => {
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request));
  }
});

// Base64url (VAPID public key) -> Uint8Array für pushManager.subscribe.
function urlB64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

// --- Web-Push: Abo-Wechsel durch den Browser auffangen ----------------------
// Browser tauschen ein Push-Abo gelegentlich von selbst aus (Rotation/Ablauf).
// Passiert das, während die App zu ist, würden ohne diesen Handler ab da keine
// Push-Nachrichten mehr ankommen. Wir legen sofort ein neues Abo an und melden
// es am Server an (Session-Cookie wird mitgeschickt). Best-effort.
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    (async () => {
      try {
        const res = await fetch('/api/push?resource=key', { credentials: 'include' });
        if (!res.ok) return;
        const { key } = await res.json();
        if (!key) return;
        const sub = await self.registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlB64ToUint8Array(key),
        });
        await fetch('/api/push', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subscription: sub.toJSON() }),
        });
      } catch (e) {
        /* nichts zu tun – beim nächsten App-Start heilt syncPush nach */
      }
    })(),
  );
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
  const url = data.url || '/chat';

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
        // Großes Symbol in der Benachrichtigung: Team-App-Logo.
        icon: '/assets/chat-icon-192.png',
        // Kleines Statusleisten-Symbol: MUSS einfarbig/transparent sein, sonst
        // zeigt Android ein weißes Viereck. Eigene Sprechblasen-Silhouette.
        badge: '/assets/badge-96.png',
        // Pro Ziel (Chat/Idee/Aufgabe) eine eigene Benachrichtigung; eine neue
        // Nachricht im selben Ziel aktualisiert die bestehende, statt alles zu
        // überschreiben.
        tag: url,
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
