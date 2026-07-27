import React, { useMemo } from 'react';
import { ArrowLeft, Printer } from 'lucide-react';
import { EventConfig, Team } from '../types';
import { monogram } from './ui';

interface EventErgebniszettelProps {
  event: EventConfig;
  teams: Team[]; // echte Vereine – für Wappen, per Namensabgleich
  onBack: () => void;
}

// Wie viele leere Zeilen je Team zum Eintragen der Torschützen/Vorlagen.
const SCORER_ROWS = 6;

// Namen tolerant vergleichen (Groß/Klein, Punkte, Leerzeichen egal).
const normName = (s: string) => s.toLowerCase().replace(/\./g, '').replace(/\s+/g, ' ').trim();

// Kleines, druckfestes Wappen: gepflegtes Logo als Bild, sonst Monogramm im Rahmen.
function PaperCrest({ team }: { team?: Team }) {
  if (team?.logoUrl) {
    return <img className="zettel-logo" src={team.logoUrl} alt={team.name} referrerPolicy="no-referrer" />;
  }
  return <span className="zettel-mono">{monogram(team?.shortName || team?.name || '?')}</span>;
}

// Ergebniszettel für den Testspieltag – gleiches Druckdesign wie der Liga-Zettel,
// aber mit den Event-Spielen (namensbasiert, mit Block/Feld/Uhrzeit).
export default function EventErgebniszettel({ event, teams, onBack }: EventErgebniszettelProps) {
  const crestFor = (name: string) => teams.find((t) => normName(t.name) === normName(name));

  const matches = useMemo(
    () => [...event.matches].sort((a, b) => a.block - b.block || a.field - b.field || a.id.localeCompare(b.id)),
    [event.matches]
  );

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

        <button
          onClick={() => window.print()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-black px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-white hover:bg-gray-800 transition-colors cursor-pointer"
        >
          <Printer className="w-4 h-4" />
          Drucken / Als PDF speichern
        </button>
      </div>

      <div className="px-4 sm:px-8 py-6">
        {matches.length === 0 ? (
          <p className="no-print text-center text-gray-500 py-24">Für dieses Testspiel sind keine Spiele hinterlegt.</p>
        ) : (
          <section className="zettel-sheet">
            <div className="zettel-sheet-head">
              <div>
                <div className="zettel-sheet-title">Hero League · {event.title || 'Testspieltag'}</div>
                <div className="text-[11px] font-mono uppercase tracking-wider text-gray-500 mt-0.5">
                  {event.dateLabel}
                  {event.location ? ` · ${event.location}` : ''}
                </div>
              </div>
              <div className="zettel-sheet-sub">
                Testspiel
                <br />
                {matches.length} Spiele
              </div>
            </div>

            <div className="zettel-grid">
              {matches.map((m) => {
                const home = crestFor(m.home);
                const away = crestFor(m.away);
                return (
                  <article key={m.id} className="zettel-card">
                    <div className="zettel-head">
                      <div className="zettel-team home">
                        <PaperCrest team={home} />
                        <span className="nm">{home?.shortName || m.home || '—'}</span>
                      </div>
                      <div className="zettel-score">
                        <span className="zettel-box" />
                        <span className="zettel-colon">:</span>
                        <span className="zettel-box" />
                      </div>
                      <div className="zettel-team away">
                        <span className="nm">{away?.shortName || m.away || '—'}</span>
                        <PaperCrest team={away} />
                      </div>
                    </div>

                    <div className="zettel-meta">
                      {m.start} Uhr{m.field ? ` · Feld ${m.field}` : ''} · Block {m.block}
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
        )}
      </div>
    </div>
  );
}
