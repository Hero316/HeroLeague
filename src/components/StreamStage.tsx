import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Radio, ExternalLink, Maximize2, Twitch, Volume2, VolumeX, MonitorPlay } from 'lucide-react';
import type { EventConfig, Match, Player, StreamsConfig, Team } from '../types';
import { twitchPlayerSrc, twitchChannelUrl } from '../lib/streams';
import { LiveBadge, TeamCrest } from './ui';

// Sichtbares Team-Wappen (Logo-Bild oder Monogramm-Farbe) je Team-Name.
export interface TeamVisual { logoUrl?: string; color: string; shortName?: string }

// ---------------------------------------------------------------------------
// Zwei parallele Twitch-Streams (Feld 1 / Feld 2) mit selbstgebauten Overlays:
//  • oben links: Live-Scoreboard (Teams, Tore, Minute) – sobald der Schiri live macht
//  • Tor-Einblendung mit Foto des Torschützen (animiert), wenn ein Tor fällt
//  • kurzer Aufstellungs-Durchlauf unten beim Anpfiff
// Zwei Anwendungsfälle über dieselbe Anzeige-Maschine:
//  • Testspieltag  → <StreamStage>        (Daten aus dem Event-Archiv)
//  • echte Liga    → <LeagueStreamStage>  (Daten aus den echten Liga-Spielen)
// Beide reichen ein normalisiertes Live-Spiel (`LiveStreamMatch`) hinein – Event
// nutzt Team-NAMEN, die Liga Team-IDs; die Adapter unten gleichen das an.
// Anschauen & Vollbild vor Ort; „Auf Twitch öffnen" führt zum Interagieren zu Twitch.
// ---------------------------------------------------------------------------

const PURPLE = '#9147FF';

// Vereinheitlichtes Live-Spiel für die Overlays – team = ANZEIGENAME.
export interface LiveStreamMatch {
  id: string;
  home: string;
  away: string;
  homeScore: number | null;
  awayScore: number | null;
  liveStartedAt?: string | null;
  durationMinutes?: number | null;
  pausedAt?: string | null;
  scorers: { player: string; team: string }[];
}

// Ist der Bildschirm breit genug für zwei Streams nebeneinander? (>= Tailwind xl)
function useWideScreen(query = '(min-width: 1280px)'): boolean {
  const [wide, setWide] = useState(() => (typeof window !== 'undefined' ? window.matchMedia(query).matches : false));
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setWide(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return wide;
}

function initials(name: string): string {
  const p = name.trim().split(/\s+/);
  return ((p[0]?.[0] ?? '') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase() || '?';
}

function Avatar({ name, imageUrl, size = 40 }: { name: string; imageUrl?: string; size?: number }) {
  return imageUrl ? (
    <img src={imageUrl} alt={name} referrerPolicy="no-referrer" className="rounded-full object-cover shrink-0 border border-white/20" style={{ width: size, height: size }} />
  ) : (
    <span className="rounded-full grid place-items-center shrink-0 font-display font-black text-white bg-white/15 border border-white/20" style={{ width: size, height: size, fontSize: size * 0.4 }}>
      {initials(name)}
    </span>
  );
}

// Live-Scoreboard oben links – Wappen + Name je Team, große animierte Tore, Live-Minute.
function TeamSide({ name, crest, align }: { name: string; crest?: TeamVisual; align: 'left' | 'right' }) {
  const badge = <TeamCrest name={name} shortName={crest?.shortName} color={crest?.color ?? '#22DFC9'} logoUrl={crest?.logoUrl} size="md" />;
  const label = <span className="font-display font-black uppercase tracking-tight text-white text-sm sm:text-lg leading-none truncate max-w-[26vw] sm:max-w-[190px]">{name}</span>;
  return (
    <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
      {align === 'left' ? <>{badge}{label}</> : <>{label}{badge}</>}
    </div>
  );
}

function Scoreboard({ match, crestByTeam }: { match: LiveStreamMatch; crestByTeam: Map<string, TeamVisual> }) {
  return (
    <div className="absolute top-0 left-0 p-2.5 sm:p-3.5 pointer-events-none z-10 max-w-full">
      <motion.div
        initial={{ opacity: 0, x: -16 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -16 }}
        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
        className="inline-flex items-center gap-2.5 sm:gap-3.5 rounded-2xl bg-black/75 backdrop-blur-md border border-white/12 px-3 sm:px-4 py-2 sm:py-2.5 shadow-[0_10px_34px_-8px_rgba(0,0,0,.9)] max-w-full"
      >
        <TeamSide name={match.home} crest={crestByTeam.get(match.home)} align="left" />
        <span className="relative shrink-0 font-display font-black tabular-nums text-white text-2xl sm:text-4xl leading-none px-0.5">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={`${match.homeScore ?? 0}-${match.awayScore ?? 0}`}
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.5, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 500, damping: 22 }}
              className="inline-block"
            >
              {match.homeScore ?? 0}<span className="text-hl-dim mx-1 sm:mx-1.5">:</span>{match.awayScore ?? 0}
            </motion.span>
          </AnimatePresence>
        </span>
        <TeamSide name={match.away} crest={crestByTeam.get(match.away)} align="right" />
        <span className="shrink-0 ml-0.5 sm:ml-1"><LiveBadge liveStartedAt={match.liveStartedAt} durationMinutes={match.durationMinutes} pausedAt={match.pausedAt} /></span>
      </motion.div>
    </div>
  );
}

// Tor-Einblendung mit Foto (links, fliegt rein und wieder raus).
function GoalCard({ name, team, imageUrl }: { name: string; team: string; imageUrl?: string }) {
  return (
    <div className="absolute left-0 top-1/2 -translate-y-1/2 p-2 sm:p-4 pointer-events-none z-20">
      <motion.div
        initial={{ opacity: 0, x: -60, scale: 0.9 }}
        animate={{ opacity: 1, x: 0, scale: 1 }}
        exit={{ opacity: 0, x: -40, scale: 0.95 }}
        transition={{ type: 'spring', stiffness: 320, damping: 24 }}
        className="flex items-center gap-3 rounded-2xl border px-3 py-2.5 sm:px-4 sm:py-3 shadow-[0_12px_40px_-10px_rgba(0,0,0,.9)]"
        style={{ background: 'linear-gradient(120deg, rgba(20,165,148,.96), rgba(12,122,112,.96))', borderColor: 'rgba(255,255,255,.22)' }}
      >
        <Avatar name={name} imageUrl={imageUrl} size={54} />
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <motion.span
              initial={{ scale: 0.6, rotate: -8 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 400, damping: 12, delay: 0.05 }}
              className="font-display font-black uppercase tracking-tight text-white text-lg sm:text-2xl leading-none"
            >
              Tor!
            </motion.span>
            <span className="text-[10px]">⚽️</span>
          </div>
          <div className="font-display font-black uppercase tracking-tight text-white text-sm sm:text-base leading-tight truncate">{name}</div>
          <div className="text-[11px] font-sans font-semibold text-white/80 truncate">{team}</div>
        </div>
      </motion.div>
    </div>
  );
}

// Aufstellungs-Durchlauf unten (dünnes Laufband, verdeckt kaum etwas).
function LineupFlyby({ homeTeam, awayTeam, homePlayers, awayPlayers }: { homeTeam: string; awayTeam: string; homePlayers: Player[]; awayPlayers: Player[] }) {
  const chips = [
    { label: homeTeam, players: homePlayers },
    { label: awayTeam, players: awayPlayers },
  ];
  const Row = () => (
    <div className="inline-flex items-center gap-2 pr-2">
      {chips.map((c, ci) => (
        <span key={ci} className="inline-flex items-center gap-2 pr-2">
          <span className="inline-flex items-center rounded-md bg-white/15 px-2 py-1 font-display font-black uppercase tracking-tight text-white text-[11px] shrink-0">{c.label}</span>
          {c.players.map((p, i) => (
            <span key={i} className="inline-flex items-center gap-1.5 rounded-full bg-black/45 border border-white/10 pl-1 pr-2.5 py-1 shrink-0">
              <Avatar name={p.name} imageUrl={p.imageUrl} size={22} />
              <span className="text-[11px] font-sans font-semibold text-white whitespace-nowrap">{p.number ? `${p.number} ` : ''}{p.name}</span>
            </span>
          ))}
        </span>
      ))}
    </div>
  );
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className="absolute bottom-0 inset-x-0 pb-1.5 pt-3 pointer-events-none z-10 overflow-hidden"
      style={{ background: 'linear-gradient(0deg, rgba(0,0,0,.6), transparent)' }}
    >
      <div className="hl-marquee-track">
        <Row />
        <Row />
      </div>
    </motion.div>
  );
}

function StreamCard({ field, channel, liveMatch, rosterByTeam, crestByTeam, muted, onToggleAudio }: { field: number; channel: string; liveMatch: LiveStreamMatch | null; rosterByTeam: Map<string, Player[]>; crestByTeam: Map<string, TeamVisual>; muted: boolean; onToggleAudio?: () => void }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const prevId = useRef<string | null>(null);
  const prevScorers = useRef(0);
  const [goal, setGoal] = useState<{ name: string; team: string; imageUrl?: string } | null>(null);
  const [lineup, setLineup] = useState(false);
  const goalTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const lineupTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    const m = liveMatch;
    if (!m) {
      prevId.current = null; prevScorers.current = 0;
      setGoal(null); setLineup(false);
      return;
    }
    const scorers = m.scorers ?? [];
    if (prevId.current !== m.id) {
      // Neues Live-Spiel → Aufstellung einblenden, Torzähler initialisieren (keine alte Feier).
      prevId.current = m.id;
      prevScorers.current = scorers.length;
      setGoal(null);
      setLineup(true);
      clearTimeout(lineupTimer.current);
      lineupTimer.current = setTimeout(() => setLineup(false), 12000);
      return;
    }
    if (scorers.length > prevScorers.current) {
      const s = scorers[scorers.length - 1];
      const photo = rosterByTeam.get(s.team)?.find((p) => p.name === s.player)?.imageUrl;
      setGoal({ name: s.player, team: s.team, imageUrl: photo });
      clearTimeout(goalTimer.current);
      goalTimer.current = setTimeout(() => setGoal(null), 6500);
    }
    prevScorers.current = scorers.length;
  }, [liveMatch, rosterByTeam]);

  useEffect(() => () => { clearTimeout(goalTimer.current); clearTimeout(lineupTimer.current); }, []);

  const goFullscreen = () => {
    const el = wrapRef.current;
    if (!el) return;
    if (document.fullscreenElement) document.exitFullscreen();
    else el.requestFullscreen?.().catch(() => {});
  };

  return (
    <div className="rounded-2xl overflow-hidden border border-white/10 bg-[#0b0710]">
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-white/8" style={{ background: `linear-gradient(90deg, ${PURPLE}22, transparent)` }}>
        <span className="inline-flex items-center gap-1.5 font-display font-black uppercase tracking-tight text-white text-sm">
          <Twitch className="w-4 h-4" style={{ color: PURPLE }} /> Feld {field}
        </span>
        {liveMatch ? (
          <span className="inline-flex items-center gap-1.5 text-[10px] font-sans font-black uppercase tracking-wider text-hl-red-soft">
            <span className="relative flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#FF5442] opacity-70" /><span className="relative inline-flex rounded-full h-2 w-2 bg-[#FF5442]" /></span>
            Live
          </span>
        ) : (
          <span className="text-[10px] font-sans font-bold uppercase tracking-wider text-hl-dim">Stream</span>
        )}
      </div>

      <div ref={wrapRef} className="hl-stream relative w-full aspect-video bg-black">
        <iframe
          title={`Twitch Feld ${field}`}
          src={twitchPlayerSrc(channel, { muted, autoplay: true })}
          className="absolute inset-0 w-full h-full"
          allowFullScreen
          allow="autoplay; fullscreen; picture-in-picture"
          frameBorder={0}
          scrolling="no"
        />
        <AnimatePresence>{liveMatch && <Scoreboard key="sb" match={liveMatch} crestByTeam={crestByTeam} />}</AnimatePresence>
        <AnimatePresence>
          {lineup && liveMatch && (
            <LineupFlyby
              key="lu"
              homeTeam={liveMatch.home}
              awayTeam={liveMatch.away}
              homePlayers={rosterByTeam.get(liveMatch.home) ?? []}
              awayPlayers={rosterByTeam.get(liveMatch.away) ?? []}
            />
          )}
        </AnimatePresence>
        <AnimatePresence>{goal && <GoalCard key={`goal-${goal.name}`} name={goal.name} team={goal.team} imageUrl={goal.imageUrl} />}</AnimatePresence>
      </div>

      <div className="flex items-center gap-2 px-3 py-2.5 flex-wrap">
        {onToggleAudio && (
          <button
            onClick={onToggleAudio}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-sans font-black uppercase tracking-wider cursor-pointer active:scale-95 transition-all border ${muted ? 'hl-surf-soft border-white/10 text-hl-mute hover:text-white' : 'border-transparent text-[#04120d]'}`}
            style={muted ? undefined : { background: 'var(--color-brand-accent-light, #22DFC9)' }}
          >
            {muted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
            {muted ? 'Ton an' : 'Ton aus'}
          </button>
        )}
        <a href={twitchChannelUrl(channel)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-sans font-bold uppercase tracking-wider text-white cursor-pointer active:scale-95 transition-transform" style={{ background: PURPLE }}>
          <ExternalLink className="w-3.5 h-3.5" /> Auf Twitch öffnen
        </a>
        <button onClick={goFullscreen} className="inline-flex items-center gap-1.5 rounded-lg hl-surf-soft border border-white/10 px-3 py-2 text-xs font-sans font-bold uppercase tracking-wider text-hl-mute hover:text-white cursor-pointer active:scale-95 transition-all">
          <Maximize2 className="w-3.5 h-3.5" /> Vollbild
        </button>
      </div>
    </div>
  );
}

// Gemeinsame Anzeige-Maschine für beide Anwendungsfälle.
//  • mode='home' → Startseite: schmal nur Feld 1, breiter Bildschirm beide
//    nebeneinander (Feld 2 wird nur bei breitem Screen wirklich geladen);
//    dazu ein Knopf zur Stream-Seite, solange nicht beide zu sehen sind.
//  • mode='page' → alle Felder untereinander, je eigener Ton-Schalter (nur einer an)
function Stage({ streams, subtitle, rosterByTeam, crestByTeam, liveOn, mode = 'home', onOpenFull }: {
  streams: StreamsConfig | null;
  subtitle: string;
  rosterByTeam: Map<string, Player[]>;
  crestByTeam: Map<string, TeamVisual>;
  liveOn: (field: number) => LiveStreamMatch | null;
  mode?: 'home' | 'page';
  onOpenFull?: () => void;
}) {
  const allFields = useMemo(() => {
    const list: { field: number; channel: string }[] = [];
    if (streams?.field1.trim()) list.push({ field: 1, channel: streams.field1.trim() });
    if (streams?.field2.trim()) list.push({ field: 2, channel: streams.field2.trim() });
    return list;
  }, [streams?.field1, streams?.field2]);

  // Welches Feld hat auf der Stream-Seite gerade Ton? (immer nur eins gleichzeitig).
  // Start: alles stumm – so spielt der Autoplay zuverlässig, der Besucher tippt
  // dann bei einem Feld „Ton an" (echte Nutzer-Geste, kein Ton-Durcheinander).
  const [audioField, setAudioField] = useState<number | null>(null);
  const wide = useWideScreen();

  if (!streams?.active || allFields.length === 0) return null;

  // Auf der Startseite bei schmalem Screen nur Feld 1 (Feld 2 wird gar nicht erst
  // geladen → spart am Handy Daten). Breiter Screen: beide nebeneinander.
  const bothOnHome = mode === 'home' && wide && allFields.length > 1;
  const shownFields = mode === 'page' || bothOnHome ? allFields : allFields.slice(0, 1);
  const showButton = mode === 'home' && allFields.length > 1 && !bothOnHome;

  const gridClass =
    mode === 'page'
      ? 'space-y-5 max-w-4xl'
      : bothOnHome
        ? 'grid grid-cols-2 gap-4'
        : 'grid grid-cols-1 max-w-3xl gap-4';

  return (
    <div className="relative border-b border-white/8" style={{ background: `radial-gradient(120% 100% at 50% 0%, ${PURPLE}22, transparent 62%), #070510` }}>
      <div className="max-w-[1320px] xl:max-w-[1600px] 2xl:max-w-[1780px] mx-auto px-4 sm:px-10 py-6 sm:py-8">
        <div className="flex items-center gap-2.5 mb-4">
          <Radio className="w-5 h-5" style={{ color: PURPLE }} />
          <h2 className="font-display font-black uppercase tracking-tight text-white text-xl sm:text-2xl">Live auf Twitch</h2>
          <span className="text-[11px] font-sans font-semibold text-hl-mute hidden sm:inline">· {subtitle}</span>
        </div>

        <div className={gridClass}>
          {shownFields.map((f) => (
            <StreamCard
              key={f.field}
              field={f.field}
              channel={f.channel}
              liveMatch={liveOn(f.field)}
              rosterByTeam={rosterByTeam}
              crestByTeam={crestByTeam}
              muted={mode === 'page' ? audioField !== f.field : true}
              onToggleAudio={mode === 'page' ? () => setAudioField((cur) => (cur === f.field ? null : f.field)) : undefined}
            />
          ))}
        </div>

        {showButton && onOpenFull && (
          <button
            onClick={onOpenFull}
            className="mt-4 inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-sans font-black uppercase tracking-wider text-white cursor-pointer active:scale-[0.98] transition-transform shadow-[0_10px_30px_-10px_rgba(145,71,255,.8)]"
            style={{ background: PURPLE }}
          >
            <MonitorPlay className="w-4 h-4" /> Beide Felder ansehen
          </button>
        )}
      </div>
    </div>
  );
}

// --- Adapter: Testspieltag (Event-Archiv, Team-Namen) --------------------------
// `teams` = echte Liga-Vereine: darüber holen wir Wappen/Logo und – falls im Event
// kein Kader gepflegt ist – ersatzweise die echte Spielerliste (Namensabgleich).
export default function StreamStage({ streams, event, teams = [], mode = 'home', onOpenFull }: { streams: StreamsConfig | null; event: EventConfig | null; teams?: Team[]; mode?: 'home' | 'page'; onOpenFull?: () => void }) {
  const teamByName = useMemo(() => {
    const m = new Map<string, Team>();
    teams.forEach((t) => m.set(t.name.trim().toLowerCase(), t));
    return m;
  }, [teams]);

  const rosterByTeam = useMemo(() => {
    const m = new Map<string, Player[]>();
    event?.rosters?.forEach((r) => {
      const own = r.players ?? [];
      // Kein Event-Kader gepflegt? → echte Vereins-Spielerliste als Fallback.
      const fallback = own.length ? own : teamByName.get(r.team.trim().toLowerCase())?.spielerliste ?? [];
      m.set(r.team, fallback);
    });
    return m;
  }, [event, teamByName]);

  const crestByTeam = useMemo(() => {
    const m = new Map<string, TeamVisual>();
    (event?.teams ?? []).forEach((name) => {
      const t = teamByName.get(name.trim().toLowerCase());
      m.set(name, { logoUrl: t?.logoUrl, color: t?.logoColor ?? PURPLE, shortName: t?.shortName });
    });
    return m;
  }, [event, teamByName]);

  const liveOn = (field: number): LiveStreamMatch | null => {
    const mm = event?.matches?.find((x) => x.field === field && x.status === 'live');
    if (!mm) return null;
    return {
      id: mm.id,
      home: mm.home,
      away: mm.away,
      homeScore: mm.homeScore ?? 0,
      awayScore: mm.awayScore ?? 0,
      liveStartedAt: mm.liveStartedAt,
      durationMinutes: mm.durationMinutes,
      pausedAt: mm.pausedAt,
      scorers: (mm.scorers ?? []).map((s) => ({ player: s.player, team: s.team })),
    };
  };

  const subtitle = mode === 'home' ? 'Feld 1 – beide Felder auf der Stream-Seite' : 'beide Felder gleichzeitig';
  return <Stage streams={streams} subtitle={subtitle} rosterByTeam={rosterByTeam} crestByTeam={crestByTeam} liveOn={liveOn} mode={mode} onOpenFull={onOpenFull} />;
}

// --- Adapter: echte Liga (Liga-Spiele, Team-IDs → Namen) -----------------------
export function LeagueStreamStage({ streams, teams, matches, mode = 'home', onOpenFull }: { streams: StreamsConfig | null; teams: Team[]; matches: Match[]; mode?: 'home' | 'page'; onOpenFull?: () => void }) {
  const rosterByTeam = useMemo(() => {
    const m = new Map<string, Player[]>();
    teams.forEach((t) => m.set(t.name, t.spielerliste ?? []));
    return m;
  }, [teams]);

  const crestByTeam = useMemo(() => {
    const m = new Map<string, TeamVisual>();
    teams.forEach((t) => m.set(t.name, { logoUrl: t.logoUrl, color: t.logoColor ?? PURPLE, shortName: t.shortName }));
    return m;
  }, [teams]);

  const nameById = useMemo(() => {
    const m = new Map<string, string>();
    teams.forEach((t) => m.set(t.id, t.name));
    return m;
  }, [teams]);

  const liveOn = (field: number): LiveStreamMatch | null => {
    const mm = matches.find((x) => x.field === field && x.status === 'live');
    if (!mm) return null;
    return {
      id: mm.id,
      home: nameById.get(mm.homeTeamId) ?? '?',
      away: nameById.get(mm.awayTeamId) ?? '?',
      homeScore: mm.homeScore,
      awayScore: mm.awayScore,
      liveStartedAt: mm.liveStartedAt,
      durationMinutes: mm.durationMinutes,
      pausedAt: mm.pausedAt,
      scorers: (mm.scorers ?? []).map((s) => ({ player: s.playerName, team: nameById.get(s.teamId) ?? '?' })),
    };
  };

  const subtitle = mode === 'home' ? 'Feld 1 – beide Felder auf der Stream-Seite' : 'beide Felder gleichzeitig';
  return <Stage streams={streams} subtitle={subtitle} rosterByTeam={rosterByTeam} crestByTeam={crestByTeam} liveOn={liveOn} mode={mode} onOpenFull={onOpenFull} />;
}
