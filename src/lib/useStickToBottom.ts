import { useCallback, useEffect, useLayoutEffect, useRef, type DependencyList, type RefObject } from 'react';

// ===========================================================================
// „Immer bei den neuesten Nachrichten landen."
//
// Ein Verlauf (Chat, Thread, Ticket-, Aufgaben-, Ideen-Verlauf) soll sich wie
// WhatsApp verhalten:
//   • beim Öffnen sofort ganz unten stehen – und zwar VOR dem ersten Zeichnen,
//     damit es nicht erst oben aufblitzt und dann springt (useLayoutEffect),
//   • bei neuen Beiträgen mitziehen, solange man ohnehin unten steht,
//   • aber NICHT nach unten reißen, wenn man gerade weiter oben etwas liest,
//   • und nach dem Nachladen von Bildern/Videos (die den Verlauf höher machen)
//     nochmal nachziehen, sonst hängt man knapp über dem Ende fest.
//
// Rückgabewert: pin() – erzwingt das Ende, z.B. direkt nach dem Absenden einer
// eigenen Nachricht (da will man IMMER unten landen, egal wo man vorher war).
// ===========================================================================

export function useStickToBottom(
  ref: RefObject<HTMLElement | null>,
  deps: DependencyList,
  opts: { ready?: boolean; resetKey?: unknown } = {}
): () => void {
  const { ready = true, resetKey } = opts;
  const nearBottom = useRef(true);
  const started = useRef(false);

  // Wechsel auf einen anderen Chat/ein anderes Ticket ⇒ wieder von vorn.
  useEffect(() => {
    started.current = false;
    nearBottom.current = true;
  }, [resetKey]);

  const pin = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    // Nur DIESEN Container scrollen (scrollTop), nie via scrollIntoView – sonst
    // würde im Backoffice die ganze Seite mitwandern.
    el.scrollTop = el.scrollHeight;
    nearBottom.current = true;
  }, [ref]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onScroll = () => {
      nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    };
    // Bilder/Videos melden sich erst nach dem Laden mit ihrer echten Höhe.
    const onLoad = () => {
      if (nearBottom.current) pin();
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    el.addEventListener('load', onLoad, true); // capture: load blubbert nicht
    return () => {
      el.removeEventListener('scroll', onScroll);
      el.removeEventListener('load', onLoad, true);
    };
  }, [ref, pin]);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !ready) return;
    if (!started.current) {
      el.scrollTop = el.scrollHeight;
      nearBottom.current = true;
      started.current = true;
      return;
    }
    if (nearBottom.current) el.scrollTop = el.scrollHeight;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return pin;
}
