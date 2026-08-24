import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowLeft, ArrowRight, Users, Sparkles, KeyRound, ShieldCheck, CheckCircle2,
  AlertCircle, Loader2, Trophy, RefreshCw, PartyPopper, User, Building2, Dribbble, Heart,
} from 'lucide-react';
import {
  fetchSignupConfig, lookupCaptain, requestSignupCode, submitSignup, useTurnstile,
  type SignupConfig, type SignupPayload,
} from '../lib/register';

// Öffentliche, UNVERBINDLICHE Vorregistrierung für Season 2 – für TEAMS und
// einzelne SPIELER. Mehrstufiger Assistent mit smoothen Übergängen,
// E-Mail-Bestätigung (Bot-Schutz) und passenden Fragen je nach Auswahl.

type Step = 'entry' | 'who' | 'email' | 'details' | 'ptype' | 'pdetails' | 'verify' | 'done';
type Entry = 'team' | 'player';
type PType = 'verein' | 'hobby';
const ACCENT = '#2F5BFF'; // Königsblau – eigene Farbwelt der Season-2-Anmeldung
const GRAD = `linear-gradient(135deg,#16277A,${ACCENT})`;
const PURPLE = 'linear-gradient(135deg,#3B2E86,#6D5DE6)';

const AGE_BUCKETS = ['16–20', '21–25', '26–30', '31–35', '36+', 'Gemischt'];
const LEVELS: { id: 'hobby' | 'mixed' | 'ambitioniert'; label: string; hint: string }[] = [
  { id: 'hobby', label: 'Hobby', hint: 'Zum Spaß' },
  { id: 'mixed', label: 'Gemischt', hint: 'Hobby + Verein' },
  { id: 'ambitioniert', label: 'Ambitioniert', hint: 'Viele im Verein' },
];
const POSITIONS = [
  { id: 'tor', label: 'Tor' }, { id: 'abwehr', label: 'Abwehr' }, { id: 'mittelfeld', label: 'Mittelfeld' },
  { id: 'sturm', label: 'Sturm' }, { id: 'flexibel', label: 'Flexibel' },
] as const;
const FEET = [{ id: 'links', label: 'Links' }, { id: 'rechts', label: 'Rechts' }, { id: 'beid', label: 'Beidfüßig' }] as const;
const LEAGUES = ['Kreisklasse', 'Kreisliga', 'Bezirksliga', 'Landesliga', 'Verbandsliga', 'Oberliga', 'Regionalliga+', 'Jugend', 'Sonstige'];
const FREQ = [
  { id: 'selten', label: 'Selten' }, { id: 'monatlich', label: 'Monatlich' },
  { id: 'woechentlich', label: 'Wöchentlich' }, { id: 'mehrmals', label: 'Mehrmals/Woche' },
] as const;
const HEARD = [
  { id: 'internet', label: 'Internet / Google' }, { id: 'social', label: 'Social Media' },
  { id: 'freunde', label: 'Freunde / Bekannte' }, { id: 'kontakte', label: 'Kontakte / Verein' },
  { id: 'sonstiges', label: 'Sonstiges' },
] as const;
const RATINGS: { key: keyof NonNullable<SignupPayload['ratings']>; label: string }[] = [
  { key: 'technik', label: 'Technik' },
  { key: 'ausdauer', label: 'Ausdauer / Fitness' },
  { key: 'tempo', label: 'Schnelligkeit' },
  { key: 'uebersicht', label: 'Spielübersicht' },
  { key: 'abschluss', label: 'Abschluss / Torgefahr' },
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
  'w-full bg-white/[.05] border border-white/10 rounded-xl px-4 py-3 text-[15px] text-white placeholder-hl-faint focus:border-[#5B7FFF] focus:outline-none focus:ring-2 focus:ring-[#5B7FFF]/20 transition-colors';

// Pillen-Auswahl (Einfachauswahl).
function Pills<T extends string>({ options, value, onChange }: { options: { id: T; label: string }[]; value: T | undefined; onChange: (v: T) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button key={o.id} type="button" onClick={() => onChange(o.id)}
          className={`px-3 py-2 rounded-xl text-[13px] font-bold transition-all cursor-pointer ${value === o.id ? 'text-white' : 'text-hl-mute bg-white/[.05] hover:bg-white/10'}`}
          style={value === o.id ? { background: GRAD } : undefined}>{o.label}</button>
      ))}
    </div>
  );
}

// 1–10-Skala zur Selbsteinschätzung.
function RatingScale({ label, value, onChange }: { label: string; value: number | null | undefined; onChange: (n: number) => void }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[13px] font-semibold text-hl-soft">{label}</span>
        <span className="text-[13px] font-black tabular-nums" style={{ color: value ? '#83A0FF' : 'var(--color-hl-faint)' }}>{value ?? '–'}<span className="text-hl-faint font-normal">/10</span></span>
      </div>
      <div className="grid grid-cols-10 gap-1">
        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
          <button key={n} type="button" onClick={() => onChange(n)}
            className={`h-8 rounded-lg text-[12px] font-bold tabular-nums transition-all cursor-pointer ${value != null && n <= value ? 'text-white' : 'text-hl-mute bg-white/[.05] hover:bg-white/10'}`}
            style={value != null && n <= value ? { background: GRAD } : undefined}>{n}</button>
        ))}
      </div>
    </div>
  );
}

function StepNumbers({ onNumber, value, min, max }: { onNumber: (n: number) => void; value: number | null | undefined; min: number; max: number }) {
  const opts = useMemo(() => Array.from({ length: max - min + 1 }, (_, i) => min + i), [min, max]);
  return (
    <div className="flex flex-wrap gap-1.5">
      {opts.map((n) => (
        <button key={n} type="button" onClick={() => onNumber(n)}
          className={`w-10 h-10 rounded-xl text-[15px] font-bold tabular-nums transition-all cursor-pointer ${value === n ? 'text-white scale-105' : 'text-hl-mute bg-white/[.05] hover:bg-white/10'}`}
          style={value === n ? { background: GRAD } : undefined}>{n}</button>
      ))}
    </div>
  );
}

const PrimaryBtn = ({ children, disabled, onClick }: { children: React.ReactNode; disabled?: boolean; onClick?: () => void }) => (
  <button type="button" disabled={disabled} onClick={onClick}
    className="w-full flex items-center justify-center gap-2 rounded-2xl py-3.5 text-[15px] font-display font-black uppercase tracking-wide text-white transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed active:scale-[.99]"
    style={{ background: GRAD, boxShadow: '0 12px 30px -14px rgba(47,91,255,.7)' }}>
    {children}
  </button>
);

export default function SeasonSignup({ onNavigate }: { onNavigate: (path: string) => void }) {
  const [cfg, setCfg] = useState<SignupConfig | null>(null);
  const [step, setStep] = useState<Step>('entry');
  const [dir, setDir] = useState(1);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const [entry, setEntry] = useState<Entry>('team');
  const [kind, setKind] = useState<'returning' | 'new'>('new');
  const [playerType, setPlayerType] = useState<PType>('verein');
  const [email, setEmail] = useState('');
  const [captainTeam, setCaptainTeam] = useState('');
  const [form, setForm] = useState<Partial<SignupPayload>>({
    teamName: '', contactName: '', phone: '', keepName: true, rosterChange: 'same',
    squadSize: null, avgAge: '', level: '', clubPlayers: null, hobbyPlayers: null, motivation: '',
    name: '', age: null, position: '', foot: '', club: '', league: '', years: null, frequency: '', ratings: {},
  });
  const [code, setCode] = useState('');
  const [consent, setConsent] = useState(false);
  const [devCode, setDevCode] = useState('');
  const honeypot = useRef('');

  const turnstile = useTurnstile(cfg?.turnstileSiteKey);

  useEffect(() => { fetchSignupConfig().then(setCfg).catch(() => setCfg(null)); window.scrollTo(0, 0); }, []);

  // Schritt-Reihenfolge je nach Weg (Team vs. Spieler) – für Fortschritt & Zurück.
  const order: Step[] = entry === 'player' ? ['entry', 'ptype', 'pdetails', 'verify'] : ['entry', 'who', 'email', 'details', 'verify'];

  const go = (to: Step) => { window.history.pushState(null, ''); setErr(''); setDir(1); setStep(to); window.scrollTo(0, 0); };
  const goDone = () => { setErr(''); setDir(1); setStep('done'); window.scrollTo(0, 0); };
  useEffect(() => {
    const ord: Step[] = entry === 'player' ? ['entry', 'ptype', 'pdetails', 'verify'] : ['entry', 'who', 'email', 'details', 'verify'];
    const onPop = () => { setDir(-1); setStep((s) => (s === 'done' ? s : (ord.indexOf(s) > 0 ? ord[ord.indexOf(s) - 1] : s))); };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [entry]);

  const patch = (p: Partial<SignupPayload>) => setForm((f) => ({ ...f, ...p }));
  const setRating = (k: string, n: number) => setForm((f) => ({ ...f, ratings: { ...(f.ratings || {}), [k]: n } }));
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  // Team: E-Mail bestätigen (+ Captain-Erkennung) → Details.
  const submitEmail = async () => {
    if (!emailValid) { setErr('Bitte eine gültige E-Mail-Adresse eingeben.'); return; }
    setBusy(true); setErr('');
    try {
      if (kind === 'returning') {
        const r = await lookupCaptain(email.trim());
        if (!r.found) {
          // Bestehendes Team wählt man nur mit der hinterlegten Captain-E-Mail.
          // Unbekannte Adresse ⇒ hart blockieren (kein Weitermachen).
          setErr('Diese E-Mail-Adresse gehört zu keinem Team aus Season 1. Bitte nutze die E-Mail, die du uns als Captain gegeben hast – oder gehe zurück und melde dich als „Neues Team" an.');
          return;
        }
        setCaptainTeam(r.teamName); patch({ teamName: r.teamName, s1TeamName: r.teamName });
      }
      go('details');
    } catch (e) { setErr(e instanceof Error ? e.message : 'Etwas ist schiefgelaufen.'); }
    finally { setBusy(false); }
  };

  const requestCode = async () => {
    const r = await requestSignupCode({ email: email.trim(), website: honeypot.current, turnstileToken: turnstile.token });
    if (r.devCode) setDevCode(r.devCode);
    turnstile.reset();
  };

  // Team-Details → Bestätigung.
  const teamToVerify = async () => {
    if (!form.teamName?.trim()) { setErr('Bitte einen Teamnamen angeben.'); return; }
    if (!form.contactName?.trim()) { setErr('Bitte einen Ansprechpartner angeben.'); return; }
    if (!turnstile.ready) { setErr('Bitte kurz die Bot-Prüfung abschließen.'); return; }
    setBusy(true); setErr('');
    try { await requestCode(); go('verify'); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Code konnte nicht gesendet werden.'); }
    finally { setBusy(false); }
  };

  // Spieler-Details → Bestätigung.
  const playerToVerify = async () => {
    if (!form.name?.trim()) { setErr('Bitte deinen Namen angeben.'); return; }
    if (!emailValid) { setErr('Bitte eine gültige E-Mail-Adresse eingeben.'); return; }
    if (!form.position) { setErr('Bitte eine Position wählen.'); return; }
    if (!turnstile.ready) { setErr('Bitte kurz die Bot-Prüfung abschließen.'); return; }
    setBusy(true); setErr('');
    try { await requestCode(); go('verify'); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Code konnte nicht gesendet werden.'); }
    finally { setBusy(false); }
  };

  const resendCode = async () => {
    setBusy(true); setErr('');
    try { await requestCode(); } catch (e) { setErr(e instanceof Error ? e.message : 'Erneutes Senden fehlgeschlagen.'); }
    finally { setBusy(false); }
  };

  const finish = async () => {
    if (!/^\d{6}$/.test(code.trim())) { setErr('Bitte den 6-stelligen Code eingeben.'); return; }
    if (!consent) { setErr('Bitte den Hinweis zur unverbindlichen Anmeldung bestätigen.'); return; }
    setBusy(true); setErr('');
    try {
      const base: SignupPayload = { email: email.trim(), code: code.trim(), entry, consent, website: honeypot.current, phone: form.phone || '', motivation: form.motivation, heardFrom: form.heardFrom };
      if (entry === 'player') {
        await submitSignup({
          ...base, name: form.name!.trim(), playerType, age: form.age ?? null,
          position: form.position, foot: form.foot, ratings: form.ratings,
          club: form.club, league: form.league, years: form.years ?? null, frequency: form.frequency,
        });
      } else {
        await submitSignup({
          ...base, kind, teamName: form.teamName!.trim(), contactName: form.contactName!.trim(),
          s1TeamName: form.s1TeamName, keepName: form.keepName, rosterChange: form.rosterChange,
          squadSize: form.squadSize ?? null, avgAge: form.avgAge, level: form.level,
          clubPlayers: form.clubPlayers ?? null, hobbyPlayers: form.hobbyPlayers ?? null,
        });
      }
      goDone();
    } catch (e) { setErr(e instanceof Error ? e.message : 'Anmeldung fehlgeschlagen.'); }
    finally { setBusy(false); }
  };

  const seasonLabel = cfg?.seasonLabel || 'Season 2';
  const minSquad = cfg?.minSquad ?? 8;
  const maxSquad = cfg?.maxSquad ?? 12;
  const progressSteps = order.slice(1); // ohne 'entry'
  const slide = {
    initial: (d: number) => ({ opacity: 0, x: d * 40 }),
    animate: { opacity: 1, x: 0 },
    exit: (d: number) => ({ opacity: 0, x: d * -40 }),
  };

  return (
    <div className="min-h-screen bg-brand-dark text-hl-text font-sans flex flex-col relative overflow-hidden">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[420px]" style={{ background: 'radial-gradient(120% 100% at 50% -10%, rgba(47,91,255,.22), transparent 60%)' }} />

      <header className="relative border-b border-white/[.07] backdrop-blur-xl" style={{ paddingTop: 'calc(env(safe-area-inset-top) + .75rem)' }}>
        <div className="max-w-3xl mx-auto px-4 pb-3 flex items-center justify-between">
          <button onClick={() => (step === 'entry' || step === 'done' ? onNavigate('/') : window.history.back())}
            className="flex items-center gap-1.5 text-[13px] text-hl-mute hover:text-white transition-colors font-semibold cursor-pointer">
            <ArrowLeft className="w-4 h-4" /> {step === 'entry' || step === 'done' ? 'Zur Website' : 'Zurück'}
          </button>
          <img src="/assets/hero-league-logo.png" alt="Hero League" className="h-8 w-auto" />
        </div>
      </header>

      <main className="relative flex-1 w-full max-w-xl mx-auto px-4 py-7">
        {step !== 'entry' && step !== 'done' && (
          <div className="flex items-center gap-1.5 mb-6">
            {progressSteps.map((s, i) => {
              const active = progressSteps.indexOf(step as Step) >= i;
              return <div key={s} className="h-1.5 flex-1 rounded-full overflow-hidden bg-white/10">
                <motion.div className="h-full rounded-full" initial={false} animate={{ width: active ? '100%' : '0%' }} transition={{ duration: .4 }} style={{ background: ACCENT }} />
              </div>;
            })}
          </div>
        )}

        <input type="text" tabIndex={-1} autoComplete="off" aria-hidden="true"
          onChange={(e) => (honeypot.current = e.target.value)} style={{ position: 'absolute', left: '-9999px', width: 1, height: 1, opacity: 0 }} />

        <AnimatePresence mode="wait" custom={dir}>
          <motion.div key={step} custom={dir} variants={slide} initial="initial" animate="animate" exit="exit"
            transition={{ type: 'spring', stiffness: 380, damping: 32 }}>

            {/* SCHRITT: Team oder Spieler? */}
            {step === 'entry' && (
              <div className="space-y-5">
                <div>
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider mb-3" style={{ background: 'rgba(47,91,255,.14)', color: '#83A0FF', border: '1px solid rgba(47,91,255,.3)' }}>
                    <Sparkles className="w-3.5 h-3.5" /> {seasonLabel} · Anmeldung
                  </div>
                  <h1 className="font-display font-black text-3xl sm:text-4xl uppercase tracking-tight text-white leading-[1.05]">Sei bei Season 2 dabei</h1>
                  <p className="text-hl-soft text-[15px] mt-2 leading-relaxed">Meldet euer ganzes Team an – oder trag dich als einzelner Spieler ein, der ein Team sucht.{cfg?.startInfo ? ` ${cfg.startInfo}.` : ''}</p>
                </div>
                <div className="rounded-2xl border border-yellow-500/25 bg-yellow-500/[.07] px-4 py-3 flex items-start gap-2.5">
                  <ShieldCheck className="w-4 h-4 text-yellow-300 shrink-0 mt-0.5" />
                  <p className="text-[13px] text-yellow-100/90 leading-relaxed">{cfg?.note || 'Unverbindliche Vorregistrierung – noch kein garantierter Platz. Sie hilft uns nur bei der Planung.'}</p>
                </div>
                {cfg && !cfg.open ? (
                  <div className="hl-card rounded-2xl p-5 text-center text-hl-mute text-[14px]">Die Anmeldung ist derzeit geschlossen. Schau bald wieder vorbei!</div>
                ) : (
                  <div className="grid gap-3 pt-1">
                    <button onClick={() => { setEntry('team'); go('who'); }} className="hl-card rounded-2xl p-4 flex items-center gap-3.5 text-left hover:border-[#5B7FFF]/40 transition-colors cursor-pointer active:scale-[.99]">
                      <span className="w-12 h-12 rounded-2xl grid place-items-center shrink-0 text-white" style={{ background: GRAD }}><Users className="w-6 h-6" /></span>
                      <div className="min-w-0 flex-1">
                        <div className="font-display font-black text-white uppercase tracking-tight">Team anmelden</div>
                        <div className="text-[13px] text-hl-mute mt-0.5">Ihr seid ein komplettes Team (mind. 8 Leute).</div>
                      </div>
                      <ArrowRight className="w-5 h-5 text-hl-faint shrink-0" />
                    </button>
                    <button onClick={() => { setEntry('player'); go('ptype'); }} className="hl-card rounded-2xl p-4 flex items-center gap-3.5 text-left hover:border-[#5B7FFF]/40 transition-colors cursor-pointer active:scale-[.99]">
                      <span className="w-12 h-12 rounded-2xl grid place-items-center shrink-0 text-white" style={{ background: PURPLE }}><User className="w-6 h-6" /></span>
                      <div className="min-w-0 flex-1">
                        <div className="font-display font-black text-white uppercase tracking-tight">Als Spieler anmelden</div>
                        <div className="text-[13px] text-hl-mute mt-0.5">Du suchst ein Team, das dich aufnimmt.</div>
                      </div>
                      <ArrowRight className="w-5 h-5 text-hl-faint shrink-0" />
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* TEAM – bestehend/neu */}
            {step === 'who' && (
              <div className="space-y-5">
                <div><h2 className="font-display font-black text-2xl uppercase tracking-tight text-white">Euer Team</h2><p className="text-hl-soft text-[14px] mt-1.5">Wart ihr schon in Season 1 dabei?</p></div>
                <div className="grid gap-3">
                  <button onClick={() => { setKind('returning'); go('email'); }} className="hl-card rounded-2xl p-4 flex items-center gap-3.5 text-left hover:border-[#5B7FFF]/40 transition-colors cursor-pointer active:scale-[.99]">
                    <span className="w-11 h-11 rounded-2xl grid place-items-center shrink-0 text-white" style={{ background: GRAD }}><Trophy className="w-5 h-5" /></span>
                    <div className="min-w-0 flex-1"><div className="font-display font-black text-white uppercase tracking-tight">Wir waren dabei</div><div className="text-[13px] text-hl-mute mt-0.5">E-Mail eingeben – wir erkennen euer Team.</div></div>
                    <ArrowRight className="w-5 h-5 text-hl-faint shrink-0" />
                  </button>
                  <button onClick={() => { setKind('new'); go('email'); }} className="hl-card rounded-2xl p-4 flex items-center gap-3.5 text-left hover:border-[#5B7FFF]/40 transition-colors cursor-pointer active:scale-[.99]">
                    <span className="w-11 h-11 rounded-2xl grid place-items-center shrink-0 text-white" style={{ background: PURPLE }}><Users className="w-5 h-5" /></span>
                    <div className="min-w-0 flex-1"><div className="font-display font-black text-white uppercase tracking-tight">Neues Team</div><div className="text-[13px] text-hl-mute mt-0.5">Ihr wollt neu dabei sein.</div></div>
                    <ArrowRight className="w-5 h-5 text-hl-faint shrink-0" />
                  </button>
                </div>
              </div>
            )}

            {step === 'email' && (
              <div className="space-y-5">
                <div><h2 className="font-display font-black text-2xl uppercase tracking-tight text-white">Eure E-Mail</h2><p className="text-hl-soft text-[14px] mt-1.5">{kind === 'returning' ? 'Am besten die E-Mail, die du uns als Captain gegeben hast.' : 'Wir schicken dir später einen kurzen Bestätigungs-Code.'}</p></div>
                {err && <ErrorMsg>{err}</ErrorMsg>}
                <Field label="E-Mail-Adresse">
                  <input type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submitEmail()} placeholder="du@example.de" className={inputCls} autoFocus />
                </Field>
                <PrimaryBtn onClick={submitEmail} disabled={busy || !emailValid}>{busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <>Weiter <ArrowRight className="w-4 h-4" /></>}</PrimaryBtn>
              </div>
            )}

            {step === 'details' && (
              <div className="space-y-4">
                <div>
                  <h2 className="font-display font-black text-2xl uppercase tracking-tight text-white">Team-Infos</h2>
                  {kind === 'returning' && captainTeam && <div className="mt-2 inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[13px] font-semibold" style={{ background: 'rgba(47,91,255,.14)', color: '#83A0FF' }}><PartyPopper className="w-4 h-4" /> Willkommen zurück, {captainTeam}!</div>}
                  {kind === 'returning' && !captainTeam && <p className="text-[13px] text-yellow-200/80 mt-2">Kein Team zu dieser E-Mail gefunden – füll die Felder einfach aus.</p>}
                </div>
                {err && <ErrorMsg>{err}</ErrorMsg>}
                <Field label="Teamname"><input value={form.teamName || ''} onChange={(e) => patch({ teamName: e.target.value })} placeholder="z.B. FC Hero" className={inputCls} /></Field>
                {kind === 'returning' && captainTeam && (
                  <div className="grid gap-3">
                    <Field label="Teamname behalten?">
                      <div className="flex gap-2">{[{ v: true, l: 'Behalten' }, { v: false, l: 'Ändern' }].map((o) => (
                        <button key={String(o.v)} type="button" onClick={() => patch({ keepName: o.v })} className={`flex-1 py-2.5 rounded-xl text-[14px] font-bold transition-all cursor-pointer ${form.keepName === o.v ? 'text-white' : 'text-hl-mute bg-white/[.05] hover:bg-white/10'}`} style={form.keepName === o.v ? { background: GRAD } : undefined}>{o.l}</button>))}</div>
                    </Field>
                    <Field label="Kader für Season 2">
                      <div className="flex gap-2">{[{ v: 'same', l: 'Bleibt gleich' }, { v: 'minor', l: 'Kleine Änd.' }, { v: 'major', l: 'Umbruch' }].map((o) => (
                        <button key={o.v} type="button" onClick={() => patch({ rosterChange: o.v as 'same' | 'minor' | 'major' })} className={`flex-1 py-2.5 px-1 rounded-xl text-[12.5px] font-bold transition-all cursor-pointer ${form.rosterChange === o.v ? 'text-white' : 'text-hl-mute bg-white/[.05] hover:bg-white/10'}`} style={form.rosterChange === o.v ? { background: GRAD } : undefined}>{o.l}</button>))}</div>
                    </Field>
                  </div>
                )}
                <Field label="Ansprechpartner (Captain)"><input value={form.contactName || ''} onChange={(e) => patch({ contactName: e.target.value })} placeholder="Vor- und Nachname" className={inputCls} /></Field>
                <Field label="Handynummer" hint="Für Rückfragen – nur wir sehen sie."><input type="tel" inputMode="tel" value={form.phone || ''} onChange={(e) => patch({ phone: e.target.value })} placeholder="+49 …" className={inputCls} /></Field>
                <Field label={`Geplante Kadergröße (${minSquad}–${maxSquad})`}><StepNumbers min={minSquad} max={maxSquad} value={form.squadSize} onNumber={(n) => patch({ squadSize: n })} /></Field>
                <Field label="Durchschnittsalter"><Pills options={AGE_BUCKETS.map((a) => ({ id: a, label: a }))} value={form.avgAge || undefined} onChange={(v) => patch({ avgAge: v })} /></Field>
                <Field label="Wie tickt euer Team?">
                  <div className="grid grid-cols-3 gap-2">{LEVELS.map((l) => (
                    <button key={l.id} type="button" onClick={() => patch({ level: l.id })} className={`p-2.5 rounded-xl text-center transition-all cursor-pointer ${form.level === l.id ? 'text-white' : 'text-hl-mute bg-white/[.05] hover:bg-white/10'}`} style={form.level === l.id ? { background: GRAD } : undefined}>
                      <div className="text-[13px] font-bold">{l.label}</div><div className="text-[10px] opacity-80 leading-tight mt-0.5">{l.hint}</div>
                    </button>))}</div>
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Spieler im Verein"><input type="number" min={0} max={30} inputMode="numeric" value={form.clubPlayers ?? ''} onChange={(e) => patch({ clubPlayers: e.target.value === '' ? null : Number(e.target.value) })} placeholder="0" className={inputCls} /></Field>
                  <Field label="Nur Hobby"><input type="number" min={0} max={30} inputMode="numeric" value={form.hobbyPlayers ?? ''} onChange={(e) => patch({ hobbyPlayers: e.target.value === '' ? null : Number(e.target.value) })} placeholder="0" className={inputCls} /></Field>
                </div>
                <Field label="Warum wollt ihr dabei sein? (optional)"><textarea value={form.motivation || ''} onChange={(e) => patch({ motivation: e.target.value })} rows={3} maxLength={800} placeholder="Erzählt uns kurz was über euch …" className={`${inputCls} resize-none`} /></Field>
                <Field label="Wie habt ihr von uns erfahren?"><Pills options={HEARD.map((h) => ({ id: h.id as string, label: h.label }))} value={form.heardFrom || undefined} onChange={(v) => patch({ heardFrom: v })} /></Field>
                {cfg?.turnstileSiteKey && <div ref={turnstile.ref} className="flex justify-center" />}
                <PrimaryBtn onClick={teamToVerify} disabled={busy}>{busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <>Weiter zur Bestätigung <ArrowRight className="w-4 h-4" /></>}</PrimaryBtn>
              </div>
            )}

            {/* SPIELER – Verein oder Hobby? */}
            {step === 'ptype' && (
              <div className="space-y-5">
                <div><h2 className="font-display font-black text-2xl uppercase tracking-tight text-white">Spielst du im Verein?</h2><p className="text-hl-soft text-[14px] mt-1.5">Danach kommen passende Fragen zu dir.</p></div>
                <div className="grid gap-3">
                  <button onClick={() => { setPlayerType('verein'); go('pdetails'); }} className="hl-card rounded-2xl p-4 flex items-center gap-3.5 text-left hover:border-[#5B7FFF]/40 transition-colors cursor-pointer active:scale-[.99]">
                    <span className="w-12 h-12 rounded-2xl grid place-items-center shrink-0 text-white" style={{ background: GRAD }}><Building2 className="w-6 h-6" /></span>
                    <div className="min-w-0 flex-1"><div className="font-display font-black text-white uppercase tracking-tight">Ja, im Verein</div><div className="text-[13px] text-hl-mute mt-0.5">Ich spiele aktiv in einem Verein.</div></div>
                    <ArrowRight className="w-5 h-5 text-hl-faint shrink-0" />
                  </button>
                  <button onClick={() => { setPlayerType('hobby'); go('pdetails'); }} className="hl-card rounded-2xl p-4 flex items-center gap-3.5 text-left hover:border-[#5B7FFF]/40 transition-colors cursor-pointer active:scale-[.99]">
                    <span className="w-12 h-12 rounded-2xl grid place-items-center shrink-0 text-white" style={{ background: PURPLE }}><Dribbble className="w-6 h-6" /></span>
                    <div className="min-w-0 flex-1"><div className="font-display font-black text-white uppercase tracking-tight">Nein, Hobby</div><div className="text-[13px] text-hl-mute mt-0.5">Ich kicke hobbymäßig / in keinem Verein.</div></div>
                    <ArrowRight className="w-5 h-5 text-hl-faint shrink-0" />
                  </button>
                </div>
              </div>
            )}

            {/* SPIELER – Details (je nach Verein/Hobby) */}
            {step === 'pdetails' && (
              <div className="space-y-4">
                <div>
                  <h2 className="font-display font-black text-2xl uppercase tracking-tight text-white">Über dich</h2>
                  <div className="mt-2 inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[13px] font-semibold" style={{ background: 'rgba(47,91,255,.14)', color: '#83A0FF' }}>{playerType === 'verein' ? <Building2 className="w-4 h-4" /> : <Dribbble className="w-4 h-4" />} {playerType === 'verein' ? 'Vereinsspieler' : 'Hobby-Kicker'}</div>
                </div>
                {err && <ErrorMsg>{err}</ErrorMsg>}
                <Field label="Dein Name"><input value={form.name || ''} onChange={(e) => patch({ name: e.target.value })} placeholder="Vor- und Nachname" className={inputCls} /></Field>
                <Field label="E-Mail-Adresse"><input type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="du@example.de" className={inputCls} /></Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Handynummer"><input type="tel" inputMode="tel" value={form.phone || ''} onChange={(e) => patch({ phone: e.target.value })} placeholder="+49 …" className={inputCls} /></Field>
                  <Field label="Alter"><input type="number" min={12} max={80} inputMode="numeric" value={form.age ?? ''} onChange={(e) => patch({ age: e.target.value === '' ? null : Number(e.target.value) })} placeholder="z.B. 23" className={inputCls} /></Field>
                </div>
                <Field label="Position"><Pills options={POSITIONS.map((p) => ({ id: p.id, label: p.label }))} value={form.position || undefined} onChange={(v) => patch({ position: v })} /></Field>
                <Field label="Starker Fuß"><Pills options={FEET.map((f) => ({ id: f.id, label: f.label }))} value={form.foot || undefined} onChange={(v) => patch({ foot: v })} /></Field>

                {playerType === 'verein' ? (
                  <>
                    <Field label="In welchem Verein?"><input value={form.club || ''} onChange={(e) => patch({ club: e.target.value })} placeholder="z.B. SV Musterstadt" className={inputCls} /></Field>
                    <Field label="Welche Spielklasse / Liga?"><Pills options={LEAGUES.map((l) => ({ id: l, label: l }))} value={form.league || undefined} onChange={(v) => patch({ league: v })} /></Field>
                  </>
                ) : (
                  <>
                    <Field label="Seit wie vielen Jahren kickst du?"><input type="number" min={0} max={60} inputMode="numeric" value={form.years ?? ''} onChange={(e) => patch({ years: e.target.value === '' ? null : Number(e.target.value) })} placeholder="z.B. 8" className={inputCls} /></Field>
                    <Field label="Wie oft spielst du?"><Pills options={FREQ.map((f) => ({ id: f.id, label: f.label }))} value={form.frequency || undefined} onChange={(v) => patch({ frequency: v })} /></Field>
                  </>
                )}

                <div className="rounded-2xl bg-white/[.03] border border-white/[.06] p-4 space-y-3.5">
                  <div className="text-[11px] font-mono uppercase tracking-wider text-hl-dim">Selbsteinschätzung · 1 = mäßig, 10 = top</div>
                  {RATINGS.map((r) => <RatingScale key={r.key} label={r.label} value={form.ratings?.[r.key]} onChange={(n) => setRating(r.key, n)} />)}
                </div>

                <Field label="Warum sollte dich ein Team nehmen?"><textarea value={form.motivation || ''} onChange={(e) => patch({ motivation: e.target.value })} rows={3} maxLength={800} placeholder="Deine Stärken, Erfahrung, was dich ausmacht …" className={`${inputCls} resize-none`} /></Field>
                <Field label="Wie hast du von uns erfahren?"><Pills options={HEARD.map((h) => ({ id: h.id as string, label: h.label }))} value={form.heardFrom || undefined} onChange={(v) => patch({ heardFrom: v })} /></Field>

                {cfg?.turnstileSiteKey && <div ref={turnstile.ref} className="flex justify-center" />}
                <PrimaryBtn onClick={playerToVerify} disabled={busy}>{busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <>Weiter zur Bestätigung <ArrowRight className="w-4 h-4" /></>}</PrimaryBtn>
              </div>
            )}

            {/* Bestätigung (beide Wege) */}
            {step === 'verify' && (
              <div className="space-y-5">
                <div className="text-center">
                  <div className="w-14 h-14 rounded-2xl grid place-items-center mx-auto mb-3" style={{ background: 'rgba(47,91,255,.14)', border: '1px solid rgba(47,91,255,.3)' }}><KeyRound className="w-7 h-7 text-[#83A0FF]" /></div>
                  <h2 className="font-display font-black text-2xl uppercase tracking-tight text-white">E-Mail bestätigen</h2>
                  <p className="text-hl-soft text-[14px] mt-1.5">Code an<br /><span className="font-semibold text-white">{email}</span> geschickt.</p>
                </div>
                {devCode && <div className="text-center text-[12px] text-yellow-300 bg-yellow-500/10 border border-yellow-500/20 rounded-xl py-2">Test-Modus – dein Code: <strong className="tracking-widest">{devCode}</strong></div>}
                {err && <ErrorMsg>{err}</ErrorMsg>}
                <input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" placeholder="••••••" className={`${inputCls} text-center text-[26px] tracking-[.5em] font-mono font-bold`} autoFocus />
                <label className="flex items-start gap-2.5 cursor-pointer select-none">
                  <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 w-5 h-5 rounded accent-[#2F5BFF] shrink-0" />
                  <span className="text-[13px] text-hl-soft leading-relaxed">Mir ist klar, dass das eine <strong className="text-white">unverbindliche Vorregistrierung</strong> ist und kein garantierter Platz in {seasonLabel}.</span>
                </label>
                <PrimaryBtn onClick={finish} disabled={busy || code.length !== 6 || !consent}>{busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <><CheckCircle2 className="w-4 h-4" /> Anmeldung abschließen</>}</PrimaryBtn>
                <button onClick={resendCode} disabled={busy} className="w-full flex items-center justify-center gap-1.5 text-[13px] text-hl-mute hover:text-white transition-colors cursor-pointer"><RefreshCw className="w-3.5 h-3.5" /> Code erneut senden</button>
              </div>
            )}

            {step === 'done' && (
              <motion.div initial={{ scale: .9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 300, damping: 20 }} className="text-center py-8 space-y-4">
                <div className="w-20 h-20 rounded-full grid place-items-center mx-auto" style={{ background: GRAD, boxShadow: '0 20px 50px -18px rgba(47,91,255,.8)' }}><CheckCircle2 className="w-11 h-11 text-white" /></div>
                <h2 className="font-display font-black text-3xl uppercase tracking-tight text-white">Anmeldung eingegangen!</h2>
                <p className="text-hl-soft text-[15px] max-w-sm mx-auto leading-relaxed">Danke, {(entry === 'player' ? form.name : form.contactName)?.split(' ')[0] || 'Leute'}! Wir haben deine {entry === 'player' ? 'Spieler-' : ''}Vorregistrierung für {seasonLabel} erhalten und eine Bestätigung an <span className="text-white font-semibold">{email}</span> geschickt.</p>
                <div className="rounded-2xl border border-yellow-500/25 bg-yellow-500/[.07] px-4 py-3 text-[13px] text-yellow-100/90 max-w-sm mx-auto text-left flex items-start gap-2.5"><ShieldCheck className="w-4 h-4 text-yellow-300 shrink-0 mt-0.5" /><span>Denk dran: noch kein fester Platz – wir melden uns persönlich.</span></div>

                {cfg?.donationUrl && (
                  <div className="hl-card rounded-2xl p-5 text-left max-w-sm mx-auto">
                    <div className="flex items-center gap-2 text-white font-display font-black uppercase tracking-tight"><Heart className="w-4 h-4 text-[#83A0FF]" /> Bock, uns zu unterstützen?</div>
                    <p className="text-[13px] text-hl-mute mt-1 mb-3">Über einen freiwilligen Beitrag freuen wir uns riesig – jeder Euro fließt in die Hero League. 💙</p>
                    <a href={cfg.donationUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-[14px] font-bold text-white cursor-pointer" style={{ background: GRAD }}><Heart className="w-4 h-4" /> Hero League unterstützen</a>
                  </div>
                )}

                <button onClick={() => onNavigate('/')} className="inline-flex items-center gap-2 rounded-2xl px-6 py-3 mt-2 text-[14px] font-display font-black uppercase tracking-wide text-white cursor-pointer" style={{ background: GRAD }}>Zur Startseite <ArrowRight className="w-4 h-4" /></button>
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
