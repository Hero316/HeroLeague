import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActiveTab, HeroImages, Match, PlayerOfMonth, PlayerStat, Team } from '../types';
import { apiFetch } from '../lib/api';
import { MapPin } from 'lucide-react';
import { calculateStandings } from '../lib/standings';
import { numberWord } from '../lib/heroAward';
import { TeamCrest, shortDate } from './ui';
import PlayerOfMonthCard from './PlayerOfMonthCard';

interface HeroProps {
  teams: Team[];
  matches: Match[];
  players: PlayerStat[];
  seasonLabel: string;
  seasonNumber?: number;
  heroImages?: HeroImages;
  pom?: PlayerOfMonth | null; // von oben vorgeladen (verhindert nachträglichen Slide → kein „Springen")
  onNavigate: (tab: ActiveTab) => void;
  onSelectTeam?: (teamId: string, playerName?: string) => void;
}

// Vollflächiges Hero-Carousel (Magenta-TV-Stil) mit drei Slides:
// 1. Nächster Spieltag / Live-Spiel  2. Spieler des Monats  3. Tabellenführer
export default function Hero({ teams, matches, players, seasonLabel, seasonNumber, heroImages, pom: pomProp, onNavigate, onSelectTeam }: HeroProps) {
  // pom kommt bevorzugt von oben (vorgeladen); nur ohne Prop selbst nachladen.
  const [pomState, setPomState] = useState<PlayerOfMonth | null>(null);
  const pom = pomProp !== undefined ? pomProp : pomState;
  const [active, setActive] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (pomProp !== undefined) return; // bereits von oben geliefert
    apiFetch<PlayerOfMonth>('/api/player-of-the-month')
      .then((data) => {
        if (data && data.name) setPomState(data);
      })
      .catch(() => {
        // Noch kein Spieler des Monats gepflegt
      });
  }, [pomProp]);

  const getTeam = (id: string) => teams.find((t) => t.id === id);

  // Vorgestellter Spieltag (Abend): live > nächster geplanter > letzter beendeter.
  // Es spielen mehrere Teams parallel an einem Abend – daher der ganze Spieltag statt ein Einzelspiel.
  const featuredDay = useMemo(() => {
    if (matches.length === 0) return null;
    const byDay = (day: number) =>
      matches
        .filter((m) => m.matchday === day)
        .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`) || (a.field ?? 0) - (b.field ?? 0));

    const live = [...matches].filter((m) => m.status === 'live').sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
    if (live.length) return { day: live[0].matchday, kind: 'live' as const, matches: byDay(live[0].matchday) };

    const upcoming = [...matches].filter((m) => m.status === 'geplant').sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
    if (upcoming.length) return { day: upcoming[0].matchday, kind: 'upcoming' as const, matches: byDay(upcoming[0].matchday) };

    const finished = [...matches].filter((m) => m.status === 'beendet').sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`));
    if (finished.length) return { day: finished[0].matchday, kind: 'finished' as const, matches: byDay(finished[0].matchday) };

    return null;
  }, [matches]);

  const standings = useMemo(() => calculateStandings(teams, matches), [teams, matches]);
  const leader = standings[0];
  const hasTable = standings.length > 0 && standings.some((s) => s.played > 0);

  // Slides dynamisch zusammenstellen – nur, was Daten hat
  const slides = useMemo(() => {
    const list: ('match' | 'pom' | 'table')[] = [];
    if (featuredDay) list.push('match');
    if (pom) list.push('pom');
    if (hasTable) list.push('table');
    if (list.length === 0) list.push('match'); // leerer Zustand
    return list;
  }, [featuredDay, pom, hasTable]);

  const count = slides.length;
  const current = active % count;

  const arm = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (count > 1) {
      timerRef.current = setInterval(() => setActive((a) => (a + 1) % count), 7000);
    }
  };

  useEffect(() => {
    arm();
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count]);

  const goTo = (i: number) => {
    setActive(((i % count) + count) % count);
    arm();
  };

  const primaryBtn =
    'inline-flex items-center gap-2 px-4 py-2.5 sm:gap-2.5 sm:px-6 sm:py-[15px] rounded-[11px] sm:rounded-[13px] bg-brand-accent-light text-[#062018] font-sans font-extrabold text-xs sm:text-sm tracking-wider shadow-[0_10px_30px_rgba(34,223,201,.28)] transition-all hover:-translate-y-0.5 hover:shadow-[0_16px_42px_rgba(34,223,201,.42)] active:scale-[.97] cursor-pointer';
  const secondaryBtn =
    'inline-flex items-center gap-2 px-4 py-2.5 sm:gap-2.5 sm:px-6 sm:py-[15px] rounded-[11px] sm:rounded-[13px] bg-white/5 border border-white/[.16] text-hl-text font-sans font-bold text-xs sm:text-sm tracking-wider transition-[color,border-color,background-color,transform] duration-150 ease-out hover:border-brand-accent-light hover:bg-[rgba(34,223,201,.06)] active:scale-[.97] cursor-pointer';

  const dotLabels: Record<string, string> = { match: 'SPIELTAG', pom: 'SPIELER DES MONATS', table: 'TABELLE' };

  // ---------- Slide 1: Spieltag (Abend-Übersicht) ----------
  const renderMatchSlide = () => {
    const dayMatches = featuredDay?.matches ?? [];
    const first = dayMatches[0];
    const venue = dayMatches.find((m) => m.venue && m.venue.trim())?.venue?.trim() || '';
    const dateLong = first
      ? new Date(first.date).toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: 'long' })
      : '';
    const dateShortWd = first
      ? new Date(first.date).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: 'long' })
      : '';
    const cnt = dayMatches.length;
    const games = cnt === 1 ? 'Begegnung' : 'Begegnungen';

    const kicker = !featuredDay
      ? seasonLabel || 'HERO LEAGUE'
      : featuredDay.kind === 'live'
      ? `JETZT LIVE · SPIELTAG ${featuredDay.day}`
      : featuredDay.kind === 'upcoming'
      ? 'NÄCHSTER SPIELTAG'
      : 'LETZTER SPIELTAG';

    const intro = !featuredDay
      ? ''
      : featuredDay.kind === 'live'
      ? `Der ${featuredDay.day}. Spieltag läuft gerade${venue ? ` in ${venue}` : ''} — ${cnt} ${games} an einem Abend. Verfolge die Ergebnisse live.`
      : featuredDay.kind === 'upcoming'
      ? `Der ${featuredDay.day}. Spieltag der Hero League steigt am ${dateLong}${first ? ` ab ${first.time} Uhr` : ''}${venue ? ` in ${venue}` : ''} — ${cnt} ${games} an einem Abend.`
      : `Der ${featuredDay.day}. Spieltag ist gespielt${venue ? ` in ${venue}` : ''} — alle Ergebnisse und die Tabelle findest du hier.`;

    return (
      <>
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute -inset-[5%] hl-zoom">
            <img src={heroImages?.match || '/assets/hero-stadium.png'} alt="" className="absolute inset-0 w-full h-full object-cover" />
          </div>
          <div className="absolute inset-0 bg-[radial-gradient(120%_120%_at_78%_30%,rgba(232,62,140,.22),transparent_55%)]" />
          {/* warmer Gold-Schein unten links – bricht das Einerlei, mehr Wärme */}
          <div className="absolute inset-0 bg-[radial-gradient(85%_85%_at_10%_92%,rgba(233,196,106,.16),transparent_55%)]" />
          <div className="absolute inset-0 bg-[linear-gradient(90deg,#0A1415_6%,rgba(6,14,15,.78)_34%,rgba(6,14,15,.2)_64%,transparent)]" />
          <div className="absolute inset-0 bg-[linear-gradient(0deg,#0A1415_2%,transparent_34%)]" />
        </div>
        <div className="relative max-w-[1320px] mx-auto px-4 sm:px-10 pt-7 pb-24 sm:pt-10 sm:pb-26 w-full flex items-center">
          <div className="w-full flex flex-col lg:flex-row items-start lg:items-center justify-between gap-5 sm:gap-8 lg:gap-11">
            <div className="max-w-[600px] hl-cascade">
              <div className="inline-flex items-center gap-2 px-3.5 py-2 rounded-full bg-[rgba(34,223,201,.1)] border border-[rgba(34,223,201,.3)]">
                <span className="w-[7px] h-[7px] rounded-full bg-brand-accent-light shadow-[0_0_10px_#22DFC9] hl-pulse" />
                <span className="font-sans font-extrabold text-[11px] tracking-[2.5px] text-brand-accent-light">{kicker}</span>
              </div>
              {featuredDay ? (
                <>
                  <h1 className="mt-5 font-display font-black text-[30px] sm:text-7xl xl:text-[92px] leading-[.85] tracking-tight sm:tracking-[-0.03em] xl:tracking-[-0.04em] uppercase text-white">
                    {featuredDay.day}.
                    <br />
                    <span className="text-brand-accent-light [text-shadow:0_0_46px_rgba(34,223,201,.4)]">Spieltag</span>
                  </h1>
                  <p className="mt-5 max-w-[460px] hidden sm:block text-[15px] sm:text-[16.5px] leading-relaxed text-hl-soft">{intro}</p>
                </>
              ) : (
                <>
                  <h1 className="mt-5 font-display font-black text-[30px] sm:text-7xl xl:text-[92px] leading-[.85] tracking-tight sm:tracking-[-0.03em] xl:tracking-[-0.04em] uppercase text-white">
                    Hero
                    <br />
                    <span className="text-brand-accent-light [text-shadow:0_0_46px_rgba(34,223,201,.4)]">League</span>
                  </h1>
                  <p className="mt-5 max-w-[440px] hidden sm:block text-[15px] sm:text-[16.5px] leading-relaxed text-hl-soft">
                    Die Saison startet in Kürze — sobald Spiele angesetzt sind, findest du hier alles live.
                  </p>
                </>
              )}
              <div className="hidden lg:flex gap-3 mt-7 flex-wrap">
                <button onClick={() => onNavigate('spielplan')} className={primaryBtn}>
                  ▸ SPIELPLAN ANSEHEN
                </button>
                <button onClick={() => onNavigate('tabelle')} className={secondaryBtn}>
                  TABELLE
                </button>
              </div>
            </div>

            {featuredDay && first && (
              <div className="flex-none w-full max-w-[368px] lg:max-w-[430px] relative rounded-[22px] overflow-hidden shadow-[0_30px_70px_rgba(0,0,0,.5)] hl-pop">
                <div className="absolute inset-0 bg-[linear-gradient(140deg,rgba(34,223,201,.16),rgba(232,62,140,.1)_62%,rgba(255,255,255,.02))] pointer-events-none" />
                <div className="relative bg-[rgba(11,17,17,.42)] border border-white/[.14] rounded-[22px] p-[22px] backdrop-blur-2xl backdrop-saturate-150 shadow-[inset_0_1px_0_rgba(255,255,255,.12)]">
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <span className="font-sans font-extrabold text-[10.5px] tracking-[2px] text-brand-accent-light uppercase">
                      {dateShortWd}
                    </span>
                    <span className="font-sans font-bold text-[10px] tracking-[1.5px] text-hl-magenta-soft px-2 py-[3px] rounded-md bg-[rgba(232,62,140,.14)]">
                      {featuredDay.kind === 'live' ? 'LIVE' : `SPIELTAG ${featuredDay.day}`}
                    </span>
                  </div>
                  {venue && (
                    <div className="flex items-center gap-1.5 text-[11.5px] text-hl-soft font-sans mb-3">
                      <MapPin className="w-3.5 h-3.5 text-brand-accent-light shrink-0" />
                      <span className="truncate">{venue}</span>
                    </div>
                  )}
                  <div className="border-t border-white/[.08] hl-cascade">
                    {dayMatches.slice(0, 5).map((m) => {
                      const h = getTeam(m.homeTeamId);
                      const a = getTeam(m.awayTeamId);
                      if (!h || !a) return null;
                      const isL = m.status === 'live';
                      const isF = m.status === 'beendet';
                      return (
                        <div key={m.id} className="flex items-center gap-1.5 py-2 border-b border-white/[.06] last:border-0">
                          <div className="flex items-center gap-1 flex-1 min-w-0 justify-end">
                            <span title={h.name} className="font-sans font-bold text-[11px] text-hl-text truncate">{h.name}</span>
                            <TeamCrest name={h.name} shortName={h.shortName} color={h.logoColor} logoUrl={h.logoUrl} size="sm" onSelect={onSelectTeam ? () => onSelectTeam(h.id) : undefined} />
                          </div>
                          <div className="w-[46px] shrink-0 flex flex-col items-center">
                            {isL || isF ? (
                              <span className={`font-display font-black text-[15px] leading-none ${isL ? 'text-brand-accent-light' : 'text-white'}`}>
                                {m.homeScore ?? 0}:{m.awayScore ?? 0}
                              </span>
                            ) : (
                              <span className="font-mono font-semibold text-[12px] text-hl-soft leading-none">{m.time}</span>
                            )}
                            {isL ? (
                              <span className="mt-1 flex items-center gap-1 text-[8px] font-sans font-extrabold tracking-[1px] text-hl-red-soft">
                                <span className="w-[5px] h-[5px] bg-hl-red rounded-full hl-pulse" /> LIVE
                              </span>
                            ) : m.field ? (
                              <span className="mt-1 text-[8.5px] font-sans font-semibold tracking-[.5px] text-hl-faint uppercase">Feld {m.field}</span>
                            ) : null}
                          </div>
                          <div className="flex items-center gap-1 flex-1 min-w-0">
                            <TeamCrest name={a.name} shortName={a.shortName} color={a.logoColor} logoUrl={a.logoUrl} size="sm" onSelect={onSelectTeam ? () => onSelectTeam(a.id) : undefined} />
                            <span title={a.name} className="font-sans font-bold text-[11px] text-hl-text truncate">{a.name}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {cnt > 5 && (
                    <div className="text-center text-[11px] text-hl-dim font-sans mt-2">+{cnt - 5} weitere Spiele</div>
                  )}
                  <button
                    onClick={() => onNavigate('spielplan')}
                    className="mt-3.5 w-full flex items-center justify-center gap-1.5 py-2 rounded-[11px] bg-white/[.05] hover:bg-[rgba(34,223,201,.1)] border border-white/[.12] hover:border-brand-accent-light/40 text-[11.5px] font-sans font-bold uppercase tracking-wider text-hl-soft hover:text-white transition-colors cursor-pointer"
                  >
                    Zum Spieltag · {shortDate(first.date)}
                  </button>
                </div>
              </div>
            )}
            {/* Buttons auf dem Handy unter der Karte */}
            <div className="flex lg:hidden gap-3 flex-wrap w-full">
              <button onClick={() => onNavigate('spielplan')} className={primaryBtn}>
                ▸ SPIELPLAN ANSEHEN
              </button>
              <button onClick={() => onNavigate('tabelle')} className={secondaryBtn}>
                TABELLE
              </button>
            </div>
          </div>
        </div>
      </>
    );
  };

  // ---------- Slide 2: Spieler des Monats ----------
  const renderPomSlide = () => {
    if (!pom) return null;
    // Team zuverlässig über die gespeicherte ID auflösen (Fallback: Name – für Altdaten)
    const pomTeam = (pom.teamId ? teams.find((t) => t.id === pom.teamId) : undefined) || teams.find((t) => t.name === pom.club);
    const crest = pomTeam
      ? { name: pomTeam.name, shortName: pomTeam.shortName, logoColor: pomTeam.logoColor, logoUrl: pomTeam.logoUrl }
      : undefined;
    const pomPoints = players.find(
      (p) => p.name === pom.name && (!pomTeam || p.teamId === pomTeam.id)
    )?.points;
    return (
      <>
        {/* Hintergrund: eigenes Foto (falls hochgeladen) mit Overlays, sonst das
            gestaltete Standard-Design – so bleiben Text und Karte gut lesbar. */}
        {heroImages?.pom ? (
          <div className="absolute inset-0 overflow-hidden">
            <div className="absolute -inset-[5%] hl-zoom">
              <img src={heroImages.pom} alt="" className="absolute inset-0 w-full h-full object-cover" />
            </div>
            <div className="absolute inset-0 bg-[radial-gradient(120%_120%_at_78%_30%,rgba(233,196,106,.2),transparent_55%)]" />
            <div className="absolute inset-0 bg-[linear-gradient(90deg,#0A1415_6%,rgba(6,14,15,.78)_34%,rgba(6,14,15,.2)_64%,transparent)]" />
            <div className="absolute inset-0 bg-[linear-gradient(0deg,#08110f_2%,transparent_34%)]" />
          </div>
        ) : (
          <div className="absolute inset-0 overflow-hidden">
            <div className="absolute inset-0 bg-[linear-gradient(180deg,#0c1a19,#0a1415_58%,#08110f)]" />
            <div className="absolute inset-0 bg-[radial-gradient(58%_70%_at_72%_36%,rgba(34,223,201,.22),transparent_60%)]" />
            <div className="absolute inset-0 bg-[radial-gradient(48%_60%_at_18%_18%,rgba(233,196,106,.10),transparent_55%)]" />
            <div className="absolute -inset-[10%] opacity-70 bg-[repeating-linear-gradient(115deg,transparent_0,transparent_46px,rgba(255,255,255,.02)_46px,rgba(255,255,255,.02)_47px)]" />
            <div className="absolute inset-0 bg-[linear-gradient(0deg,#08110f_2%,transparent_34%)]" />
          </div>
        )}
        <div className="relative max-w-[1320px] mx-auto px-4 sm:px-10 pt-8 pb-24 sm:pt-10 sm:pb-26 w-full flex items-center">
          <div className="w-full flex flex-col lg:flex-row items-center justify-between gap-6 lg:gap-11">
            {/* Textspalte */}
            <div className="max-w-[520px] hl-cascade text-center lg:text-left">
              <div className="inline-flex items-center gap-2 px-3.5 py-2 rounded-full bg-[rgba(233,196,106,.12)] border border-[rgba(233,196,106,.34)]">
                <span className="text-xs leading-none text-hl-gold">★</span>
                <span className="font-sans font-extrabold text-[11px] tracking-[2.5px] text-hl-gold">AUSZEICHNUNG</span>
              </div>
              <h1 className="mt-5 font-display font-black text-[30px] sm:text-7xl xl:text-[88px] leading-[.85] tracking-tight sm:tracking-[-0.03em] xl:tracking-[-0.04em] uppercase text-white">
                Spieler des
                <br />
                <span className="text-brand-accent-light [text-shadow:0_0_46px_rgba(34,223,201,.4)]">Monats</span>
              </h1>
              <p className="mt-5 max-w-[430px] mx-auto lg:mx-0 hidden sm:block text-[15px] sm:text-[16.5px] leading-relaxed text-hl-soft">
                Die herausragende Leistung des Monats in der Hero League.
              </p>
              {/* Buttons auf Desktop in der Textspalte */}
              <div className="hidden lg:flex gap-3 mt-7 flex-wrap justify-start">
                <button onClick={() => onNavigate('heroone')} className={primaryBtn}>
                  ▸ HERO {numberWord(seasonNumber ?? 1)}
                </button>
                <button onClick={() => onNavigate('statistiken')} className={secondaryBtn}>
                  STATISTIKEN
                </button>
              </div>
            </div>
            {/* Karte */}
            <div className="flex-none w-full max-w-[360px] hl-pop">
              <PlayerOfMonthCard
                pom={pom}
                crest={crest}
                points={pomPoints}
                onSelect={pomTeam && onSelectTeam ? () => onSelectTeam(pomTeam.id, pom.name) : undefined}
              />
            </div>
            {/* Buttons auf dem Handy unter der Karte */}
            <div className="flex lg:hidden gap-3 flex-wrap justify-center w-full">
              <button onClick={() => onNavigate('heroone')} className={primaryBtn}>
                ▸ HERO {numberWord(seasonNumber ?? 1)}
              </button>
              <button onClick={() => onNavigate('statistiken')} className={secondaryBtn}>
                STATISTIKEN
              </button>
            </div>
          </div>
        </div>
      </>
    );
  };

  // ---------- Slide 3: Tabellenführer ----------
  const renderTableSlide = () => {
    if (!leader) return null;
    const top4 = standings.slice(0, 4);
    const rankColors: Record<number, string> = { 1: '#E9C46A', 2: '#C9D1CC', 3: '#C98A5A' };
    return (
      <>
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute -inset-[5%] hl-zoom">
            <img src={heroImages?.table || '/assets/hero-crowd.png'} alt="" className="absolute inset-0 w-full h-full object-cover" />
          </div>
          <div className="absolute inset-0 bg-[radial-gradient(120%_120%_at_80%_30%,rgba(34,223,201,.2),transparent_55%)]" />
          {/* warmer Gold-Schein unten links – etwas mehr Wärme im Hero */}
          <div className="absolute inset-0 bg-[radial-gradient(85%_85%_at_10%_92%,rgba(233,196,106,.14),transparent_55%)]" />
          <div className="absolute inset-0 bg-[linear-gradient(90deg,#0A1415_6%,rgba(6,14,15,.78)_34%,rgba(6,14,15,.2)_64%,transparent)]" />
          <div className="absolute inset-0 bg-[linear-gradient(0deg,#0A1415_2%,transparent_34%)]" />
        </div>
        <div className="relative max-w-[1320px] mx-auto px-4 sm:px-10 pt-7 pb-24 sm:pt-10 sm:pb-26 w-full flex items-center">
          <div className="w-full flex flex-col lg:flex-row items-start lg:items-center justify-between gap-5 sm:gap-8 lg:gap-11">
            <div className="max-w-[560px] hl-cascade">
              <div className="inline-flex items-center gap-2 px-3.5 py-2 rounded-full bg-[rgba(34,223,201,.1)] border border-[rgba(34,223,201,.3)]">
                <span className="text-[11px] leading-none text-brand-accent-light">▲</span>
                <span className="font-sans font-extrabold text-[11px] tracking-[2.5px] text-brand-accent-light">TABELLENFÜHRER</span>
              </div>
              <h1 className="mt-5 font-display font-black text-[30px] sm:text-7xl xl:text-[96px] leading-[.85] tracking-tight sm:tracking-[-0.03em] xl:tracking-[-0.04em] uppercase text-white">
                An der
                <br />
                <span className="text-brand-accent-light [text-shadow:0_0_46px_rgba(34,223,201,.4)]">Spitze</span>
              </h1>
              <p className="mt-5 max-w-[430px] hidden sm:block text-[15px] sm:text-[16.5px] leading-relaxed text-hl-soft">
                {leader.teamName} führt die Hero League mit {leader.points} Punkten an
                {standings[1] ? ` — dicht gefolgt von ${standings[1].teamName}` : ''}. Das Titelrennen ist eröffnet.
              </p>
              <div className="hidden lg:flex gap-3 mt-7 flex-wrap">
                <button onClick={() => onNavigate('tabelle')} className={primaryBtn}>
                  ▸ TABELLE ANSEHEN
                </button>
                <button onClick={() => onNavigate('statistiken')} className={secondaryBtn}>
                  STATISTIKEN
                </button>
              </div>
            </div>
            <div className="flex-none w-full max-w-[340px] lg:max-w-[390px] relative rounded-[22px] overflow-hidden shadow-[0_30px_70px_rgba(0,0,0,.5)] hl-pop">
              <div className="absolute inset-0 bg-[linear-gradient(140deg,rgba(34,223,201,.16),rgba(232,62,140,.08)_62%,rgba(255,255,255,.02))] pointer-events-none" />
              <div className="relative bg-[rgba(11,17,17,.42)] border border-white/[.14] rounded-[22px] p-5 backdrop-blur-2xl backdrop-saturate-150 shadow-[inset_0_1px_0_rgba(255,255,255,.12)]">
                <div className="font-sans font-extrabold text-[10.5px] tracking-[2px] text-brand-accent-light mb-3.5">
                  TOP 4 · LIGATABELLE
                </div>
                <div className="hl-cascade">
                {top4.map((s, i) => {
                  const rank = i + 1;
                  return (
                    <div
                      key={s.teamId}
                      className={`flex items-center gap-3 px-3 py-3 rounded-xl mb-2 last:mb-0 ${
                        rank === 1
                          ? 'bg-[rgba(34,223,201,.08)] border border-[rgba(34,223,201,.2)]'
                          : 'bg-white/[.025] border border-white/[.06]'
                      }`}
                    >
                      <span
                        className="grid place-items-center w-[22px] h-[22px] rounded-[7px] font-display font-black text-[13px]"
                        style={
                          rankColors[rank]
                            ? { background: rank === 1 ? '#E9C46A' : 'transparent', color: rank === 1 ? '#0b0f0b' : rankColors[rank] }
                            : { color: '#59615a' }
                        }
                      >
                        {rank}
                      </span>
                      <TeamCrest name={s.teamName} shortName={s.shortName} color={s.logoColor} logoUrl={s.logoUrl} size="sm" onSelect={onSelectTeam ? () => onSelectTeam(s.teamId) : undefined} />
                      <span className="flex-1 font-sans font-bold text-[13.5px] text-hl-text truncate">{s.teamName}</span>
                      <span className={`font-display font-black text-lg ${rank === 1 ? 'text-brand-accent-light' : 'text-white'}`}>
                        {s.points}
                      </span>
                    </div>
                  );
                })}
                </div>
              </div>
            </div>
            {/* Buttons auf dem Handy unter der Karte */}
            <div className="flex lg:hidden gap-3 flex-wrap w-full">
              <button onClick={() => onNavigate('tabelle')} className={primaryBtn}>
                ▸ TABELLE ANSEHEN
              </button>
              <button onClick={() => onNavigate('statistiken')} className={secondaryBtn}>
                STATISTIKEN
              </button>
            </div>
          </div>
        </div>
      </>
    );
  };

  const renderSlide = (kind: 'match' | 'pom' | 'table') => {
    if (kind === 'match') return renderMatchSlide();
    if (kind === 'pom') return renderPomSlide();
    return renderTableSlide();
  };

  return (
    <div
      className="relative grid overflow-hidden min-h-[500px] sm:min-h-[640px] lg:min-h-[calc(100vh-118px)]"
      style={{ gridTemplateRows: 'minmax(min-content, 1fr)' }}
    >
      {/* Slides als Grid-Stack: Containerhöhe = höchster Slide, alle gleich hoch, nichts abgeschnitten */}
      {slides.map((kind, i) => (
        <div
          key={kind}
          className="col-start-1 row-start-1 relative flex flex-col justify-center transition-opacity duration-1000"
          style={{
            opacity: i === current ? 1 : 0,
            zIndex: i === current ? 2 : 1,
            pointerEvents: i === current ? 'auto' : 'none',
          }}
        >
          {renderSlide(kind)}
        </div>
      ))}

      {/* Pfeile */}
      {count > 1 && (
        <>
          <button
            onClick={() => goTo(current - 1)}
            aria-label="Vorheriges"
            className="absolute right-[94px] bottom-8 z-[7] w-11 h-11 rounded-full bg-[rgba(11,17,17,.5)] border border-white/[.16] text-white text-xl cursor-pointer backdrop-blur-md transition-[color,background-color,transform] duration-150 ease-out hover:bg-[rgba(34,223,201,.2)] active:scale-[.97]"
          >
            ‹
          </button>
          <button
            onClick={() => goTo(current + 1)}
            aria-label="Nächstes"
            className="absolute right-10 bottom-8 z-[7] w-11 h-11 rounded-full bg-[rgba(11,17,17,.5)] border border-white/[.16] text-white text-xl cursor-pointer backdrop-blur-md transition-[color,background-color,transform] duration-150 ease-out hover:bg-[rgba(34,223,201,.2)] active:scale-[.97]"
          >
            ›
          </button>
        </>
      )}

      {/* Dot-Pills */}
      {count > 1 && (
        <div className="absolute left-0 right-0 bottom-9 z-[6] hidden sm:flex justify-center gap-2.5 pointer-events-none">
          {slides.map((kind, i) => (
            <button
              key={kind}
              onClick={() => goTo(i)}
              className={`pointer-events-auto flex items-center gap-2 px-3.5 py-2 rounded-full border cursor-pointer transition-all active:scale-[.97] ${
                i === current
                  ? 'border-[rgba(34,223,201,.4)] bg-[rgba(34,223,201,.12)]'
                  : 'border-white/[.12] bg-white/[.03]'
              }`}
            >
              <span
                className={`w-[7px] h-[7px] rounded-full ${
                  i === current ? 'bg-brand-accent-light shadow-[0_0_8px_#22DFC9]' : 'bg-hl-faint'
                }`}
              />
              <span
                className={`font-sans text-[11px] tracking-[1.5px] ${
                  i === current ? 'font-extrabold text-brand-accent-light' : 'font-bold text-hl-dim'
                }`}
              >
                {dotLabels[kind]}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Weicher Übergang in den Seitenhintergrund */}
      <div className="absolute left-0 right-0 bottom-0 h-[150px] z-[5] bg-[linear-gradient(to_top,#0A1415_8%,transparent)] pointer-events-none" />
    </div>
  );
}
