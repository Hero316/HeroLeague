import React from 'react';
import { Star, Crown, ChevronDown } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import type { Match, MatchPlayerStat, ScoringConfig, Team } from '../types';
import { monogram } from './ui';
import { validCutout } from '../lib/playerPhoto';
import { numberWord } from '../lib/heroAward';
import TrackingProgressBanner from './TrackingProgressBanner';
import { useTrackingProgress } from '../lib/trackingProgress';
import { heroRanking, type HeroRanked } from '../lib/trackingAwards';

interface HeroOneProps {
  rows: MatchPlayerStat[]; // veröffentlichte getrackte Werte der gewählten Saison
  cfg: ScoringConfig;
  matches: Match[]; // für den Sieg-Bonus (Ergebnisse der Saison)
  teams: Team[];
  seasonNumber?: number;
  seasonLabel?: string;
  onSelectTeam?: (teamId: string, playerName?: string) => void;
  onOpenWertungen?: () => void; // öffnet die getrackten Wertungen (Statistics Center)
}

interface HeroEntry extends HeroRanked {
  id: string;
  name: string;
  imageUrl?: string;
  cutoutUrl?: string; // freigestellt (ohne Hintergrund)
  teamName: string;
  teamLogoColor: string;
}

// HERO ONE – die höchste Auszeichnung der Liga. Intern gewertet aus dem Tracking
// (heroRanking: Summe der Spiel-Scores + kleiner Sieg-Bonus). Öffentlich zeigt
// die Seite NUR die 10 Nominierten – alphabetisch, ohne Punkte und Platzierung.
export default function HeroOne({ rows, cfg, matches, teams, seasonNumber, seasonLabel, onSelectTeam, onOpenWertungen }: HeroOneProps) {
  // Die 10 Nominierten = die 10 Besten der internen Wertung. Angezeigt wird
  // BEWUSST alphabetisch und ohne Punkte/Platzierung – wer HERO ONE wird,
  // bleibt bis zur Verleihung geheim.
  const nominees = React.useMemo<HeroEntry[]>(() => {
    const leagueRows = rows.filter((r) => r.dayKey.startsWith('s:'));
    return heroRanking(leagueRows, cfg, matches)
      .filter((p) => p.score > 0)
      .slice(0, NOMINEES)
      .map((p) => {
        const team = teams.find((t) => t.id === p.teamId);
        return {
          ...p,
          id: `${p.teamId}::${p.playerName}`,
          name: p.playerName,
          imageUrl: team?.spielerliste?.find((s) => s.name === p.playerName)?.imageUrl,
          cutoutUrl: validCutout(team?.spielerliste?.find((s) => s.name === p.playerName)),
          teamName: team?.name ?? '',
          teamLogoColor: team?.logoColor || '#3B82F6',
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name, 'de'));
  }, [rows, cfg, matches, teams]);

  const word = numberWord(seasonNumber ?? 1);
  const progress = useTrackingProgress();
  const [openId, setOpenId] = React.useState<string | null>(null);
  const teamOf = (p: HeroEntry) => teams.find((t) => t.id === p.teamId);
  const goPlayer = (p: HeroEntry) => {
    const t = teamOf(p);
    if (t && onSelectTeam) onSelectTeam(t.id, p.name);
  };

  return (
    <div className="max-w-[1320px] xl:max-w-[1600px] 2xl:max-w-[1780px] mx-auto px-4 sm:px-10 pb-16">
      {onOpenWertungen && (
        <div className="flex justify-center pt-2">
          <button
            onClick={onOpenWertungen}
            className="inline-flex items-center gap-1.5 text-[11px] font-sans font-bold uppercase tracking-wider text-brand-accent-light hover:text-white border border-brand-accent/30 hover:border-brand-accent/60 rounded-full px-4 py-1.5 transition-colors cursor-pointer"
          >
            <Star className="w-3.5 h-3.5" /> Getrackte Noten &amp; Wertungen
          </button>
        </div>
      )}
      {/* Herausragender Titel: „HERO" kräftig, Zahlwort golden schimmernd */}
      <div className="relative pt-8 pb-7 sm:pt-12 sm:pb-9 text-center overflow-hidden">
        <div
          className="absolute inset-x-0 -top-10 h-[320px] pointer-events-none opacity-70"
          style={{ background: 'radial-gradient(60% 80% at 50% 0%, rgba(233,196,106,.18), transparent 70%)' }}
        />
        <div className="relative">
          <div className="font-sans font-extrabold text-[11px] sm:text-xs tracking-[3px] text-hl-gold/80 uppercase mb-3">
            Die höchste Auszeichnung der Hero League
          </div>
          <h1 className="font-display font-black leading-[.82] tracking-tight uppercase">
            <span className="text-white text-6xl sm:text-8xl drop-shadow-[0_4px_30px_rgba(0,0,0,.4)]">HERO </span>
            <span className="hl-gold-text text-6xl sm:text-8xl">{word}</span>
          </h1>
          <p className="mt-4 max-w-[620px] mx-auto font-sans text-sm sm:text-[15px] text-hl-mute leading-relaxed">
            Die {NOMINEES} Nominierten {seasonLabel ? `der ${seasonLabel}` : 'der Saison'} – ermittelt aus allem, was wir in
            jedem Spiel tracken.
          </p>
        </div>
      </div>

      {progress.map((d) => (
        <TrackingProgressBanner key={d.dayKey} day={d} className="mb-5 max-w-[760px] mx-auto" />
      ))}

      {nominees.length === 0 ? (
        <div className="hl-card text-center py-14 text-hl-mute font-sans text-sm">
          Noch keine Nominierten. Sobald getrackte Spiele live geschaltet sind, erscheinen hier die {NOMINEES} Nominierten.
        </div>
      ) : (
        <>
          <div className="flex items-center justify-center gap-2 mb-4">
            <Crown className="w-4 h-4 text-hl-gold" />
            <span className="font-sans font-extrabold text-[11px] tracking-[2.5px] uppercase text-hl-gold">
              Die Nominierten · alphabetisch
            </span>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-start hl-cascade-soft">
            {nominees.map((p) => (
              <NomineeCard
                key={p.id}
                p={p}
                team={teamOf(p)}
                teams={teams}
                open={openId === p.id}
                onToggle={() => setOpenId((cur) => (cur === p.id ? null : p.id))}
                onPlayer={onSelectTeam ? () => goPlayer(p) : undefined}
                onSelectTeam={onSelectTeam}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

const NOMINEES = 10;
const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)} %` : '–');

// Eine Nominierten-Karte: Foto/Wappen, Name, Verein, Kurzinfo – aufklappbar mit
// allen getrackten Werten (Quoten + Mengen). Keine Punkte, keine Note, kein Rang.
function NomineeCard({
  p,
  team,
  teams,
  open,
  onToggle,
  onPlayer,
  onSelectTeam,
}: {
  p: HeroEntry;
  team?: Team;
  teams: Team[];
  open: boolean;
  onToggle: () => void;
  onPlayer?: () => void;
  onSelectTeam?: (teamId: string, playerName?: string) => void;
}) {
  const reduce = useReducedMotion();
  const t = p.total;
  const goals = t.goal + t.penalty_goal;
  const keeper = p.role === 'keeper';
  const shots = t.goal + t.shot_on + t.shot_miss + t.shot_blocked_off;
  const stats: { label: string; value: string }[] = keeper
    ? [
        { label: 'Spiele im Tor', value: String(p.games) },
        { label: 'Paraden', value: String(t.save) },
        { label: 'Paradenquote', value: pct(t.save, t.save + t.gk_goal_against) },
        { label: 'Glanzparaden', value: String(t.save_top) },
        // „Zu null" nur zeigen, wenn es wirklich vorkam – 0× ist nichts zum Herzeigen.
        ...(p.cleanSheets > 0 ? [{ label: 'Zu null', value: String(p.cleanSheets) }] : []),
        { label: 'Gegentore', value: String(t.gk_goal_against) },
        { label: 'Gehaltene Elfm.', value: String(t.penalty_save) },
        { label: 'Passquote', value: pct(t.pass_ok, t.pass_ok + t.pass_fail) },
        { label: 'Tore', value: String(goals) },
        { label: 'Vorlagen', value: String(t.assist) },
      ]
    : [
        { label: 'Spiele', value: String(p.games) },
        { label: 'Tore', value: String(goals) },
        { label: 'Vorlagen', value: String(t.assist) },
        { label: 'Torschüsse', value: String(t.goal + t.shot_on) },
        { label: 'Schussquote', value: pct(t.goal + t.shot_on, shots) },
        { label: 'Passquote', value: pct(t.pass_ok, t.pass_ok + t.pass_fail) },
        { label: 'Schlüsselpässe', value: String(t.key_pass) },
        { label: 'Zweikampfquote', value: pct(t.duel_won, t.duel_won + t.duel_lost) },
        { label: 'Dribbling-Quote', value: pct(t.dribble_won, t.dribble_won + t.dribble_lost) },
        { label: 'Ballgewinne', value: String(t.interception + t.duel_won) },
      ];
  const short = keeper
    ? `${p.games} ${p.games === 1 ? 'Spiel' : 'Spiele'} · ${t.save} Paraden${p.cleanSheets > 0 ? ` · ${p.cleanSheets}× zu null` : ''}`
    : `${p.games} ${p.games === 1 ? 'Spiel' : 'Spiele'} · ${goals} ${goals === 1 ? 'Tor' : 'Tore'} · ${t.assist} ${t.assist === 1 ? 'Vorlage' : 'Vorlagen'}`;

  return (
    <div
      className={`rounded-2xl border overflow-hidden transition-colors duration-300 ${open ? 'border-[rgba(233,196,106,.45)] bg-[rgba(233,196,106,.06)]' : 'border-white/10 bg-white/[.03]'}`}
    >
      <button type="button" onClick={onToggle} aria-expanded={open} className="w-full flex items-center gap-3 sm:gap-4 px-3 sm:px-4 py-3 text-left cursor-pointer min-w-0">
        {/* Immer gleich breit. Freigestellt: Spieler steht ohne Rahmen unten auf
            der Kartenkante. Sonst Foto bzw. Vereinslogo – ohne goldenen Kasten. */}
        {p.cutoutUrl ? (
          // Schnittkante bündig an der linken Kartenkante; so breit wie das Bild,
          // damit der Text direkt daneben nachrückt.
          <span className="shrink-0 h-[116px] -ml-3 sm:-ml-4 -mb-3 -mt-1 flex items-end" title={p.name}>
            <img src={p.cutoutUrl} alt={p.name} className="h-full w-auto max-w-[150px] object-contain object-left-bottom drop-shadow-[0_8px_18px_rgba(0,0,0,.5)]" loading="lazy" />
          </span>
        ) : (
          <span className="shrink-0 w-[104px] h-[104px] rounded-[26px] grid place-items-center overflow-hidden" title={p.name}>
            {p.imageUrl ? (
              <img src={p.imageUrl} alt={p.name} className="w-full h-full object-cover" loading="lazy" />
            ) : team?.logoUrl ? (
              <img src={team.logoUrl} alt={team.name} className="w-[86%] h-[86%] object-contain" loading="lazy" />
            ) : (
              <span className="font-display font-black text-4xl text-hl-gold">{monogram(p.name)}</span>
            )}
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block font-display font-black uppercase tracking-tight text-white text-xl sm:text-2xl leading-tight truncate">{p.name}</span>
          <span className="block text-[12px] text-hl-mute truncate">
            {team?.name ?? p.teamName}
            {keeper ? ' · Torwart' : ''}
          </span>
          <span className="block text-[11.5px] text-hl-dim truncate mt-0.5">{short}</span>
        </span>
        <ChevronDown className={`w-5 h-5 shrink-0 text-hl-gold transition-transform duration-300 ${open ? 'rotate-180' : ''}`} />
      </button>
      {/* Weich aufklappen: Höhe fährt sanft auf, die Werte poppen nacheinander rein. */}
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="stats"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: reduce ? 0 : 0.38, ease: [0.22, 1, 0.36, 1] }}
            style={{ overflow: 'hidden' }}
          >
            <div className="px-3 sm:px-4 pb-4">
              <motion.div
                className="grid grid-cols-2 sm:grid-cols-5 gap-2"
                initial="hidden"
                animate="show"
                variants={{ show: { transition: { staggerChildren: reduce ? 0 : 0.035, delayChildren: reduce ? 0 : 0.08 } } }}
              >
                {stats.map((s) => (
                  <motion.div
                    key={s.label}
                    variants={{
                      hidden: { opacity: 0, y: 10, scale: 0.96 },
                      show: { opacity: 1, y: 0, scale: 1, transition: { type: 'spring', stiffness: 420, damping: 30 } },
                    }}
                    className="rounded-xl bg-white/[.04] border border-white/[.06] px-2.5 py-2 text-center min-w-0"
                  >
                    <div className="font-display font-black text-white text-lg leading-none tabular-nums">{s.value}</div>
                    <div className="text-[9.5px] font-bold uppercase tracking-wider text-hl-dim mt-1 truncate">{s.label}</div>
                  </motion.div>
                ))}
              </motion.div>
              {onPlayer && (
                <motion.button
                  type="button"
                  onClick={onPlayer}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1, transition: { delay: reduce ? 0 : 0.08 + stats.length * 0.035 } }}
                  className="mt-3 text-[12px] font-bold text-hl-gold hover:text-white cursor-pointer"
                >
                  Zum Spielerprofil →
                </motion.button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
