import { useEffect, useRef } from 'react';

// ---------------------------------------------------------------------------
// Handy-Zurück-Geste / Zurück-Taste INNERHALB der App abfangen.
//
// Problem: Öffnet man einen Chat, einen Thread oder ein Fenster, ändert die App
// nur ihren Zustand – es entsteht KEIN Browser-History-Eintrag. Wischt/drückt
// man dann am Handy „zurück" (iOS-Kantenwisch, Android-Zurück), verlässt man die
// ganze App, statt nur eine Ebene zurückzugehen.
//
// Lösung: Jede geöffnete Ebene legt EINEN History-Eintrag an (pushState) und
// registriert eine Schließen-Funktion in einem LIFO-Stapel. Ein einziger
// globaler popstate-Listener schließt bei „zurück" genau die oberste Ebene.
// Die sichtbaren Knöpfe (Zurück-Pfeil, X, Hintergrund-Klick) rufen einfach
// `goBackLayer()` auf – damit funktionieren Geste und Knopf exakt gleich.
//
// Wird eine Ebene ohne „zurück" geschlossen (z. B. weil die Komponente
// verschwindet), räumen wir den zusätzlichen History-Eintrag selbst wieder ab.
// ---------------------------------------------------------------------------

type Layer = { close: () => void };

const stack: Layer[] = [];
let installed = false;
// Nach einem programmatischen `history.back()` (Aufräumen) soll der dadurch
// ausgelöste popstate KEINE darunterliegende Ebene schließen.
let ignoreNextPop = false;

function install() {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  window.addEventListener('popstate', () => {
    if (ignoreNextPop) {
      ignoreNextPop = false;
      return;
    }
    const top = stack.pop();
    if (top) top.close();
    // Leerer Stapel ⇒ normales „zurück" (App/Website verlassen) – nichts tun.
  });
}

// Öffnet eine Ebene: History-Eintrag anlegen + Schließen-Funktion registrieren.
// Gibt eine Aufräumfunktion zurück, falls die Ebene ohne „zurück" verschwindet.
let layerSeq = 0;
function registerLayer(close: () => void): () => void {
  install();
  const layer: Layer = { close };
  const id = ++layerSeq;
  window.history.pushState({ __hlLayer: true, __hlId: id }, '');
  stack.push(layer);
  return () => {
    const idx = stack.indexOf(layer);
    if (idx === -1) return; // bereits per „zurück" entfernt – nichts zu tun
    stack.splice(idx, 1);
    // Unseren Extra-Eintrag nur „aufbrauchen", wenn wir NOCH auf ihm stehen.
    // Wurde inzwischen VORWÄRTS navigiert (neue Seite/URL via pushState), liegt
    // unser Eintrag in der Historie hinter der aktuellen Seite – dann NICHT
    // zurückgehen, sonst springt man fälschlich auf die vorherige Seite zurück
    // (z. B. Klick auf eine Note → Spielbericht, statt auf der Teamseite zu landen).
    const st = window.history.state as { __hlId?: number } | null;
    if (!st || st.__hlId !== id) return;
    ignoreNextPop = true;
    window.history.back();
  };
}

// Hook: solange `active` true ist, fängt die Zurück-Geste diese Ebene ab und
// ruft stattdessen `onClose` auf (statt die App zu verlassen). `onClose` ist die
// EINZIGE Stelle, die den Zustand auf „geschlossen" setzt.
export function useBackClose(active: boolean, onClose: () => void) {
  const cb = useRef(onClose);
  cb.current = onClose;
  useEffect(() => {
    if (!active) return;
    return registerLayer(() => cb.current());
  }, [active]);
}

// Eine Ebene „von Hand" schließen (Zurück-Pfeil, X, Hintergrund-Klick):
// einfach eine Ebene zurücknavigieren – der Stapel erledigt den Rest.
export function goBackLayer() {
  if (typeof window !== 'undefined') window.history.back();
}
