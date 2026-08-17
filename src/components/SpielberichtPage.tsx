import React, { useMemo } from 'react';
import { ArrowLeft, ChevronRight } from 'lucide-react';
import type { Match, MatchPlayerStat, ScoringConfig, Team } from '../types';
import { notesForMatch } from '../lib/trackingView';

// ===========================================================================
// Spielbericht: Ergebnis + Einzelnoten aller Spieler beider Teams für EIN Spiel.
// Klick auf einen Spieler öffnet dessen Spieler-Seite (mit FIFA-Karte).
// ===========================================================================

interface Props {
  match: Match;
  teams: Team[];
  rows: MatchPlayerStat[];
  cfg: ScoringConfig;
  onBack: () => void;
  onSelectPlayer: (teamId: string, name: string) => void;
}

function noteColor(note: number, cfg: ScoringConfig): string {
  const span = cfg.rating.max - cfg.rating.min || 1;
  const t = Math.max(0, Math.min(1, (note - cfg.rating.min) / span));
  if (t < 0.5) return '#FF5442';
  if (t < 0.7) return '#E9C46A';
  return '#43E5A0';
}

export default function SpielberichtPage({ match, teams, rows, cfg, onBack, onSelectPlayer }: Props) {
  const home = teams.find((t) => t.id === match.homeTeamId);
  const away = teams.find((t) => t.id === match.awayTeamId);
  const entries = useMemo(() => notesForMatch(rows, cfg, match.id), [rows, cfg, match.id]);

  const photoFor = (teamId: string, name: string) =>
    teams.find((t) => t.id === teamId)?.spielerliste?.find((p) => p.name === name)?.imageUrl;

  const teamEntries = (teamId: string) => entries.filter((e) => e.teamId === teamId);
  const hasData = entries.length > 0;

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <button
        onClick={onBack}
        className="mb-6 text-xs font-bold uppercase tracking-wider text-hl-mute hover:text-white flex items-center gap-1.5 cursor-pointer"
      >
        <ArrowLeft className="w-4 h-4" /> Zurück
      </button>

      {/* Kopf: Ergebnis */}
      <div className="hl-card p-6 mb-6 flex items-center justify-center gap-5">
        <TeamHead team={home} align="right" />
        <div className="text-center shrink-0">
          <div className="font-display font-black text-4xl tabular-nums leading-none">
            {match.homeScore ?? '–'}<span className="text-hl-faint mx-1">:</span>{match.awayScore ?? '–'}
          </div>
          <div className="text-[10px] uppercase tracking-[2px] text-hl-dim mt-1">Spieltag {match.matchday}</div>
        </div>
        <TeamHead team={away} align="left" />
      </div>

      {!hasData ? (
        <div className="hl-card p-8 text-center text-hl-mute">Für dieses Spiel sind noch keine Werte veröffentlicht.</div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2">
          {[match.homeTeamId, match.awayTeamId].map((teamId) => (
            <div key={teamId}>
              <div className="text-[11px] uppercase tracking-[2px] text-hl-dim mb-2 px-1">
                {teams.find((t) => t.id === teamId)?.name ?? teamId}
              </div>
              <div className="hl-card divide-y divide-white/[.06] overflow-hidden">
                {teamEntries(teamId).map((e) => {
                  const photo = photoFor(e.teamId, e.playerName);
                  return (
                    <button
                      key={e.playerName}
                      onClick={() => onSelectPlayer(e.teamId, e.playerName)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-white/[.03] transition-colors cursor-pointer"
                    >
                      {photo ? (
                        <img src={photo} alt="" className="w-9 h-9 rounded-full object-cover shrink-0" />
                      ) : (
                        <div className="w-9 h-9 rounded-full bg-white/5 grid place-items-center text-xs text-hl-faint shrink-0">
                          {e.playerName.charAt(0)}
                        </div>
                      )}
                      <span className="flex-1 min-w-0 truncate font-semibold text-sm">
                        {e.playerName}
                        {e.role === 'keeper' && <span className="ml-1.5 text-[9px] uppercase tracking-wider text-hl-gold">TW</span>}
                      </span>
                      <span
                        className="font-display font-black tabular-nums text-lg"
                        style={{ color: noteColor(e.note, cfg) }}
                      >
                        {e.note.toFixed(1)}
                      </span>
                      <ChevronRight className="w-4 h-4 text-hl-faint shrink-0" />
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TeamHead({ team, align }: { team?: Team; align: 'left' | 'right' }) {
  return (
    <div className={`flex items-center gap-2.5 flex-1 min-w-0 ${align === 'right' ? 'justify-end text-right' : 'justify-start'}`}>
      {align === 'left' && <Crest team={team} />}
      <span className="font-display font-black uppercase tracking-tight truncate">{team?.name ?? '—'}</span>
      {align === 'right' && <Crest team={team} />}
    </div>
  );
}

function Crest({ team }: { team?: Team }) {
  if (!team) return <div className="w-10 h-10 rounded-xl bg-white/5 shrink-0" />;
  return team.logoUrl ? (
    <img src={team.logoUrl} alt="" className="w-10 h-10 object-contain shrink-0" />
  ) : (
    <div className="w-10 h-10 rounded-xl grid place-items-center text-xl shrink-0" style={{ background: `${team.logoColor}22`, color: team.logoColor }}>
      {team.logoIcon || '⚽'}
    </div>
  );
}
