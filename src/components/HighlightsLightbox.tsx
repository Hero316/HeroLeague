import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import type { HighlightImage } from '../types';

// Vollbild-Galerie mit Wisch-Navigation. Wird von der Highlights-Seite und dem
// Startseiten-Bereich geteilt. `index === null` = geschlossen.
export default function HighlightsLightbox({
  images,
  index,
  direction,
  onClose,
  onNavigate,
}: {
  images: HighlightImage[];
  index: number | null;
  direction: number; // 1 = vorwärts, -1 = rückwärts (für die Slide-Richtung)
  onClose: () => void;
  onNavigate: (nextIndex: number, dir: number) => void;
}) {
  const reduce = useReducedMotion();
  const open = index !== null && !!images[index];

  const go = (delta: number) => {
    if (index === null || images.length === 0) return;
    const next = (index + delta + images.length) % images.length;
    onNavigate(next, delta);
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') go(1);
      else if (e.key === 'ArrowLeft') go(-1);
    };
    document.addEventListener('keydown', onKey);
    // Hintergrund-Scroll sperren, solange die Lightbox offen ist
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, index, images.length]);

  if (!open || index === null) return null;
  const img = images[index];
  const multiple = images.length > 1;

  const slide = {
    enter: (dir: number) => ({ opacity: 0, scale: 0.96, x: reduce ? 0 : dir > 0 ? 60 : -60 }),
    center: { opacity: 1, scale: 1, x: 0 },
    exit: (dir: number) => ({ opacity: 0, scale: 0.98, x: reduce ? 0 : dir > 0 ? -60 : 60 }),
  };

  return createPortal(
    <motion.div
      initial={reduce ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.22 }}
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/90 backdrop-blur-md p-4 sm:p-8"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Highlight-Galerie"
    >
      {/* Schließen */}
      <button
        type="button"
        onClick={onClose}
        aria-label="Schließen"
        className="absolute top-4 right-4 z-20 w-11 h-11 rounded-full bg-white/10 border border-white/20 text-white hover:bg-white/20 flex items-center justify-center cursor-pointer"
      >
        <X className="w-5 h-5" />
      </button>

      {multiple && (
        <>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              go(-1);
            }}
            aria-label="Vorheriges Bild"
            className="absolute left-2 sm:left-5 z-20 w-11 h-11 rounded-full bg-white/10 border border-white/20 text-white hover:bg-white/20 flex items-center justify-center cursor-pointer"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              go(1);
            }}
            aria-label="Nächstes Bild"
            className="absolute right-2 sm:right-5 z-20 w-11 h-11 rounded-full bg-white/10 border border-white/20 text-white hover:bg-white/20 flex items-center justify-center cursor-pointer"
          >
            <ChevronRight className="w-6 h-6" />
          </button>
        </>
      )}

      <div className="relative w-full h-full flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
        <AnimatePresence custom={direction} mode="wait">
          <motion.img
            key={img.id}
            src={img.url}
            alt={img.caption || 'Highlight'}
            referrerPolicy="no-referrer"
            custom={direction}
            variants={slide}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.28, ease: [0.22, 0.61, 0.36, 1] }}
            drag={multiple ? 'x' : false}
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.18}
            onDragEnd={(_, info) => {
              if (info.offset.x < -80) go(1);
              else if (info.offset.x > 80) go(-1);
            }}
            className="max-w-full max-h-[82vh] object-contain rounded-xl shadow-2xl select-none touch-pan-y"
          />
        </AnimatePresence>
      </div>

      {/* Bildunterschrift im Hero-League-Stil + Zähler */}
      <div className="absolute bottom-5 left-0 right-0 z-20 flex flex-col items-center gap-2.5 px-6 pointer-events-none text-center">
        {img.caption && (
          <div className="max-w-2xl">
            <div className="mx-auto mb-2 h-[3px] w-10 rounded bg-brand-accent-light shadow-[0_0_10px_rgba(34,223,201,.7)]" />
            <p className="font-display font-black text-white text-lg sm:text-2xl uppercase tracking-tight leading-tight drop-shadow-[0_2px_12px_rgba(0,0,0,.75)]">
              {img.caption}
            </p>
          </div>
        )}
        {multiple && (
          <span className="font-mono text-xs text-white/55">
            {index + 1} / {images.length}
          </span>
        )}
      </div>
    </motion.div>,
    document.body
  );
}
