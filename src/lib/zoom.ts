// „Zoom aus dem Button": Ein Pop-up soll optisch aus der angetippten Karte
// herauswachsen und beim Schließen bouncy wieder dorthin zurückschnappen.
// Dazu merken wir uns beim Klick die Position der Karte (Versatz zur Bildschirm-
// mitte) und starten/enden das Modal an genau dieser Stelle (klein), animiert zur
// Mitte (groß). Fällt sauber auf „aus der Mitte" zurück, wenn keine Position da ist.
import type { MouseEvent } from 'react';

export type ZoomOrigin = { x: number; y: number };
export const ZERO_ORIGIN: ZoomOrigin = { x: 0, y: 0 };

export function zoomOriginFromEvent(e: MouseEvent): ZoomOrigin {
  try {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    return { x: cx - window.innerWidth / 2, y: cy - window.innerHeight / 2 };
  } catch {
    return ZERO_ORIGIN;
  }
}

export const zoomSpring = { type: 'spring' as const, stiffness: 460, damping: 30, mass: 0.9 };

// Motion-Props für die Modal-Karte: startet klein an der Button-Position,
// federt zur Mitte auf; beim Schließen zurück in den Button.
export function zoomModalProps(o: ZoomOrigin) {
  return {
    initial: { opacity: 0, scale: 0.2, x: o.x, y: o.y },
    animate: { opacity: 1, scale: 1, x: 0, y: 0 },
    exit: { opacity: 0, scale: 0.2, x: o.x, y: o.y },
    transition: zoomSpring,
  };
}
