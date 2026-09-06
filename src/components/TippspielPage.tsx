import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { ArrowLeft, Lock, Check, Trophy, Minus, Plus, Target, Loader2 } from 'lucide-react';
import type { Match, Team, Tip } from '../types';
import { fetchTips, submitTip, getVoterId, getVoterName, setVoterName, scoreTip, leaderboard } from '../lib/tips';
import { TeamCrest } from './ui';
import { Reveal } from './anim';

interface Props {
  matches: Match[]; // Spiele der aktuellen Saison
  teams: Team[];
  seasonLabel?: string;
  onNavigate: (path: string) => void;
}

const EASE = [0.22, 1, 0.36, 1] as const;

export default function TippspielPage({ matches, teams, seasonLabel, onNavigate }: Props) {
  const voterId = getVoterId();
  const teamById = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams]);

  const [tips, setTips] = useState<Tip[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState(getVoterName());
  const [nameSaved, setNameSaved] = useState(Boolean(getVoterName()));
  const [drafts, setDrafts] = useState<Record<string, { home: number; away: number }>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const load = () => {
    fetchTips()
      .then(setTips)
      .catch(() => {})
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const myTips = useMemo(() => {
    const map = new Map<string, Tip>();
    tips.forEach((t) => { if (t.voterId === voterId) map.set(t.matchId, t); });
    return map;
  }, [tips, voterId]);

  const tipCountByMatch = useMemo(() => {
    const m = new Map<string, number>();
    tips.forEach((t) => m.set(t.matchId, (m.get(t.matchId) ?? 0) + 1));
    return m;
  }, [tips]);

  const upcoming = useMemo(
    () => matches.filter((m) => m.status === 'geplant').sort((a, b) => a.matchday - b.matchday || `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`)),
    [matches]
  );
  const myFinished = useMemo(
    () =>
      matches
        .filter((m) => m.status === 'beendet' && myTips.has(m.id))
        .sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`)),
    [matches, myTips]
  );
  const board = useMemo(() => leaderboard(tips, matches), [tips, matches]);
  const myTotalPoints = board.find((r) => r.voterId === voterId)?.points ?? 0;

  const draft = (id: string) => drafts[id] ?? { home: 0, away: 0 };
  const setDraft = (id: string, side: 'home' | 'away', delta: number) =>
    setDrafts((d) => {
      const cur = d[id] ?? { home: 0, away: 0 };
      const next = Math.max(0, Math.min(99, cur[side] + delta));
      return { ...d, [id]: { ...cur, [side]: next } };
    });

  const saveName = () => {
    const n = name.trim();
    if (n.length < 2) return;
    setVoterName(n);
    setName(n);
    setNameSaved(true);
  };

  const send = async (m: Match) => {
    if (name.trim().length < 2) { setNameSaved(false); return; }
    const d = draft(m.id);
    setBusy(m.id);
    setErrors((e) => ({ ...e, [m.id]: '' }));
    try {
      const tip = await submitTip(m.id, d.home, d.away, name.trim());
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
            Volltreffer <span className="text-brand-accent-light font-bold">3 Punkte</span>, richtige Tendenz{' '}
            <span className="text-brand-accent-light font-bold">1 Punkt</span>. Pro Spiel nur ein Tipp – danach gesperrt.
          </p>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6 space-y-8">
        {/* Name */}
        <div className="hl-card rounded-2xl border border-white/10 p-4">
          <label className="block text-[11px] font-sans font-bold uppercase tracking-wider text-hl-dim mb-2">Dein Anzeigename (für die Rangliste)</label>
          <div className="flex gap-2">
            <input
              value={name}
              onChange={(e) => { setName(e.target.value); setNameSaved(false); }}
              maxLength={24}
              placeholder="z. B. Max"
              className="flex-1 min-w-0 bg-brand-dark border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white font-sans focus:outline-none focus:border-brand-accent-light"
            />
            <button
              onClick={saveName}
              disabled={name.trim().length < 2}
              className="shrink-0 rounded-xl bg-brand-accent-light/15 border border-brand-accent-light/35 px-4 text-sm font-sans font-bold uppercase tracking-wider text-brand-accent-light cursor-pointer disabled:opacity-40 active:scale-95 transition-transform"
            >
              {nameSaved ? <Check className="w-4 h-4" /> : 'Speichern'}
            </button>
          </div>
          {myTotalPoints > 0 && (
            <p className="text-[12px] text-hl-mute font-sans mt-2">Deine Punkte bisher: <span className="text-brand-accent-light font-bold">{myTotalPoints}</span></p>
          )}
        </div>

        {/* Kommende Spiele */}
        <section>
          <h2 className="font-display font-black text-lg uppercase tracking-tight text-white mb-3">Kommende Spiele</h2>
          {loading ? (
            <div className="flex items-center justify-center py-10 text-hl-mute"><Loader2 className="w-5 h-5 animate-spin" /></div>
          ) : upcoming.length === 0 ? (
            <div className="hl-card rounded-2xl border border-white/10 text-center py-10 text-hl-mute font-sans text-sm">Aktuell keine offenen Spiele zum Tippen.</div>
          ) : (
            <div className="space-y-3">
              {upcoming.map((m, i) => {
                const mine = myTips.get(m.id);
                const d = draft(m.id);
                const err = errors[m.id];
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
                        Spieltag {m.matchday}{typeof m.field === 'number' ? ` · Feld ${m.field}` : ''}
                      </span>
                      {typeof tipCountByMatch.get(m.id) === 'number' && (
                        <span className="text-[10px] font-sans font-semibold text-hl-mute">{tipCountByMatch.get(m.id)} Tipps</span>
                      )}
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
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <Stepper value={d.home} onChange={(delta) => setDraft(m.id, 'home', delta)} />
                          <span className="text-hl-dim font-display font-black">:</span>
                          <Stepper value={d.away} onChange={(delta) => setDraft(m.id, 'away', delta)} />
                        </div>
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
          )}
        </section>

        {/* Meine ausgewerteten Tipps */}
        {myFinished.length > 0 && (
          <section>
            <h2 className="font-display font-black text-lg uppercase tracking-tight text-white mb-3">Deine Auswertung</h2>
            <div className="space-y-2">
              {myFinished.map((m) => {
                const mine = myTips.get(m.id)!;
                const pts = scoreTip(mine, m);
                const color = pts === 3 ? '#43E5A0' : pts === 1 ? '#E9C46A' : '#FF5442';
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
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Rangliste */}
        {board.length > 0 && (
          <Reveal>
            <section>
              <h2 className="flex items-center gap-2 font-display font-black text-lg uppercase tracking-tight text-white mb-3">
                <Trophy className="w-5 h-5 text-hl-gold" /> Rangliste
              </h2>
              <div className="hl-card rounded-2xl border border-white/10 overflow-hidden">
                {board.slice(0, 20).map((r, i) => (
                  <div
                    key={r.voterId}
                    className={`flex items-center gap-3 px-4 py-2.5 border-b border-white/5 last:border-b-0 ${r.voterId === voterId ? 'bg-brand-accent-light/10' : ''}`}
                  >
                    <span className="w-6 text-center font-display font-black tabular-nums text-hl-mute">{i + 1}</span>
                    <span className="flex-1 min-w-0 truncate font-sans font-semibold text-white">
                      {r.name}{r.voterId === voterId ? ' (Du)' : ''}
                    </span>
                    <span className="text-[11px] font-sans text-hl-mute shrink-0">{r.exact}× exakt</span>
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
