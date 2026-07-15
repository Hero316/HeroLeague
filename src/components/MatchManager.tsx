import React, { useMemo, useState } from 'react';
import { Plus, Trash2, CalendarDays, ChevronDown } from 'lucide-react';
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
    venue: string;
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
  // null = noch nicht angefasst → dann wird der zuletzt genutzte Ort vorgeschlagen
  const [venue, setVenue] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Ort gilt pro Spieltag: für den gewählten Spieltag bereits hinterlegten Ort bevorzugen,
  // sonst den zuletzt genutzten Ort vorschlagen.
  const suggestedVenue = useMemo(() => {
    const day = parseInt(matchday, 10);
    const dayVenue = matches.find((m) => m.matchday === day && m.venue && m.venue.trim())?.venue?.trim();
    if (dayVenue) return dayVenue;
    const withVenue = matches.filter((m) => m.venue && m.venue.trim());
    withVenue.sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`));
    return withVenue[0]?.venue?.trim() ?? '';
  }, [matches, matchday]);
  const venueValue = venue ?? suggestedVenue;

  // Ein-/ausgeklappte Spieltage (explizit gesetzte Werte überschreiben die Voreinstellung)
  const [collapsed, setCollapsed] = useState<Record<number, boolean>>({});

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

  const days = [...matchesByMatchday.keys()];
  const latestDay = days.length ? Math.max(...days) : 0;
  // Voreinstellung: nur der neueste Spieltag offen, ältere zugeklappt
  const isCollapsed = (day: number) => collapsed[day] ?? day !== latestDay;
  const toggleDay = (day: number) => setCollapsed((prev) => ({ ...prev, [day]: !isCollapsed(day) }));
  const setAll = (value: boolean) => setCollapsed(Object.fromEntries(days.map((d) => [d, value])));

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
    const ok = await onAddMatch({ matchday: day, homeTeamId, awayTeamId, date, time, venue: venueValue.trim() });
    setIsSubmitting(false);
    if (ok) {
      setHomeTeamId('');
      setAwayTeamId('');
      setVenue(null); // wieder auf „zuletzt genutzt" zurückfallen
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
        <div className="col-span-2 md:col-span-6">
          <label className="block text-xs font-mono text-gray-400 mb-1.5 uppercase tracking-wider">
            Spielort (Halle){suggestedVenue && venue === null ? ' · Vorschlag' : ''}
          </label>
          <input
            type="text"
            value={venueValue}
            onChange={(e) => setVenue(e.target.value)}
            placeholder="z.B. Halle Königsfeld"
            className={inputClass}
          />
        </div>
        <button
          type="submit"
          disabled={isSubmitting}
          className="col-span-2 md:col-span-6 px-4 py-2.5 bg-brand-accent-light hover:bg-brand-accent disabled:opacity-50 rounded-xl text-xs font-bold uppercase tracking-wider transition-all text-white flex items-center justify-center gap-1.5 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Ansetzen</span>
        </button>
      </form>

      {/* Bestehende Spiele je Spieltag (einklappbar) */}
      {matchesByMatchday.size === 0 ? (
        <p className="text-sm text-gray-400 font-sans text-center py-6">
          Noch keine Spiele in dieser Saison. Setze oben das erste Spiel an.
        </p>
      ) : (
        <div className="space-y-3">
          {days.length > 1 && (
            <div className="flex items-center justify-end gap-3 text-[11px] font-sans font-semibold uppercase tracking-wider">
              <button type="button" onClick={() => setAll(false)} className="text-hl-dim hover:text-brand-accent-light transition-colors cursor-pointer">
                Alle aufklappen
              </button>
              <span className="text-white/10">·</span>
              <button type="button" onClick={() => setAll(true)} className="text-hl-dim hover:text-brand-accent-light transition-colors cursor-pointer">
                Alle einklappen
              </button>
            </div>
          )}
          {[...matchesByMatchday.entries()].map(([day, dayMatches]) => (
            <div key={day} className="border border-white/[.07] rounded-xl overflow-hidden">
              <button
                type="button"
                onClick={() => toggleDay(day)}
                className="w-full flex items-center justify-between gap-2 px-3 py-2.5 bg-white/[.03] hover:bg-white/[.06] transition-colors cursor-pointer"
              >
                <span className="flex items-center gap-2 text-xs font-mono font-bold text-gray-300 uppercase tracking-wider">
                  <CalendarDays className="w-4 h-4 text-brand-accent-light" />
                  {day}. Spieltag
                  <span className="text-[10px] font-sans text-gray-500 normal-case">({dayMatches.length} Spiele)</span>
                </span>
                <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isCollapsed(day) ? '' : 'rotate-180'}`} />
              </button>
              {!isCollapsed(day) && (
              <div className="space-y-1.5 p-2.5">
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
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
