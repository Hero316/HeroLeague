import React from 'react';
import { Star, Crown, ChevronDown } from 'lucide-react';
import type { Match, MatchPlayerStat, ScoringConfig, Team } from '../types';
import PlayerCrest from './PlayerCrest';
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
            jedem Spiel tracken. Wer am Ende HERO {word} wird, bleibt bis zur Verleihung geheim.
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
        { label: 'Zu null', value: String(p.cleanSheets) },
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
    ? `${p.games} ${p.games === 1 ? 'Spiel' : 'Spiele'} · ${t.save} Paraden · ${p.cleanSheets}× zu null`
    : `${p.games} ${p.games === 1 ? 'Spiel' : 'Spiele'} · ${goals} ${goals === 1 ? 'Tor' : 'Tore'} · ${t.assist} ${t.assist === 1 ? 'Vorlage' : 'Vorlagen'}`;

  return (
    <div
      className={`rounded-2xl border transition-colors ${open ? 'border-[rgba(233,196,106,.45)] bg-[rgba(233,196,106,.06)]' : 'border-white/10 bg-white/[.03]'}`}
    >
      <button type="button" onClick={onToggle} aria-expanded={open} className="w-full flex items-center gap-3 sm:gap-4 px-3 sm:px-4 py-3 text-left cursor-pointer min-w-0">
        <span className="shrink-0">
          <PlayerCrest player={p} teams={teams} photoSize="md" crestSize="lg" onSelectTeam={onSelectTeam} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-display font-black uppercase tracking-tight text-white text-lg sm:text-xl leading-tight truncate">{p.name}</span>
          <span className="block text-[12px] text-hl-mute truncate">
            {team?.name ?? p.teamName}
            {keeper ? ' · Torwart' : ''}
          </span>
          <span className="block text-[11.5px] text-hl-dim truncate mt-0.5">{short}</span>
        </span>
        <ChevronDown className={`w-5 h-5 shrink-0 text-hl-gold transition-transform duration-300 ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="px-3 sm:px-4 pb-4">
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            {stats.map((s) => (
              <div key={s.label} className="rounded-xl bg-white/[.04] border border-white/[.06] px-2.5 py-2 text-center min-w-0">
                <div className="font-display font-black text-white text-lg leading-none tabular-nums">{s.value}</div>
                <div className="text-[9.5px] font-bold uppercase tracking-wider text-hl-dim mt-1 truncate">{s.label}</div>
              </div>
            ))}
          </div>
          {onPlayer && (
            <button type="button" onClick={onPlayer} className="mt-3 text-[12px] font-bold text-hl-gold hover:text-white cursor-pointer">
              Zum Spielerprofil →
            </button>
          )}
        </div>
      )}
    </div>
  );
}
