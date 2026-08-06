import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { X, ChevronLeft, ChevronRight, Download } from 'lucide-react';
import type { HighlightMedia } from '../types';
import { toEmbed } from '../lib/videoEmbed';
import { downloadImage } from '../lib/download';
import HighlightClip from './HighlightClip';
import ZoomableImage from './ZoomableImage';

// Dateiname fürs Herunterladen: aus der Bildunterschrift (falls vorhanden) + echter
// Endung der Blob-URL, sonst ein neutraler Name.
function downloadName(media: HighlightMedia): string {
  const ext = media.url.split('.').pop()?.split('?')[0]?.toLowerCase() || 'jpg';
  const base = media.caption ? media.caption.trim().replace(/[^\w-]+/g, '_').slice(0, 40) : 'hero-league';
  return `${base || 'hero-league'}.${ext.length <= 4 ? ext : 'jpg'}`;
}

// Vollbild-Ansicht mit Wisch-Navigation für gemischte Medien (Bild + Video).
// Wird von der Highlights-Seite und dem Startseiten-Bereich geteilt.
// `index === null` = geschlossen.
export default function HighlightsLightbox({
  items,
  index,
  direction,
  onClose,
  onNavigate,
}: {
  items: HighlightMedia[];
  index: number | null;
  direction: number; // 1 = vorwärts, -1 = rückwärts (für die Slide-Richtung)
  onClose: () => void;
  onNavigate: (nextIndex: number, dir: number) => void;
}) {
  const reduce = useReducedMotion();
  const open = index !== null && !!items[index];
  const [zoomed, setZoomed] = useState(false);

  // Beim Bildwechsel den Zoom-Zustand zurücksetzen (das Bild selbst wird über den
  // key neu aufgebaut und startet wieder unzoomt).
  useEffect(() => setZoomed(false), [index]);

  const go = (delta: number) => {
    if (index === null || items.length === 0) return;
    const next = (index + delta + items.length) % items.length;
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
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, index, items.length]);

  if (!open || index === null) return null;
  const media = items[index];
  const multiple = items.length > 1;
  const isVideo = media.type === 'video';
  const embed = isVideo ? toEmbed(media.url) : null;
  const portrait = embed?.aspect === 'portrait';

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
      aria-label="Highlights"
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Schließen"
        className="absolute top-[calc(env(safe-area-inset-top)+1rem)] right-[calc(env(safe-area-inset-right)+1rem)] z-20 w-11 h-11 rounded-full bg-white/10 border border-white/20 text-white hover:bg-white/20 flex items-center justify-center cursor-pointer"
      >
        <X className="w-5 h-5" />
      </button>

      {multiple && !zoomed && (
        <>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              go(-1);
            }}
            aria-label="Vorheriges"
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
            aria-label="Nächstes"
            className="absolute right-2 sm:right-5 z-20 w-11 h-11 rounded-full bg-white/10 border border-white/20 text-white hover:bg-white/20 flex items-center justify-center cursor-pointer"
          >
            <ChevronRight className="w-6 h-6" />
          </button>
        </>
      )}

      <div className="relative w-full h-full flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
        <AnimatePresence custom={direction} mode="popLayout">
          <motion.div
            key={media.id}
            custom={direction}
            variants={slide}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ type: 'spring', bounce: 0, duration: 0.3 }}
            className="flex items-center justify-center"
          >
            {isVideo && embed ? (
              <div
                className={`relative overflow-hidden rounded-xl shadow-2xl bg-black ${
                  portrait ? 'h-[80vh] max-h-[720px] aspect-[9/16]' : 'w-full max-w-5xl aspect-video'
                }`}
              >
                <HighlightClip embed={embed} />
              </div>
            ) : isVideo ? (
              <p className="text-white/70 font-sans">Video-Link nicht erkannt.</p>
            ) : (
              <div className="relative w-[90vw] max-w-5xl h-[82vh]">
                <ZoomableImage
                  key={media.id}
                  src={media.url}
                  alt={media.caption || 'Highlight'}
                  className="max-h-full max-w-full object-contain rounded-xl shadow-2xl select-none"
                  onSwipe={(d) => multiple && go(d)}
                  onZoomChange={setZoomed}
                />
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Bildunterschrift + Zähler + feiner Glas-Download-Button (nur Bilder) */}
      <div className="absolute bottom-[calc(env(safe-area-inset-bottom)+1.25rem)] left-0 right-0 z-30 flex flex-col items-center gap-3 px-6 pointer-events-none text-center">
        {media.caption && !zoomed && (
          <div className="max-w-2xl">
            <div className="mx-auto mb-2 h-[3px] w-10 rounded bg-brand-accent-light shadow-[0_0_10px_rgba(34,223,201,.7)]" />
            <p className="font-display font-black text-white text-lg sm:text-2xl uppercase tracking-tight leading-tight drop-shadow-[0_2px_12px_rgba(0,0,0,.75)]">
              {media.caption}
            </p>
          </div>
        )}
        {multiple && !zoomed && <span className="font-mono text-xs text-white/55">{index + 1} / {items.length}</span>}
        {!isVideo && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              downloadImage(media.url, downloadName(media));
            }}
            className="pointer-events-auto inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 backdrop-blur-md px-4 py-2 text-xs font-sans font-bold uppercase tracking-wider text-white hover:bg-white/20 active:scale-95 transition shadow-lg cursor-pointer"
          >
            <Download className="w-4 h-4" />
            Bild speichern
          </button>
        )}
      </div>
    </motion.div>,
    document.body
  );
}
