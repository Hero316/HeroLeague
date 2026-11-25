import { useEffect, useMemo, useState } from 'react';
import { Star } from 'lucide-react';
import type { MatchPlayerStat, PlayerCard, PlayerOfMonth, ScoringConfig, Team } from '../types';
import { fmtNote, trackedMatchdays } from '../lib/awards';
import { cardForPlayer } from '../lib/playerCards';
import { startingFive, type FivePlayer } from '../lib/startingFive';
import FifaCard from './FifaCard';

// ===========================================================================
// Abschnitt „Starting Five" (nur Admin-Vorschau unter /starting-five).
// Aufstellung des Spieltages im Kleinfeld-Look: 2 Offensive, 2 Defensive,
// 1 Torwart – darunter die Bank (2 + 2 + 1), etwas zurückgenommen.
// Jede Karte ist die normale Saisonkarte (unverändert), daneben die
// Spieltagsnote dieses Abends. Der Spieler des Spieltages bekommt den goldenen
// Rahmen mit Stern. Auswahl, welcher Spieltag gezeigt wird.
// Rechnung: lib/startingFive.ts. Liest nur.
// ===========================================================================

const GOLD = '#E9C46A';
const TEAL = '#22DFC9';
const POS_LABEL = { off: 'Offensive', def: 'Defensive', gk: 'Torwart' } as const;

function pendingCard(keeper: boolean): PlayerCard {
  const keys = keeper ? ['STL', 'PAR', 'PAS', 'SIC'] : ['PAS', 'SCH', 'DRI', 'DEF'];
  return { role: keeper ? 'keeper' : 'field', ges: 0, tier: keeper ? 'gold' : 'hero', attrs: keys.map((k) => ({ key: k, label: k, value: 0 })) };
}

interface Ctx {
  teams: Team[];
  trackingRows: MatchPlayerStat[];
  scoring: ScoringConfig;
  onSelectTeam?: (teamId: string, playerName?: string) => void;
}

function PlayerSlot({ p, ctx, bench = false }: { p: FivePlayer; ctx: Ctx; bench?: boolean }) {
  const team = ctx.teams.find((t) => t.id === p.teamId);
  const image = team?.spielerliste?.find((x) => x.name === p.name)?.imageUrl;
  const season = cardForPlayer(p.name, p.teamId, ctx.trackingRows, ctx.scoring);
  const open = team && ctx.onSelectTeam ? () => ctx.onSelectTeam!(team.id, p.name) : undefined;
  const gold = p.potd && !bench;
  const width = bench ? 'w-[96px] sm:w-[120px] lg:w-[132px]' : 'w-[132px] sm:w-[170px] lg:w-[190px]';

  const card = season ? (
    <FifaCard card={season.card} name={p.name} imageUrl={image} team={team} delta={season.delta} />
  ) : (
    <FifaCard card={pendingCard(p.pos === 'gk')} name={p.name} imageUrl={image} team={team} pending />
  );

  return (
    <div className={`flex flex-col items-center min-w-0 ${bench ? 'opacity-75' : ''}`}>
      <div className="relative">
        {gold && (
          <>
            {/* Goldener Rahmen + Stern – wie die Specials früher in FIFA */}
            <div
              className="absolute -inset-[5px] rounded-[30px] pointer-events-none"
              style={{ background: `linear-gradient(150deg, #FFF3C4, ${GOLD} 35%, #9C7A2B 70%, ${GOLD})`, boxShadow: `0 0 34px -2px ${GOLD}aa` }}
              aria-hidden="true"
            />
            <span
              className="absolute -top-3 -left-3 z-40 w-9 h-9 sm:w-10 sm:h-10 rounded-full grid place-items-center shadow-[0_6px_16px_rgba(0,0,0,.55)]"
              style={{ background: `linear-gradient(145deg, #FFF3C4, ${GOLD})` }}
              title="Spieler des Spieltages"
            >
              <Star className="w-5 h-5 sm:w-6 sm:h-6 text-[#5A4210] fill-[#5A4210]" />
            </span>
          </>
        )}
        {open ? (
          <button type="button" onClick={open} aria-label={`${p.name} – Spielerseite öffnen`} className={`relative block ${width} cursor-pointer transition-transform duration-200 hover:-translate-y-1`}>
            {card}
          </button>
        ) : (
          <div className={`relative ${width}`}>{card}</div>
        )}
      </div>
      {/* Spieltagsnote – deshalb ist er drin */}
      <div className={`mt-2.5 flex items-baseline gap-1.5 ${bench ? 'mt-2' : ''}`}>
        <span className={`font-display font-black tabular-nums leading-none ${bench ? 'text-[20px]' : 'text-[26px] sm:text-[30px]'}`} style={{ color: gold ? GOLD : TEAL }}>
          {fmtNote(p.note)}
        </span>
        <span className="font-sans font-bold uppercase tracking-[1.2px] text-[9.5px] sm:text-[10.5px] text-white/55">Note</span>
      </div>
      {!bench && (p.potd || p.kotd) && (
        <div className="mt-1 font-sans font-bold uppercase tracking-[1.2px] text-[9px] sm:text-[10px] text-center" style={{ color: GOLD }}>
          {p.potd ? 'Spieler des Spieltages' : 'Torwart des Spieltages'}
        </div>
      )}
    </div>
  );
}

function Row({ label, players, ctx, bench = false }: { label: string; players: FivePlayer[]; ctx: Ctx; bench?: boolean }) {
  if (players.length === 0) return null;
  return (
    <div className="flex flex-col items-center">
      <div className="mb-3 font-sans font-bold uppercase tracking-[2.5px] text-[10px] sm:text-[11px] text-white/45">{label}</div>
      <div className={`flex justify-center ${bench ? 'gap-3 sm:gap-4' : 'gap-4 sm:gap-10 lg:gap-14'}`}>
        {players.map((p) => (
          <PlayerSlot key={`${p.teamId}|${p.name}`} p={p} ctx={ctx} bench={bench} />
        ))}
      </div>
    </div>
  );
}

export default function StartingFiveSection({
  trackingRows,
  scoring,
  seasonId,
  teams,
  pom,
  onSelectTeam,
}: {
  trackingRows: MatchPlayerStat[];
  scoring: ScoringConfig;
  seasonId?: string;
  teams: Team[];
  pom: PlayerOfMonth | null;
  onSelectTeam?: (teamId: string, playerName?: string) => void;
}) {
  const days = useMemo(() => (seasonId ? trackedMatchdays(trackingRows, seasonId) : []), [trackingRows, seasonId]);
  const [md, setMd] = useState(0);
  // Standard: der letzte getrackte Spieltag.
  useEffect(() => {
    if (days.length && !days.includes(md)) setMd(days[days.length - 1]);
  }, [days, md]);

  const five = useMemo(
    () => (seasonId && md ? startingFive(trackingRows, seasonId, scoring, md, pom) : null),
    [trackingRows, seasonId, scoring, md, pom]
  );
  const ctx: Ctx = { teams, trackingRows, scoring, onSelectTeam };

  return (
    <section className="relative max-w-[1320px] xl:max-w-[1600px] mx-auto px-4 sm:px-10 py-14 sm:py-20">
      <div className="flex flex-col items-center text-center gap-3">
        <span className="inline-flex items-center rounded-full border border-white/15 bg-white/[.04] px-3 py-1 font-sans font-bold uppercase tracking-[2px] text-[9.5px] text-white/55">
          Vorschau · nur Admins
        </span>
        <h2 className="font-display font-black uppercase text-white text-[34px] sm:text-5xl leading-none tracking-tight">Starting Five</h2>
        {days.length > 0 && (
          <div className="mt-1 flex flex-wrap justify-center gap-1.5" role="group" aria-label="Spieltag wählen">
            {days.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setMd(d)}
                aria-pressed={d === md}
                className="px-3.5 py-1.5 rounded-full text-[11px] sm:text-xs font-bold uppercase tracking-wider border cursor-pointer transition-colors"
                style={
                  d === md
                    ? { color: '#04201c', background: TEAL, borderColor: TEAL }
                    : { color: 'rgba(255,255,255,.65)', borderColor: 'rgba(255,255,255,.14)', background: 'rgba(255,255,255,.03)' }
                }
              >
                Spieltag {d}
              </button>
            ))}
          </div>
        )}
      </div>

      {!five ? (
        <div className="mt-10 text-center text-sm text-white/50">Noch keine getrackten Spieltage.</div>
      ) : (
        <>
          {/* Aufstellung auf dem Kleinfeld */}
          <div
            className="relative mt-8 sm:mt-10 mx-auto max-w-[900px] rounded-[32px] border border-white/10 overflow-hidden px-3 sm:px-8 pt-8 sm:pt-10 pb-8 sm:pb-10"
            style={{ background: 'linear-gradient(180deg, rgba(34,223,201,.10), rgba(8,26,22,.55) 55%, rgba(6,14,15,.9))' }}
          >
            {/* Spielfeld-Linien */}
            <div className="absolute inset-4 sm:inset-6 rounded-[22px] border border-white/[.08] pointer-events-none" aria-hidden="true" />
            <div className="absolute left-4 right-4 sm:left-6 sm:right-6 top-1/2 h-px bg-white/[.08] pointer-events-none" aria-hidden="true" />
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-32 sm:w-44 sm:h-44 rounded-full border border-white/[.08] pointer-events-none" aria-hidden="true" />
            <div className="relative flex flex-col gap-8 sm:gap-10">
              <Row label={POS_LABEL.off} players={five.starters.off} ctx={ctx} />
              <Row label={POS_LABEL.def} players={five.starters.def} ctx={ctx} />
              <Row label={POS_LABEL.gk} players={five.starters.gk ? [five.starters.gk] : []} ctx={ctx} />
            </div>
          </div>

          {/* Bank */}
          <div className="mt-10 sm:mt-12 mx-auto max-w-[1100px]">
            <div className="mb-5 text-center font-display font-black uppercase text-white/80 text-[22px] sm:text-[26px] leading-none tracking-tight">Bank</div>
            <div className="flex flex-wrap justify-center items-start gap-x-8 lg:gap-x-12 gap-y-6">
              <Row label={POS_LABEL.off} players={five.bench.off} ctx={ctx} bench />
              <Row label={POS_LABEL.def} players={five.bench.def} ctx={ctx} bench />
              <Row label={POS_LABEL.gk} players={five.bench.gk ? [five.bench.gk] : []} ctx={ctx} bench />
            </div>
          </div>
        </>
      )}
    </section>
  );
}
