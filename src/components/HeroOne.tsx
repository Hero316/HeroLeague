import React from 'react';
import { Star } from 'lucide-react';
import { PlayerStat, Team } from '../types';
import PlayerCrest from './PlayerCrest';
import { Reveal } from './anim';
import { numberWord } from '../lib/heroAward';

interface HeroOneProps {
  players: PlayerStat[];
  teams: Team[];
  seasonNumber?: number;
  seasonLabel?: string;
  onSelectTeam?: (teamId: string, playerName?: string) => void;
  onOpenWertungen?: () => void; // öffnet die getrackten Wertungen (Statistics Center)
}

// HERO ONE – die höchste Auszeichnung der Liga (früher „Ballon d'Or").
// Eigene Sektion mit Gold-Akzent. Wertung aus Toren, Vorlagen, „bester Spieler",
// Team-Ergebnis und Torwart-zu-null – berechnet in api/_lib/league.ts.
export default function HeroOne({ players, teams, seasonNumber, seasonLabel, onSelectTeam, onOpenWertungen }: HeroOneProps) {
  const ranking = React.useMemo(
    () =>
      [...players]
        .filter((p) => p.points > 0)
        .sort(
          (a, b) =>
            b.points - a.points ||
            b.goals - a.goals ||
            b.assists - a.assists ||
            a.name.localeCompare(b.name)
        ),
    [players]
  );

  const word = numberWord(seasonNumber ?? 1);
  const teamOf = (p: PlayerStat) => teams.find((t) => t.id === p.teamId);

  const breakdown = (p: PlayerStat) =>
    [
      p.goals > 0 ? `${p.goals} ⚽` : null,
      p.assists > 0 ? `${p.assists} 🅰️` : null,
      p.motmCount > 0 ? `${p.motmCount}× ⭐` : null,
      p.cleanSheets > 0 ? `${p.cleanSheets}× 🧤` : null,
    ].filter(Boolean);

  // Klick auf den Spielernamen öffnet direkt das Spieler-Detail.
  const goPlayer = (p: PlayerStat) => {
    const t = teamOf(p);
    if (t && onSelectTeam) onSelectTeam(t.id, p.name);
  };

  const leader = ranking[0] ?? null;
  const rest = ranking.slice(1, 10);

  return (
    <div className="max-w-[1320px] mx-auto px-4 sm:px-10 pb-16">
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
            Der wertvollste Spieler {seasonLabel ? `der ${seasonLabel}` : 'der Saison'} — ermittelt aus Toren, Vorlagen,
            Auszeichnungen als bester Spieler, Team-Erfolg und Spielen zu null.
          </p>
        </div>
      </div>

      {ranking.length === 0 ? (
        <div className="hl-card text-center py-14 text-hl-mute font-sans text-sm">
          Noch keine Wertung verfügbar. Sobald Ergebnisse erfasst sind, erscheint hier der HERO-{word}-Anwärter.
        </div>
      ) : (
        <>
          {/* Sieger-Spotlight (Platz 1) */}
          {leader && (
            <Reveal>
              <div className="relative overflow-hidden rounded-[26px] border border-[rgba(233,196,106,.35)] bg-[linear-gradient(180deg,rgba(233,196,106,.14),rgba(10,14,11,.35))] shadow-[0_28px_70px_rgba(0,0,0,.45)] p-6 sm:p-8">
                <div
                  className="absolute -top-24 -right-16 w-[360px] h-[360px] pointer-events-none"
                  style={{ background: 'radial-gradient(circle, rgba(233,196,106,.22), transparent 66%)' }}
                />
                <div className="relative flex flex-col sm:flex-row items-center gap-6 sm:gap-8">
                  <div className="relative shrink-0">
                    <span className="absolute -top-2 -left-2 z-10 grid place-items-center w-9 h-9 rounded-xl bg-hl-gold text-[#0b0f0b] font-display font-black text-lg shadow-[0_6px_18px_rgba(233,196,106,.5)]">
                      1
                    </span>
                    <PlayerCrest player={leader} teams={teams} photoSize="xl" crestSize="hero" onSelectTeam={onSelectTeam} />
                  </div>
                  <div className="flex-1 min-w-0 text-center sm:text-left">
                    <div className="font-sans font-extrabold text-[11px] tracking-[2px] text-hl-gold uppercase mb-1.5">
                      Aktueller Spitzenreiter
                    </div>
                    <button
                      onClick={() => goPlayer(leader)}
                      title={teamOf(leader) ? `${leader.name} – Spieler anzeigen` : undefined}
                      className={`block max-w-full font-display font-black text-4xl sm:text-6xl uppercase text-white leading-[.9] truncate text-center sm:text-left ${teamOf(leader) && onSelectTeam ? 'cursor-pointer hover:text-hl-gold transition-colors' : 'cursor-default'}`}
                    >
                      {leader.name}
                    </button>
                    {breakdown(leader).length > 0 && (
                      <div className="mt-3 font-sans text-[13px] text-hl-mute">{breakdown(leader).join('  ·  ')}</div>
                    )}
                  </div>
                  <div className="shrink-0 text-center">
                    <div className="font-display font-black text-6xl sm:text-7xl leading-none text-hl-gold drop-shadow-[0_0_18px_rgba(233,196,106,.4)] tabular-nums">
                      {leader.points.toFixed(1)}
                    </div>
                    <div className="font-sans font-bold text-[11px] tracking-[2px] text-hl-dim mt-1">PUNKTE</div>
                  </div>
                </div>
              </div>
            </Reveal>
          )}

          {/* Verfolger (Platz 2+) */}
          {rest.length > 0 && (
            <div className="hl-card mt-5 px-2 sm:px-4 pt-2 pb-3 hl-cascade-soft">
              {rest.map((p, i) => {
                const rank = i + 2;
                const bd = breakdown(p);
                const canClick = Boolean(teamOf(p) && onSelectTeam);
                return (
                  <div
                    key={p.id}
                    className="flex items-center gap-3 sm:gap-3.5 px-2 sm:px-4 py-3.5 border-b border-white/[.05] last:border-0"
                  >
                    <div className="w-7 sm:w-8 text-center font-display font-black text-xl sm:text-3xl text-hl-dim shrink-0">
                      {rank}
                    </div>
                    <div className="shrink-0">
                      <PlayerCrest player={p} teams={teams} photoSize="md" crestSize="lg" onSelectTeam={onSelectTeam} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <button
                        onClick={() => goPlayer(p)}
                        title={teamOf(p) ? `${p.name} – Spieler anzeigen` : undefined}
                        className={`block max-w-full text-left font-sans font-bold text-[15px] text-white truncate ${canClick ? 'cursor-pointer hover:text-hl-gold transition-colors' : 'cursor-default'}`}
                      >
                        {p.name}
                      </button>
                      {bd.length > 0 && (
                        <div className="font-sans text-[12px] text-hl-dim truncate mt-0.5">{bd.join(' · ')}</div>
                      )}
                    </div>
                    <div className="flex items-baseline gap-1 shrink-0 pl-2">
                      <span className="font-display font-black text-2xl sm:text-3xl leading-none text-hl-gold tabular-nums">
                        {p.points.toFixed(1)}
                      </span>
                      <span className="font-sans font-bold text-[10px] tracking-wider text-hl-dim">PKT</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
