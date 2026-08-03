import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Check, Images, ImageIcon } from 'lucide-react';
import type { HighlightsConfig, HighlightMedia } from '../types';

// Auswahl-Dialog: alle bereits hochgeladenen Bilder (aus den losen Highlights und
// allen Ordnern) auf einen Blick. Der Admin wählt beliebig viele aus und fügt sie
// dem aktuellen Ordner hinzu – ohne erneutes Hochladen. Bilder, die im Zielordner
// schon liegen, werden ausgeblendet.
export default function HighlightsMediaPicker({
  highlights,
  excludeUrls,
  onAdd,
  onClose,
}: {
  highlights: HighlightsConfig;
  excludeUrls: Set<string>;
  onAdd: (media: HighlightMedia[]) => void;
  onClose: () => void;
}) {
  // Alle Bild-Medien einsammeln, nach URL entdoppeln, bereits vorhandene raus.
  const candidates = useMemo(() => {
    const all: HighlightMedia[] = [
      ...highlights.items,
      ...highlights.albums.flatMap((a) => a.items),
    ].filter((m) => m.type === 'image');
    const seen = new Set<string>();
    const list: HighlightMedia[] = [];
    for (const m of all) {
      if (excludeUrls.has(m.url) || seen.has(m.url)) continue;
      seen.add(m.url);
      list.push(m);
    }
    return list;
  }, [highlights, excludeUrls]);

  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const toggle = (url: string) => setSelected((s) => ({ ...s, [url]: !s[url] }));
  const selectedUrls = candidates.filter((m) => selected[m.url]);

  const confirm = () => {
    if (selectedUrls.length === 0) return;
    onAdd(selectedUrls);
    onClose();
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-sm p-0 sm:p-6"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-4xl max-h-[92vh] sm:max-h-[85vh] flex flex-col rounded-t-3xl sm:rounded-3xl border border-white/12 bg-brand-dark shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Kopf */}
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <Images className="w-5 h-5 text-brand-accent-light shrink-0" />
            <div className="min-w-0">
              <h3 className="font-display font-black text-lg sm:text-xl uppercase tracking-tight text-white leading-tight">
                Aus Mediathek hinzufügen
              </h3>
              <p className="text-[11px] text-hl-faint font-sans truncate">
                Bereits hochgeladene Bilder – kein doppeltes Hochladen nötig.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Schließen"
            className="w-9 h-9 shrink-0 rounded-full bg-white/[.06] border border-white/15 text-white hover:bg-white/12 flex items-center justify-center cursor-pointer transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Raster */}
        <div className="flex-1 overflow-y-auto p-4">
          {candidates.length === 0 ? (
            <div className="text-center py-16 flex flex-col items-center gap-3">
              <ImageIcon className="w-10 h-10 text-hl-faint" />
              <p className="text-hl-mute font-sans text-sm">
                Keine weiteren Bilder verfügbar. Lade zuerst Bilder hoch.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2 sm:gap-3">
              {candidates.map((m) => {
                const on = !!selected[m.url];
                return (
                  <button
                    key={m.url}
                    type="button"
                    onClick={() => toggle(m.url)}
                    aria-pressed={on}
                    className={`group relative aspect-square rounded-xl overflow-hidden border-2 cursor-pointer transition-colors ${
                      on ? 'border-brand-accent-light' : 'border-white/10 hover:border-white/30'
                    }`}
                  >
                    <img
                      src={m.url}
                      alt={m.caption || 'Bild'}
                      loading="lazy"
                      decoding="async"
                      referrerPolicy="no-referrer"
                      className="absolute inset-0 h-full w-full object-cover"
                    />
                    <div
                      className={`absolute inset-0 transition-colors ${
                        on ? 'bg-brand-accent-light/25' : 'bg-black/0 group-hover:bg-black/20'
                      }`}
                    />
                    <span
                      className={`absolute top-1.5 right-1.5 w-6 h-6 rounded-full border flex items-center justify-center transition-colors ${
                        on
                          ? 'bg-brand-accent-light text-brand-dark border-brand-accent-light'
                          : 'bg-black/50 text-transparent border-white/40'
                      }`}
                    >
                      <Check className="w-4 h-4" />
                    </span>
                    {m.caption && (
                      <span className="absolute inset-x-0 bottom-0 p-1.5 text-left text-[10px] font-sans text-white/90 bg-gradient-to-t from-black/80 to-transparent line-clamp-2">
                        {m.caption}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Fuß */}
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-t border-white/10 shrink-0">
          <span className="text-xs text-hl-mute font-sans">
            {selectedUrls.length > 0 ? `${selectedUrls.length} ausgewählt` : 'Nichts ausgewählt'}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-white/15 text-hl-soft hover:text-white hover:border-white/30 text-xs font-sans font-bold uppercase tracking-wider transition cursor-pointer"
            >
              Abbrechen
            </button>
            <button
              type="button"
              onClick={confirm}
              disabled={selectedUrls.length === 0}
              className="px-4 py-2 rounded-lg bg-brand-accent-light text-brand-dark font-sans font-bold text-xs uppercase tracking-wider hover:brightness-110 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Hinzufügen
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
