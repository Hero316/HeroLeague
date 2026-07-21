import React, { useMemo, useState } from 'react';
import { ArrowLeft, Printer } from 'lucide-react';
import { Match, Team } from '../types';
import { monogram } from './ui';

interface ErgebniszettelProps {
  teams: Team[];
  matches: Match[]; // Spiele der aktuellen Saison
  onBack: () => void;
}

// Wie viele leere Zeilen je Team zum Eintragen der Torschützen/Vorlagen.
// Kompakt gehalten – reicht auch für ein torreiches Spiel, ohne das Blatt zu überladen.
const SCORER_ROWS = 6;

// Volles deutsches Datum inkl. Wochentag für die Blatt-Überschrift.
function longDate(dateStr: string): string {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' });
}

// Kleines, druckfestes Wappen: gepflegtes Logo als Bild, sonst Monogramm im Rahmen
// (kein Farbverlauf – der würde auf Papier ohne „Hintergrundgrafik drucken" verschwinden).
function PaperCrest({ team }: { team?: Team }) {
  if (team?.logoUrl) {
    return <img className="zettel-logo" src={team.logoUrl} alt={team.name} referrerPolicy="no-referrer" />;
  }
  return <span className="zettel-mono">{monogram(team?.shortName || team?.name || '?')}</span>;
}

export default function Ergebniszettel({ teams, matches, onBack }: ErgebniszettelProps) {
  const teamById = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams]);

  // Spiele nach Abend (= Kalendertag) gruppieren, chronologisch sortiert.
  const evenings = useMemo(() => {
    const byDate = new Map<string, Match[]>();
    for (const m of matches) {
      const list = byDate.get(m.date) ?? [];
      list.push(m);
      byDate.set(m.date, list);
    }
    return [...byDate.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, list]) => ({
        date,
        matches: [...list].sort(
          (a, b) => a.time.localeCompare(b.time) || (a.field ?? 0) - (b.field ?? 0) || a.id.localeCompare(b.id)
        ),
      }));
  }, [matches]);

  // Auswahl: einzelner Abend oder alle. Standard: erster (frühester) Abend.
  const [selected, setSelected] = useState<string>('all');
  const shownEvenings = selected === 'all' ? evenings : evenings.filter((e) => e.date === selected);

  const rows = Array.from({ length: SCORER_ROWS });

  const renderTeamColumn = (team?: Team) => (
    <div className="zettel-col">
      <div className="zettel-lbl">Spieler des Spiels</div>
      <div className="zettel-motm" />
      <div className="zettel-lbl">Torschützen &amp; Vorlagen</div>
      <div className="zettel-vh">
        <span className="th" />
        <span className="vhh">Vorlage</span>
      </div>
      {rows.map((_, i) => (
        <div key={i} className="zettel-goalrow">
          <span className="t" />
          <span className="v" />
        </div>
      ))}
    </div>
  );

  return (
    <div className="zettel-page">
      {/* Steuerleiste – nur am Bildschirm, nicht im Ausdruck */}
      <div className="zettel-toolbar sticky top-0 z-10 bg-white/95 backdrop-blur border-b border-black/10 px-4 sm:px-8 py-3 flex flex-wrap items-center gap-3 justify-between">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-gray-600 hover:text-black transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          Zurück
        </button>

        <div className="flex items-center gap-3">
          <label className="text-xs font-semibold uppercase tracking-wider text-gray-500">Abend</label>
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className="bg-white border border-black/15 rounded-lg px-3 py-1.5 text-sm text-black focus:outline-none focus:border-black cursor-pointer"
          >
            <option value="all">Alle Abende</option>
            {evenings.map((e) => (
              <option key={e.date} value={e.date}>
                {longDate(e.date)} ({e.matches.length})
              </option>
            ))}
          </select>

          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-black px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-white hover:bg-gray-800 transition-colors cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            Drucken / Als PDF speichern
          </button>
        </div>
      </div>

      <div className="px-4 sm:px-8 py-6">
        {evenings.length === 0 ? (
          <p className="no-print text-center text-gray-500 py-24">Keine Spiele in dieser Saison vorhanden.</p>
        ) : (
          shownEvenings.map((evening) => {
            const venue = evening.matches.find((m) => m.venue && m.venue.trim())?.venue?.trim();
            const mds = [...new Set(evening.matches.map((m) => m.matchday))].sort((a, b) => a - b);
            return (
              <section key={evening.date} className="zettel-sheet">
                <div className="zettel-sheet-head">
                  <div>
                    <div className="zettel-sheet-title">Hero League · Ergebniszettel</div>
                    <div className="text-[11px] font-mono uppercase tracking-wider text-gray-500 mt-0.5">
                      {longDate(evening.date)}
                      {venue ? ` · ${venue}` : ''}
                    </div>
                  </div>
                  <div className="zettel-sheet-sub">
                    {mds.length === 1 ? `${mds[0]}. Spieltag` : `Spieltag ${mds.join(' & ')}`}
                    <br />
                    {evening.matches.length} Spiele
                  </div>
                </div>

                <div className="zettel-grid">
                  {evening.matches.map((m) => {
                    const home = teamById.get(m.homeTeamId);
                    const away = teamById.get(m.awayTeamId);
                    return (
                      <article key={m.id} className="zettel-card">
                        <div className="zettel-head">
                          <div className="zettel-team home">
                            <PaperCrest team={home} />
                            <span className="nm">{home?.shortName || home?.name || '—'}</span>
                          </div>
                          <div className="zettel-score">
                            <span className="zettel-box" />
                            <span className="zettel-colon">:</span>
                            <span className="zettel-box" />
                          </div>
                          <div className="zettel-team away">
                            <span className="nm">{away?.shortName || away?.name || '—'}</span>
                            <PaperCrest team={away} />
                          </div>
                        </div>

                        <div className="zettel-meta">
                          {m.time} Uhr
                          {m.field ? ` · Feld ${m.field}` : ''} · {m.matchday}. Spieltag
                        </div>

                        <div className="zettel-cols">
                          {renderTeamColumn(home)}
                          {renderTeamColumn(away)}
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            );
          })
        )}
      </div>
    </div>
  );
}
