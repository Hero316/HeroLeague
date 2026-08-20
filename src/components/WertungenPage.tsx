import React, { useMemo, useState } from 'react';
import { ArrowLeft, ChevronRight, Crown, Hand, Trophy, Star } from 'lucide-react';
import type { Match, MatchPlayerStat, ScoringConfig, Team } from '../types';
import { keeperRanking, matchdayRanking, seasonRanking, RankedPlayer } from '../lib/trackingAwards';
import FifaCard from './FifaCard';

// ===========================================================================
// Wertungen (Statistics Center): Man of the Matchday, Top 5, HERO ONE (Saison)
// und Goldener Handschuh – alles aus den veröffentlichten getrackten Daten.
// Nur Liga-Tage (dayKey „s:") – Testspiele bleiben außen vor.
// ===========================================================================

interface Props {
  rows: MatchPlayerStat[];
  cfg: ScoringConfig;
  teams: Team[];
  matches: Match[];
  seasonLabel?: string;
  onBack: () => void;
  onSelectPlayer: (teamId: string, name: string) => void;
}

export default function WertungenPage({ rows, cfg, teams, matches, seasonLabel, onBack, onSelectPlayer }: Props) {
  const leagueRows = useMemo(() => rows.filter((r) => r.dayKey.startsWith('s:')), [rows]);
  const trackedMatchIds = useMemo(() => new Set(leagueRows.map((r) => r.matchId)), [leagueRows]);

  const teamOf = (teamId: string) => teams.find((t) => t.id === teamId);
  const photoOf = (teamId: string, name: string) =>
    teams.find((t) => t.id === teamId)?.spielerliste?.find((p) => p.name === name)?.imageUrl;

  const season = useMemo(() => seasonRanking(leagueRows, cfg), [leagueRows, cfg]);
  const keepers = useMemo(() => keeperRanking(leagueRows, cfg), [leagueRows, cfg]);

  // Spieltage mit getrackten Daten.
  const matchdaysWithData = useMemo(() => {
    const map = new Map<number, string[]>();
    matches.forEach((m) => {
      if (!trackedMatchIds.has(m.id)) return;
      const arr = map.get(m.matchday) ?? [];
      arr.push(m.id);
      map.set(m.matchday, arr);
    });
    return [...map.entries()].map(([md, ids]) => ({ matchday: md, ids })).sort((a, b) => b.matchday - a.matchday);
  }, [matches, trackedMatchIds]);

  const [selMatchday, setSelMatchday] = useState<number | null>(null);
  const activeMatchday = selMatchday ?? matchdaysWithData[0]?.matchday ?? null;
  const mdIds = useMemo(
    () => new Set(matchdaysWithData.find((d) => d.matchday === activeMatchday)?.ids ?? []),
    [matchdaysWithData, activeMatchday]
  );
  const mdRanking = useMemo(() => matchdayRanking(leagueRows, cfg, mdIds), [leagueRows, cfg, mdIds]);

  const hasData = leagueRows.length > 0;

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <button onClick={onBack} className="mb-6 text-xs font-bold uppercase tracking-wider text-hl-mute hover:text-white flex items-center gap-1.5 cursor-pointer">
        <ArrowLeft className="w-4 h-4" /> Zurück
      </button>

      <div className="mb-8">
        <h1 className="font-display font-black text-3xl sm:text-4xl uppercase tracking-tight">Wertungen</h1>
        <p className="text-hl-dim text-sm mt-1">Aus den getrackten Abenddaten · {seasonLabel || 'Season One'}</p>
      </div>

      {!hasData ? (
        <div className="hl-card p-10 text-center text-hl-mute">
          Noch keine veröffentlichten Werte. Sobald ein Spieltag im Statistics Center „live" geschaltet ist, erscheinen die
          Auszeichnungen hier automatisch.
        </div>
      ) : (
        <div className="space-y-10">
          {/* Man of the Matchday + Top 5 */}
          <section>
            <div className="flex items-center justify-between gap-3 mb-4">
              <h2 className="font-display font-black text-xl uppercase tracking-tight flex items-center gap-2">
                <Star className="w-5 h-5 text-brand-accent-light" /> Man of the Matchday
              </h2>
              {matchdaysWithData.length > 0 && (
                <select
                  value={activeMatchday ?? ''}
                  onChange={(e) => setSelMatchday(Number(e.target.value))}
                  className="hl-input px-3 py-1.5 rounded-xl text-sm font-semibold"
                >
                  {matchdaysWithData.map((d) => (
                    <option key={d.matchday} value={d.matchday}>
                      Spieltag {d.matchday}
                    </option>
                  ))}
                </select>
              )}
            </div>
            {mdRanking.length === 0 ? (
              <div className="hl-card p-6 text-center text-hl-mute text-sm">Für diesen Spieltag noch keine Daten.</div>
            ) : (
              <div className="grid gap-5 md:grid-cols-[190px_1fr] items-start">
                <button onClick={() => onSelectPlayer(mdRanking[0].teamId, mdRanking[0].playerName)} className="w-full max-w-[200px] mx-auto md:mx-0 cursor-pointer">
                  <FifaCard
                    card={mdRanking[0].card}
                    name={mdRanking[0].playerName}
                    imageUrl={photoOf(mdRanking[0].teamId, mdRanking[0].playerName)}
                    team={teamOf(mdRanking[0].teamId)}
                    games={mdRanking[0].games}
                  />
                </button>
                <div className="hl-card divide-y divide-white/[.06] overflow-hidden">
                  {mdRanking.slice(0, 5).map((p, i) => (
                    <RankRow key={`${p.teamId}-${p.playerName}`} rank={i + 1} p={p} teamOf={teamOf} photoOf={photoOf} onSelect={onSelectPlayer} showNote />
                  ))}
                </div>
              </div>
            )}
          </section>

          {/* HERO ONE */}
          <section>
            <h2 className="font-display font-black text-xl uppercase tracking-tight flex items-center gap-2 mb-4">
              <Crown className="w-5 h-5 text-hl-gold" /> <span className="hl-gold-text">HERO ONE</span> · Saison
            </h2>
            <div className="hl-card divide-y divide-white/[.06] overflow-hidden">
              {season.slice(0, 10).map((p, i) => (
                <RankRow key={`${p.teamId}-${p.playerName}`} rank={i + 1} p={p} teamOf={teamOf} photoOf={photoOf} onSelect={onSelectPlayer} />
              ))}
            </div>
          </section>

          {/* Goldener Handschuh */}
          {keepers.length > 0 && (
            <section>
              <h2 className="font-display font-black text-xl uppercase tracking-tight flex items-center gap-2 mb-4">
                <Hand className="w-5 h-5 text-hl-gold" /> Goldener Handschuh
              </h2>
              <div className="hl-card divide-y divide-white/[.06] overflow-hidden">
                {keepers.slice(0, 10).map((p, i) => (
                  <RankRow key={`${p.teamId}-${p.playerName}`} rank={i + 1} p={p} teamOf={teamOf} photoOf={photoOf} onSelect={onSelectPlayer} keeper />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

function RankRow({
  rank,
  p,
  teamOf,
  photoOf,
  onSelect,
  showNote,
  keeper,
}: {
  rank: number;
  p: RankedPlayer;
  teamOf: (id: string) => Team | undefined;
  photoOf: (id: string, name: string) => string | undefined;
  onSelect: (teamId: string, name: string) => void;
  showNote?: boolean;
  keeper?: boolean;
}) {
  const team = teamOf(p.teamId);
  const photo = photoOf(p.teamId, p.playerName);
  return (
    <button onClick={() => onSelect(p.teamId, p.playerName)} className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-white/[.03] transition-colors cursor-pointer">
      <span className="w-6 text-center font-display font-black tabular-nums text-hl-dim shrink-0">{rank}</span>
      {photo ? (
        <img src={photo} alt="" className="w-10 h-10 rounded-full object-cover shrink-0" />
      ) : (
        <div className="w-10 h-10 rounded-full bg-white/5 grid place-items-center text-sm text-hl-faint shrink-0">{p.playerName.charAt(0)}</div>
      )}
      <div className="flex-1 min-w-0">
        <div className="font-semibold truncate">{p.playerName}</div>
        <div className="text-[11px] text-hl-dim truncate">
          {team?.name ?? p.teamId} · {p.games} {p.games === 1 ? 'Spiel' : 'Spiele'}
          {keeper && p.cleanSheets > 0 ? ` · ${p.cleanSheets}× zu null` : ''}
        </div>
      </div>
      <div className="text-right shrink-0">
        <div className="font-display font-black tabular-nums leading-none" style={{ color: keeper ? '#E9C46A' : '#22DFC9' }}>
          {keeper ? p.card.ges : showNote ? p.avgNote.toFixed(1) : p.score.toFixed(1)}
        </div>
        <div className="text-[9px] uppercase tracking-wider text-hl-faint mt-0.5">{keeper ? 'GK-GES' : showNote ? 'Ø Note' : 'Score'}</div>
      </div>
      <ChevronRight className="w-4 h-4 text-hl-faint shrink-0" />
    </button>
  );
}
