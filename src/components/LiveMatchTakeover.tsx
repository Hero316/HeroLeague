import { useMemo } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Radio, ArrowRight } from 'lucide-react';
import type { Match, Team } from '../types';
import { TeamCrest, LiveBadge } from './ui';

// ---------------------------------------------------------------------------
// Matchday-Live-Takeover: Sobald der Schiedsrichter ein Spiel live schaltet,
// erscheint oben auf der Startseite groß „JETZT LIVE" mit den laufenden Partien
// (bis zu zwei parallel, je Feld), inkl. Live-Minute und Live-Toren. Pfeift er
// ab, verschwindet der Block automatisch wieder.
// ---------------------------------------------------------------------------

interface Props {
  matches: Match[];
  teams: Team[];
  onOpenMatch: (matchId: string) => void;
  onSeeAll: () => void;
}

export default function LiveMatchTakeover({ matches, teams, onOpenMatch, onSeeAll }: Props) {
  const teamById = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams]);
  const live = useMemo(
    () =>
      matches
        .filter((m) => m.status === 'live')
        .sort((a, b) => (a.field ?? 99) - (b.field ?? 99) || `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`)),
    [matches]
  );

  return (
    <AnimatePresence>
      {live.length > 0 && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.4, ease: [0.32, 0.72, 0, 1] }}
          style={{ overflow: 'hidden' }}
        >
          <div className="relative border-b border-[#FF5442]/25" style={{ background: 'radial-gradient(120% 120% at 50% 0%, rgba(255,84,66,.14) 0%, transparent 60%), #070b0d' }}>
            <div className="max-w-[1320px] xl:max-w-[1600px] 2xl:max-w-[1780px] mx-auto px-4 sm:px-10 py-6 sm:py-8">
              {/* Kopf */}
              <div className="flex items-center justify-between gap-3 mb-5">
                <div className="flex items-center gap-2.5">
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#FF5442] opacity-70" />
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#FF5442]" />
                  </span>
                  <Radio className="w-5 h-5 text-[#FF5442]" />
                  <h2 className="font-display font-black uppercase tracking-tight text-white text-xl sm:text-2xl">Jetzt Live</h2>
                </div>
                <button
                  onClick={onSeeAll}
                  className="group inline-flex items-center gap-1.5 rounded-full bg-white/8 border border-white/12 px-4 py-2 text-xs font-sans font-bold uppercase tracking-wider text-white cursor-pointer hover:bg-white/14 transition-colors active:scale-95"
                >
                  Alle Spiele
                  <ArrowRight className="w-3.5 h-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
                </button>
              </div>

              {/* Live-Partien */}
              <div className={`grid gap-3 sm:gap-4 ${live.length > 1 ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1'}`}>
                {live.map((m, i) => {
                  const home = teamById.get(m.homeTeamId);
                  const away = teamById.get(m.awayTeamId);
                  return (
                    <motion.button
                      key={m.id}
                      onClick={() => onOpenMatch(m.id)}
                      initial={{ opacity: 0, y: 14 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1], delay: 0.08 + i * 0.08 }}
                      className="group text-left rounded-2xl border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,.05),rgba(255,255,255,.015))] p-4 sm:p-5 cursor-pointer transition-transform duration-200 hover:-translate-y-0.5 active:scale-[0.99]"
                    >
                      <div className="flex items-center justify-between mb-3">
                        {typeof m.field === 'number' ? (
                          <span className="text-[10px] font-sans font-bold uppercase tracking-wider text-hl-dim">Feld {m.field}</span>
                        ) : (
                          <span className="text-[10px] font-sans font-bold uppercase tracking-wider text-hl-dim">Spieltag {m.matchday}</span>
                        )}
                        <LiveBadge liveStartedAt={m.liveStartedAt} durationMinutes={m.durationMinutes} pausedAt={m.pausedAt} />
                      </div>
                      <div className="flex items-center gap-3">
                        {/* Heim */}
                        <div className="flex-1 min-w-0 flex items-center gap-2.5">
                          <TeamCrest name={home?.name || '?'} shortName={home?.shortName || ''} color={home?.logoColor || '#22DFC9'} logoUrl={home?.logoUrl} size="lg" />
                          <span className="font-display font-black uppercase tracking-tight text-white text-base sm:text-lg truncate">{home?.shortName || home?.name}</span>
                        </div>
                        {/* Spielstand */}
                        <div className="shrink-0 font-display font-black tabular-nums text-white text-3xl sm:text-4xl px-1">
                          {m.homeScore ?? 0}<span className="text-hl-dim mx-1">:</span>{m.awayScore ?? 0}
                        </div>
                        {/* Auswärts */}
                        <div className="flex-1 min-w-0 flex items-center gap-2.5 justify-end">
                          <span className="font-display font-black uppercase tracking-tight text-white text-base sm:text-lg truncate text-right">{away?.shortName || away?.name}</span>
                          <TeamCrest name={away?.name || '?'} shortName={away?.shortName || ''} color={away?.logoColor || '#22DFC9'} logoUrl={away?.logoUrl} size="lg" />
                        </div>
                      </div>
                    </motion.button>
                  );
                })}
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
