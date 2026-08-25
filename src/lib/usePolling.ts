import { useEffect, useRef } from 'react';

// Gemeinsamer Polling-Mechanismus für alle Stellen, die regelmäßig Daten nachladen.
//
// Hintergrund: Die Datenbank (Neon) wird nutzungsbasiert abgerechnet und legt sich
// nach 5 Minuten ohne Anfrage schlafen. Jeder Poll aus einem vergessenen Browser-Tab
// hält sie wach – und kostet. Deshalb pollt dieser Hook ausschließlich, solange der
// Tab sichtbar ist. Wechselt der Tab in den Hintergrund, stoppt der Takt vollständig;
// kommt er zurück, wird sofort einmal nachgeladen und der Takt neu gestartet.
//
// `fn` muss nicht memoisiert werden – es wird immer die aktuelle Version aufgerufen.

export interface PollingOptions {
  /** false = Polling komplett aus (z. B. wenn gerade kein Spiel live ist). Standard: true */
  enabled?: boolean;
  /** Beim Start (und bei Intervall-Wechsel) sofort einmal ausführen. Standard: true */
  immediate?: boolean;
}

export function usePolling(fn: () => void, intervalMs: number, options: PollingOptions = {}): void {
  const { enabled = true, immediate = true } = options;

  const fnRef = useRef(fn);
  useEffect(() => {
    fnRef.current = fn;
  });

  useEffect(() => {
    if (!enabled) return;

    let timer: ReturnType<typeof setInterval> | null = null;
    const run = () => fnRef.current();
    const start = () => {
      if (timer) return;
      timer = setInterval(run, intervalMs);
    };
    const stop = () => {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        run();
        start();
      } else {
        stop();
      }
    };

    if (immediate) run();
    if (document.visibilityState === 'visible') start();
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [enabled, intervalMs, immediate]);
}
