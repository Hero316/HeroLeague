import { useEffect, useMemo, useState } from 'react';
import { ImageIcon, ArrowLeft, FolderPlus, Trash2, Images, ImagePlus, Loader2 } from 'lucide-react';
import type { HighlightsConfig } from '../types';
import { PageHeader } from './ui';
import { Reveal } from './anim';
import HighlightsLightbox from './HighlightsLightbox';
import HighlightsMosaic from './HighlightsMosaic';
import HighlightsEditor from './HighlightsEditor';
import { mediaListHandlers, genAlbumId, useCoverUpload, albumCoverInfo, newestFirst } from './highlightsEdit';

// Ordner-Titel bearbeiten: lokaler State (flüssiges Tippen), speichern erst beim
// Verlassen des Feldes – kein Netzwerk-Aufruf pro Tastendruck.
function AlbumTitleField({ title, onRename }: { title: string; onRename: (t: string) => void }) {
  const [val, setVal] = useState(title);
  return (
    <input
      value={val}
      onChange={(e) => setVal(e.target.value)}
      onBlur={() => {
        const t = val.trim();
        if (t && t !== title) onRename(t);
        else if (!t) setVal(title);
      }}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      placeholder="Ordnername (z. B. Spieltag 1)"
      className="block w-full max-w-xl bg-transparent border-b border-white/15 focus:border-brand-accent-light outline-none font-display font-black text-4xl sm:text-6xl uppercase tracking-tight text-white pb-1 placeholder:text-white/25"
    />
  );
}

// Cover eines Ordners hochladen/ändern (wie ein Wappen: transparentes Design,
// komprimiert). Ohne Cover greift automatisch das erste Bild/Video-Vorschau.
function AlbumCoverControl({
  cover,
  onSet,
  onClear,
}: {
  cover?: string;
  onSet: (url: string) => void;
  onClear: () => void;
}) {
  const { busy, pick } = useCoverUpload(onSet);
  return (
    <div className="flex items-center gap-3 mb-4 flex-wrap">
      <span className="w-14 h-14 rounded-full overflow-hidden bg-white/[.05] border border-white/12 grid place-items-center shrink-0">
        {cover ? (
          <img src={cover} alt="Cover" referrerPolicy="no-referrer" className="w-full h-full object-contain p-1.5" />
        ) : (
          <ImagePlus className="w-5 h-5 text-hl-mute" />
        )}
      </span>
      <button
        onClick={pick}
        disabled={busy}
        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-white/12 text-hl-soft hover:text-white hover:border-white/25 text-xs font-sans font-bold uppercase tracking-wider transition cursor-pointer disabled:opacity-60"
      >
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImagePlus className="w-4 h-4" />}
        {busy ? 'Lädt…' : cover ? 'Cover ändern' : 'Cover hochladen'}
      </button>
      {cover && (
        <button
          onClick={onClear}
          className="px-3.5 py-2 rounded-lg border border-white/12 text-hl-mute hover:text-white text-xs font-sans font-bold uppercase tracking-wider transition cursor-pointer"
        >
          Entfernen
        </button>
      )}
      <span className="text-[11px] text-hl-faint font-sans">
        Rundes Design ohne Hintergrund (PNG) – wird wie ein Wappen gezeigt.
      </span>
    </div>
  );
}

// Öffentliche Highlights-Seite: oben die losen Highlights (Mosaik), darunter
// Ordner (z. B. je Spieltag). Ein Klick öffnet den Ordner mit demselben Prinzip.
export default function HighlightsPage({
  highlights,
  editMode,
  onSave,
  initialAlbumId = null,
  onInitialAlbumConsumed,
}: {
  highlights: HighlightsConfig;
  editMode: boolean;
  onSave: (next: HighlightsConfig) => void;
  initialAlbumId?: string | null; // aus der Story-Ansicht: diesen Ordner direkt öffnen
  onInitialAlbumConsumed?: () => void;
}) {
  const { items, albums } = highlights;
  // Direkt aufgeklappt starten, wenn aus der Story-Ansicht ein Ordner geöffnet wurde.
  const [openAlbumId, setOpenAlbumId] = useState<string | null>(
    initialAlbumId && albums.some((a) => a.id === initialAlbumId) ? initialAlbumId : null
  );

  // Den „Start-Ordner“ nur einmal verwenden, damit ein späterer Aufruf der
  // Galerie über das Menü wieder auf der Übersicht landet.
  useEffect(() => {
    if (initialAlbumId) onInitialAlbumConsumed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [lightbox, setLightbox] = useState<{ index: number | null; dir: number }>({ index: null, dir: 0 });

  const openAlbum = albums.find((a) => a.id === openAlbumId) ?? null;
  const activeItems = openAlbum ? openAlbum.items : items;
  // Strikt neueste zuerst – egal ob Bild oder Video. Kein Umsortieren nach
  // Medientyp mehr, damit ein frisch hinzugefügter Beitrag immer ganz vorne steht.
  const display = useMemo(() => newestFirst(activeItems), [activeItems]);
  const open = (i: number) => setLightbox({ index: i, dir: 0 });

  // Medien-Handler für die gerade aktive Liste (lose Highlights ODER offener Ordner).
  const setActive = (next: HighlightsConfig['items']) =>
    openAlbum
      ? onSave({ ...highlights, albums: albums.map((a) => (a.id === openAlbum.id ? { ...a, items: next } : a)) })
      : onSave({ ...highlights, items: next });
  const handlers = mediaListHandlers(activeItems, setActive);

  const goAlbum = (id: string | null) => {
    setOpenAlbumId(id);
    setLightbox({ index: null, dir: 0 });
    window.scrollTo({ top: 0 });
  };

  const createAlbum = () => {
    const id = genAlbumId();
    onSave({ ...highlights, albums: [...albums, { id, title: 'Neuer Ordner', items: [] }] });
    goAlbum(id);
  };
  const renameAlbum = (id: string, title: string) =>
    onSave({ ...highlights, albums: albums.map((a) => (a.id === id ? { ...a, title: title.trim() || 'Ordner' } : a)) });
  const setAlbumCover = (id: string, cover: string | undefined) =>
    onSave({ ...highlights, albums: albums.map((a) => (a.id === id ? { ...a, cover: cover || undefined } : a)) });
  const deleteAlbum = (id: string) => {
    if (!confirm('Diesen Ordner mit allen Inhalten löschen?')) return;
    onSave({ ...highlights, albums: albums.filter((a) => a.id !== id) });
    if (openAlbumId === id) goAlbum(null);
  };

  const lightboxEl = (
    <HighlightsLightbox
      items={display}
      index={lightbox.index}
      direction={lightbox.dir}
      onClose={() => setLightbox({ index: null, dir: 0 })}
      onNavigate={(next, dir) => setLightbox({ index: next, dir })}
    />
  );

  // ---------- ORDNER-ANSICHT ----------
  if (openAlbum) {
    return (
      <>
        <div className="max-w-[1320px] mx-auto px-4 sm:px-10 pt-8 sm:pt-10">
          <button
            onClick={() => goAlbum(null)}
            className="inline-flex items-center gap-1.5 text-xs font-sans font-bold uppercase tracking-wider text-brand-accent-light hover:underline cursor-pointer mb-4"
          >
            <ArrowLeft className="w-4 h-4" /> Zurück zu Highlights
          </button>
          {editMode && (
            <AlbumCoverControl
              key={`cover-${openAlbum.id}`}
              cover={openAlbum.cover}
              onSet={(url) => setAlbumCover(openAlbum.id, url)}
              onClear={() => setAlbumCover(openAlbum.id, undefined)}
            />
          )}
          {editMode ? (
            <AlbumTitleField
              key={openAlbum.id}
              title={openAlbum.title}
              onRename={(t) => renameAlbum(openAlbum.id, t)}
            />
          ) : (
            <h1 className="font-display font-black text-4xl sm:text-6xl leading-[.9] tracking-tight uppercase text-white">
              {openAlbum.title}
            </h1>
          )}
        </div>

        <div className="max-w-[1320px] mx-auto px-4 sm:px-10 py-8 pb-16">
          {openAlbum.items.length === 0 && !editMode ? (
            <div className="text-center py-16 flex flex-col items-center gap-3">
              <ImageIcon className="w-10 h-10 text-hl-faint" />
              <p className="text-hl-mute font-sans">Dieser Ordner ist noch leer.</p>
            </div>
          ) : editMode ? (
            <HighlightsEditor items={display} onOpen={open} highlights={highlights} {...handlers} />
          ) : (
            <HighlightsMosaic items={display} onOpen={open} />
          )}
        </div>
        {lightboxEl}
      </>
    );
  }

  // ---------- ÜBERSICHT ----------
  const nothing = items.length === 0 && albums.length === 0 && !editMode;

  return (
    <>
      <PageHeader kicker="HERO LEAGUE" title="Highlights" />

      <div className="max-w-[1320px] mx-auto px-4 sm:px-10 pb-16 space-y-12">
        {nothing ? (
          <div className="text-center py-20 flex flex-col items-center gap-3">
            <ImageIcon className="w-10 h-10 text-hl-faint" />
            <p className="text-hl-mute font-sans">Noch keine Highlights vorhanden.</p>
          </div>
        ) : (
          <>
            {/* Lose Highlights */}
            {(items.length > 0 || editMode) && (
              <section>
                {editMode ? (
                  <HighlightsEditor items={display} onOpen={open} highlights={highlights} {...handlers} />
                ) : (
                  <HighlightsMosaic items={display} onOpen={open} />
                )}
              </section>
            )}

            {/* Ordner / Spieltage */}
            {(albums.length > 0 || editMode) && (
              <section>
                <div className="flex items-center justify-between gap-4 mb-5">
                  <h2 className="font-display font-black text-2xl sm:text-4xl uppercase tracking-tight text-white flex items-center gap-2.5">
                    <Images className="w-6 h-6 text-brand-accent-light" /> Ordner
                  </h2>
                  {editMode && (
                    <button
                      onClick={createAlbum}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-brand-accent-light text-brand-dark font-sans font-bold text-xs uppercase tracking-wider hover:brightness-110 transition cursor-pointer"
                    >
                      <FolderPlus className="w-4 h-4" /> Neuer Ordner
                    </button>
                  )}
                </div>

                {albums.length === 0 ? (
                  <p className="text-hl-mute font-sans text-sm">
                    Noch keine Ordner. Lege z. B. je Spieltag einen an – mit den besten Bildern und Videos.
                  </p>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
                    {newestFirst(albums).map((album) => {
                      const c = albumCoverInfo(album);
                      return (
                        <Reveal key={album.id}>
                          <div className="group relative overflow-hidden rounded-2xl border border-white/[.08] bg-white/[.03] shadow-lg shadow-black/25">
                            <button
                              type="button"
                              onClick={() => goAlbum(album.id)}
                              className="block w-full cursor-pointer"
                              aria-label={`Ordner ${album.title} öffnen`}
                            >
                              <div className="relative aspect-[4/3] bg-[linear-gradient(140deg,#0d1a19,#06100f)]">
                                {c && (
                                  <img
                                    src={c.url}
                                    alt={album.title}
                                    loading="lazy"
                                    decoding="async"
                                    referrerPolicy="no-referrer"
                                    className={`absolute inset-0 h-full w-full transition-transform duration-500 group-hover:scale-105 ${
                                      c.custom ? 'object-contain p-6' : 'object-cover'
                                    }`}
                                  />
                                )}
                                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                                {/* „Ordner“-Stapel-Optik */}
                                <span className="absolute top-2 right-2 rounded-full bg-black/55 border border-white/15 px-2 py-0.5 text-[10px] font-mono text-white/85">
                                  {album.items.length}
                                </span>
                                <div className="absolute inset-x-0 bottom-0 p-3 sm:p-4">
                                  <div className="mb-1 h-0.5 w-6 rounded bg-brand-accent-light shadow-[0_0_8px_rgba(34,223,201,.6)]" />
                                  <span className="block font-display font-black text-white uppercase tracking-tight leading-[1.05] line-clamp-2 text-sm sm:text-base">
                                    {album.title}
                                  </span>
                                </div>
                              </div>
                            </button>
                            {editMode && (
                              <button
                                type="button"
                                onClick={() => deleteAlbum(album.id)}
                                title="Ordner löschen"
                                aria-label="Ordner löschen"
                                className="absolute top-2 left-2 z-10 w-8 h-8 rounded-full bg-black/60 border border-white/20 text-white hover:bg-red-500/80 flex items-center justify-center cursor-pointer transition-colors"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </Reveal>
                      );
                    })}
                  </div>
                )}
              </section>
            )}
          </>
        )}
      </div>
      {lightboxEl}
    </>
  );
}
