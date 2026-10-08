import { useMemo, useState } from 'react';
import { Crown, EyeOff, Search } from 'lucide-react';
import type { Match, MatchPlayerStat, ScoringConfig, Team } from '../types';
import { heroRanking, HERO_DRAW_BONUS, HERO_WIN_BONUS } from '../lib/trackingAwards';

// HERO ONE – interne Rangliste NUR fürs Backend (Bereich „Auszeichnungen").
// Öffentlich gibt es bewusst nur die 10 Nominierten ohne Punkte/Platz; hier
// sieht die Liga-Leitung, wer aktuell vorne liegt und warum.
const NOMINEES = 10;
const fmt = (n: number) => n.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export default function HeroOneAdmin({
  rows,
  cfg,
  matches,
  teams,
  seasonLabel,
}: {
  rows: MatchPlayerStat[];
  cfg: ScoringConfig;
  matches: Match[];
  teams: Team[];
  seasonLabel?: string;
}) {
  const [showAll, setShowAll] = useState(false);
  const [q, setQ] = useState('');
  const ranking = useMemo(() => heroRanking(rows, cfg, matches), [rows, cfg, matches]);
  const teamById = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams]);
  const days = useMemo(() => new Set(rows.map((r) => r.matchId)).size, [rows]);

  const needle = q.trim().toLowerCase();
  const filtered = needle
    ? ranking
        .map((p, i) => ({ p, place: i + 1 }))
        .filter(({ p }) => `${p.playerName} ${teamById.get(p.teamId)?.name ?? ''}`.toLowerCase().includes(needle))
    : ranking.map((p, i) => ({ p, place: i + 1 }));
  const shown = needle || showAll ? filtered : filtered.slice(0, NOMINEES);

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2.5 rounded-xl border border-[rgba(233,196,106,.35)] bg-[rgba(233,196,106,.07)] px-3.5 py-2.5">
        <EyeOff className="w-4 h-4 text-[#E9C46A] shrink-0 mt-0.5" />
        <p className="text-[12px] text-hl-soft font-sans leading-snug">
          <strong className="text-white">Intern – bitte nicht weitergeben.</strong> Auf der Website stehen nur die{' '}
          {NOMINEES} Nominierten (alphabetisch, ohne Punkte). Basis: alle veröffentlichten Spiele
          {seasonLabel ? ` der ${seasonLabel}` : ''} ({days} getrackte Spiele). Punkte = Tracking-Score + Sieg-Bonus (Sieg +
          {fmt(HERO_WIN_BONUS)}, Remis +{fmt(HERO_DRAW_BONUS)}).
        </p>
      </div>

      {ranking.length === 0 ? (
        <div className="rounded-xl border border-white/[.07] bg-white/[.02] p-6 text-center text-sm text-hl-mute font-sans">
          Noch keine veröffentlichten Tracking-Daten – die Rangliste erscheint, sobald ein Spieltag live geschaltet ist.
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2 rounded-xl border border-white/12 bg-white/[.04] px-3 focus-within:border-brand-accent-light/50">
            <Search className="w-4 h-4 text-hl-mute shrink-0" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Spieler oder Team suchen …"
              className="flex-1 min-w-0 bg-transparent h-10 text-sm text-white placeholder:text-hl-faint focus:outline-none font-sans"
            />
          </div>

          <div className="grid grid-cols-1 gap-1.5">
            {shown.map(({ p, place }) => {
              const team = teamById.get(p.teamId);
              const nominee = place <= NOMINEES;
              return (
                <div
                  key={`${p.teamId}::${p.playerName}`}
                  className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 ${
                    place === 1
                      ? 'border-[rgba(233,196,106,.55)] bg-[rgba(233,196,106,.1)]'
                      : nominee
                        ? 'border-white/[.1] bg-white/[.03]'
                        : 'border-white/[.05] bg-transparent'
                  }`}
                >
                  <div
                    className={`w-8 h-8 rounded-lg grid place-items-center shrink-0 font-display font-black tabular-nums text-sm ${
                      place === 1 ? 'bg-[#E9C46A] text-[#1a1406]' : nominee ? 'bg-white/10 text-white' : 'bg-white/[.04] text-hl-mute'
                    }`}
                  >
                    {place === 1 ? <Crown className="w-4 h-4" /> : place}
                  </div>
                  {team?.logoUrl ? (
                    <img src={team.logoUrl} alt="" className="w-6 h-6 object-contain shrink-0" />
                  ) : (
                    <span className="w-6 h-6 shrink-0 grid place-items-center text-sm">{team?.logoIcon ?? '⚽'}</span>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="font-sans font-bold text-[14px] text-white truncate">{p.playerName}</span>
                      {p.role === 'keeper' && (
                        <span className="shrink-0 text-[9px] font-bold uppercase tracking-wider text-sky-300 bg-sky-400/10 rounded px-1 py-0.5">TW</span>
                      )}
                    </div>
                    <div className="text-[11px] text-hl-mute font-sans truncate">
                      {team?.name ?? 'Team'} · {p.games} Sp. · Tracking {fmt(p.trackScore)} · Bonus +{fmt(p.winBonus)} ({p.wins}S/
                      {p.draws}U) · Ø {fmt(p.avgNote)}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-display font-black tabular-nums text-lg text-white leading-none">{fmt(p.score)}</div>
                    <div className="text-[9.5px] font-mono uppercase tracking-wider text-hl-faint mt-1">Punkte</div>
                  </div>
                </div>
              );
            })}
          </div>

          {!needle && ranking.length > NOMINEES && (
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              className="w-full py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider border border-white/10 bg-white/5 text-hl-soft hover:text-white cursor-pointer"
            >
              {showAll ? `Nur Top ${NOMINEES} (Nominierte) zeigen` : `Alle ${ranking.length} Spieler zeigen`}
            </button>
          )}
        </>
      )}
    </div>
  );
}
