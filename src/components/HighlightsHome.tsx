import { useMemo, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import type { HighlightMedia, HighlightsConfig } from '../types';
import { Reveal } from './anim';
import HighlightsLightbox from './HighlightsLightbox';
import HighlightsCarousel from './HighlightsCarousel';
import HighlightsEditor from './HighlightsEditor';
import { mediaListHandlers } from './highlightsEdit';

// Videos zuerst, damit der erste Beitrag im Karussell ein Video ist.
const videosFirst = (list: HighlightMedia[]) =>
  [...list].sort((a, b) => (a.type === 'video' ? 0 : 1) - (b.type === 'video' ? 0 : 1));

// Startseiten-Highlight-Bereich: horizontales Hero-Karussell (großer Beitrag im
// Fokus, seitlicher Peek, Swipe). Im Bearbeiten-Modus die losen Highlights pflegen.
export default function HighlightsHome({
  highlights,
  editMode,
  onOpenGallery,
  onSave,
}: {
  highlights: HighlightsConfig;
  editMode: boolean;
  onOpenGallery: () => void;
  onSave: (next: HighlightsConfig) => void;
}) {
  const items = highlights.items;
  const [lightbox, setLightbox] = useState<{ index: number | null; dir: number }>({ index: null, dir: 0 });
  const display = useMemo(() => (editMode ? items : videosFirst(items)), [items, editMode]);
  const open = (i: number) => setLightbox({ index: i, dir: 0 });
  const handlers = mediaListHandlers(items, (next) => onSave({ ...highlights, items: next }));

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
              className="inline-flex items-center gap-1.5 shrink-0 px-4 py-2 rounded-full border border-white/12 text-hl-soft hover:text-white hover:border-white/25 text-xs font-sans font-bold uppercase tracking-wider transition-colors cursor-pointer"
            >
              Alle ansehen
              <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </Reveal>

        {editMode ? (
          <HighlightsEditor items={display} onOpen={open} {...handlers} />
        ) : (
          <HighlightsCarousel items={display} onOpen={open} />
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
