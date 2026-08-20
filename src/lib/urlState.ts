// Kleiner Helfer, um einzelne URL-Query-Parameter zu lesen/setzen, OHNE die
// anderen Parameter zu verlieren. Damit „bleibt" die App nach dem Aktualisieren
// dort, wo man war (Aufgaben-Ansicht, offener Chat/Thread, offenes Ticket …).
// Nutzt replaceState → kein neuer History-Eintrag, keine Navigation.

export function getUrlParam(key: string): string | null {
  try {
    return new URLSearchParams(window.location.search).get(key);
  } catch {
    return null;
  }
}

export function setUrlParam(key: string, value: string | null | undefined): void {
  try {
    const url = new URL(window.location.href);
    if (value == null || value === '') url.searchParams.delete(key);
    else url.searchParams.set(key, value);
    window.history.replaceState(null, '', url.pathname + url.search + url.hash);
  } catch {
    /* ignore */
  }
}
