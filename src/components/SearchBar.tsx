import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Search, X, Shield, User, CalendarDays, Compass } from 'lucide-react';
import { ActiveTab, Match, Team } from '../types';
import { shortDate } from './ui';

// Diakritika entfernen + Kleinschreibung → toleranter Vergleich (ä=a, ö=o …).
const norm = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

type Result =
  | { kind: 'team'; key: string; teamId: string; label: string; sub: string }
  | { kind: 'player'; key: string; teamId: string; label: string; sub: string; number?: number; color: string }
  | { kind: 'match'; key: string; matchday: number; label: string; sub: string; home?: Team; away?: Team }
  | { kind: 'page'; key: string; label: string; sub: string; go: () => void };

interface SearchBarProps {
  teams: Team[];
  matches: Match[];
  onSelectTeam: (teamId: string) => void;
  onGoToMatchday: (matchday: number) => void;
  onNavigate?: (tab: ActiveTab) => void;
  hasHighlights?: boolean;
  eventActive?: boolean;
  eventTitle?: string;
  onOpenEvent?: () => void;
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
}: SearchBarProps) {
  const reduce = useReducedMotion();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const teamName = (id: string) => teams.find((t) => t.id === id)?.name ?? '';

  const results = useMemo<Result[]>(() => {
    const nq = norm(q.trim());
    if (nq.length < 1) return [];
    const out: Result[] = [];

    // 1) Vereine
    for (const t of teams) {
      if (norm(t.name).includes(nq) || norm(t.shortName).includes(nq)) {
        out.push({ kind: 'team', key: `t-${t.id}`, teamId: t.id, label: t.name, sub: 'Verein' });
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

    // 4) Seiten / Bereiche der Website (Menüpunkte)
    const pages: { label: string; kw: string; go: () => void }[] = [
      { label: 'Startseite', kw: 'startseite home start', go: () => onNavigate?.('home') },
      { label: 'Spielplan', kw: 'spielplan spiele fixtures termine ergebnisse', go: () => onNavigate?.('spielplan') },
      { label: 'Tabelle', kw: 'tabelle ligatabelle standings platzierung', go: () => onNavigate?.('tabelle') },
      { label: 'HERO ONE', kw: 'hero one heroone award auszeichnung ballon dor', go: () => onNavigate?.('heroone') },
      { label: 'Statistiken', kw: 'statistiken stats zahlen torschützen', go: () => onNavigate?.('statistiken') },
      ...(hasHighlights
        ? [{ label: 'Highlights', kw: 'highlights bilder fotos videos galerie clips', go: () => onNavigate?.('highlights') }]
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
  }, [q, teams, matches, hasHighlights, eventActive, eventTitle, onNavigate, onOpenEvent]);

  useEffect(() => setActive(0), [q]);

  // Fokus setzen, sobald geöffnet.
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // Außerhalb klicken / Escape schließt.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) close();
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
    if (r.kind === 'team' || r.kind === 'player') onSelectTeam(r.teamId);
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
    <div ref={rootRef} className="relative flex items-center justify-end">
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="field"
            initial={reduce ? { opacity: 0 } : { width: 0, opacity: 0 }}
            animate={reduce ? { opacity: 1 } : { width: 'min(58vw, 260px)', opacity: 1 }}
            exit={reduce ? { opacity: 0 } : { width: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 32 }}
            className="overflow-hidden"
          >
            <input
              ref={inputRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Spieler, Verein, Datum…"
              enterKeyHint="search"
              autoComplete="off"
              aria-label="Suche"
              className="w-full bg-white/[.07] border border-white/15 focus:border-brand-accent-light rounded-full h-9 pl-4 pr-2 text-sm text-white placeholder:text-hl-faint focus:outline-none font-sans"
            />
          </motion.div>
        )}
      </AnimatePresence>

      <button
        onClick={() => (open ? close() : setOpen(true))}
        aria-label={open ? 'Suche schließen' : 'Suchen'}
        className="shrink-0 ml-1 p-2 rounded-lg text-hl-soft hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
      >
        {open ? <X className="w-5 h-5" /> : <Search className="w-5 h-5" />}
      </button>

      {/* Ergebnis-Panel: absolut, stört das Navbar-Layout nicht */}
      <AnimatePresence>
        {open && q.trim().length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.16 }}
            className="absolute top-[calc(100%+10px)] right-0 w-[min(92vw,380px)] max-h-[70vh] overflow-y-auto rounded-2xl border border-white/12 bg-[#0c1413]/98 backdrop-blur-xl shadow-2xl p-1.5 z-[60]"
          >
            {results.length === 0 ? (
              <div className="px-3 py-6 text-center text-sm text-hl-dim font-sans">Nichts gefunden.</div>
            ) : (
              results.map((r, i) => (
                <button
                  key={r.key}
                  onClick={() => choose(r)}
                  onMouseEnter={() => setActive(i)}
                  className={`w-full flex items-center gap-3 text-left px-2.5 py-2 rounded-xl transition-colors cursor-pointer ${
                    i === active ? 'bg-white/[.08]' : 'hover:bg-white/[.05]'
                  }`}
                >
                  {r.kind === 'team' && (
                    <span className="shrink-0 w-8 h-8 rounded-lg bg-[rgba(34,223,201,.12)] grid place-items-center text-brand-accent-light">
                      <Shield className="w-4 h-4" />
                    </span>
                  )}
                  {r.kind === 'player' && (
                    <span
                      className="shrink-0 w-8 h-8 rounded-lg grid place-items-center font-display font-black text-sm tabular-nums text-white"
                      style={{ background: `${r.color}22`, color: r.color }}
                    >
                      {typeof r.number === 'number' ? r.number : <User className="w-4 h-4" />}
                    </span>
                  )}
                  {r.kind === 'match' && (
                    <span className="shrink-0 w-8 h-8 rounded-lg bg-[rgba(67,229,160,.12)] grid place-items-center text-hl-green">
                      <CalendarDays className="w-4 h-4" />
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
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
