// App-Icon-Zahl (Badge) am Handy synchron halten – wie bei WhatsApp.
// Zwei Quellen zählen zusammen: ungelesene Chat-Nachrichten + ungelesene
// Benachrichtigungen. Jede Quelle meldet ihren Stand; wir setzen die Summe.
// So verschwindet die Zahl automatisch, sobald alles gelesen ist (nicht erst
// beim nächsten Push). Fehlertolerant – tut nichts, wo die API fehlt (Desktop).

let chatUnread = 0;
let notifUnread = 0;

function apply(): void {
  try {
    const nav = navigator as Navigator & {
      setAppBadge?: (n?: number) => Promise<void>;
      clearAppBadge?: () => Promise<void>;
    };
    if (!nav.setAppBadge) return;
    const total = chatUnread + notifUnread;
    if (total > 0) void nav.setAppBadge(total);
    else if (nav.clearAppBadge) void nav.clearAppBadge();
    else void nav.setAppBadge(0);
  } catch {
    /* ignoriert */
  }
}

export function setChatUnread(n: number): void {
  chatUnread = Number.isFinite(n) ? Math.max(0, n) : 0;
  apply();
}

export function setNotifUnread(n: number): void {
  notifUnread = Number.isFinite(n) ? Math.max(0, n) : 0;
  apply();
}
