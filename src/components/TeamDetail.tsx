import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ChevronDown } from 'lucide-react';
import { motion } from 'motion/react';
import { Match, MatchPlayerStat, Player, PlayerStat, ScoringConfig, StatRole, Team, TeamSponsorsMap } from '../types';
import { calculateStandings } from '../lib/standings';
import { matchNote, normalizeCounts, playerCard, quotas, sumCounts } from '../lib/rating';
import { apiFetch } from '../lib/api';
import PlayerAvatar from './PlayerAvatar';
import BestLineup from './BestLineup';
import FifaCard from './FifaCard';
import { TeamCrest, FormPill, MatchStatusBadge, shortDate, shade, monogram, ImageZoom, SponsorLink } from './ui';

// Note-Farbe (rot → gelb → grün) relativ zur Rating-Skala.
function noteColorFor(note: number, cfg: ScoringConfig): string {
  const span = cfg.rating.max - cfg.rating.min || 1;
  const t = Math.max(0, Math.min(1, (note - cfg.rating.min) / span));
  if (t < 0.5) return '#FF5442';
  if (t < 0.7) return '#E9C46A';
  return '#43E5A0';
}

// Modulweiter Cache der Team-Sponsoren: einmal je Seitenaufruf laden.
let teamSponsorsCache: TeamSponsorsMap | null = null;

interface TeamDetailProps {
  team: Team;
  teams: Team[];
  matches: Match[]; // Spiele der ausgewählten Saison
  players: PlayerStat[];
  seasonLabel: string;
  initialPlayer?: string; // aus der URL/Suche vorausgewählter Spieler (Detail direkt offen)
  onBack: () => void;
  onSelectTeam: (teamId: string) => void;
  trackingRows?: MatchPlayerStat[]; // veröffentlichte getrackte Zähler (Statistics Center)
  scoringConfig?: ScoringConfig; // Score-Einstellungen (für Note/Quoten/Karte)
  onOpenMatch?: (matchId: string) => void; // öffnet den Spielbericht
  onOpenPlayer?: (name: string) => void; // öffnet einen Spieler über die URL (/verein/…/spieler/…)
}

// Ein Kaderspieler mit den aus den Spieldaten berechneten Werten.
interface RosterEntry extends Player {
  goals: number;
  assists: number;
  matchesPlayed: number;
  wins: number;
  draws: number;
  losses: number;
  winRate: number | null; // null = noch kein Einsatz
  motmCount: number;
  gamesInGoal: number;
}

export default function TeamDetail({
  team,
  teams,
  matches,
  players,
  seasonLabel,
  initialPlayer,
  onBack,
  onSelectTeam,
  trackingRows = [],
  scoringConfig,
  onOpenMatch,
  onOpenPlayer,
}: TeamDetailProps) {
  const color = team.logoColor || '#22DFC9';
  const accentSoft = shade(color, 1.25); // hellere Variante für Text auf dunklem Grund

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
  const roster: RosterEntry[] = useMemo(
    () =>
      (team.spielerliste || []).map((player) => {
        const stats = players.find((p) => p.teamId === team.id && p.name === player.name);
        const matchesPlayed = stats?.matchesPlayed ?? 0;
        const wins = stats?.wins ?? 0;
        return {
          ...player,
          goals: stats?.goals ?? 0,
          assists: stats?.assists ?? 0,
          matchesPlayed,
          wins,
          draws: stats?.draws ?? 0,
          losses: stats?.losses ?? 0,
          winRate: matchesPlayed > 0 ? Math.round((wins / matchesPlayed) * 100) : null,
          motmCount: stats?.motmCount ?? 0,
          gamesInGoal: stats?.gamesInGoal ?? 0,
        };
      }),
    [team.spielerliste, players, team.id]
  );

  // Captain (max. einer pro Team, im Admin gesetzt)
  const captain = useMemo(() => roster.find((p) => p.captain) ?? null, [roster]);

  // Beste Aufstellung = individuell beste Spieler nach Siegquote.
  // Fester Torwart (häufigster Keeper) unten, 4 beste Feldspieler aufs Feld,
  // 5./6. bester auf die Bank. Mindest-Einsätze verhindern, dass jemand mit
  // 1 Spiel/100 % oben landet.
  const bestXI = useMemo(() => {
    const played = roster.filter((p) => p.matchesPlayed > 0);
    if (played.length === 0) return null;
    const maxPlayed = played.reduce((m, p) => Math.max(m, p.matchesPlayed), 0);
    const minGames = Math.max(2, Math.ceil(maxPlayed * 0.3));
    const gk =
      [...played]
        .filter((p) => p.gamesInGoal > 0)
        .sort((a, b) => b.gamesInGoal - a.gamesInGoal || b.matchesPlayed - a.matchesPlayed)[0] ?? null;
    const outfield = played.filter((p) => p.name !== gk?.name);
    const rank = (list: RosterEntry[]) =>
      [...list].sort(
        (a, b) =>
          (b.winRate ?? -1) - (a.winRate ?? -1) ||
          b.matchesPlayed - a.matchesPlayed ||
          b.wins - a.wins ||
          a.name.localeCompare(b.name)
      );
    // Erst Spieler mit genug Einsätzen (belastbare Quote), dann der Rest.
    const ordered = [
      ...rank(outfield.filter((p) => p.matchesPlayed >= minGames)),
      ...rank(outfield.filter((p) => p.matchesPlayed < minGames)),
    ];
    const toXI = (p: RosterEntry) => ({
      name: p.name,
      firstName: p.name.split(/\s+/)[0],
      imageUrl: p.imageUrl,
      winRate: p.winRate,
      matchesPlayed: p.matchesPlayed,
    });
    const field = ordered.slice(0, 4).map(toXI);
    const bench = ordered.slice(4, 6).map(toXI);
    if (!gk && field.length === 0) return null;
    return { goalkeeper: gk ? toXI(gk) : null, field, bench };
  }, [roster]);

  // Star des Teams: bester Torschütze/Vorlagengeber des Kaders
  const star = useMemo(() => {
    const list = players.filter((p) => p.teamId === team.id && (p.goals > 0 || p.assists > 0));
    return [...list].sort((a, b) => b.goals - a.goals || b.assists - a.assists)[0] ?? null;
  }, [players, team.id]);

  // Der geöffnete Spieler steckt in der URL (/verein/<id>/spieler/<name>). Dadurch
  // funktioniert „Zurück" (Geste/Taste) von selbst: aus einem Spiel zurück landet
  // man wieder bei GENAU diesem Spieler – die FIFA-Karte bleibt offen.
  const selectedPlayerName = initialPlayer ?? null;
  const selected = useMemo(
    () => roster.find((p) => p.name === selectedPlayerName) ?? null,
    [roster, selectedPlayerName]
  );

  // „Note je Spiel"-Auf/Zu je Spieler merken, damit auch DAS nach dem Rücksprung
  // aus einem Spiel erhalten bleibt (man will ja weitere Spiele ansehen).
  const NOTES_KEY = 'hl-teamdetail-notes';
  const readNotesOpen = (): boolean => {
    try {
      const r = JSON.parse(sessionStorage.getItem(NOTES_KEY) || 'null');
      return !!(r && r.team === team.id && r.player === selectedPlayerName && r.open);
    } catch {
      return false;
    }
  };
  const [notesOpen, setNotesOpen] = useState<boolean>(() => readNotesOpen());
  // Bei Spielerwechsel Noten passend setzen (offen NUR, wenn für den Spieler gemerkt).
  useEffect(() => {
    setNotesOpen(readNotesOpen());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [team.id, selectedPlayerName]);
  useEffect(() => {
    try {
      if (selectedPlayerName) sessionStorage.setItem(NOTES_KEY, JSON.stringify({ team: team.id, player: selectedPlayerName, open: notesOpen }));
    } catch {
      /* egal */
    }
  }, [team.id, selectedPlayerName, notesOpen]);

  // Einen Spieler öffnen = in die URL navigieren (History-Eintrag → „Zurück" führt
  // sauber hierher zurück). Danach zum Kopf scrollen für die Umblendung.
  const selectPlayer = useCallback(
    (name: string) => {
      if (onOpenPlayer) onOpenPlayer(name);
      if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    [onOpenPlayer]
  );
  // Spieler-Detail schließen = zurück auf die reine Teamseite (ohne Spieler in der URL).
  const closePlayer = useCallback(() => onSelectTeam(team.id), [onSelectTeam, team.id]);
  const positionLabel = (p: RosterEntry) =>
    p.gamesInGoal > 0 && p.gamesInGoal * 2 >= p.matchesPlayed ? 'Torwart' : 'Feldspieler';

  // --- Statistics Center: getrackte Werte des ausgewählten Spielers ---------
  const playerRows = useMemo(
    () => trackingRows.filter((r) => r.teamId === team.id && r.playerName === selectedPlayerName),
    [trackingRows, team.id, selectedPlayerName]
  );
  const trackedTotal = useMemo(() => sumCounts(playerRows.map((r) => normalizeCounts(r.counts))), [playerRows]);
  const trackedRole: StatRole = selected && positionLabel(selected) === 'Torwart' ? 'keeper' : 'field';
  const playerCardData = useMemo(
    () =>
      selected && playerRows.length > 0 && scoringConfig
        ? playerCard(trackedTotal, playerRows.length, trackedRole, scoringConfig)
        : null,
    [selected, playerRows.length, trackedTotal, trackedRole, scoringConfig]
  );
  const trackedQuotas = useMemo(
    () => (playerRows.length > 0 && scoringConfig ? quotas(trackedTotal, scoringConfig) : null),
    [trackedTotal, playerRows.length, scoringConfig]
  );
  const perMatchNotes = useMemo(
    () =>
      scoringConfig
        ? playerRows.map((r) => ({
            matchId: r.matchId,
            note: matchNote(normalizeCounts(r.counts), scoringConfig, r.role === 'keeper' ? 'keeper' : 'field'),
          }))
        : [],
    [playerRows, scoringConfig]
  );

  // Spieler-Panel bleibt IMMER gemountet (auch verdeckt), damit der Kopf konstant
  // hoch bleibt und beim Umschalten nichts springt. Ohne Auswahl dient der erste
  // Kaderspieler nur zum Reservieren der Höhe (unsichtbar).
  const sizingPlayer = selected ?? roster[0] ?? null;

  // Lange „Spiele"-Liste standardmäßig eingeklappt (weniger Scrollen).
  const [showAllMatches, setShowAllMatches] = useState(false);
  // Spiele mit veröffentlichten Einzelnoten → deren Balken führen zum Spielbericht.
  const reportMatchIds = useMemo(() => new Set(trackingRows.map((r) => r.matchId)), [trackingRows]);

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

  // Eine Statistik-Kachel für die Spieler-Detailansicht.
  // Mobil teilen sich die Kacheln die Breite (eine Reihe, kein Umbruch), ab sm
  // wieder natürliche Breite.
  const StatTile = ({ value, label, accent }: { value: React.ReactNode; label: string; accent?: boolean }) => (
    <div className="flex-1 min-w-0 sm:flex-none sm:min-w-[70px] lg:min-w-[92px] bg-white/[.04] border border-white/[.08] rounded-xl px-1.5 sm:px-3 lg:px-4 py-2.5 lg:py-3.5 text-center">
      <div className="font-display font-black text-[19px] sm:text-[26px] lg:text-[34px] leading-none" style={accent ? { color: accentSoft } : { color: '#fff' }}>
        {value}
      </div>
      <div className="font-sans font-bold text-[8px] sm:text-[9px] lg:text-[11px] tracking-[1px] sm:tracking-[1.5px] text-hl-dim mt-1.5 lg:mt-2">{label}</div>
    </div>
  );

  return (
    <div className="max-w-[1320px] xl:max-w-[1600px] 2xl:max-w-[1780px] mx-auto px-4 sm:px-10 pb-11">
      <button
        onClick={onBack}
        className="inline-flex items-center gap-1.5 mt-8 font-sans font-bold text-xs tracking-wider uppercase text-hl-dim hover:text-white transition-colors cursor-pointer"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Zurück zur Übersicht
      </button>

      {/* Kopf: blendet zwischen Team-Ansicht und Spieler-Detail um.
          Feste Mindesthöhe + vertikale Zentrierung, damit Team- und Spieler-Ansicht
          exakt gleich hoch sind – so springt beim Umschalten nichts (auch der weiße
          Partner-/Footer-Bereich bleibt an Ort und Stelle). Kein overflow-hidden am
          Container, damit das Spielerbild beim Hover sanft über die Kante ragen darf –
          der Farb-Glow wird separat geklemmt. */}
      <div className="relative mt-4 grid">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div
            className="absolute -top-40 -left-32 w-[560px] h-[560px] opacity-60 transition-colors"
            style={{ background: `radial-gradient(circle, ${color}22, transparent 66%)` }}
          />
        </div>

        {/* Spieler-Panel – immer gemountet (auch verdeckt), damit die Kopf-Höhe
            konstant bleibt und beim Umschalten nichts springt. */}
        {sizingPlayer && (
            <motion.div
              aria-hidden={!selected}
              initial={false}
              animate={{ opacity: selected ? 1 : 0, x: selected ? 0 : 18 }}
              transition={{ duration: 0.32, ease: [0.22, 0.61, 0.36, 1] }}
              className={`[grid-area:1/1] self-center relative flex flex-col lg:flex-row items-start lg:items-center gap-6 lg:gap-10 py-6 ${selected ? '' : 'pointer-events-none'}`}
            >
              {/* Große FIFA-Karte links – ersetzt das doppelte Foto. Getrackte
                  Spieler bekommen die Karte; ohne Werte zeigen wir das Porträt. */}
              {playerCardData ? (
                <div className="w-[200px] sm:w-[220px] lg:w-[240px] shrink-0 mx-auto lg:mx-0">
                  <FifaCard
                    card={playerCardData}
                    name={sizingPlayer.name}
                    imageUrl={sizingPlayer.imageUrl}
                    team={team}
                  />
                </div>
              ) : (
                <div className="relative shrink-0 mx-auto lg:mx-0">
                  <div
                    className="absolute -inset-3 rounded-[34px] blur-xl opacity-50"
                    style={{ background: `radial-gradient(circle, ${color}, transparent 70%)` }}
                  />
                  {sizingPlayer.imageUrl ? (
                    <ImageZoom
                      src={sizingPlayer.imageUrl}
                      alt={sizingPlayer.name}
                      className="relative w-[150px] h-[150px] object-cover rounded-[32px] border-2"
                      style={{ borderColor: color }}
                      zoomClassName="w-72 sm:w-96 max-w-[85vw] max-h-[80vh] object-contain"
                    />
                  ) : (
                    <span
                      className="relative grid place-items-center w-[150px] h-[150px] rounded-[32px] font-display font-black text-6xl text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,.18)]"
                      style={{ background: `linear-gradient(140deg, ${color}, ${shade(color, 0.45)})` }}
                    >
                      {monogram(sizingPlayer.name)}
                    </span>
                  )}
                </div>
              )}

              <div className="flex-1 w-full sm:w-auto min-w-0 sm:min-w-[260px]">
                <button
                  onClick={closePlayer}
                  className="inline-flex items-center gap-1.5 font-sans font-bold text-[11px] tracking-wider uppercase text-hl-dim hover:text-white transition-colors cursor-pointer mb-2"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  Zurück zu {team.name}
                </button>
                <div className="font-sans font-extrabold text-xs tracking-[2.5px] uppercase" style={{ color: accentSoft }}>
                  {positionLabel(sizingPlayer)}
                  {typeof sizingPlayer.number === 'number' ? ` · #${sizingPlayer.number}` : ''}
                  {sizingPlayer.captain ? ' · KAPITÄN' : ''}
                </div>
                <h1 className="mt-2 font-display font-black text-4xl sm:text-6xl leading-[.85] tracking-tight uppercase text-white">
                  {sizingPlayer.name}
                </h1>
                <div className="flex gap-1.5 sm:gap-2 mt-4 flex-nowrap sm:flex-wrap">
                  <StatTile value={sizingPlayer.matchesPlayed} label="SPIELE" />
                  <StatTile value={sizingPlayer.goals} label="TORE" accent />
                  <StatTile value={sizingPlayer.assists} label="VORLAGEN" accent />
                  <StatTile value={sizingPlayer.winRate === null ? '–' : `${sizingPlayer.winRate}%`} label="SIEGQUOTE" accent />
                  {sizingPlayer.motmCount > 0 && <StatTile value={sizingPlayer.motmCount} label="MVP" />}
                </div>
                {sizingPlayer.matchesPlayed > 0 && (
                  <div className="font-sans text-[11px] text-hl-dim mt-3">
                    Bilanz mit {sizingPlayer.name.split(/\s+/)[0]} auf dem Feld:{' '}
                    <span className="text-hl-green-soft font-bold">{sizingPlayer.wins}S</span> ·{' '}
                    <span className="text-[#F0CE77] font-bold">{sizingPlayer.draws}U</span> ·{' '}
                    <span className="text-hl-red-soft font-bold">{sizingPlayer.losses}N</span>
                  </div>
                )}

                {/* Statistics Center: Quoten + Note je Spiel (aus getrackten Daten) */}
                {playerCardData && scoringConfig && (
                  <div className="mt-4">
                    {trackedQuotas && (
                      <div className="flex gap-1.5 sm:gap-2 flex-nowrap sm:flex-wrap overflow-x-auto no-scrollbar">
                        {trackedQuotas.passquote !== null && (
                          <StatTile value={`${Math.round(trackedQuotas.passquote * 100)}%`} label="PASSQUOTE" accent />
                        )}
                        {trackedQuotas.schussquote !== null && (
                          <StatTile value={`${Math.round(trackedQuotas.schussquote * 100)}%`} label="SCHUSSQ." accent />
                        )}
                        {trackedQuotas.zweikampfquote !== null && (
                          <StatTile value={`${Math.round(trackedQuotas.zweikampfquote * 100)}%`} label="ZWEIKAMPF" accent />
                        )}
                        {trackedQuotas.dribblingquote !== null && (
                          <StatTile value={`${Math.round(trackedQuotas.dribblingquote * 100)}%`} label="DRIBBLING" accent />
                        )}
                      </div>
                    )}
                    {perMatchNotes.length > 0 && (
                      <div className="mt-3">
                        <button
                          onClick={() => setNotesOpen((v) => !v)}
                          className="flex items-center gap-1.5 font-sans font-bold text-[10px] tracking-[2px] uppercase text-hl-dim hover:text-hl-soft transition-colors cursor-pointer"
                        >
                          Note je Spiel
                          <span className="text-hl-faint">({perMatchNotes.length})</span>
                          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${notesOpen ? 'rotate-180' : ''}`} />
                        </button>
                        {/* Sanftes Auf-/Zuklappen: die Reihe wächst weich mit (grid-rows 0fr→1fr),
                            dadurch rutscht die FIFA-Karte darunter smooth mit statt zu springen. */}
                        <div
                          className="grid transition-[grid-template-rows] duration-300 ease-out"
                          style={{ gridTemplateRows: notesOpen ? '1fr' : '0fr' }}
                        >
                          <div className="overflow-hidden">
                            <div key={`${selectedPlayerName}-${notesOpen}`} className="flex flex-wrap gap-1.5 pt-2">
                              {perMatchNotes.map((pm, i) => (
                                <button
                                  key={`${pm.matchId}-${i}`}
                                  onClick={() => onOpenMatch?.(pm.matchId)}
                                  title={`Spieltag ${i + 1} · Note ${pm.note.toFixed(1)} – zum Spiel`}
                                  className="hl-note-in px-2.5 py-1 rounded-lg text-xs font-display font-black tabular-nums border border-white/10 bg-white/[.02] hover:border-white/30 hover:bg-white/[.06] active:scale-95 transition cursor-pointer"
                                  style={{ color: noteColorFor(pm.note, scoringConfig), animationDelay: `${notesOpen ? i * 0.04 : 0}s` }}
                                >
                                  {pm.note.toFixed(1)}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

            </motion.div>
        )}

        {/* Team-Panel – immer gemountet */}
        <motion.div
          aria-hidden={!!selected}
          initial={false}
          animate={{ opacity: selected ? 0 : 1, x: selected ? -18 : 0 }}
          transition={{ duration: 0.32, ease: [0.22, 0.61, 0.36, 1] }}
          className={`[grid-area:1/1] self-center relative flex flex-col sm:flex-row items-start sm:items-center gap-6 flex-wrap py-6 ${selected ? 'pointer-events-none' : ''}`}
        >
              {/* Logo + (nur auf dem Handy) kleiner Captain rechts daneben – wie bei der
                  ICON League. sm:contents ⇒ auf Desktop fließt das Logo wieder als
                  normales Flex-Element und der Captain steht wie gehabt ganz rechts. */}
              <div className="flex w-full items-start justify-between gap-4 sm:contents">
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
                    style={{ background: `linear-gradient(140deg, ${color}, ${shade(color, 0.45)})` }}
                  >
                    {monogram(team.shortName || team.name)}
                  </span>
                )}
                {/* Captain klein – nur Handy, oben rechts, Name darunter */}
                {captain && (
                  <button
                    type="button"
                    onClick={() => selectPlayer(captain.name)}
                    className="flex sm:hidden flex-col items-center gap-1 shrink-0 max-w-[108px] cursor-pointer group"
                    title={`${captain.name} – Kapitän`}
                  >
                    {captain.imageUrl ? (
                      <img
                        src={captain.imageUrl}
                        alt={captain.name}
                        loading="lazy"
                        decoding="async"
                        referrerPolicy="no-referrer"
                        className="w-[86px] h-[98px] object-contain object-bottom drop-shadow-[0_8px_20px_rgba(0,0,0,.5)] group-active:scale-95 transition-transform"
                      />
                    ) : (
                      <PlayerAvatar name={captain.name} color={color} size="lg" />
                    )}
                    <span
                      className="font-sans font-extrabold text-[8px] tracking-[1.5px] uppercase px-2 py-0.5 rounded-full"
                      style={{ color: '#0b0f10', background: accentSoft }}
                    >
                      Kapitän
                    </span>
                    <span className="font-sans font-semibold text-[10.5px] text-white text-center leading-tight truncate max-w-full">
                      {captain.name}
                    </span>
                  </button>
                )}
              </div>
              <div className="flex-1 w-full sm:w-auto min-w-0 sm:min-w-[260px]">
                <div className="font-sans font-extrabold text-xs tracking-[2.5px] uppercase" style={{ color: accentSoft }}>
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
                {/* Club-Kennzahlen – gehören zum Verein, darum direkt unter Name & Bilanz
                    (nicht neben dem Kapitän, wo sie fälschlich zu ihm zu gehören schienen). */}
                {standing && (
                  <div className="flex gap-6 mt-5 flex-wrap items-start">
                    <div>
                      <div className="font-display font-black text-[44px] leading-[.9]" style={{ color: accentSoft }}>{standing.points}</div>
                      <div className="font-sans font-bold text-[10px] tracking-[1.5px] text-hl-dim mt-1">PUNKTE</div>
                    </div>
                    <div className="w-px self-stretch bg-white/10" />
                    <div>
                      <div className="font-display font-black text-[44px] leading-[.9] text-white">{standing.goalsFor}</div>
                      <div className="font-sans font-bold text-[10px] tracking-[1.5px] text-hl-dim mt-1">TORE</div>
                    </div>
                    <div className="w-px self-stretch bg-white/10" />
                    <div>
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

              {/* Captain (Desktop) – groß rechts neben dem Team, ohne Hintergrund.
                  Auf dem Handy versteckt (dort steht er klein oben rechts neben dem Logo). */}
              {captain && (
                <button
                  type="button"
                  onClick={() => selectPlayer(captain.name)}
                  className="flex-none hidden sm:flex flex-col items-center gap-2 pl-2 ml-auto group cursor-pointer"
                  title={`${captain.name} – Kapitän`}
                >
                  {captain.imageUrl ? (
                    <img
                      src={captain.imageUrl}
                      alt={captain.name}
                      loading="lazy"
                      decoding="async"
                      referrerPolicy="no-referrer"
                      className="w-[168px] h-[198px] object-contain object-bottom drop-shadow-[0_12px_28px_rgba(0,0,0,.6)] transition-transform duration-200 group-hover:scale-[1.04]"
                    />
                  ) : (
                    <PlayerAvatar name={captain.name} color={color} size="xl" />
                  )}
                  <span
                    className="font-sans font-extrabold text-[10px] tracking-[2px] uppercase px-2.5 py-1 rounded-full"
                    style={{ color: '#0b0f10', background: accentSoft }}
                  >
                    Kapitän
                  </span>
                  {/* Name + Kurzdaten – nutzt den Platz und macht klar, wer der Kapitän ist. */}
                  <div className="font-display font-black text-lg leading-tight text-white text-center max-w-[190px]">
                    {captain.name}
                  </div>
                  {captain.matchesPlayed > 0 && (
                    <div className="flex items-stretch gap-1.5">
                      <div className="text-center px-2.5 py-1.5 rounded-lg bg-white/[.04] border border-white/10">
                        <div className="font-display font-black text-base leading-none text-white">{captain.matchesPlayed}</div>
                        <div className="font-sans font-bold text-[8px] tracking-[1px] text-hl-dim mt-1">SPIELE</div>
                      </div>
                      <div className="text-center px-2.5 py-1.5 rounded-lg bg-white/[.04] border border-white/10">
                        <div className="font-display font-black text-base leading-none" style={{ color: accentSoft }}>{captain.goals}</div>
                        <div className="font-sans font-bold text-[8px] tracking-[1px] text-hl-dim mt-1">TORE</div>
                      </div>
                      <div className="text-center px-2.5 py-1.5 rounded-lg bg-white/[.04] border border-white/10">
                        <div className="font-display font-black text-base leading-none text-white">{captain.assists}</div>
                        <div className="font-sans font-bold text-[8px] tracking-[1px] text-hl-dim mt-1">VORLAGEN</div>
                      </div>
                    </div>
                  )}
                </button>
              )}
            </motion.div>
      </div>

      {/* Body: Kader · Sidebar · Spiele. Auf dem Handy per order: Kader → Sidebar → Spiele
          (die lange Spiele-Liste ganz nach unten). Auf Desktop: links Kader + Spiele, rechts Sidebar. */}
      <div className="mt-6 flex flex-col gap-6 lg:grid lg:grid-cols-[1.55fr_1fr] lg:gap-6 lg:items-start">
        {/* Kader */}
        <div className="order-1 lg:col-start-1 lg:row-start-1">
          <div className="font-display font-black text-2xl lg:text-3xl uppercase text-white mb-4">Kader</div>
          {roster.length === 0 ? (
            <div className="hl-card p-8 text-center text-hl-mute font-sans text-sm">Noch keine Spieler hinterlegt.</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-[9px]">
              {roster.map((player) => {
                const isSelected = player.name === selectedPlayerName;
                return (
                  <button
                    key={player.name}
                    type="button"
                    onClick={() => selectPlayer(player.name)}
                    className="group flex items-center gap-3 px-3.5 py-[11px] rounded-[13px] bg-[linear-gradient(180deg,rgba(255,255,255,.04),rgba(255,255,255,.012))] border text-left cursor-pointer transition-transform duration-150 will-change-transform hover:scale-[1.025] hover:-translate-y-[1px] active:scale-[.99]"
                    style={{
                      borderColor: isSelected ? color : 'rgba(255,255,255,.08)',
                      boxShadow: isSelected ? `0 0 0 1px ${color}` : undefined,
                    }}
                    title={`${player.name} – Details anzeigen`}
                  >
                    {player.imageUrl ? (
                      <img
                        src={player.imageUrl}
                        alt={player.name}
                        loading="lazy"
                        decoding="async"
                        referrerPolicy="no-referrer"
                        className="w-11 h-11 lg:w-[52px] lg:h-[52px] rounded-[13px] object-cover border shrink-0"
                        style={{ borderColor: color }}
                      />
                    ) : (
                      <span
                        className="grid place-items-center w-11 h-11 lg:w-[52px] lg:h-[52px] rounded-[13px] font-display font-black text-white shrink-0 text-base lg:text-xl shadow-[inset_0_0_0_1px_rgba(255,255,255,.18)]"
                        style={{ background: `linear-gradient(140deg, ${color}, ${shade(color, 0.45)})` }}
                      >
                        {monogram(player.name)}
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="font-sans font-semibold text-sm lg:text-[15px] text-hl-text truncate">{player.name}</span>
                        {typeof player.number === 'number' && (
                          <span
                            className="flex-none font-sans font-bold text-[9.5px] px-1 py-[1px] rounded bg-white/[.06] text-hl-mute tabular-nums"
                            title={`Trikotnummer ${player.number}`}
                          >
                            #{player.number}
                          </span>
                        )}
                        {player.captain && (
                          <span
                            className="flex-none font-sans font-black text-[8px] tracking-wider px-1 py-[1px] rounded"
                            style={{ color: '#0b0f10', background: accentSoft }}
                            title="Kapitän"
                          >
                            C
                          </span>
                        )}
                      </div>
                      <div className="font-sans text-[11px] lg:text-[13px] text-hl-dim">
                        {player.matchesPlayed} Sp. · {player.assists} Assists
                        {player.winRate !== null ? ` · ${player.winRate}% Siege` : ''}
                      </div>
                    </div>
                    {player.goals > 0 && (
                      <span
                        className="flex-none font-sans font-extrabold text-[11px] lg:text-[13px] px-2 lg:px-2.5 py-[3px] rounded-md"
                        style={{ color: accentSoft, background: `${color}22` }}
                      >
                        {player.goals} ⚽
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Spiele – auf dem Handy ganz unten (order-3), auf Desktop unter dem Kader */}
        <div className="order-3 lg:col-start-1 lg:row-start-2">
          {/* Spiele – standardmäßig eingeklappt, per Klick alle anzeigen */}
          <button
            type="button"
            onClick={() => setShowAllMatches((v) => !v)}
            disabled={teamMatches.length === 0}
            className="w-full flex items-center justify-between gap-3 mb-4 cursor-pointer disabled:cursor-default group"
            aria-expanded={showAllMatches}
          >
            <span className="font-display font-black text-2xl lg:text-3xl uppercase text-white">Spiele</span>
            {teamMatches.length > 0 && (
              <span className="inline-flex items-center gap-1.5 font-sans font-bold text-xs tracking-wider uppercase text-hl-dim group-hover:text-white transition-colors">
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
                const canOpen = !!(onOpenMatch && reportMatchIds.has(m.id));
                return (
                  <div
                    key={m.id}
                    onClick={canOpen ? () => onOpenMatch!(m.id) : undefined}
                    role={canOpen ? 'button' : undefined}
                    tabIndex={canOpen ? 0 : undefined}
                    onKeyDown={canOpen ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpenMatch!(m.id); } } : undefined}
                    className={`flex items-center justify-between gap-3 px-3.5 py-[11px] rounded-[13px] bg-[linear-gradient(180deg,rgba(255,255,255,.04),rgba(255,255,255,.012))] border border-white/[.08] transition-colors ${canOpen ? 'cursor-pointer hover:border-white/25' : ''}`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 text-sm lg:text-[15px]">
                        <span className="text-[10px] lg:text-[11px] font-sans font-bold text-hl-faint shrink-0">{m.matchday}. Sp.</span>
                        <span className="text-[10px] lg:text-[11px] font-sans font-bold text-hl-faint shrink-0 uppercase">{isHome ? 'H' : 'A'}</span>
                        {opp ? (
                          <button
                            onClick={(e) => { e.stopPropagation(); onSelectTeam(opp.id); }}
                            className="font-sans font-semibold text-hl-text truncate hover:text-white transition-colors cursor-pointer"
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
                        <span className="font-display font-black text-white text-base lg:text-lg px-2.5 lg:px-3 py-1 rounded-lg bg-white/[.04] border border-white/10">
                          {isHome ? `${m.homeScore}:${m.awayScore}` : `${m.awayScore}:${m.homeScore}`}
                        </span>
                      ) : m.status !== 'live' ? (
                        <span className="text-[10px] font-sans font-bold uppercase tracking-wider" style={{ color: accentSoft }}>Geplant</span>
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
        <div className="order-2 lg:col-start-2 lg:row-start-1 lg:row-span-2 flex flex-col gap-[18px]">
          {/* Nächstes Spiel */}
          {nextMatch && (() => {
            const home = teams.find((t) => t.id === nextMatch.homeTeamId);
            const away = teams.find((t) => t.id === nextMatch.awayTeamId);
            if (!home || !away) return null;
            return (
              <div className="hl-card rounded-[20px] p-[22px]">
                <div className="font-sans font-extrabold text-[11px] tracking-[2px] mb-4" style={{ color: accentSoft }}>
                  {nextMatch.status === 'live' ? 'JETZT LIVE' : 'NÄCHSTES SPIEL'}
                </div>
                <div className="font-sans font-semibold text-[11px] tracking-wider text-hl-dim mb-3.5 uppercase">
                  {new Date(nextMatch.date).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: 'short' })} · {nextMatch.time} UHR
                </div>
                <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                  <div className="flex flex-col items-center gap-2">
                    <TeamCrest name={home.name} shortName={home.shortName} color={home.logoColor} logoUrl={home.logoUrl} size="lg" onSelect={() => onSelectTeam(home.id)} />
                    <button onClick={() => onSelectTeam(home.id)} className="font-sans font-semibold text-xs lg:text-sm text-hl-text text-center hover:text-brand-accent-light transition-colors cursor-pointer">{home.name}</button>
                  </div>
                  <span className="font-display font-black text-xl lg:text-2xl" style={{ color: accentSoft }}>
                    {nextMatch.status === 'live' ? `${nextMatch.homeScore ?? 0}:${nextMatch.awayScore ?? 0}` : 'VS'}
                  </span>
                  <div className="flex flex-col items-center gap-2">
                    <TeamCrest name={away.name} shortName={away.shortName} color={away.logoColor} logoUrl={away.logoUrl} size="lg" onSelect={() => onSelectTeam(away.id)} />
                    <button onClick={() => onSelectTeam(away.id)} className="font-sans font-semibold text-xs lg:text-sm text-hl-text text-center hover:text-brand-accent-light transition-colors cursor-pointer">{away.name}</button>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Beste Aufstellung – beste Spieler nach Siegquote (Torwart + 4 Feld + 2 Bank) */}
          {bestXI && (
            <BestLineup
              goalkeeper={bestXI.goalkeeper}
              field={bestXI.field}
              bench={bestXI.bench}
              team={team}
              onSelectPlayer={selectPlayer}
            />
          )}

          {/* Partner / Trikot-Sponsoren dieses Teams */}
          {sponsors.length > 0 && (
            <div className="hl-card rounded-[20px] p-[22px]">
              <div className="font-sans font-extrabold text-[11px] tracking-[2px] mb-4" style={{ color: accentSoft }}>
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
                  return (
                    <SponsorLink key={s.id} sponsorId={s.id} sponsorName={s.name} placement="team-sponsor" href={s.linkUrl} title={s.name} className={cls} style={style}>
                      {tile}
                    </SponsorLink>
                  );
                })}
              </div>
            </div>
          )}

          {/* Star des Teams */}
          {star && (
            <div className="hl-card rounded-[20px] p-[22px]">
              <div className="font-sans font-extrabold text-[11px] tracking-[2px] mb-1.5" style={{ color: accentSoft }}>STAR DES TEAMS</div>
              <button
                type="button"
                onClick={() => selectPlayer(star.name)}
                className="flex items-center gap-3.5 mt-3 w-full text-left cursor-pointer group transition-transform duration-150 will-change-transform hover:scale-[1.015] active:scale-[.99]"
                title={`${star.name} – Details anzeigen`}
              >
                {star.imageUrl ? (
                  <img
                    src={star.imageUrl}
                    alt={star.name}
                    loading="lazy"
                    decoding="async"
                    referrerPolicy="no-referrer"
                    className="w-[58px] h-[58px] rounded-[16px] object-cover border shrink-0"
                    style={{ borderColor: color }}
                  />
                ) : (
                  <span
                    className="grid place-items-center w-[58px] h-[58px] rounded-[16px] font-display font-black text-white shrink-0 text-xl shadow-[inset_0_0_0_1px_rgba(255,255,255,.18)]"
                    style={{ background: `linear-gradient(140deg, ${color}, ${shade(color, 0.45)})` }}
                  >
                    {monogram(star.name)}
                  </span>
                )}
                <div>
                  <div className="font-display font-black text-[22px] lg:text-[27px] uppercase text-white leading-[.95] group-hover:opacity-90">{star.name}</div>
                  <div className="font-sans font-semibold text-xs lg:text-[13px] text-hl-mute mt-1">{star.matchesPlayed} Einsätze</div>
                </div>
              </button>
              <div className="grid grid-cols-2 gap-2.5 mt-4">
                <div className="bg-white/[.03] border border-white/[.07] rounded-xl p-3 lg:p-4 text-center">
                  <div className="font-display font-black text-[26px] lg:text-[34px]" style={{ color: accentSoft }}>{star.goals}</div>
                  <div className="font-sans font-bold text-[9px] lg:text-[11px] tracking-[1.5px] text-hl-dim mt-[3px]">TORE</div>
                </div>
                <div className="bg-white/[.03] border border-white/[.07] rounded-xl p-3 lg:p-4 text-center">
                  <div className="font-display font-black text-[26px] lg:text-[34px] text-white">{star.assists}</div>
                  <div className="font-sans font-bold text-[9px] lg:text-[11px] tracking-[1.5px] text-hl-dim mt-[3px]">ASSISTS</div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
