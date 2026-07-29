import { useState } from 'react';
import { Trash2, Maximize2 } from 'lucide-react';
import type { HighlightImage } from '../types';

// Eine Highlight-Kachel im Hero-League-Look: Bild in vollem Seitenverhältnis,
// darüber ein weicher Verlauf mit der Bildunterschrift (Display-Schrift, Akzent-
// linie) bzw. ein „Ansehen“-Hinweis. Im Bearbeiten-Modus: Löschen + ein Feld für
// die Bildunterschrift direkt unter dem Bild.
export default function HighlightThumb({
  image,
  onOpen,
  editMode,
  onDelete,
  onSetCaption,
  compact = false,
}: {
  image: HighlightImage;
  onOpen: () => void;
  editMode: boolean;
  onDelete: () => void;
  onSetCaption: (caption: string) => void;
  compact?: boolean;
}) {
  const [caption, setCaption] = useState(image.caption ?? '');

  return (
    <div className="group relative overflow-hidden rounded-2xl border border-white/[.08] bg-white/[.03] shadow-lg shadow-black/25">
      <div className="relative">
        <button type="button" onClick={onOpen} className="block w-full cursor-zoom-in" aria-label="Bild ansehen">
          <img
            src={image.url}
            alt={image.caption || 'Highlight'}
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            className="block w-full h-auto transition-transform duration-[600ms] ease-out group-hover:scale-[1.04]"
          />
          {/* Verlauf für Lesbarkeit + Design-Tiefe */}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent opacity-85 group-hover:opacity-100 transition-opacity" />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 p-3 sm:p-4">
            {image.caption ? (
              <>
                <div className="mb-1.5 h-0.5 w-7 rounded bg-brand-accent-light shadow-[0_0_8px_rgba(34,223,201,.6)]" />
                <span
                  className={`block font-display font-black text-white uppercase tracking-tight leading-[1.05] line-clamp-2 ${
                    compact ? 'text-xs' : 'text-sm sm:text-base'
                  }`}
                >
                  {image.caption}
                </span>
              </>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-[11px] font-sans font-bold uppercase tracking-wider text-white/85 opacity-0 group-hover:opacity-100 transition-opacity">
                <Maximize2 className="w-3.5 h-3.5" /> Ansehen
              </span>
            )}
          </div>
        </button>

        {editMode && (
          <button
            type="button"
            onClick={onDelete}
            title="Bild löschen"
            aria-label="Bild löschen"
            className={`absolute top-2 right-2 z-10 rounded-full bg-black/60 border border-white/20 text-white hover:bg-red-500/80 flex items-center justify-center cursor-pointer transition-colors ${
              compact ? 'w-8 h-8' : 'w-9 h-9'
            }`}
          >
            <Trash2 className={compact ? 'w-3.5 h-3.5' : 'w-4 h-4'} />
          </button>
        )}
      </div>

      {editMode && (
        <input
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          onBlur={() => {
            if (caption.trim() !== (image.caption ?? '')) onSetCaption(caption.trim());
          }}
          placeholder="Bildunterschrift (z. B. Erstes Treffen mit den Captains…)"
          className="w-full bg-brand-dark/80 border-t border-white/10 px-3 py-2 text-xs text-white font-sans placeholder:text-hl-faint focus:outline-none focus:bg-brand-dark"
        />
      )}
    </div>
  );
}
