import { Images } from 'lucide-react';
import type { HighlightAlbum } from '../types';
import { albumCoverInfo } from './highlightsEdit';

// Instagram-artige runde „Highlight“-Pillen: je Ordner ein Kreis mit Farbring +
// Cover + Name. Eigenes Cover (transparentes Design) wird wie ein Wappen in
// seiner Form gezeigt (object-contain), sonst füllt ein Foto den Kreis.
export default function StoryPills({
  albums,
  onOpen,
}: {
  albums: HighlightAlbum[];
  onOpen: (index: number) => void;
}) {
  return (
    <div className="flex gap-4 sm:gap-5 overflow-x-auto pb-1 -mx-1 px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {albums.map((album, i) => {
        const c = albumCoverInfo(album);
        return (
          <button
            key={album.id}
            type="button"
            onClick={() => onOpen(i)}
            className="group flex flex-col items-center gap-2 shrink-0 w-[76px] cursor-pointer"
          >
            <span className="p-[3px] rounded-full bg-[conic-gradient(from_180deg,#22DFC9,#43E5A0,#E9C46A,#22DFC9)] transition-transform duration-200 group-hover:scale-105">
              <span className="block p-[2.5px] rounded-full bg-brand-dark">
                <span className="block w-16 h-16 rounded-full overflow-hidden bg-white/[.05]">
                  {c ? (
                    <img
                      src={c.url}
                      alt={album.title}
                      loading="lazy"
                      decoding="async"
                      referrerPolicy="no-referrer"
                      className={`w-full h-full ${c.custom ? 'object-contain p-1.5' : 'object-cover'}`}
                    />
                  ) : (
                    <span className="w-full h-full grid place-items-center text-brand-accent-light">
                      <Images className="w-6 h-6" />
                    </span>
                  )}
                </span>
              </span>
            </span>
            <span className="w-full text-center text-[11px] font-sans font-semibold text-hl-soft leading-tight line-clamp-1">
              {album.title}
            </span>
          </button>
        );
      })}
    </div>
  );
}
