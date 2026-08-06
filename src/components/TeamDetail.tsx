import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ChevronDown } from 'lucide-react';
import { Match, PlayerStat, Team, TeamSponsorsMap } from '../types';
import { calculateStandings } from '../lib/standings';
import { apiFetch } from '../lib/api';
import PlayerAvatar from './PlayerAvatar';
import { TeamCrest, FormPill, MatchStatusBadge, shortDate, shade, monogram, ImageZoom } from './ui';

// Modulweiter Cache der Team-Sponsoren: einmal je Seitenaufruf laden.
let teamSponsorsCache: TeamSponsorsMap | null = null;

interface TeamDetailProps {
  team: Team;
  teams: Team[];
  matches: Match[]; // Spiele der ausgewählten Saison
  players: PlayerStat[];
  seasonLabel: string;
  onBack: () => void;
  onSelectTeam: (teamId: string) => void;
}

export default function TeamDetail({
  team,
  teams,
  matches,
  players,
  seasonLabel,
  onBack,
  onSelectTeam,
}: TeamDetailProps) {
  const standings = useMemo(() => calculateStandings(teams, matches), [teams, matches]);
  const rank = standings.findIndex((s) => s.teamId === team.id) + 1;
  const standing = standings.find((s) => s.teamId === team.id);

  const teamMatches = useMemo(
    () =>
      matches
        .filter((m) => m.homeTeamId === team.id || m.awayTeamId === team.id)
        .sort((a, b) => a.matchday - b.matchday || a.date.localeCompare(b.date)),
    [matches, team.id]
  );

  // Nächstes Spiel: live vor geplant
  const nextMatch = useMemo(() => {
    const live = teamMatches.find((m) => m.status === 'live');
    if (live) return live;
    return [...teamMatches]
      .filter((m) => m.status === 'geplant')
      .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`))[0];
  }, [teamMatches]);

  // Kader mit Statistiken aus den Spieldaten verknüpfen
  const roster = useMemo(
    () =>
      (team.spielerliste || []).map((player) => {
        const stats = players.find((p) => p.teamId === team.id && p.name === player.name);
        return {
          ...player,
          goals: stats?.goals ?? 0,
          assists: stats?.assists ?? 0,
          matchesPlayed: stats?.matchesPlayed ?? 0,
        };
      }),
    [team.spielerliste, players]
  );

  // Star des Teams: bester Torschütze/Vorlagengeber des Kaders
  const star = useMemo(() => {
    const list = players.filter((p) => p.teamId === team.id && (p.goals > 0 || p.assists > 0));
    return [...list].sort((a, b) => b.goals - a.goals || b.assists - a.assists)[0] ?? null;
  }, [players, team.id]);

  // Lange „Spiele"-Liste standardmäßig eingeklappt (weniger Scrollen).
  const [showAllMatches, setShowAllMatches] = useState(false);

  // Team-/Trikot-Sponsoren dieses Vereins laden (modulweit gecacht).
  const [sponsorsMap, setSponsorsMap] = useState<TeamSponsorsMap>(teamSponsorsCache ?? {});
  useEffect(() => {
    if (teamSponsorsCache) return;
    apiFetch<TeamSponsorsMap>('/api/twitch?resource=team-sponsors')
      .then((data) => {
        teamSponsorsCache = data && typeof data === 'object' ? data : {};
        setSponsorsMap(teamSponsorsCache);
      })
      .catch(() => {
        /* noch nicht konfiguriert */
      });
  }, []);
  const sponsors = (sponsorsMap[team.id] || []).filter((s) => s.logoUrl);

  const opponent = (m: Match) => teams.find((t) => t.id === (m.homeTeamId === team.id ? m.awayTeamId : m.homeTeamId));

  const resultBadge = (m: Match) => {
    if (m.status !== 'beendet' || m.homeScore === null || m.awayScore === null) return null;
    const own = m.homeTeamId === team.id ? m.homeScore : m.awayScore;
    const other = m.homeTeamId === team.id ? m.awayScore : m.homeScore;
    if (own > other) return { ch: 'S', cls: 'bg-[rgba(67,229,160,.15)] text-hl-green-soft' };
    if (own < other) return { ch: 'N', cls: 'bg-[rgba(255,84,66,.15)] text-hl-red-soft' };
    return { ch: 'U', cls: 'bg-[rgba(233,196,106,.16)] text-[#F0CE77]' };
  };

  return (
    <div className="max-w-[1320px] mx-auto px-4 sm:px-10 pb-11">
      <button
        onClick={onBack}
        className="inline-flex items-center gap-1.5 mt-8 font-sans font-bold text-xs tracking-wider uppercase text-hl-dim hover:text-white transition-colors cursor-pointer"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Zurück zur Übersicht
      </button>

      {/* Vereinskopf */}
      <div className="relative overflow-hidden mt-4">
        <div
          className="absolute -top-40 -left-32 w-[560px] h-[560px] pointer-events-none opacity-60"
          style={{ background: `radial-gradient(circle, ${team.logoColor}22, transparent 66%)` }}
        />
        <div className="relative flex flex-col sm:flex-row items-start sm:items-center gap-6 flex-wrap py-6">
          {team.logoUrl ? (
            <ImageZoom
              src={team.logoUrl}
              alt={team.name}
              className="w-[118px] h-[118px] object-contain"
              zoomClassName="w-72 sm:w-96 max-w-[85vw] max-h-[80vh] object-contain"
            />
          ) : (
            <span
              className="grid place-items-center w-[118px] h-[118px] shrink-0 rounded-[32px] font-display font-black text-5xl text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,.18),0_18px_40px_rgba(0,0,0,.4)]"
              style={{ background: `linear-gradient(140deg, ${team.logoColor}, ${shade(team.logoColor, 0.45)})` }}
            >
              {monogram(team.shortName || team.name)}
            </span>
          )}
          <div className="flex-1 min-w-[260px]">
            <div className="font-sans font-extrabold text-xs tracking-[2.5px] text-brand-accent-light uppercase">
              HERO LEAGUE{rank > 0 ? ` · TABELLENPLATZ ${rank}` : ''}
            </div>
            <h1 className="mt-2 font-display font-black text-5xl sm:text-7xl leading-[.85] tracking-tight uppercase text-white">
              {team.name}
            </h1>
            <div className="flex gap-2.5 mt-4 flex-wrap">
              <div className="flex flex-col gap-[3px] px-4 py-[11px] rounded-xl bg-white/[.04] border border-white/10">
                <span className="font-sans font-bold text-[9.5px] tracking-[1.5px] text-hl-dim">KÜRZEL</span>
                <span className="font-sans font-bold text-sm text-hl-text">{team.shortName}</span>
              </div>
              {seasonLabel && (
                <div className="flex flex-col gap-[3px] px-4 py-[11px] rounded-xl bg-white/[.04] border border-white/10">
                  <span className="font-sans font-bold text-[9.5px] tracking-[1.5px] text-hl-dim">SAISON</span>
                  <span className="font-sans font-bold text-sm text-hl-text">{seasonLabel}</span>
                </div>
              )}
              {standing && (
                <div className="flex flex-col gap-[3px] px-4 py-[11px] rounded-xl bg-white/[.04] border border-white/10">
                  <span className="font-sans font-bold text-[9.5px] tracking-[1.5px] text-hl-dim">BILANZ</span>
                  <span className="font-sans font-bold text-sm text-hl-text">
                    {standing.won}S · {standing.drawn}U · {standing.lost}N
                  </span>
                </div>
              )}
            </div>
          </div>
          {standing && (
            <div className="flex gap-5 flex-none">
              <div className="text-center">
                <div className="font-display font-black text-[44px] leading-[.9] text-brand-accent-light">{standing.points}</div>
                <div className="font-sans font-bold text-[10px] tracking-[1.5px] text-hl-dim mt-1">PUNKTE</div>
              </div>
              <div className="w-px bg-white/10" />
              <div className="text-center">
                <div className="font-display font-black text-[44px] leading-[.9] text-white">{standing.goalsFor}</div>
                <div className="font-sans font-bold text-[10px] tracking-[1.5px] text-hl-dim mt-1">TORE</div>
              </div>
              <div className="w-px bg-white/10" />
              <div className="text-center flex flex-col items-center">
                <div className="flex gap-1 pt-3">
                  {standing.form.length === 0 ? (
                    <span className="text-xs text-hl-faint font-sans uppercase">–</span>
                  ) : (
                    standing.form.map((res, idx) => <FormPill key={idx} result={res} />)
                  )}
                </div>
                <div className="font-sans font-bold text-[10px] tracking-[1.5px] text-hl-dim mt-2">FORM</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Body: Kader + Sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.55fr_1fr] gap-6 items-start mt-6">
        {/* Kader */}
        <div>
          <div className="font-display font-black text-2xl uppercase text-white mb-4">Kader</div>
          {roster.length === 0 ? (
            <div className="hl-card p-8 text-center text-hl-mute font-sans text-sm">Noch keine Spieler hinterlegt.</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-[9px]">
              {roster.map((player) => (
                <div
                  key={player.name}
                  className="flex items-center gap-3 px-3.5 py-[11px] rounded-[13px] bg-[linear-gradient(180deg,rgba(255,255,255,.04),rgba(255,255,255,.012))] border border-white/[.08] backdrop-blur-sm transition-colors hover:border-[rgba(34,223,201,.3)]"
                >
                  {typeof player.number === 'number' && (
                    <span
                      className="flex-none w-7 text-center font-display font-black text-base text-brand-accent-light tabular-nums"
                      title={`Trikotnummer ${player.number}`}
                    >
                      {player.number}
                    </span>
                  )}
                  <PlayerAvatar name={player.name} imageUrl={player.imageUrl} color={team.logoColor} size="md" />
                  <div className="min-w-0 flex-1">
                    <div className="font-sans font-semibold text-sm text-hl-text truncate">{player.name}</div>
                    <div className="font-sans text-[11px] text-hl-dim">
                      {player.matchesPlayed} Sp. · {player.assists} Assists
                    </div>
                  </div>
                  {player.goals > 0 && (
                    <span className="flex-none font-sans font-extrabold text-[11px] text-brand-accent-light px-2 py-[3px] rounded-md bg-[rgba(34,223,201,.12)]">
                      {player.goals} ⚽
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Spiele – standardmäßig eingeklappt, per Klick alle anzeigen */}
          <button
            type="button"
            onClick={() => setShowAllMatches((v) => !v)}
            disabled={teamMatches.length === 0}
            className="w-full flex items-center justify-between gap-3 mb-4 mt-8 cursor-pointer disabled:cursor-default group"
            aria-expanded={showAllMatches}
          >
            <span className="font-display font-black text-2xl uppercase text-white">Spiele</span>
            {teamMatches.length > 0 && (
              <span className="inline-flex items-center gap-1.5 font-sans font-bold text-xs tracking-wider uppercase text-hl-dim group-hover:text-brand-accent-light transition-colors">
                {showAllMatches ? 'Einklappen' : `Alle ${teamMatches.length} anzeigen`}
                <ChevronDown className={`w-4 h-4 transition-transform ${showAllMatches ? 'rotate-180' : ''}`} />
              </span>
            )}
          </button>
          {teamMatches.length === 0 ? (
            <div className="hl-card p-8 text-center text-hl-mute font-sans text-sm">Noch keine Spiele in dieser Saison.</div>
          ) : showAllMatches ? (
            <div className="space-y-2">
              {teamMatches.map((m) => {
                const opp = opponent(m);
                const isHome = m.homeTeamId === team.id;
                const badge = resultBadge(m);
                return (
                  <div
                    key={m.id}
                    className="flex items-center justify-between gap-3 px-3.5 py-[11px] rounded-[13px] bg-[linear-gradient(180deg,rgba(255,255,255,.04),rgba(255,255,255,.012))] border border-white/[.08]"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-[10px] font-sans font-bold text-hl-faint shrink-0">{m.matchday}. Sp.</span>
                        <span className="text-[10px] font-sans font-bold text-hl-faint shrink-0 uppercase">{isHome ? 'H' : 'A'}</span>
                        {opp ? (
                          <button
                            onClick={() => onSelectTeam(opp.id)}
                            className="font-sans font-semibold text-hl-text truncate hover:text-brand-accent-light transition-colors cursor-pointer"
                            title={`${opp.name} – Vereinsseite öffnen`}
                          >
                            {opp.name}
                          </button>
                        ) : (
                          <span className="font-sans font-semibold text-hl-mute truncate">Unbekannt</span>
                        )}
                      </div>
                      <div className="text-[10px] font-sans font-semibold text-hl-faint mt-0.5">
                        {shortDate(m.date)} · {m.time} Uhr
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {m.status === 'live' && <MatchStatusBadge status="live" />}
                      {m.status === 'beendet' && m.homeScore !== null ? (
                        <span className="font-display font-black text-white text-base px-2.5 py-1 rounded-lg bg-white/[.04] border border-white/10">
                          {isHome ? `${m.homeScore}:${m.awayScore}` : `${m.awayScore}:${m.homeScore}`}
                        </span>
                      ) : m.status !== 'live' ? (
                        <span className="text-[10px] font-sans font-bold text-brand-accent-light uppercase tracking-wider">Geplant</span>
                      ) : null}
                      {badge && (
                        <span className={`grid place-items-center w-[22px] h-[22px] rounded-md font-sans font-extrabold text-[11px] ${badge.cls}`}>
                          {badge.ch}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowAllMatches(true)}
              className="w-full hl-card p-4 text-center text-hl-mute hover:text-white font-sans text-sm transition-colors cursor-pointer"
            >
              {teamMatches.length} Spiele der Saison anzeigen
            </button>
          )}
        </div>

        {/* Sidebar */}
        <div className="flex flex-col gap-[18px]">
          {/* Nächstes Spiel */}
          {nextMatch && (() => {
            const home = teams.find((t) => t.id === nextMatch.homeTeamId);
            const away = teams.find((t) => t.id === nextMatch.awayTeamId);
            if (!home || !away) return null;
            return (
              <div className="hl-card rounded-[20px] p-[22px]">
                <div className="font-sans font-extrabold text-[11px] tracking-[2px] text-brand-accent-light mb-4">
                  {nextMatch.status === 'live' ? 'JETZT LIVE' : 'NÄCHSTES SPIEL'}
                </div>
                <div className="font-sans font-semibold text-[11px] tracking-wider text-hl-dim mb-3.5 uppercase">
                  {new Date(nextMatch.date).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: 'short' })} · {nextMatch.time} UHR
                </div>
                <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                  <div className="flex flex-col items-center gap-2">
                    <TeamCrest name={home.name} shortName={home.shortName} color={home.logoColor} logoUrl={home.logoUrl} size="lg" onSelect={() => onSelectTeam(home.id)} />
                    <span className="font-sans font-semibold text-xs text-hl-text text-center">{home.name}</span>
                  </div>
                  <span className="font-display font-black text-xl text-brand-accent-light">
                    {nextMatch.status === 'live' ? `${nextMatch.homeScore ?? 0}:${nextMatch.awayScore ?? 0}` : 'VS'}
                  </span>
                  <div className="flex flex-col items-center gap-2">
                    <TeamCrest name={away.name} shortName={away.shortName} color={away.logoColor} logoUrl={away.logoUrl} size="lg" onSelect={() => onSelectTeam(away.id)} />
                    <span className="font-sans font-semibold text-xs text-hl-text text-center">{away.name}</span>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Partner / Trikot-Sponsoren dieses Teams */}
          {sponsors.length > 0 && (
            <div className="hl-card rounded-[20px] p-[22px]">
              <div className="font-sans font-extrabold text-[11px] tracking-[2px] text-brand-accent-light mb-4">
                PARTNER VON {team.name.toUpperCase()}
              </div>
              <div className="flex flex-wrap gap-2.5">
                {sponsors.map((s) => {
                  const tile = (
                    <img
                      src={s.logoUrl}
                      alt={s.name || 'Sponsor'}
                      loading="lazy"
                      decoding="async"
                      referrerPolicy="no-referrer"
                      className="h-11 w-auto max-w-[140px] object-contain"
                    />
                  );
                  const cls =
                    'flex items-center justify-center rounded-xl px-4 py-3 ring-1 ring-black/5 shadow-[0_2px_10px_rgba(0,0,0,.25)] transition-transform hover:scale-[1.03]';
                  const style = { background: s.bg || '#ffffff' };
                  return s.linkUrl ? (
                    <a key={s.id} href={s.linkUrl} target="_blank" rel="noopener noreferrer" title={s.name} className={cls} style={style}>
                      {tile}
                    </a>
                  ) : (
                    <span key={s.id} title={s.name} className={cls} style={style}>
                      {tile}
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          {/* Star des Teams */}
          {star && (
            <div className="hl-card rounded-[20px] p-[22px]">
              <div className="font-sans font-extrabold text-[11px] tracking-[2px] text-brand-accent-light mb-1.5">STAR DES TEAMS</div>
              <div className="flex items-center gap-3.5 mt-3">
                <PlayerAvatar name={star.name} imageUrl={star.imageUrl} color={team.logoColor} size="lg" />
                <div>
                  <div className="font-display font-black text-[22px] uppercase text-white leading-[.95]">{star.name}</div>
                  <div className="font-sans font-semibold text-xs text-hl-mute mt-1">{star.matchesPlayed} Einsätze</div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2.5 mt-4">
                <div className="bg-white/[.03] border border-white/[.07] rounded-xl p-3 text-center">
                  <div className="font-display font-black text-[26px] text-brand-accent-light">{star.goals}</div>
                  <div className="font-sans font-bold text-[9px] tracking-[1.5px] text-hl-dim mt-[3px]">TORE</div>
                </div>
                <div className="bg-white/[.03] border border-white/[.07] rounded-xl p-3 text-center">
                  <div className="font-display font-black text-[26px] text-white">{star.assists}</div>
                  <div className="font-sans font-bold text-[9px] tracking-[1.5px] text-hl-dim mt-[3px]">ASSISTS</div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
