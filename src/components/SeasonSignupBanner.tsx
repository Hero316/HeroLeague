import { useEffect, useState } from 'react';
import { Trophy, ArrowRight, CalendarClock } from 'lucide-react';
import { fetchSignupConfig, type SignupConfig } from '../lib/register';

// Auffälliges Banner auf der Startseite, das zur Season-2-Anmeldung führt.
// WICHTIG: Es ist SOFORT beim Laden sichtbar (mit statischen Standardtexten) und
// springt nie nach – der Server-Abruf aktualisiert nur die Texte und blendet es
// aus, falls die Anmeldung geschlossen ist (seltener Admin-Fall).
const DEFAULT_CFG: SignupConfig = { open: true, seasonLabel: 'Season 2', startInfo: 'Start im März 2027', minSquad: 8, maxSquad: 12, note: '', turnstileSiteKey: '' };
export default function SeasonSignupBanner({ onOpen }: { onOpen: () => void }) {
  const [cfg, setCfg] = useState<SignupConfig>(DEFAULT_CFG);
  const [closed, setClosed] = useState(false);
  useEffect(() => { fetchSignupConfig().then((c) => { setCfg(c); setClosed(!c.open); }).catch(() => {}); }, []);
  if (closed) return null;

  return (
    <button
      onClick={onOpen}
      className="group relative block w-full text-left overflow-hidden cursor-pointer border-y border-[rgba(18,165,148,.28)]"
      aria-label={`${cfg.seasonLabel} – Team anmelden`}
    >
      <div className="absolute inset-0 bg-[linear-gradient(100deg,#04120f_0%,#08251f_48%,#061a16_100%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(80%_140%_at_12%_0%,rgba(18,165,148,.4),transparent_55%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(70%_120%_at_100%_100%,rgba(109,93,230,.18),transparent_55%)]" />
      <div className="absolute inset-y-0 -left-1/3 w-1/3 bg-[linear-gradient(90deg,transparent,rgba(255,255,255,.10),transparent)] -skew-x-12 translate-x-[-120%] group-hover:translate-x-[520%] transition-transform duration-[1100ms] ease-out" />

      <div className="relative max-w-[1320px] mx-auto px-4 sm:px-10 py-4 sm:py-5 flex items-center gap-4 sm:gap-6">
        <div className="shrink-0 grid place-items-center w-11 h-11 sm:w-14 sm:h-14 rounded-2xl bg-[rgba(18,165,148,.18)] border border-[rgba(18,165,148,.45)]">
          <Trophy className="w-5 h-5 sm:w-7 sm:h-7 text-[#5fe6d3]" />
        </div>
        <div className="min-w-0 flex-1">
          <span className="block font-sans font-extrabold text-[9.5px] sm:text-[11px] tracking-[1px] sm:tracking-[2px] uppercase text-[#5fe6d3] whitespace-nowrap overflow-hidden text-ellipsis">
            Melde jetzt dich oder dein Team
          </span>
          <div className="font-display font-black text-[22px] sm:text-4xl uppercase tracking-tight leading-none mt-0.5 whitespace-nowrap" style={{ color: '#22DFC9', textShadow: '0 0 22px rgba(34,223,201,.55), 0 0 8px rgba(34,223,201,.4)' }}>
            Für {cfg.seasonLabel} an
          </div>
          {cfg.startInfo && (
            <div className="mt-1.5 hidden sm:flex items-center gap-2 text-xs font-sans text-hl-soft">
              <CalendarClock className="w-3.5 h-3.5 text-[#12A594]" />
              {cfg.startInfo} · unverbindlich
            </div>
          )}
        </div>
        {/* Handy: runder Pfeil (spart Platz für die einzeiligen Texte); ab sm volle Taste */}
        <span className="shrink-0 inline-flex items-center justify-center gap-1.5 rounded-full text-white font-display font-black uppercase tracking-wide w-10 h-10 sm:w-auto sm:h-auto sm:px-5 sm:py-2.5 text-sm" style={{ background: 'linear-gradient(135deg,#0C7A70,#12A594)' }}>
          <span className="hidden sm:inline">Jetzt anmelden</span>
          <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
        </span>
      </div>
    </button>
  );
}
