import React from 'react';

// Seiten/Bereiche erst bei Bedarf laden (Admin, Team-App, Tracking, Sonderseiten),
// damit normale Besucher nur den Code der Website laden.
// Nach einem Update fehlen die alten Dateien auf dem Server: Dann EINMAL frisch
// laden (Merker in sessionStorage, wird beim erfolgreichen Start in main.tsx gelöscht).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function lazyPage<T extends React.ComponentType<any>>(factory: () => Promise<{ default: T }>) {
  return React.lazy(() =>
    factory().catch((err) => {
      try {
        if (!sessionStorage.getItem('hl-chunk-reload')) {
          sessionStorage.setItem('hl-chunk-reload', '1');
          window.location.reload();
          return new Promise<{ default: T }>(() => {});
        }
      } catch {
        /* sessionStorage gesperrt → normal weiter */
      }
      throw err;
    }),
  );
}
