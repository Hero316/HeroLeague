import React from 'react';
import { ChevronDown } from 'lucide-react';
import type { PlayerCard } from '../types';
import FifaCard from './FifaCard';

// ===========================================================================
// Vorschauen im Foto-Studio (Backoffice): So sieht das Bild auf der Seite aus.
//  • Kartenbild → echte FIFA-Karte (dieselbe Komponente wie auf der Seite)
//  • Porträt   → Hero-One-Zeile und Statistik-Kachel, nachgebaut mit denselben
//    Maßen/Klassen wie in HeroOne.tsx bzw. Statistiken.tsx. Ändert sich dort
//    die Bildgröße, hier mitziehen.
// ===========================================================================

interface TeamLike {
  name?: string;
  logoColor?: string;
  logoUrl?: string;
  logoIcon?: string;
}

const PREVIEW_CARD: PlayerCard = {
  role: 'field',
  ges: 0,
  tier: 'hero',
  attrs: ['PAS', 'SCH', 'DRI', 'DEF'].map((k) => ({ key: k, label: k, value: 0 })),
};

function Caption({ children }: { children: React.ReactNode }) {
  return <div className="text-[10px] font-mono uppercase tracking-wider text-gray-500 mb-1.5">{children}</div>;
}

export function CardPreview({ name, imageUrl, team }: { name: string; imageUrl?: string; team?: TeamLike }) {
  return (
    <div>
      <Caption>FIFA-Karte</Caption>
      <div className="w-[160px] sm:w-[170px] mx-auto sm:mx-0">
        <FifaCard card={PREVIEW_CARD} name={name || 'Spieler'} imageUrl={imageUrl} team={team} pending />
      </div>
    </div>
  );
}

export function PortraitPreviews({ name, teamName, url }: { name: string; teamName?: string; url?: string }) {
  const shown = name || 'Spieler';
  return (
    <div className="space-y-4">
      {/* Hero One: Zeile mit Porträt an der linken Kartenkante (wie HeroOne.tsx) */}
      <div>
        <Caption>Hero One</Caption>
        <div className="rounded-2xl border border-white/10 bg-white/[.03] overflow-hidden">
          <div className="w-full flex items-center gap-3 px-3 py-3 min-w-0">
            <span className="shrink-0 h-[116px] -ml-3 -mb-3 -mt-1 flex items-end">
              {url ? (
                <img src={url} alt="" className="h-full w-auto max-w-[150px] object-contain object-left-bottom drop-shadow-[0_8px_18px_rgba(0,0,0,.5)]" />
              ) : (
                <span className="block w-[90px]" />
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-display font-black uppercase tracking-tight text-white text-xl leading-tight truncate">{shown}</span>
              {teamName && <span className="block text-[12px] text-hl-mute truncate">{teamName}</span>}
            </span>
            <ChevronDown className="w-5 h-5 shrink-0 text-hl-gold" />
          </div>
        </div>
      </div>

      {/* Statistik: Bestwert-Kachel mit Porträt rechts unten (wie Statistiken.tsx) */}
      <div>
        <Caption>Statistik</Caption>
        <div className="relative flex rounded-[20px] overflow-hidden bg-[linear-gradient(180deg,rgba(255,255,255,.05),rgba(255,255,255,.012))] border border-white/10 p-5">
          <div className="relative flex-1 min-w-0 flex gap-3">
            <div className="flex-1 min-w-0 flex flex-col">
              <div className="font-display font-black text-xl uppercase tracking-tight leading-none text-brand-accent-light">Tore</div>
              <div className="mt-3 min-w-0">
                <div className="font-display font-black text-[22px] leading-[.95] uppercase text-white truncate">{shown}</div>
                {teamName && <div className="font-sans text-[12.5px] text-hl-mute mt-1 truncate">{teamName}</div>}
              </div>
              <div className="mt-auto pt-4 font-display font-black leading-[.85] text-[56px] text-brand-accent-light">–</div>
            </div>
            <div className="shrink-0 self-center w-[118px]" />
          </div>
          {url && (
            <span className="absolute bottom-0 top-3 right-0 w-[48%] flex items-end justify-end">
              <img src={url} alt="" className="max-h-full max-w-full object-contain object-bottom drop-shadow-[0_10px_24px_rgba(0,0,0,.5)]" />
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
