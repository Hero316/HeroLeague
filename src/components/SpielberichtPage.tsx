import React, { useMemo, useState } from 'react';
import { ArrowLeft, ChevronRight, IdCard } from 'lucide-react';
import type { ActionCounts, Match, MatchPlayerStat, ScoringConfig, Team } from '../types';
import { notesForMatch, type MatchNoteEntry } from '../lib/trackingView';
import { ACTION_META, type ActionTone } from '../lib/scoring';
import { useBackClose, goBackLayer } from '../lib/backStack';

// ===========================================================================
// Spielbericht: Ergebnis + Einzelnoten aller Spieler beider Teams für EIN Spiel.
// Klick auf einen Spieler öffnet OBEN – mit Wisch-Animation – seine Einzel-
// wertung für GENAU dieses Spiel (Bild + erfasste Aktionen), damit die Spieler
// sehen, wie sie individuell gespielt haben. Von dort optional zur Saison-Karte.
// ===========================================================================

interface Props {
  match: Match;
  teams: Team[];
  rows: MatchPlayerStat[];
  cfg: ScoringConfig;
  onBack: () => void;
  onSelectPlayer: (teamId: string, name: string) => void;
}

function noteColor(note: number, cfg: ScoringConfig): string {
  const span = cfg.rating.max - cfg.rating.min || 1;
  const t = Math.max(0, Math.min(1, (note - cfg.rating.min) / span));
  if (t < 0.5) return '#FF5442';
  if (t < 0.7) return '#E9C46A';
  return '#43E5A0';
}

function toneColor(tone: ActionTone): string {
  switch (tone) {
    case 'positive':
      return '#43E5A0';
    case 'negative':
      return '#FF5442';
    case 'special':
      return '#E9C46A';
    case 'goal':
      return '#84cc16';
    default:
      return '#c3ccc4';
  }
}

export default function SpielberichtPage({ match, teams, rows, cfg, onBack, onSelectPlayer }: Props) {
  const home = teams.find((t) => t.id === match.homeTeamId);
  const away = teams.find((t) => t.id === match.awayTeamId);
  const entries = useMemo(() => notesForMatch(rows, cfg, match.id), [rows, cfg, match.id]);

  // Aktuell aufgeklappte Einzelwertung (in-page, kein Seitenwechsel).
  const [openKey, setOpenKey] = useState<string | null>(null);
  const selected = useMemo(
    () => entries.find((e) => `${e.teamId}::${e.playerName}` === openKey) ?? null,
    [entries, openKey]
  );

  // Handy-Zurück (Geste/Taste) schließt zuerst die geöffnete Einzelwertung,
  // statt gleich die ganze Spielseite zu verlassen.
  useBackClose(selected !== null, () => setOpenKey(null));

  const photoFor = (teamId: string, name: string) =>
    teams.find((t) => t.id === teamId)?.spielerliste?.find((p) => p.name === name)?.imageUrl;

  const teamEntries = (teamId: string) => entries.filter((e) => e.teamId === teamId);
  const hasData = entries.length > 0;

  const open = (teamId: string, name: string) => {
    setOpenKey(`${teamId}::${name}`);
    try {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch {
      /* egal */
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <button
        onClick={onBack}
        className="mb-6 text-xs font-bold uppercase tracking-wider text-hl-mute hover:text-white flex items-center gap-1.5 cursor-pointer"
      >
        <ArrowLeft className="w-4 h-4" /> Zurück
      </button>

      {/* Kopf: entweder das Ergebnis ODER (mit Wisch) die Einzelwertung eines Spielers */}
      {selected ? (
        <PlayerMatchDetail
          key={openKey ?? ''}
          entry={selected}
          cfg={cfg}
          photo={photoFor(selected.teamId, selected.playerName)}
          homeName={home?.name ?? '—'}
          awayName={away?.name ?? '—'}
          onClose={goBackLayer}
          onOpenCard={() => onSelectPlayer(selected.teamId, selected.playerName)}
        />
      ) : (
        <div className="hl-card p-4 sm:p-6 mb-6 flex items-center justify-center gap-2 sm:gap-5">
          <TeamHead team={home} />
          <div className="text-center shrink-0 px-1">
            <div className="font-display font-black text-3xl sm:text-4xl tabular-nums leading-none">
              {match.homeScore ?? '–'}<span className="text-hl-faint mx-0.5 sm:mx-1">:</span>{match.awayScore ?? '–'}
            </div>
            <div className="text-[9px] sm:text-[10px] uppercase tracking-[2px] text-hl-dim mt-1 whitespace-nowrap">Spieltag {match.matchday}</div>
          </div>
          <TeamHead team={away} />
        </div>
      )}

      {!hasData ? (
        <div className="hl-card p-8 text-center text-hl-mute">Für dieses Spiel sind noch keine Werte veröffentlicht.</div>
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          {[match.homeTeamId, match.awayTeamId].map((teamId) => (
            <div key={teamId} className="min-w-0">
              <div className="text-[11px] uppercase tracking-[2px] text-hl-dim mb-2 px-1 truncate">
                {teams.find((t) => t.id === teamId)?.name ?? teamId}
              </div>
              <div className="hl-card divide-y divide-white/[.06] overflow-hidden">
                {teamEntries(teamId).map((e) => {
                  const photo = photoFor(e.teamId, e.playerName);
                  const isOpen = openKey === `${e.teamId}::${e.playerName}`;
                  return (
                    <button
                      key={e.playerName}
                      onClick={() => open(e.teamId, e.playerName)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors cursor-pointer min-w-0 ${
                        isOpen ? 'bg-brand-accent/10' : 'hover:bg-white/[.03]'
                      }`}
                    >
                      {photo ? (
                        <img src={photo} alt="" className="w-9 h-9 rounded-full object-cover shrink-0" />
                      ) : (
                        <div className="w-9 h-9 rounded-full bg-white/5 grid place-items-center text-xs text-hl-faint shrink-0">
                          {e.playerName.charAt(0)}
                        </div>
                      )}
                      <span className="flex-1 min-w-0 truncate font-semibold text-sm">
                        {e.playerName}
                        {e.role === 'keeper' && <span className="ml-1.5 text-[9px] uppercase tracking-wider text-hl-gold">TW</span>}
                      </span>
                      <span className="font-display font-black tabular-nums text-lg" style={{ color: noteColor(e.note, cfg) }}>
                        {e.note.toFixed(1)}
                      </span>
                      <ChevronRight className={`w-4 h-4 shrink-0 transition-colors ${isOpen ? 'text-brand-accent-light' : 'text-hl-faint'}`} />
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Einzelwertung eines Spielers für DIESES Spiel: Bild, kurze Überschrift, Note
// und die erfassten Aktionen (nur, was wirklich passiert ist).
function PlayerMatchDetail({
  entry,
  cfg,
  photo,
  homeName,
  awayName,
  onClose,
  onOpenCard,
}: {
  entry: MatchNoteEntry;
  cfg: ScoringConfig;
  photo?: string;
  homeName: string;
  awayName: string;
  onClose: () => void;
  onOpenCard: () => void;
}) {
  const isKeeper = entry.role === 'keeper';
  const chips = useMemo(() => {
    const c = entry.counts as ActionCounts;
    return ACTION_META.filter((a) => (c[a.key] || 0) > 0).map((a) => ({
      key: a.key,
      icon: a.icon,
      label: a.label,
      value: c[a.key] || 0,
      color: toneColor(a.tone),
    }));
  }, [entry.counts]);

  return (
    <div className="hl-card p-5 mb-6 hl-swipe-in">
      <button
        onClick={onClose}
        className="mb-4 text-[11px] font-bold uppercase tracking-wider text-hl-mute hover:text-white flex items-center gap-1.5 cursor-pointer"
      >
        <ArrowLeft className="w-3.5 h-3.5" /> Ergebnis
      </button>

      <div className="flex items-center gap-4 min-w-0">
        {photo ? (
          <img src={photo} alt="" className="w-20 h-20 rounded-2xl object-cover shrink-0 border border-white/10" />
        ) : (
          <div className="w-20 h-20 rounded-2xl bg-white/5 grid place-items-center text-2xl font-black text-hl-faint shrink-0">
            {entry.playerName.charAt(0)}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="text-[10px] uppercase tracking-[2px] text-hl-dim">Bewertung{isKeeper ? ' · Torwart' : ''}</div>
          <div className="font-display font-black text-2xl uppercase tracking-tight leading-tight truncate">{entry.playerName}</div>
          <div className="text-[11px] text-hl-dim truncate mt-0.5">
            {homeName} <span className="text-hl-faint">gegen</span> {awayName}
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="font-display font-black tabular-nums text-4xl leading-none" style={{ color: noteColor(entry.note, cfg) }}>
            {entry.note.toFixed(1)}
          </div>
          <div className="text-[9px] uppercase tracking-[2px] text-hl-dim mt-1">Note</div>
        </div>
      </div>

      {chips.length > 0 ? (
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-2 hl-cascade-soft">
          {chips.map((c) => (
            <div key={c.key} className="rounded-xl border border-white/10 bg-white/[.03] px-3 py-2 flex items-center gap-2 min-w-0">
              <span className="text-base leading-none shrink-0">{c.icon}</span>
              <span className="flex-1 min-w-0 text-[11px] text-hl-soft leading-tight">{c.label}</span>
              <span className="font-display font-black tabular-nums text-base shrink-0" style={{ color: c.color }}>
                {c.value}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-4 text-sm text-hl-mute">Für dieses Spiel wurden keine Einzelaktionen erfasst.</div>
      )}

      <button
        onClick={onOpenCard}
        className="mt-4 text-[11px] font-bold uppercase tracking-wider text-hl-mute hover:text-brand-accent-light flex items-center gap-1.5 cursor-pointer"
      >
        <IdCard className="w-3.5 h-3.5" /> Saison-Karte ansehen
      </button>
    </div>
  );
}

// Team im Ergebnis-Kopf: Wappen oben, Name darunter mittig – so bekommt der Name
// die volle Spaltenbreite und wird am Handy NICHT abgeschnitten (bricht bei Bedarf um).
function TeamHead({ team }: { team?: Team }) {
  return (
    <div className="flex flex-col items-center gap-2 flex-1 min-w-0">
      <Crest team={team} />
      <span className="font-display font-black uppercase tracking-tight text-center leading-tight text-[13px] sm:text-[15px] break-words w-full">
        {team?.name ?? '—'}
      </span>
    </div>
  );
}

function Crest({ team }: { team?: Team }) {
  if (!team) return <div className="w-10 h-10 rounded-xl bg-white/5 shrink-0" />;
  return team.logoUrl ? (
    <img src={team.logoUrl} alt="" className="w-10 h-10 object-contain shrink-0" />
  ) : (
    <div className="w-10 h-10 rounded-xl grid place-items-center text-xl shrink-0" style={{ background: `${team.logoColor}22`, color: team.logoColor }}>
      {team.logoIcon || '⚽'}
    </div>
  );
}
