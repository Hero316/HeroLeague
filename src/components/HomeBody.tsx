import React, { useEffect, useMemo, useState } from 'react';
import { ActiveTab, Match, PlayerStat, Team } from '../types';
import Tabelle from './Tabelle';
import PlayerAvatar from './PlayerAvatar';
import { TeamCrest, MatchStatusBadge, LiveBadge, shortDate } from './ui';

interface HomeBodyProps {
  teams: Team[];
  matches: Match[];
  players: PlayerStat[];
  seasonLabel: string;
  onNavigate: (tab: ActiveTab) => void;
  onSelectTeam: (teamId: string) => void;
}

// Inhalt der Startseite unter dem Hero: Tabelle + Spielplan-Karte,
// Top-Torschützen und Abschluss-CTA.
export default function HomeBody({ teams, matches, players, seasonLabel, onNavigate, onSelectTeam }: HomeBodyProps) {
  const getTeam = (id: string) => teams.find((t) => t.id === id);

  // Spieltage & aktueller Spieltag (erster mit offenen Spielen, sonst letzter)
  const matchdays = useMemo(
    () => Array.from(new Set(matches.map((m) => m.matchday))).sort((a, b) => a - b),
    [matches]
  );
  const defaultMatchday = useMemo(() => {
    const withOpen = matchdays.find((d) =>
      matches.some((m) => m.matchday === d && m.status !== 'beendet')
    );
    return withOpen ?? matchdays[matchdays.length - 1] ?? 1;
  }, [matchdays, matches]);
  const [activeMatchday, setActiveMatchday] = useState<number>(defaultMatchday);

  useEffect(() => {
    setActiveMatchday(defaultMatchday);
  }, [defaultMatchday]);

  const activeIndex = matchdays.indexOf(activeMatchday);
  const fixtures = matches
    .filter((m) => m.matchday === activeMatchday)
    .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));

  // Sichtbares Tab-Fenster (max. 2 Pills wie im Design)
  const windowStart = Math.max(0, Math.min(activeIndex, matchdays.length - 2));
  const visibleTabs = matchdays.slice(windowStart, windowStart + 2);

  const scorers = useMemo(
    () => [...players].filter((p) => p.goals > 0).sort((a, b) => b.goals - a.goals || b.assists - a.assists),
    [players]
  );
  const topScorer = scorers[0];
  const restScorers = scorers.slice(1, 5);

  return (
    <>
      {/* ===== Tabelle + Spielplan ===== */}
      <div className="max-w-[1320px] mx-auto px-4 sm:px-10 pt-6 pb-8 grid grid-cols-1 xl:grid-cols-[1.5fr_1fr] gap-6 items-start">
        {/* Tabellen-Karte */}
        <div>
          <div className="hl-card p-6 pb-5">
            <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <span className="w-[34px] h-[34px] rounded-[10px] bg-[rgba(34,223,201,.14)] border border-[rgba(34,223,201,.25)] flex items-end justify-center gap-[3px] p-2">
                  <span className="block w-1 h-2 bg-brand-accent-light rounded-[1px]" />
                  <span className="block w-1 h-[15px] bg-brand-accent-light rounded-[1px]" />
                  <span className="block w-1 h-[11px] bg-brand-accent-light rounded-[1px]" />
                </span>
                <div>
                  <div className="font-display font-black text-[23px] tracking-[.5px] uppercase text-white leading-tight">Ligatabelle</div>
                  <div className="font-sans font-semibold text-[11px] tracking-[1.5px] text-hl-dim mt-0.5 uppercase">
                    {seasonLabel ? `SAISON ${seasonLabel}` : 'HERO LEAGUE'}
                  </div>
                </div>
              </div>
              <button
                onClick={() => onNavigate('tabelle')}
                className="font-sans font-bold text-xs tracking-wider text-brand-accent-light hover:text-[#6FF0E0] cursor-pointer"
              >
                VOLLSTÄNDIGE TABELLE →
              </button>
            </div>
            <Tabelle teams={teams} matches={matches} onSelectTeam={onSelectTeam} compact />
          </div>
        </div>

        {/* Spielplan-Karte */}
        <div className="hl-card p-6 pb-[22px]">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <span className="w-[34px] h-[34px] rounded-[10px] bg-[rgba(67,229,160,.14)] border border-[rgba(67,229,160,.25)] relative flex items-center justify-center">
                <span className="absolute top-2 left-[9px] right-[9px] h-[3px] bg-hl-green rounded-sm" />
                <span className="block w-[13px] h-2 border-2 border-hl-green border-t-0 rounded-b-[3px] mt-[7px]" />
              </span>
              <div>
                <div className="font-display font-black text-[23px] tracking-[.5px] uppercase text-white leading-tight">Spielplan</div>
                <div className="font-sans font-semibold text-[11px] tracking-[1.5px] text-hl-dim mt-0.5">ERGEBNISSE &amp; ANSTÖSSE</div>
              </div>
            </div>
            <button
              onClick={() => onNavigate('spielplan')}
              className="font-sans font-bold text-xs tracking-wider text-hl-green hover:text-hl-green-soft cursor-pointer"
            >
              ALLES →
            </button>
          </div>

          {matchdays.length === 0 ? (
            <div className="py-10 text-center text-hl-mute font-sans text-sm">Noch keine Spiele angesetzt.</div>
          ) : (
            <>
              {/* Spieltag-Auswahl */}
              <div className="flex items-center gap-2 mb-[18px]">
                <button
                  onClick={() => activeIndex > 0 && setActiveMatchday(matchdays[activeIndex - 1])}
                  disabled={activeIndex <= 0}
                  className="w-[34px] h-[34px] flex-none rounded-[9px] bg-white/[.04] border border-white/10 text-hl-soft text-base cursor-pointer transition-colors hover:bg-white/[.09] disabled:opacity-25 disabled:pointer-events-none"
                  aria-label="Vorheriger Spieltag"
                >
                  ‹
                </button>
                {visibleTabs.map((day) => (
                  <button
                    key={day}
                    onClick={() => setActiveMatchday(day)}
                    className={`px-[15px] py-[9px] rounded-[10px] font-sans text-xs tracking-[.8px] cursor-pointer whitespace-nowrap ${
                      day === activeMatchday
                        ? 'bg-brand-accent-light text-[#08120a] font-extrabold'
                        : 'bg-white/[.04] border border-white/10 text-hl-mute font-bold'
                    }`}
                  >
                    {day}. SPIELTAG
                  </button>
                ))}
                <button
                  onClick={() => activeIndex < matchdays.length - 1 && setActiveMatchday(matchdays[activeIndex + 1])}
                  disabled={activeIndex >= matchdays.length - 1}
                  className="w-[34px] h-[34px] flex-none rounded-[9px] bg-white/[.04] border border-white/10 text-hl-soft text-base cursor-pointer ml-auto transition-colors hover:bg-white/[.09] disabled:opacity-25 disabled:pointer-events-none"
                  aria-label="Nächster Spieltag"
                >
                  ›
                </button>
              </div>

              {/* Spiele */}
              {fixtures.map((m) => {
                const home = getTeam(m.homeTeamId);
                const away = getTeam(m.awayTeamId);
                if (!home || !away) return null;
                const isLive = m.status === 'live';
                const upcoming = m.status === 'geplant';
                return (
                  <button
                    key={m.id}
                    onClick={() => onNavigate('spielplan')}
                    className={`block w-full text-left rounded-[14px] px-4 py-3.5 mb-3 last:mb-0 cursor-pointer transition-all hover:-translate-y-0.5 hover:border-[rgba(34,223,201,.45)] ${
                      isLive
                        ? 'bg-[linear-gradient(135deg,rgba(34,223,201,.08),rgba(255,255,255,.02))] border border-[rgba(34,223,201,.3)] shadow-[0_0_26px_rgba(34,223,201,.08)]'
                        : 'bg-white/[.025] border border-white/[.07]'
                    }`}
                  >
                    <div className="flex justify-between items-center mb-3">
                      <span className="font-sans font-semibold text-[11px] tracking-[.8px] text-hl-dim">
                        {shortDate(m.date)} · {m.time} Uhr
                      </span>
                      {isLive ? <LiveBadge liveStartedAt={m.liveStartedAt} /> : <MatchStatusBadge status={m.status} />}
                    </div>
                    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <TeamCrest name={home.name} shortName={home.shortName} color={home.logoColor} logoUrl={home.logoUrl} size="sm" />
                        <span className="font-sans font-semibold text-[13.5px] text-hl-text truncate">{home.name}</span>
                      </div>
                      {upcoming ? (
                        <div className="min-w-[60px] text-center font-sans font-extrabold text-sm tracking-[2px] text-hl-faint">VS</div>
                      ) : (
                        <div
                          className={`min-w-[60px] text-center font-display font-black text-[26px] leading-none ${
                            isLive ? 'text-brand-accent-light' : 'text-white'
                          }`}
                        >
                          {m.homeScore ?? 0} : {m.awayScore ?? 0}
                        </div>
                      )}
                      <div className="flex items-center gap-2 justify-end min-w-0">
                        <span className="font-sans font-semibold text-[13.5px] text-hl-text truncate text-right">{away.name}</span>
                        <TeamCrest name={away.name} shortName={away.shortName} color={away.logoColor} logoUrl={away.logoUrl} size="sm" />
                      </div>
                    </div>
                  </button>
                );
              })}
            </>
          )}
        </div>
      </div>

      {/* ===== Top-Torschützen ===== */}
      {topScorer && (
        <div className="max-w-[1320px] mx-auto px-4 sm:px-10 pt-2 pb-10">
          <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
            <div className="flex items-baseline gap-3.5 flex-wrap">
              <span className="font-sans font-extrabold text-[11px] tracking-[3px] text-brand-accent-light">TORJÄGERLISTE</span>
              <span className="font-display font-black text-[28px] tracking-[.5px] uppercase text-white">Torschützenkönig</span>
            </div>
            <button
              onClick={() => onNavigate('torschuetzen')}
              className="font-sans font-bold text-xs tracking-wider text-brand-accent-light hover:text-[#6FF0E0] cursor-pointer"
            >
              ALLE TORSCHÜTZEN →
            </button>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-[1.05fr_1fr] gap-6 items-stretch">
            {/* Featured #1 */}
            <div className="relative overflow-hidden rounded-[22px] bg-[linear-gradient(135deg,rgba(34,223,201,.14),rgba(10,14,11,.55))] border border-[rgba(34,223,201,.22)] p-6 sm:p-8">
              <span className="absolute right-1.5 -top-6 font-display font-black text-[220px] leading-none text-[rgba(34,223,201,.08)] pointer-events-none select-none">
                01
              </span>
              <div className="relative">
                <div className="font-sans font-extrabold text-[11px] tracking-[2px] text-brand-accent-light">GOLDENER SCHUH</div>
                <div className="flex items-center gap-4 mt-5">
                  <PlayerAvatar name={topScorer.name} imageUrl={topScorer.imageUrl} color={topScorer.teamLogoColor} size="lg" />
                  <div>
                    <div className="font-display font-black text-3xl sm:text-[34px] leading-[.92] uppercase text-white">{topScorer.name}</div>
                    <div className="flex items-center gap-2 mt-2">
                      <span
                        className="w-2 h-2 rounded-full inline-block"
                        style={{ backgroundColor: topScorer.teamLogoColor }}
                      />
                      <span className="font-sans font-semibold text-[13px] text-hl-mute">{topScorer.teamName}</span>
                    </div>
                  </div>
                </div>
                <div className="flex gap-6 sm:gap-[30px] mt-7">
                  <div>
                    <div className="font-display font-black text-5xl sm:text-[52px] leading-[.9] text-brand-accent-light">{topScorer.goals}</div>
                    <div className="font-sans font-bold text-[10px] tracking-[2px] text-hl-dim mt-1">TORE</div>
                  </div>
                  <div className="w-px bg-white/10" />
                  <div>
                    <div className="font-display font-black text-5xl sm:text-[52px] leading-[.9] text-white">{topScorer.assists}</div>
                    <div className="font-sans font-bold text-[10px] tracking-[2px] text-hl-dim mt-1">ASSISTS</div>
                  </div>
                  <div className="w-px bg-white/10" />
                  <div>
                    <div className="font-display font-black text-5xl sm:text-[52px] leading-[.9] text-white">{topScorer.matchesPlayed}</div>
                    <div className="font-sans font-bold text-[10px] tracking-[2px] text-hl-dim mt-1">SPIELE</div>
                  </div>
                </div>
              </div>
            </div>
            {/* Liste 2–5 */}
            <div className="flex flex-col gap-[11px]">
              {restScorers.map((s, i) => (
                <div
                  key={s.id}
                  className="flex items-center gap-3 sm:gap-[15px] px-4 py-[15px] rounded-[15px] bg-white/[.025] border border-white/[.06] transition-colors hover:border-[rgba(34,223,201,.3)] hover:bg-[rgba(34,223,201,.04)]"
                >
                  <span className="font-display font-black text-xl text-hl-faint w-[22px] text-center shrink-0">{i + 2}</span>
                  <PlayerAvatar name={s.name} imageUrl={s.imageUrl} color={s.teamLogoColor} size="md" />
                  <div className="min-w-0 flex-1">
                    <div className="font-sans font-bold text-[15px] text-hl-text truncate">{s.name}</div>
                    <div className="flex items-center gap-[7px] mt-1">
                      <span className="w-1.5 h-1.5 rounded-full inline-block shrink-0" style={{ backgroundColor: s.teamLogoColor }} />
                      <span className="font-sans text-xs text-hl-dim truncate">{s.teamName}</span>
                    </div>
                  </div>
                  <div className="flex items-baseline gap-1 shrink-0">
                    <span className="font-display font-black text-[26px] text-brand-accent-light">{s.goals}</span>
                    <span className="font-sans font-bold text-[11px] text-hl-dim">TORE</span>
                  </div>
                  <div className="w-px h-[26px] bg-white/[.08] hidden sm:block" />
                  <div className="hidden sm:flex items-baseline gap-1 w-[58px] justify-end">
                    <span className="font-display font-black text-xl text-hl-soft">{s.assists}</span>
                    <span className="font-sans font-bold text-[11px] text-hl-dim">A</span>
                  </div>
                </div>
              ))}
              {restScorers.length === 0 && (
                <div className="flex-1 flex items-center justify-center rounded-[15px] bg-white/[.025] border border-white/[.06] text-hl-mute font-sans text-sm py-10">
                  Noch keine weiteren Torschützen.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ===== Closer-CTA ===== */}
      <div className="relative overflow-hidden border-t border-white/[.07]">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -bottom-[260px] left-1/2 -translate-x-1/2 w-[900px] h-[520px] bg-[radial-gradient(circle,rgba(34,223,201,.16),transparent_65%)]" />
        </div>
        <div className="relative max-w-[1000px] mx-auto px-4 sm:px-10 py-16 sm:py-[88px] text-center">
          <div className="font-sans font-extrabold text-xs tracking-[3px] text-brand-accent-light uppercase">
            {seasonLabel ? `SAISON ${seasonLabel} · JETZT LIVE` : 'HERO LEAGUE · JETZT LIVE'}
          </div>
          <h2 className="mt-4 font-display font-black text-5xl sm:text-7xl xl:text-[84px] leading-[.86] tracking-tight uppercase text-white">
            SEI TEIL DER <span className="text-brand-accent-light [text-shadow:0_0_40px_rgba(34,223,201,.35)]">LEAGUE</span>
          </h2>
          <p className="mt-5 mx-auto max-w-[520px] text-base leading-relaxed text-hl-mute">
            Jeder Spieltag zählt. Verfolge jedes Tor, jede Tabelle und jeden Titelkampf — in Echtzeit.
          </p>
          <div className="flex gap-3.5 justify-center mt-8">
            <button
              onClick={() => onNavigate('spielplan')}
              className="inline-flex items-center gap-2.5 px-[30px] py-[17px] rounded-[13px] bg-brand-accent-light text-[#08120a] font-sans font-extrabold text-sm tracking-wider shadow-[0_10px_30px_rgba(34,223,201,.28)] transition-all hover:-translate-y-0.5 hover:shadow-[0_16px_42px_rgba(34,223,201,.42)] cursor-pointer"
            >
              ▸ ZUM LIVE-SPIELPLAN
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
