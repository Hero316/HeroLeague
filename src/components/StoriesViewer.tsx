import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, ChevronLeft, ChevronRight, Images, Download } from 'lucide-react';
import type { HighlightAlbum } from '../types';
import { toEmbed } from '../lib/videoEmbed';
import { albumCoverInfo } from './highlightsEdit';
import { downloadImage } from '../lib/download';
import HighlightClip from './HighlightClip';
import ZoomableImage from './ZoomableImage';

const IMAGE_MS = 10000; // 10 Sek. pro Bild
const VIDEO_MAX_MS = 60000; // Sicherheits-Fallback, falls ein Video kein Ende meldet

// Instagram-Story-Player für die Highlight-Ordner:
// - Fortschrittsbalken oben, ~10 Sek./Bild, dann automatisch weiter
// - Video läuft bis zum Ende, dann weiter
// - rechts tippen = nächstes, links tippen = vorheriges (Bild/Video)
// - wischen oder Pfeile außen = nächster/vorheriger Ordner
// - gedrückt halten (Handy) / Leertaste (PC) = Pause
export default function StoriesViewer({
  albums,
  initialAlbum,
  onClose,
  onOpenAlbum,
}: {
  albums: HighlightAlbum[];
  initialAlbum: number;
  onClose: () => void;
  onOpenAlbum?: (albumId: string) => void; // Kopf antippen ⇒ ganzen Ordner (Galerie) öffnen
}) {
  const [ai, setAi] = useState(Math.min(Math.max(0, initialAlbum), Math.max(0, albums.length - 1)));
  const [ii, setII] = useState(0);
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const [zoomed, setZoomed] = useState(false);

  const album = albums[ai];
  const items = album?.items ?? [];
  const item = items[ii];
  const isVideo = item?.type === 'video';
  const embed = isVideo ? toEmbed(item.url) : null;

  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const progressRef = useRef(0);
  progressRef.current = progress;
  const down = useRef<{ x: number; y: number } | null>(null);
  const holdTimer = useRef(0);

  // ---- Navigation ----
  const goItem = (target: number) => {
    setProgress(0);
    progressRef.current = 0;
    setII(target);
  };
  const next = () => {
    if (ii < items.length - 1) goItem(ii + 1);
    else if (ai < albums.length - 1) {
      setProgress(0);
      progressRef.current = 0;
      setAi(ai + 1);
      setII(0);
    } else onClose();
  };
  const prev = () => {
    if (ii > 0) goItem(ii - 1);
    else if (ai > 0) {
      setProgress(0);
      progressRef.current = 0;
      setAi(ai - 1);
      setII(0);
    } else goItem(0);
  };
  const goAlbum = (delta: number) => {
    const na = ai + delta;
    if (na < 0) return;
    if (na > albums.length - 1) return onClose();
    setProgress(0);
    progressRef.current = 0;
    setAi(na);
    setII(0);
  };

  // ---- Auto-Fortschritt ----
  useEffect(() => {
    if (!item) {
      onClose();
      return;
    }
    if (paused || zoomed) return;

    if (isVideo) {
      // Video: kein Countdown – bis Ende (onEnded) bzw. Sicherheits-Timeout.
      const t = window.setTimeout(next, VIDEO_MAX_MS);
      return () => window.clearTimeout(t);
    }

    let raf = 0;
    const start = performance.now() - progressRef.current * IMAGE_MS;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / IMAGE_MS);
      setProgress(p);
      progressRef.current = p;
      if (p >= 1) {
        next();
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ai, ii, paused, isVideo, zoomed]);

  // Beim Wechsel von Bild/Ordner den Zoom zurücksetzen.
  useEffect(() => setZoomed(false), [ai, ii]);

  // Tastatur (PC)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') next();
      else if (e.key === 'ArrowLeft') prev();
      else if (e.key === ' ') {
        e.preventDefault();
        setPaused((p) => !p);
      }
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ai, ii, items.length, albums.length]);

  if (!album || !item) return null;

  // ---- Zeiger-Handling (Tippen / Halten / Wischen) ----
  const makeZone = (onTap: () => void) => ({
    onPointerDown: (e: React.PointerEvent) => {
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
      down.current = { x: e.clientX, y: e.clientY };
      holdTimer.current = window.setTimeout(() => setPaused(true), 220);
    },
    onPointerMove: (e: React.PointerEvent) => {
      const d = down.current;
      if (!d) return;
      if ((Math.abs(e.clientX - d.x) > 8 || Math.abs(e.clientY - d.y) > 8) && holdTimer.current) {
        window.clearTimeout(holdTimer.current);
        holdTimer.current = 0;
      }
    },
    onPointerUp: (e: React.PointerEvent) => {
      if (holdTimer.current) {
        window.clearTimeout(holdTimer.current);
        holdTimer.current = 0;
      }
      const d = down.current;
      down.current = null;
      if (pausedRef.current) {
        setPaused(false);
        return;
      }
      if (!d) return;
      const dx = e.clientX - d.x;
      const dy = e.clientY - d.y;
      // Horizontal wischen = Ordner wechseln.
      if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy)) {
        goAlbum(dx < 0 ? 1 : -1);
        return;
      }
      // Sonstiges Ziehen (z. B. senkrecht) ignorieren – nur echtes Tippen wechselt das Bild.
      if (Math.abs(dx) > 12 || Math.abs(dy) > 12) return;
      onTap();
    },
    onPointerCancel: () => {
      if (holdTimer.current) {
        window.clearTimeout(holdTimer.current);
        holdTimer.current = 0;
      }
      down.current = null;
      if (pausedRef.current) setPaused(false);
    },
  });

  const portrait = embed?.aspect === 'portrait';
  const cover = albumCoverInfo(album);

  return createPortal(
    <div className="fixed inset-0 z-[130] bg-black flex items-center justify-center select-none">
      {/* Medien-Bühne */}
      <div className="absolute inset-0 flex items-center justify-center">
        {isVideo && embed ? (
          <div className={`relative ${portrait ? 'h-[88%] aspect-[9/16]' : 'w-[94%] max-w-3xl aspect-video'}`}>
            <HighlightClip key={item.id} embed={embed} autoplay onEnded={next} />
          </div>
        ) : isVideo ? (
          <p className="text-white/70 font-sans">Video-Link nicht erkannt.</p>
        ) : (
          <div className="relative w-full h-full">
            <img
              src={item.url}
              alt=""
              aria-hidden
              className="absolute inset-0 h-full w-full object-cover scale-110 blur-2xl opacity-40"
            />
            {/* Bild ist zoombar (Pinch/Maus); Tippen blättert, Halten pausiert,
                Wischen wechselt den Ordner. */}
            <ZoomableImage
              key={item.id}
              src={item.url}
              alt={item.caption || 'Highlight'}
              onTapZone={(zone) => (zone === 'left' ? prev() : next())}
              onSwipe={(dir) => goAlbum(dir)}
              onHoldChange={setPaused}
              onZoomChange={setZoomed}
            />
          </div>
        )}
      </div>

      {/* Tipp-/Wisch-Zonen nur für Video (Bilder steuert ZoomableImage selbst).
          Bei Video bleibt die Mitte frei für die Player-Steuerung. */}
      {isVideo && (
        <div className="absolute inset-0 z-20 flex">
          <div className="touch-none w-[28%]" {...makeZone(prev)} />
          <div className="flex-1 pointer-events-none" />
          <div className="touch-none w-[28%] ml-auto" {...makeZone(next)} />
        </div>
      )}

      {/* Fortschrittsbalken oben (Instagram-Stil): ein Segment je Bild. Bei vielen
          Bildern werden die Abstände kleiner, damit alle Striche sichtbar bleiben. */}
      <div
        className="absolute top-0 left-0 right-0 z-30 px-3 pt-[calc(env(safe-area-inset-top)+0.75rem)] flex"
        style={{ gap: items.length > 30 ? 2 : items.length > 15 ? 3 : 4 }}
      >
        {items.map((m, idx) => (
          <div key={m.id} className="h-[3px] flex-1 min-w-0 rounded-full bg-white/30 overflow-hidden">
            <div
              className={`h-full rounded-full bg-white ${idx === ii && isVideo ? 'animate-pulse' : ''}`}
              style={{ width: idx < ii ? '100%' : idx > ii ? '0%' : isVideo ? '100%' : `${progress * 100}%` }}
            />
          </div>
        ))}
      </div>

      {/* Kopf: Ordner (Cover + Name, antippbar ⇒ ganzer Ordner) + Schließen */}
      <div className="absolute top-[calc(env(safe-area-inset-top)+1.75rem)] left-0 right-0 z-30 px-4 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => onOpenAlbum?.(album.id)}
          disabled={!onOpenAlbum}
          aria-label={onOpenAlbum ? `Ordner ${album.title} öffnen` : album.title}
          className="group flex items-center gap-2.5 min-w-0 cursor-pointer disabled:cursor-default text-left"
        >
          <span className="shrink-0 w-9 h-9 rounded-full overflow-hidden bg-white/10 border border-white/30 grid place-items-center">
            {cover ? (
              <img
                src={cover.url}
                alt=""
                referrerPolicy="no-referrer"
                className={`h-full w-full ${cover.custom ? 'object-contain p-1' : 'object-cover'}`}
              />
            ) : (
              <Images className="w-4 h-4 text-white/70" />
            )}
          </span>
          <span
            className={`font-display font-black text-white uppercase tracking-tight text-sm sm:text-base drop-shadow-[0_1px_6px_rgba(0,0,0,.8)] truncate min-w-0 ${
              onOpenAlbum ? 'group-hover:underline' : ''
            }`}
          >
            {album.title}
          </span>
        </button>
        <button
          type="button"
          onClick={onClose}
          aria-label="Schließen"
          className="shrink-0 w-10 h-10 rounded-full bg-white/10 border border-white/20 text-white hover:bg-white/20 flex items-center justify-center cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Album-Pfeile außen (Desktop) */}
      {albums.length > 1 && (
        <>
          <button
            type="button"
            onClick={() => goAlbum(-1)}
            disabled={ai === 0}
            aria-label="Vorheriger Ordner"
            className="hidden sm:flex absolute left-2 top-1/2 -translate-y-1/2 z-40 w-11 h-11 rounded-full bg-white/10 border border-white/20 text-white hover:bg-white/20 items-center justify-center cursor-pointer disabled:opacity-0"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
          <button
            type="button"
            onClick={() => goAlbum(1)}
            aria-label="Nächster Ordner"
            className="hidden sm:flex absolute right-2 top-1/2 -translate-y-1/2 z-40 w-11 h-11 rounded-full bg-white/10 border border-white/20 text-white hover:bg-white/20 items-center justify-center cursor-pointer"
          >
            <ChevronRight className="w-6 h-6" />
          </button>
        </>
      )}

      {/* Bildunterschrift + feiner Glas-Download-Button (nur Bilder) */}
      <div className="absolute bottom-[calc(env(safe-area-inset-bottom)+1.5rem)] left-0 right-0 z-30 px-6 flex flex-col items-center gap-3 pointer-events-none text-center">
        {item.caption && !zoomed && (
          <div className="max-w-2xl">
            <div className="mx-auto mb-2 h-[3px] w-10 rounded bg-brand-accent-light shadow-[0_0_10px_rgba(34,223,201,.7)]" />
            <p className="font-display font-black text-white text-base sm:text-2xl uppercase tracking-tight leading-tight drop-shadow-[0_2px_12px_rgba(0,0,0,.8)]">
              {item.caption}
            </p>
          </div>
        )}
        {!isVideo && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              const ext = item.url.split('.').pop()?.split('?')[0]?.toLowerCase() || 'jpg';
              const base = (item.caption || album.title || 'hero-league').trim().replace(/[^\w-]+/g, '_').slice(0, 40);
              downloadImage(item.url, `${base || 'hero-league'}.${ext.length <= 4 ? ext : 'jpg'}`);
            }}
            className="pointer-events-auto inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 backdrop-blur-md px-4 py-2 text-xs font-sans font-bold uppercase tracking-wider text-white hover:bg-white/20 active:scale-95 transition shadow-lg cursor-pointer"
          >
            <Download className="w-4 h-4" />
            Bild speichern
          </button>
        )}
      </div>

      {/* Pause-Hinweis */}
      {paused && (
        <div className="absolute bottom-2 left-0 right-0 z-30 text-center pointer-events-none">
          <span className="text-[11px] font-mono uppercase tracking-wider text-white/50">Pause</span>
        </div>
      )}
    </div>,
    document.body
  );
}
