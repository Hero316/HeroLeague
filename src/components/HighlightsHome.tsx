import { useMemo, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import type { HighlightMedia } from '../types';
import { Reveal } from './anim';
import HighlightsLightbox from './HighlightsLightbox';
import HighlightsMosaic, { interleaveMedia } from './HighlightsMosaic';
import HighlightsEditor from './HighlightsEditor';

const HOME_LIMIT = 6; // Startseite zeigt nur die ersten paar Medien

// Startseiten-Highlight-Bereich: gemischte Vorschau (Bilder + Videos) im Mosaik.
// Im Bearbeiten-Modus (Admin) direkt verwaltbar. Kein separater großer Clip mehr.
export default function HighlightsHome({
  items,
  editMode,
  onOpenGallery,
  onAddImage,
  onAddVideo,
  onDeleteItem,
  onSetCaption,
}: {
  items: HighlightMedia[];
  editMode: boolean;
  onOpenGallery: () => void;
  onAddImage: (url: string, ratio?: number) => void;
  onAddVideo: (url: string) => void;
  onDeleteItem: (id: string) => void;
  onSetCaption: (id: string, caption: string) => void;
}) {
  const [lightbox, setLightbox] = useState<{ index: number | null; dir: number }>({ index: null, dir: 0 });
  // Ansicht: gemischt + auf HOME_LIMIT gekürzt. Bearbeiten: alle in Speicherreihenfolge.
  const display = useMemo(
    () => (editMode ? items : interleaveMedia(items).slice(0, HOME_LIMIT)),
    [items, editMode]
  );
  const open = (i: number) => setLightbox({ index: i, dir: 0 });

  // Nichts gepflegt + nicht im Bearbeiten-Modus => Bereich bleibt unsichtbar.
  if (!editMode && items.length === 0) return null;

  return (
    <section className="relative overflow-hidden border-t border-white/[.06]">
      <div className="absolute -top-24 right-0 w-[520px] h-[520px] bg-[radial-gradient(circle,rgba(34,223,201,.10),transparent_66%)] pointer-events-none" />
      <div className="relative max-w-[1320px] mx-auto px-4 sm:px-10 py-12 sm:py-16">
        <Reveal className="flex items-end justify-between gap-4 mb-7">
          <div>
            <div className="font-sans font-extrabold text-xs tracking-[3px] text-brand-accent-light uppercase">Highlights</div>
            <h2 className="mt-2 font-display font-black text-3xl sm:text-5xl leading-[.9] tracking-tight uppercase text-white">
              Momente der Liga
            </h2>
          </div>
          {items.length > 0 && (
            <button
              onClick={onOpenGallery}
              className="hidden sm:inline-flex items-center gap-1.5 shrink-0 px-4 py-2 rounded-full border border-white/12 text-hl-soft hover:text-white hover:border-white/25 text-xs font-sans font-bold uppercase tracking-wider transition-colors cursor-pointer"
            >
              Alle ansehen
              <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </Reveal>

        {editMode ? (
          <HighlightsEditor
            items={display}
            onOpen={open}
            onAddImage={onAddImage}
            onAddVideo={onAddVideo}
            onDeleteItem={onDeleteItem}
            onSetCaption={onSetCaption}
          />
        ) : (
          <HighlightsMosaic items={display} onOpen={open} />
        )}

        {/* „Alle ansehen“ auch mobil unter dem Mosaik */}
        {!editMode && items.length > HOME_LIMIT && (
          <div className="mt-6 sm:hidden">
            <button
              onClick={onOpenGallery}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full border border-white/12 text-hl-soft text-xs font-sans font-bold uppercase tracking-wider cursor-pointer"
            >
              Alle ansehen
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      <HighlightsLightbox
        items={display}
        index={lightbox.index}
        direction={lightbox.dir}
        onClose={() => setLightbox({ index: null, dir: 0 })}
        onNavigate={(next, dir) => setLightbox({ index: next, dir })}
      />
    </section>
  );
}
