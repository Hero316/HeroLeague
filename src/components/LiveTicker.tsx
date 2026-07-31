import React, { useLayoutEffect, useRef, useState } from 'react';
import { NewsItem } from '../types';

interface LiveTickerProps {
  news?: NewsItem[];
}

// Lauftempo des Bandes in Pixel pro Sekunde (größer = schneller).
const SPEED = 95;

// Laufband unter der Navigation: zeigt ausschließlich die im Admin gepflegten
// News (keine Spieldaten mehr). Ohne News wird das Band gar nicht angezeigt.
//
// Echte Endlosschleife: Der Inhalt wird so oft wiederholt, dass eine „Gruppe"
// immer breiter als die Leiste ist. Zwei identische Gruppen laufen nebeneinander
// und werden um genau eine Gruppenbreite (-50 %) verschoben – dadurch nahtlos,
// ohne Sprung oder Lücke, egal wie kurz oder lang die News sind.
export default function LiveTicker({ news = [] }: LiveTickerProps) {
  const items = news.map((n) => n.text.trim()).filter(Boolean);

  const viewportRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState<{ copies: number; duration: number }>({ copies: 2, duration: 16 });

  const key = items.join('¦');
  useLayoutEffect(() => {
    if (items.length === 0) return;
    const compute = () => {
      const vw = viewportRef.current?.clientWidth ?? 0;
      const base = measureRef.current?.scrollWidth ?? 0; // Breite EINER Sequenz
      if (!vw || !base) return;
      // So viele Wiederholungen, dass eine Gruppe sicher breiter als die Leiste ist.
      const copies = Math.max(1, Math.ceil(vw / base) + 1);
      const duration = Math.max(6, (base * copies) / SPEED);
      setLayout((prev) => (prev.copies === copies && Math.abs(prev.duration - duration) < 0.1 ? prev : { copies, duration }));
    };
    compute();
    const ro = new ResizeObserver(compute);
    if (viewportRef.current) ro.observe(viewportRef.current);
    return () => ro.disconnect();
  }, [key]);

  if (items.length === 0) return null;

  const renderItems = (prefix: string) =>
    items.map((text, i) => (
      <React.Fragment key={`${prefix}-${i}`}>
        <span className="font-sans font-extrabold text-[12.5px] tracking-[.4px] text-brand-accent-light pl-6">
          📣 {text}
        </span>
        <span className="px-4 text-hl-faint" aria-hidden="true">✦</span>
      </React.Fragment>
    ));

  // Eine Gruppe = Inhalt so oft wiederholt, dass sie die Leiste sicher füllt.
  const group = (g: string) => (
    <div className="flex flex-none items-center" aria-hidden={g !== 'g0'}>
      {Array.from({ length: layout.copies }).map((_, c) => (
        <React.Fragment key={`${g}-${c}`}>{renderItems(`${g}-${c}`)}</React.Fragment>
      ))}
    </div>
  );

  return (
    <div className="border-b border-white/[.06] bg-white/[.015] overflow-hidden">
      <div className="flex items-center h-[42px]">
        <div className="flex-none flex items-center gap-2 px-4 sm:pl-10 sm:pr-5 h-full bg-[#0b0f0b] relative z-[2] border-r border-white/[.06]">
          <span className="w-[7px] h-[7px] rounded-full bg-brand-accent-light" />
          <span className="font-sans font-extrabold text-[11px] tracking-[2px] text-hl-text whitespace-nowrap">NEWS</span>
        </div>
        <div
          ref={viewportRef}
          className="flex-1 overflow-hidden relative [mask-image:linear-gradient(90deg,transparent,#000_4%,#000_96%,transparent)]"
        >
          {/* Unsichtbare Messhilfe: Breite genau EINER Sequenz */}
          <div
            ref={measureRef}
            aria-hidden="true"
            className="absolute top-0 left-0 flex items-center whitespace-nowrap invisible pointer-events-none"
          >
            {renderItems('measure')}
          </div>

          {/* width:max-content ist entscheidend: nur so entspricht die -50%-
              Verschiebung exakt EINER Gruppe → nahtlos, ohne Sprung. */}
          <div
            className="flex whitespace-nowrap hl-marquee"
            style={{ width: 'max-content', animationDuration: `${layout.duration}s` }}
          >
            {group('g0')}
            {group('g1')}
          </div>
        </div>
      </div>
    </div>
  );
}
