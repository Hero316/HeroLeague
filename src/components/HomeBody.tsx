import React, { useEffect, useMemo, useState } from 'react';
import { ActiveTab, Match, PlayerStat, Team } from '../types';
import Tabelle from './Tabelle';
import { TeamCrest, MatchStatusBadge, LiveBadge, shortDate } from './ui';
import { Reveal } from './anim';

interface HomeBodyProps {
  teams: Team[];
  matches: Match[];
  players: PlayerStat[];
  seasonLabel: string;
  onNavigate: (tab: ActiveTab) => void;
  onSelectTeam: (teamId: string) => void;
}

// Inhalt der Startseite unter dem Hero: Tabelle + Spielplan-Karte und Abschluss-CTA.
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

  return (
    <>
      {/* ===== Tabelle + Spielplan ===== */}
      <Reveal className="max-w-[1320px] mx-auto px-4 sm:px-10 pt-6 pb-8 grid grid-cols-1 xl:grid-cols-[1.5fr_1fr] gap-6 items-stretch">
        {/* Tabellen-Karte */}
        <div className="h-full">
          <div className="hl-card p-4 pb-4 sm:p-6 sm:pb-5 h-full">
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
                    {seasonLabel || 'HERO LEAGUE'}
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
        <div className="hl-card p-6 pb-[22px] flex flex-col h-full">
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

              {/* Spiele (auf der Startseite begrenzt) */}
              {fixtures.slice(0, 6).map((m) => {
                const home = getTeam(m.homeTeamId);
                const away = getTeam(m.awayTeamId);
                if (!home || !away) return null;
                const isLive = m.status === 'live';
                const upcoming = m.status === 'geplant';
                return (
                  <div
                    key={m.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => onNavigate('spielplan')}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onNavigate('spielplan');
                      }
                    }}
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
                      {isLive ? <LiveBadge liveStartedAt={m.liveStartedAt} durationMinutes={m.durationMinutes} pausedAt={m.pausedAt} /> : <MatchStatusBadge status={m.status} />}
                    </div>
                    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <TeamCrest name={home.name} shortName={home.shortName} color={home.logoColor} logoUrl={home.logoUrl} size="sm" onSelect={onSelectTeam ? () => onSelectTeam(home.id) : undefined} />
                        <span className="font-sans font-semibold text-[13px] sm:text-[13.5px] text-hl-text leading-tight break-words min-w-0">{home.name}</span>
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
                        <span className="font-sans font-semibold text-[13px] sm:text-[13.5px] text-hl-text leading-tight break-words min-w-0 text-right">{away.name}</span>
                        <TeamCrest name={away.name} shortName={away.shortName} color={away.logoColor} logoUrl={away.logoUrl} size="sm" onSelect={onSelectTeam ? () => onSelectTeam(away.id) : undefined} />
                      </div>
                    </div>
                  </div>
                );
              })}
              {/* Abschluss der Karte: fuellt die Hoehe & fuehrt zum vollen Spielplan */}
              <div className="mt-auto pt-4">
                {fixtures.length > 6 && (
                  <div className="text-center text-[11px] text-hl-dim font-sans mb-2.5">
                    +{fixtures.length - 6} weitere Spiele
                  </div>
                )}
                <button
                  onClick={() => onNavigate('spielplan')}
                  className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-[12px] bg-white/[.04] hover:bg-[rgba(67,229,160,.1)] border border-white/[.1] hover:border-[rgba(67,229,160,.4)] text-xs font-sans font-bold uppercase tracking-wider text-hl-soft hover:text-white transition-colors cursor-pointer"
                >
                  Ganzen Spielplan ansehen →
                </button>
              </div>
            </>
          )}
        </div>
      </Reveal>

      {/* ===== Closer-CTA (Abschluss) ===== */}
      <Reveal className="relative overflow-hidden border-t border-white/[.07]">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -bottom-[260px] left-1/2 -translate-x-1/2 w-[900px] h-[520px] bg-[radial-gradient(circle,rgba(34,223,201,.16),transparent_65%)]" />
        </div>
        <div className="relative max-w-[1000px] mx-auto px-4 sm:px-10 py-16 sm:py-[88px] text-center">
          <div className="font-sans font-extrabold text-xs tracking-[3px] text-brand-accent-light uppercase">
            {seasonLabel ? `${seasonLabel} · JETZT LIVE` : 'HERO LEAGUE · JETZT LIVE'}
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
      </Reveal>
    </>
  );
}
