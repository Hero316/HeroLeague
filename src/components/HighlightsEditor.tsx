import { useState } from 'react';
import { Plus, Loader2, Link2, Images } from 'lucide-react';
import type { HighlightMedia, HighlightsConfig } from '../types';
import { toEmbed } from '../lib/videoEmbed';
import HighlightThumb from './HighlightThumb';
import HighlightsMediaPicker from './HighlightsMediaPicker';
import { useAddImage } from './highlightsEdit';

// Ruhiger Bearbeiten-Bereich (statisches Masonry) – gut zum Hochladen,
// Verlinken und Beschriften. Wird von Startseite und Galerie geteilt.
export default function HighlightsEditor({
  items,
  onOpen,
  onAddImage,
  onAddVideo,
  onAddExisting,
  onDeleteItem,
  onSetCaption,
  onToggleFeatured,
  highlights,
}: {
  items: HighlightMedia[];
  onOpen: (index: number) => void;
  onAddImage: (url: string, ratio?: number) => void;
  onAddVideo: (url: string) => void;
  onAddExisting?: (media: HighlightMedia[]) => void;
  onDeleteItem: (id: string) => void;
  onSetCaption: (id: string, caption: string) => void;
  onToggleFeatured?: (id: string) => void;
  highlights?: HighlightsConfig; // für die Mediathek-Auswahl (bereits hochgeladene Bilder)
}) {
  const { busy, pick, progress } = useAddImage(onAddImage);
  const [videoInput, setVideoInput] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);

  const addVideo = () => {
    const url = videoInput.trim();
    if (!url) return;
    if (!toEmbed(url)) {
      alert('Link nicht erkannt. Unterstützt: YouTube (Watch/Shorts), Twitch (VOD/Clip/Kanal).');
      return;
    }
    onAddVideo(url);
    setVideoInput('');
  };

  const canPickExisting = !!onAddExisting && !!highlights;

  return (
    <div className="space-y-4">
      {/* Video-Link hinzufügen */}
      <div className="rounded-2xl border border-brand-accent-light/25 bg-brand-accent/5 p-4 space-y-2">
        <label className="flex items-center gap-1.5 text-xs font-bold text-brand-accent-light uppercase tracking-wider">
          <Link2 className="w-3.5 h-3.5" /> Video-Link hinzufügen (YouTube / Twitch, auch Shorts)
        </label>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            value={videoInput}
            onChange={(e) => setVideoInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addVideo()}
            placeholder="z. B. https://youtube.com/shorts/… oder /watch?v=…"
            className="flex-1 bg-brand-dark border border-white/10 rounded-lg px-3 py-2 text-sm text-white font-sans focus:outline-none focus:border-brand-accent-light"
          />
          <button
            onClick={addVideo}
            className="px-4 py-2 rounded-lg bg-brand-accent-light text-brand-dark font-sans font-bold text-xs uppercase tracking-wider hover:brightness-110 transition cursor-pointer"
          >
            Video hinzufügen
          </button>
        </div>
        <p className="text-[11px] text-hl-faint font-sans">
          Tipp: Videos auf YouTube als „Nicht gelistet“ hochladen (nicht „Privat“) – nur so sind sie einbettbar. Fotos werden
          beim Hochladen automatisch komprimiert (wenig Speicher). Mehrere Bilder auf einmal möglich. Mit dem
          <span className="mx-1 inline-flex align-middle text-brand-accent-light">★ Stern</span>
          wählst du, was im Karussell auf der Startseite erscheint. Änderungen sind sofort gespeichert.
        </p>
      </div>

      {/* Kacheln: Bild-Upload + alle Medien mit Löschen & Beschriftung */}
      <div className="columns-2 sm:columns-3 lg:columns-4 gap-3 sm:gap-4">
        <div className="break-inside-avoid mb-3 sm:mb-4 space-y-3 sm:space-y-4">
          <button
            type="button"
            onClick={pick}
            disabled={busy}
            className="aspect-[4/3] w-full rounded-2xl border-2 border-dashed border-brand-accent-light/40 bg-brand-accent/5 hover:bg-brand-accent/10 hover:border-brand-accent-light/70 transition-colors flex flex-col items-center justify-center gap-2 text-brand-accent-light cursor-pointer disabled:opacity-60"
          >
            {busy ? <Loader2 className="w-7 h-7 animate-spin" /> : <Plus className="w-7 h-7" />}
            <span className="font-sans font-bold text-xs uppercase tracking-wider text-center px-2">
              {busy
                ? progress
                  ? `Lädt hoch… ${progress.done}/${progress.total}`
                  : 'Lädt hoch…'
                : 'Bilder hochladen'}
            </span>
          </button>

          {canPickExisting && (
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              className="w-full rounded-2xl border border-white/12 bg-white/[.03] hover:bg-white/[.06] hover:border-white/25 transition-colors flex items-center justify-center gap-2 py-3 text-hl-soft hover:text-white cursor-pointer"
            >
              <Images className="w-4 h-4" />
              <span className="font-sans font-bold text-xs uppercase tracking-wider">Aus Mediathek</span>
            </button>
          )}
        </div>

        {items.map((media, i) => (
          <div key={media.id} className="break-inside-avoid mb-3 sm:mb-4">
            <HighlightThumb
              media={media}
              onOpen={() => onOpen(i)}
              editMode
              onDelete={() => onDeleteItem(media.id)}
              onSetCaption={(caption) => onSetCaption(media.id, caption)}
              onToggleFeatured={onToggleFeatured ? () => onToggleFeatured(media.id) : undefined}
            />
          </div>
        ))}
      </div>

      {pickerOpen && canPickExisting && (
        <HighlightsMediaPicker
          highlights={highlights!}
          excludeUrls={new Set(items.map((m) => m.url))}
          onAdd={(media) => onAddExisting!(media)}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  );
}
