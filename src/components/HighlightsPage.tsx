import { useState } from 'react';
import { Plus, Trash2, ImageIcon, Loader2 } from 'lucide-react';
import type { HighlightImage } from '../types';
import { PageHeader } from './ui';
import { Reveal, RevealGroup, RevealItem } from './anim';
import HighlightsLightbox from './HighlightsLightbox';
import { useAddImage } from './highlightsEdit';

// Öffentliche Highlights-Seite: Foto-Galerie mit Wisch-Lightbox. Im Bearbeiten-
// Modus (nur Admin) lassen sich Bilder direkt hier hochladen und löschen.
export default function HighlightsPage({
  images,
  editMode,
  onAddImage,
  onDeleteImage,
}: {
  images: HighlightImage[];
  editMode: boolean;
  onAddImage: (url: string) => void;
  onDeleteImage: (id: string) => void;
}) {
  const [lightbox, setLightbox] = useState<{ index: number | null; dir: number }>({ index: null, dir: 0 });
  const { busy, pick } = useAddImage(onAddImage);

  const open = (i: number) => setLightbox({ index: i, dir: 0 });

  return (
    <>
      <PageHeader
        kicker="HERO LEAGUE"
        title="Highlights"
        text="Die besten Momente der Liga — festgehalten mit unserer Kamera."
      />

      <div className="max-w-[1320px] mx-auto px-4 sm:px-10 pb-16">
        {images.length === 0 && !editMode ? (
          <div className="text-center py-20 flex flex-col items-center gap-3">
            <ImageIcon className="w-10 h-10 text-hl-faint" />
            <p className="text-hl-mute font-sans">Noch keine Highlights vorhanden.</p>
          </div>
        ) : (
          <RevealGroup className="columns-2 sm:columns-3 lg:columns-4 gap-3 sm:gap-4">
            {editMode && (
              <RevealItem className="break-inside-avoid mb-3 sm:mb-4">
                <button
                  type="button"
                  onClick={pick}
                  disabled={busy}
                  className="aspect-[4/3] w-full rounded-2xl border-2 border-dashed border-brand-accent-light/40 bg-brand-accent/5 hover:bg-brand-accent/10 hover:border-brand-accent-light/70 transition-colors flex flex-col items-center justify-center gap-2 text-brand-accent-light cursor-pointer disabled:opacity-60"
                >
                  {busy ? <Loader2 className="w-7 h-7 animate-spin" /> : <Plus className="w-7 h-7" />}
                  <span className="font-sans font-bold text-xs uppercase tracking-wider">
                    {busy ? 'Lädt hoch…' : 'Bild hinzufügen'}
                  </span>
                </button>
              </RevealItem>
            )}

            {images.map((img, i) => (
              <RevealItem key={img.id} className="break-inside-avoid mb-3 sm:mb-4">
                {/* Masonry: jedes Bild in seinem echten Seitenverhältnis, komplett sichtbar */}
                <div className="group relative rounded-2xl overflow-hidden bg-white/[.03] border border-white/[.07]">
                  <button
                    type="button"
                    onClick={() => open(i)}
                    className="block w-full cursor-zoom-in"
                    aria-label="Bild vergrößern"
                  >
                    <img
                      src={img.url}
                      alt={img.caption || 'Highlight'}
                      loading="lazy"
                      decoding="async"
                      referrerPolicy="no-referrer"
                      className="block w-full h-auto transition-transform duration-500 group-hover:scale-[1.03]"
                    />
                  </button>
                  {editMode && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteImage(img.id);
                      }}
                      title="Bild löschen"
                      aria-label="Bild löschen"
                      className="absolute top-2 right-2 z-10 w-9 h-9 rounded-full bg-black/60 border border-white/20 text-white hover:bg-red-500/80 flex items-center justify-center cursor-pointer transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </RevealItem>
            ))}
          </RevealGroup>
        )}

        {editMode && (
          <Reveal className="mt-6">
            <p className="text-xs text-hl-faint font-sans">
              Fotos werden beim Hochladen automatisch komprimiert (WebP). Änderungen sind sofort gespeichert.
            </p>
          </Reveal>
        )}
      </div>

      <HighlightsLightbox
        images={images}
        index={lightbox.index}
        direction={lightbox.dir}
        onClose={() => setLightbox({ index: null, dir: 0 })}
        onNavigate={(next, dir) => setLightbox({ index: next, dir })}
      />
    </>
  );
}
