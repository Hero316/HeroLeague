import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ChevronDown } from 'lucide-react';
import { motion } from 'motion/react';
import { Match, Player, PlayerStat, Team, TeamSponsorsMap } from '../types';
import { calculateStandings } from '../lib/standings';
import { apiFetch } from '../lib/api';
import PlayerAvatar from './PlayerAvatar';
import BestLineup from './BestLineup';
import { TeamCrest, FormPill, MatchStatusBadge, shortDate, shade, monogram, ImageZoom } from './ui';

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

  // Ausgewählter Spieler für die animierte Detail-Umblendung im Kopf.
  const [selectedPlayerName, setSelectedPlayerName] = useState<string | null>(initialPlayer ?? null);
  const selected = useMemo(
    () => roster.find((p) => p.name === selectedPlayerName) ?? null,
    [roster, selectedPlayerName]
  );
  // Beim Teamwechsel bzw. neuer Vorauswahl (Suche) das Detail passend setzen.
  useEffect(() => setSelectedPlayerName(initialPlayer ?? null), [team.id, initialPlayer]);
  const selectPlayer = useCallback((name: string) => {
    setSelectedPlayerName(name);
    // Zum Kopf scrollen, damit die Umblendung sichtbar ist.
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);
  const positionLabel = (p: RosterEntry) =>
    p.gamesInGoal > 0 && p.gamesInGoal * 2 >= p.matchesPlayed ? 'Torwart' : 'Feldspieler';

  // Spieler-Panel bleibt IMMER gemountet (auch verdeckt), damit der Kopf konstant
  // hoch bleibt und beim Umschalten nichts springt. Ohne Auswahl dient der erste
  // Kaderspieler nur zum Reservieren der Höhe (unsichtbar).
  const sizingPlayer = selected ?? roster[0] ?? null;

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

  // Eine Statistik-Kachel für die Spieler-Detailansicht.
  // Mobil teilen sich die Kacheln die Breite (eine Reihe, kein Umbruch), ab sm
  // wieder natürliche Breite.
  const StatTile = ({ value, label, accent }: { value: React.ReactNode; label: string; accent?: boolean }) => (
    <div className="flex-1 min-w-0 sm:flex-none sm:min-w-[70px] bg-white/[.04] border border-white/[.08] rounded-xl px-1.5 sm:px-3 py-2.5 text-center">
      <div className="font-display font-black text-[19px] sm:text-[26px] leading-none" style={accent ? { color: accentSoft } : { color: '#fff' }}>
        {value}
      </div>
      <div className="font-sans font-bold text-[8px] sm:text-[9px] tracking-[1px] sm:tracking-[1.5px] text-hl-dim mt-1.5">{label}</div>
    </div>
  );

  return (
    <div className="max-w-[1320px] mx-auto px-4 sm:px-10 pb-11">
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
              className={`[grid-area:1/1] self-center relative flex flex-col sm:flex-row items-start sm:items-center gap-6 flex-wrap py-6 ${selected ? '' : 'pointer-events-none'}`}
            >
              {/* Spielerbild */}
              <div className="relative shrink-0">
                <div
                  className="absolute -inset-3 rounded-[34px] blur-xl opacity-50"
                  style={{ background: `radial-gradient(circle, ${color}, transparent 70%)` }}
                />
                {sizingPlayer.imageUrl ? (
                  <ImageZoom
                    src={sizingPlayer.imageUrl}
                    alt={sizingPlayer.name}
                    className="relative w-[118px] h-[118px] object-cover rounded-[32px] border-2"
                    style={{ borderColor: color }}
                    zoomClassName="w-72 sm:w-96 max-w-[85vw] max-h-[80vh] object-contain"
                  />
                ) : (
                  <span
                    className="relative grid place-items-center w-[118px] h-[118px] rounded-[32px] font-display font-black text-5xl text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,.18)]"
                    style={{ background: `linear-gradient(140deg, ${color}, ${shade(color, 0.45)})` }}
                  >
                    {monogram(sizingPlayer.name)}
                  </span>
                )}
              </div>

              <div className="flex-1 w-full sm:w-auto min-w-0 sm:min-w-[260px]">
                <button
                  onClick={() => setSelectedPlayerName(null)}
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
              </div>
              {standing && (
                <div className="flex gap-5 flex-none">
                  <div className="text-center">
                    <div className="font-display font-black text-[44px] leading-[.9]" style={{ color: accentSoft }}>{standing.points}</div>
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

              {/* Captain (Desktop) – groß rechts neben dem Team, ohne Hintergrund.
                  Auf dem Handy versteckt (dort steht er klein oben rechts neben dem Logo). */}
              {captain && (
                <button
                  type="button"
                  onClick={() => selectPlayer(captain.name)}
                  className="flex-none hidden sm:flex flex-col items-center gap-1.5 pl-2 group cursor-pointer"
                  title={`${captain.name} – Kapitän`}
                >
                  {captain.imageUrl ? (
                    <img
                      src={captain.imageUrl}
                      alt={captain.name}
                      loading="lazy"
                      decoding="async"
                      referrerPolicy="no-referrer"
                      className="w-[110px] h-[130px] object-contain object-bottom drop-shadow-[0_10px_24px_rgba(0,0,0,.55)] transition-transform duration-200 group-hover:scale-[1.04]"
                    />
                  ) : (
                    <PlayerAvatar name={captain.name} color={color} size="xl" />
                  )}
                  <span
                    className="font-sans font-extrabold text-[9px] tracking-[2px] uppercase px-2 py-0.5 rounded-full"
                    style={{ color: '#0b0f10', background: accentSoft }}
                  >
                    Kapitän
                  </span>
                </button>
              )}
            </motion.div>
      </div>

      {/* Body: Kader · Sidebar · Spiele. Auf dem Handy per order: Kader → Sidebar → Spiele
          (die lange Spiele-Liste ganz nach unten). Auf Desktop: links Kader + Spiele, rechts Sidebar. */}
      <div className="mt-6 flex flex-col gap-6 lg:grid lg:grid-cols-[1.55fr_1fr] lg:gap-6 lg:items-start">
        {/* Kader */}
        <div className="order-1 lg:col-start-1 lg:row-start-1">
          <div className="font-display font-black text-2xl uppercase text-white mb-4">Kader</div>
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
                        className="w-11 h-11 rounded-[13px] object-cover border shrink-0"
                        style={{ borderColor: color }}
                      />
                    ) : (
                      <span
                        className="grid place-items-center w-11 h-11 rounded-[13px] font-display font-black text-white shrink-0 text-base shadow-[inset_0_0_0_1px_rgba(255,255,255,.18)]"
                        style={{ background: `linear-gradient(140deg, ${color}, ${shade(color, 0.45)})` }}
                      >
                        {monogram(player.name)}
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="font-sans font-semibold text-sm text-hl-text truncate">{player.name}</span>
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
                      <div className="font-sans text-[11px] text-hl-dim">
                        {player.matchesPlayed} Sp. · {player.assists} Assists
                        {player.winRate !== null ? ` · ${player.winRate}% Siege` : ''}
                      </div>
                    </div>
                    {player.goals > 0 && (
                      <span
                        className="flex-none font-sans font-extrabold text-[11px] px-2 py-[3px] rounded-md"
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
            <span className="font-display font-black text-2xl uppercase text-white">Spiele</span>
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
                        <span className="font-display font-black text-white text-base px-2.5 py-1 rounded-lg bg-white/[.04] border border-white/10">
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
                    <span className="font-sans font-semibold text-xs text-hl-text text-center">{home.name}</span>
                  </div>
                  <span className="font-display font-black text-xl" style={{ color: accentSoft }}>
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
                  <div className="font-display font-black text-[22px] uppercase text-white leading-[.95] group-hover:opacity-90">{star.name}</div>
                  <div className="font-sans font-semibold text-xs text-hl-mute mt-1">{star.matchesPlayed} Einsätze</div>
                </div>
              </button>
              <div className="grid grid-cols-2 gap-2.5 mt-4">
                <div className="bg-white/[.03] border border-white/[.07] rounded-xl p-3 text-center">
                  <div className="font-display font-black text-[26px]" style={{ color: accentSoft }}>{star.goals}</div>
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
