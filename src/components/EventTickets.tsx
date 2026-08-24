import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowLeft, ArrowRight, Ticket as TicketIcon, Mail, KeyRound, CheckCircle2, AlertCircle,
  Loader2, RefreshCw, Minus, Plus, CalendarDays, MapPin, Heart, PartyPopper,
} from 'lucide-react';
import {
  fetchTicketConfig, requestTicketCode, confirmTicket, useTurnstile, type TicketConfig,
} from '../lib/register';

// Öffentliche Zuschauer-Ticket-Anmeldung für den Testspieltag. Kostenlos & fair
// (E-Mail-Bestätigung, begrenzte Plätze). Eigene Magenta/Gold-Welt des Events.

type Step = 'form' | 'verify' | 'done';
const ACCENT = '#E6238E';
const GRAD = 'linear-gradient(135deg,#7a0f49,#E6238E)';

function ErrorMsg({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 text-[13px] text-rose-200 bg-rose-500/10 border border-rose-500/20 rounded-xl px-3 py-2.5">
      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
      <span>{children}</span>
    </div>
  );
}
const inputCls =
  'w-full bg-white/[.05] border border-white/10 rounded-xl px-4 py-3 text-[15px] text-white placeholder-hl-faint focus:border-[#E6238E] focus:outline-none focus:ring-2 focus:ring-[#E6238E]/25 transition-colors';

const PrimaryBtn = ({ children, disabled, onClick }: { children: React.ReactNode; disabled?: boolean; onClick?: () => void }) => (
  <button type="button" disabled={disabled} onClick={onClick}
    className="w-full flex items-center justify-center gap-2 rounded-2xl py-3.5 text-[15px] font-display font-black uppercase tracking-wide text-white transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed active:scale-[.99]"
    style={{ background: GRAD, boxShadow: '0 12px 30px -14px rgba(230,35,142,.7)' }}>
    {children}
  </button>
);

export default function EventTickets({ onNavigate }: { onNavigate: (path: string) => void }) {
  const [cfg, setCfg] = useState<TicketConfig | null>(null);
  const [step, setStep] = useState<Step>('form');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [qty, setQty] = useState(1);
  const [code, setCode] = useState('');
  const [devCode, setDevCode] = useState('');
  const [result, setResult] = useState<{ code: string; quantity: number; donationUrl: string } | null>(null);
  const honeypot = useRef('');

  const turnstile = useTurnstile(cfg?.turnstileSiteKey);

  const load = () => fetchTicketConfig().then(setCfg).catch(() => setCfg(null));
  useEffect(() => { load(); window.scrollTo(0, 0); }, []);

  // Vorwärts + Handy-Zurück: History-Eintrag je Schritt, damit „zurück" einen
  // Schritt zurückgeht statt die Seite zu verlassen.
  const goStep = (to: Step) => { window.history.pushState(null, ''); setErr(''); setStep(to); window.scrollTo(0, 0); };
  useEffect(() => {
    const onPop = () => setStep((s) => (s === 'verify' ? 'form' : s));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const maxPer = cfg?.maxPerEmail ?? 4;
  const remaining = cfg?.remaining ?? 0;

  const requestCode = async () => {
    if (!name.trim()) { setErr('Bitte deinen Namen angeben.'); return; }
    if (!emailValid) { setErr('Bitte eine gültige E-Mail-Adresse eingeben.'); return; }
    if (!turnstile.ready) { setErr('Bitte kurz die Bot-Prüfung abschließen.'); return; }
    setBusy(true); setErr('');
    try {
      const r = await requestTicketCode({ name: name.trim(), email: email.trim(), quantity: qty, website: honeypot.current, turnstileToken: turnstile.token });
      if (r.devCode) setDevCode(r.devCode);
      turnstile.reset();
      goStep('verify'); setErr(''); window.scrollTo(0, 0);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Etwas ist schiefgelaufen.');
    } finally { setBusy(false); }
  };

  const resend = async () => {
    setBusy(true); setErr('');
    try {
      const r = await requestTicketCode({ name: name.trim(), email: email.trim(), quantity: qty, website: honeypot.current, turnstileToken: turnstile.token });
      if (r.devCode) setDevCode(r.devCode);
      turnstile.reset();
    } catch (e) { setErr(e instanceof Error ? e.message : 'Erneutes Senden fehlgeschlagen.'); }
    finally { setBusy(false); }
  };

  const confirm = async () => {
    if (!/^\d{6}$/.test(code.trim())) { setErr('Bitte den 6-stelligen Code eingeben.'); return; }
    setBusy(true); setErr('');
    try {
      const r = await confirmTicket(email.trim(), code.trim());
      setResult({ code: r.code, quantity: r.quantity, donationUrl: r.donationUrl || '' });
      setStep('done'); window.scrollTo(0, 0);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Bestätigung fehlgeschlagen.');
    } finally { setBusy(false); }
  };

  const closed = cfg && !cfg.open;
  const soldOut = cfg && cfg.open && remaining <= 0;

  return (
    <div className="min-h-screen bg-brand-dark text-hl-text font-sans flex flex-col relative overflow-hidden">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[440px]" style={{ background: 'radial-gradient(120% 100% at 50% -10%, rgba(230,35,142,.24), transparent 60%)' }} />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[440px]" style={{ background: 'radial-gradient(90% 80% at 100% 0%, rgba(233,196,106,.12), transparent 55%)' }} />

      <header className="relative border-b border-white/[.07] backdrop-blur-xl" style={{ paddingTop: 'calc(env(safe-area-inset-top) + .75rem)' }}>
        <div className="max-w-3xl mx-auto px-4 pb-3 flex items-center justify-between">
          <button onClick={() => (step === 'form' || step === 'done' ? onNavigate('/testspiel') : window.history.back())}
            className="flex items-center gap-1.5 text-[13px] text-hl-mute hover:text-white transition-colors font-semibold cursor-pointer">
            <ArrowLeft className="w-4 h-4" /> {step === 'form' || step === 'done' ? 'Zum Testspieltag' : 'Zurück'}
          </button>
          <img src="/assets/hero-league-logo.png" alt="Hero League" className="h-8 w-auto" />
        </div>
      </header>

      <main className="relative flex-1 w-full max-w-lg mx-auto px-4 py-7">
        <input type="text" tabIndex={-1} autoComplete="off" aria-hidden="true"
          onChange={(e) => (honeypot.current = e.target.value)} style={{ position: 'absolute', left: '-9999px', width: 1, height: 1, opacity: 0 }} />

        <AnimatePresence mode="wait">
          <motion.div key={step} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }} transition={{ type: 'spring', stiffness: 380, damping: 32 }}>

            {step === 'form' && (
              <div className="space-y-5">
                <div>
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider mb-3" style={{ background: 'rgba(230,35,142,.16)', color: '#ff7ac4', border: '1px solid rgba(230,35,142,.35)' }}>
                    <TicketIcon className="w-3.5 h-3.5" /> Zuschauer-Tickets
                  </div>
                  <h1 className="font-display font-black text-3xl sm:text-4xl uppercase tracking-tight text-white leading-[1.05]">{cfg?.title || 'Testspieltag'}</h1>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2.5 text-[14px] text-hl-soft">
                    {cfg?.dateLabel && <span className="inline-flex items-center gap-1.5"><CalendarDays className="w-4 h-4 text-[#ff7ac4]" /> {cfg.dateLabel}</span>}
                    {cfg?.locationLabel && <span className="inline-flex items-center gap-1.5"><MapPin className="w-4 h-4 text-[#ff7ac4]" /> {cfg.locationLabel}</span>}
                  </div>
                  {cfg?.note && <p className="text-hl-soft text-[14px] mt-2 leading-relaxed">{cfg.note}</p>}
                </div>

                {!cfg ? (
                  <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-hl-mute" /></div>
                ) : closed ? (
                  <div className="hl-card rounded-2xl p-6 text-center text-hl-mute">Die Ticket-Anmeldung ist derzeit geschlossen.</div>
                ) : soldOut ? (
                  <div className="hl-card rounded-2xl p-6 text-center">
                    <div className="font-display font-black text-xl text-white uppercase">Ausverkauft 🎉</div>
                    <p className="text-hl-mute text-[14px] mt-1">Alle {cfg.capacity} Plätze sind vergeben.</p>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between hl-card rounded-2xl px-4 py-3">
                      <span className="text-[13px] text-hl-mute">Noch verfügbar</span>
                      <span className="font-display font-black text-lg text-white tabular-nums"><span style={{ color: '#ff7ac4' }}>{remaining}</span> / {cfg.capacity}</span>
                    </div>
                    {err && <ErrorMsg>{err}</ErrorMsg>}
                    <label className="block">
                      <span className="block text-[11px] font-mono uppercase tracking-wider text-hl-dim mb-1.5">Dein Name</span>
                      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Vor- und Nachname" className={inputCls} />
                    </label>
                    <label className="block">
                      <span className="block text-[11px] font-mono uppercase tracking-wider text-hl-dim mb-1.5">E-Mail-Adresse</span>
                      <input type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="du@example.de" className={inputCls} />
                    </label>
                    <div>
                      <span className="block text-[11px] font-mono uppercase tracking-wider text-hl-dim mb-1.5">Mit wie vielen kommst du? (max. {maxPer})</span>
                      <div className="flex items-center gap-4">
                        <button type="button" onClick={() => setQty((q) => Math.max(1, q - 1))} className="w-11 h-11 rounded-xl grid place-items-center bg-white/[.06] text-white hover:bg-white/10 cursor-pointer active:scale-95 disabled:opacity-30" disabled={qty <= 1}><Minus className="w-5 h-5" /></button>
                        <span className="font-display font-black text-3xl text-white tabular-nums w-10 text-center">{qty}</span>
                        <button type="button" onClick={() => setQty((q) => Math.min(maxPer, Math.min(remaining, q + 1)))} className="w-11 h-11 rounded-xl grid place-items-center bg-white/[.06] text-white hover:bg-white/10 cursor-pointer active:scale-95 disabled:opacity-30" disabled={qty >= Math.min(maxPer, remaining)}><Plus className="w-5 h-5" /></button>
                        <span className="text-[13px] text-hl-mute">Person{qty === 1 ? '' : 'en'}</span>
                      </div>
                    </div>
                    {cfg.turnstileSiteKey && <div ref={turnstile.ref} className="flex justify-center" />}
                    <PrimaryBtn onClick={requestCode} disabled={busy || !name.trim() || !emailValid}>
                      {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <><TicketIcon className="w-4 h-4" /> Tickets sichern</>}
                    </PrimaryBtn>
                    <p className="text-[12px] text-hl-faint text-center">Kostenlos · wir schicken dir einen Bestätigungs-Code per E-Mail.</p>
                  </>
                )}
              </div>
            )}

            {step === 'verify' && (
              <div className="space-y-5">
                <div className="text-center">
                  <div className="w-14 h-14 rounded-2xl grid place-items-center mx-auto mb-3" style={{ background: 'rgba(230,35,142,.16)', border: '1px solid rgba(230,35,142,.35)' }}>
                    <KeyRound className="w-7 h-7 text-[#ff7ac4]" />
                  </div>
                  <h2 className="font-display font-black text-2xl uppercase tracking-tight text-white">E-Mail bestätigen</h2>
                  <p className="text-hl-soft text-[14px] mt-1.5">Code an <span className="font-semibold text-white">{email}</span> geschickt. Deine Plätze sind 15 Min reserviert.</p>
                </div>
                {devCode && <div className="text-center text-[12px] text-yellow-300 bg-yellow-500/10 border border-yellow-500/20 rounded-xl py-2">Test-Modus – dein Code: <strong className="tracking-widest">{devCode}</strong></div>}
                {err && <ErrorMsg>{err}</ErrorMsg>}
                <input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code"
                  placeholder="••••••" className={`${inputCls} text-center text-[26px] tracking-[.5em] font-mono font-bold`} autoFocus />
                <PrimaryBtn onClick={confirm} disabled={busy || code.length !== 6}>
                  {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <><CheckCircle2 className="w-4 h-4" /> Ticket bestätigen</>}
                </PrimaryBtn>
                <button onClick={resend} disabled={busy} className="w-full flex items-center justify-center gap-1.5 text-[13px] text-hl-mute hover:text-white transition-colors cursor-pointer">
                  <RefreshCw className="w-3.5 h-3.5" /> Code erneut senden
                </button>
              </div>
            )}

            {step === 'done' && result && (
              <motion.div initial={{ scale: .9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 300, damping: 20 }} className="text-center py-6 space-y-4">
                <div className="w-20 h-20 rounded-full grid place-items-center mx-auto" style={{ background: GRAD, boxShadow: '0 20px 50px -18px rgba(230,35,142,.85)' }}>
                  <PartyPopper className="w-11 h-11 text-white" />
                </div>
                <h2 className="font-display font-black text-3xl uppercase tracking-tight text-white">Ticket bestätigt!</h2>
                <p className="text-hl-soft text-[15px]">Für <span className="text-white font-semibold">{result.quantity} Person{result.quantity === 1 ? '' : 'en'}</span> · wir haben dir alles per E-Mail geschickt.</p>

                <div className="hl-card rounded-2xl p-5">
                  <div className="text-[11px] font-mono uppercase tracking-wider text-hl-dim mb-1.5">Dein Ticket-Code</div>
                  <div className="font-mono font-black text-3xl tracking-[.2em] text-white">{result.code}</div>
                  <div className="text-[12px] text-hl-faint mt-2">Zeig diesen Code am Einlass.</div>
                </div>

                {result.donationUrl && (
                  <div className="hl-card rounded-2xl p-5 text-left">
                    <div className="flex items-center gap-2 text-white font-display font-black uppercase tracking-tight"><Heart className="w-4 h-4 text-[#ff7ac4]" /> Uns unterstützen?</div>
                    <p className="text-[13px] text-hl-mute mt-1 mb-3">Die Tickets sind kostenlos. Wenn du magst, freuen wir uns über einen freiwilligen Beitrag – jeder Euro hilft der Liga. 💚</p>
                    <a href={result.donationUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-[14px] font-bold text-white cursor-pointer" style={{ background: GRAD }}>
                      <Heart className="w-4 h-4" /> Freiwillig unterstützen
                    </a>
                  </div>
                )}

                <button onClick={() => onNavigate('/testspiel')} className="inline-flex items-center gap-2 rounded-2xl px-6 py-3 mt-1 text-[14px] font-display font-black uppercase tracking-wide text-white cursor-pointer" style={{ background: GRAD }}>
                  Zum Testspieltag <ArrowRight className="w-4 h-4" />
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
