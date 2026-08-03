import { useLayoutEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { ChevronLeft, ChevronRight, Play } from 'lucide-react';
import type { HighlightMedia } from '../types';
import { toEmbed, youtubeThumb } from '../lib/videoEmbed';

// Horizontales Hero-Karussell (wie NOWNESS): ein großer Beitrag im Fokus, links
// und rechts das vorherige/nächste leicht angeschnitten. Swipen oder Pfeile;
// weiche Feder-Animation. Klick auf den aktiven Beitrag öffnet die Lightbox.
export default function HighlightsCarousel({
  items,
  onOpen,
}: {
  items: HighlightMedia[];
  onOpen: (index: number) => void;
}) {
  const reduce = useReducedMotion();
  const wrapRef = useRef<HTMLDivElement>(null);
  const didPan = useRef(false); // verhindert den Klick direkt nach einem Wisch
  const [w, setW] = useState(0);
  const [active, setActive] = useState(0);

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
  const clampedActive = Math.min(active, Math.max(0, n - 1));
  const go = (delta: number) => setActive((a) => Math.min(n - 1, Math.max(0, a + delta)));

  // Auf Handy fast volle Breite (wenig Peek), auf Desktop schmaler (mehr Peek).
  const slideFrac = w < 640 ? 0.9 : 0.72;
  const gap = w * 0.03;
  const slideW = w * slideFrac;
  const stride = slideW + gap;
  const tx = w / 2 - (clampedActive * stride + slideW / 2);
  const spring = reduce ? { duration: 0 } : { type: 'spring' as const, stiffness: 260, damping: 34, mass: 0.9 };

  return (
    <div className="relative">
      <div ref={wrapRef} className="relative overflow-hidden select-none">
        {/* Aussen: Positionierung (animate x=tx). Innen: Wischen per drag='x'
            – das setzt touch-action:pan-y, also horizontal wischen + vertikal
            weiter scrollen. So getrennt gibt es keinen Konflikt/Rücksprung. */}
        <motion.div className="flex items-center py-1" animate={{ x: tx }} transition={spring}>
          <motion.div
            className="flex items-center"
            drag={n > 1 ? 'x' : false}
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.15}
            dragMomentum={false}
            onDragEnd={(_, info) => {
              if (n < 2) return;
              if (Math.abs(info.offset.x) < Math.abs(info.offset.y)) return;
              const swipe = info.offset.x + info.velocity.x * 0.15;
              if (swipe > -60 && swipe < 60) return;
              didPan.current = true;
              setTimeout(() => (didPan.current = false), 60); // den Folge-Klick schlucken
              if (swipe < 0) go(1);
              else go(-1);
            }}
          >
            {items.map((media, i) => {
            const isActive = i === clampedActive;
            const isVideo = media.type === 'video';
            const embed = isVideo ? toEmbed(media.url) : null;
            const thumb = embed?.youtubeId ? youtubeThumb(embed.youtubeId) : null;
            return (
              <motion.div
                key={media.id}
                className="flex-none"
                style={{ width: slideW || '100%', marginRight: gap }}
                animate={{ scale: isActive ? 1 : 0.9, opacity: isActive ? 1 : 0.45 }}
                transition={spring}
              >
                <button
                  type="button"
                  onClick={() => {
                    if (didPan.current) return; // gerade gewischt -> kein Klick
                    if (isActive) onOpen(i);
                    else setActive(i);
                  }}
                  className="group relative block w-full aspect-video overflow-hidden rounded-2xl border border-white/[.08] bg-brand-dark shadow-2xl cursor-pointer"
                  aria-label={isActive ? (isVideo ? 'Video abspielen' : 'Bild ansehen') : 'Beitrag in den Fokus rücken'}
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
                      {/* Weicher, unscharfer Fuell-Hintergrund aus demselben Bild:
                          fuellt die 16:9-Kachel, ohne dass am eigentlichen Bild etwas
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
                      {/* Das vollstaendige Bild – nichts wird abgeschnitten. */}
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
                      {/* pulsierender Ring lockt zum Klicken */}
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
              </motion.div>
            );
          })}
          </motion.div>
        </motion.div>
      </div>

      {/* Pfeile (Desktop) */}
      {n > 1 && (
        <>
          <button
            type="button"
            onClick={() => go(-1)}
            disabled={clampedActive === 0}
            aria-label="Vorheriger Beitrag"
            className="hidden sm:flex absolute left-3 top-1/2 -translate-y-1/2 z-10 w-11 h-11 rounded-full bg-black/50 border border-white/20 text-white hover:bg-black/70 items-center justify-center cursor-pointer disabled:opacity-0 transition-opacity"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
          <button
            type="button"
            onClick={() => go(1)}
            disabled={clampedActive === n - 1}
            aria-label="Nächster Beitrag"
            className="hidden sm:flex absolute right-3 top-1/2 -translate-y-1/2 z-10 w-11 h-11 rounded-full bg-black/50 border border-white/20 text-white hover:bg-black/70 items-center justify-center cursor-pointer disabled:opacity-0 transition-opacity"
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
              onClick={() => setActive(i)}
              aria-label={`Zu Beitrag ${i + 1}`}
              className={`h-2 rounded-full transition-all cursor-pointer ${
                i === clampedActive ? 'w-6 bg-brand-accent-light' : 'w-2 bg-white/25 hover:bg-white/40'
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
