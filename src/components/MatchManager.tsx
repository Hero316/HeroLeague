import React, { useMemo, useState } from 'react';
import { Plus, Trash2, CalendarDays } from 'lucide-react';
import { Match, Team } from '../types';

interface MatchManagerProps {
  teams: Team[];
  matches: Match[]; // Spiele der aktiven Saison
  onAddMatch: (data: {
    matchday: number;
    homeTeamId: string;
    awayTeamId: string;
    date: string;
    time: string;
  }) => Promise<boolean>;
  onDeleteMatch: (matchId: string) => Promise<boolean>;
}

export default function MatchManager({ teams, matches, onAddMatch, onDeleteMatch }: MatchManagerProps) {
  const maxMatchday = matches.reduce((max, m) => Math.max(max, m.matchday), 0);

  const [matchday, setMatchday] = useState<string>(String(maxMatchday || 1));
  const [homeTeamId, setHomeTeamId] = useState('');
  const [awayTeamId, setAwayTeamId] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('15:30');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const matchesByMatchday = useMemo(() => {
    const grouped = new Map<number, Match[]>();
    [...matches]
      .sort((a, b) => a.matchday - b.matchday || a.date.localeCompare(b.date) || a.time.localeCompare(b.time))
      .forEach((m) => {
        const list = grouped.get(m.matchday) ?? [];
        list.push(m);
        grouped.set(m.matchday, list);
      });
    return grouped;
  }, [matches]);

  const teamName = (id: string) => teams.find((t) => t.id === id)?.name ?? id;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const day = parseInt(matchday, 10);
    if (!day || day < 1) {
      alert('Bitte einen gültigen Spieltag angeben.');
      return;
    }
    if (!homeTeamId || !awayTeamId) {
      alert('Bitte Heim- und Auswärtsteam wählen.');
      return;
    }
    if (homeTeamId === awayTeamId) {
      alert('Ein Team kann nicht gegen sich selbst spielen.');
      return;
    }
    if (!date) {
      alert('Bitte ein Datum wählen.');
      return;
    }

    setIsSubmitting(true);
    const ok = await onAddMatch({ matchday: day, homeTeamId, awayTeamId, date, time });
    setIsSubmitting(false);
    if (ok) {
      setHomeTeamId('');
      setAwayTeamId('');
    }
  };

  const handleDelete = (match: Match) => {
    const label = `${teamName(match.homeTeamId)} – ${teamName(match.awayTeamId)} (${match.matchday}. Spieltag)`;
    if (confirm(`Spiel wirklich löschen?\n\n${label}\n\nEin bereits eingetragenes Ergebnis geht dabei verloren.`)) {
      onDeleteMatch(match.id);
    }
  };

  const selectClass =
    'w-full bg-[#060E0F] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-brand-accent-light cursor-pointer';
  const inputClass =
    'w-full bg-[#060E0F] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-brand-accent-light [color-scheme:dark]';

  return (
    <div className="space-y-8">
      {/* Neues Spiel ansetzen */}
      <form
        onSubmit={handleSubmit}
        className="grid grid-cols-2 md:grid-cols-6 gap-3 items-end bg-[#060E0F]/40 border border-white/5 rounded-xl p-4"
      >
        <div>
          <label className="block text-xs font-mono text-gray-400 mb-1.5 uppercase tracking-wider">Spieltag</label>
          <input
            type="number"
            min={1}
            max={99}
            value={matchday}
            onChange={(e) => setMatchday(e.target.value)}
            className={inputClass}
          />
        </div>
        <div className="col-span-2 md:col-span-1">
          <label className="block text-xs font-mono text-gray-400 mb-1.5 uppercase tracking-wider">Heim</label>
          <select value={homeTeamId} onChange={(e) => setHomeTeamId(e.target.value)} className={selectClass}>
            <option value="">-- Team --</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id} disabled={t.id === awayTeamId}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
        <div className="col-span-2 md:col-span-1">
          <label className="block text-xs font-mono text-gray-400 mb-1.5 uppercase tracking-wider">Auswärts</label>
          <select value={awayTeamId} onChange={(e) => setAwayTeamId(e.target.value)} className={selectClass}>
            <option value="">-- Team --</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id} disabled={t.id === homeTeamId}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-mono text-gray-400 mb-1.5 uppercase tracking-wider">Datum</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className="block text-xs font-mono text-gray-400 mb-1.5 uppercase tracking-wider">Uhrzeit</label>
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={inputClass} />
        </div>
        <button
          type="submit"
          disabled={isSubmitting}
          className="col-span-2 md:col-span-1 px-4 py-2.5 bg-brand-accent-light hover:bg-brand-accent disabled:opacity-50 rounded-xl text-xs font-bold uppercase tracking-wider transition-all text-white flex items-center justify-center gap-1.5 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Ansetzen</span>
        </button>
      </form>

      {/* Bestehende Spiele je Spieltag */}
      {matchesByMatchday.size === 0 ? (
        <p className="text-sm text-gray-400 font-sans text-center py-6">
          Noch keine Spiele in dieser Saison. Setze oben das erste Spiel an.
        </p>
      ) : (
        <div className="space-y-6">
          {[...matchesByMatchday.entries()].map(([day, dayMatches]) => (
            <div key={day}>
              <h4 className="flex items-center gap-2 text-xs font-mono font-bold text-gray-300 uppercase tracking-wider mb-2">
                <CalendarDays className="w-4 h-4 text-brand-accent-light" />
                {day}. Spieltag
              </h4>
              <div className="space-y-1.5">
                {dayMatches.map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center justify-between gap-3 bg-[#060E0F]/40 border border-white/5 rounded-lg px-3 py-2 text-sm"
                  >
                    <div className="min-w-0 flex-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className="font-medium text-white truncate">
                        {teamName(m.homeTeamId)} <span className="text-gray-500">vs.</span> {teamName(m.awayTeamId)}
                      </span>
                      <span className="text-[11px] font-mono text-gray-500">
                        {new Date(m.date).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })}{' '}
                        • {m.time} Uhr
                      </span>
                      {m.status === 'beendet' && (
                        <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded uppercase">
                          {m.homeScore}:{m.awayScore}
                        </span>
                      )}
                      {m.status === 'live' && (
                        <span className="text-[10px] font-mono text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded uppercase animate-pulse">
                          LIVE
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDelete(m)}
                      title="Spiel löschen"
                      className="shrink-0 p-1.5 text-gray-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-md transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
