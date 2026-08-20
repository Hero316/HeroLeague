import React from 'react';
import type { CardTier, PlayerCard } from '../types';

// ===========================================================================
// FC-/FIFA-artige Spielerkarte. Das Porträt füllt die ganze Karte. Der Name
// steht senkrecht am linken Rand (von unten nach oben lesbar), das Wappen oben
// rechts. Unten – auf einem dunklen Streifen – sitzt die Gesamtwertung mittig
// ÜBER den vier Einzelwerten, damit klar ist, dass sie zusammengehören.
// Alle Größen skalieren mit der Kartenbreite (cqw), damit die Karte klein wie
// groß identisch proportioniert aussieht. Stufe (Bronze…TOTS) = Farbwelt.
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
  games?: number; // nicht mehr angezeigt – bleibt für bestehende Aufrufer erhalten
  className?: string;
}

const TIER: Record<CardTier, { label: string; accent: string; border: string; bg1: string; bg2: string; glow?: string }> = {
  bronze: { label: 'Bronze', accent: '#EABF93', border: '#C98A5A', bg1: '#C98A5A', bg2: '#3E2314' },
  silber: { label: 'Silber', accent: '#EAEFEC', border: '#CBD3CE', bg1: '#8B958F', bg2: '#3A413E' },
  gold: { label: 'Gold', accent: '#F4D588', border: '#E9C46A', bg1: '#C9A24B', bg2: '#4E3B0E' },
  hero: { label: 'Hero', accent: '#5CFFAE', border: '#3DFF9E', bg1: '#0E3D2B', bg2: '#05130D', glow: '#3DFF9E' },
  tots: { label: 'TOTS', accent: '#F6E8AC', border: '#F3E4A6', bg1: '#C9AE52', bg2: '#4A390C' },
};

export default function FifaCard({ card, name, imageUrl, team, className = '' }: Props) {
  const t = TIER[card.tier];
  const parts = name.trim().split(/\s+/);
  const lastName = parts.length > 1 ? parts[parts.length - 1] : name;

  return (
    <div
      className={`relative rounded-3xl overflow-hidden select-none ${className}`}
      style={{
        aspectRatio: '0.70',
        containerType: 'inline-size',
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
            style={{ objectPosition: 'center 22%', transform: 'scale(1.34)', transformOrigin: 'center 24%' }}
          />
        ) : (
          <div className="w-full h-full grid place-items-center">
            <span className="font-display font-black" style={{ fontSize: '46cqw', color: `${t.accent}20` }}>
              {lastName.charAt(0)}
            </span>
          </div>
        )}
      </div>

      {/* Vignette links (für den Namen) + oben (fürs Wappen) */}
      <div className="absolute inset-y-0 left-0 w-1/3 z-10" style={{ background: 'linear-gradient(90deg, rgba(0,0,0,.55), transparent)' }} />
      <div className="absolute inset-x-0 top-0 h-1/5 z-10" style={{ background: 'linear-gradient(180deg, rgba(0,0,0,.5), transparent)' }} />

      {/* Name senkrecht am linken Rand, von unten (knapp über der Linie) nach oben
          lesbar – darf lang sein und läuft bis knapp unter den oberen Rand. */}
      <div className="absolute left-0 z-20 flex items-end" style={{ top: '4cqw', bottom: '30cqw', paddingLeft: '3.5cqw' }}>
        <span
          className="font-display font-black uppercase tracking-tight whitespace-nowrap"
          style={{
            writingMode: 'vertical-rl',
            transform: 'rotate(180deg)',
            fontSize: '7.6cqw',
            lineHeight: 1,
            color: t.accent,
            textShadow: '0 2px 10px rgba(0,0,0,.95)',
          }}
        >
          {name}
        </span>
      </div>

      {/* Wappen (oben rechts) */}
      <div className="absolute z-20" style={{ top: '3cqw', right: '3.5cqw' }}>
        {team &&
          (team.logoUrl ? (
            <img src={team.logoUrl} alt="" style={{ width: '15cqw', height: '15cqw' }} className="object-contain drop-shadow-[0_2px_8px_rgba(0,0,0,.7)]" />
          ) : (
            <div className="rounded-lg grid place-items-center" style={{ width: '15cqw', height: '15cqw', fontSize: '7cqw', background: `${team.logoColor || '#16BDA9'}33`, color: team.logoColor || '#22DFC9' }}>
              {team.logoIcon || '⚽'}
            </div>
          ))}
      </div>

      {/* Unterer Streifen: Gesamtwertung mittig ÜBER den vier Werten */}
      <div
        className="absolute bottom-0 inset-x-0 z-20"
        style={{ padding: '14cqw 5cqw 5.5cqw', background: 'linear-gradient(180deg, transparent 0%, rgba(2,7,5,.82) 40%, rgba(2,7,5,.98) 70%)' }}
      >
        {/* Gesamtwertung + Stufe – mittig, als Kopf der Werte-Gruppe */}
        <div className="flex flex-col items-center" style={{ marginBottom: '4cqw' }}>
          <div className="font-display font-black tabular-nums leading-none" style={{ fontSize: '26cqw', color: t.accent, textShadow: '0 3px 14px rgba(0,0,0,.9)' }}>
            {card.ges}
          </div>
          <div className="font-display font-black uppercase leading-none" style={{ fontSize: '4.6cqw', letterSpacing: '0.18em', marginTop: '1.5cqw', color: t.accent }}>
            {t.label}
          </div>
        </div>
        <div className="w-full" style={{ height: '1px', marginBottom: '4cqw', background: `${t.accent}55` }} />
        <div className="grid grid-cols-4" style={{ gap: '2cqw' }}>
          {card.attrs.map((a) => (
            <div key={a.key} className="text-center">
              <div className="font-display font-black tabular-nums text-white leading-none" style={{ fontSize: '11cqw' }}>
                {a.value}
              </div>
              <div className="uppercase text-white/60" style={{ fontSize: '4cqw', letterSpacing: '0.08em', marginTop: '1.5cqw' }} title={a.label}>
                {a.key}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
