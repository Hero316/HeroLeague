import { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import type { HighlightMedia } from '../types';
import { toEmbed, embedRatio } from '../lib/videoEmbed';
import HighlightThumb from './HighlightThumb';

const GAP = 12; // px – muss zur gap-Klasse passen
const ROW = 8; // px – feine Zeilen-Einheit für die Höhen-Spans

// Spaltenanzahl responsiv (2 / 3 / 4).
function useColumnCount() {
  const [n, setN] = useState(3);
  useEffect(() => {
    const calc = () => setN(window.innerWidth >= 1024 ? 4 : window.innerWidth >= 640 ? 3 : 2);
    calc();
    window.addEventListener('resize', calc);
    return () => window.removeEventListener('resize', calc);
  }, []);
  return n;
}

// Videos gleichmäßig zwischen die Bilder verteilen, damit sie nicht am Ende
// klumpen. Speicherreihenfolge bleibt unberührt – das hier ist nur die Anzeige.
export function interleaveMedia(items: HighlightMedia[]): HighlightMedia[] {
  const imgs = items.filter((m) => m.type === 'image');
  const vids = items.filter((m) => m.type === 'video');
  if (vids.length === 0 || imgs.length === 0) return items;

  const out: HighlightMedia[] = [];
  const step = Math.max(1, Math.floor(imgs.length / (vids.length + 1)));
  let vi = 0;
  imgs.forEach((img, idx) => {
    out.push(img);
    if (vi < vids.length && (idx + 1) % step === 0) out.push(vids[vi++]);
  });
  while (vi < vids.length) out.push(vids[vi++]);
  return out;
}

function ratioOf(media: HighlightMedia): number {
  if (media.type === 'video') {
    const embed = toEmbed(media.url);
    return embed ? embedRatio(embed) : 16 / 9;
  }
  return media.ratio && media.ratio > 0 ? media.ratio : 1;
}

// Eine Mosaik-Kachel: misst die echte Inhaltshöhe (offsetHeight, transformunabhängig)
// und setzt daraus den Zeilen-Span → kein Zuschnitt, dichte Packung.
function MosaicItem({
  media,
  colSpan,
  onOpen,
  reduce,
}: {
  media: HighlightMedia;
  colSpan: number;
  onOpen: () => void;
  reduce: boolean;
}) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [rowSpan, setRowSpan] = useState(28);

  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const measure = () => {
      const h = el.offsetHeight;
      if (h > 0) setRowSpan(Math.max(1, Math.round((h + GAP) / (ROW + GAP))));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <motion.div
      style={{ gridColumn: `span ${colSpan}`, gridRowEnd: `span ${rowSpan}` }}
      initial={reduce ? false : { opacity: 0, y: 40, scale: 0.94 }}
      whileInView={reduce ? undefined : { opacity: 1, y: 0, scale: 1 }}
      viewport={{ once: true, margin: '-6% 0px' }}
      transition={{ type: 'spring', stiffness: 130, damping: 20, mass: 0.7 }}
    >
      <motion.div
        ref={contentRef}
        whileHover={reduce ? undefined : { y: -5 }}
        className="rounded-2xl transition-shadow duration-300 hover:shadow-2xl hover:shadow-brand-accent-light/10"
      >
        <HighlightThumb media={media} onOpen={onOpen} editMode={false} onDelete={() => {}} onSetCaption={() => {}} />
      </motion.div>
    </motion.div>
  );
}

// Modernes Mosaik: Kacheln mal breit (2 Spalten), mal hoch, mal klein – je nach
// Medienformat, dicht ineinander gepackt (grid-auto-flow: dense), ohne Zuschnitt.
export default function HighlightsMosaic({
  items,
  onOpen,
}: {
  items: HighlightMedia[];
  onOpen: (index: number) => void;
}) {
  const reduce = useReducedMotion();
  const cols = useColumnCount();

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
        gap: `${GAP}px`,
        gridAutoRows: `${ROW}px`,
        gridAutoFlow: 'row dense',
      }}
    >
      {items.map((media, i) => {
        const ratio = ratioOf(media);
        // Breite Kacheln (2 Spalten) nur ab 3 Spalten und für sehr breite Medien/Videos.
        const colSpan = cols >= 3 && ratio >= 1.5 ? 2 : 1;
        return (
          <MosaicItem key={media.id} media={media} colSpan={colSpan} onOpen={() => onOpen(i)} reduce={reduce} />
        );
      })}
    </div>
  );
}
