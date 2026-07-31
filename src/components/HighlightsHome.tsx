import { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { ArrowRight } from 'lucide-react';
import type { HighlightsConfig } from '../types';
import { Reveal } from './anim';
import HighlightsLightbox from './HighlightsLightbox';
import HighlightsCarousel from './HighlightsCarousel';
import HighlightsEditor from './HighlightsEditor';
import StoryPills from './StoryPills';
import StoriesViewer from './StoriesViewer';
import { mediaListHandlers, newestFirst } from './highlightsEdit';

// Startseiten-Highlight-Bereich: horizontales Hero-Karussell + darunter die
// runden Story-Pillen (je Ordner). Im Bearbeiten-Modus die losen Highlights pflegen.
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
  const albums = highlights.albums;
  const [lightbox, setLightbox] = useState<{ index: number | null; dir: number }>({ index: null, dir: 0 });
  const [storyAlbum, setStoryAlbum] = useState<number | null>(null);
  // Neueste zuerst – im Karussell und im Bearbeiten-Modus gleichermaßen.
  const display = useMemo(() => newestFirst(items), [items]);
  const open = (i: number) => setLightbox({ index: i, dir: 0 });
  const handlers = mediaListHandlers(items, (next) => onSave({ ...highlights, items: next }));

  if (!editMode && items.length === 0 && albums.length === 0) return null;

  return (
    <section className="relative overflow-hidden border-y border-brand-accent-light/10">
      {/* Animierter Farb-Hintergrund: taucht beim Reinscrollen auf und hebt den
          Bereich deutlich vom schwarzen Rest ab. */}
      <motion.div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true, margin: '-18% 0px' }}
        transition={{ duration: 1, ease: 'easeOut' }}
      >
        <div className="absolute inset-0 bg-[linear-gradient(180deg,#060d0c_0%,#082220_46%,#06110f_100%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(95%_75%_at_50%_-8%,rgba(34,223,201,.22),transparent_62%)]" />
        <div className="hl-drift-a absolute -top-28 -left-16 w-[440px] h-[440px] rounded-full bg-[radial-gradient(circle,rgba(34,223,201,.20),transparent_66%)]" />
        <div className="hl-drift-b absolute -bottom-28 -right-12 w-[480px] h-[480px] rounded-full bg-[radial-gradient(circle,rgba(88,240,205,.13),transparent_66%)]" />
      </motion.div>
      {/* Weiche Kanten, damit der farbige Bereich sanft in das Schwarz übergeht */}
      <div aria-hidden className="absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-black/75 to-transparent pointer-events-none" />
      <div aria-hidden className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/75 to-transparent pointer-events-none" />

      <div className="relative z-[1] max-w-[1320px] mx-auto px-4 sm:px-10 py-14 sm:py-20">
        <Reveal className="flex items-end justify-between gap-4 mb-8">
          <div>
            <div className="inline-flex items-center gap-2 font-sans font-extrabold text-xs tracking-[3px] text-brand-accent-light uppercase">
              <span className="h-[2px] w-6 rounded bg-brand-accent-light shadow-[0_0_10px_rgba(34,223,201,.85)]" />
              Highlights
            </div>
            <h2 className="mt-3 font-display font-black text-4xl sm:text-6xl leading-[.9] tracking-tight uppercase text-white [text-shadow:0_0_34px_rgba(34,223,201,.28)]">
              Momente der Liga
            </h2>
          </div>
          {(items.length > 0 || albums.length > 0) && (
            <button
              onClick={onOpenGallery}
              className="inline-flex items-center gap-1.5 shrink-0 px-4 py-2 rounded-full border border-brand-accent-light/30 bg-brand-accent-light/5 text-brand-accent-light hover:bg-brand-accent-light/15 text-xs font-sans font-bold uppercase tracking-wider transition-colors cursor-pointer"
            >
              Alle ansehen
              <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </Reveal>

        {editMode ? (
          <HighlightsEditor items={display} onOpen={open} {...handlers} />
        ) : (
          <>
            {display.length > 0 && <HighlightsCarousel items={display} onOpen={open} />}
            {albums.length > 0 && (
              <Reveal className="mt-9">
                <StoryPills albums={albums} onOpen={setStoryAlbum} />
              </Reveal>
            )}
          </>
        )}
      </div>

      <HighlightsLightbox
        items={display}
        index={lightbox.index}
        direction={lightbox.dir}
        onClose={() => setLightbox({ index: null, dir: 0 })}
        onNavigate={(next, dir) => setLightbox({ index: next, dir })}
      />

      {storyAlbum !== null && (
        <StoriesViewer albums={albums} initialAlbum={storyAlbum} onClose={() => setStoryAlbum(null)} />
      )}
    </section>
  );
}
