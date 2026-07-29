import { useMemo, useState } from 'react';
import { ImageIcon } from 'lucide-react';
import type { HighlightMedia } from '../types';
import { PageHeader } from './ui';
import HighlightsLightbox from './HighlightsLightbox';
import HighlightsMosaic, { interleaveMedia } from './HighlightsMosaic';
import HighlightsEditor from './HighlightsEditor';

// Öffentliche Highlights-Seite: gemischtes Medien-Mosaik (Bilder + Videos) mit
// Lightbox. Im Bearbeiten-Modus (nur Admin) ruhige Verwaltung.
export default function HighlightsPage({
  items,
  editMode,
  onAddImage,
  onAddVideo,
  onDeleteItem,
  onSetCaption,
}: {
  items: HighlightMedia[];
  editMode: boolean;
  onAddImage: (url: string, ratio?: number) => void;
  onAddVideo: (url: string) => void;
  onDeleteItem: (id: string) => void;
  onSetCaption: (id: string, caption: string) => void;
}) {
  const [lightbox, setLightbox] = useState<{ index: number | null; dir: number }>({ index: null, dir: 0 });
  // Anzeige-Reihenfolge: im Bearbeiten-Modus Speicherreihenfolge, sonst gemischt.
  const display = useMemo(() => (editMode ? items : interleaveMedia(items)), [items, editMode]);
  const open = (i: number) => setLightbox({ index: i, dir: 0 });

  return (
    <>
      <PageHeader kicker="HERO LEAGUE" title="Highlights" />

      <div className="max-w-[1320px] mx-auto px-4 sm:px-10 pb-16">
        {items.length === 0 && !editMode ? (
          <div className="text-center py-20 flex flex-col items-center gap-3">
            <ImageIcon className="w-10 h-10 text-hl-faint" />
            <p className="text-hl-mute font-sans">Noch keine Highlights vorhanden.</p>
          </div>
        ) : editMode ? (
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
      </div>

      <HighlightsLightbox
        items={display}
        index={lightbox.index}
        direction={lightbox.dir}
        onClose={() => setLightbox({ index: null, dir: 0 })}
        onNavigate={(next, dir) => setLightbox({ index: next, dir })}
      />
    </>
  );
}
