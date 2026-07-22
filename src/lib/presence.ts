// Anonymer Besucher-Heartbeat für die Live-Anzeige im Backoffice.
// Erzeugt einmalig eine zufällige Besucher-ID (kein Personenbezug) und meldet
// solange der Tab sichtbar ist regelmäßig „ich bin noch da" ans Backend.

const STORAGE_KEY = 'hl_vid';
const HEARTBEAT_MS = 45_000;

function getVisitorId(): string {
  try {
    let id = localStorage.getItem(STORAGE_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(STORAGE_KEY, id);
    }
    return id;
  } catch {
    // Privater Modus o.Ä.: flüchtige ID pro Seitenaufruf
    return crypto.randomUUID();
  }
}

function ping(vid: string): void {
  // Bewusst „fire and forget": Fehler dürfen die Seite nie stören.
  fetch('/api/seasons', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'ping', vid }),
    keepalive: true,
  }).catch(() => {});
}

// Startet die Präsenzmeldung. Gibt eine Aufräumfunktion zurück.
export function startPresence(): () => void {
  const vid = getVisitorId();
  let timer: ReturnType<typeof setInterval> | null = null;

  const beat = () => {
    if (document.visibilityState === 'visible') ping(vid);
  };

  const start = () => {
    if (timer) return;
    beat();
    timer = setInterval(beat, HEARTBEAT_MS);
  };
  const stop = () => {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  };

  // Im Hintergrund pausieren, beim Zurückkehren sofort wieder melden.
  const onVisibility = () => (document.visibilityState === 'visible' ? start() : stop());

  start();
  document.addEventListener('visibilitychange', onVisibility);

  return () => {
    stop();
    document.removeEventListener('visibilitychange', onVisibility);
  };
}
