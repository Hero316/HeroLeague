import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { ArrowLeft, Lock, Trophy, Minus, Plus, Target, Loader2, LogOut, ShieldCheck, Clock, CalendarDays, ClipboardCheck } from 'lucide-react';
import type { Match, Team, Tip } from '../types';
import { fetchTips, submitTip, getIdentity, clearIdentity, scoreTip, leaderboard, tipDeadline, berlinToday, TIP_POINTS, type TippIdentity } from '../lib/tips';
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

  const load = () => {
    fetchTips()
      .then(setTips)
      .catch(() => {})
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

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
  const board = useMemo(() => leaderboard(tips, matches), [tips, matches]);
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

  const Crest = ({ id, size = 'md' as const }: { id: string; size?: 'sm' | 'md' | 'lg' }) => {
    const t = teamById.get(id);
    return <TeamCrest name={t?.name || '?'} shortName={t?.shortName || ''} color={t?.logoColor || '#22DFC9'} logoUrl={t?.logoUrl} size={size} />;
  };
  const teamName = (id: string) => teamById.get(id)?.shortName || teamById.get(id)?.name || '?';

  return (
    <div className="min-h-screen bg-brand-dark text-hl-text font-sans relative overflow-x-hidden">
      {/* Kopf */}
      <div className="relative overflow-hidden border-b border-white/8" style={{ background: 'radial-gradient(120% 100% at 50% 0%, rgba(34,223,201,.14), transparent 60%)' }}>
        <div className="max-w-2xl mx-auto px-4 sm:px-6 pt-5 pb-8">
          <button
            onClick={() => onNavigate('/')}
            className="inline-flex items-center gap-1.5 text-xs font-sans font-bold uppercase tracking-wider text-hl-dim hover:text-white transition-colors cursor-pointer mb-5"
          >
            <ArrowLeft className="w-4 h-4" /> Startseite
          </button>
          <div className="flex items-center gap-2.5">
            <span className="w-11 h-11 rounded-2xl grid place-items-center bg-brand-accent-light/18 text-brand-accent-light shrink-0">
              <Target className="w-6 h-6" />
            </span>
            <div>
              <h1 className="font-display font-black text-3xl sm:text-4xl uppercase tracking-tight text-white leading-none">Tippspiel</h1>
              <p className="text-sm text-hl-mute font-sans mt-1">{seasonLabel || 'Hero League'} · tippe die Ergebnisse</p>
            </div>
          </div>
          <p className="text-[13px] text-hl-mute font-sans mt-4 leading-relaxed">
            Volltreffer <span className="text-brand-accent-light font-bold">{TIP_POINTS.exact} Punkte</span>, richtige
            Tordifferenz <span className="text-brand-accent-light font-bold">{TIP_POINTS.diff}</span>, richtiger Sieger{' '}
            <span className="text-brand-accent-light font-bold">{TIP_POINTS.tendency}</span>. Bei Unentschieden zählt nur
            das exakte Ergebnis. Pro Spiel nur ein Tipp. Tippschluss ist{' '}
            <span className="text-white font-bold">19:00 Uhr am Spieltag</span>.
          </p>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6 space-y-8">
        {/* Anmeldung / angemeldeter Status */}
        {identity ? (
          <div className="hl-card rounded-2xl border border-white/10 p-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="w-9 h-9 rounded-xl grid place-items-center bg-brand-accent-light/18 text-brand-accent-light shrink-0">
                <ShieldCheck className="w-5 h-5" />
              </span>
              <div className="min-w-0">
                <div className="text-sm font-sans font-bold text-white truncate">Angemeldet als {identity.displayName}</div>
                {myTotalPoints > 0 && <div className="text-[12px] text-hl-mute font-sans">Deine Punkte: <span className="text-brand-accent-light font-bold">{myTotalPoints}</span></div>}
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
            value={activeView}
            onChange={(v) => setView(v)}
            options={viewTabs}
          />
        )}

        {/* Aktueller Spieltag-Abend */}
        {activeView === 'tippen' && (
        <section>
          {loading ? (
            <div className="flex items-center justify-center py-10 text-hl-mute"><Loader2 className="w-5 h-5 animate-spin" /></div>
          ) : activeMatchday === null ? (
            <div className="hl-card rounded-2xl border border-white/10 text-center py-10 text-hl-mute font-sans text-sm">
              Kein kommender Spieltag zum Tippen. Der nächste Abend erscheint hier automatisch. 👇
            </div>
          ) : (
            <>
              {/* Spieltag-Kopf + Countdown */}
              <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
                <h2 className="flex items-center gap-2 font-display font-black text-lg uppercase tracking-tight text-white">
                  <CalendarDays className="w-5 h-5 text-brand-accent-light" /> Spieltag {activeMatchday}
                </h2>
                <Countdown open={tipsOpen} remainingMs={remainingMs} date={activeDate} />
              </div>

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
                      className="hl-card rounded-2xl border border-white/10 p-4"
                    >
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-[10px] font-sans font-bold uppercase tracking-wider text-hl-dim">
                          {typeof m.field === 'number' ? `Feld ${m.field} · ` : ''}{m.time} Uhr
                        </span>
                      </div>

                      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <Crest id={m.homeTeamId} />
                          <span className="font-display font-black uppercase tracking-tight text-white truncate">{teamName(m.homeTeamId)}</span>
                        </div>

                        {mine ? (
                          <div className="flex items-center gap-1.5 font-display font-black tabular-nums text-2xl text-brand-accent-light px-2">
                            {mine.home}<span className="text-hl-dim">:</span>{mine.away}
                          </div>
                        ) : canTip ? (
                          <div className="flex items-center gap-1.5">
                            <Stepper value={d.home} onChange={(delta) => setDraft(m.id, 'home', delta)} />
                            <span className="text-hl-dim font-display font-black">:</span>
                            <Stepper value={d.away} onChange={(delta) => setDraft(m.id, 'away', delta)} />
                          </div>
                        ) : (
                          <div className="font-display font-black tabular-nums text-2xl text-hl-dim px-2">–:–</div>
                        )}

                        <div className="flex items-center gap-2 min-w-0 justify-end">
                          <span className="font-display font-black uppercase tracking-tight text-white truncate text-right">{teamName(m.awayTeamId)}</span>
                          <Crest id={m.awayTeamId} />
                        </div>
                      </div>

                      <div className="mt-3">
                        {mine ? (
                          <div className="flex items-center justify-center gap-1.5 text-[12px] font-sans font-bold uppercase tracking-wider text-hl-mute">
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
                            className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-brand-accent-light px-4 py-2.5 text-sm font-sans font-black uppercase tracking-wider text-[#04120d] cursor-pointer active:scale-[0.98] transition-transform disabled:opacity-60"
                          >
                            {busy === m.id ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Tipp abgeben'}
                          </button>
                        )}
                        {err && <p className="text-center text-xs font-sans text-rose-300 mt-2">{err}</p>}
                      </div>
                    </motion.div>
                  );
                })}
              </div>
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
                  className="mb-3 rounded-2xl border border-brand-accent-light/40 p-4 flex items-center justify-between gap-3"
                  style={{ background: 'linear-gradient(100deg, rgba(34,223,201,.16), rgba(34,223,201,.04))' }}
                >
                  <div className="min-w-0">
                    <div className="text-[11px] font-sans font-black uppercase tracking-wider text-brand-accent-light">
                      Du{myRank ? ` · Platz ${myRank}` : ''}
                    </div>
                    <div className="text-sm font-sans font-bold text-white truncate">{identity.displayName}</div>
                    {myRow && myRow.exact > 0 && (
                      <div className="text-[11px] font-sans text-hl-mute mt-0.5">{myRow.exact}× Volltreffer</div>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-display font-black tabular-nums text-3xl text-brand-accent-light leading-none">{myTotalPoints}</div>
                    <div className="text-[10px] font-sans font-bold uppercase tracking-wider text-hl-mute mt-1">Punkte</div>
                  </div>
                </div>
              )}

              <div className="hl-card rounded-2xl border border-white/10 overflow-hidden">
                {board.slice(0, 10).map((r, i) => (
                  <div
                    key={r.voterId}
                    className={`flex items-center gap-3 px-4 py-2.5 border-b border-white/5 last:border-b-0 ${r.voterId === voterId ? 'bg-brand-accent-light/10' : ''}`}
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
                    <span className="w-12 text-right font-display font-black tabular-nums text-brand-accent-light shrink-0">{r.points}</span>
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
        soon ? 'bg-rose-500/15 border-rose-500/40 text-rose-300' : 'bg-brand-accent-light/12 border-brand-accent-light/35 text-brand-accent-light'
      }`}
      title={`Tippschluss ${date} · 19:00 Uhr`}
    >
      <Clock className={`w-3.5 h-3.5 ${soon ? 'animate-pulse' : ''}`} /> Noch {fmtRemaining(remainingMs)}
    </span>
  );
}

function Stepper({ value, onChange }: { value: number; onChange: (delta: number) => void }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <button
        onClick={() => onChange(1)}
        aria-label="mehr"
        className="w-7 h-7 rounded-lg hl-surf-soft border border-white/10 text-hl-soft hover:text-white flex items-center justify-center cursor-pointer active:scale-90 transition-transform"
      >
        <Plus className="w-3.5 h-3.5" />
      </button>
      <span className="font-display font-black tabular-nums text-2xl text-white w-8 text-center leading-none">{value}</span>
      <button
        onClick={() => onChange(-1)}
        aria-label="weniger"
        className="w-7 h-7 rounded-lg hl-surf-soft border border-white/10 text-hl-soft hover:text-white flex items-center justify-center cursor-pointer active:scale-90 transition-transform"
      >
        <Minus className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
