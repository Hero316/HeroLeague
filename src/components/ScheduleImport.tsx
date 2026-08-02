import React, { useMemo, useState } from 'react';
import { Upload, AlertTriangle, CheckCircle2, CalendarDays } from 'lucide-react';
import { Match, Team } from '../types';
import { SCHEDULE_2026_27, RawFixture } from './scheduleImportData';

export interface ImportGame {
  importRef: string;
  matchday: number;
  date: string;
  time: string;
  field: number | null;
  slot: number | null;
  homeTeamId: string;
  awayTeamId: string;
}

interface ScheduleImportProps {
  teams: Team[];
  matches: Match[]; // Spiele der aktiven Saison (zur Vorschau, was ersetzt wird)
  onImport: (games: ImportGame[], force: boolean) => Promise<boolean>;
}

// Namensvergleich robust machen: Groß/Klein, Umlaute, Punkte/Leerzeichen ignorieren.
function norm(s: string): string {
  return (s || '')
    .toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]/g, '');
}

function fmtDate(d: string): string {
  const dt = new Date(d);
  return Number.isNaN(dt.getTime())
    ? d
    : dt.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' });
}

export default function ScheduleImport({ teams, matches, onImport }: ScheduleImportProps) {
  const [isRunning, setIsRunning] = useState(false);

  // Team-Zuordnung: Excel-Name -> vorhandenes Team (per Name, sonst Kürzel).
  const resolveTeam = useMemo(() => {
    const byName = new Map<string, Team>();
    const byShort = new Map<string, Team>();
    for (const t of teams) {
      byName.set(norm(t.name), t);
      if (t.shortName) byShort.set(norm(t.shortName), t);
    }
    return (name: string): Team | undefined => byName.get(norm(name)) ?? byShort.get(norm(name));
  }, [teams]);

  // Alle Excel-Teamnamen einsammeln und zuordnen.
  const teamNames = useMemo(() => {
    const set = new Set<string>();
    for (const g of SCHEDULE_2026_27) {
      set.add(g.home);
      set.add(g.away);
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, []);

  const mapping = useMemo(
    () => teamNames.map((name) => ({ name, team: resolveTeam(name) })),
    [teamNames, resolveTeam]
  );
  const unmatched = mapping.filter((m) => !m.team);

  // Aufgelöste Spiele (nur wenn alle Teams zugeordnet sind, vollständig).
  const resolved: ImportGame[] = useMemo(() => {
    return SCHEDULE_2026_27.map((g: RawFixture) => ({
      importRef: g.ref,
      matchday: g.matchday,
      date: g.date,
      time: g.time,
      field: g.field ?? null,
      slot: g.slot ?? null,
      homeTeamId: resolveTeam(g.home)?.id ?? '',
      awayTeamId: resolveTeam(g.away)?.id ?? '',
    }));
  }, [resolveTeam]);

  // Vorschau je Spieltag.
  const spieltage = useMemo(() => {
    const map = new Map<number, { date: string; count: number }>();
    for (const g of SCHEDULE_2026_27) {
      const cur = map.get(g.matchday);
      if (cur) cur.count += 1;
      else map.set(g.matchday, { date: g.date, count: 1 });
    }
    return [...map.entries()].sort((a, b) => a[0] - b[0]).map(([md, v]) => ({ md, ...v }));
  }, []);

  // Bestehender Spielplan, der ersetzt wird.
  const existingCount = matches.length;
  const existingWithResults = matches.filter(
    (m) => m.homeScore != null || m.awayScore != null || m.status === 'beendet'
  ).length;

  const canImport = unmatched.length === 0 && !isRunning;

  const handleRun = async () => {
    if (!canImport) return;
    let msg =
      `Der komplette Spielplan der aktiven Saison wird ersetzt:\n\n` +
      `• ${existingCount} bestehende Spiele werden gelöscht\n` +
      `• ${resolved.length} neue Spiele (5 Spieltage) werden angelegt\n\n`;
    if (existingWithResults > 0) {
      msg += `ACHTUNG: ${existingWithResults} bestehende Spiele haben bereits ein Ergebnis – diese gehen dabei verloren!\n\n`;
    }
    msg += `Fortfahren?`;
    if (!window.confirm(msg)) return;

    setIsRunning(true);
    await onImport(resolved, existingWithResults > 0);
    setIsRunning(false);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3 bg-[#060E0F]/40 border border-white/5 rounded-xl p-4 text-sm text-gray-300 leading-relaxed">
        <Upload className="w-5 h-5 shrink-0 mt-0.5 text-brand-accent-light" />
        <div>
          <p className="font-semibold text-white mb-1">Neuen Spielplan einlesen (5 Spieltage)</p>
          <p>
            Liest den finalen Spielplan (150 Begegnungen) ein und <strong className="text-white">ersetzt</strong> damit
            den kompletten Spielplan der aktiven Saison. Je Spieltag laufen alle Teams an einem Abend in zwei Blöcken
            (Früh ab 19:00, Spät ab 20:30) auf zwei Feldern. Bereits eingetragene Ergebnisse gehen dabei verloren.
          </p>
        </div>
      </div>

      {/* Spieltag-Vorschau */}
      <div className="border border-white/[.07] rounded-xl overflow-hidden">
        <div className="px-3 py-2 bg-white/[.03] text-xs font-mono font-bold text-gray-300 uppercase tracking-wider">
          Neue Spieltage · {SCHEDULE_2026_27.length} Spiele
        </div>
        <div className="divide-y divide-white/5">
          {spieltage.map((s) => (
            <div key={s.md} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <span className="flex items-center gap-2 text-white">
                <CalendarDays className="w-4 h-4 text-brand-accent-light" />
                {s.md}. Spieltag
              </span>
              <span className="text-[12px] font-mono text-gray-400">
                {fmtDate(s.date)} · {s.count} Spiele
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Team-Zuordnung */}
      <div
        className={`rounded-xl border p-4 text-sm ${
          unmatched.length === 0
            ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-200'
            : 'border-amber-500/25 bg-amber-500/10 text-amber-200'
        }`}
      >
        {unmatched.length === 0 ? (
          <p className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 shrink-0" />
            Alle {teamNames.length} Teams aus dem Spielplan wurden vorhandenen Vereinen zugeordnet.
          </p>
        ) : (
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">
                {unmatched.length} von {teamNames.length} Teams konnten nicht zugeordnet werden:
              </p>
              <ul className="mt-1 list-disc list-inside">
                {unmatched.map((m) => (
                  <li key={m.name}>„{m.name}"</li>
                ))}
              </ul>
              <p className="mt-2 text-amber-100/80">
                Lege diese Vereine zuerst unter „Vereine verwalten" mit exakt diesem Namen an (oder passe den Namen an),
                dann klappt der Import.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Was ersetzt wird */}
      <div className="text-xs font-sans text-gray-400">
        Bestehender Spielplan der aktiven Saison: <strong className="text-gray-200">{existingCount} Spiele</strong>
        {existingWithResults > 0 && (
          <span className="text-amber-300"> · davon {existingWithResults} mit Ergebnis (gehen verloren!)</span>
        )}
      </div>

      <button
        type="button"
        onClick={handleRun}
        disabled={!canImport}
        className="w-full px-4 py-2.5 bg-brand-accent-light hover:bg-brand-accent disabled:opacity-50 disabled:cursor-not-allowed rounded-xl text-xs font-bold uppercase tracking-wider transition-all text-white flex items-center justify-center gap-1.5 cursor-pointer"
      >
        <Upload className="w-4 h-4" />
        {isRunning ? 'Spielplan wird eingelesen …' : `Neuen Spielplan einlesen (${resolved.length} Spiele)`}
      </button>
    </div>
  );
}
