import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Search, X, User, CalendarDays, Compass, Images } from 'lucide-react';
import { ActiveTab, HighlightAlbum, Match, Team } from '../types';
import { shortDate, TeamCrest, shade } from './ui';

// Diakritika entfernen + Kleinschreibung → toleranter Vergleich (ä=a, ö=o …).
const norm = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

type Result =
  | { kind: 'team'; key: string; teamId: string; label: string; sub: string; shortName: string; color: string; logoUrl?: string }
  | { kind: 'player'; key: string; teamId: string; label: string; sub: string; number?: number; color: string; imageUrl?: string }
  | { kind: 'match'; key: string; matchday: number; label: string; sub: string; home?: Team; away?: Team }
  | { kind: 'album'; key: string; label: string; sub: string; go: () => void }
  | { kind: 'page'; key: string; label: string; sub: string; go: () => void };

interface SearchBarProps {
  teams: Team[];
  matches: Match[];
  // playerName gesetzt = Vereinsseite mit direkt geöffnetem Spieler-Detail
  onSelectTeam: (teamId: string, playerName?: string) => void;
  onGoToMatchday: (matchday: number) => void;
  onNavigate?: (tab: ActiveTab) => void;
  hasHighlights?: boolean;
  eventActive?: boolean;
  eventTitle?: string;
  onOpenEvent?: () => void;
  albums?: HighlightAlbum[];
  onOpenAlbum?: (albumId: string) => void;
}

// Globale Suche: Lupe oben, fährt smooth zu einer Suchleiste aus. Findet Vereine,
// Spieler (→ Vereinsseite) und Spiele nach Datum (→ Spieltag). Funktioniert auf
// Handy (Android/iOS) und PC; das Ergebnis-Panel liegt absolut, stört das Layout nie.
export default function SearchBar({
  teams,
  matches,
  onSelectTeam,
  onGoToMatchday,
  onNavigate,
  hasHighlights,
  eventActive,
  eventTitle,
  onOpenEvent,
  albums,
  onOpenAlbum,
}: SearchBarProps) {
  const reduce = useReducedMotion();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  // Position des Dropdowns: direkt unter dem Lupe-Button gemessen (robust – egal
  // wie hoch die Navbar durch Notch/Live-Banner gerade ist).
  const [panelTop, setPanelTop] = useState(72);
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const teamName = (id: string) => teams.find((t) => t.id === id)?.name ?? '';

  const results = useMemo<Result[]>(() => {
    const nq = norm(q.trim());
    if (nq.length < 1) return [];
    const out: Result[] = [];

    // 1) Vereine
    for (const t of teams) {
      if (norm(t.name).includes(nq) || norm(t.shortName).includes(nq)) {
        out.push({ kind: 'team', key: `t-${t.id}`, teamId: t.id, label: t.name, sub: 'Verein', shortName: t.shortName, color: t.logoColor, logoUrl: t.logoUrl });
      }
    }

    // 2) Spieler (aus den Kadern) → führen zur Vereinsseite
    for (const t of teams) {
      for (const p of t.spielerliste ?? []) {
        if (norm(p.name).includes(nq)) {
          out.push({
            kind: 'player',
            key: `p-${t.id}-${p.name}`,
            teamId: t.id,
            label: p.name,
            sub: t.name,
            number: p.number,
            color: t.logoColor,
            imageUrl: p.imageUrl,
          });
        }
      }
    }

    // 3) Spiele nach Datum – nur wenn die Eingabe eine Ziffer enthält
    if (/\d/.test(nq)) {
      for (const m of matches) {
        // m.date = 'YYYY-MM-DD' → mehrere Schreibweisen zum Vergleich
        const [y, mo, d] = m.date.split('-');
        const variants = [m.date, `${d}.${mo}.${y}`, `${d}.${mo}`, `${d}${mo}`].map(norm);
        if (variants.some((v) => v.includes(nq))) {
          out.push({
            kind: 'match',
            key: `m-${m.id}`,
            matchday: m.matchday,
            label: `${teamName(m.homeTeamId)} – ${teamName(m.awayTeamId)}`,
            sub: `${shortDate(m.date)} · ${m.matchday}. Spieltag`,
            home: teams.find((t) => t.id === m.homeTeamId),
            away: teams.find((t) => t.id === m.awayTeamId),
          });
        }
      }
    }

    // 3b) Highlights-Ordner (Alben) → öffnen den Ordner direkt.
    for (const a of albums ?? []) {
      if (norm(a.title).includes(nq)) {
        out.push({
          kind: 'album',
          key: `al-${a.id}`,
          label: a.title,
          sub: `Ordner · ${a.items.length} Medien`,
          go: () => onOpenAlbum?.(a.id),
        });
      }
    }

    // 3c) „Spieltag N" → direkt zum passenden Spieltag im Spielplan.
    const sd = nq.match(/spielt\w*\s*(\d{1,2})/);
    if (sd) {
      const day = parseInt(sd[1], 10);
      if (matches.some((m) => m.matchday === day)) {
        out.push({ kind: 'page', key: `sd-${day}`, label: `${day}. Spieltag`, sub: 'Spielplan', go: () => onGoToMatchday(day) });
      }
    }

    // 4) Seiten / Bereiche der Website (Menüpunkte + Auszeichnungen)
    const pages: { label: string; kw: string; go: () => void }[] = [
      { label: 'Startseite', kw: 'startseite home start', go: () => onNavigate?.('home') },
      { label: 'Spielplan', kw: 'spielplan spiele fixtures termine ergebnisse anstoss', go: () => onNavigate?.('spielplan') },
      { label: 'Tabelle', kw: 'tabelle ligatabelle standings platzierung rang', go: () => onNavigate?.('tabelle') },
      { label: 'HERO ONE', kw: 'hero one heroone award auszeichnung ballon dor bester spieler', go: () => onNavigate?.('heroone') },
      { label: 'Statistiken', kw: 'statistiken stats zahlen torschützen torschützenkrone goldener handschuh torwart assists vorlagen', go: () => onNavigate?.('statistiken') },
      { label: 'Spieler des Spieltages', kw: 'spieler des spieltages spieltag monats mvp startseite', go: () => onNavigate?.('home') },
      ...(hasHighlights
        ? [{ label: 'Highlights', kw: 'highlights bilder fotos videos galerie clips ordner', go: () => onNavigate?.('highlights') }]
        : []),
      ...(eventActive && onOpenEvent
        ? [{ label: eventTitle || 'Testspiel', kw: 'testspiel event sonderspieltag', go: () => onOpenEvent() }]
        : []),
    ];
    for (const p of pages) {
      if (norm(p.label).includes(nq) || norm(p.kw).includes(nq)) {
        out.push({ kind: 'page', key: `pg-${p.label}`, label: p.label, sub: 'Seite', go: p.go });
      }
    }

    return out.slice(0, 8);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, teams, matches, albums, hasHighlights, eventActive, eventTitle, onNavigate, onOpenEvent, onOpenAlbum]);

  useEffect(() => setActive(0), [q]);

  // Fokus setzen + Dropdown-Position unter dem Button messen, sobald geöffnet.
  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const measure = () => {
      const r = rootRef.current?.getBoundingClientRect();
      if (r) setPanelTop(Math.round(r.bottom + 8));
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [open]);

  // Außerhalb klicken / Escape schließt. Das Panel liegt per Portal außerhalb von
  // rootRef – deshalb zusätzlich panelRef ausnehmen, sonst würde ein Klick ins
  // Panel es sofort schließen.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (rootRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const close = () => {
    setOpen(false);
    setQ('');
  };

  const choose = (r: Result) => {
    if (r.kind === 'player') onSelectTeam(r.teamId, r.label);
    else if (r.kind === 'team') onSelectTeam(r.teamId);
    else if (r.kind === 'match') onGoToMatchday(r.matchday);
    else r.go();
    close();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter' && results[active]) {
      e.preventDefault();
      choose(results[active]);
    }
  };

  return (
    <div ref={rootRef} className="relative flex items-center">
      <button
        onClick={() => (open ? close() : setOpen(true))}
        aria-label={open ? 'Suche schließen' : 'Suchen'}
        className="shrink-0 p-2 rounded-lg text-hl-soft hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
      >
        {open ? <X className="w-5 h-5" /> : <Search className="w-5 h-5" />}
      </button>

      {/* Dropdown per Portal am <body>: viewport-fixiert, damit es weder in der
          engen Navbar quetscht noch (auf iPhone) über den Bildschirmrand läuft.
          Handy: bildschirmbreit mit Rand · PC: rechtsbündiges Panel. */}
      {createPortal(
        <AnimatePresence>
          {open && (
            <motion.div
              ref={panelRef}
              key="search-panel"
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: -8, scale: 0.98 }}
              animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, y: -8, scale: 0.98 }}
              transition={{ type: 'spring', stiffness: 420, damping: 34 }}
              style={{ top: panelTop, transformOrigin: 'top right' }}
              className="hl-glass-panel fixed z-[95] left-3 right-3 sm:left-auto sm:right-6 sm:w-[380px] rounded-2xl border border-white/12 bg-[#0c1413]/98 backdrop-blur-xl shadow-2xl p-2"
            >
              {/* Eingabe */}
              <div className="flex items-center gap-2">
                <Search className="w-4 h-4 text-hl-mute shrink-0 ml-1" />
                <input
                  ref={inputRef}
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  onKeyDown={onKeyDown}
                  placeholder="Spieler, Verein, Seite, Datum…"
                  enterKeyHint="search"
                  autoComplete="off"
                  aria-label="Suche"
                  className="flex-1 min-w-0 bg-transparent h-9 text-[16px] sm:text-sm text-white placeholder:text-hl-faint focus:outline-none font-sans"
                />
                <button
                  type="button"
                  onClick={close}
                  aria-label="Schließen"
                  className="shrink-0 p-1.5 rounded-lg text-hl-mute hover:text-white hover:bg-white/10 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Ergebnisse */}
              {q.trim().length > 0 && (
                <div className="mt-1.5 border-t border-white/10 pt-1.5 max-h-[60vh] overflow-y-auto">
                  {results.length === 0 ? (
                    <div className="px-3 py-6 text-center text-sm text-hl-dim font-sans">Nichts gefunden.</div>
                  ) : (
                    results.map((r, i) => (
                      <button
                        key={r.key}
                        onClick={() => choose(r)}
                        onMouseEnter={() => setActive(i)}
                        className={`w-full flex items-center gap-3 text-left px-2.5 py-2 rounded-xl transition-[background-color,transform] duration-150 ease-out active:scale-[.98] cursor-pointer ${
                          i === active ? 'bg-white/[.08]' : 'hover:bg-white/[.05]'
                        }`}
                      >
                        {r.kind === 'team' && (
                          <span className="shrink-0">
                            <TeamCrest name={r.label} shortName={r.shortName} color={r.color} logoUrl={r.logoUrl} size="md" />
                          </span>
                        )}
                        {r.kind === 'player' &&
                          (r.imageUrl ? (
                            <img
                              src={r.imageUrl}
                              alt={r.label}
                              loading="lazy"
                              decoding="async"
                              referrerPolicy="no-referrer"
                              className="shrink-0 w-8 h-8 rounded-lg object-cover border"
                              style={{ borderColor: r.color }}
                            />
                          ) : (
                            <span
                              className="shrink-0 w-8 h-8 rounded-lg grid place-items-center font-display font-black text-white text-sm tabular-nums"
                              style={{ background: `linear-gradient(140deg, ${r.color}, ${shade(r.color, 0.45)})` }}
                            >
                              {typeof r.number === 'number' ? r.number : <User className="w-4 h-4" />}
                            </span>
                          ))}
                        {r.kind === 'match' && (
                          <span className="shrink-0 w-8 h-8 rounded-lg bg-[rgba(67,229,160,.12)] grid place-items-center text-hl-green">
                            <CalendarDays className="w-4 h-4" />
                          </span>
                        )}
                        {r.kind === 'album' && (
                          <span className="shrink-0 w-8 h-8 rounded-lg bg-[rgba(232,62,140,.14)] grid place-items-center text-hl-magenta-soft">
                            <Images className="w-4 h-4" />
                          </span>
                        )}
                        {r.kind === 'page' && (
                          <span className="shrink-0 w-8 h-8 rounded-lg bg-white/[.06] grid place-items-center text-hl-soft">
                            <Compass className="w-4 h-4" />
                          </span>
                        )}
                        <span className="min-w-0 flex-1">
                          <span className="block font-sans font-semibold text-sm text-white truncate">{r.label}</span>
                          <span className="block text-[11px] text-hl-dim font-sans truncate">{r.sub}</span>
                        </span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </div>
  );
}
