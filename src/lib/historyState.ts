import { useCallback, useRef, useState } from 'react';

// ---------------------------------------------------------------------------
// „Zurück" landet wieder genau dort, wo man war.
//
// Jede Seite (= Browser-History-Eintrag) bekommt einen eigenen Schlüssel in
// history.state. Darunter merkt sich eine Seite ihre Ansicht (gewählter
// Spieltag, Kategorie …) in sessionStorage:
//  • neuer Klick auf eine Seite  → neuer Eintrag → Standard-Ansicht
//  • „Zurück" (Knopf oder Geste) → alter Eintrag → die Ansicht von vorher
// Die Scroll-Position merkt sich App.tsx beim Verlassen einer Seite im Eintrag
// (rememberScroll) und stellt sie nach „Zurück" wieder her (restoreScroll).
// ---------------------------------------------------------------------------

type EntryState = Record<string, unknown> & { __hlKey?: string; __hlScroll?: number };

function entryState(): EntryState {
  try {
    const s: unknown = window.history.state;
    return s && typeof s === 'object' ? (s as EntryState) : {};
  } catch {
    return {};
  }
}

// Schlüssel des aktuellen History-Eintrags (wird beim ersten Bedarf angelegt).
export function historyEntryKey(): string {
  const s = entryState();
  if (typeof s.__hlKey === 'string' && s.__hlKey) return s.__hlKey;
  const key = Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  try {
    window.history.replaceState({ ...s, __hlKey: key }, '');
  } catch {
    /* ohne Schlüssel gibt es eben kein Merken */
  }
  return key;
}

const PREFIX = 'hl:view:';

function readValue<T>(key: string): T | undefined {
  try {
    const raw = sessionStorage.getItem(PREFIX + key);
    return raw == null ? undefined : (JSON.parse(raw) as T);
  } catch {
    return undefined;
  }
}

function writeValue(key: string, value: unknown): void {
  try {
    sessionStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    /* Speicher voll/gesperrt – dann ohne Merken */
  }
}

// Wie useState – aber der Wert gehört zur aktuellen Seite in der History:
// Nach „Zurück" (oder Neuladen) ist er wieder da, ein neuer Seitenaufruf
// startet mit `initial`. `id` muss auf der Seite eindeutig sein.
export function useHistoryState<T>(id: string, initial: T): [T, (next: T | ((prev: T) => T)) => void] {
  const keyRef = useRef<string | null>(null);
  if (keyRef.current === null) keyRef.current = `${historyEntryKey()}:${id}`;
  const [value, setValue] = useState<T>(() => {
    const stored = readValue<T>(keyRef.current!);
    return stored === undefined ? initial : stored;
  });
  const set = useCallback((next: T | ((prev: T) => T)) => {
    setValue((prev) => {
      const v = typeof next === 'function' ? (next as (p: T) => T)(prev) : next;
      writeValue(keyRef.current!, v);
      return v;
    });
  }, []);
  return [value, set];
}

// Scroll-Position der aktuellen Seite im History-Eintrag merken – direkt bevor
// eine neue Seite geöffnet wird.
export function rememberScroll(): void {
  try {
    window.history.replaceState({ ...entryState(), __hlScroll: Math.round(window.scrollY) }, '');
  } catch {
    /* ignore */
  }
}

// Gemerkte Scroll-Position des aktuellen Eintrags (null = keine / ganz oben).
export function savedScroll(): number | null {
  const y = entryState().__hlScroll;
  return typeof y === 'number' && y > 0 ? y : null;
}

// Nach „Zurück" dorthin scrollen, wo man war. Die Seite baut sich erst auf
// (Daten, Bilder, nachgeladene Teile) – deshalb kurz nachfassen, bis die
// Position erreicht ist und steht. Scrollt/tippt der Nutzer selbst, sofort aufhören.
export function restoreScroll(y: number, maxMs = 2500): void {
  const events = ['wheel', 'touchstart', 'keydown', 'mousedown'] as const;
  let done = false;
  const stop = () => {
    done = true;
    events.forEach((e) => window.removeEventListener(e, stop));
  };
  events.forEach((e) => window.addEventListener(e, stop, { passive: true }));
  const start = performance.now();
  let steady = 0;
  const tick = () => {
    if (done) return;
    if (Math.abs(window.scrollY - y) > 1) {
      window.scrollTo(0, y);
      steady = 0;
    } else {
      steady += 1;
    }
    if (steady >= 10 || performance.now() - start > maxMs) return stop();
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
