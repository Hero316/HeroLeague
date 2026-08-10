import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useSpring, useMotionValueEvent, useReducedMotion } from 'motion/react';
import { ChevronLeft, ChevronRight, Play } from 'lucide-react';
import type { HighlightMedia } from '../types';
import { toEmbed, youtubeThumb } from '../lib/videoEmbed';

// 3D-Coverflow-Karussell (wie ein drehbarer Kreis): der aktive Beitrag steht
// groß im Fokus, links und rechts weichen die Nachbarn perspektivisch nach
// hinten. Endlos: nach links ODER rechts wischen dreht den Ring unendlich weiter
// (die Beiträge kommen von hinten wieder nach vorne). Wischen, Pfeile oder
// Punkte; weiche Feder-Animation. Klick auf den aktiven Beitrag öffnet die
// Lightbox, Klick auf einen Nachbarn rückt ihn in den Fokus.
const mod = (a: number, n: number) => ((a % n) + n) % n;

export default function HighlightsCarousel({
  items,
  onOpen,
}: {
  items: HighlightMedia[];
  onOpen: (index: number) => void;
}) {
  const reduce = useReducedMotion();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const set = () => setW(el.clientWidth);
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const n = items.length;

  // Ziel-Index (unbeschränkt – erlaubt die Endlos-Schleife in beide Richtungen)
  // und die weich hinterherfedernde Ist-Position. Aus der Feder-Position werden
  // pro Frame die 3D-Transformationen aller sichtbaren Kacheln berechnet.
  // Start leicht „vor-gedreht": beim ersten Sichtbarwerden dreht der Ring kurz
  // durch und rastet smooth beim neuesten Beitrag (Index 0) ein.
  const spinStart = reduce || n < 2 ? 0 : Math.min(3.4, n - 0.5);
  const [activeInt, setActiveInt] = useState(0);
  const pos = useSpring(spinStart, reduce ? { duration: 0 } : { stiffness: 150, damping: 26, mass: 1 });
  const [posV, setPosV] = useState(spinStart);
  useMotionValueEvent(pos, 'change', (v) => setPosV(v));

  // Einflug-Animation: sobald das Karussell in den sichtbaren Bereich scrollt,
  // aus der vor-gedrehten Position weich auf den neuesten Beitrag einrasten.
  const entered = useRef(false);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el || spinStart === 0) {
      entered.current = true;
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (!entered.current && entries.some((e) => e.isIntersecting)) {
          entered.current = true;
          pos.set(0);
          io.disconnect();
        }
      },
      { threshold: 0.3 }
    );
    io.observe(el);
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Maße: aktive Kachel groß, Nachbarn überlappen leicht. Auf dem Handy breiter.
  const slideW = w === 0 ? 0 : w < 640 ? w * 0.8 : Math.min(w * 0.56, 720);
  const cardH = slideW * (9 / 16);
  const spacing = slideW * (w < 640 ? 0.58 : 0.5); // horizontaler Abstand je Ring-Schritt
  // Sichtbare Tiefe (wie viele Nachbarn je Seite). Bei wenigen Beiträgen kleiner,
  // damit der „Umschlagpunkt“ hinten im Ring nicht sichtbar wird.
  const depth = Math.min(3, Math.floor((n - 1) / 2)) || 1;

  const goTo = (target: number) => {
    entered.current = true; // eine Nutzer-Aktion beendet den Einflug
    setActiveInt(target);
    if (reduce) pos.jump(target);
    else pos.set(target);
  };
  const go = (delta: number) => goTo(activeInt + delta);
  // Kürzesten Weg auf dem Ring zu einem konkreten Beitrag nehmen.
  const goToItem = (i: number) => {
    if (n < 2) return;
    const base = mod(activeInt, n);
    let delta = i - base;
    if (delta > n / 2) delta -= n;
    if (delta < -n / 2) delta += n;
    goTo(activeInt + delta);
  };

  // Wischen: die Position folgt live dem Finger, beim Loslassen rastet der
  // nächste Beitrag ein – aus Wisch-Strecke UND Schwung. Ein kräftiger Flick
  // überspringt ein bis zwei Beiträge (wie zuvor), ein sanfter genau einen.
  const drag = useRef<{ startX: number; startActive: number; moved: boolean; lastX: number; lastT: number; vx: number } | null>(null);
  const didPan = useRef(false);
  const onPointerDown = (e: React.PointerEvent) => {
    if (n < 2) return;
    entered.current = true;
    drag.current = { startX: e.clientX, startActive: activeInt, moved: false, lastX: e.clientX, lastT: performance.now(), vx: 0 };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || !spacing) return;
    const now = performance.now();
    const dt = now - d.lastT;
    if (dt > 0) d.vx = ((e.clientX - d.lastX) / dt) * 1000; // px/s (für den Schwung)
    d.lastX = e.clientX;
    d.lastT = now;
    const dx = e.clientX - d.startX;
    if (Math.abs(dx) > 5) {
      d.moved = true;
      try {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      } catch {
        /* egal */
      }
    }
    pos.jump(d.startActive - dx / spacing);
  };
  const endDrag = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || !spacing) return;
    drag.current = null;
    const dx = e.clientX - d.startX;
    // Projizierte Strecke = zurückgelegt + Schwung. Ein Schritt entspricht knapp
    // einer Kachelbreite; Ergebnis auf max. ±3 begrenzt (also 1–2 übersprungen).
    const stridePx = slideW * 0.62 || 1;
    const projectedPx = dx + d.vx * 0.13;
    const steps = Math.max(-3, Math.min(3, -Math.round(projectedPx / stridePx)));
    if (d.moved) {
      didPan.current = true;
      setTimeout(() => (didPan.current = false), 60); // den Folge-Klick schlucken
    }
    goTo(d.startActive + steps);
  };

  const activeItem = n > 0 ? mod(activeInt, n) : 0;

  return (
    <div className="relative">
      <div
        ref={wrapRef}
        className="relative overflow-hidden select-none touch-pan-y"
        style={{ height: cardH || undefined }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onPointerLeave={(e) => drag.current && endDrag(e)}
      >
        {/* Perspektive auf einem eigenen Element OHNE overflow – sonst „flacht"
            iOS/Safari die 3D-Szene ab (overflow:hidden + 3D auf demselben Element). */}
        <div className="absolute inset-0" style={{ perspective: 1600, WebkitPerspective: 1600 }}>
          {w > 0 &&
            items.map((media, i) => {
              // Vorzeichenbehafteter kürzester Abstand zur Ist-Position auf dem
              // Ring: 0 = im Fokus, ± = rechts/links. Wandert eine Kachel über den
              // hinteren Umschlagpunkt, „teleportiert“ sie unsichtbar (weit hinten).
              const rel = mod(i - posV + n / 2, n) - n / 2;
              const abs = Math.abs(rel);
              if (abs > depth + 0.55) return null;

              const translateX = rel * spacing;
              const translateZ = -abs * 165;
              const rotateY = Math.max(-55, Math.min(55, -rel * 40));
              const scale = Math.max(0.6, 1 - abs * 0.13);
              const opacity = abs > depth ? 0 : Math.max(0.22, 1 - abs * 0.32);
              const isActive = abs < 0.5;

              const isVideo = media.type === 'video';
              const embed = isVideo ? toEmbed(media.url) : null;
              const thumb = embed?.youtubeId ? youtubeThumb(embed.youtubeId) : null;

              return (
                <div
                  key={media.id}
                  className="absolute left-1/2 top-1/2"
                  style={{
                    width: slideW,
                    height: cardH,
                    transform: `translate(-50%, -50%) translateX(${translateX}px) translateZ(${translateZ}px) rotateY(${rotateY}deg) scale(${scale})`,
                    zIndex: 100 - Math.round(abs * 10),
                    opacity,
                    pointerEvents: opacity < 0.12 ? 'none' : 'auto',
                    willChange: 'transform',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => {
                      if (didPan.current) return; // gerade gewischt -> kein Klick
                      if (isActive) onOpen(i);
                      else goToItem(i);
                    }}
                    className="group relative block w-full h-full overflow-hidden rounded-2xl border border-white/[.08] bg-brand-dark shadow-2xl cursor-pointer"
                    aria-label={isActive ? (isVideo ? 'Video abspielen' : 'Bild ansehen') : 'Beitrag in den Fokus rücken'}
                    tabIndex={abs > depth ? -1 : 0}
                  >
                    {isVideo && !thumb ? (
                      <div className="absolute inset-0 bg-[linear-gradient(140deg,#0d1a19,#06100f)]" />
                    ) : isVideo ? (
                      <img
                        src={thumb as string}
                        alt={media.caption || 'Highlight'}
                        loading="lazy"
                        decoding="async"
                        referrerPolicy="no-referrer"
                        className="absolute inset-0 h-full w-full object-cover transition-transform duration-[700ms] ease-out group-hover:scale-[1.03]"
                      />
                    ) : (
                      <>
                        {/* Weicher, unscharfer Füll-Hintergrund aus demselben Bild:
                            füllt die 16:9-Kachel, ohne dass am eigentlichen Bild etwas
                            abgeschnitten wird (kein harter Crop, keine leeren Balken). */}
                        <img
                          src={media.url}
                          alt=""
                          aria-hidden
                          loading="lazy"
                          decoding="async"
                          referrerPolicy="no-referrer"
                          className="absolute inset-0 h-full w-full object-cover scale-125 blur-2xl opacity-45"
                        />
                        {/* Das vollständige Bild – nichts wird abgeschnitten. */}
                        <img
                          src={media.url}
                          alt={media.caption || 'Highlight'}
                          loading="lazy"
                          decoding="async"
                          referrerPolicy="no-referrer"
                          className="absolute inset-0 h-full w-full object-contain transition-transform duration-[700ms] ease-out group-hover:scale-[1.02]"
                        />
                      </>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/15 to-transparent" />

                    {isVideo && (
                      <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 grid place-items-center">
                        {/* pulsierender Ring lockt zum Klicken (nur im Fokus) */}
                        {isActive && !reduce && (
                          <span className="absolute w-[72px] h-[72px] rounded-full bg-brand-accent-light/35 animate-ping" />
                        )}
                        <span className="relative grid place-items-center w-[72px] h-[72px] rounded-full bg-brand-accent-light/95 text-brand-dark shadow-[0_0_40px_rgba(34,223,201,.7)] transition-transform group-hover:scale-110">
                          <Play className="w-8 h-8 translate-x-0.5" fill="currentColor" />
                        </span>
                      </span>
                    )}

                    {media.caption && (
                      <div className="absolute inset-x-0 bottom-0 p-4 sm:p-6 text-left">
                        <div className="mb-1.5 h-[3px] w-8 rounded bg-brand-accent-light shadow-[0_0_8px_rgba(34,223,201,.6)]" />
                        <span className="block font-display font-black text-white uppercase tracking-tight leading-[1.03] line-clamp-2 text-lg sm:text-3xl">
                          {media.caption}
                        </span>
                      </div>
                    )}
                  </button>
                </div>
              );
            })}
        </div>
      </div>

      {/* Pfeile (Desktop) – endlos, daher nie deaktiviert */}
      {n > 1 && (
        <>
          <button
            type="button"
            onClick={() => go(-1)}
            aria-label="Vorheriger Beitrag"
            className="hidden sm:flex absolute left-3 top-1/2 -translate-y-1/2 z-[120] w-11 h-11 rounded-full bg-black/50 border border-white/20 text-white hover:bg-black/70 items-center justify-center cursor-pointer transition-colors"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
          <button
            type="button"
            onClick={() => go(1)}
            aria-label="Nächster Beitrag"
            className="hidden sm:flex absolute right-3 top-1/2 -translate-y-1/2 z-[120] w-11 h-11 rounded-full bg-black/50 border border-white/20 text-white hover:bg-black/70 items-center justify-center cursor-pointer transition-colors"
          >
            <ChevronRight className="w-6 h-6" />
          </button>
        </>
      )}

      {/* Punkte */}
      {n > 1 && (
        <div className="flex items-center justify-center gap-2 mt-5">
          {items.map((m, i) => (
            <button
              key={m.id}
              type="button"
              onClick={() => goToItem(i)}
              aria-label={`Zu Beitrag ${i + 1}`}
              className={`h-2 rounded-full transition-all cursor-pointer ${
                i === activeItem ? 'w-6 bg-brand-accent-light' : 'w-2 bg-white/25 hover:bg-white/40'
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
