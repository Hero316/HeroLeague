import React from 'react';
import type { CardTier, PlayerCard } from '../types';

// ===========================================================================
// FC-/FIFA-artige Spielerkarte. Das Porträt füllt die ganze Karte und wird leicht
// herangezoomt, damit der Spieler GROSS und klar erkennbar ist (die Studiofotos
// sind zentriert mit viel Rand). Wert + Stufe sitzen klein oben links, das Wappen
// oben rechts, Name und die vier Werte klein unten auf einem dunklen Streifen –
// nie im Gesicht. Stufe (Bronze…TOTS) bestimmt die Farbwelt; Hero = neon + Glow.
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

const TIER: Record<CardTier, { label: string; accent: string; border: string; bg1: string; bg2: string; glow?: string }> = {
  bronze: { label: 'Bronze', accent: '#EABF93', border: '#C98A5A', bg1: '#C98A5A', bg2: '#3E2314' },
  silber: { label: 'Silber', accent: '#EAEFEC', border: '#CBD3CE', bg1: '#8B958F', bg2: '#3A413E' },
  gold: { label: 'Gold', accent: '#F4D588', border: '#E9C46A', bg1: '#C9A24B', bg2: '#4E3B0E' },
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
      {/* Porträt füllt die Karte und wird herangezoomt → Spieler groß & klar */}
      <div className="absolute inset-0 overflow-hidden">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={name}
            className="w-full h-full object-cover"
            style={{ objectPosition: 'center 24%', transform: 'scale(1.35)', transformOrigin: 'center 26%' }}
          />
        ) : (
          <div className="w-full h-full grid place-items-center">
            <span className="font-display font-black" style={{ fontSize: 150, color: `${t.accent}20` }}>
              {lastName.charAt(0)}
            </span>
          </div>
        )}
      </div>

      {/* leichte Vignette oben, damit Wert & Wappen klar stehen */}
      <div className="absolute inset-x-0 top-0 h-1/5 z-10" style={{ background: 'linear-gradient(180deg, rgba(0,0,0,.55), transparent)' }} />

      {/* Gesamtwert + Stufe (klein, oben links – nicht im Gesicht) */}
      <div className="absolute top-2.5 left-3 z-20 leading-none">
        <div className="font-display font-black tabular-nums" style={{ fontSize: 34, color: t.accent, textShadow: '0 2px 12px rgba(0,0,0,.9)' }}>
          {card.ges}
        </div>
        <div className="font-display font-black uppercase tracking-[2px]" style={{ fontSize: 9, marginTop: 2, color: t.accent, textShadow: '0 1px 8px rgba(0,0,0,.9)' }}>
          {t.label}
        </div>
      </div>

      {/* Wappen (oben rechts) */}
      <div className="absolute top-2.5 right-3 z-20">
        {team &&
          (team.logoUrl ? (
            <img src={team.logoUrl} alt="" className="w-9 h-9 object-contain drop-shadow-[0_2px_8px_rgba(0,0,0,.7)]" />
          ) : (
            <div className="w-9 h-9 rounded-lg grid place-items-center text-base" style={{ background: `${team.logoColor || '#16BDA9'}33`, color: team.logoColor || '#22DFC9' }}>
              {team.logoIcon || '⚽'}
            </div>
          ))}
      </div>

      {/* Unterer Streifen: Name + Werte (klein), über den Schultern – nie im Gesicht */}
      <div
        className="absolute bottom-0 inset-x-0 z-20 px-3.5 pb-3 pt-9"
        style={{ background: 'linear-gradient(180deg, transparent 0%, rgba(2,7,5,.80) 38%, rgba(2,7,5,.97) 68%)' }}
      >
        <div className="text-center mb-2">
          {firstName && <div className="text-white/65 uppercase tracking-[2px] leading-none" style={{ fontSize: 8.5, marginBottom: 2 }}>{firstName}</div>}
          <div className="font-display font-black uppercase tracking-tight leading-none" style={{ fontSize: 19, color: t.accent, textShadow: '0 2px 8px rgba(0,0,0,.8)' }}>
            {lastName}
          </div>
        </div>
        <div className="h-px w-full mb-2" style={{ background: `${t.accent}44` }} />
        <div className="grid grid-cols-4 gap-1">
          {card.attrs.map((a) => (
            <div key={a.key} className="text-center">
              <div className="font-display font-black tabular-nums text-white leading-none" style={{ fontSize: 16 }}>
                {a.value}
              </div>
              <div className="uppercase tracking-wider text-white/55" style={{ fontSize: 8, marginTop: 2 }} title={a.label}>
                {a.key}
              </div>
            </div>
          ))}
        </div>
        <div className="text-center text-white/35 uppercase tracking-[2px]" style={{ fontSize: 7, marginTop: 8 }}>
          {games} {games === 1 ? 'Spiel' : 'Spiele'} · Season One
        </div>
      </div>
    </div>
  );
}
