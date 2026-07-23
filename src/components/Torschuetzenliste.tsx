import React from 'react';
import { motion } from 'motion/react';
import { PlayerStat, Team } from '../types';
import PlayerAvatar from './PlayerAvatar';
import { TeamCrest } from './ui';
import { CountUp, Reveal, useSettledList } from './anim';

interface TorschuetzenlisteProps {
  players: PlayerStat[];
  teams: Team[];
  onSelectTeam?: (teamId: string) => void;
}

// Torjägerliste: Podium für die Top 3, darunter die restliche Rangliste.
export default function Torschuetzenliste({ players, teams, onSelectTeam }: TorschuetzenlisteProps) {
  const scorers = React.useMemo(
    () => [...players].filter((p) => p.goals > 0).sort((a, b) => b.goals - a.goals || b.assists - a.assists),
    [players]
  );

  // Rangliste ab Platz 4 – mit Einsortier-Animation (Hooks vor moeglichem Early-Return).
  const rest = React.useMemo(() => scorers.slice(3, 15), [scorers]);
  const restList = useSettledList(rest, (p) => p.name);

  const teamOf = (p: PlayerStat) => teams.find((t) => t.id === p.teamId);

  const rankColors: Record<number, string> = { 1: '#E9C46A', 2: '#C9D1CC', 3: '#C98A5A' };

  if (scorers.length === 0) {
    return (
      <div className="max-w-[1320px] mx-auto px-4 sm:px-10 pb-10">
        <div className="hl-card text-center py-12 text-hl-mute font-sans text-sm">
          Noch keine Tore eingetragen. Sobald Ergebnisse mit Torschützen erfasst sind, erscheint hier die Rangliste.
        </div>
      </div>
    );
  }

  const podium = scorers.slice(0, 3);

  // Nur das Vereinswappen (klickbar → Vereinsseite).
  const teamCrestButton = (p: PlayerStat) => {
    const team = teamOf(p);
    if (!team) {
      return (
        <span className="w-8 h-8 grid place-items-center shrink-0">
          <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: p.teamLogoColor }} />
        </span>
      );
    }
    return (
      <TeamCrest
        name={team.name}
        shortName={team.shortName}
        color={team.logoColor}
        logoUrl={team.logoUrl}
        size="md"
        onSelect={onSelectTeam ? () => onSelectTeam(team.id) : undefined}
      />
    );
  };

  // Ein Bild pro Spieler: Spielerfoto, falls vorhanden – sonst das Vereinswappen.
  const playerOrTeamAvatar = (p: PlayerStat) =>
    p.imageUrl ? (
      <PlayerAvatar name={p.name} imageUrl={p.imageUrl} color={p.teamLogoColor} size="sm" />
    ) : (
      teamCrestButton(p)
    );

  const clubChip = (p: PlayerStat) => {
    const team = teamOf(p);
    return (
      <button
        onClick={team && onSelectTeam ? () => onSelectTeam(team.id) : undefined}
        className={`flex items-center gap-2 min-w-0 ${team && onSelectTeam ? 'cursor-pointer hover:opacity-80' : 'cursor-default'}`}
        title={team && onSelectTeam ? `${p.teamName} – Vereinsseite öffnen` : undefined}
      >
        {team ? (
          <TeamCrest name={team.name} shortName={team.shortName} color={team.logoColor} logoUrl={team.logoUrl} size="xs" />
        ) : (
          <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ backgroundColor: p.teamLogoColor }} />
        )}
        <span className="font-sans text-xs text-hl-mute truncate">{p.teamName}</span>
      </button>
    );
  };

  return (
    <div className="max-w-[1320px] mx-auto px-4 sm:px-10 pb-10">
      {/* Podium (Top 3) */}
      <Reveal className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end pt-3.5 pb-2">
        {podium.map((p, i) => {
          const rank = i + 1;
          const lead = rank === 1;
          return (
            <div
              key={p.id}
              className={`relative flex flex-col items-center rounded-[20px] ${
                lead
                  ? 'px-5 pt-[30px] pb-[26px] bg-[linear-gradient(180deg,rgba(34,223,201,.14),rgba(10,14,11,.4))] border border-[rgba(34,223,201,.3)] shadow-[0_24px_60px_rgba(0,0,0,.4)] sm:-translate-y-3.5 order-first sm:order-none'
                  : 'px-5 pt-[26px] pb-[22px] bg-[linear-gradient(180deg,rgba(255,255,255,.05),rgba(255,255,255,.012))] border border-white/10 backdrop-blur-md'
              }`}
            >
              <span
                className="absolute top-3.5 left-3.5 grid place-items-center w-7 h-7 rounded-lg font-display font-black text-[15px] text-[#0b0f0b]"
                style={{ background: rankColors[rank] }}
              >
                {rank}
              </span>
              <PlayerAvatar name={p.name} imageUrl={p.imageUrl} color={p.teamLogoColor} size={lead ? 'lg' : 'md'} />
              <div className="font-display font-black text-2xl leading-tight uppercase text-white mt-3.5 text-center">{p.name}</div>
              <div className="mt-2">{clubChip(p)}</div>
              <div className="flex items-baseline gap-1.5 mt-3.5">
                <span
                  className={`font-display font-black leading-[.9] ${lead ? 'text-[54px] text-brand-accent-light' : 'text-[44px] text-white'}`}
                >
                  <CountUp value={p.goals} />
                </span>
                <span className="font-sans font-bold text-xs tracking-wider text-hl-dim">TORE</span>
              </div>
              <div className="font-sans font-semibold text-[11.5px] text-hl-dim mt-1">
                {p.assists} Assists · {p.matchesPlayed} Spiele
              </div>
            </div>
          );
        })}
      </Reveal>

      {/* Liste ab Platz 4 – bewusst reduziert: Rang · ein Bild (Spielerfoto falls vorhanden,
          sonst Vereinslogo) · Name mit gespielten Spielen · Tore groß · Assists. */}
      {rest.length > 0 && (
        <div ref={restList.ref} className="hl-card px-2 sm:px-3 pt-2.5 pb-3 mt-5">
          <div className="flex items-center gap-3 px-2 sm:px-3 pt-3.5 pb-3 border-b border-white/[.08] font-sans font-bold text-[10.5px] tracking-wider text-hl-faint">
            <span className="w-6 text-center shrink-0">#</span>
            <span className="flex-1">SPIELER</span>
            <span className="w-9 text-center shrink-0">TORE</span>
            <span className="w-8 text-center shrink-0">AST</span>
          </div>
          {restList.items.map((p, i) => (
            <motion.div
              layout="position"
              transition={{ type: 'spring', stiffness: 240, damping: 32 }}
              key={p.id}
              className="flex items-center gap-3 px-2 sm:px-3 py-2.5 rounded-[13px] border-b border-white/[.04] transition-colors hover:bg-white/5"
            >
              {/* Rang (schlicht) */}
              <span className="w-6 text-center font-display font-black text-lg text-hl-dim shrink-0">{i + 4}</span>
              {/* Ein Bild: Spielerfoto falls vorhanden, sonst Vereinslogo */}
              {playerOrTeamAvatar(p)}
              {/* Name + gespielte Spiele */}
              <div className="min-w-0 flex-1">
                <div className="font-sans font-semibold text-[15px] text-hl-text truncate">{p.name}</div>
                <div className="font-sans text-[11.5px] text-hl-mute">{p.matchesPlayed} Spiele</div>
              </div>
              {/* Tore (groß) */}
              <span className="w-9 text-center font-display font-black text-[22px] sm:text-2xl leading-none text-brand-accent-light shrink-0">
                <CountUp value={p.goals} />
              </span>
              {/* Assists */}
              <span className="w-8 text-center font-sans font-bold text-[15px] text-hl-soft shrink-0">{p.assists}</span>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
