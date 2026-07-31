import React from 'react';
import { NewsItem } from '../types';

interface LiveTickerProps {
  news?: NewsItem[];
}

// Laufband unter der Navigation: zeigt ausschließlich die im Admin gepflegten
// News (keine Spieldaten mehr). Ohne News wird das Band gar nicht angezeigt.
export default function LiveTicker({ news = [] }: LiveTickerProps) {
  const items = news.map((n) => n.text.trim()).filter(Boolean);

  if (items.length === 0) return null;

  // Eine Durchlauf-Sequenz (zweimal gerendert für das nahtlose Endlos-Band).
  const sequence = (copy: string) => (
    <span className="flex-none flex items-center pl-6" aria-hidden={copy === 'b'}>
      {items.map((text, i) => (
        <React.Fragment key={`${copy}-${i}`}>
          <span className="font-sans font-extrabold text-[12.5px] tracking-[.4px] text-brand-accent-light">
            📣 {text}
          </span>
          <span className="px-4 text-hl-faint" aria-hidden="true">✦</span>
        </React.Fragment>
      ))}
    </span>
  );

  return (
    <div className="border-b border-white/[.06] bg-white/[.015] overflow-hidden">
      <div className="flex items-center h-[42px]">
        <div className="flex-none flex items-center gap-2 px-4 sm:pl-10 sm:pr-5 h-full bg-[#0b0f0b] relative z-[2] border-r border-white/[.06]">
          <span className="w-[7px] h-[7px] rounded-full bg-brand-accent-light" />
          <span className="font-sans font-extrabold text-[11px] tracking-[2px] text-hl-text whitespace-nowrap">NEWS</span>
        </div>
        <div className="flex-1 overflow-hidden relative [mask-image:linear-gradient(90deg,transparent,#000_4%,#000_96%,transparent)]">
          <div className="flex whitespace-nowrap hl-marquee">
            {sequence('a')}
            {sequence('b')}
          </div>
        </div>
      </div>
    </div>
  );
}
