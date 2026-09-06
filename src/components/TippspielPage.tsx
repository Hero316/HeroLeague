import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { ArrowLeft, Lock, Trophy, Minus, Plus, Target, Loader2, LogOut, ShieldCheck, Clock, CalendarDays, ClipboardCheck, Flame } from 'lucide-react';
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

  const Crest = ({ id, size = 'md' as const }: { id: string; size?: 'sm' | 'md' | 'lg' | 'xl' }) => {
    const t = teamById.get(id);
    return <TeamCrest name={t?.name || '?'} shortName={t?.shortName || ''} color={t?.logoColor || '#22DFC9'} logoUrl={t?.logoUrl} size={size} />;
  };
  const teamName = (id: string) => teamById.get(id)?.shortName || teamById.get(id)?.name || '?';

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
                  <CalendarDays className="w-5 h-5 text-tipp" /> Spieltag {activeMatchday}
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
                      className="relative overflow-hidden rounded-2xl border border-tipp/20 p-4"
                      style={{ background: 'linear-gradient(180deg, rgba(255,122,26,.06), rgba(10,20,21,0) 55%), var(--color-brand-deep)' }}
                    >
                      {/* Anstoß-Chip */}
                      <div className="flex items-center justify-center mb-3">
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-white/5 border border-white/10 px-3 py-1 text-[10px] font-sans font-bold uppercase tracking-wider text-hl-dim">
                          <Clock className="w-3 h-3" /> {typeof m.field === 'number' ? `Feld ${m.field} · ` : ''}{m.time} Uhr
                        </span>
                      </div>

                      {/* Duell: Wappen + VS */}
                      <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-2">
                        <div className="flex flex-col items-center gap-2 min-w-0">
                          <Crest id={m.homeTeamId} size="xl" />
                          <span className="font-display font-black uppercase tracking-tight text-white text-center text-[13px] leading-tight line-clamp-2">{teamName(m.homeTeamId)}</span>
                        </div>
                        <div className="mt-2.5">
                          <span className="grid place-items-center w-9 h-9 rounded-full bg-tipp/15 border border-tipp/40 font-display font-black text-tipp text-sm">VS</span>
                        </div>
                        <div className="flex flex-col items-center gap-2 min-w-0">
                          <Crest id={m.awayTeamId} size="xl" />
                          <span className="font-display font-black uppercase tracking-tight text-white text-center text-[13px] leading-tight line-clamp-2">{teamName(m.awayTeamId)}</span>
                        </div>
                      </div>

                      {/* Anzeigetafel: Ergebnis-Eingabe */}
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

                      {/* Aktion / Status */}
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
