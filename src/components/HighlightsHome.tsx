import { useState } from 'react';
import { ArrowRight, Plus, Link2, Loader2, Film } from 'lucide-react';
import type { HighlightsConfig } from '../types';
import { toEmbed } from '../lib/videoEmbed';
import { Reveal } from './anim';
import HighlightClip from './HighlightClip';
import HighlightsLightbox from './HighlightsLightbox';
import HighlightThumb from './HighlightThumb';
import { useAddImage } from './highlightsEdit';

// Startseiten-Highlight-Bereich: ein Clip (YouTube/Twitch, auch Shorts hochkant)
// plus die ersten Fotos der Galerie. Im Bearbeiten-Modus (Admin) direkt editierbar.
export default function HighlightsHome({
  highlights,
  editMode,
  onOpenGallery,
  onAddImage,
  onDeleteImage,
  onSetClip,
  onSetCaption,
}: {
  highlights: HighlightsConfig;
  editMode: boolean;
  onOpenGallery: () => void;
  onAddImage: (url: string) => void;
  onDeleteImage: (id: string) => void;
  onSetClip: (url: string) => void;
  onSetCaption: (id: string, caption: string) => void;
}) {
  const images = highlights.images;
  const homeImages = images.slice(0, 4);
  const embed = toEmbed(highlights.clip?.url);
  const [lightbox, setLightbox] = useState<{ index: number | null; dir: number }>({ index: null, dir: 0 });
  const [clipInput, setClipInput] = useState(highlights.clip?.url ?? '');
  const { busy, pick } = useAddImage(onAddImage);

  // Nichts pflegen + nicht im Bearbeiten-Modus => Bereich bleibt unsichtbar.
  if (!editMode && !embed && homeImages.length === 0) return null;

  const isPortrait = embed?.aspect === 'portrait';

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
          {images.length > 0 && (
            <button
              onClick={onOpenGallery}
              className="hidden sm:inline-flex items-center gap-1.5 shrink-0 px-4 py-2 rounded-full border border-white/12 text-hl-soft hover:text-white hover:border-white/25 text-xs font-sans font-bold uppercase tracking-wider transition-colors cursor-pointer"
            >
              Alle ansehen
              <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </Reveal>

        {/* Bearbeiten: Clip-Link pflegen */}
        {editMode && (
          <div className="mb-6 rounded-2xl border border-brand-accent-light/25 bg-brand-accent/5 p-4 space-y-2">
            <label className="flex items-center gap-1.5 text-xs font-bold text-brand-accent-light uppercase tracking-wider">
              <Link2 className="w-3.5 h-3.5" /> Highlight-Clip (YouTube / Twitch)
            </label>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                value={clipInput}
                onChange={(e) => setClipInput(e.target.value)}
                placeholder="z. B. https://youtube.com/shorts/… oder /watch?v=…"
                className="flex-1 bg-brand-dark border border-white/10 rounded-lg px-3 py-2 text-sm text-white font-sans focus:outline-none focus:border-brand-accent-light"
              />
              <button
                onClick={() => onSetClip(clipInput.trim())}
                className="px-4 py-2 rounded-lg bg-brand-accent-light text-brand-dark font-sans font-bold text-xs uppercase tracking-wider hover:brightness-110 transition cursor-pointer"
              >
                Übernehmen
              </button>
              {highlights.clip?.url && (
                <button
                  onClick={() => {
                    setClipInput('');
                    onSetClip('');
                  }}
                  className="px-4 py-2 rounded-lg border border-white/12 text-hl-mute hover:text-white text-xs font-sans font-bold uppercase tracking-wider transition cursor-pointer"
                >
                  Entfernen
                </button>
              )}
            </div>
            {highlights.clip?.url && !embed && (
              <p className="text-xs text-hl-red-soft font-sans">
                Link nicht erkannt. Unterstützt: YouTube (Watch/Shorts), Twitch (VOD/Clip/Kanal).
              </p>
            )}
            <p className="text-[11px] text-hl-faint font-sans">
              Tipp: Videos auf YouTube als „Nicht gelistet“ hochladen (nicht „Privat“) – nur so sind sie einbettbar.
            </p>
          </div>
        )}

        <div className={`grid gap-6 ${embed && homeImages.length > 0 ? 'lg:grid-cols-[1.4fr_1fr]' : 'grid-cols-1'}`}>
          {/* Clip */}
          {embed && (
            <Reveal className={isPortrait ? 'flex justify-center' : ''}>
              <div
                className={`relative overflow-hidden rounded-2xl border border-white/10 bg-black shadow-xl ${
                  isPortrait ? 'aspect-[9/16] h-[68vh] max-h-[600px]' : 'w-full aspect-video'
                }`}
              >
                <HighlightClip embed={embed} />
              </div>
            </Reveal>
          )}

          {/* Fotos (erste 4) */}
          {(homeImages.length > 0 || editMode) && (
            <Reveal>
              <div className={`gap-3 ${embed ? 'columns-2' : 'columns-2 sm:columns-4'}`}>
                {editMode && (
                  <button
                    type="button"
                    onClick={pick}
                    disabled={busy}
                    className="break-inside-avoid mb-3 aspect-[4/3] w-full rounded-xl border-2 border-dashed border-brand-accent-light/40 bg-brand-accent/5 hover:bg-brand-accent/10 transition-colors flex flex-col items-center justify-center gap-1.5 text-brand-accent-light cursor-pointer disabled:opacity-60"
                  >
                    {busy ? <Loader2 className="w-6 h-6 animate-spin" /> : <Plus className="w-6 h-6" />}
                    <span className="font-sans font-bold text-[10px] uppercase tracking-wider">Bild</span>
                  </button>
                )}

                {homeImages.map((img, i) => (
                  <div key={img.id} className="break-inside-avoid mb-3">
                    <HighlightThumb
                      image={img}
                      onOpen={() => setLightbox({ index: i, dir: 0 })}
                      editMode={editMode}
                      onDelete={() => onDeleteImage(img.id)}
                      onSetCaption={(caption) => onSetCaption(img.id, caption)}
                      compact
                    />
                  </div>
                ))}
              </div>
            </Reveal>
          )}
        </div>

        {/* leerer Zustand im Bearbeiten-Modus */}
        {editMode && !embed && homeImages.length === 0 && (
          <div className="mt-4 flex items-center gap-2 text-hl-faint text-sm font-sans">
            <Film className="w-4 h-4" /> Füge oben einen Clip-Link ein oder lade Fotos hoch.
          </div>
        )}
      </div>

      <HighlightsLightbox
        images={images}
        index={lightbox.index}
        direction={lightbox.dir}
        onClose={() => setLightbox({ index: null, dir: 0 })}
        onNavigate={(next, dir) => setLightbox({ index: next, dir })}
      />
    </section>
  );
}
