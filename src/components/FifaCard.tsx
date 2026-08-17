import React from 'react';
import type { CardTier, PlayerCard } from '../types';

// ===========================================================================
// FIFA-artige Spielerkarte. Gesamtwert groß oben, Teilwerte unten, Porträt in
// der Mitte. Stufe (Bronze/Silber/Gold/Hero/TOTS) bestimmt die Farbwelt.
// Bewusst eigenständig eingefärbt (dunkler Karten-Innenraum) – funktioniert in
// Hell- und Dunkelmodus gleich.
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
// Elite = schwarze Karte (Platin-Text). Hero = neongrüner Rahmen mit Glow.
const TIER: Record<CardTier, { label: string; accent: string; border: string; bg1: string; bg2: string; glow?: string }> = {
  bronze: { label: 'Bronze', accent: '#EABF93', border: '#C98A5A', bg1: '#C98A5A', bg2: '#5C3620' },
  silber: { label: 'Silber', accent: '#EAEFEC', border: '#CBD3CE', bg1: '#CBD3CE', bg2: '#5F6A66' },
  gold: { label: 'Gold', accent: '#F4D588', border: '#E9C46A', bg1: '#E9C46A', bg2: '#7D5F16' },
  elite: { label: 'Elite', accent: '#E7ECEA', border: '#3B3B42', bg1: '#2A2A30', bg2: '#08080A' },
  hero: { label: 'Hero', accent: '#5CFFAE', border: '#3DFF9E', bg1: '#0E3D2B', bg2: '#05130D', glow: '#3DFF9E' },
  tots: { label: 'TOTS', accent: '#F6E8AC', border: '#F3E4A6', bg1: '#F3E4A6', bg2: '#8A6A15' },
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
        aspectRatio: '0.72',
        background: `linear-gradient(160deg, ${t.bg1} 0%, ${t.bg2} 58%, #050607 100%)`,
        border: `1px solid ${t.border}`,
        boxShadow: t.glow
          ? `0 0 0 1px ${t.glow}, 0 0 34px -4px ${t.glow}, 0 20px 60px -20px ${t.bg2}aa`
          : `0 20px 60px -20px ${t.bg2}aa`,
      }}
    >
      {/* dunkler Innenraum, damit Text und Foto klar lesbar sind */}
      <div className="absolute inset-[3px] rounded-[21px]" style={{ background: 'linear-gradient(180deg, rgba(6,14,11,.42), rgba(6,14,11,.9))' }} />

      {/* Kopf: Gesamtwert + Stufe (links), Wappen (rechts) */}
      <div className="absolute top-0 left-0 right-0 p-4 flex items-start justify-between z-10">
        <div className="leading-none">
          <div className="font-display font-black tabular-nums" style={{ fontSize: 46, color: t.accent, textShadow: '0 2px 12px rgba(0,0,0,.5)' }}>
            {card.ges}
          </div>
          <div className="font-display font-black uppercase tracking-[3px] text-[11px] mt-1" style={{ color: t.accent }}>
            {t.label}
          </div>
          <div className="uppercase tracking-[2px] text-[9px] mt-2 text-white/70">{card.role === 'keeper' ? 'Torwart' : 'Feldspieler'}</div>
        </div>
        {team &&
          (team.logoUrl ? (
            <img src={team.logoUrl} alt="" className="w-9 h-9 object-contain drop-shadow" />
          ) : (
            <div className="w-9 h-9 rounded-lg grid place-items-center text-lg" style={{ background: `${team.logoColor || '#16BDA9'}33`, color: team.logoColor || '#22DFC9' }}>
              {team.logoIcon || '⚽'}
            </div>
          ))}
      </div>

      {/* Porträt */}
      <div className="absolute inset-x-0 top-[16%] bottom-[34%] z-[5] flex items-end justify-center">
        {imageUrl ? (
          <img src={imageUrl} alt={name} className="h-full object-contain drop-shadow-[0_12px_24px_rgba(0,0,0,.55)]" />
        ) : (
          <div className="font-display font-black text-white/15" style={{ fontSize: 120 }}>
            {lastName.charAt(0)}
          </div>
        )}
      </div>

      {/* Name + Teilwerte */}
      <div className="absolute bottom-0 left-0 right-0 z-10 px-4 pb-4 pt-6" style={{ background: 'linear-gradient(180deg, transparent, rgba(6,14,11,.75) 40%)' }}>
        <div className="text-center mb-2.5">
          {firstName && <div className="text-white/70 text-[11px] uppercase tracking-wide -mb-0.5">{firstName}</div>}
          <div className="font-display font-black uppercase tracking-tight text-white leading-none" style={{ fontSize: 22, color: t.accent }}>
            {lastName}
          </div>
        </div>
        <div className="h-px w-full mb-2.5" style={{ background: `${t.accent}44` }} />
        <div className="grid grid-cols-4 gap-1">
          {card.attrs.map((a) => (
            <div key={a.key} className="text-center">
              <div className="font-display font-black tabular-nums text-white leading-none" style={{ fontSize: 19 }}>
                {a.value}
              </div>
              <div className="uppercase tracking-wider text-white/60 mt-0.5" style={{ fontSize: 9 }} title={a.label}>
                {a.key}
              </div>
            </div>
          ))}
        </div>
        <div className="text-center text-white/45 uppercase tracking-[2px] mt-2.5" style={{ fontSize: 8.5 }}>
          {games} {games === 1 ? 'Spiel' : 'Spiele'} · Season One
        </div>
      </div>
    </div>
  );
}
