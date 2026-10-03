import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowLeft, ArrowRight, Check, X, Loader2, AlertCircle, Mail, KeyRound, Shield, Hand, LogOut, Lock, CheckCircle2 } from 'lucide-react';
import { TeamCrest } from './ui';
import {
  getManagerToken, setManagerToken, managerRequestCode, managerVerify, managerGetRoster, managerSaveRoster,
  type ManagerRoster,
} from '../lib/manager';

// ===========================================================================
// /kader – Team-Manager (Captains) melden ihren Abend-Kader selbst:
// wer ist dabei, wer fehlt, wer steht im Tor. Login per E-Mail-Code (die
// Adresse hinterlegt die Liga beim Team). Gespeichert wird in dieselbe
// Abend-Aufstellung wie im Schiedsrichtermodus → Schiri-App & Tracking-Center
// haben es sofort. Eigenständige Vollbild-Seite → Safe-Area oben/unten.
// ===========================================================================

const ACCENT = '#22DFC9';

function ErrorMsg({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 text-[13px] text-rose-200 bg-rose-500/10 border border-rose-500/20 rounded-xl px-3 py-2.5">
      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
      <span>{children}</span>
    </div>
  );
}

const inputCls =
  'w-full bg-white/[.06] border border-white/12 rounded-2xl px-4 py-4 text-[17px] text-white text-center placeholder-hl-faint focus:border-brand-accent-light focus:outline-none focus:ring-2 focus:ring-brand-accent-light/25';
const primaryCls =
  'w-full flex items-center justify-center gap-2 rounded-2xl py-4 text-[16px] font-display font-black uppercase tracking-wide text-[#04120d] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed active:scale-[.99]';

function fmtDay(date: string): string {
  const d = new Date(`${date}T12:00:00`);
  return Number.isNaN(d.getTime()) ? date : d.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });
}

export default function ManagerKader({ onNavigate }: { onNavigate: (path: string) => void }) {
  const [token, setToken] = useState(() => getManagerToken());
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const [data, setData] = useState<ManagerRoster | null>(null);
  const [present, setPresent] = useState<Set<string>>(new Set());
  const [keeper, setKeeper] = useState('');
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  // Kader laden, sobald angemeldet.
  useEffect(() => {
    if (!token) return;
    setBusy(true);
    setErr('');
    managerGetRoster(token)
      .then((d) => {
        setData(d);
        const all = d.team.players.map((p) => p.name);
        setPresent(new Set(d.saved ? d.saved.present : all));
        setKeeper(d.saved ? d.saved.goalkeeper ?? '' : d.team.players.find((p) => p.goalkeeper)?.name ?? '');
        setSavedAt(d.saved?.at ?? null);
        setDirty(false);
      })
      .catch((e) => {
        const msg = e instanceof Error ? e.message : '';
        if (/anmelden|Zugriff/i.test(msg)) {
          setManagerToken(null);
          setToken('');
        }
        setErr(msg || 'Kader konnte nicht geladen werden.');
      })
      .finally(() => setBusy(false));
  }, [token]);

  const requestCode = async () => {
    setBusy(true);
    setErr('');
    try {
      const r = await managerRequestCode(email.trim());
      if (r.devCode) setCode(r.devCode);
      setStep('code');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Fehler beim Senden.');
    } finally {
      setBusy(false);
    }
  };
  const verify = async () => {
    setBusy(true);
    setErr('');
    try {
      const r = await managerVerify(email.trim(), code.trim());
      setManagerToken(r.token);
      setToken(r.token);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Code ungültig.');
    } finally {
      setBusy(false);
    }
  };
  const logout = () => {
    setManagerToken(null);
    setToken('');
    setData(null);
    setStep('email');
    setCode('');
  };

  const toggle = (name: string) => {
    setPresent((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
        if (keeper === name) setKeeper('');
      } else next.add(name);
      return next;
    });
    setDirty(true);
  };
  const chooseKeeper = (name: string) => {
    setKeeper((k) => (k === name ? '' : name));
    setPresent((prev) => new Set(prev).add(name));
    setDirty(true);
  };

  const save = async () => {
    if (!data) return;
    setBusy(true);
    setErr('');
    try {
      const r = await managerSaveRoster(token, [...present], keeper);
      setSavedAt(r.at);
      setDirty(false);
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 3500);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Speichern fehlgeschlagen.');
    } finally {
      setBusy(false);
    }
  };

  const players = data?.team.players ?? [];
  const count = useMemo(() => players.filter((p) => present.has(p.name)).length, [players, present]);
  const firstDate = data?.matches[0]?.date;

  return (
    <div
      className="min-h-[100svh] w-full text-white flex flex-col"
      style={{
        background: `radial-gradient(120% 60% at 50% 0%, ${ACCENT}26, transparent 60%), #070b0c`,
        paddingTop: 'calc(env(safe-area-inset-top) + 1rem)',
      }}
    >
      <div className="w-full max-w-md mx-auto px-4 flex-1 flex flex-col">
        <div className="flex items-center justify-between">
          <button onClick={() => onNavigate('/')} className="inline-flex items-center gap-1.5 text-xs font-sans font-bold uppercase tracking-wider text-hl-mute hover:text-white cursor-pointer py-2">
            <ArrowLeft className="w-3.5 h-3.5" /> Website
          </button>
          <img src="/assets/hero-league-logo.png" alt="Hero League" className="h-8 w-auto" />
        </div>

        {!token ? (
          // ---------------- Login ----------------
          <div className="mt-8">
            <div className="text-center">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-brand-accent-light/40 bg-brand-accent-light/10 text-[10px] font-sans font-black uppercase tracking-[2.5px] text-brand-accent-light">
                <Shield className="w-3.5 h-3.5" /> Manager-Bereich
              </div>
              <h1 className="mt-4 font-display font-black uppercase leading-[.9] tracking-tight text-[40px]">
                Kader
                <br />
                <span className="text-brand-accent-light">melden</span>
              </h1>
              <p className="mt-3 text-[13px] text-hl-mute">Wer ist heute dabei, wer fehlt, wer steht im Tor? Melde mit deiner Manager-E-Mail an.</p>
            </div>
            <AnimatePresence mode="wait">
              {step === 'email' ? (
                <motion.div key="e" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="mt-6 flex flex-col gap-3">
                  <input value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && requestCode()} type="email" inputMode="email" autoComplete="email" autoCapitalize="none" placeholder="deine@mail.de" className={inputCls} />
                  {err && <ErrorMsg>{err}</ErrorMsg>}
                  <button disabled={busy || !email.trim()} onClick={requestCode} className={primaryCls} style={{ background: `linear-gradient(135deg, ${ACCENT}, #14A594)` }}>
                    {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Mail className="w-5 h-5" /> Code per Mail</>}
                  </button>
                </motion.div>
              ) : (
                <motion.div key="c" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="mt-6 flex flex-col gap-3">
                  <p className="text-center text-[13px] text-white/85">Wir haben dir einen 6-stelligen Code an <b>{email}</b> geschickt.</p>
                  <input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} onKeyDown={(e) => e.key === 'Enter' && verify()} inputMode="numeric" autoComplete="one-time-code" placeholder="123456" className={`${inputCls} tracking-[8px] font-display font-black text-2xl`} />
                  {err && <ErrorMsg>{err}</ErrorMsg>}
                  <button disabled={busy || code.length !== 6} onClick={verify} className={primaryCls} style={{ background: `linear-gradient(135deg, ${ACCENT}, #14A594)` }}>
                    {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <><KeyRound className="w-5 h-5" /> Anmelden</>}
                  </button>
                  <button onClick={() => { setStep('email'); setErr(''); }} className="text-[12px] font-bold text-hl-mute hover:text-white cursor-pointer py-1">Andere E-Mail</button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ) : !data ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3">
            {busy ? <Loader2 className="w-6 h-6 animate-spin text-hl-mute" /> : err && <ErrorMsg>{err}</ErrorMsg>}
          </div>
        ) : (
          // ---------------- Kader ----------------
          <div className="mt-5 pb-36">
            <div className="flex items-center gap-3">
              <TeamCrest name={data.team.name} shortName={data.team.shortName} color={data.team.logoColor} logoUrl={data.team.logoUrl} size="xl" />
              <div className="min-w-0 flex-1">
                <div className="text-[10px] font-sans font-black uppercase tracking-[2.5px] text-brand-accent-light">Kader melden</div>
                <div className="font-display font-black uppercase text-[26px] leading-none truncate">{data.team.name}</div>
              </div>
              <button onClick={logout} title="Abmelden" className="shrink-0 p-2 rounded-xl text-hl-mute hover:text-white cursor-pointer">
                <LogOut className="w-5 h-5" />
              </button>
            </div>

            {data.matchday === null ? (
              <div className="mt-6 rounded-2xl border border-white/10 bg-white/[.03] p-5 text-center">
                <Lock className="w-6 h-6 mx-auto text-hl-mute" />
                <div className="mt-2 font-display font-black uppercase text-[20px]">Kader-Meldung geschlossen</div>
                <p className="mt-1.5 text-[13px] text-hl-mute">Die Liga gibt die Meldung vor jedem Spieltag frei – dann kannst du hier deinen Kader eintragen. Du bleibst angemeldet.</p>
              </div>
            ) : (
              <>
                <div className="mt-4 rounded-2xl border border-white/10 bg-white/[.03] p-4">
                  <div className="font-display font-black uppercase text-[18px]">
                    {data.matchday}. Spieltag{firstDate ? <span className="text-hl-mute font-sans font-bold text-[13px] normal-case"> · {fmtDay(firstDate)}</span> : null}
                  </div>
                  <div className="mt-2 flex flex-col gap-1">
                    {data.matches.map((m) => (
                      <div key={m.id} className="flex items-center gap-2 text-[13px]">
                        <span className="w-12 shrink-0 font-bold tabular-nums text-white/85">{m.time}</span>
                        <span className="shrink-0 text-[10px] font-black uppercase tracking-wider text-hl-dim">Feld {m.field}</span>
                        <span className="min-w-0 truncate">gegen <b>{m.opponent}</b></span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 text-[11px] font-sans font-bold">
                    {savedAt ? (
                      <span className="text-emerald-300">✓ Gemeldet am {new Date(savedAt).toLocaleString('de-DE', { weekday: 'short', hour: '2-digit', minute: '2-digit' })} Uhr</span>
                    ) : (
                      <span className="text-amber-300">Noch nicht gemeldet</span>
                    )}
                  </div>
                </div>

                {data.locked && (
                  <div className="mt-3 flex items-start gap-2 text-[13px] text-amber-200 bg-amber-500/10 border border-amber-500/25 rounded-xl px-3 py-2.5">
                    <Lock className="w-4 h-4 shrink-0 mt-0.5" /> Der Spieltag läuft schon – die Meldung ist geschlossen. Änderungen bitte direkt beim Schiedsrichter.
                  </div>
                )}

                <div className="mt-5 flex items-end justify-between">
                  <div className="font-display font-black uppercase text-[20px]">Wer ist dabei?</div>
                  <div className="text-[12px] font-bold text-hl-mute tabular-nums">{count} / {players.length}</div>
                </div>
                <p className="mt-1 text-[11px] text-hl-faint">Antippen = dabei / fehlt · Handschuh = Torwart</p>

                <div className="mt-3 flex flex-col gap-2">
                  {players.length === 0 && <div className="hl-card rounded-2xl p-4 text-sm text-hl-mute text-center">Im Kader sind noch keine Spieler eingetragen. Bitte bei der Liga melden.</div>}
                  {players.map((p) => {
                    const on = present.has(p.name);
                    const gk = keeper === p.name;
                    return (
                      <div
                        key={p.name}
                        className="flex items-center gap-3 rounded-2xl border px-3 py-2.5 transition-colors"
                        style={{ borderColor: on ? `${ACCENT}55` : 'rgba(255,255,255,.08)', background: on ? `${ACCENT}10` : 'rgba(255,255,255,.02)', opacity: data.locked ? 0.6 : 1 }}
                      >
                        <button type="button" disabled={data.locked} onClick={() => toggle(p.name)} className="min-w-0 flex-1 flex items-center gap-3 text-left cursor-pointer disabled:cursor-not-allowed">
                          <span className={`shrink-0 w-8 h-8 rounded-full grid place-items-center ${on ? 'bg-brand-accent-light text-[#04120d]' : 'bg-white/[.06] text-hl-dim'}`}>
                            {on ? <Check className="w-4.5 h-4.5" strokeWidth={3} /> : <X className="w-4 h-4" />}
                          </span>
                          <span className="min-w-0">
                            <span className={`block truncate font-sans font-bold text-[15px] ${on ? 'text-white' : 'text-white/45 line-through'}`}>
                              {p.number != null && <span className="text-hl-dim mr-1">#{p.number}</span>}
                              {p.name}
                              {p.captain && <span className="ml-1.5 text-[10px] font-black text-hl-gold">C</span>}
                            </span>
                            <span className="block text-[11px] text-hl-dim">{gk ? 'Torwart' : on ? 'dabei' : 'fehlt'}</span>
                          </span>
                        </button>
                        <button
                          type="button"
                          disabled={data.locked}
                          onClick={() => chooseKeeper(p.name)}
                          title="Torwart"
                          className="shrink-0 w-10 h-10 rounded-xl grid place-items-center border cursor-pointer disabled:cursor-not-allowed transition-colors"
                          style={gk ? { background: '#E9C46A', borderColor: '#E9C46A', color: '#1a1404' } : { borderColor: 'rgba(255,255,255,.12)', color: 'rgba(255,255,255,.4)' }}
                        >
                          <Hand className="w-5 h-5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
                {err && <div className="mt-3"><ErrorMsg>{err}</ErrorMsg></div>}
              </>
            )}
          </div>
        )}
      </div>

      {/* Speichern – unten fixiert (Safe-Area unten) */}
      {token && data && data.matchday !== null && !data.locked && (
        <div className="fixed inset-x-0 bottom-0 z-20 bg-gradient-to-t from-[#070b0c] via-[#070b0c] to-transparent pt-6" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 0.9rem)' }}>
          <div className="w-full max-w-md mx-auto px-4">
            <button disabled={busy || (!dirty && !!savedAt)} onClick={save} className={primaryCls} style={{ background: justSaved ? '#43E5A0' : `linear-gradient(135deg, ${ACCENT}, #14A594)` }}>
              {busy ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : justSaved ? (
                <><CheckCircle2 className="w-5 h-5" /> Gespeichert – Schiri hat es</>
              ) : (
                <>Kader speichern · {count} dabei{keeper ? '' : ' · ohne Torwart'} <ArrowRight className="w-5 h-5" /></>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
