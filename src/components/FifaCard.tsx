import React from 'react';
import type { CardTier, PlayerCard } from '../types';

// ===========================================================================
// FC-/FIFA-artige Spielerkarte. Das Porträt füllt die GANZE Karte (randlos), das
// Gesicht bleibt frei. Gesamtwert + Stufe liegen oben links, das Wappen oben
// rechts. Name und die vier Werte stehen unten auf einem dunklen Streifen über
// den Schultern – nie im Gesicht. Stufe (Bronze…TOTS) bestimmt die Farbwelt;
// Hero = neongrüner Rahmen mit Glow.
// ===========================================================================

interface TeamLike {
  name?: string;
  logoColor?: string;
  logoUrl?: string;
  logoIcon?: string;
}

interface Props {
  card: PlayerCard;
  name: string;
  imageUrl?: string;
  team?: TeamLike;
  games: number;
  className?: string;
}

// accent = Farbe für Zahlen/Name · border = Rahmen · bg1/bg2 = Karten-Verlauf.
const TIER: Record<CardTier, { label: string; accent: string; border: string; bg1: string; bg2: string; glow?: string }> = {
  bronze: { label: 'Bronze', accent: '#EABF93', border: '#C98A5A', bg1: '#C98A5A', bg2: '#3E2314' },
  silber: { label: 'Silber', accent: '#EAEFEC', border: '#CBD3CE', bg1: '#8B958F', bg2: '#3A413E' },
  gold: { label: 'Gold', accent: '#F4D588', border: '#E9C46A', bg1: '#C9A24B', bg2: '#4E3B0E' },
  elite: { label: 'Elite', accent: '#E7ECEA', border: '#3B3B42', bg1: '#2A2A30', bg2: '#08080A' },
  hero: { label: 'Hero', accent: '#5CFFAE', border: '#3DFF9E', bg1: '#0E3D2B', bg2: '#05130D', glow: '#3DFF9E' },
  tots: { label: 'TOTS', accent: '#F6E8AC', border: '#F3E4A6', bg1: '#C9AE52', bg2: '#4A390C' },
};

export default function FifaCard({ card, name, imageUrl, team, games, className = '' }: Props) {
  const t = TIER[card.tier];
  const parts = name.trim().split(/\s+/);
  const firstName = parts.length > 1 ? parts.slice(0, -1).join(' ') : '';
  const lastName = parts.length > 1 ? parts[parts.length - 1] : name;

  return (
    <div
      className={`relative rounded-3xl overflow-hidden select-none ${className}`}
      style={{
        aspectRatio: '0.70',
        background: `linear-gradient(165deg, ${t.bg1} 0%, ${t.bg2} 50%, #050607 100%)`,
        border: `1.5px solid ${t.border}`,
        boxShadow: t.glow
          ? `0 0 0 1px ${t.glow}, 0 0 40px -6px ${t.glow}, 0 22px 60px -22px #000`
          : `0 22px 60px -22px #000`,
      }}
    >
      {/* Porträt füllt die ganze Karte – der Spieler ist groß erkennbar */}
      <div className="absolute inset-0 overflow-hidden">
        {imageUrl ? (
          <img src={imageUrl} alt={name} className="w-full h-full object-cover" style={{ objectPosition: 'center 16%' }} />
        ) : (
          <div className="w-full h-full grid place-items-center">
            <span className="font-display font-black" style={{ fontSize: 160, color: `${t.accent}20` }}>
              {lastName.charAt(0)}
            </span>
          </div>
        )}
      </div>

      {/* leichte Vignette oben, damit Wert & Wappen klar stehen */}
      <div className="absolute inset-x-0 top-0 h-1/4 z-10" style={{ background: 'linear-gradient(180deg, rgba(0,0,0,.5), transparent)' }} />

      {/* Gesamtwert + Stufe (oben links) */}
      <div className="absolute top-3 left-4 z-20 leading-none">
        <div className="font-display font-black tabular-nums" style={{ fontSize: 54, color: t.accent, textShadow: '0 2px 16px rgba(0,0,0,.85)' }}>
          {card.ges}
        </div>
        <div className="font-display font-black uppercase tracking-[3px] text-[12px] mt-0.5" style={{ color: t.accent, textShadow: '0 1px 10px rgba(0,0,0,.85)' }}>
          {t.label}
        </div>
      </div>

      {/* Wappen (oben rechts) */}
      <div className="absolute top-3 right-4 z-20">
        {team &&
          (team.logoUrl ? (
            <img src={team.logoUrl} alt="" className="w-11 h-11 object-contain drop-shadow-[0_2px_8px_rgba(0,0,0,.7)]" />
          ) : (
            <div className="w-11 h-11 rounded-lg grid place-items-center text-xl" style={{ background: `${team.logoColor || '#16BDA9'}33`, color: team.logoColor || '#22DFC9' }}>
              {team.logoIcon || '⚽'}
            </div>
          ))}
      </div>

      {/* Unterer Streifen: Name + Werte, über den Schultern – nie im Gesicht */}
      <div
        className="absolute bottom-0 inset-x-0 z-20 px-4 pb-3 pt-12"
        style={{ background: 'linear-gradient(180deg, transparent 0%, rgba(3,9,7,.68) 24%, rgba(3,9,7,.94) 55%)' }}
      >
        <div className="text-center mb-2.5">
          {firstName && <div className="text-white/70 text-[11px] uppercase tracking-[2px] leading-none mb-1">{firstName}</div>}
          <div className="font-display font-black uppercase tracking-tight leading-none" style={{ fontSize: 27, color: t.accent, textShadow: '0 2px 10px rgba(0,0,0,.7)' }}>
            {lastName}
          </div>
        </div>
        <div className="h-px w-full mb-2.5" style={{ background: `${t.accent}55` }} />
        <div className="grid grid-cols-4 gap-1">
          {card.attrs.map((a) => (
            <div key={a.key} className="text-center">
              <div className="font-display font-black tabular-nums text-white leading-none" style={{ fontSize: 22 }}>
                {a.value}
              </div>
              <div className="uppercase tracking-wider text-white/60 mt-1" style={{ fontSize: 9.5 }} title={a.label}>
                {a.key}
              </div>
            </div>
          ))}
        </div>
        <div className="text-center text-white/40 uppercase tracking-[2px] mt-2.5" style={{ fontSize: 8 }}>
          {games} {games === 1 ? 'Spiel' : 'Spiele'} · Season One
        </div>
      </div>
    </div>
  );
}
