import React, { useMemo, useState } from 'react';
import { CalendarClock, ArrowRight, AlertTriangle } from 'lucide-react';
import { Match, Team } from '../types';

interface ScheduleCombineProps {
  matches: Match[]; // Spiele der aktiven Saison
  teams: Team[];
  onCombine: (updates: { id: string; date: string; time: string }[]) => Promise<boolean>;
}

const OPEN_FIRST = '19:00'; // früher Block (erster Spieltag des Doppelabends)
const OPEN_SECOND = '20:30'; // später Block (zweiter Spieltag des Doppelabends)

function timeToMin(t: string): number {
  const [h, m] = t.split(':').map((n) => parseInt(n, 10));
  if (Number.isNaN(h) || Number.isNaN(m)) return 0;
  return h * 60 + m;
}
function minToTime(min: number): string {
  const clamped = Math.max(0, Math.min(23 * 60 + 59, min));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// Datum eines Spieltags = Datum seines frühesten Spiels.
function matchdayDate(games: Match[]): string {
  return [...games].sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time))[0]?.date ?? '';
}

type PlannedUpdate = { id: string; date: string; time: string; oldDate: string; oldTime: string; label: string };

export default function ScheduleCombine({ matches, teams, onCombine }: ScheduleCombineProps) {
  const [isRunning, setIsRunning] = useState(false);
  const teamName = (id: string) => teams.find((t) => t.id === id)?.shortName || teams.find((t) => t.id === id)?.name || id;

  const plan = useMemo(() => {
    const mds = [...new Set(matches.map((m) => m.matchday))].sort((a, b) => a - b);
    if (mds.length < 4) return null;

    const games = (md: number) => matches.filter((m) => m.matchday === md);
    // Verschiebt eine Spieltag-Gruppe auf ein Zieldatum und legt ihren frühesten
    // Anstoß auf `blockStart`; alle übrigen Spiele behalten ihren Abstand (Raster bleibt).
    const shift = (md: number, targetDate: string, blockStart: string): PlannedUpdate[] => {
      const g = games(md);
      if (g.length === 0) return [];
      const earliest = Math.min(...g.map((m) => timeToMin(m.time)));
      const delta = timeToMin(blockStart) - earliest;
      return g.map((m) => ({
        id: m.id,
        date: targetDate,
        time: minToTime(timeToMin(m.time) + delta),
        oldDate: m.date,
        oldTime: m.time,
        label: `${teamName(m.homeTeamId)} – ${teamName(m.awayTeamId)}`,
      }));
    };

    const firstMd = mds[0];
    const secondMd = mds[1];
    const prevMd = mds[mds.length - 2];
    const lastMd = mds[mds.length - 1];

    const openDate = matchdayDate(games(secondMd)); // Auftakt läuft am Termin des 2. Spieltags
    const closeDate = matchdayDate(games(prevMd)); // Abschluss läuft am Termin des vorletzten Spieltags

    const opening = [
      ...shift(firstMd, openDate, OPEN_FIRST), // Ex-1. Spieltag → 19:00-Block
      ...shift(secondMd, openDate, OPEN_SECOND), // Ex-2. Spieltag → 20:30-Block
    ];
    const closing = [
      ...shift(prevMd, closeDate, OPEN_FIRST), // vorletzter Spieltag → 19:00-Block
      ...shift(lastMd, closeDate, OPEN_SECOND), // letzter Spieltag → 20:30-Block
    ];

    // Nur echte Änderungen behalten (idempotent: erneutes Ausführen ergibt leere Liste).
    const changed = [...opening, ...closing].filter((u) => u.date !== u.oldDate || u.time !== u.oldTime);

    return {
      firstMd,
      secondMd,
      prevMd,
      lastMd,
      openDate,
      closeDate,
      opening,
      closing,
      updates: changed.map(({ id, date, time }) => ({ id, date, time })),
      preview: { opening, closing },
      changedCount: changed.length,
    };
  }, [matches, teams]);

  const handleRun = async () => {
    if (!plan || plan.updates.length === 0) return;
    const ok = window.confirm(
      `Auftakt und Abschluss werden zusammengelegt:\n\n` +
        `• Auftakt am ${plan.openDate}: Spieltag ${plan.firstMd} um ${OPEN_FIRST}, Spieltag ${plan.secondMd} um ${OPEN_SECOND}\n` +
        `• Abschluss am ${plan.closeDate}: Spieltag ${plan.prevMd} um ${OPEN_FIRST}, Spieltag ${plan.lastMd} um ${OPEN_SECOND}\n\n` +
        `Es werden ${plan.updates.length} Spiele auf neue Termine/Zeiten gesetzt. ` +
        `Ergebnisse und Torschützen bleiben erhalten. Fortfahren?`
    );
    if (!ok) return;
    setIsRunning(true);
    await onCombine(plan.updates);
    setIsRunning(false);
  };

  const fmtDate = (d: string) => {
    const dt = new Date(d);
    return Number.isNaN(dt.getTime()) ? d : dt.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' });
  };

  if (!plan) {
    return (
      <div className="flex items-start gap-3 bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 text-sm text-amber-200">
        <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
        <p>
          Für die Zusammenlegung werden mindestens 4 Spieltage benötigt. Aktuell sind nicht genügend Spieltage im
          Spielplan vorhanden.
        </p>
      </div>
    );
  }

  const Block = ({ title, list }: { title: string; list: PlannedUpdate[] }) => (
    <div className="border border-white/[.07] rounded-xl overflow-hidden">
      <div className="px-3 py-2 bg-white/[.03] text-xs font-mono font-bold text-gray-300 uppercase tracking-wider">{title}</div>
      <div className="divide-y divide-white/5">
        {list.map((u) => {
          const unchanged = u.date === u.oldDate && u.time === u.oldTime;
          return (
            <div key={u.id} className="flex items-center justify-between gap-3 px-3 py-1.5 text-sm">
              <span className="min-w-0 flex-1 truncate text-white">{u.label}</span>
              <span className="flex items-center gap-2 text-[11px] font-mono text-gray-400 shrink-0">
                <span className="text-gray-500">
                  {fmtDate(u.oldDate)} {u.oldTime}
                </span>
                <ArrowRight className="w-3 h-3 text-brand-accent-light" />
                <span className={unchanged ? 'text-gray-500' : 'text-brand-accent-light font-semibold'}>
                  {fmtDate(u.date)} {u.time}
                </span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3 bg-[#060E0F]/40 border border-white/5 rounded-xl p-4 text-sm text-gray-300 leading-relaxed">
        <CalendarClock className="w-5 h-5 shrink-0 mt-0.5 text-brand-accent-light" />
        <div>
          <p className="font-semibold text-white mb-1">Auftakt- und Abschlussabend zusammenlegen</p>
          <p>
            Der erste und der letzte Termin entfallen als eigene Abende. Der Auftakt läuft am{' '}
            <strong className="text-white">{fmtDate(plan.openDate)}</strong> (Spieltag {plan.firstMd} um {OPEN_FIRST},
            Spieltag {plan.secondMd} um {OPEN_SECOND}), der Abschluss am{' '}
            <strong className="text-white">{fmtDate(plan.closeDate)}</strong> (Spieltag {plan.prevMd} um {OPEN_FIRST},
            Spieltag {plan.lastMd} um {OPEN_SECOND}). Ergebnisse und Torschützen bleiben erhalten.
          </p>
        </div>
      </div>

      <Block title={`Auftakt · ${fmtDate(plan.openDate)}`} list={plan.preview.opening} />
      <Block title={`Abschluss · ${fmtDate(plan.closeDate)}`} list={plan.preview.closing} />

      {plan.changedCount === 0 ? (
        <p className="text-sm text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-3">
          Der Spielplan ist bereits so zusammengelegt – es gibt nichts zu ändern.
        </p>
      ) : (
        <button
          type="button"
          onClick={handleRun}
          disabled={isRunning}
          className="w-full px-4 py-2.5 bg-brand-accent-light hover:bg-brand-accent disabled:opacity-50 rounded-xl text-xs font-bold uppercase tracking-wider transition-all text-white flex items-center justify-center gap-1.5 cursor-pointer"
        >
          <CalendarClock className="w-4 h-4" />
          {isRunning ? 'Wird zusammengelegt …' : `Jetzt zusammenlegen (${plan.updates.length} Spiele)`}
        </button>
      )}
    </div>
  );
}
