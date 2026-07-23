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
  onSelect?: () => void; // Klick führt zur Team-Seite (falls Team bekannt)
}

// Schild-Silhouette in Anlehnung an eine FIFA-Ultimate-Team-Karte:
// oben dezent abgeschrägte Schultern, unten mittig zulaufende Spitze.
const SHIELD = 'polygon(0% 5%, 7% 0%, 93% 0%, 100% 5%, 100% 86%, 50% 100%, 0% 86%)';

// Spieler-des-Monats-Karte im Sammelkarten-Stil (FIFA-Ultimate-Team-Anmutung),
// in Hero-League-Farben/-Schriften. Das freigestellte Foto verschmilzt mit der
// Karte: Kopf ragt oben zwischen die Symbole, Beine verschwinden hinter dem Panel.
export default function PlayerOfMonthCard({ pom, crest, points, onSelect }: PlayerOfMonthCardProps) {
  const parts = pom.name.trim().split(/\s+/);
  const lastName = parts.length > 1 ? parts[parts.length - 1] : pom.name;
  const firstNames = parts.length > 1 ? parts.slice(0, -1).join(' ') : '';

  return (
    <div
      className={`relative w-full max-w-[330px] mx-auto ${onSelect ? 'cursor-pointer' : ''}`}
      onClick={onSelect}
      role={onSelect ? 'button' : undefined}
      title={onSelect && crest ? `${crest.name} – Vereinsseite öffnen` : undefined}
    >
      <div
        className={`relative w-full aspect-[0.72] transition-transform duration-300 [filter:drop-shadow(0_30px_54px_rgba(0,0,0,.6))] ${
          onSelect ? 'hover:-translate-y-1.5' : ''
        }`}
      >
        {/* Akzent-Rahmen (Teal -> Gold) */}
        <div
          className="absolute inset-0 bg-[linear-gradient(160deg,#2ee6cf,rgba(233,196,106,.9)_52%,rgba(34,223,201,.28))]"
          style={{ clipPath: SHIELD }}
        />
        {/* Kartenfüllung */}
        <div
          className="absolute inset-[3px] overflow-hidden bg-[linear-gradient(180deg,#12211f_0%,#0b1716_52%,#09110f_100%)]"
          style={{ clipPath: SHIELD }}
        >
          {/* Glow + Wasserzeichen */}
          <div className="absolute inset-0 bg-[radial-gradient(120%_70%_at_50%_0%,rgba(34,223,201,.28),transparent_62%)]" />
          {crest?.logoUrl ? (
            // Vereinswappen groß im Hintergrund – bewusst über die Kartenränder
            // hinaus (angeschnitten) und mit Verlauf: oben heller, nach unten
            // ausblendend (durchsichtig), damit es hinter dem Spieler verschwimmt.
            <img
              src={crest.logoUrl}
              alt=""
              aria-hidden="true"
              referrerPolicy="no-referrer"
              className="absolute left-1/2 top-[44%] -translate-x-1/2 -translate-y-1/2 w-[140%] max-w-none object-contain opacity-[.22] select-none pointer-events-none [mask-image:linear-gradient(180deg,rgba(0,0,0,1)_0%,rgba(0,0,0,.6)_46%,rgba(0,0,0,0)_80%)] [-webkit-mask-image:linear-gradient(180deg,rgba(0,0,0,1)_0%,rgba(0,0,0,.6)_46%,rgba(0,0,0,0)_80%)]"
            />
          ) : (
            <div className="absolute inset-x-0 top-[30%] -translate-y-1/2 text-center font-display font-black text-[62px] leading-[.8] tracking-tighter uppercase text-white/[.05] select-none pointer-events-none">
              Hero
              <br />
              League
            </div>
          )}

          {/* Freigestelltes Foto – füllt die Karte, Kopf oben, Füße unten */}
          {pom.image ? (
            <img
              src={pom.image}
              alt={pom.name}
              referrerPolicy="no-referrer"
              className="absolute inset-0 z-10 w-full h-full object-cover object-top"
            />
          ) : (
            <div className="absolute inset-0 z-10 flex items-center justify-center">
              <User2 className="w-28 h-28 text-white/10" strokeWidth={1.2} />
            </div>
          )}

          {/* Vereinswappen oben links */}
          {crest && (
            <div className="absolute top-3 left-3 z-30">
              <TeamCrest name={crest.name} shortName={crest.shortName} color={crest.logoColor} logoUrl={crest.logoUrl} size="md" />
            </div>
          )}

          {/* Ballon-d'Or-Punkte oben rechts (der „Rating"-Slot) */}
          {points != null && points > 0 && (
            <div className="absolute top-2.5 right-3.5 z-30 text-right leading-none">
              <div className="font-display font-black text-[38px] text-white [text-shadow:0_0_20px_rgba(34,223,201,.7)]">
                <CountUp value={points} decimals={1} />
              </div>
              <div className="font-sans font-extrabold text-[8px] tracking-[2px] text-brand-accent-light -mt-1">PUNKTE</div>
            </div>
          )}

          {/* Unteres Panel: verdeckt die Beine, trägt Name + Statistik */}
          <div className="absolute inset-x-0 bottom-0 z-20 px-4 pt-12 pb-[15%] text-center bg-[linear-gradient(180deg,transparent,rgba(9,17,15,.8)_36%,#09110f_72%)]">
            {firstNames && (
              <div className="font-sans italic font-semibold text-[14px] leading-tight text-hl-soft">{firstNames}</div>
            )}
            <div className="font-display font-black text-[34px] leading-[.9] uppercase text-brand-accent-light [text-shadow:0_0_26px_rgba(34,223,201,.45)]">
              {lastName}
            </div>
            <div className="mx-auto my-2.5 h-px w-3/5 bg-[linear-gradient(90deg,transparent,rgba(34,223,201,.55),transparent)]" />
            <div className="grid grid-cols-2">
              <div>
                <div className="font-display font-black text-[30px] leading-none text-brand-accent-light">
                  <CountUp value={pom.goals} />
                </div>
                <div className="font-sans font-bold text-[9px] tracking-[1.5px] text-hl-mute mt-1">TORE</div>
              </div>
              <div className="border-l border-white/10">
                <div className="font-display font-black text-[30px] leading-none text-white">
                  <CountUp value={pom.assists} />
                </div>
                <div className="font-sans font-bold text-[9px] tracking-[1.5px] text-hl-mute mt-1">VORLAGEN</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
