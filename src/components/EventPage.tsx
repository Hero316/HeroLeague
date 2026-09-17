import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { CalendarDays, MapPin, ArrowLeft, Trophy, Clock, BarChart3, Swords, Shield, Lock, Goal, Crown, Star, Hand, Handshake, Printer, Ticket, ArrowRight, Target, Zap, Send, Sparkles, ChevronDown } from 'lucide-react';
import { EventConfig, MatchPlayerStat, ScoringConfig, Team } from '../types';
import { TeamCrest, LiveBadge } from './ui';
import { calculateEventStandings } from '../lib/eventStandings';
import { scorerRanking, assistRanking, goldenGloveRanking, seasonRanking, passLeaders, dribbleLeaders, duelLeaders, shotLeaders, ballWinnerLeaders, keyPassLeaders, type StatLeader } from '../lib/trackingAwards';
import { DEFAULT_SCORING } from '../lib/scoring';

interface EventPageProps {
  event: EventConfig;
  teams: Team[]; // echte Vereine – für Wappen/Farben, per Namensabgleich
  onBack: () => void;
  onSelectTeam?: (teamId: string) => void; // Klick aufs Wappen -> Vereinsseite (Fallback)
  isAdmin?: boolean;
  onPrint?: () => void; // Ergebniszettel öffnen (nur Admin)
  reportMatchIds?: Set<string>; // Event-Spiele mit veröffentlichtem Spielbericht
  onOpenReport?: (matchId: string) => void; // Klick aufs Spiel -> Event-Spielbericht
  onOpenEventTeam?: (teamName: string) => void; // Klick aufs Team -> Event-Team-Seite
  onOpenEventPlayer?: (teamName: string, playerName: string) => void; // Klick auf Spielernamen -> Spieler direkt geöffnet
  staffPreview?: boolean; // Event nur für Super-Admins sichtbar (Test-Modus)
  trackingRows?: MatchPlayerStat[]; // veröffentlichte getrackte Werte des Events
  scoringConfig?: ScoringConfig; // Score-Einstellungen (für die Award-Rechnung)
  tab?: EventTab; // aktiver Reiter (aus der URL – für Refresh/Zurück)
  onSelectTab?: (tab: EventTab) => void; // Reiter wechseln (schreibt in die URL)
  onOpenTickets?: () => void; // Zuschauer-Ticket-Anmeldung öffnen
}

// Untermenüs der Testspiel-Seite (wie die Reiter der Liga). Tabelle ist Standard.
export type EventTab = 'tabelle' | 'spielplan' | 'statistiken' | 'auszeichnungen';

// Spalten der Reiter-Leiste ab sm passend zur Anzahl (immer eine volle Reihe;
// als feste Klassen-Strings, damit Tailwind sie nicht wegpurged).
const SM_COLS: Record<number, string> = {
  1: 'sm:grid-cols-1',
  2: 'sm:grid-cols-2',
  3: 'sm:grid-cols-3',
  4: 'sm:grid-cols-4',
};

// Namen tolerant vergleichen (Groß/Klein, Leerzeichen, Punkte egal).
const normName = (s: string) =>
  s
    .toLowerCase()
    .replace(/\./g, '')
    .replace(/\s+/g, ' ')
    .trim();

// Sonder-Event-Seite (z.B. Testspieltag): Kopf + Live-Tabelle + kompletter
// Spielplan mit Uhrzeiten und Feldern – im Look der Hauptseite, aber mit
// eigener Magenta/Gold-Farbwelt, damit es sich besonders anfühlt.
export default function EventPage({ event, teams, onBack, onSelectTeam, isAdmin, onPrint, reportMatchIds, onOpenReport, onOpenEventTeam, onOpenEventPlayer, staffPreview, trackingRows = [], scoringConfig, tab: tabProp, onSelectTab, onOpenTickets }: EventPageProps) {
  const standings = useMemo(
    () => calculateEventStandings(event.teams, event.matches),
    [event.teams, event.matches]
  );

  // Teamname -> echtes Vereins-Wappen (falls der Name mit einem Verein übereinstimmt).
  const crestFor = (name: string) => teams.find((t) => normName(t.name) === normName(name));
  // Klick-Handler fürs Wappen: bevorzugt die Event-Team-Seite (für ALLE Event-Teams),
  // sonst – falls der Name einem echten Verein entspricht – dessen Liga-Seite.
  const crestClick = (name: string) => {
    if (onOpenEventTeam) return () => onOpenEventTeam(name);
    const t = crestFor(name);
    return t && onSelectTeam ? () => onSelectTeam(t.id) : undefined;
  };
  // Klick auf einen SPIELERNAMEN (Auszeichnungen/Torschützenliste): öffnet direkt
  // den Spieler auf seiner Event-Team-Seite. Fällt auf den Team-Klick zurück.
  const playerClick = (teamName: string, playerName: string) =>
    onOpenEventPlayer ? () => onOpenEventPlayer(teamName, playerName) : crestClick(teamName);

  // Abend-Statistiken (team-basiert, nur aus den Event-Ergebnissen – völlig
  // getrennt von der echten Liga).
  const stats = useMemo(() => {
    const playedMatches = event.matches.filter((m) => m.homeScore !== null && m.awayScore !== null);
    if (playedMatches.length === 0) return null;

    const cleanSheets: Record<string, number> = {};
    let totalGoals = 0;
    let topMatch: { label: string; goals: number } | null = null;
    playedMatches.forEach((m) => {
      const hs = m.homeScore as number;
      const as = m.awayScore as number;
      totalGoals += hs + as;
      if (as === 0) cleanSheets[m.home] = (cleanSheets[m.home] ?? 0) + 1;
      if (hs === 0) cleanSheets[m.away] = (cleanSheets[m.away] ?? 0) + 1;
      const g = hs + as;
      if (!topMatch || g > topMatch.goals) topMatch = { label: `${m.home} ${hs}:${as} ${m.away}`, goals: g };
    });

    const playedStandings = standings.filter((s) => s.played > 0);
    const bestOffense = [...playedStandings].sort((a, b) => b.goalsFor - a.goalsFor)[0];
    const bestDefense = [...playedStandings].sort((a, b) => a.goalsAgainst - b.goalsAgainst)[0];
    const csEntries = Object.entries(cleanSheets).sort((a, b) => b[1] - a[1]);
    const mostCleanSheets = csEntries[0] ?? null;

    return { totalGoals, bestOffense, bestDefense, mostCleanSheets, topMatch, playedCount: playedMatches.length };
  }, [event.matches, standings]);

  // Auszeichnungen des Abends – aus den getrackten Daten (wie die Liga):
  // Torschützenkönig/Vorlagen aus getrackten Toren/Vorlagen, bester Spieler nach
  // HERO-Score, bester Torwart nach dem Goldenen-Handschuh-Score (Tracking).
  const cfg = scoringConfig ?? DEFAULT_SCORING;
  const scorers = useMemo(() => scorerRanking(trackingRows, cfg), [trackingRows, cfg]);
  const assists = useMemo(() => assistRanking(trackingRows, cfg), [trackingRows, cfg]);
  const keepers = useMemo(() => goldenGloveRanking(trackingRows, cfg), [trackingRows, cfg]);
  const hero = useMemo(() => seasonRanking(trackingRows, cfg), [trackingRows, cfg]);
  const scorerKing = scorers[0] ?? null;
  const assistKing = assists[0] ?? null;
  const glove = keepers[0] ?? null;
  const bestPlayer = hero[0] ?? null;

  // Bestenlisten (Top 10) aus den getrackten Werten für die Statistik-Seite.
  const passers = useMemo(() => passLeaders(trackingRows, cfg), [trackingRows, cfg]);
  const dribblers = useMemo(() => dribbleLeaders(trackingRows, cfg), [trackingRows, cfg]);
  const duellists = useMemo(() => duelLeaders(trackingRows, cfg), [trackingRows, cfg]);
  const shooters = useMemo(() => shotLeaders(trackingRows, cfg), [trackingRows, cfg]);
  const ballWinners = useMemo(() => ballWinnerLeaders(trackingRows, cfg), [trackingRows, cfg]);
  const keyPassers = useMemo(() => keyPassLeaders(trackingRows, cfg), [trackingRows, cfg]);
  const hasLeaderboards =
    passers.length + dribblers.length + duellists.length + shooters.length + ballWinners.length + keyPassers.length > 0;
  // Bester Scorer: Tore UND Vorlagen zusammengezählt.
  const scorerPoints = useMemo(() => {
    const key = (t: string, p: string) => `${t}::${p}`;
    const map = new Map<string, { playerName: string; teamId: string; goals: number; assists: number }>();
    for (const g of scorers) map.set(key(g.teamId, g.playerName), { playerName: g.playerName, teamId: g.teamId, goals: g.goals, assists: 0 });
    for (const a of assists) {
      const k = key(a.teamId, a.playerName);
      const cur = map.get(k);
      if (cur) cur.assists = a.assists;
      else map.set(k, { playerName: a.playerName, teamId: a.teamId, goals: 0, assists: a.assists });
    }
    return [...map.values()]
      .map((v) => ({ ...v, total: v.goals + v.assists }))
      .filter((v) => v.total > 0)
      .sort((a, b) => b.total - a.total || b.goals - a.goals || a.playerName.localeCompare(b.playerName));
  }, [scorers, assists]);
  const topScorer = scorerPoints[0] ?? null;

  const hasAwards = Boolean(scorerKing || assistKing || bestPlayer || glove);

  // Aufgeklappte Auszeichnung (Akkordeon: es ist immer höchstens eine offen).
  const [openAward, setOpenAward] = useState<string | null>(null);
  const toggleAward = (id: string) => setOpenAward((cur) => (cur === id ? null : id));

  // Alle Auszeichnungen an einer Stelle – Kopf (Erstplatzierter) + volle Rangliste.
  const awardItems: AwardItem[] = useMemo(() => {
    const list: AwardItem[] = [];
    if (scorerKing)
      list.push({
        id: 'scorer', icon: <Crown className="w-4 h-4" />, label: 'Torschützenkönig',
        playerName: scorerKing.playerName, teamId: scorerKing.teamId,
        sub: `${scorerKing.goals} ${scorerKing.goals === 1 ? 'Tor' : 'Tore'} · ${scorerKing.teamId}`,
        rows: scorers.map((r) => ({ playerName: r.playerName, teamId: r.teamId, value: String(r.goals) })),
      });
    if (assistKing)
      list.push({
        id: 'assist', icon: <Handshake className="w-4 h-4" />, label: 'Meiste Vorlagen',
        playerName: assistKing.playerName, teamId: assistKing.teamId,
        sub: `${assistKing.assists} ${assistKing.assists === 1 ? 'Vorlage' : 'Vorlagen'} · ${assistKing.teamId}`,
        rows: assists.map((r) => ({ playerName: r.playerName, teamId: r.teamId, value: String(r.assists) })),
      });
    if (topScorer)
      list.push({
        id: 'points', icon: <Target className="w-4 h-4" />, label: 'Bester Scorer',
        playerName: topScorer.playerName, teamId: topScorer.teamId,
        sub: `${topScorer.total} Scorerpunkte · ${topScorer.goals} T / ${topScorer.assists} V`,
        rows: scorerPoints.map((r) => ({
          playerName: r.playerName, teamId: r.teamId, value: String(r.total), note: `${r.goals} T / ${r.assists} V`,
        })),
      });
    if (bestPlayer)
      list.push({
        id: 'best', icon: <Star className="w-4 h-4" />, label: 'Bester Spieler',
        playerName: bestPlayer.playerName, teamId: bestPlayer.teamId, sub: bestPlayer.teamId,
        rows: hero.map((r) => ({ playerName: r.playerName, teamId: r.teamId, value: r.score.toFixed(1) })),
      });
    if (glove)
      list.push({
        id: 'keeper', icon: <Hand className="w-4 h-4" />, label: 'Bester Torwart',
        playerName: glove.playerName, teamId: glove.teamId, sub: glove.teamId,
        rows: keepers.map((r) => ({ playerName: r.playerName, teamId: r.teamId, value: r.score.toFixed(1) })),
      });
    return list;
  }, [scorerKing, assistKing, topScorer, bestPlayer, glove, scorers, assists, scorerPoints, hero, keepers]);

  // Aktives Untermenü. Wird von außen über die URL gesteuert (tabProp/onSelectTab),
  // damit es Refresh und „Zurück" übersteht; ohne Steuerung als Fallback intern.
  // Tabelle und Spielplan gibt es immer; Statistiken/Auszeichnungen nur mit Daten –
  // so stehen unten nur so viele Tasten wie es Untermenüs mit Inhalt gibt.
  const [internalTab, setInternalTab] = useState<EventTab>('tabelle');
  const tabs = [
    { id: 'tabelle' as const, label: 'Tabelle', icon: Trophy },
    { id: 'spielplan' as const, label: 'Spielplan', icon: Clock },
    ...(stats ? [{ id: 'statistiken' as const, label: 'Statistiken', icon: BarChart3 }] : []),
    ...(hasAwards ? [{ id: 'auszeichnungen' as const, label: 'Auszeichnungen', icon: Star }] : []),
  ];
  const availableIds = tabs.map((t) => t.id);
  const wantTab = onSelectTab ? tabProp : internalTab;
  // Zeigt der (URL-)Reiter auf ein noch leeres Untermenü, sauber auf Tabelle zurück.
  const activeTab: EventTab = wantTab && availableIds.includes(wantTab) ? wantTab : 'tabelle';
  const selectTab = (t: EventTab) => (onSelectTab ? onSelectTab(t) : setInternalTab(t));
  const reduce = useReducedMotion();

  // Spiele nach Block gruppieren (für die Blockdarstellung mit Zeitfenster).
  const blocks = useMemo(() => {
    const map = new Map<number, typeof event.matches>();
    [...event.matches]
      .sort((a, b) => a.block - b.block || a.field - b.field)
      .forEach((m) => {
        const arr = map.get(m.block) ?? [];
        arr.push(m);
        map.set(m.block, arr);
      });
    return Array.from(map.entries()).sort((a, b) => a[0] - b[0]);
  }, [event.matches]);

  const renderTeam = (name: string, align: 'left' | 'right') => {
    const crest = crestFor(name);
    const click = crestClick(name);
    return (
      <div className={`flex items-center gap-2 min-w-0 ${align === 'right' ? 'flex-row-reverse text-right' : ''}`}>
        <span className="shrink-0 pointer-events-auto">
          <TeamCrest
            name={name}
            shortName={crest?.shortName ?? name.slice(0, 3).toUpperCase()}
            color={crest?.logoColor ?? '#E6238E'}
            logoUrl={crest?.logoUrl}
            size="sm"
            onSelect={click}
          />
        </span>
        {click ? (
          <button onClick={(e) => { e.stopPropagation(); click(); }} className="pointer-events-auto font-sans font-semibold text-sm text-white truncate min-w-0 hover:text-hl-magenta-soft transition-colors cursor-pointer">{name}</button>
        ) : (
          <span className="font-sans font-semibold text-sm text-white truncate min-w-0">{name}</span>
        )}
      </div>
    );
  };

  return (
    <div className="relative overflow-x-clip">
      {staffPreview && (
        <div className="bg-[rgba(230,35,142,.12)] border-b border-[rgba(230,35,142,.4)] px-4 py-2.5 text-center">
          <span className="inline-flex items-center gap-2 text-[12px] sm:text-sm font-sans font-bold text-[#ff9ad4]">
            <Lock className="w-4 h-4" />
            Test-Modus: Nur für Super-Admins sichtbar – Besucher sehen dieses Event noch nicht.
          </span>
        </div>
      )}
      {/* Kopf mit eigener Farbwelt – optional mit dezentem Hintergrundbild */}
      <div className="relative overflow-hidden border-b border-[rgba(230,35,142,.25)] bg-brand-dark">
        {/* Hintergrund: entweder das Event-Bild (dezent, mit Magenta-Filter und
            Verlauf ins Dunkle) oder – ohne Bild – die bisherige Magenta-Radial-Optik. */}
        {event.heroImage ? (
          <div aria-hidden className="absolute inset-0 z-0 pointer-events-none">
            <img
              src={event.heroImage}
              alt=""
              className="absolute inset-0 w-full h-full object-cover object-center opacity-[0.30]"
            />
            {/* leichter Magenta-Filter in der Testspiel-Farbe (oben am stärksten) */}
            <div className="absolute inset-0 bg-[radial-gradient(120%_150%_at_50%_-15%,rgba(230,35,142,.55),rgba(230,35,142,.14)_42%,transparent_72%)]" />
            {/* nach unten sauber ins Seiten-Dunkel (#0A1415) verschwinden lassen */}
            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(10,20,21,.30)_0%,rgba(10,20,21,.12)_30%,rgba(10,20,21,.72)_78%,#0A1415_100%)]" />
          </div>
        ) : (
          <div
            aria-hidden
            className="absolute inset-0 z-0 pointer-events-none bg-[radial-gradient(120%_140%_at_50%_-10%,rgba(230,35,142,.28),transparent_60%)]"
          />
        )}
        <div className="relative z-10 max-w-[1320px] xl:max-w-[1600px] 2xl:max-w-[1780px] mx-auto px-4 sm:px-10 py-10 sm:py-14">
          <button
            onClick={onBack}
            className="flex w-fit items-center gap-1.5 text-xs font-sans font-bold uppercase tracking-wider text-hl-mute hover:text-white transition-colors cursor-pointer mb-6"
          >
            <ArrowLeft className="w-4 h-4" />
            Zurück
          </button>

          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[rgba(230,35,142,.15)] border border-[rgba(230,35,142,.4)] mb-4">
            <span className="w-2 h-2 rounded-full bg-[#E6238E] hl-pulse" />
            <span className="font-sans font-extrabold text-[11px] tracking-[2px] text-[#ff7ac4] uppercase">Spontanes Event</span>
          </div>

          <h1 className="font-display font-black text-4xl sm:text-6xl uppercase tracking-tight text-white leading-[.95]">
            {event.title}
          </h1>
          {event.tagline && (
            <p className="mt-3 font-sans text-sm sm:text-base text-hl-soft max-w-2xl">{event.tagline}</p>
          )}

          <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm font-sans text-hl-mute">
            {event.dateLabel && (
              <span className="inline-flex items-center gap-2">
                <CalendarDays className="w-4 h-4 text-[#E6238E]" />
                {event.dateLabel}
              </span>
            )}
            {event.location && (
              <span className="inline-flex items-center gap-2">
                <MapPin className="w-4 h-4 text-[#E6238E]" />
                {event.location}
              </span>
            )}
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            {onOpenTickets && (
              <button
                onClick={onOpenTickets}
                className="group inline-flex items-center gap-2 px-5 py-3 rounded-2xl text-white text-sm font-display font-black uppercase tracking-wide transition-all cursor-pointer active:scale-[.98]"
                style={{ background: 'linear-gradient(135deg,#7a0f49,#E6238E)', boxShadow: '0 14px 34px -14px rgba(230,35,142,.8)' }}
              >
                <Ticket className="w-4 h-4" />
                Zuschauer-Tickets sichern
                <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
              </button>
            )}
            {isAdmin && onPrint && (
              <button
                onClick={onPrint}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full border border-[rgba(230,35,142,.4)] bg-[rgba(230,35,142,.1)] text-[#ff9ad4] hover:bg-[rgba(230,35,142,.2)] text-xs font-bold uppercase tracking-wider transition-all cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                Ergebniszettel drucken
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Untermenü-Tasten (Reiter) – beim Öffnen immer „Tabelle". Am Handy 2×2,
          ab sm nebeneinander. Nur Reiter mit Inhalt werden gezeigt. */}
      <div className="max-w-[1320px] xl:max-w-[1600px] 2xl:max-w-[1780px] mx-auto px-4 sm:px-10 pt-6 sm:pt-8">
        <div className={`grid grid-cols-2 gap-2 sm:gap-3 ${SM_COLS[tabs.length] ?? 'sm:grid-cols-4'}`}>
          {tabs.map((t) => {
            const active = t.id === activeTab;
            const Icon = t.icon;
            return (
              <motion.button
                key={t.id}
                type="button"
                onClick={() => selectTab(t.id)}
                aria-pressed={active}
                whileTap={{ scale: 0.95 }}
                transition={{ type: 'spring', stiffness: 420, damping: 26 }}
                className={`relative flex items-center justify-center gap-2 rounded-2xl px-3 py-3.5 sm:py-4 font-display font-black uppercase tracking-tight text-[13px] sm:text-base cursor-pointer border overflow-hidden ${
                  active
                    ? 'border-[#E6238E] text-white'
                    : 'bg-white/[.03] border-white/10 text-hl-mute hover:text-white hover:border-[rgba(230,35,142,.4)] transition-colors'
                }`}
              >
                {active && (
                  <motion.span
                    layoutId="eventTabActive"
                    transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                    className="absolute inset-0 bg-[#E6238E] shadow-[0_10px_30px_rgba(230,35,142,.35)]"
                  />
                )}
                <Icon className="w-4 h-4 shrink-0 relative z-10" />
                <span className="truncate relative z-10">{t.label}</span>
              </motion.button>
            );
          })}
        </div>
      </div>

      {/* Inhalt des aktiven Reiters – wechselt mit einer weichen Aufplopp-Animation */}
      <div className="max-w-[1320px] xl:max-w-[1600px] 2xl:max-w-[1780px] mx-auto px-4 sm:px-10 py-6 sm:py-8">
        <motion.div
          key={activeTab}
          initial={reduce ? false : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.34, ease: [0.22, 0.61, 0.36, 1] }}
        >
        {/* Tabelle */}
        {activeTab === 'tabelle' && (
        <section className="min-w-0">
          <div className="flex items-center gap-2 mb-4">
            <Trophy className="w-5 h-5 text-[#E9C46A]" />
            <h2 className="font-display font-black text-xl uppercase tracking-tight text-white">Tabelle</h2>
          </div>
          <div className="overflow-x-auto rounded-2xl border border-white/10 bg-[rgba(255,255,255,.02)]">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] font-mono uppercase tracking-wider text-hl-mute border-b border-white/10">
                  <th className="py-2.5 pl-4 pr-2 text-left w-8">#</th>
                  <th className="py-2.5 px-2 text-left">Team</th>
                  <th className="py-2.5 px-2 text-center w-8" title="Spiele">Sp</th>
                  <th className="py-2.5 px-2 text-center w-8 hidden sm:table-cell" title="Siege">S</th>
                  <th className="py-2.5 px-2 text-center w-8 hidden sm:table-cell" title="Unentschieden">U</th>
                  <th className="py-2.5 px-2 text-center w-8 hidden sm:table-cell" title="Niederlagen">N</th>
                  <th className="py-2.5 px-2 text-center w-12" title="Tore">Tore</th>
                  <th className="py-2.5 px-2 text-center w-10" title="Tordifferenz">TD</th>
                  <th className="py-2.5 pr-4 pl-2 text-center w-10" title="Punkte">Pkt</th>
                </tr>
              </thead>
              <tbody>
                {standings.map((row, i) => {
                  const crest = crestFor(row.team);
                  return (
                    <tr key={row.team} className="border-b border-white/[.06] last:border-0">
                      <td className="py-2.5 pl-4 pr-2 font-display font-black text-hl-mute">{i + 1}</td>
                      <td className="py-2.5 px-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <TeamCrest
                            name={row.team}
                            shortName={crest?.shortName ?? row.team.slice(0, 3).toUpperCase()}
                            color={crest?.logoColor ?? '#E6238E'}
                            logoUrl={crest?.logoUrl}
                            size="sm"
                            onSelect={crestClick(row.team)}
                          />
                          {crestClick(row.team) ? (
                            <button onClick={crestClick(row.team)} className="font-sans font-semibold text-white truncate min-w-0 hover:text-hl-magenta-soft transition-colors cursor-pointer text-left">{row.team}</button>
                          ) : (
                            <span className="font-sans font-semibold text-white truncate min-w-0">{row.team}</span>
                          )}
                        </div>
                      </td>
                      <td className="py-2.5 px-2 text-center text-hl-soft">{row.played}</td>
                      <td className="py-2.5 px-2 text-center text-hl-soft hidden sm:table-cell">{row.won}</td>
                      <td className="py-2.5 px-2 text-center text-hl-soft hidden sm:table-cell">{row.drawn}</td>
                      <td className="py-2.5 px-2 text-center text-hl-soft hidden sm:table-cell">{row.lost}</td>
                      <td className="py-2.5 px-2 text-center text-hl-soft whitespace-nowrap">
                        {row.goalsFor}:{row.goalsAgainst}
                      </td>
                      <td className="py-2.5 px-2 text-center text-hl-soft">
                        {row.goalDifference > 0 ? `+${row.goalDifference}` : row.goalDifference}
                      </td>
                      <td className="py-2.5 pr-4 pl-2 text-center font-display font-black text-white">{row.points}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-[11px] font-sans text-hl-mute">
            Die Tabelle aktualisiert sich automatisch, sobald Ergebnisse eingetragen werden.
          </p>
        </section>
        )}

        {/* Spielplan – Blöcke nebeneinander (weniger Scrollen, wie in der Liga) */}
        {activeTab === 'spielplan' && (
        <section className="min-w-0">
          <div className="flex items-center gap-2 mb-4">
            <Clock className="w-5 h-5 text-[#E6238E]" />
            <h2 className="font-display font-black text-xl uppercase tracking-tight text-white">Spielplan</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 items-start hl-cascade">
            {blocks.map(([block, ms]) => {
              const start = ms[0]?.start;
              const end = ms[0]?.end;
              return (
                <div key={block} className="rounded-2xl border border-white/10 bg-[rgba(255,255,255,.02)] overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-2 bg-white/[.03] border-b border-white/[.06]">
                    <span className="font-sans font-bold text-[11px] tracking-wider uppercase text-hl-mute">
                      Block {block}
                    </span>
                    <span className="font-mono text-xs text-[#ff7ac4]">
                      {start}{end ? `–${end}` : ''}
                    </span>
                  </div>
                  <div className="divide-y divide-white/[.06]">
                    {ms.map((m) => {
                      const played = m.homeScore !== null && m.awayScore !== null;
                      const isLive = m.status === 'live';
                      const canReport = !!onOpenReport && !!reportMatchIds?.has(m.id);
                      return (
                        <div key={m.id} className={`relative px-4 py-3 ${isLive ? 'bg-red-500/[.07]' : ''} ${canReport ? 'hover:bg-white/[.03] transition-colors' : ''}`}>
                          {canReport && (
                            <button
                              type="button"
                              onClick={() => onOpenReport!(m.id)}
                              aria-label="Spielbericht ansehen"
                              className="absolute inset-0 z-0 cursor-pointer"
                            />
                          )}
                          <div className={`relative z-10 ${canReport ? 'pointer-events-none' : ''}`}>
                          {/* Feld/Live als dezente Kopfzeile ÜBER den Teams – so haben die
                              Team- und Spielernamen die volle Breite (kein Abschneiden am Handy). */}
                          <div className="flex items-center justify-between gap-2 mb-1.5 text-[10px] font-mono uppercase tracking-wider text-hl-mute leading-none">
                            <span className="shrink-0">{m.field ? `Feld ${m.field}` : m.start}</span>
                            {isLive && <LiveBadge liveStartedAt={m.liveStartedAt} />}
                          </div>
                          <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 min-w-0">
                            {renderTeam(m.home, 'left')}
                            <span
                              className={`px-2.5 py-1 rounded-md font-display font-black text-sm tabular-nums shrink-0 ${
                                isLive ? 'bg-red-500/20 text-red-300' : played ? 'bg-white/[.06] text-white' : 'text-hl-mute'
                              }`}
                            >
                              {played ? `${m.homeScore} : ${m.awayScore}` : isLive ? '– : –' : 'vs'}
                            </span>
                            {renderTeam(m.away, 'right')}
                          </div>
                          {(m.scorers ?? []).some((s) => s.player) && (
                            <div className="mt-2 flex gap-3">
                              {/* Torschützen des Heimteams – links */}
                              <div className="flex-1 min-w-0 space-y-0.5">
                                {(m.scorers ?? [])
                                  .filter((s) => s.player && s.team === m.home)
                                  .map((s, i) => (
                                    <div key={i} className="flex items-center gap-1 text-[11px] font-sans text-hl-soft">
                                      <span className="text-[#ff7ac4]">⚽</span>
                                      <span className="truncate min-w-0">
                                        {s.player}
                                        {s.assist ? <span className="text-hl-mute"> · Vorlage {s.assist}</span> : null}
                                      </span>
                                    </div>
                                  ))}
                              </div>
                              {/* Torschützen des Auswärtsteams – rechts */}
                              <div className="flex-1 min-w-0 space-y-0.5 text-right">
                                {(m.scorers ?? [])
                                  .filter((s) => s.player && s.team === m.away)
                                  .map((s, i) => (
                                    <div key={i} className="flex flex-row-reverse items-center gap-1 text-[11px] font-sans text-hl-soft">
                                      <span className="text-[#ff7ac4]">⚽</span>
                                      <span className="truncate min-w-0">
                                        {s.player}
                                        {s.assist ? <span className="text-hl-mute"> · Vorlage {s.assist}</span> : null}
                                      </span>
                                    </div>
                                  ))}
                              </div>
                            </div>
                          )}
                          {canReport && (
                            <div className="mt-2 text-[10px] uppercase tracking-wider text-[#ff7ac4]/80 font-sans font-bold">
                              Spielbericht ansehen ›
                            </div>
                          )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
        )}

        {/* Statistiken vom Abend */}
        {activeTab === 'statistiken' && (
        <div>
        <div className="flex items-center gap-2 mb-4">
          <BarChart3 className="w-5 h-5 text-[#ff7ac4]" />
          <h2 className="font-display font-black text-xl uppercase tracking-tight text-white">Statistiken vom Abend</h2>
        </div>

        {stats ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 hl-cascade">
            {stats.bestOffense && (
              <StatTile
                icon={<Swords className="w-4 h-4" />}
                label="Beste Offensive"
                value={stats.bestOffense.team}
                sub={`${stats.bestOffense.goalsFor} Tore`}
                crest={crestFor(stats.bestOffense.team)}
                onSelect={crestClick(stats.bestOffense.team)}
              />
            )}
            {stats.bestDefense && (
              <StatTile
                icon={<Shield className="w-4 h-4" />}
                label="Beste Defensive"
                value={stats.bestDefense.team}
                sub={`${stats.bestDefense.goalsAgainst} Gegentore`}
                crest={crestFor(stats.bestDefense.team)}
                onSelect={crestClick(stats.bestDefense.team)}
              />
            )}
            {stats.mostCleanSheets && (
              <StatTile
                icon={<Lock className="w-4 h-4" />}
                label="Meiste Zu-Null-Spiele"
                value={stats.mostCleanSheets[0]}
                sub={`${stats.mostCleanSheets[1]}× zu Null`}
                crest={crestFor(stats.mostCleanSheets[0])}
                onSelect={crestClick(stats.mostCleanSheets[0])}
              />
            )}
            <StatTile
              icon={<Goal className="w-4 h-4" />}
              label="Tore insgesamt"
              value={String(stats.totalGoals)}
              sub={`in ${stats.playedCount} Spielen`}
            />
          </div>
        ) : (
          <div className="rounded-2xl border border-white/10 bg-[rgba(255,255,255,.02)] px-4 py-8 text-center text-sm text-hl-mute font-sans">
            Sobald die ersten Ergebnisse eingetragen sind, erscheinen hier die Bestwerte des Abends.
          </div>
        )}

        {hasLeaderboards && (
          <div className="mt-9">
            <div className="flex items-center gap-2 mb-1">
              <BarChart3 className="w-5 h-5 text-[#ff7ac4]" />
              <h3 className="font-display font-black text-lg uppercase tracking-tight text-white">Bestenlisten des Abends</h3>
            </div>
            <p className="text-[12px] text-hl-mute font-sans mb-4">Aus den live getrackten Spielen — Top 10 je Kategorie.</p>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 hl-cascade">
              <LeaderboardCard title="Beste Passquote" accent="#22DFC9" icon={<Send className="w-4 h-4" />} rows={passers} crestFor={crestFor} onPlayer={playerClick} mode="quote" />
              <LeaderboardCard title="Beste Zweikampfquote" accent="#43E5A0" icon={<Swords className="w-4 h-4" />} rows={duellists} crestFor={crestFor} onPlayer={playerClick} mode="quote" />
              <LeaderboardCard title="Beste Dribbling-Quote" accent="#E9C46A" icon={<Zap className="w-4 h-4" />} rows={dribblers} crestFor={crestFor} onPlayer={playerClick} mode="quote" />
              <LeaderboardCard title="Meiste Torschüsse" accent="#ff7ac4" icon={<Target className="w-4 h-4" />} rows={shooters} crestFor={crestFor} onPlayer={playerClick} />
              <LeaderboardCard title="Balleroberer" accent="#58F0CD" icon={<Shield className="w-4 h-4" />} rows={ballWinners} crestFor={crestFor} onPlayer={playerClick} />
              <LeaderboardCard title="Schlüsselpässe" accent="#c99bff" icon={<Sparkles className="w-4 h-4" />} rows={keyPassers} crestFor={crestFor} onPlayer={playerClick} />
            </div>
          </div>
        )}
        </div>
        )}

        {/* Auszeichnungen des Abends – mehrere Ehrungen, nicht nur ein Spieler */}
        {activeTab === 'auszeichnungen' && hasAwards && (
          <div>
            <div className="flex items-center gap-2 mb-4">
              <Star className="w-5 h-5 text-[#E9C46A]" />
              <h2 className="font-display font-black text-xl uppercase tracking-tight text-white">Auszeichnungen</h2>
            </div>
            <AwardsBoard
              items={awardItems}
              openId={openAward}
              onToggle={toggleAward}
              crestFor={crestFor}
              playerClick={playerClick}
            />
          </div>
        )}
        </motion.div>
      </div>
    </div>
  );
}

// Kompakte Statistik-Kachel
// Bestenliste (Top 10) mit Rang, Wappen, Name, Hauptwert und optionaler Quote.
function LeaderboardCard({
  title,
  accent,
  icon,
  rows,
  crestFor,
  onPlayer,
  mode = 'count',
}: {
  title: string;
  accent: string;
  icon: React.ReactNode;
  rows: StatLeader[];
  crestFor: (name: string) => Team | undefined;
  onPlayer: (teamName: string, playerName: string) => () => void;
  mode?: 'count' | 'quote'; // 'quote' = Prozent groß (nach Quote sortiert), 'count' = Menge groß
}) {
  if (!rows.length) return null;
  return (
    <div className="rounded-2xl border border-white/10 bg-[rgba(255,255,255,.02)] p-3.5 min-w-0">
      <div className="flex items-center gap-2 mb-2.5">
        <span style={{ color: accent }}>{icon}</span>
        <h4 className="font-display font-black uppercase tracking-tight text-white text-sm truncate">{title}</h4>
      </div>
      <ol className="space-y-0.5">
        {rows.map((p, i) => {
          const t = crestFor(p.teamId);
          const pct = p.quote != null ? `${Math.round(p.quote * 100)}%` : null;
          return (
            <li key={`${p.teamId}::${p.playerName}`}>
              <button
                onClick={onPlayer(p.teamId, p.playerName)}
                className="w-full flex items-center gap-2 rounded-lg px-1.5 py-1.5 hover:bg-white/[.05] transition-colors cursor-pointer text-left"
              >
                <span
                  className="w-4 shrink-0 text-center font-display font-black tabular-nums text-xs"
                  style={{ color: i === 0 ? accent : undefined }}
                >
                  {i + 1}
                </span>
                <TeamCrest name={p.teamId} shortName={t?.shortName} color={t?.logoColor ?? '#E6238E'} logoUrl={t?.logoUrl} size="xs" />
                <span className="flex-1 min-w-0 truncate font-sans font-semibold text-sm text-white">{p.playerName}</span>
                {mode === 'quote' ? (
                  <>
                    <span className="shrink-0 font-mono text-[11px] text-hl-dim tabular-nums">{p.value}×</span>
                    <span className="shrink-0 w-10 text-right font-display font-black tabular-nums text-white text-sm">{pct ?? '–'}</span>
                  </>
                ) : (
                  <>
                    {pct && <span className="shrink-0 font-mono text-[11px] text-hl-dim tabular-nums">{pct}</span>}
                    <span className="shrink-0 w-7 text-right font-display font-black tabular-nums text-white text-sm">{p.value}</span>
                  </>
                )}
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

// Kompakte Statistik-Kachel (Abend-Statistiken – ohne Aufklappen).
function StatTile({
  icon,
  label,
  value,
  sub,
  crest,
  onSelect,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  crest?: Team;
  onSelect?: () => void;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-[rgba(255,255,255,.02)] p-4">
      <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-wider text-hl-mute mb-3">
        <span className="text-[#ff7ac4]">{icon}</span>
        {label}
      </div>
      <div className="flex items-center gap-2 min-w-0">
        {crest && (
          <span className="shrink-0">
            <TeamCrest name={crest.name} shortName={crest.shortName} color={crest.logoColor} logoUrl={crest.logoUrl} size="sm" onSelect={onSelect} />
          </span>
        )}
        {onSelect ? (
          <button onClick={onSelect} className="font-display font-black text-white text-lg leading-tight truncate min-w-0 hover:text-hl-magenta-soft transition-colors cursor-pointer text-left">{value}</button>
        ) : (
          <span className="font-display font-black text-white text-lg leading-tight truncate min-w-0">{value}</span>
        )}
      </div>
      <div className="mt-1 text-xs font-sans text-hl-soft">{sub}</div>
    </div>
  );
}

// Auszeichnungen als eine zusammenhängende Blase:
// Die Kachelreihe bleibt IMMER stehen – keine Kachel rutscht weg. Die geöffnete
// Kachel wächst nach unten in ein Feld über die volle Breite, das nahtlos an ihr
// hängt: die Naht unter der aktiven Kachel wird mit einem Verbinder überdeckt,
// dessen Position und Breite live an der Kachel gemessen werden (damit es bei
// jeder Spaltenzahl und jeder Fenstergröße passt).
export interface AwardItem {
  id: string;
  icon: React.ReactNode;
  label: string;
  playerName: string;
  teamId: string;
  sub: string;
  rows: { playerName: string; teamId: string; value: string; note?: string }[];
}

const AWARD_BORDER = 'rgba(232, 62, 140, .45)';
// DECKEND, nicht durchscheinend: Nur so kann die Kachel die Kante der Blase
// unter sich wirklich verdecken. Entspricht optisch 6% Magenta über #0A1415.
const AWARD_BG = '#17171c';

function AwardsBoard({
  items,
  openId,
  onToggle,
  crestFor,
  playerClick,
}: {
  items: AwardItem[];
  openId: string | null;
  onToggle: (id: string) => void;
  crestFor: (teamId: string) => Team | undefined;
  playerClick: (teamId: string, playerName: string) => (() => void) | undefined;
}) {
  const reduce = useReducedMotion();
  const open = items.find((a) => a.id === openId) ?? null;

  // Bouncy, aber kurz. Feder, weil man mitten in der Bewegung eine andere
  // Kachel anklicken kann – sie trägt die Geschwindigkeit weiter.
  const grow = reduce
    ? { duration: 0 }
    : ({ type: 'spring', duration: 0.5, bounce: 0.22 } as const);

  return (
    <div className="relative">
      {/* Kachelreihe – steht fest, egal was aufgeklappt ist. */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3">
        {items.map((a) => {
          const isOpen = a.id === openId;
          const crest = crestFor(a.teamId);
          const go = playerClick(a.teamId, a.playerName);
          const expandable = a.rows.length > 1;
          const stop = (e: React.MouseEvent) => e.stopPropagation();
          return (
            <div
              key={a.id}
              onClick={expandable ? () => onToggle(a.id) : undefined}
              role={expandable ? 'button' : undefined}
              tabIndex={expandable ? 0 : undefined}
              onKeyDown={
                expandable
                  ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(a.id); } }
                  : undefined
              }
              aria-expanded={expandable ? isOpen : undefined}
              className={`relative rounded-2xl border p-4 transition-colors duration-200 ${
                expandable ? 'cursor-pointer' : ''
              } ${isOpen ? 'z-20 rounded-b-none' : 'z-10 bg-[rgba(255,255,255,.02)] hover:bg-white/[.045] hover:border-white/25'}`}
              style={
                isOpen
                  ? { borderColor: AWARD_BORDER, borderBottomColor: 'transparent', background: AWARD_BG }
                  : { borderColor: 'rgba(255,255,255,.1)' }
              }
            >
              {/* Deckt die obere Kante der Blase exakt unter dieser Kachel ab,
                  damit Kachel und Blase eine durchgehende Form ergeben. */}
              {isOpen && (
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute -left-px -right-px"
                  style={{ bottom: -2, height: 3, background: AWARD_BG }}
                />
              )}
              <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-wider text-hl-mute mb-3">
                <span className="text-[#ff7ac4]">{a.icon}</span>
                <span className="truncate">{a.label}</span>
                {expandable && (
                  <span
                    className={`ml-auto w-7 h-7 shrink-0 grid place-items-center rounded-lg border transition-colors duration-200 ${
                      isOpen ? 'border-hl-magenta/60 bg-hl-magenta/20 text-hl-magenta-soft' : 'border-white/15 bg-white/[.06] text-hl-soft'
                    }`}
                  >
                    <ChevronDown className={`w-5 h-5 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} strokeWidth={2.75} />
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 min-w-0">
                {crest && (
                  <span className="shrink-0" onClick={stop}>
                    <TeamCrest name={crest.name} shortName={crest.shortName} color={crest.logoColor} logoUrl={crest.logoUrl} size="sm" onSelect={go} />
                  </span>
                )}
                {go ? (
                  <button onClick={(e) => { stop(e); go(); }} className="font-display font-black text-white text-lg leading-tight truncate min-w-0 hover:text-hl-magenta-soft transition-colors cursor-pointer text-left">{a.playerName}</button>
                ) : (
                  <span className="font-display font-black text-white text-lg leading-tight truncate min-w-0">{a.playerName}</span>
                )}
              </div>
              <div className="mt-1 text-xs font-sans text-hl-soft truncate">{a.sub}</div>
            </div>
          );
        })}
      </div>

      {/* Die Blase: wächst unter der Reihe auf und hängt nahtlos an der Kachel. */}
      {/* Die Blase. Oberkante GERADE (keine runden Ecken oben): nur so trifft sie
          die geraden Unterkanten der Kachel. Runde Ecken oben kurven an den Seiten
          weg und reißen die Form auf. -1px Überlappung, damit zwischen Reihe und
          Blase keine Haarlinie stehen bleibt. */}
      <AnimatePresence initial={false} mode="wait">
        {open && (
          <motion.div
            key={open.id}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={grow}
            style={{ borderColor: AWARD_BORDER, background: AWARD_BG, marginTop: -1, willChange: 'height' }}
            className="relative overflow-hidden rounded-b-2xl border"
          >
            {/* Platz 1 steht schon oben in der Kachel – die Liste beginnt bei 2
                und läuft untereinander durch, damit die Reihenfolge lückenlos ist. */}
            <div className="px-4 py-2 sm:px-5">
              {open.rows.slice(1, 10).map((r, i) => {
                const rank = i + 2;
                const team = crestFor(r.teamId);
                const go = playerClick(r.teamId, r.playerName);
                const stop = (e: React.MouseEvent) => e.stopPropagation();
                return (
                  <motion.div
                    key={`${r.teamId}-${r.playerName}`}
                    initial={{ opacity: 0, transform: 'translateY(-6px)' }}
                    animate={{ opacity: 1, transform: 'translateY(0px)' }}
                    transition={reduce ? { duration: 0.15 } : { duration: 0.24, ease: [0.23, 1, 0.32, 1], delay: 0.06 + i * 0.022 }}
                    className="flex items-center gap-3 py-2.5 text-sm border-t border-white/[.06] first:border-t-0"
                  >
                    <span className="w-6 shrink-0 text-center font-display font-black text-hl-mute tabular-nums">{rank}</span>
                    {team && (
                      <span className="shrink-0" onClick={stop}>
                        <TeamCrest name={team.name} shortName={team.shortName} color={team.logoColor} logoUrl={team.logoUrl} size="sm" />
                      </span>
                    )}
                    {go ? (
                      <button onClick={(e) => { stop(e); go(); }} className="font-sans font-semibold text-white truncate min-w-0 hover:text-hl-magenta-soft transition-colors cursor-pointer text-left">{r.playerName}</button>
                    ) : (
                      <span className="font-sans font-semibold text-white truncate min-w-0">{r.playerName}</span>
                    )}
                    <span className="text-xs text-hl-mute truncate min-w-0 hidden sm:inline">{r.teamId}</span>
                    {r.note && <span className="ml-auto shrink-0 text-[11px] text-hl-faint tabular-nums">{r.note}</span>}
                    <span className={`shrink-0 font-display font-black text-white tabular-nums ${r.note ? 'ml-3' : 'ml-auto'}`}>{r.value}</span>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
