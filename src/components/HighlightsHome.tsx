import { useMemo, useRef, useState } from 'react';
import { motion, useScroll, useTransform } from 'motion/react';
import { ArrowRight } from 'lucide-react';
import type { HighlightsConfig } from '../types';
import { Reveal } from './anim';
import HighlightsLightbox from './HighlightsLightbox';
import HighlightsCarousel from './HighlightsCarousel';
import HighlightsEditor from './HighlightsEditor';
import StoryPills from './StoryPills';
import StoriesViewer from './StoriesViewer';
import { mediaListHandlers, newestFirst, collectFeatured } from './highlightsEdit';

// Startseiten-Highlight-Bereich: horizontales Hero-Karussell + darunter die
// runden Story-Pillen (je Ordner). Im Bearbeiten-Modus die losen Highlights pflegen.
export default function HighlightsHome({
  highlights,
  editMode,
  onOpenGallery,
  onOpenAlbum,
  onSave,
}: {
  highlights: HighlightsConfig;
  editMode: boolean;
  onOpenGallery: () => void;
  onOpenAlbum?: (albumId: string) => void; // aus der Story-Ansicht in den ganzen Ordner springen
  onSave: (next: HighlightsConfig) => void;
}) {
  const items = highlights.items;
  const albums = highlights.albums;
  const [lightbox, setLightbox] = useState<{ index: number | null; dir: number }>({ index: null, dir: 0 });
  const [storyAlbum, setStoryAlbum] = useState<number | null>(null);
  // Karussell zeigt nur die mit Stern markierten Medien (aus allen Ordnern + losen
  // Highlights). Ist noch nichts markiert, greifen die losen Highlights als Vorgabe
  // – so bleibt die Startseite auch ohne Auswahl gefüllt. Neueste zuerst.
  const featured = useMemo(() => collectFeatured(items, albums), [items, albums]);
  const carouselItems = featured.length > 0 ? featured : items;
  const display = useMemo(() => newestFirst(carouselItems), [carouselItems]);
  const open = (i: number) => setLightbox({ index: i, dir: 0 });
  // Im Bearbeiten-Modus werden die losen Highlights gepflegt.
  const editItems = useMemo(() => newestFirst(items), [items]);
  const handlers = mediaListHandlers(items, (next) => onSave({ ...highlights, items: next }));

  // Scroll-gekoppelte Parallaxe: während man von der Hero-Section in die
  // Highlights scrollt, wandern die Farb-Glows sanft gegeneinander und der
  // Teal-Kern taucht auf – ein weicher, „lebendiger" Übergang statt Standbild.
  const sectionRef = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: sectionRef, offset: ['start end', 'end start'] });
  const blobY1 = useTransform(scrollYProgress, [0, 1], ['-14%', '20%']);
  const blobY2 = useTransform(scrollYProgress, [0, 1], ['18%', '-16%']);
  const goldY = useTransform(scrollYProgress, [0, 1], ['10%', '-22%']);
  const coreOpacity = useTransform(scrollYProgress, [0, 0.42, 1], [0.3, 1, 0.72]);
  const coreScale = useTransform(scrollYProgress, [0, 1], [0.88, 1.16]);

  if (!editMode && items.length === 0 && albums.length === 0) return null;

  return (
    <section ref={sectionRef} className="relative overflow-hidden">
      {/* Animierter Farb-Hintergrund: taucht beim Reinscrollen auf und hebt den
          Bereich deutlich vom schwarzen Rest ab. Die Glows sind zusätzlich an den
          Scroll gekoppelt (Parallaxe) – der Übergang aus dem Hero wirkt lebendig. */}
      <motion.div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true, margin: '-18% 0px' }}
        transition={{ duration: 1, ease: 'easeOut' }}
      >
        <div className="absolute inset-0 bg-[linear-gradient(180deg,#0A1415_0%,#082220_48%,#0A1415_100%)]" />
        <motion.div
          className="absolute inset-0 bg-[radial-gradient(95%_75%_at_50%_-8%,rgba(34,223,201,.24),transparent_62%)]"
          style={{ opacity: coreOpacity, scale: coreScale }}
        />
        {/* Wrapper trägt die Scroll-Parallaxe (y), das Innere die Eigen-Drift –
            getrennt, damit sich die beiden transform-Animationen nicht überschreiben. */}
        <motion.div style={{ y: blobY1 }} className="absolute -top-28 -left-16 w-[440px] h-[440px]">
          <div className="hl-drift-a w-full h-full rounded-full bg-[radial-gradient(circle,rgba(34,223,201,.20),transparent_66%)]" />
        </motion.div>
        <motion.div style={{ y: blobY2 }} className="absolute -bottom-44 -right-12 w-[480px] h-[480px]">
          <div className="hl-drift-b w-full h-full rounded-full bg-[radial-gradient(circle,rgba(88,240,205,.09),transparent_66%)]" />
        </motion.div>
        {/* Warmer Gold-Schein – wandert gegenläufig, bringt Kontrast ins Teal. */}
        <motion.div style={{ y: goldY }} className="absolute top-10 right-[8%] w-[360px] h-[360px]">
          <div className="hl-drift-c w-full h-full rounded-full bg-[radial-gradient(circle,rgba(233,196,106,.12),transparent_66%)]" />
        </motion.div>
      </motion.div>
      {/* Weiche Kanten: der farbige Bereich geht oben und unten sanft in den
          Seiten-Hintergrund (#0A1415) über – kein dunkler Saum, kein harter Schnitt. */}
      <div aria-hidden className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-[#0A1415] to-transparent pointer-events-none" />
      <div aria-hidden className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[#0A1415] via-[rgba(10,20,21,0.85)] to-transparent pointer-events-none" />

      <div className="relative z-[1] max-w-[1320px] mx-auto px-4 sm:px-10 pt-14 sm:pt-20 pb-6 sm:pb-9">
        <Reveal className="flex items-end justify-between gap-4 mb-8">
          <div>
            <div className="inline-flex items-center gap-2 font-sans font-extrabold text-xs tracking-[3px] text-brand-accent-light uppercase">
              <span className="h-[2px] w-6 rounded bg-brand-accent-light shadow-[0_0_10px_rgba(34,223,201,.85)]" />
              Highlights
            </div>
            <h2 className="hl-title-glow mt-3 font-display font-black text-4xl sm:text-6xl leading-[.9] tracking-tight uppercase text-white">
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
          <HighlightsEditor items={editItems} onOpen={open} highlights={highlights} {...handlers} />
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
        items={editMode ? editItems : display}
        index={lightbox.index}
        direction={lightbox.dir}
        onClose={() => setLightbox({ index: null, dir: 0 })}
        onNavigate={(next, dir) => setLightbox({ index: next, dir })}
      />

      {storyAlbum !== null && (
        <StoriesViewer
          albums={albums}
          initialAlbum={storyAlbum}
          onClose={() => setStoryAlbum(null)}
          onOpenAlbum={onOpenAlbum}
        />
      )}
    </section>
  );
}
