import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowLeft, Lock, Trophy, Minus, Plus, Target, Loader2, LogOut, ShieldCheck, Clock, CalendarDays, ClipboardCheck, Flame, ChevronDown, Star, Check, X } from 'lucide-react';
import type { Match, Team, Tip } from '../types';
import { fetchTips, submitTip, getIdentity, clearIdentity, scoreTip, leaderboard, tipDeadline, berlinToday, TIP_POINTS, fetchBonus, submitBonus, BONUS_QUESTIONS, BONUS_MAX, type TippIdentity, type BonusState, type BonusAnswers } from '../lib/tips';
import { TeamCrest, SegmentedControl } from './ui';
import { Reveal } from './anim';
import TippRegister from './TippRegister';

interface Props {
  matches: Match[]; // Spiele der aktuellen Saison
  teams: Team[];
  seasonLabel?: string;
  onNavigate: (path: string) => void;
}

const EASE = [0.22, 1, 0.36, 1] as const;

export default function TippspielPage({ matches, teams, seasonLabel, onNavigate }: Props) {
  const teamById = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams]);

  const [identity, setIdentity] = useState<TippIdentity | null>(getIdentity());
  const voterId = identity?.voterId ?? '';
  const [tips, setTips] = useState<Tip[]>([]);
  const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState<Record<string, { home: number; away: number }>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [now, setNow] = useState(() => Date.now());
  const [view, setView] = useState<'tippen' | 'rangliste' | 'meine'>('tippen');
  const [bonus, setBonus] = useState<BonusState | null>(null);

  const load = () => {
    fetchTips()
      .then(setTips)
      .catch(() => {})
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  // Zusatzfragen laden (und neu, wenn sich die Anmeldung ändert).
  const loadBonus = () => { fetchBonus(getIdentity()).then(setBonus).catch(() => {}); };
  useEffect(loadBonus, [identity?.voterId]);

  // Sekunden-Ticker für den Countdown.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const myTips = useMemo(() => {
    const map = new Map<string, Tip>();
    tips.forEach((t) => { if (t.voterId === voterId) map.set(t.matchId, t); });
    return map;
  }, [tips, voterId]);

  // Nur EIN Spieltag-Abend zur Zeit: der nächste noch offene Spieltag (Datum
  // heute oder später). Sobald sein Tag vorbei ist, rückt der nächste nach –
  // die Punkte aller Spieltage bleiben in der Rangliste erhalten.
  const { activeMatches, activeMatchday, activeDate } = useMemo(() => {
    const today = berlinToday();
    const geplant = matches.filter((m) => m.status === 'geplant');
    // Spieltag -> frühestes Datum
    const dateByDay = new Map<number, string>();
    geplant.forEach((m) => {
      const cur = dateByDay.get(m.matchday);
      if (!cur || m.date < cur) dateByDay.set(m.matchday, m.date);
    });
    // Kandidaten: Spieltage, deren Abend heute oder in der Zukunft liegt.
    const days = [...dateByDay.entries()]
      .filter(([, date]) => date >= today)
      .sort((a, b) => a[1].localeCompare(b[1]) || a[0] - b[0]);
    if (days.length === 0) return { activeMatches: [] as Match[], activeMatchday: null as number | null, activeDate: '' };
    const [day, date] = days[0];
    const list = geplant
      .filter((m) => m.matchday === day)
      .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`) || (a.field ?? 0) - (b.field ?? 0));
    return { activeMatches: list, activeMatchday: day, activeDate: date };
  }, [matches]);

  const deadlineMs = activeDate ? tipDeadline(activeDate).getTime() : 0;
  const tipsOpen = deadlineMs > 0 && now < deadlineMs;
  const remainingMs = Math.max(0, deadlineMs - now);
  const myFinished = useMemo(
    () =>
      matches
        .filter((m) => m.status === 'beendet' && myTips.has(m.id))
        .sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`)),
    [matches, myTips]
  );
  const board = useMemo(() => leaderboard(tips, matches, bonus?.scores ?? []), [tips, matches, bonus]);

  // Erster Spieltag der Saison → nur dort erscheinen die Zusatzfragen.
  const firstMatchday = useMemo(() => (matches.length ? Math.min(...matches.map((m) => m.matchday)) : null), [matches]);
  const showBonus = activeMatchday !== null && activeMatchday === firstMatchday;
  const bonusSubmitted = !!bonus?.mine;
  const bonusOpen = tipsOpen; // gleicher Tippschluss wie der 1. Spieltag (19:00)
  const myBoardIndex = board.findIndex((r) => r.voterId === voterId);
  const myRow = myBoardIndex >= 0 ? board[myBoardIndex] : null;
  const myTotalPoints = myRow?.points ?? 0;
  const myRank = myBoardIndex >= 0 ? myBoardIndex + 1 : null;

  // „Weitere Menüs" erscheinen erst, sobald es ausgewertete Ergebnisse gibt.
  const hasResults = board.length > 0;
  const activeView = hasResults ? view : 'tippen';
  const viewTabs = useMemo(() => {
    const t: { value: 'tippen' | 'rangliste' | 'meine'; label: string; icon: typeof Target }[] = [
      { value: 'tippen', label: 'Tippen', icon: Target },
      { value: 'rangliste', label: 'Rangliste', icon: Trophy },
    ];
    if (myFinished.length > 0) t.push({ value: 'meine', label: 'Deine Tipps', icon: ClipboardCheck });
    return t;
  }, [myFinished.length]);

  const draft = (id: string) => drafts[id] ?? { home: 0, away: 0 };
  const setDraft = (id: string, side: 'home' | 'away', delta: number) =>
    setDrafts((d) => {
      const cur = d[id] ?? { home: 0, away: 0 };
      const next = Math.max(0, Math.min(99, cur[side] + delta));
      return { ...d, [id]: { ...cur, [side]: next } };
    });

  const logout = () => {
    clearIdentity();
    setIdentity(null);
  };

  const send = async (m: Match) => {
    if (!identity) return;
    const d = draft(m.id);
    setBusy(m.id);
    setErrors((e) => ({ ...e, [m.id]: '' }));
    try {
      const tip = await submitTip(m.id, d.home, d.away);
      setTips((prev) => [...prev, tip]);
    } catch (err) {
      setErrors((e) => ({ ...e, [m.id]: err instanceof Error ? err.message : 'Fehler' }));
      load(); // Serverstand nachladen (falls schon getippt / Spiel gestartet)
    } finally {
      setBusy(null);
    }
  };

  const Crest = ({ id, size = 'md' as const, clickable = false }: { id: string; size?: 'sm' | 'md' | 'lg' | 'xl'; clickable?: boolean }) => {
    const t = teamById.get(id);
    return (
      <TeamCrest
        name={t?.name || '?'}
        shortName={t?.shortName || ''}
        color={t?.logoColor || '#22DFC9'}
        logoUrl={t?.logoUrl}
        size={size}
        onSelect={clickable ? () => onNavigate(`/verein/${encodeURIComponent(id)}`) : undefined}
      />
    );
  };
  const teamName = (id: string) => teamById.get(id)?.name || teamById.get(id)?.shortName || '?';
  const teamsSorted = useMemo(() => [...teams].sort((a, b) => a.name.localeCompare(b.name)), [teams]);

  // Die Spiel-Liste des aktiven Spieltags (einmal gebaut, in Collapsible oder frei genutzt).
  const matchesList = (
    <div className="space-y-3">
      {activeMatches.map((m, i) => {
        const mine = myTips.get(m.id);
        const d = draft(m.id);
        const err = errors[m.id];
        const canTip = identity && tipsOpen && !mine;
        return (
          <motion.div
            key={m.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: EASE, delay: Math.min(i * 0.04, 0.3) }}
            className="relative overflow-hidden rounded-2xl border border-tipp/20 p-4"
            style={{ background: 'linear-gradient(180deg, rgba(255,122,26,.06), rgba(10,20,21,0) 55%), var(--color-brand-deep)' }}
          >
            <div className="flex items-center justify-center mb-3">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/5 border border-white/10 px-3 py-1 text-[10px] font-sans font-bold uppercase tracking-wider text-hl-dim">
                <Clock className="w-3 h-3" /> {typeof m.field === 'number' ? `Feld ${m.field} · ` : ''}{m.time} Uhr
              </span>
            </div>

            <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-2">
              <div className="flex flex-col items-center gap-2 min-w-0">
                <Crest id={m.homeTeamId} size="xl" clickable />
                <span className="w-full font-display font-black uppercase tracking-tight text-white text-center text-[13px] leading-tight truncate">{teamName(m.homeTeamId)}</span>
              </div>
              <div className="mt-4">
                <span className="grid place-items-center w-9 h-9 rounded-full bg-tipp/15 border border-tipp/40 font-display font-black text-tipp text-sm">VS</span>
              </div>
              <div className="flex flex-col items-center gap-2 min-w-0">
                <Crest id={m.awayTeamId} size="xl" clickable />
                <span className="w-full font-display font-black uppercase tracking-tight text-white text-center text-[13px] leading-tight truncate">{teamName(m.awayTeamId)}</span>
              </div>
            </div>

            <div className="mt-4 flex items-center justify-center gap-3">
              {mine ? (
                <motion.div
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 17 }}
                  className="flex items-center gap-3"
                >
                  <LedTile value={mine.home} />
                  <span className="font-display font-black text-2xl text-hl-dim">:</span>
                  <LedTile value={mine.away} />
                </motion.div>
              ) : canTip ? (
                <>
                  <ScoreStepper value={d.home} onChange={(delta) => setDraft(m.id, 'home', delta)} />
                  <span className="font-display font-black text-2xl text-hl-dim">:</span>
                  <ScoreStepper value={d.away} onChange={(delta) => setDraft(m.id, 'away', delta)} />
                </>
              ) : (
                <div className="flex items-center gap-3">
                  <LedTile value="–" muted />
                  <span className="font-display font-black text-2xl text-hl-dim">:</span>
                  <LedTile value="–" muted />
                </div>
              )}
            </div>

            <div className="mt-4">
              {mine ? (
                <div className="flex items-center justify-center gap-1.5 text-[12px] font-sans font-bold uppercase tracking-wider text-tipp">
                  <Lock className="w-3.5 h-3.5" /> Dein Tipp ist abgegeben
                </div>
              ) : !identity ? (
                <div className="text-center text-[12px] font-sans text-hl-mute">Melde dich oben an, um zu tippen.</div>
              ) : !tipsOpen ? (
                <div className="flex items-center justify-center gap-1.5 text-[12px] font-sans font-bold uppercase tracking-wider text-hl-dim">
                  <Lock className="w-3.5 h-3.5" /> Tippschluss (19:00 Uhr)
                </div>
              ) : (
                <button
                  onClick={() => send(m)}
                  disabled={busy === m.id}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-sans font-black uppercase tracking-wider text-white cursor-pointer active:scale-[0.98] transition-transform disabled:opacity-60 shadow-lg"
                  style={{ background: 'linear-gradient(120deg, #F1541F, #FF7A1A 55%, #FFB020)', boxShadow: '0 10px 26px -12px rgba(255,122,26,.7)' }}
                >
                  {busy === m.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Flame className="w-4 h-4" /> Tipp abgeben</>}
                </button>
              )}
              {err && <p className="text-center text-xs font-sans text-rose-300 mt-2">{err}</p>}
            </div>
          </motion.div>
        );
      })}
    </div>
  );

  return (
    <div className="min-h-screen bg-brand-dark text-hl-text font-sans relative overflow-x-hidden">
      {/* Kopf – Arcade/Scoreboard-Look */}
      <div className="relative overflow-hidden border-b border-white/8" style={{ background: 'radial-gradient(130% 100% at 50% 0%, rgba(255,122,26,.22), transparent 62%)' }}>
        {/* Dezentes Scoreboard-Punktmuster */}
        <div
          className="absolute inset-0 opacity-[0.14] pointer-events-none"
          style={{ backgroundImage: 'radial-gradient(rgba(255,193,46,.55) 1px, transparent 1px)', backgroundSize: '15px 15px' }}
          aria-hidden="true"
        />
        <div className="relative max-w-2xl mx-auto px-4 sm:px-6 pt-5 pb-8">
          <button
            onClick={() => onNavigate('/')}
            className="inline-flex items-center gap-1.5 text-xs font-sans font-bold uppercase tracking-wider text-hl-dim hover:text-white transition-colors cursor-pointer mb-5"
          >
            <ArrowLeft className="w-4 h-4" /> Startseite
          </button>
          <div className="flex items-center gap-3">
            <span
              className="w-12 h-12 rounded-2xl grid place-items-center shrink-0 text-white shadow-lg"
              style={{ background: 'linear-gradient(135deg, #F1541F, #FFB020)', boxShadow: '0 8px 22px -8px rgba(255,122,26,.7)' }}
            >
              <Target className="w-6 h-6" />
            </span>
            <div>
              <div className="text-[11px] font-sans font-black uppercase tracking-[0.22em] text-tipp">{seasonLabel || 'Hero League'}</div>
              <h1 className="font-display font-black text-4xl sm:text-5xl uppercase tracking-tight text-white leading-[0.9]">Tippspiel</h1>
            </div>
          </div>
          <p className="text-sm text-hl-soft font-sans font-semibold mt-3">
            Zeig, dass du's besser weißt – tippe die Ergebnisse &amp; klettere in der Rangliste. 🏆
          </p>
          {/* Punkte-Regeln als Chips */}
          <div className="flex flex-wrap gap-2 mt-4">
            {[
              { val: TIP_POINTS.exact, label: 'Volltreffer' },
              { val: TIP_POINTS.diff, label: 'Tordifferenz' },
              { val: TIP_POINTS.tendency, label: 'Sieger' },
            ].map((r) => (
              <span key={r.label} className="inline-flex items-center gap-1.5 rounded-full bg-tipp/12 border border-tipp/30 pl-1 pr-3 py-1">
                <span className="w-5 h-5 rounded-full grid place-items-center bg-tipp text-white font-display font-black text-[11px] tabular-nums">{r.val}</span>
                <span className="text-[11px] font-sans font-bold uppercase tracking-wider text-hl-soft">{r.label}</span>
              </span>
            ))}
          </div>
          <p className="text-[12px] text-hl-mute font-sans mt-3">⏱️ Tippschluss: <span className="text-white font-bold">19:00 Uhr</span> am Spieltag · pro Spiel nur ein Tipp</p>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6 space-y-8">
        {/* Anmeldung / angemeldeter Status */}
        {identity ? (
          <div className="hl-card rounded-2xl border border-white/10 p-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="w-9 h-9 rounded-xl grid place-items-center bg-tipp/18 text-tipp shrink-0">
                <ShieldCheck className="w-5 h-5" />
              </span>
              <div className="min-w-0">
                <div className="text-sm font-sans font-bold text-white truncate">Angemeldet als {identity.displayName}</div>
                {myTotalPoints > 0 && <div className="text-[12px] text-hl-mute font-sans">Deine Punkte: <span className="text-tipp font-bold">{myTotalPoints}</span></div>}
              </div>
            </div>
            <button
              onClick={logout}
              className="shrink-0 inline-flex items-center gap-1.5 rounded-xl hl-surf-soft border border-white/10 px-3 py-2 text-[11px] font-sans font-bold uppercase tracking-wider text-hl-mute hover:text-white cursor-pointer active:scale-95 transition-transform"
            >
              <LogOut className="w-3.5 h-3.5" /> Abmelden
            </button>
          </div>
        ) : (
          <TippRegister onVerified={(id) => { setIdentity(id); load(); }} />
        )}

        {/* Weitere Menüs – erscheinen, sobald Ergebnisse ausgewertet sind */}
        {hasResults && (
          <SegmentedControl
            groupId="tipp-view"
            fill
            accent="#FF7A1A"
            value={activeView}
            onChange={(v) => setView(v)}
            options={viewTabs}
          />
        )}

        {/* Aktueller Spieltag-Abend (+ Zusatzfragen am 1. Spieltag) */}
        {activeView === 'tippen' && (
        <section className="space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-10 text-hl-mute"><Loader2 className="w-5 h-5 animate-spin" /></div>
          ) : activeMatchday === null ? (
            <div className="hl-card rounded-2xl border border-white/10 text-center py-10 text-hl-mute font-sans text-sm">
              Kein kommender Spieltag zum Tippen. Der nächste Abend erscheint hier automatisch. 👇
            </div>
          ) : showBonus ? (
            <>
              <Collapsible
                icon={<Star className="w-5 h-5" />}
                title="Zusatzfragen"
                subtitle={`Einmalig für die ganze Saison · bis zu ${BONUS_MAX} Punkte`}
                defaultOpen={!bonusSubmitted}
                badge={
                  bonusSubmitted ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-tipp/15 border border-tipp/35 px-2.5 py-1 text-[10px] font-sans font-black uppercase tracking-wider text-tipp"><Check className="w-3 h-3" /> Abgegeben</span>
                  ) : bonusOpen ? (
                    <span className="rounded-full bg-tipp text-white px-2.5 py-1 text-[10px] font-sans font-black uppercase tracking-wider animate-pulse">Zusatzpunkte!</span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-white/5 border border-white/10 px-2.5 py-1 text-[10px] font-sans font-bold uppercase tracking-wider text-hl-dim"><Lock className="w-3 h-3" /> Zu</span>
                  )
                }
              >
                <BonusPanel
                  bonus={bonus}
                  teams={teamsSorted}
                  teamName={teamName}
                  identity={!!identity}
                  open={bonusOpen}
                  onSubmitted={(mine) => { setBonus((b) => (b ? { ...b, mine, submittedAt: new Date().toISOString() } : b)); loadBonus(); }}
                  submitFn={(answers) => submitBonus(getIdentity()!, answers)}
                />
              </Collapsible>

              <Collapsible
                icon={<CalendarDays className="w-5 h-5" />}
                title={`Spieltag ${activeMatchday}`}
                subtitle="Tippe die Ergebnisse des Abends"
                defaultOpen
                badge={<Countdown open={tipsOpen} remainingMs={remainingMs} date={activeDate} />}
              >
                {matchesList}
              </Collapsible>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
                <h2 className="flex items-center gap-2 font-display font-black text-lg uppercase tracking-tight text-white">
                  <CalendarDays className="w-5 h-5 text-tipp" /> Spieltag {activeMatchday}
                </h2>
                <Countdown open={tipsOpen} remainingMs={remainingMs} date={activeDate} />
              </div>
              {matchesList}
            </>
          )}
        </section>
        )}

        {/* Deine ausgewerteten Tipps */}
        {activeView === 'meine' && myFinished.length > 0 && (
          <section>
            <h2 className="font-display font-black text-lg uppercase tracking-tight text-white mb-3">Deine Auswertung</h2>
            <div className="space-y-2">
              {myFinished.map((m) => {
                const mine = myTips.get(m.id)!;
                const pts = scoreTip(mine, m);
                const isExact = mine.home === m.homeScore && mine.away === m.awayScore;
                const color = pts === 0 ? '#FF5442' : pts >= TIP_POINTS.exact ? '#43E5A0' : pts >= TIP_POINTS.diff ? '#E9C46A' : '#8FB7AE';
                const tier = isExact ? 'Volltreffer' : pts >= TIP_POINTS.diff ? 'Tordifferenz' : pts >= TIP_POINTS.tendency ? 'Sieger' : 'Daneben';
                return (
                  <div key={m.id} className="hl-card rounded-2xl border border-white/10 p-3 flex items-center gap-3">
                    <div className="flex-1 min-w-0 flex items-center gap-2">
                      <Crest id={m.homeTeamId} size="sm" />
                      <span className="text-sm font-sans font-bold text-white truncate">{teamName(m.homeTeamId)}</span>
                      <span className="font-display font-black tabular-nums text-white">{m.homeScore}:{m.awayScore}</span>
                      <span className="text-sm font-sans font-bold text-white truncate">{teamName(m.awayTeamId)}</span>
                      <Crest id={m.awayTeamId} size="sm" />
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-[11px] text-hl-mute font-sans">Tipp {mine.home}:{mine.away}</div>
                      <div className="font-display font-black tabular-nums text-sm" style={{ color }}>+{pts}</div>
                      <div className="text-[10px] font-sans font-bold uppercase tracking-wider" style={{ color }}>{tier}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Rangliste (Top 10) */}
        {activeView === 'rangliste' && board.length > 0 && (
          <Reveal>
            <section>
              <h2 className="flex items-center gap-2 font-display font-black text-lg uppercase tracking-tight text-white mb-3">
                <Trophy className="w-5 h-5 text-hl-gold" /> Rangliste · Top 10
              </h2>

              {/* DU: eigener Platz + Punkte, immer sichtbar (auch außerhalb Top 10) */}
              {identity && (
                <div
                  className="mb-3 rounded-2xl border border-tipp/40 p-4 flex items-center justify-between gap-3"
                  style={{ background: 'linear-gradient(100deg, rgba(255,122,26,.20), rgba(255,176,32,.06))' }}
                >
                  <div className="min-w-0">
                    <div className="text-[11px] font-sans font-black uppercase tracking-wider text-tipp">
                      Du{myRank ? ` · Platz ${myRank}` : ''}
                    </div>
                    <div className="text-sm font-sans font-bold text-white truncate">{identity.displayName}</div>
                    {myRow && myRow.exact > 0 && (
                      <div className="text-[11px] font-sans text-hl-mute mt-0.5">{myRow.exact}× Volltreffer</div>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-display font-black tabular-nums text-3xl text-tipp leading-none">{myTotalPoints}</div>
                    <div className="text-[10px] font-sans font-bold uppercase tracking-wider text-hl-mute mt-1">Punkte</div>
                  </div>
                </div>
              )}

              <div className="hl-card rounded-2xl border border-white/10 overflow-hidden">
                {board.slice(0, 10).map((r, i) => (
                  <div
                    key={r.voterId}
                    className={`flex items-center gap-3 px-4 py-2.5 border-b border-white/5 last:border-b-0 ${r.voterId === voterId ? 'bg-tipp/10' : ''}`}
                  >
                    <span
                      className="w-6 text-center font-display font-black tabular-nums text-hl-mute"
                      style={{ color: i === 0 ? '#F4D588' : i === 1 ? '#D6DEE0' : i === 2 ? '#E0A46A' : undefined }}
                    >
                      {i + 1}
                    </span>
                    <span className="flex-1 min-w-0 truncate font-sans font-semibold text-white">
                      {r.name}{r.voterId === voterId ? ' (Du)' : ''}
                    </span>
                    <span className="w-12 text-right font-display font-black tabular-nums text-tipp shrink-0">{r.points}</span>
                  </div>
                ))}
              </div>
            </section>
          </Reveal>
        )}

        <div className="h-8" />
      </div>
    </div>
  );
}

function fmtRemaining(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  if (d > 0) return `${d} Tag${d > 1 ? 'e' : ''} ${h} Std`;
  return `${pad(h)}:${pad(m)}:${pad(sec)}`;
}

// Countdown-Pille: läuft live bis 19:00 Uhr am Spieltag runter; danach „geschlossen".
function Countdown({ open, remainingMs, date }: { open: boolean; remainingMs: number; date: string }) {
  if (!open) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-white/5 border border-white/10 px-3 py-1.5 text-[11px] font-sans font-bold uppercase tracking-wider text-hl-dim">
        <Lock className="w-3.5 h-3.5" /> Tippschluss vorbei
      </span>
    );
  }
  const soon = remainingMs < 3600_000; // letzte Stunde: dringlich (rot)
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-sans font-bold tabular-nums border ${
        soon ? 'bg-rose-500/15 border-rose-500/40 text-rose-300' : 'bg-tipp/12 border-tipp/35 text-tipp'
      }`}
      title={`Tippschluss ${date} · 19:00 Uhr`}
    >
      <Clock className={`w-3.5 h-3.5 ${soon ? 'animate-pulse' : ''}`} /> Noch {fmtRemaining(remainingMs)}
    </span>
  );
}

// Anzeigetafel-Kachel: großes LED-artiges Zahlenfeld (für abgegebene Tipps &
// gesperrte Spiele).
function LedTile({ value, muted }: { value: React.ReactNode; muted?: boolean }) {
  return (
    <div
      className={`w-16 h-16 rounded-2xl grid place-items-center border ${muted ? 'bg-black/25 border-white/10' : 'bg-black/50 border-tipp/45'}`}
      style={muted ? undefined : { boxShadow: 'inset 0 0 18px rgba(255,122,26,.18)' }}
    >
      <span className={`font-display font-black tabular-nums text-4xl leading-none ${muted ? 'text-hl-dim' : 'text-tipp'}`}>{value}</span>
    </div>
  );
}

// Ergebnis-Eingabe im Scoreboard-Stil: LED-Kachel mit chunky +/- darüber/darunter.
function ScoreStepper({ value, onChange }: { value: number; onChange: (delta: number) => void }) {
  const btn = 'w-11 h-8 rounded-lg bg-tipp/15 border border-tipp/35 text-tipp grid place-items-center cursor-pointer active:scale-90 transition-all hover:bg-tipp/25';
  return (
    <div className="flex flex-col items-center gap-1.5">
      <button onClick={() => onChange(1)} aria-label="Tor mehr" className={btn}><Plus className="w-4 h-4" /></button>
      <div className="w-16 h-16 rounded-2xl grid place-items-center bg-black/50 border border-tipp/45" style={{ boxShadow: 'inset 0 0 18px rgba(255,122,26,.18)' }}>
        <span className="font-display font-black tabular-nums text-4xl leading-none text-tipp">{value}</span>
      </div>
      <button onClick={() => onChange(-1)} aria-label="Tor weniger" className={btn}><Minus className="w-4 h-4" /></button>
    </div>
  );
}

// Aufklappbarer Block (für „Zusatzfragen" & „Spieltag 1").
function Collapsible({
  icon, title, subtitle, badge, defaultOpen, children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  badge?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(!!defaultOpen);
  return (
    <div className="rounded-2xl border border-white/10 overflow-hidden" style={{ background: 'var(--color-brand-deep)' }}>
      <button onClick={() => setOpen((o) => !o)} className="w-full flex items-center gap-3 p-4 text-left cursor-pointer">
        <span className="w-10 h-10 rounded-xl grid place-items-center bg-tipp/15 text-tipp shrink-0">{icon}</span>
        <span className="flex-1 min-w-0">
          <span className="block font-display font-black uppercase tracking-tight text-white text-lg leading-none">{title}</span>
          {subtitle && <span className="block text-[11px] font-sans text-hl-mute mt-1 truncate">{subtitle}</span>}
        </span>
        {badge}
        <ChevronDown className={`w-5 h-5 text-hl-dim shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.28, ease: [0.32, 0.72, 0, 1] }}
            style={{ overflow: 'hidden' }}
          >
            <div className="px-4 pb-4">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Zusatzfragen-Panel: Eingabe (einmalig) bzw. Anzeige der abgegebenen Antworten
// samt Auswertung, sobald der Admin die Lösung gesetzt hat.
function BonusPanel({
  bonus, teams, teamName, identity, open, onSubmitted, submitFn,
}: {
  bonus: BonusState | null;
  teams: Team[];
  teamName: (id: string) => string;
  identity: boolean;
  open: boolean;
  onSubmitted: (mine: BonusAnswers) => void;
  submitFn: (answers: BonusAnswers) => Promise<{ ok: boolean; submittedAt: string }>;
}) {
  const [draft, setDraft] = useState<BonusAnswers>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const mine = bonus?.mine ?? null;
  const solution = bonus?.solution ?? {};
  const solved = Object.keys(solution).length > 0;

  if (!identity) {
    return <p className="text-[13px] text-hl-mute font-sans">Melde dich oben an, um die Zusatzfragen für Zusatzpunkte zu tippen.</p>;
  }

  if (mine) {
    let earned = 0;
    return (
      <div className="space-y-2">
        {BONUS_QUESTIONS.map((q) => {
          const pick = mine[q.id];
          const correct = solution[q.id];
          const hit = solved && !!correct && pick === correct;
          if (hit) earned += q.points;
          return (
            <div key={q.id} className="flex items-center gap-2 rounded-xl bg-black/20 border border-white/10 px-3 py-2">
              <span className="flex-1 min-w-0">
                <span className="block text-[12px] font-sans text-hl-mute leading-tight">{q.label}</span>
                <span className="block text-sm font-sans font-bold text-white truncate">{pick ? teamName(pick) : '—'}</span>
              </span>
              {solved ? (
                hit
                  ? <span className="inline-flex items-center gap-1 text-tipp font-display font-black text-sm shrink-0"><Check className="w-4 h-4" />+{q.points}</span>
                  : <X className="w-4 h-4 text-hl-dim shrink-0" />
              ) : (
                <span className="text-[10px] font-sans font-black text-tipp shrink-0">{q.points} Pkt</span>
              )}
            </div>
          );
        })}
        <div className="flex items-center justify-between pt-1">
          <span className="text-[12px] text-hl-mute font-sans">{solved ? 'Erreichte Zusatzpunkte' : 'Abgegeben – Auswertung am Saisonende'}</span>
          {solved && <span className="font-display font-black text-tipp text-xl">+{earned}</span>}
        </div>
      </div>
    );
  }

  if (!open) {
    return <p className="text-[13px] text-hl-mute font-sans">Die Zusatzfragen sind geschlossen (Tippschluss war zum 1. Spieltag um 19:00 Uhr).</p>;
  }

  const submit = async () => {
    setErr('');
    if (Object.values(draft).filter(Boolean).length === 0) { setErr('Bitte mindestens eine Frage beantworten.'); return; }
    setBusy(true);
    try {
      await submitFn(draft);
      onSubmitted(draft);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Fehler');
    } finally {
      setBusy(false);
    }
  };

  const selectCls = 'w-full bg-brand-dark border border-white/10 rounded-lg px-3 py-2 text-sm text-white font-sans focus:outline-none focus:border-tipp cursor-pointer';
  return (
    <div className="space-y-3">
      <p className="text-[12px] text-hl-mute font-sans">Einmalig für die ganze Saison – danach gesperrt. Die Punkte gibt's am Saisonende.</p>
      {BONUS_QUESTIONS.map((q) => (
        <div key={q.id}>
          <div className="flex items-center justify-between gap-2 mb-1">
            <span className="text-[12px] font-sans font-semibold text-hl-soft">{q.label}</span>
            <span className="text-[10px] font-sans font-black text-tipp shrink-0">{q.points} Pkt</span>
          </div>
          <select value={draft[q.id] ?? ''} onChange={(e) => setDraft((dd) => ({ ...dd, [q.id]: e.target.value }))} className={selectCls}>
            <option value="">– Team wählen –</option>
            {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
      ))}
      {err && <p className="text-xs text-rose-300 font-sans">{err}</p>}
      <button
        onClick={submit}
        disabled={busy}
        className="w-full inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-sans font-black uppercase tracking-wider text-white cursor-pointer active:scale-[0.98] transition-transform disabled:opacity-60 shadow-lg"
        style={{ background: 'linear-gradient(120deg, #F1541F, #FF7A1A 55%, #FFB020)', boxShadow: '0 10px 26px -12px rgba(255,122,26,.7)' }}
      >
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Star className="w-4 h-4" />} Zusatztipps abschicken
      </button>
      <p className="text-[11px] text-hl-mute font-sans text-center">Achtung: nur einmal abgebbar, danach nicht mehr änderbar.</p>
    </div>
  );
}
