import React from 'react';
import { User2 } from 'lucide-react';
import { PlayerOfMonth } from '../types';
import { TeamCrest } from './ui';
import { CountUp } from './anim';

interface CrestInfo {
  name: string;
  shortName: string;
  logoColor: string;
  logoUrl?: string;
}

interface PlayerOfMonthCardProps {
  pom: PlayerOfMonth;
  crest?: CrestInfo;
  points?: number; // Ballon-d'Or-Wertung, falls zum Spieler gefunden
}

// Spieler-des-Monats-Karte im Sammelkarten-Stil (FIFA-Ultimate-Team-Anmutung),
// aber in den Hero-League-Farben/-Schriften. Alle Werte stehen auf der Karte.
export default function PlayerOfMonthCard({ pom, crest, points }: PlayerOfMonthCardProps) {
  const parts = pom.name.trim().split(/\s+/);
  const lastName = parts.length > 1 ? parts[parts.length - 1] : pom.name;
  const firstNames = parts.length > 1 ? parts.slice(0, -1).join(' ') : '';

  return (
    <div className="relative w-full max-w-[360px] mx-auto">
      {/* Akzent-Rahmen (Teal -> Gold) mit weichem Schatten */}
      <div className="relative rounded-[26px] p-[2px] bg-[linear-gradient(160deg,rgba(34,223,201,.7),rgba(233,196,106,.42)_52%,rgba(34,223,201,.14))] shadow-[0_34px_90px_rgba(0,0,0,.6)]">
        <div className="relative rounded-[24px] overflow-hidden bg-[linear-gradient(180deg,#12211f_0%,#0b1716_46%,#0a1415_100%)]">
          {/* Hintergrund: Glow + Wasserzeichen */}
          <div className="absolute inset-0 bg-[radial-gradient(120%_78%_at_50%_2%,rgba(34,223,201,.24),transparent_60%)] pointer-events-none" />
          <div className="absolute inset-x-0 top-[34%] -translate-y-1/2 text-center font-display font-black text-[74px] leading-none tracking-tighter uppercase text-white/[.045] select-none pointer-events-none">
            Hero
            <br />
            League
          </div>

          {/* Foto-Bereich mit Overlays */}
          <div className="relative h-[292px]">
            {pom.image ? (
              <img
                src={pom.image}
                alt={pom.name}
                referrerPolicy="no-referrer"
                className="absolute inset-0 w-full h-full object-contain object-bottom drop-shadow-[0_22px_26px_rgba(0,0,0,.55)]"
              />
            ) : (
              <div className="absolute inset-0 flex items-end justify-center pb-2">
                <User2 className="w-28 h-28 text-white/10" strokeWidth={1.2} />
              </div>
            )}

            {/* Kicker oben mittig */}
            <div className="absolute top-3 inset-x-0 flex justify-center">
              <span className="inline-flex items-center gap-1.5 px-3 py-[5px] rounded-full bg-[rgba(233,196,106,.14)] border border-[rgba(233,196,106,.36)] backdrop-blur-md">
                <span className="text-[10px] leading-none text-hl-gold">★</span>
                <span className="font-sans font-extrabold text-[9.5px] tracking-[2px] text-hl-gold">SPIELER DES MONATS</span>
              </span>
            </div>

            {/* Wappen oben links */}
            {crest && (
              <div className="absolute top-3 left-3">
                <TeamCrest name={crest.name} shortName={crest.shortName} color={crest.logoColor} logoUrl={crest.logoUrl} size="md" />
              </div>
            )}

            {/* Ballon-d'Or-Punkte oben rechts (der „Rating"-Slot) */}
            {points != null && points > 0 && (
              <div className="absolute top-2.5 right-3.5 text-right leading-none">
                <div className="font-display font-black text-[40px] text-brand-accent-light [text-shadow:0_0_22px_rgba(34,223,201,.5)]">
                  <CountUp value={points} decimals={1} />
                </div>
                <div className="font-sans font-extrabold text-[8.5px] tracking-[2px] text-hl-gold -mt-1">PUNKTE</div>
              </div>
            )}
          </div>

          {/* Namensband */}
          <div className="relative px-4 text-center">
            {firstNames && (
              <div className="font-sans italic font-semibold text-[15px] leading-tight text-hl-soft">{firstNames}</div>
            )}
            <div className="font-display font-black text-[38px] leading-[.9] uppercase text-brand-accent-light [text-shadow:0_0_30px_rgba(34,223,201,.4)]">
              {lastName}
            </div>
            {pom.club && (
              <div className="font-sans font-bold text-[11px] tracking-[1.5px] text-hl-dim uppercase mt-1.5">{pom.club}</div>
            )}
          </div>

          {/* Trennlinie */}
          <div className="mx-auto my-3 h-px w-2/3 bg-[linear-gradient(90deg,transparent,rgba(34,223,201,.5),transparent)]" />

          {/* Statleiste */}
          <div className="relative grid grid-cols-2 px-5 pb-5">
            <div className="text-center">
              <div className="font-display font-black text-[34px] leading-none text-brand-accent-light">
                <CountUp value={pom.goals} />
              </div>
              <div className="font-sans font-bold text-[10px] tracking-[2px] text-hl-mute mt-1.5">TORE</div>
            </div>
            <div className="text-center border-l border-white/10">
              <div className="font-display font-black text-[34px] leading-none text-white">
                <CountUp value={pom.assists} />
              </div>
              <div className="font-sans font-bold text-[10px] tracking-[2px] text-hl-mute mt-1.5">VORLAGEN</div>
            </div>
          </div>

          {/* Fuß-Wortmarke */}
          <div className="relative pb-4 flex justify-center">
            <span className="font-display font-black text-[10.5px] tracking-[3px] text-white/25 uppercase">Hero League</span>
          </div>
        </div>
      </div>
    </div>
  );
}
