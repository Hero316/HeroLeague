import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Instagram } from 'lucide-react';
import type { EventArchive, EventConfig, Match, Player, Team } from '../types';
import { apiFetch } from '../lib/api';
import { TeamCrest, useMatchClock, readable } from './ui';
import { GAME_MINUTES } from '../lib/matchTiming';

// ===========================================================================
// OBS-Einblendung (Browser-Quelle) – /overlay?feld=1
//
// Eigenständige, transparente Seite (ohne Navbar/App-Logik) für den Livestream:
// OBS legt sie als „Browser"-Quelle (1920×1080) über das Kamerabild. Zeigt
//  • Scoreboard oben links: Wappen · Name · Spielstand · Uhr (8:00 → 0:00,
//    danach Nachspielzeit +0:01 … in Gold) – exakt die Uhr des Schiedsrichters
//  • „TOR!"-Einblendung, sobald der Spielstand steigt (mit Torschütze + Foto,
//    sobald er getrackt ist)
//  • Aufstellung als Laufband beim Anpfiff, Endstand nach dem Abpfiff
// Datenquelle: die öffentlichen Endpunkte (Testspiel-Archiv bzw. Liga-Spiele),
// alle paar Sekunden neu geladen. Kein neuer API-Endpunkt.
//
// URL-Parameter:
//   feld=1|2        welches Feld (Standard 1)
//   scale=1.2       alles größer/kleiner (Standard 1)
//   pos=tl|tr       Scoreboard oben links (Standard) oder oben rechts
//   brand=0         Hero-League-Logo + Instagram ausblenden
//   partner=0       Partner-Leiste ausblenden
//   test=1          Vorschau mit Beispielspiel (zum Positionieren in OBS)
//   sec=470         (nur mit test=1) Uhr vorspulen, z. B. um die Nachspielzeit zu sehen
//   idle=1          (nur mit test=1) Vorschau ohne Live-Spiel → „Als Nächstes"-Tafel
//   next=0          „Als Nächstes" komplett ausblenden
//   every=45        während eines Spiels: alle X Sekunden kurz „Als Nächstes" (Standard 45)
//
// „Als Nächstes": Ohne Live-Spiel steht oben links groß das nächste Spiel
// DIESES Feldes (Wappen, Namen, Anstoß), darunter klein das des anderen Feldes.
// Während eines Spiels kommt alle `every` Sekunden für 10 s neben der
// Toranzeige eine kleine Einblendung mit dem nächsten Spiel beider Felder.
// ===========================================================================

const GOLD = '#FFC53D';
const ACCENT = '#22DFC9';

interface OverlayMatch {
  key: string; // eindeutig über Event/Liga hinweg
  home: string;
  away: string;
  homeScore: number;
  awayScore: number;
  status: 'geplant' | 'live' | 'beendet';
  liveStartedAt?: string | null;
  durationMinutes?: number | null;
  pausedAt?: string | null;
  scorers: { player: string; team: string }[];
  field: number; // Feld/Platz (1, 2 …)
  time: string; // Anstoß 'HH:MM'
  date: string; // 'YYYY-MM-DD' (leer = heute/unbekannt)
}

interface Visual {
  logoUrl?: string;
  color: string;
  shortName?: string;
  players: Player[];
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

function params() {
  const q = new URLSearchParams(window.location.search);
  const feld = Math.max(1, Math.min(9, Number(q.get('feld') || q.get('field') || 1) || 1));
  const scale = Math.max(0.4, Math.min(3, Number(q.get('scale') || 1) || 1));
  const pos = q.get('pos') === 'tr' ? 'tr' : 'tl';
  const test = q.get('test') === '1';
  // Nur Vorschau: so viele Sekunden sind schon gespielt (z. B. sec=470 → Nachspielzeit gleich sichtbar).
  const sec = Math.max(0, Number(q.get('sec') || 0) || 0);
  const brand = q.get('brand') !== '0';
  const partner = q.get('partner') !== '0';
  const idle = q.get('idle') === '1';
  const next = q.get('next') !== '0';
  const every = Math.max(15, Math.min(600, Number(q.get('every') || 45) || 45));
  return { feld, scale, pos, test, sec, brand, partner, idle, next, every } as const;
}

function activeEventOf(a: EventArchive | null): EventConfig | null {
  if (!a) return null;
  const id = a.activeId ?? a.previewId ?? null;
  return (id && a.events.find((e) => e.id === id)) || null;
}

// Neuestes Spiel eines Feldes in einem Status (live bevorzugt vor Endstand).
function pickEventMatch(ev: EventConfig | null): OverlayMatch[] {
  if (!ev) return [];
  return ev.matches
    .map((m) => ({
      key: `e:${ev.id}:${m.id}`,
      home: m.home,
      away: m.away,
      homeScore: m.homeScore ?? 0,
      awayScore: m.awayScore ?? 0,
      status: m.status ?? (m.homeScore !== null && m.awayScore !== null ? 'beendet' : 'geplant'),
      liveStartedAt: m.liveStartedAt,
      durationMinutes: m.durationMinutes,
      pausedAt: m.pausedAt,
      scorers: (m.scorers ?? []).map((s) => ({ player: s.player, team: s.team })),
      field: m.field || 1,
      time: m.start || '',
      date: ev.date || '',
    }));
}

function pickLeagueMatches(matches: Match[], teams: Team[]): OverlayMatch[] {
  const nameById = new Map(teams.map((t) => [t.id, t.name]));
  return matches
    .map((m) => ({
      key: `l:${m.id}`,
      home: nameById.get(m.homeTeamId) ?? '?',
      away: nameById.get(m.awayTeamId) ?? '?',
      homeScore: m.homeScore ?? 0,
      awayScore: m.awayScore ?? 0,
      status: m.status,
      liveStartedAt: m.liveStartedAt,
      durationMinutes: m.durationMinutes,
      pausedAt: m.pausedAt,
      scorers: (m.scorers ?? []).map((s) => ({ player: s.playerName, team: nameById.get(s.teamId) ?? '?' })),
      field: m.field || 1,
      time: m.time || '',
      date: m.date || '',
    }));
}

// Heutiges Datum 'YYYY-MM-DD' (lokale Zeit).
function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Nächstes geplantes Spiel eines Feldes (frühester Anstoß, nichts aus der Vergangenheit).
function nextOnField(list: OverlayMatch[], field: number): OverlayMatch | null {
  const today = todayKey();
  return (
    list
      .filter((m) => m.status === 'geplant' && m.field === field && (!m.date || m.date >= today))
      .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`))[0] ?? null
  );
}

// Anstoß als Text: heute nur „19:11", an einem anderen Tag mit Datum.
function kickoffLabel(m: OverlayMatch): string {
  if (!m.date || m.date === todayKey()) return m.time;
  const d = new Date(`${m.date}T12:00:00`);
  const day = Number.isNaN(d.getTime()) ? m.date : d.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' });
  return m.time ? `${day} · ${m.time}` : day;
}

// ---------------------------------------------------------------------------
// Daten laden – bewusst OHNE Sichtbarkeits-Pause (OBS meldet die Quelle je
// nach Einstellung als „versteckt"; die Einblendung muss trotzdem aktuell sein).
// ---------------------------------------------------------------------------
function useOverlayData(enabled: boolean) {
  const [archive, setArchive] = useState<EventArchive | null>(null);
  const [matches, setMatches] = useState<Match[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const loadEvent = () =>
      apiFetch<EventArchive>('/api/twitch?resource=event').then((d) => alive && setArchive(d)).catch(() => {});
    const loadMatches = () =>
      apiFetch<Match[]>('/api/matches').then((d) => alive && setMatches(Array.isArray(d) ? d : [])).catch(() => {});
    const loadTeams = () =>
      apiFetch<Team[]>('/api/teams').then((d) => alive && setTeams(Array.isArray(d) ? d : [])).catch(() => {});
    loadEvent();
    loadMatches();
    loadTeams();
    const a = setInterval(loadEvent, 3000);
    const b = setInterval(loadMatches, 4000);
    const c = setInterval(loadTeams, 5 * 60_000);
    return () => {
      alive = false;
      clearInterval(a);
      clearInterval(b);
      clearInterval(c);
    };
  }, [enabled]);

  return { archive, matches, teams };
}

// Beispielspiel für ?test=1: Uhr läuft ab Seitenaufruf, alle 25 s fällt ein Tor.
function useTestMatch(enabled: boolean, sec: number): OverlayMatch | null {
  const [startedAt] = useState(() => new Date(Date.now() - sec * 1000).toISOString());
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => setTick((t) => t + 1), 25_000);
    return () => clearInterval(id);
  }, [enabled]);
  if (!enabled) return null;
  const goals = tick;
  const scorers = Array.from({ length: goals }, (_, i) => ({
    player: i % 2 ? 'Max Mustermann' : 'Luca Beispiel',
    team: i % 2 ? 'FC Gast' : 'Hero United',
  }));
  return {
    key: 'test',
    home: 'Hero United',
    away: 'FC Gast',
    homeScore: Math.ceil(goals / 2),
    awayScore: Math.floor(goals / 2),
    status: 'live',
    liveStartedAt: startedAt,
    durationMinutes: GAME_MINUTES,
    pausedAt: null,
    scorers,
    field: 1,
    time: '19:00',
    date: '',
  };
}

// Beispiel-Paarungen für die Vorschau (?test=1) der „Als Nächstes"-Anzeige.
const TEST_NEXT: OverlayMatch[] = [
  { key: 'tn1', home: 'Phönix Leverkusen', away: 'Royale Five', homeScore: 0, awayScore: 0, status: 'geplant', scorers: [], field: 1, time: '19:11', date: '' },
  { key: 'tn2', home: 'Westside United', away: 'FC Kickers Halle', homeScore: 0, awayScore: 0, status: 'geplant', scorers: [], field: 2, time: '19:11', date: '' },
];

// ---------------------------------------------------------------------------
// Bausteine
// ---------------------------------------------------------------------------
function Crest({ name, v, size = 'lg' }: { name: string; v?: Visual; size?: 'lg' | 'xl' | 'hero' }) {
  return <TeamCrest name={name} shortName={v?.shortName} color={v?.color ?? ACCENT} logoUrl={v?.logoUrl} size={size} />;
}

function Clock({ m }: { m: OverlayMatch }) {
  const clock = useMatchClock(m.liveStartedAt, m.durationMinutes, m.pausedAt);
  if (!clock) return null;
  const color = clock.paused ? '#FBBF24' : clock.overtime ? GOLD : '#FFFFFF';
  return (
    <div className="flex flex-col items-center justify-center px-5 min-w-[132px]" style={{ background: clock.overtime && !clock.paused ? 'rgba(255,197,61,.14)' : 'rgba(255,255,255,.05)' }}>
      <span className="font-display font-black tabular-nums leading-none text-[40px] tracking-tight" style={{ color }}>
        {clock.label}
      </span>
      <span className="mt-1 text-[11px] font-sans font-black uppercase tracking-[2px]" style={{ color: clock.paused ? '#FBBF24' : clock.overtime ? GOLD : 'rgba(255,255,255,.55)' }}>
        {clock.paused ? 'Pause' : clock.overtime ? 'Nachspielzeit' : 'Live'}
      </span>
    </div>
  );
}

function Scorebug({ m, vis, label, final }: { m: OverlayMatch; vis: (n: string) => Visual | undefined; label: string; final?: boolean }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -24, filter: 'blur(6px)' }}
      animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      exit={{ opacity: 0, y: -30, scale: 0.96, filter: 'blur(8px)' }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      className="inline-flex flex-col"
    >
      <div className="inline-flex items-stretch rounded-2xl overflow-hidden border border-white/15 bg-[rgba(6,14,15,.88)] shadow-[0_18px_50px_-12px_rgba(0,0,0,.9)]">
        <div className="flex items-center gap-3 pl-4 pr-3 py-3">
          <Crest name={m.home} v={vis(m.home)} />
          <span className="font-display font-black uppercase tracking-tight text-white text-[26px] leading-none truncate max-w-[300px]">{m.home}</span>
        </div>
        <div className="flex items-center justify-center px-4 min-w-[112px]" style={{ background: `linear-gradient(180deg, ${ACCENT}, #14A594)` }}>
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={`${m.homeScore}-${m.awayScore}`}
              initial={{ scale: 0.4, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.4, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 480, damping: 22 }}
              className="font-display font-black tabular-nums text-[#04120d] text-[40px] leading-none"
            >
              {m.homeScore}<span className="mx-1.5 opacity-60">:</span>{m.awayScore}
            </motion.span>
          </AnimatePresence>
        </div>
        <div className="flex items-center gap-3 pl-3 pr-4 py-3">
          <span className="font-display font-black uppercase tracking-tight text-white text-[26px] leading-none truncate max-w-[300px]">{m.away}</span>
          <Crest name={m.away} v={vis(m.away)} />
        </div>
        {final ? (
          <div className="flex items-center px-5 bg-white/[.06]">
            <span className="text-[14px] font-sans font-black uppercase tracking-[2px] text-white/80">Endstand</span>
          </div>
        ) : (
          <Clock m={m} />
        )}
      </div>
      <div className="mt-2 self-start inline-flex items-center gap-2 rounded-lg bg-[rgba(6,14,15,.8)] border border-white/10 px-3 py-1.5">
        <img src="/assets/hero-league-logo.png" alt="" className="h-4 w-auto" />
        <span className="text-[12px] font-sans font-black uppercase tracking-[2px] text-white/75">{label}</span>
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// „Als Nächstes"
// ---------------------------------------------------------------------------
const EASE = [0.22, 1, 0.36, 1] as const;
const NEXT_GOLD = '#E9C46A';

// Große Tafel, solange auf diesem Feld kein Spiel läuft: eigenes Feld groß,
// das andere Feld klein darunter. Kommt mit einem Wisch von links herein.
function NextUpPanel({ main, others, vis }: { main: OverlayMatch | null; others: OverlayMatch[]; vis: (n: string) => Visual | undefined }) {
  const big = main ?? others[0] ?? null;
  const small = main ? others : others.slice(1);
  if (!big) return null;
  return (
    <motion.div
      initial={{ opacity: 0, x: -60, filter: 'blur(8px)' }}
      animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
      exit={{ opacity: 0, x: -60, filter: 'blur(8px)' }}
      transition={{ duration: 0.7, ease: EASE }}
      className="inline-flex flex-col items-start gap-2.5"
    >
      <motion.div
        initial={{ clipPath: 'inset(0 100% 0 0 round 18px)' }}
        animate={{ clipPath: 'inset(0 0% 0 0 round 18px)' }}
        transition={{ duration: 0.9, ease: EASE, delay: 0.1 }}
        className="relative rounded-[18px] overflow-hidden border border-white/15 bg-[rgba(6,14,15,.9)] shadow-[0_18px_50px_-12px_rgba(0,0,0,.9)]"
      >
        {/* Glanz-Streifen, der einmal drüberläuft */}
        <motion.div
          initial={{ x: '-120%' }}
          animate={{ x: '420%' }}
          transition={{ duration: 1.4, ease: 'easeInOut', delay: 0.7 }}
          className="absolute inset-y-0 w-1/3 pointer-events-none"
          style={{ background: 'linear-gradient(100deg, transparent, rgba(255,255,255,.12), transparent)' }}
        />
        <div className="flex items-center gap-3 px-5 pt-3">
          <span className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-[12px] font-sans font-black uppercase tracking-[2.5px] text-[#04120d]" style={{ background: `linear-gradient(90deg, ${NEXT_GOLD}, #C9A24B)` }}>
            Als Nächstes
          </span>
          <span className="text-[13px] font-sans font-black uppercase tracking-[2.5px] text-white/70">Feld {big.field}</span>
        </div>
        <div className="flex items-stretch">
          <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.5, ease: EASE, delay: 0.45 }} className="flex items-center gap-3 pl-5 pr-4 py-4">
            <Crest name={big.home} v={vis(big.home)} size="xl" />
            <span className="font-display font-black uppercase tracking-tight text-white text-[30px] leading-none max-w-[340px]">{big.home}</span>
          </motion.div>
          <motion.div
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: 'spring', stiffness: 320, damping: 20, delay: 0.6 }}
            className="flex flex-col items-center justify-center px-5 my-3 rounded-xl"
            style={{ background: 'rgba(233,196,106,.12)', border: '1px solid rgba(233,196,106,.35)' }}
          >
            <span className="font-display font-black tabular-nums leading-none text-[36px]" style={{ color: NEXT_GOLD }}>{kickoffLabel(big) || 'vs'}</span>
            <span className="mt-1 text-[11px] font-sans font-black uppercase tracking-[2px] text-white/60">Anstoß</span>
          </motion.div>
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.5, ease: EASE, delay: 0.55 }} className="flex items-center gap-3 pl-4 pr-5 py-4">
            <span className="font-display font-black uppercase tracking-tight text-white text-[30px] leading-none max-w-[340px] text-right">{big.away}</span>
            <Crest name={big.away} v={vis(big.away)} size="xl" />
          </motion.div>
        </div>
      </motion.div>

      {small.map((m, i) => (
        <motion.div
          key={m.key}
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: EASE, delay: 0.9 + i * 0.12 }}
          className="inline-flex items-center gap-3 rounded-xl border border-white/12 bg-[rgba(6,14,15,.85)] px-4 py-2.5 shadow-[0_12px_30px_-12px_rgba(0,0,0,.9)]"
        >
          <span className="text-[11px] font-sans font-black uppercase tracking-[2px] text-white/55">Feld {m.field}</span>
          <Crest name={m.home} v={vis(m.home)} />
          <span className="font-display font-black uppercase text-white text-[19px] leading-none">{m.home}</span>
          <span className="text-[13px] font-sans font-black text-white/40">vs</span>
          <span className="font-display font-black uppercase text-white text-[19px] leading-none">{m.away}</span>
          <Crest name={m.away} v={vis(m.away)} />
          <span className="ml-1 font-display font-black tabular-nums text-[19px]" style={{ color: NEXT_GOLD }}>{kickoffLabel(m)}</span>
        </motion.div>
      ))}
    </motion.div>
  );
}

// Kleine Einblendung NEBEN der Toranzeige (während eines Spiels): nächstes Spiel
// beider Felder, gleich groß. Fährt seitlich aus der Toranzeige heraus.
function NextTicker({ items, vis, side }: { items: OverlayMatch[]; vis: (n: string) => Visual | undefined; side: 'tl' | 'tr' }) {
  if (!items.length) return null;
  const dir = side === 'tr' ? 1 : -1;
  return (
    <motion.div
      initial={{ opacity: 0, x: 40 * -dir, clipPath: side === 'tr' ? 'inset(0 0 0 100% round 14px)' : 'inset(0 100% 0 0 round 14px)' }}
      animate={{ opacity: 1, x: 0, clipPath: 'inset(0 0% 0 0% round 14px)' }}
      exit={{ opacity: 0, x: 40 * -dir, clipPath: side === 'tr' ? 'inset(0 0 0 100% round 14px)' : 'inset(0 100% 0 0 round 14px)' }}
      transition={{ duration: 0.65, ease: EASE }}
      className="rounded-[14px] border border-white/15 bg-[rgba(6,14,15,.88)] shadow-[0_18px_50px_-12px_rgba(0,0,0,.9)] px-4 py-2.5"
    >
      <div className="text-[11px] font-sans font-black uppercase tracking-[2.5px]" style={{ color: NEXT_GOLD }}>Als Nächstes</div>
      <div className="mt-1.5 flex flex-col gap-1.5">
        {items.map((m, i) => (
          <motion.div
            key={m.key}
            initial={{ opacity: 0, x: 16 * -dir }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.45, ease: EASE, delay: 0.25 + i * 0.12 }}
            className="flex items-center gap-2.5"
          >
            <span className="w-[54px] shrink-0 text-[11px] font-sans font-black uppercase tracking-[1.5px] text-white/55">Feld {m.field}</span>
            <Crest name={m.home} v={vis(m.home)} size="lg" />
            <span className="font-display font-black uppercase text-white text-[17px] leading-none max-w-[210px] truncate">{m.home}</span>
            <span className="text-[12px] font-sans font-black text-white/40">vs</span>
            <span className="font-display font-black uppercase text-white text-[17px] leading-none max-w-[210px] truncate">{m.away}</span>
            <Crest name={m.away} v={vis(m.away)} size="lg" />
            <span className="ml-1 font-display font-black tabular-nums text-[17px]" style={{ color: NEXT_GOLD }}>{kickoffLabel(m)}</span>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}

function initials(name: string): string {
  const p = name.trim().split(/\s+/);
  return ((p[0]?.[0] ?? '') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase() || '?';
}

function Photo({ name, url, size }: { name: string; url?: string; size: number }) {
  return url ? (
    <img src={url} alt={name} referrerPolicy="no-referrer" className="rounded-full object-cover shrink-0 border-2 border-white/40" style={{ width: size, height: size }} />
  ) : (
    <span className="rounded-full grid place-items-center shrink-0 font-display font-black text-white bg-white/15 border-2 border-white/30" style={{ width: size, height: size, fontSize: size * 0.38 }}>
      {initials(name)}
    </span>
  );
}

interface GoalInfo {
  id: number;
  team: string;
  score: string;
  player?: string;
  photo?: string;
}

// TOR-Einblendung: breites Band in Teamfarbe, „TOOOOOR!" springt Buchstabe für
// Buchstabe rein, die O's wippen als Welle, Wappen mit pulsierendem Ring und
// Funken, ein Lichtblitz fährt einmal quer drüber. Nur die Mannschaft ist
// nötig (der Schiri trägt keinen Torschützen ein) – kommt doch einer aus dem
// Tracking, steht er klein darunter.
const GOAL_WORD = ['T', 'O', 'O', 'O', 'O', 'O', 'R', '!'];

function GoalBanner({ g, vis }: { g: GoalInfo; vis: (n: string) => Visual | undefined }) {
  const v = vis(g.team);
  const base = v?.color || ACCENT;
  const glow = readable(base);
  const sparks = Array.from({ length: 14 }, (_, i) => {
    const a = (i / 14) * Math.PI * 2;
    const r = 120 + (i % 3) * 38;
    return { x: Math.cos(a) * r, y: Math.sin(a) * r, d: 0.35 + (i % 4) * 0.05 };
  });
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, y: 30, transition: { duration: 0.35 } }}
      className="relative w-[1400px] h-[200px]"
      style={{ filter: 'drop-shadow(0 24px 40px rgba(0,0,0,.75))' }}
    >
      {/* Band – fährt von links auf, schräg angeschnitten */}
      <motion.div
        initial={{ scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        className="absolute inset-0 origin-left overflow-hidden"
        style={{
          background: `linear-gradient(100deg, ${base} 0%, ${base}CC 22%, rgba(6,14,15,.94) 58%, rgba(6,14,15,.96) 100%)`,
          clipPath: 'polygon(3% 0, 100% 0, 97% 100%, 0 100%)',
        }}
      >
        {/* Lichtblitz quer drüber */}
        <motion.div
          initial={{ x: '-40%' }}
          animate={{ x: '140%' }}
          transition={{ duration: 1.1, delay: 0.35, ease: [0.4, 0, 0.2, 1] }}
          className="absolute inset-y-0 w-[30%]"
          style={{ background: 'linear-gradient(100deg, transparent, rgba(255,255,255,.55), transparent)', filter: 'blur(6px)' }}
        />
        {/* dezente Streifen */}
        <div
          className="absolute inset-0 opacity-[.12]"
          style={{ backgroundImage: 'repeating-linear-gradient(100deg, #fff 0 2px, transparent 2px 26px)' }}
        />
      </motion.div>

      <div className="relative h-full flex items-center gap-8 pl-[70px] pr-[80px]">
        {/* Wappen mit Ring-Puls + Funken */}
        <div className="relative shrink-0 grid place-items-center w-[130px] h-[130px]">
          {[0, 0.5, 1].map((d) => (
            <motion.span
              key={d}
              className="absolute inset-0 rounded-full border-4"
              style={{ borderColor: glow }}
              initial={{ scale: 0.7, opacity: 0.8 }}
              animate={{ scale: 1.9, opacity: 0 }}
              transition={{ duration: 1.6, delay: 0.3 + d, repeat: Infinity, repeatDelay: 0.4, ease: 'easeOut' }}
            />
          ))}
          {sparks.map((sp, i) => (
            <motion.span
              key={i}
              className="absolute w-2.5 h-2.5 rounded-full"
              style={{ background: i % 2 ? '#fff' : glow, boxShadow: `0 0 12px ${glow}` }}
              initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
              animate={{ x: sp.x, y: sp.y, opacity: 0, scale: 0.3 }}
              transition={{ duration: 0.9, delay: sp.d, ease: 'easeOut' }}
            />
          ))}
          <motion.div
            initial={{ scale: 0, rotate: -200 }}
            animate={{ scale: 1.35, rotate: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 14, delay: 0.2 }}
            className="drop-shadow-[0_8px_24px_rgba(0,0,0,.7)]"
          >
            <Crest name={g.team} v={v} size="hero" />
          </motion.div>
        </div>

        {/* TOOOOOR! */}
        <div className="flex items-end leading-none" aria-label="Tor!">
          {GOAL_WORD.map((ch, i) => {
            const isO = ch === 'O';
            return (
              <motion.span
                key={i}
                initial={{ y: 120, opacity: 0, scale: 0.3, rotate: -14 }}
                animate={{ y: 0, opacity: 1, scale: 1, rotate: 0 }}
                transition={{ type: 'spring', stiffness: 520, damping: 16, delay: 0.3 + i * 0.07 }}
                className="inline-block"
              >
                <motion.span
                  className="inline-block font-display font-black uppercase text-white text-[150px] tracking-[-4px]"
                  style={{ textShadow: `0 0 28px ${glow}, 0 6px 0 rgba(0,0,0,.35)` }}
                  animate={isO ? { y: [0, -18, 0], scaleY: [1, 1.08, 1] } : undefined}
                  transition={isO ? { duration: 0.9, delay: 1.1 + i * 0.09, repeat: Infinity, repeatDelay: 0.5, ease: 'easeInOut' } : undefined}
                >
                  {ch}
                </motion.span>
              </motion.span>
            );
          })}
        </div>

        {/* Team + Spielstand */}
        <motion.div
          initial={{ opacity: 0, x: 40 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, delay: 1.0, ease: [0.22, 1, 0.36, 1] }}
          className="ml-auto min-w-0 text-right"
        >
          <div className="text-[15px] font-sans font-black uppercase tracking-[3px]" style={{ color: glow }}>Tor für</div>
          <div className="font-display font-black uppercase tracking-tight text-white text-[44px] leading-none truncate max-w-[420px]">{g.team}</div>
          {g.player && <div className="mt-1 text-[18px] font-sans font-bold text-white/80 truncate max-w-[420px]">⚽ {g.player}</div>}
          <motion.div
            initial={{ scale: 0.4, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 420, damping: 15, delay: 1.35 }}
            className="mt-2 inline-block rounded-xl px-4 py-1 font-display font-black tabular-nums text-[40px] leading-none text-[#04120d]"
            style={{ background: `linear-gradient(180deg, ${ACCENT}, #14A594)` }}
          >
            {g.score}
          </motion.div>
        </motion.div>
      </div>
    </motion.div>
  );
}

function LineupBar({ m, vis }: { m: OverlayMatch; vis: (n: string) => Visual | undefined }) {
  const groups = [
    { team: m.home, players: vis(m.home)?.players ?? [] },
    { team: m.away, players: vis(m.away)?.players ?? [] },
  ].filter((g) => g.players.length);
  if (!groups.length) return null;
  const Row = () => (
    <div className="inline-flex items-center gap-3 pr-3">
      {groups.map((g, gi) => (
        <span key={gi} className="inline-flex items-center gap-3 pr-4">
          <span className="inline-flex items-center gap-2 rounded-lg bg-white/15 px-3 py-1.5 shrink-0">
            <Crest name={g.team} v={vis(g.team)} size="lg" />
            <span className="font-display font-black uppercase tracking-tight text-white text-[20px]">{g.team}</span>
          </span>
          {g.players.map((p, i) => (
            <span key={i} className="inline-flex items-center gap-2 rounded-full bg-black/55 border border-white/10 pl-1 pr-4 py-1 shrink-0">
              <Photo name={p.name} url={p.imageUrl} size={38} />
              <span className="text-[18px] font-sans font-bold text-white whitespace-nowrap">{p.number ? `${p.number} ` : ''}{p.name}</span>
            </span>
          ))}
        </span>
      ))}
    </div>
  );
  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 30 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="absolute bottom-0 inset-x-0 pb-6 pt-10 overflow-hidden"
      style={{ background: 'linear-gradient(0deg, rgba(0,0,0,.7), transparent)' }}
    >
      <div className="hl-marquee-track" style={{ animationDuration: '30s' }}>
        <Row />
        <Row />
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Dauer-Einblendungen: Hero-League-Logo + Instagram, Partner-Leiste
// ---------------------------------------------------------------------------

// Instagram-Name aus dem im Admin gepflegten Social-Link („Social Media").
// „instagram.com/heroleague" → „@heroleague". Nichts gepflegt → keine Pille.
function useInstagramHandle(enabled: boolean): string {
  const [handle, setHandle] = useState('');
  useEffect(() => {
    if (!enabled) return;
    apiFetch<{ instagram?: string }>('/api/twitch?resource=social')
      .then((d) => {
        const raw = (d?.instagram || '').trim();
        if (!raw) return;
        const m = /instagram\.com\/([^/?#]+)/i.exec(raw);
        const name = (m ? m[1] : raw).replace(/^@/, '');
        if (name) setHandle(`@${name}`);
      })
      .catch(() => {});
  }, [enabled]);
  return handle;
}

function BrandCorner({ instagram }: { instagram: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="flex flex-col items-end gap-2"
    >
      <img src="/assets/hero-league-logo.png" alt="Hero League" className="h-[58px] w-auto drop-shadow-[0_6px_18px_rgba(0,0,0,.8)]" />
      {instagram && (
        <span className="inline-flex items-center gap-2 rounded-full bg-[rgba(6,14,15,.82)] border border-white/15 pl-2 pr-3.5 py-1.5 shadow-[0_10px_30px_-10px_rgba(0,0,0,.9)]">
          <span className="grid place-items-center w-7 h-7 rounded-full" style={{ background: 'linear-gradient(45deg,#F58529,#DD2A7B 55%,#8134AF)' }}>
            <Instagram className="w-4 h-4 text-white" />
          </span>
          <span className="text-[17px] font-sans font-bold text-white tracking-tight">{instagram}</span>
        </span>
      )}
    </motion.div>
  );
}

// Partner – feste Reihenfolge, Logos liegen unter public/assets/partners.
// Der Hauptpartner steht IMMER sichtbar links, rechts wechseln die übrigen.
const ROTATING_PARTNERS = [
  { label: 'Bankpartner', name: 'Volksbank – Die Gestalterbank', logo: '/assets/partners/volksbank-gestalterbank.png', h: 38 },
  { label: 'Schuh- & Ausrüstungspartner', name: 'Unisport', logo: '/assets/partners/unisport.png', h: 52 },
];

function PartnerBar() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setI((n) => (n + 1) % ROTATING_PARTNERS.length), 9000);
    return () => clearInterval(id);
  }, []);
  const p = ROTATING_PARTNERS[i];
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 24 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      className="inline-flex items-stretch rounded-2xl overflow-hidden border border-white/15 bg-[rgba(6,14,15,.86)] shadow-[0_18px_50px_-12px_rgba(0,0,0,.9)]"
    >
      {/* Hauptpartner – dauerhaft */}
      <div className="flex items-center gap-3 pl-4 pr-5 py-3" style={{ background: 'linear-gradient(135deg, rgba(196,164,48,.22), rgba(196,164,48,.06))' }}>
        <img src="/assets/partners/dvag-mark-white.png" alt="DVAG" className="h-[54px] w-auto shrink-0" />
        <div className="leading-tight">
          <div className="text-[11px] font-sans font-black uppercase tracking-[2.5px] text-[#E2C45A]">Hauptpartner</div>
          <div className="font-sans font-extrabold text-white text-[20px] tracking-tight">Florian Hinterheller</div>
          <div className="text-[12px] font-sans font-semibold text-white/65">Deutsche Vermögensberatung</div>
        </div>
      </div>
      {/* Weitere Partner – wechseln */}
      <div className="relative flex flex-col justify-center gap-1.5 px-4 py-2.5 w-[300px] border-l border-white/10">
        <AnimatePresence mode="wait">
          <motion.div
            key={p.name}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="flex flex-col gap-1.5"
          >
            <span className="text-[11px] font-sans font-black uppercase tracking-[1.8px] text-white/60 whitespace-nowrap">{p.label}</span>
            <span className="grid place-items-center rounded-lg bg-white h-[60px] px-3">
              <img src={p.logo} alt={p.name} className="max-w-full w-auto object-contain" style={{ height: p.h }} />
            </span>
          </motion.div>
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Seite
// ---------------------------------------------------------------------------
export default function ObsOverlay() {
  const { feld, scale, pos, test, sec, brand, partner, idle, next: showNext, every } = useMemo(params, []);
  const instagram = useInstagramHandle(brand);
  const { archive, matches, teams } = useOverlayData(!test);
  const testMatch = useTestMatch(test && !idle, sec);

  // Transparenter Hintergrund für OBS.
  useEffect(() => {
    document.documentElement.classList.add('hl-obs');
    document.title = `Hero League · OBS Feld ${feld}`;
  }, [feld]);

  const event = activeEventOf(archive);
  const teamByName = useMemo(() => new Map(teams.map((t) => [norm(t.name), t])), [teams]);

  const vis = useMemo(() => {
    return (name: string): Visual | undefined => {
      const t = teamByName.get(norm(name));
      const own = event?.rosters?.find((r) => norm(r.team) === norm(name))?.players ?? [];
      if (!t && !own.length) return undefined;
      return {
        logoUrl: t?.logoUrl,
        color: t?.logoColor ?? ACCENT,
        shortName: t?.shortName,
        players: own.length ? own : t?.spielerliste ?? [],
      };
    };
  }, [teamByName, event]);

  // Kandidaten: Testspiel zuerst (wenn aktiv), sonst Liga.
  // Alle Spiele (alle Felder) – Testspiel-Event und Liga getrennt, damit
  // „Als Nächstes" das Event bevorzugen kann.
  const evAll = useMemo(() => (test ? [] : pickEventMatch(event)), [test, event]);
  const lgAll = useMemo(() => (test ? [] : pickLeagueMatches(matches, teams)), [test, matches, teams]);
  const candidates = useMemo(() => {
    if (testMatch) return [testMatch];
    if (test) return [];
    return [...evAll, ...lgAll].filter((m) => m.field === feld);
  }, [testMatch, test, evAll, lgAll, feld]);

  // Nächstes Spiel je Feld (Testspiel-Event zuerst, sonst Liga).
  const nextByField = useMemo(() => {
    const fields = [1, 2].includes(feld) ? [1, 2] : [feld];
    const res = new Map<number, OverlayMatch>();
    for (const f of fields) {
      const m = test ? TEST_NEXT.find((x) => x.field === f) ?? null : nextOnField(evAll, f) ?? nextOnField(lgAll, f);
      if (m) res.set(f, m);
    }
    return res;
  }, [test, evAll, lgAll, feld]);
  const nextOwn = nextByField.get(feld) ?? null;
  const nextOthers = [...nextByField.entries()].filter(([f]) => f !== feld).map(([, m]) => m);
  const nextAll = [...nextByField.entries()].sort(([a], [b]) => a - b).map(([, m]) => m);

  // Das zuletzt angepfiffene Live-Spiel DIESES Feldes (falls aus Versehen zwei
  // gleichzeitig live sind, gewinnt das neuere – das alte wurde nur nicht abgepfiffen).
  const live =
    candidates
      .filter((m) => m.status === 'live')
      .sort((a, b) => Date.parse(b.liveStartedAt ?? '') - Date.parse(a.liveStartedAt ?? '') || 0)[0] ?? null;
  const label = testMatch
    ? `Vorschau · Feld ${feld}`
    : live?.key.startsWith('e:') && event
      ? `${event.title} · Feld ${feld}`
      : `Feld ${feld}`;

  // --- Ereignisse: Tor, Anpfiff (Aufstellung), Abpfiff (Endstand) -------------
  const [goal, setGoal] = useState<GoalInfo | null>(null);
  const [lineup, setLineup] = useState(false);
  const [finalMatch, setFinalMatch] = useState<OverlayMatch | null>(null);
  const prev = useRef<{ key: string; home: number; away: number; scorers: number } | null>(null);
  const goalTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const lineupTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const finalTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const goalSeq = useRef(0);

  useEffect(() => {
    const p = prev.current;
    if (!live) {
      // Gerade abgepfiffen? → Endstand kurz stehen lassen.
      if (p) {
        const ended = candidates.find((m) => m.key === p.key && m.status === 'beendet');
        if (ended) {
          setFinalMatch(ended);
          clearTimeout(finalTimer.current);
          finalTimer.current = setTimeout(() => setFinalMatch(null), 15_000);
        }
      }
      prev.current = null;
      setLineup(false);
      return;
    }
    if (!p || p.key !== live.key) {
      // Neues Live-Spiel → Aufstellung einblenden, kein altes Tor feiern.
      prev.current = { key: live.key, home: live.homeScore, away: live.awayScore, scorers: live.scorers.length };
      setFinalMatch(null);
      setGoal(null);
      setLineup(true);
      clearTimeout(lineupTimer.current);
      lineupTimer.current = setTimeout(() => setLineup(false), 14_000);
      return;
    }
    const showGoal = (g: Omit<GoalInfo, 'id'>) => {
      setGoal({ ...g, id: ++goalSeq.current });
      clearTimeout(goalTimer.current);
      goalTimer.current = setTimeout(() => setGoal(null), 8000);
    };
    const score = `${live.homeScore}:${live.awayScore}`;
    const newScorer = live.scorers.length > p.scorers ? live.scorers[live.scorers.length - 1] : null;
    const photoOf = (s: { player: string; team: string }) =>
      vis(s.team)?.players.find((pl) => norm(pl.name) === norm(s.player))?.imageUrl;

    if (live.homeScore > p.home || live.awayScore > p.away) {
      const team = live.homeScore > p.home ? live.home : live.away;
      const s = newScorer && norm(newScorer.team) === norm(team) ? newScorer : null;
      showGoal({ team, score, player: s?.player, photo: s ? photoOf(s) : undefined });
    } else if (newScorer) {
      // Torschütze kommt nach (Tracking) → Einblendung mit Namen ergänzen/zeigen.
      setGoal((g) =>
        g && norm(g.team) === norm(newScorer.team)
          ? { ...g, player: newScorer.player, photo: photoOf(newScorer) }
          : g
      );
    }
    prev.current = { key: live.key, home: live.homeScore, away: live.awayScore, scorers: live.scorers.length };
  }, [live, candidates, vis]);

  useEffect(
    () => () => {
      clearTimeout(goalTimer.current);
      clearTimeout(lineupTimer.current);
      clearTimeout(finalTimer.current);
    },
    []
  );

  const shown = live ?? finalMatch;

  // Während eines Spiels alle `every` Sekunden für 10 s „Als Nächstes" neben der
  // Toranzeige (erstmals 20 s nach dem Anpfiff, nicht während eines Tores).
  const [tickerOn, setTickerOn] = useState(false);
  const liveKey = live?.key ?? null;
  useEffect(() => {
    setTickerOn(false);
    if (!liveKey || !showNext) return;
    let hide: ReturnType<typeof setTimeout> | undefined;
    const show = () => {
      setTickerOn(true);
      clearTimeout(hide);
      hide = setTimeout(() => setTickerOn(false), 10_000);
    };
    const first = setTimeout(() => {
      show();
      iv = setInterval(show, every * 1000);
    }, 20_000);
    let iv: ReturnType<typeof setInterval> | undefined;
    return () => {
      clearTimeout(first);
      clearTimeout(hide);
      clearInterval(iv);
    };
  }, [liveKey, showNext, every]);

  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none select-none text-white font-sans">
      <div
        className="absolute inset-0"
        style={{ transform: scale !== 1 ? `scale(${scale})` : undefined, transformOrigin: pos === 'tr' ? 'top right' : 'top left' }}
      >
        <div className={`absolute top-10 ${pos === 'tr' ? 'right-10 flex-row-reverse' : 'left-10'} flex items-start gap-3`}>
          {/* Toranzeige ODER (ohne Spiel) die „Als Nächstes"-Tafel – weich nacheinander */}
          <AnimatePresence mode="wait">
            {shown ? (
              <Scorebug key={shown.key} m={shown} vis={vis} label={label} final={!live} />
            ) : showNext && (nextOwn || nextOthers.length) ? (
              <NextUpPanel key="next-up" main={nextOwn} others={nextOthers} vis={vis} />
            ) : null}
          </AnimatePresence>
          <AnimatePresence>
            {live && showNext && tickerOn && !goal && nextAll.length > 0 && <NextTicker key="next-ticker" items={nextAll} vis={vis} side={pos} />}
          </AnimatePresence>
        </div>
      </div>

      {brand && (
        <div
          className={`absolute top-10 ${pos === 'tr' ? 'left-10' : 'right-10'}`}
          style={{ transform: scale !== 1 ? `scale(${scale})` : undefined, transformOrigin: pos === 'tr' ? 'top left' : 'top right' }}
        >
          <BrandCorner instagram={instagram} />
        </div>
      )}

      {/* Partner unten rechts – macht Platz, solange die Aufstellung durchläuft. */}
      <div className="absolute bottom-10 right-10" style={{ transform: scale !== 1 ? `scale(${scale})` : undefined, transformOrigin: 'bottom right' }}>
        <AnimatePresence>{partner && !(lineup && live && !goal) && <PartnerBar key="partners" />}</AnimatePresence>
      </div>

      <div className="absolute inset-x-0 bottom-[160px] flex justify-center" style={{ transform: scale !== 1 ? `scale(${scale})` : undefined, transformOrigin: 'bottom center' }}>
        <AnimatePresence>{goal && live && <GoalBanner key={goal.id} g={goal} vis={vis} />}</AnimatePresence>
      </div>

      <AnimatePresence>{lineup && live && !goal && <LineupBar key={`lu-${live.key}`} m={live} vis={vis} />}</AnimatePresence>
    </div>
  );
}
