import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { X, ChevronLeft, ChevronRight, Share2, Sparkles, Trophy, Target, Zap, Flame, Crown } from 'lucide-react';
import type { Match, PlayerStat, ScoringConfig, Team } from '../types';
import { calculateStandings } from '../lib/standings';
import { useBackClose } from '../lib/backStack';
import { monogram, ModalPortal } from './ui';
import { ShareSheet } from './ShareCard';

// ---------------------------------------------------------------------------
// „Hero League Wrapped" – animierter Saison-Rückblick im Story-Format.
// Antippen (rechts weiter / links zurück), Fortschrittsbalken oben, teilbar
// als Story-Bild mit Wasserzeichen. Handy-Zurück schließt korrekt.
// ---------------------------------------------------------------------------

interface Props {
  open: boolean;
  onClose: () => void;
  seasonNumber: number;
  seasonLabel: string;
  players: PlayerStat[];
  matches: Match[]; // Spiele der ausgewählten Saison
  teams: Team[];
  scoringConfig?: ScoringConfig;
}

const SLIDE_MS = 5000;

interface Slide {
  id: string;
  accent: string;
  icon: React.ComponentType<{ className?: string }>;
  kicker: string;
  render: () => React.ReactNode;
}

// Große animierte Zahl (zählt beim Erscheinen hoch).
function BigNumber({ value, decimals = 0, accent }: { value: number; decimals?: number; accent: string }) {
  const reduce = useReducedMotion();
  const [display, setDisplay] = useState(reduce ? value : 0);
  useEffect(() => {
    if (reduce) { setDisplay(value); return; }
    let raf = 0;
    const start = performance.now();
    const dur = 1200;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(value * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, reduce]);
  return (
    <span className="font-display font-black tabular-nums leading-none" style={{ fontSize: 'clamp(72px, 26vw, 150px)', color: accent, textShadow: `0 8px 40px ${accent}55` }}>
      {display.toFixed(decimals)}
    </span>
  );
}

export default function SeasonWrapped({ open, onClose, seasonNumber, seasonLabel, players, matches, teams, scoringConfig }: Props) {
  useBackClose(open, onClose);
  const [index, setIndex] = useState(0);
  const [shareOpen, setShareOpen] = useState(false);

  const teamById = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams]);
  const finished = useMemo(
    () => matches.filter((m) => m.status === 'beendet' && m.homeScore !== null && m.awayScore !== null),
    [matches]
  );

  const data = useMemo(() => {
    const totalGoals = finished.reduce((a, m) => a + (m.homeScore || 0) + (m.awayScore || 0), 0);
    const avgGoals = finished.length ? totalGoals / finished.length : 0;
    const byGoals = [...players].filter((p) => p.goals > 0).sort((a, b) => b.goals - a.goals);
    const byAssist = [...players].filter((p) => p.assists > 0).sort((a, b) => b.assists - a.assists);
    const byMotm = [...players].filter((p) => p.motmCount > 0).sort((a, b) => b.motmCount - a.motmCount);
    let biggest: { match: Match; diff: number } | null = null;
    finished.forEach((m) => {
      const diff = Math.abs((m.homeScore || 0) - (m.awayScore || 0));
      if (!biggest || diff > biggest.diff) biggest = { match: m, diff };
    });
    const standings = calculateStandings(teams, finished);
    return {
      totalGoals,
      avgGoals,
      gamesPlayed: finished.length,
      topScorer: byGoals[0] ?? null,
      topAssist: byAssist[0] ?? null,
      motmKing: byMotm[0] ?? null,
      biggest: biggest as { match: Match; diff: number } | null,
      champion: standings[0] ?? null,
    };
  }, [finished, players, teams]);

  // Team-Badge (Farbkreis mit Icon/Kürzel – keine externen Bilder, robust).
  const TeamBadge = ({ teamId, name, size = 56 }: { teamId?: string; name: string; size?: number }) => {
    const t = teamId ? teamById.get(teamId) : undefined;
    const color = t?.logoColor || '#22DFC9';
    return (
      <div
        className="rounded-2xl grid place-items-center font-display font-black shrink-0"
        style={{ width: size, height: size, background: `${color}26`, color, fontSize: size * 0.4 }}
      >
        {t?.logoIcon || monogram(name)}
      </div>
    );
  };

  const PersonLine = ({ p, valueLabel }: { p: PlayerStat; valueLabel: string }) => (
    <div className="flex flex-col items-center gap-3 mt-2">
      {p.imageUrl ? (
        <img src={p.imageUrl} alt={p.name} referrerPolicy="no-referrer" className="w-24 h-24 rounded-full object-cover border-2" style={{ borderColor: p.teamLogoColor || '#22DFC9' }} />
      ) : (
        <TeamBadge teamId={p.teamId} name={p.name} size={96} />
      )}
      <div className="text-center">
        <div className="font-display font-black text-3xl sm:text-4xl uppercase tracking-tight text-white leading-none">{p.name}</div>
        <div className="text-sm font-sans font-semibold text-hl-mute mt-1">{p.teamName}</div>
      </div>
      <div className="text-sm font-sans font-bold uppercase tracking-wider text-hl-soft">{valueLabel}</div>
    </div>
  );

  const slides: Slide[] = useMemo(() => {
    const s: Slide[] = [];
    s.push({
      id: 'intro', accent: '#22DFC9', icon: Sparkles, kicker: 'Hero League',
      render: () => (
        <div className="text-center">
          <div className="font-display font-black uppercase tracking-tight text-white" style={{ fontSize: 'clamp(40px,13vw,88px)', lineHeight: 0.95 }}>
            {seasonLabel || `Season ${seasonNumber}`}
          </div>
          <div className="font-display font-black uppercase tracking-[0.2em] text-brand-accent-light mt-3" style={{ fontSize: 'clamp(18px,5vw,26px)' }}>
            Der Rückblick
          </div>
          <p className="text-hl-mute font-sans text-sm mt-5">Tipp weiter →</p>
        </div>
      ),
    });
    if (data.gamesPlayed > 0)
      s.push({
        id: 'goals', accent: '#22DFC9', icon: Target, kicker: 'Tore der Saison',
        render: () => (
          <div className="text-center">
            <BigNumber value={data.totalGoals} accent="#22DFC9" />
            <div className="font-display font-black uppercase tracking-wider text-white text-2xl mt-2">Tore gefallen</div>
            <div className="text-hl-mute font-sans text-sm mt-3">
              in {data.gamesPlayed} Spielen · Ø {data.avgGoals.toFixed(1)} pro Partie
            </div>
          </div>
        ),
      });
    if (data.topScorer)
      s.push({
        id: 'scorer', accent: '#E9C46A', icon: Trophy, kicker: 'Torschützenkönig',
        render: () => <PersonLine p={data.topScorer!} valueLabel={`${data.topScorer!.goals} Tore`} />,
      });
    if (data.topAssist)
      s.push({
        id: 'assist', accent: '#E6238E', icon: Zap, kicker: 'Bester Vorbereiter',
        render: () => <PersonLine p={data.topAssist!} valueLabel={`${data.topAssist!.assists} Vorlagen`} />,
      });
    if (data.biggest) {
      const m = data.biggest.match;
      const home = teamById.get(m.homeTeamId);
      const away = teamById.get(m.awayTeamId);
      s.push({
        id: 'biggest', accent: '#22DFC9', icon: Flame, kicker: 'Höchster Sieg',
        render: () => (
          <div className="flex flex-col items-center gap-4">
            <div className="flex items-center justify-center gap-4">
              <div className="flex flex-col items-center gap-2 w-24">
                <TeamBadge teamId={m.homeTeamId} name={home?.name || '?'} />
                <span className="text-xs font-sans font-bold text-center text-hl-soft leading-tight">{home?.name}</span>
              </div>
              <div className="font-display font-black text-white tabular-nums" style={{ fontSize: 'clamp(44px,15vw,84px)' }}>
                {m.homeScore}<span className="text-hl-dim mx-1">:</span>{m.awayScore}
              </div>
              <div className="flex flex-col items-center gap-2 w-24">
                <TeamBadge teamId={m.awayTeamId} name={away?.name || '?'} />
                <span className="text-xs font-sans font-bold text-center text-hl-soft leading-tight">{away?.name}</span>
              </div>
            </div>
            <div className="text-sm font-sans font-bold uppercase tracking-wider text-brand-accent-light">Spieltag {m.matchday}</div>
          </div>
        ),
      });
    }
    if (data.motmKing)
      s.push({
        id: 'motm', accent: '#E9C46A', icon: Crown, kicker: 'Spieler des Spieltages – Rekord',
        render: () => <PersonLine p={data.motmKing!} valueLabel={`${data.motmKing!.motmCount}× bester Spieler`} />,
      });
    if (data.champion)
      s.push({
        id: 'champion', accent: '#E9C46A', icon: Trophy, kicker: 'Tabellenführer',
        render: () => (
          <div className="flex flex-col items-center gap-4">
            <TeamBadge teamId={data.champion!.teamId} name={data.champion!.teamName} size={110} />
            <div className="font-display font-black uppercase tracking-tight text-white text-center leading-none" style={{ fontSize: 'clamp(32px,10vw,64px)' }}>
              {data.champion!.teamName}
            </div>
            <div className="text-sm font-sans font-bold uppercase tracking-wider text-hl-gold">
              {data.champion!.points} Punkte · {data.champion!.won} Siege
            </div>
          </div>
        ),
      });
    s.push({
      id: 'outro', accent: '#22DFC9', icon: Sparkles, kicker: 'Danke!',
      render: () => (
        <div className="text-center">
          <div className="font-display font-black uppercase tracking-tight text-white" style={{ fontSize: 'clamp(30px,9vw,58px)', lineHeight: 1 }}>
            Das war<br />{seasonLabel || `Season ${seasonNumber}`}
          </div>
          <p className="text-hl-mute font-sans text-sm mt-4 mb-6">Teile deinen Rückblick 👇</p>
          <button
            onClick={() => setShareOpen(true)}
            className="inline-flex items-center gap-2 rounded-2xl bg-brand-accent-light px-6 py-3.5 text-sm font-sans font-black uppercase tracking-wider text-[#04120d] cursor-pointer transition-transform active:scale-95"
          >
            <Share2 className="w-4 h-4" /> Als Story teilen
          </button>
        </div>
      ),
    });
    return s;
  }, [data, seasonLabel, seasonNumber, teamById]);

  const count = slides.length;
  const clampedIndex = Math.min(index, count - 1);
  const slide = slides[clampedIndex];
  const isLast = clampedIndex === count - 1;

  // Beim Öffnen zurück auf Slide 0.
  useEffect(() => { if (open) setIndex(0); }, [open]);

  // Auto-Weiter (pausiert auf letzter Folie und wenn Teilen offen ist).
  useEffect(() => {
    if (!open || shareOpen || isLast) return;
    const t = setTimeout(() => setIndex((i) => Math.min(i + 1, count - 1)), SLIDE_MS);
    return () => clearTimeout(t);
  }, [open, shareOpen, isLast, clampedIndex, count]);

  const next = () => setIndex((i) => Math.min(i + 1, count - 1));
  const prev = () => setIndex((i) => Math.max(i - 1, 0));

  if (!open || !slide) return null;
  const Icon = slide.icon;

  return (
    <ModalOverlay accent={slide.accent}>
      {/* Fortschrittsbalken (aktiver Balken füllt sich über die Anzeigedauer) */}
      <div className="absolute top-0 inset-x-0 z-30 flex gap-1.5 px-3 pt-3">
        {slides.map((sl, i) => (
          <div key={sl.id} className="flex-1 h-1 rounded-full bg-white/20 overflow-hidden">
            {i < clampedIndex ? (
              <div className="h-full rounded-full bg-white" style={{ width: '100%' }} />
            ) : i === clampedIndex ? (
              <motion.div
                key={`fill-${clampedIndex}`}
                className="h-full rounded-full bg-white"
                initial={{ width: '0%' }}
                animate={{ width: '100%' }}
                transition={{ duration: isLast || shareOpen ? 0.3 : SLIDE_MS / 1000, ease: 'linear' }}
              />
            ) : (
              <div className="h-full rounded-full bg-white" style={{ width: '0%' }} />
            )}
          </div>
        ))}
      </div>

      {/* Tipp-Zonen (links zurück / rechts weiter) – oben/unten frei für Knöpfe */}
      <button aria-label="Zurück" onClick={prev} className="absolute left-0 top-16 bottom-28 w-1/3 z-20 cursor-pointer" style={{ background: 'transparent' }} />
      <button aria-label="Weiter" onClick={next} className="absolute right-0 top-16 bottom-28 w-1/3 z-20 cursor-pointer" style={{ background: 'transparent' }} />

      {/* Schließen */}
      <button
        onClick={onClose}
        aria-label="Schließen"
        className="absolute top-5 right-3 z-40 w-10 h-10 rounded-full bg-white/10 border border-white/15 text-white flex items-center justify-center cursor-pointer active:scale-90 transition-transform"
      >
        <X className="w-5 h-5" />
      </button>

      {/* Inhalt */}
      <div className="absolute inset-0 z-10 flex flex-col items-center justify-center px-8">
        <AnimatePresence mode="wait">
          <motion.div
            key={slide.id}
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.98 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            className="w-full max-w-md flex flex-col items-center"
          >
            <div className="flex items-center gap-2 mb-6" style={{ color: slide.accent }}>
              <Icon className="w-5 h-5" />
              <span className="font-sans font-black uppercase tracking-[0.18em] text-xs">{slide.kicker}</span>
            </div>
            {slide.render()}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Desktop-Pfeile */}
      <button onClick={prev} aria-label="Zurück" className="hidden md:flex absolute left-3 top-1/2 -translate-y-1/2 z-40 w-11 h-11 rounded-full bg-white/8 hover:bg-white/15 border border-white/10 text-white items-center justify-center cursor-pointer transition-colors">
        <ChevronLeft className="w-5 h-5" />
      </button>
      <button onClick={next} aria-label="Weiter" className="hidden md:flex absolute right-3 top-1/2 -translate-y-1/2 z-40 w-11 h-11 rounded-full bg-white/8 hover:bg-white/15 border border-white/10 text-white items-center justify-center cursor-pointer transition-colors">
        <ChevronRight className="w-5 h-5" />
      </button>

      {/* Teilen (immer erreichbar unten) */}
      <button
        onClick={() => setShareOpen(true)}
        className="absolute bottom-5 left-1/2 -translate-x-1/2 z-40 inline-flex items-center gap-2 rounded-full bg-white/10 border border-white/15 px-4 py-2 text-xs font-sans font-bold uppercase tracking-wider text-white cursor-pointer active:scale-95 transition-transform"
      >
        <Share2 className="w-3.5 h-3.5" /> Teilen
      </button>

      {/* Teilen-Karte (Zusammenfassung) */}
      <ShareSheet open={shareOpen} onClose={() => setShareOpen(false)} accent="#22DFC9" filename={`hero-league-rueckblick-s${seasonNumber}.png`} shareText={`Mein Hero League Rückblick – ${seasonLabel || `Season ${seasonNumber}`} 🏆 hero-league.de`}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontFamily: '"Saira Condensed","Saira",sans-serif', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.14em', fontSize: 15, color: '#22DFC9' }}>Rückblick</div>
          <div style={{ fontFamily: '"Saira Condensed","Saira",sans-serif', fontWeight: 900, textTransform: 'uppercase', fontSize: 40, lineHeight: 1, marginTop: 4 }}>{seasonLabel || `Season ${seasonNumber}`}</div>
        </div>
        <div style={{ marginTop: 28, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <SummaryStat label="Tore gesamt" value={String(data.totalGoals)} accent="#22DFC9" />
          {data.topScorer && <SummaryStat label="Torschützenkönig" value={`${data.topScorer.name} · ${data.topScorer.goals}`} accent="#E9C46A" />}
          {data.topAssist && <SummaryStat label="Bester Vorbereiter" value={`${data.topAssist.name} · ${data.topAssist.assists}`} accent="#E6238E" />}
          {data.champion && <SummaryStat label="Tabellenführer" value={data.champion.teamName} accent="#E9C46A" />}
        </div>
      </ShareSheet>
    </ModalOverlay>
  );
}

// Eine Zeile in der teilbaren Zusammenfassung.
function SummaryStat({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div style={{ borderLeft: `3px solid ${accent}`, paddingLeft: 12 }}>
      <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(255,255,255,0.55)' }}>{label}</div>
      <div style={{ fontFamily: '"Saira Condensed","Saira",sans-serif', fontWeight: 900, fontSize: 22, lineHeight: 1.1, marginTop: 2 }}>{value}</div>
    </div>
  );
}

// Vollbild-Bühne mit Farbverlauf je Slide (Portal + Body-Lock für iOS).
function ModalOverlay({ children, accent }: { children: React.ReactNode; accent: string }) {
  return (
    <ModalPortal>
      <motion.div
        className="fixed inset-0 z-[120]"
        style={{ background: `radial-gradient(120% 70% at 50% 0%, ${accent}1f 0%, transparent 55%), #05080a` }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.25 }}
      >
        {children}
      </motion.div>
    </ModalPortal>
  );
}
