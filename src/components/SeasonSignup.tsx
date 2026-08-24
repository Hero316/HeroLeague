import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowLeft, ArrowRight, Users, Sparkles, Mail, KeyRound, ShieldCheck, CheckCircle2,
  AlertCircle, Loader2, Trophy, RefreshCw, PartyPopper,
} from 'lucide-react';
import {
  fetchSignupConfig, lookupCaptain, requestSignupCode, submitSignup, useTurnstile,
  type SignupConfig, type SignupPayload,
} from '../lib/register';

// Öffentliche, UNVERBINDLICHE Team-Vorregistrierung für Season 2. Mehrstufiger
// Assistent mit smoothen Übergängen, E-Mail-Bestätigung (Bot-Schutz) und
// Captain-Erkennung für bestehende Teams. Eigene, ruhige Teal-Markenwelt.

type Step = 'who' | 'email' | 'details' | 'verify' | 'done';
const ACCENT = '#12A594';

const AGE_BUCKETS = ['16–20', '21–25', '26–30', '31–35', '36+', 'Gemischt'];
const LEVELS: { id: 'hobby' | 'mixed' | 'ambitioniert'; label: string; hint: string }[] = [
  { id: 'hobby', label: 'Hobby', hint: 'Wir kicken zum Spaß' },
  { id: 'mixed', label: 'Gemischt', hint: 'Hobby + Vereinsspieler' },
  { id: 'ambitioniert', label: 'Ambitioniert', hint: 'Viele im Verein aktiv' },
];

function ErrorMsg({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 text-[13px] text-rose-300 bg-rose-500/10 border border-rose-500/20 rounded-xl px-3 py-2.5">
      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
      <span>{children}</span>
    </div>
  );
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="block text-[11px] font-mono uppercase tracking-wider text-hl-dim mb-1.5">{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-hl-faint mt-1">{hint}</span>}
    </label>
  );
}

const inputCls =
  'w-full bg-white/[.05] border border-white/10 rounded-xl px-4 py-3 text-[15px] text-white placeholder-hl-faint focus:border-brand-accent-light focus:outline-none focus:ring-2 focus:ring-brand-accent-light/20 transition-colors';

function StepButtons({ onNumber, value, min, max }: { onNumber: (n: number) => void; value: number | null; min: number; max: number }) {
  const opts = useMemo(() => Array.from({ length: max - min + 1 }, (_, i) => min + i), [min, max]);
  return (
    <div className="flex flex-wrap gap-1.5">
      {opts.map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onNumber(n)}
          className={`w-10 h-10 rounded-xl text-[15px] font-bold tabular-nums transition-all cursor-pointer ${
            value === n ? 'text-white scale-105' : 'text-hl-mute bg-white/[.05] hover:bg-white/10'
          }`}
          style={value === n ? { background: `linear-gradient(135deg,#0C7A70,${ACCENT})` } : undefined}
        >
          {n}
        </button>
      ))}
    </div>
  );
}

const PrimaryBtn = ({ children, disabled, onClick, type = 'button' }: {
  children: React.ReactNode; disabled?: boolean; onClick?: () => void; type?: 'button' | 'submit';
}) => (
  <button
    type={type}
    disabled={disabled}
    onClick={onClick}
    className="w-full flex items-center justify-center gap-2 rounded-2xl py-3.5 text-[15px] font-display font-black uppercase tracking-wide text-white transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed active:scale-[.99]"
    style={{ background: `linear-gradient(135deg,#0C7A70,${ACCENT})`, boxShadow: '0 12px 30px -14px rgba(18,165,148,.7)' }}
  >
    {children}
  </button>
);

export default function SeasonSignup({ onNavigate }: { onNavigate: (path: string) => void }) {
  const [cfg, setCfg] = useState<SignupConfig | null>(null);
  const [step, setStep] = useState<Step>('who');
  const [dir, setDir] = useState(1);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  // Formularzustand
  const [kind, setKind] = useState<'returning' | 'new'>('new');
  const [email, setEmail] = useState('');
  const [captainTeam, setCaptainTeam] = useState('');
  const [form, setForm] = useState<Partial<SignupPayload>>({
    teamName: '', contactName: '', phone: '', keepName: true, rosterChange: 'same',
    squadSize: null, avgAge: '', level: '', clubPlayers: null, hobbyPlayers: null, motivation: '',
  });
  const [code, setCode] = useState('');
  const [consent, setConsent] = useState(false);
  const [devCode, setDevCode] = useState('');
  const honeypot = useRef('');

  const turnstile = useTurnstile(cfg?.turnstileSiteKey);

  useEffect(() => {
    fetchSignupConfig().then(setCfg).catch(() => setCfg(null));
    window.scrollTo(0, 0);
  }, []);

  // Vorwärts einen Schritt: legt einen History-Eintrag an, damit die Handy-
  // Zurück-Geste einen Schritt ZURÜCK geht (statt die ganze Seite zu verlassen).
  const go = (to: Step) => { window.history.pushState(null, ''); setErr(''); setDir(1); setStep(to); window.scrollTo(0, 0); };
  const goDone = () => { setErr(''); setDir(1); setStep('done'); window.scrollTo(0, 0); };
  // Handy-/Browser-Zurück fängt genau einen Schritt ab.
  useEffect(() => {
    const order: Step[] = ['who', 'email', 'details', 'verify'];
    const onPop = () => { setDir(-1); setStep((s) => (s === 'done' ? s : (order.indexOf(s) > 0 ? order[order.indexOf(s) - 1] : s))); };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  const patch = (p: Partial<SignupPayload>) => setForm((f) => ({ ...f, ...p }));
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  // E-Mail bestätigen: Captain-Erkennung (falls „returning") + weiter zu Details.
  const submitEmail = async () => {
    if (!emailValid) { setErr('Bitte eine gültige E-Mail-Adresse eingeben.'); return; }
    setBusy(true); setErr('');
    try {
      if (kind === 'returning') {
        const r = await lookupCaptain(email.trim());
        if (r.found) {
          setCaptainTeam(r.teamName);
          patch({ teamName: r.teamName, s1TeamName: r.teamName });
        } else {
          setCaptainTeam('');
          patch({ s1TeamName: '' });
        }
      }
      go('details');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Etwas ist schiefgelaufen.');
    } finally {
      setBusy(false);
    }
  };

  // Details ok → Code anfordern und zur Bestätigung.
  const goVerify = async () => {
    if (!form.teamName?.trim()) { setErr('Bitte einen Teamnamen angeben.'); return; }
    if (!form.contactName?.trim()) { setErr('Bitte einen Ansprechpartner angeben.'); return; }
    if (!turnstile.ready) { setErr('Bitte kurz die Bot-Prüfung abschließen.'); return; }
    setBusy(true); setErr('');
    try {
      const r = await requestSignupCode({ email: email.trim(), website: honeypot.current, turnstileToken: turnstile.token });
      if (r.devCode) setDevCode(r.devCode);
      turnstile.reset();
      go('verify');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Code konnte nicht gesendet werden.');
    } finally {
      setBusy(false);
    }
  };

  const resendCode = async () => {
    setBusy(true); setErr('');
    try {
      const r = await requestSignupCode({ email: email.trim(), website: honeypot.current, turnstileToken: turnstile.token });
      if (r.devCode) setDevCode(r.devCode);
      turnstile.reset();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Erneutes Senden fehlgeschlagen.');
    } finally { setBusy(false); }
  };

  const finish = async () => {
    if (!/^\d{6}$/.test(code.trim())) { setErr('Bitte den 6-stelligen Code eingeben.'); return; }
    if (!consent) { setErr('Bitte den Hinweis zur unverbindlichen Anmeldung bestätigen.'); return; }
    setBusy(true); setErr('');
    try {
      await submitSignup({
        email: email.trim(), code: code.trim(), kind,
        teamName: form.teamName!.trim(), contactName: form.contactName!.trim(), phone: form.phone || '',
        s1TeamName: form.s1TeamName, keepName: form.keepName, rosterChange: form.rosterChange,
        squadSize: form.squadSize ?? null, avgAge: form.avgAge, level: form.level,
        clubPlayers: form.clubPlayers ?? null, hobbyPlayers: form.hobbyPlayers ?? null,
        motivation: form.motivation, consent, website: honeypot.current,
      });
      goDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Anmeldung fehlgeschlagen.');
    } finally { setBusy(false); }
  };

  const seasonLabel = cfg?.seasonLabel || 'Season 2';
  const minSquad = cfg?.minSquad ?? 8;
  const maxSquad = cfg?.maxSquad ?? 12;

  const slide = {
    initial: (d: number) => ({ opacity: 0, x: d * 40 }),
    animate: { opacity: 1, x: 0 },
    exit: (d: number) => ({ opacity: 0, x: d * -40 }),
  };

  return (
    <div className="min-h-screen bg-brand-dark text-hl-text font-sans flex flex-col relative overflow-hidden">
      {/* Teal-Glow oben */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[420px]" style={{ background: 'radial-gradient(120% 100% at 50% -10%, rgba(18,165,148,.22), transparent 60%)' }} />

      <header className="relative border-b border-white/[.07] backdrop-blur-xl" style={{ paddingTop: 'calc(env(safe-area-inset-top) + .75rem)' }}>
        <div className="max-w-3xl mx-auto px-4 pb-3 flex items-center justify-between">
          <button onClick={() => (step === 'who' || step === 'done' ? onNavigate('/') : window.history.back())}
            className="flex items-center gap-1.5 text-[13px] text-hl-mute hover:text-white transition-colors font-semibold cursor-pointer">
            <ArrowLeft className="w-4 h-4" /> {step === 'who' || step === 'done' ? 'Zur Website' : 'Zurück'}
          </button>
          <img src="/assets/hero-league-logo.png" alt="Hero League" className="h-8 w-auto" />
        </div>
      </header>

      <main className="relative flex-1 w-full max-w-xl mx-auto px-4 py-7">
        {/* Fortschritt */}
        {step !== 'done' && (
          <div className="flex items-center gap-1.5 mb-6">
            {(['who', 'email', 'details', 'verify'] as Step[]).map((s, i) => {
              const order = ['who', 'email', 'details', 'verify'];
              const active = order.indexOf(step) >= i;
              return <div key={s} className="h-1.5 flex-1 rounded-full overflow-hidden bg-white/10">
                <motion.div className="h-full rounded-full" initial={false} animate={{ width: active ? '100%' : '0%' }} transition={{ duration: .4 }} style={{ background: ACCENT }} />
              </div>;
            })}
          </div>
        )}

        {/* Honeypot (unsichtbar) */}
        <input type="text" tabIndex={-1} autoComplete="off" aria-hidden="true"
          onChange={(e) => (honeypot.current = e.target.value)}
          style={{ position: 'absolute', left: '-9999px', width: 1, height: 1, opacity: 0 }} />

        <AnimatePresence mode="wait" custom={dir}>
          <motion.div key={step} custom={dir} variants={slide} initial="initial" animate="animate" exit="exit"
            transition={{ type: 'spring', stiffness: 380, damping: 32 }}>

            {step === 'who' && (
              <div className="space-y-5">
                <div>
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider mb-3" style={{ background: 'rgba(18,165,148,.14)', color: '#5fe6d3', border: '1px solid rgba(18,165,148,.3)' }}>
                    <Sparkles className="w-3.5 h-3.5" /> {seasonLabel} · Anmeldung
                  </div>
                  <h1 className="font-display font-black text-3xl sm:text-4xl uppercase tracking-tight text-white leading-[1.05]">
                    Meldet euer Team an
                  </h1>
                  <p className="text-hl-soft text-[15px] mt-2 leading-relaxed">
                    Sichert euch einen Platz auf der Interessenten-Liste für {seasonLabel}.{cfg?.startInfo ? ` ${cfg.startInfo}.` : ''}
                  </p>
                </div>

                <div className="rounded-2xl border border-yellow-500/25 bg-yellow-500/[.07] px-4 py-3 flex items-start gap-2.5">
                  <ShieldCheck className="w-4 h-4 text-yellow-300 shrink-0 mt-0.5" />
                  <p className="text-[13px] text-yellow-100/90 leading-relaxed">{cfg?.note || 'Unverbindliche Vorregistrierung – noch kein garantierter Startplatz. Sie hilft uns nur bei der Planung.'}</p>
                </div>

                {cfg && !cfg.open ? (
                  <div className="hl-card rounded-2xl p-5 text-center text-hl-mute text-[14px]">Die Anmeldung ist derzeit geschlossen. Schau bald wieder vorbei!</div>
                ) : (
                  <div className="grid gap-3 pt-1">
                    <button onClick={() => { setKind('returning'); go('email'); }} className="hl-card rounded-2xl p-4 flex items-center gap-3.5 text-left hover:border-brand-accent-light/40 transition-colors cursor-pointer active:scale-[.99]">
                      <span className="w-12 h-12 rounded-2xl grid place-items-center shrink-0 text-white" style={{ background: 'linear-gradient(135deg,#0C7A70,#12A594)' }}><Trophy className="w-6 h-6" /></span>
                      <div className="min-w-0 flex-1">
                        <div className="font-display font-black text-white uppercase tracking-tight">Wir waren in Season 1 dabei</div>
                        <div className="text-[13px] text-hl-mute mt-0.5">E-Mail eingeben – wir erkennen euer Team automatisch.</div>
                      </div>
                      <ArrowRight className="w-5 h-5 text-hl-faint shrink-0" />
                    </button>
                    <button onClick={() => { setKind('new'); go('email'); }} className="hl-card rounded-2xl p-4 flex items-center gap-3.5 text-left hover:border-brand-accent-light/40 transition-colors cursor-pointer active:scale-[.99]">
                      <span className="w-12 h-12 rounded-2xl grid place-items-center shrink-0 text-white" style={{ background: 'linear-gradient(135deg,#3B2E86,#6D5DE6)' }}><Users className="w-6 h-6" /></span>
                      <div className="min-w-0 flex-1">
                        <div className="font-display font-black text-white uppercase tracking-tight">Neues Team anmelden</div>
                        <div className="text-[13px] text-hl-mute mt-0.5">Ihr wollt neu bei der Hero League dabei sein.</div>
                      </div>
                      <ArrowRight className="w-5 h-5 text-hl-faint shrink-0" />
                    </button>
                  </div>
                )}
              </div>
            )}

            {step === 'email' && (
              <div className="space-y-5">
                <div>
                  <h2 className="font-display font-black text-2xl uppercase tracking-tight text-white">Deine E-Mail</h2>
                  <p className="text-hl-soft text-[14px] mt-1.5">{kind === 'returning' ? 'Am besten die E-Mail, die du uns als Captain gegeben hast – dann erkennen wir euer Team.' : 'Wir schicken dir später einen kurzen Bestätigungs-Code.'}</p>
                </div>
                {err && <ErrorMsg>{err}</ErrorMsg>}
                <Field label="E-Mail-Adresse">
                  <input type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && submitEmail()} placeholder="du@example.de" className={inputCls} autoFocus />
                </Field>
                <PrimaryBtn onClick={submitEmail} disabled={busy || !emailValid}>
                  {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <>Weiter <ArrowRight className="w-4 h-4" /></>}
                </PrimaryBtn>
              </div>
            )}

            {step === 'details' && (
              <div className="space-y-4">
                <div>
                  <h2 className="font-display font-black text-2xl uppercase tracking-tight text-white">Euer Team</h2>
                  {kind === 'returning' && captainTeam && (
                    <div className="mt-2 inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[13px] font-semibold" style={{ background: 'rgba(18,165,148,.14)', color: '#5fe6d3' }}>
                      <PartyPopper className="w-4 h-4" /> Willkommen zurück, {captainTeam}!
                    </div>
                  )}
                  {kind === 'returning' && !captainTeam && (
                    <p className="text-[13px] text-yellow-200/80 mt-2">Wir konnten kein Team zu dieser E-Mail finden – kein Problem, füll die Felder einfach aus.</p>
                  )}
                </div>
                {err && <ErrorMsg>{err}</ErrorMsg>}

                <Field label="Teamname">
                  <input value={form.teamName || ''} onChange={(e) => patch({ teamName: e.target.value })} placeholder="z.B. FC Hero" className={inputCls} />
                </Field>

                {kind === 'returning' && captainTeam && (
                  <div className="grid grid-cols-1 gap-3">
                    <Field label="Teamname behalten?">
                      <div className="flex gap-2">
                        {[{ v: true, l: 'Behalten' }, { v: false, l: 'Ändern' }].map((o) => (
                          <button key={String(o.v)} type="button" onClick={() => patch({ keepName: o.v })}
                            className={`flex-1 py-2.5 rounded-xl text-[14px] font-bold transition-all cursor-pointer ${form.keepName === o.v ? 'text-white' : 'text-hl-mute bg-white/[.05] hover:bg-white/10'}`}
                            style={form.keepName === o.v ? { background: `linear-gradient(135deg,#0C7A70,${ACCENT})` } : undefined}>{o.l}</button>
                        ))}
                      </div>
                    </Field>
                    <Field label="Kader für Season 2">
                      <div className="flex gap-2">
                        {[{ v: 'same', l: 'Bleibt gleich' }, { v: 'minor', l: 'Kleine Änderungen' }, { v: 'major', l: 'Großer Umbruch' }].map((o) => (
                          <button key={o.v} type="button" onClick={() => patch({ rosterChange: o.v as 'same' | 'minor' | 'major' })}
                            className={`flex-1 py-2.5 px-1 rounded-xl text-[12.5px] font-bold transition-all cursor-pointer ${form.rosterChange === o.v ? 'text-white' : 'text-hl-mute bg-white/[.05] hover:bg-white/10'}`}
                            style={form.rosterChange === o.v ? { background: `linear-gradient(135deg,#0C7A70,${ACCENT})` } : undefined}>{o.l}</button>
                        ))}
                      </div>
                    </Field>
                  </div>
                )}

                <Field label="Ansprechpartner (Captain)">
                  <input value={form.contactName || ''} onChange={(e) => patch({ contactName: e.target.value })} placeholder="Vor- und Nachname" className={inputCls} />
                </Field>
                <Field label="Handynummer" hint="Für Rückfragen – nur wir sehen sie.">
                  <input type="tel" inputMode="tel" value={form.phone || ''} onChange={(e) => patch({ phone: e.target.value })} placeholder="+49 …" className={inputCls} />
                </Field>

                <Field label={`Geplante Kadergröße (${minSquad}–${maxSquad})`}>
                  <StepButtons min={minSquad} max={maxSquad} value={form.squadSize ?? null} onNumber={(n) => patch({ squadSize: n })} />
                </Field>

                <Field label="Durchschnittsalter">
                  <div className="flex flex-wrap gap-1.5">
                    {AGE_BUCKETS.map((a) => (
                      <button key={a} type="button" onClick={() => patch({ avgAge: a })}
                        className={`px-3 py-2 rounded-xl text-[13px] font-bold transition-all cursor-pointer ${form.avgAge === a ? 'text-white' : 'text-hl-mute bg-white/[.05] hover:bg-white/10'}`}
                        style={form.avgAge === a ? { background: `linear-gradient(135deg,#0C7A70,${ACCENT})` } : undefined}>{a}</button>
                    ))}
                  </div>
                </Field>

                <Field label="Wie tickt euer Team?">
                  <div className="grid grid-cols-3 gap-2">
                    {LEVELS.map((l) => (
                      <button key={l.id} type="button" onClick={() => patch({ level: l.id })}
                        className={`p-2.5 rounded-xl text-center transition-all cursor-pointer ${form.level === l.id ? 'text-white' : 'text-hl-mute bg-white/[.05] hover:bg-white/10'}`}
                        style={form.level === l.id ? { background: `linear-gradient(135deg,#0C7A70,${ACCENT})` } : undefined}>
                        <div className="text-[13px] font-bold">{l.label}</div>
                        <div className="text-[10px] opacity-80 leading-tight mt-0.5">{l.hint}</div>
                      </button>
                    ))}
                  </div>
                </Field>

                <div className="grid grid-cols-2 gap-3">
                  <Field label="Spieler im Verein">
                    <input type="number" min={0} max={30} inputMode="numeric" value={form.clubPlayers ?? ''} onChange={(e) => patch({ clubPlayers: e.target.value === '' ? null : Number(e.target.value) })} placeholder="0" className={inputCls} />
                  </Field>
                  <Field label="Nur Hobby">
                    <input type="number" min={0} max={30} inputMode="numeric" value={form.hobbyPlayers ?? ''} onChange={(e) => patch({ hobbyPlayers: e.target.value === '' ? null : Number(e.target.value) })} placeholder="0" className={inputCls} />
                  </Field>
                </div>

                <Field label="Warum wollt ihr dabei sein? (optional)">
                  <textarea value={form.motivation || ''} onChange={(e) => patch({ motivation: e.target.value })} rows={3} maxLength={800} placeholder="Erzählt uns kurz was über euch …" className={`${inputCls} resize-none`} />
                </Field>

                {cfg?.turnstileSiteKey && <div ref={turnstile.ref} className="flex justify-center" />}

                <PrimaryBtn onClick={goVerify} disabled={busy}>
                  {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <>Weiter zur Bestätigung <ArrowRight className="w-4 h-4" /></>}
                </PrimaryBtn>
              </div>
            )}

            {step === 'verify' && (
              <div className="space-y-5">
                <div className="text-center">
                  <div className="w-14 h-14 rounded-2xl grid place-items-center mx-auto mb-3" style={{ background: 'rgba(18,165,148,.14)', border: '1px solid rgba(18,165,148,.3)' }}>
                    <KeyRound className="w-7 h-7 text-brand-accent-light" />
                  </div>
                  <h2 className="font-display font-black text-2xl uppercase tracking-tight text-white">E-Mail bestätigen</h2>
                  <p className="text-hl-soft text-[14px] mt-1.5">Wir haben einen 6-stelligen Code an<br /><span className="font-semibold text-white">{email}</span> geschickt.</p>
                </div>
                {devCode && <div className="text-center text-[12px] text-yellow-300 bg-yellow-500/10 border border-yellow-500/20 rounded-xl py-2">Test-Modus – dein Code: <strong className="tracking-widest">{devCode}</strong></div>}
                {err && <ErrorMsg>{err}</ErrorMsg>}
                <input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code"
                  placeholder="••••••" className={`${inputCls} text-center text-[26px] tracking-[.5em] font-mono font-bold`} autoFocus />

                <label className="flex items-start gap-2.5 cursor-pointer select-none">
                  <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 w-5 h-5 rounded accent-[#12A594] shrink-0" />
                  <span className="text-[13px] text-hl-soft leading-relaxed">Mir ist klar, dass das eine <strong className="text-white">unverbindliche Vorregistrierung</strong> ist und kein garantierter Startplatz in {seasonLabel}.</span>
                </label>

                <PrimaryBtn onClick={finish} disabled={busy || code.length !== 6 || !consent}>
                  {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <><CheckCircle2 className="w-4 h-4" /> Anmeldung abschließen</>}
                </PrimaryBtn>
                <button onClick={resendCode} disabled={busy} className="w-full flex items-center justify-center gap-1.5 text-[13px] text-hl-mute hover:text-white transition-colors cursor-pointer">
                  <RefreshCw className="w-3.5 h-3.5" /> Code erneut senden
                </button>
              </div>
            )}

            {step === 'done' && (
              <motion.div initial={{ scale: .9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 300, damping: 20 }} className="text-center py-8 space-y-4">
                <div className="w-20 h-20 rounded-full grid place-items-center mx-auto" style={{ background: 'linear-gradient(135deg,#0C7A70,#12A594)', boxShadow: '0 20px 50px -18px rgba(18,165,148,.8)' }}>
                  <CheckCircle2 className="w-11 h-11 text-white" />
                </div>
                <h2 className="font-display font-black text-3xl uppercase tracking-tight text-white">Anmeldung eingegangen!</h2>
                <p className="text-hl-soft text-[15px] max-w-sm mx-auto leading-relaxed">
                  Danke, {form.contactName?.split(' ')[0] || 'Leute'}! Wir haben eure Vorregistrierung für {seasonLabel} erhalten und eine Bestätigung an <span className="text-white font-semibold">{email}</span> geschickt.
                </p>
                <div className="rounded-2xl border border-yellow-500/25 bg-yellow-500/[.07] px-4 py-3 text-[13px] text-yellow-100/90 max-w-sm mx-auto text-left flex items-start gap-2.5">
                  <ShieldCheck className="w-4 h-4 text-yellow-300 shrink-0 mt-0.5" />
                  <span>Denk dran: noch kein fester Platz – wir melden uns persönlich bei euch.</span>
                </div>
                <button onClick={() => onNavigate('/')} className="inline-flex items-center gap-2 rounded-2xl px-6 py-3 mt-2 text-[14px] font-display font-black uppercase tracking-wide text-white cursor-pointer" style={{ background: 'linear-gradient(135deg,#0C7A70,#12A594)' }}>
                  Zur Startseite <ArrowRight className="w-4 h-4" />
                </button>
              </motion.div>
            )}
          </motion.div>
        </AnimatePresence>
      </main>

      <footer className="relative border-t border-white/[.06] py-5 text-center">
        <div className="flex items-center justify-center gap-4 text-[12px] text-hl-faint">
          <button onClick={() => onNavigate('/impressum')} className="hover:text-hl-mute transition-colors cursor-pointer">Impressum</button>
          <button onClick={() => onNavigate('/datenschutz')} className="hover:text-hl-mute transition-colors cursor-pointer">Datenschutz</button>
        </div>
      </footer>
    </div>
  );
}
