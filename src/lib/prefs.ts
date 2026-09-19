// ===========================================================================
// Kleine, gerätelokale Einstellungen („wo war ich zuletzt?").
//
// Bewusst localStorage und NICHT die Datenbank: das ist eine Bequemlichkeit
// pro Gerät (auf dem Handy will man vielleicht die Wochenansicht, am Rechner
// den Monat) und nichts, was auf den Server gehört. Anders als die URL-Parameter
// (?av=…) überlebt das auch das Schließen der App.
//
// Alle Zugriffe sind abgesichert: im privaten Modus oder bei blockierten
// Website-Daten wirft localStorage – dann gilt einfach der Standardwert.
// ===========================================================================

export function loadPref<T>(key: string, fallback: T, isValid?: (v: unknown) => boolean): T {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw == null) return fallback;
    const val = JSON.parse(raw) as unknown;
    if (isValid && !isValid(val)) return fallback;
    return val as T;
  } catch {
    return fallback;
  }
}

export function savePref(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* Speicher voll oder gesperrt – die Auswahl gilt dann nur für diese Sitzung. */
  }
}
