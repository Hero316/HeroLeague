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
  const slideFrac = w < 640 ? 0.86 : 0.7;
  const gap = w * 0.03;
  const slideW = w * slideFrac;
  const stride = slideW + gap;
  const tx = w / 2 - (clampedActive * stride + slideW / 2);
  const spring = reduce ? { duration: 0 } : { type: 'spring' as const, stiffness: 260, damping: 34, mass: 0.9 };

  return (
    <div className="relative">
      <div ref={wrapRef} className="relative overflow-hidden select-none">
        <motion.div
          className="flex items-center py-1"
          drag={n > 1 ? 'x' : false}
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={0.12}
          onDragEnd={(_, info) => {
            if (info.offset.x < -60) go(1);
            else if (info.offset.x > 60) go(-1);
          }}
          animate={{ x: tx }}
          transition={spring}
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
                  onClick={() => (isActive ? onOpen(i) : setActive(i))}
                  className="group relative block w-full aspect-video overflow-hidden rounded-2xl border border-white/[.08] bg-brand-dark shadow-2xl cursor-pointer"
                  aria-label={isActive ? (isVideo ? 'Video abspielen' : 'Bild ansehen') : 'Beitrag in den Fokus rücken'}
                >
                  {isVideo && !thumb ? (
                    <div className="absolute inset-0 bg-[linear-gradient(140deg,#0d1a19,#06100f)]" />
                  ) : (
                    <img
                      src={isVideo ? (thumb as string) : media.url}
                      alt={media.caption || 'Highlight'}
                      loading="lazy"
                      decoding="async"
                      referrerPolicy="no-referrer"
                      className="absolute inset-0 h-full w-full object-cover transition-transform duration-[700ms] ease-out group-hover:scale-[1.03]"
                    />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/15 to-transparent" />

                  {isVideo && (
                    <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 grid place-items-center w-16 h-16 rounded-full bg-brand-accent-light/95 text-brand-dark shadow-[0_0_30px_rgba(34,223,201,.55)] transition-transform group-hover:scale-110">
                      <Play className="w-7 h-7 translate-x-0.5" fill="currentColor" />
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
