import { useState } from 'react';
import { Trash2, Maximize2, Play, Star } from 'lucide-react';
import type { HighlightMedia } from '../types';
import { toEmbed, youtubeThumb } from '../lib/videoEmbed';

// Eine Highlight-Kachel im Hero-League-Look – für Bild ODER Video.
// - Bild: volles Seitenverhältnis (kein Zuschnitt), Verlauf + Bildunterschrift.
// - Video: Vorschaubild (bei Twitch gebrandete Kachel) + Play-Button + „VIDEO“-Badge,
//   Kachelformat = echtes Videoformat (16:9 / 9:16 bei Shorts).
// Im Bearbeiten-Modus: Löschen-X + Feld für die Bildunterschrift.
export default function HighlightThumb({
  media,
  onOpen,
  editMode,
  onDelete,
  onSetCaption,
  onToggleFeatured,
  compact = false,
}: {
  media: HighlightMedia;
  onOpen: () => void;
  editMode: boolean;
  onDelete: () => void;
  onSetCaption: (caption: string) => void;
  onToggleFeatured?: () => void;
  compact?: boolean;
}) {
  const [caption, setCaption] = useState(media.caption ?? '');
  const isVideo = media.type === 'video';
  const embed = isVideo ? toEmbed(media.url) : null;
  const thumb = embed?.youtubeId ? youtubeThumb(embed.youtubeId) : null;
  const portrait = embed?.aspect === 'portrait';

  return (
    <div className="group relative overflow-hidden rounded-2xl border border-white/[.08] bg-white/[.03] shadow-lg shadow-black/25">
      <div className="relative">
        <button
          type="button"
          onClick={onOpen}
          className={`block w-full ${isVideo ? 'cursor-pointer' : 'cursor-zoom-in'}`}
          aria-label={isVideo ? 'Video abspielen' : 'Bild ansehen'}
        >
          {isVideo ? (
            <div className={`relative w-full bg-brand-dark ${portrait ? 'aspect-[9/16]' : 'aspect-video'}`}>
              {thumb ? (
                <img
                  src={thumb}
                  alt={media.caption || 'Highlight-Video'}
                  loading="lazy"
                  decoding="async"
                  referrerPolicy="no-referrer"
                  className="absolute inset-0 h-full w-full object-cover transition-transform duration-[600ms] ease-out group-hover:scale-[1.04]"
                />
              ) : (
                <div className="absolute inset-0 bg-[linear-gradient(140deg,#0d1a19,#06100f)]" />
              )}
              {/* Play-Button */}
              <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 grid place-items-center w-14 h-14 rounded-full bg-brand-accent-light/95 text-brand-dark shadow-[0_0_24px_rgba(34,223,201,.5)] transition-transform group-hover:scale-110">
                <Play className="w-6 h-6 translate-x-0.5" fill="currentColor" />
              </span>
              <span className="absolute top-2 left-2 rounded-full bg-black/55 border border-white/15 px-2 py-0.5 text-[10px] font-sans font-bold uppercase tracking-wider text-white/90">
                Video
              </span>
            </div>
          ) : (
            <img
              src={media.url}
              alt={media.caption || 'Highlight'}
              loading="lazy"
              decoding="async"
              referrerPolicy="no-referrer"
              className="block w-full h-auto transition-transform duration-[600ms] ease-out group-hover:scale-[1.04]"
            />
          )}

          {/* Verlauf + Bildunterschrift bzw. Hinweis */}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent opacity-85 group-hover:opacity-100 transition-opacity" />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 p-3 sm:p-4">
            {media.caption ? (
              <>
                <div className="mb-1.5 h-0.5 w-7 rounded bg-brand-accent-light shadow-[0_0_8px_rgba(34,223,201,.6)]" />
                <span
                  className={`block font-display font-black text-white uppercase tracking-tight leading-[1.05] line-clamp-2 ${
                    compact ? 'text-xs' : 'text-sm sm:text-base'
                  }`}
                >
                  {media.caption}
                </span>
              </>
            ) : (
              !isVideo && (
                <span className="inline-flex items-center gap-1.5 text-[11px] font-sans font-bold uppercase tracking-wider text-white/85 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Maximize2 className="w-3.5 h-3.5" /> Ansehen
                </span>
              )
            )}
          </div>
        </button>

        {editMode && (
          <button
            type="button"
            onClick={onDelete}
            title="Löschen"
            aria-label="Löschen"
            className={`absolute top-2 right-2 z-10 rounded-full bg-black/60 border border-white/20 text-white hover:bg-red-500/80 flex items-center justify-center cursor-pointer transition-colors ${
              compact ? 'w-8 h-8' : 'w-9 h-9'
            }`}
          >
            <Trash2 className={compact ? 'w-3.5 h-3.5' : 'w-4 h-4'} />
          </button>
        )}

        {/* Stern: markiert den Beitrag fürs Startseiten-Karussell */}
        {editMode && onToggleFeatured && (
          <button
            type="button"
            onClick={onToggleFeatured}
            title={media.featured ? 'Vom Startseiten-Karussell entfernen' : 'Auf der Startseite zeigen'}
            aria-label={media.featured ? 'Vom Startseiten-Karussell entfernen' : 'Auf der Startseite zeigen'}
            aria-pressed={!!media.featured}
            className={`absolute top-2 left-2 z-10 rounded-full border flex items-center justify-center cursor-pointer transition-colors ${
              compact ? 'w-8 h-8' : 'w-9 h-9'
            } ${
              media.featured
                ? 'bg-brand-accent-light text-brand-dark border-brand-accent-light shadow-[0_0_16px_rgba(34,223,201,.6)]'
                : 'bg-black/60 text-white border-white/20 hover:bg-black/80'
            }`}
          >
            <Star
              className={compact ? 'w-3.5 h-3.5' : 'w-4 h-4'}
              fill={media.featured ? 'currentColor' : 'none'}
            />
          </button>
        )}
      </div>

      {editMode && (
        <input
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          onBlur={() => {
            if (caption.trim() !== (media.caption ?? '')) onSetCaption(caption.trim());
          }}
          placeholder={isVideo ? 'Titel (z. B. Tor des Monats)…' : 'Bildunterschrift (z. B. Erstes Treffen…)'}
          className="w-full bg-brand-dark/80 border-t border-white/10 px-3 py-2 text-xs text-white font-sans placeholder:text-hl-faint focus:outline-none focus:bg-brand-dark"
        />
      )}
    </div>
  );
}
