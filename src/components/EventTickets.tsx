import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowLeft, ArrowRight, Ticket as TicketIcon, Mail, KeyRound, CheckCircle2, AlertCircle,
  Loader2, RefreshCw, Minus, Plus, CalendarDays, MapPin, Heart, PartyPopper, Camera, X,
} from 'lucide-react';
import { useBackClose } from '../lib/backStack';
import {
  fetchTicketConfig, requestTicketCode, confirmTicket, useTurnstile, type TicketConfig, type TicketBlockPublic, type TicketBlockTeam,
} from '../lib/register';

// Öffentliche Zuschauer-Ticket-Anmeldung für EINE Veranstaltung (Opening Night,
// Testspieltag, Spieltag …) – welche, bestimmt `eventKey`. Kostenlos & fair
// (E-Mail-Bestätigung, begrenzte Plätze). Eigene Magenta/Gold-Welt des Events.

type Step = 'form' | 'verify' | 'done';
const FALLBACK_ACCENT = '#E9C46A';
const FALLBACK_DARK = '#6b4d12';

function ErrorMsg({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 text-[13px] text-rose-200 bg-rose-500/10 border border-rose-500/20 rounded-xl px-3 py-2.5">
      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
      <span>{children}</span>
    </div>
  );
}
// Fokusfarbe kommt aus der Variablen --tk, die je Veranstaltung gesetzt wird.
const inputCls =
  'w-full bg-white/[.05] border border-white/10 rounded-xl px-4 py-3 text-[15px] text-white placeholder-hl-faint focus:border-[color:var(--tk)] focus:outline-none focus:ring-2 focus:ring-[color:var(--tk)]/25 transition-colors';

const PrimaryBtn = ({ children, disabled, onClick, grad }: { children: React.ReactNode; disabled?: boolean; onClick?: () => void; grad: string }) => (
  <button type="button" disabled={disabled} onClick={onClick}
    className="w-full flex items-center justify-center gap-2 rounded-2xl py-3.5 text-[15px] font-display font-black uppercase tracking-wide text-white transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed active:scale-[.99]"
    style={{ background: grad, boxShadow: '0 12px 30px -14px rgba(0,0,0,.6)' }}>
    {children}
  </button>
);

export default function EventTickets({
  onNavigate,
  eventKey,
  backTo = '/',
  backLabel = 'Zur Startseite',
}: {
  onNavigate: (path: string) => void;
  eventKey?: string;
  backTo?: string; // wohin der Zurück-Knopf führt (je nachdem, woher man kam)
  backLabel?: string;
}) {
  const [cfg, setCfg] = useState<TicketConfig | null>(null);
  const [step, setStep] = useState<Step>('form');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [qty, setQty] = useState(1);
  const [code, setCode] = useState('');
  // Einwilligung zur Datenspeicherung – Pflicht, bevor Daten abgeschickt werden.
  const [consent, setConsent] = useState(false);
  const [consentOpen, setConsentOpen] = useState(false);
  const [devCode, setDevCode] = useState('');
  const [result, setResult] = useState<{ code: string; quantity: number; donationUrl: string; blockLabel?: string } | null>(null);
  // Block-Tickets: gewählter Block ('b1', 'b2' … oder 'all' = ganzer Abend).
  const [block, setBlock] = useState('');
  // Spenden-Pop-up direkt nach der Bestätigung (Text im Backend einstellbar).
  const [donation, setDonation] = useState<{ url: string; title: string; text: string } | null>(null);
  useBackClose(donation !== null, () => setDonation(null));
  const honeypot = useRef('');

  const turnstile = useTurnstile(cfg?.turnstileSiteKey);

  // Ohne Schlüssel liefert der Server NUR die Liste der offenen Veranstaltungen.
  // Gibt es genau eine, wird sie genommen; bei mehreren erscheint eine Auswahl.
  // Es wird NIE stillschweigend eine „passende" Veranstaltung geraten.
  const [choices, setChoices] = useState<TicketConfig[] | null>(null);
  const load = () =>
    fetchTicketConfig(eventKey)
      .then((c) => {
        if (!eventKey && Array.isArray(c.events)) {
          if (c.events.length === 1) { setChoices(null); setCfg({ ...c.events[0], turnstileSiteKey: c.turnstileSiteKey }); }
          else { setCfg(null); setChoices(c.events); }
          return;
        }
        setChoices(null);
        setCfg(c);
      })
      .catch(() => { setCfg(null); setChoices(null); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); window.scrollTo(0, 0); }, [eventKey]);

  // Vorwärts + Handy-Zurück: History-Eintrag je Schritt, damit „zurück" einen
  // Schritt zurückgeht statt die Seite zu verlassen.
  const goStep = (to: Step) => { window.history.pushState(null, ''); setErr(''); setStep(to); window.scrollTo(0, 0); };
  useEffect(() => {
    const onPop = () => setStep((s) => (s === 'verify' ? 'form' : s));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  // Farben kommen pro Veranstaltung aus dem Backend.
  const accent = cfg?.accent || FALLBACK_ACCENT;
  const accentDark = cfg?.accentDark || FALLBACK_DARK;
  const grad = `linear-gradient(135deg,${accentDark},${accent})`;

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const maxPer = cfg?.maxPerEmail ?? 4;
  const blocks = cfg?.blocks && cfg.blocks.length >= 2 ? cfg.blocks : null;
  const fullFree = blocks ? Math.min(...blocks.map((b) => b.remaining)) : 0;
  const blockFree = (id: string) => (id === 'all' ? fullFree : blocks?.find((b) => b.id === id)?.remaining ?? 0);
  // Freie Plätze für die Personenzahl: im Block-Modus die des gewählten Blocks.
  const remaining = blocks ? (block ? blockFree(block) : Math.max(0, ...blocks.map((b) => b.remaining))) : cfg?.remaining ?? 0;

  const requestCode = async () => {
    if (!name.trim()) { setErr('Bitte deinen Namen angeben.'); return; }
    if (!emailValid) { setErr('Bitte eine gültige E-Mail-Adresse eingeben.'); return; }
    if (!consent) { setErr('Bitte die Einwilligung zur Datenspeicherung bestätigen.'); return; }
    if (blocks && !block) { setErr('Bitte wähle, wann du kommst (Block).'); return; }
    if (blocks && qty > blockFree(block)) { setErr(`In diesem Block sind nur noch ${blockFree(block)} Plätze frei.`); return; }
    if (!turnstile.ready) { setErr('Bitte kurz die Bot-Prüfung abschließen.'); return; }
    setBusy(true); setErr('');
    try {
      const r = await requestTicketCode({ eventKey: cfg?.eventKey, name: name.trim(), email: email.trim(), quantity: qty, consent, website: honeypot.current, turnstileToken: turnstile.token, block: blocks ? block : undefined });
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
      const r = await requestTicketCode({ eventKey: cfg?.eventKey, name: name.trim(), email: email.trim(), quantity: qty, consent, website: honeypot.current, turnstileToken: turnstile.token, block: blocks ? block : undefined });
      if (r.devCode) setDevCode(r.devCode);
      turnstile.reset();
    } catch (e) { setErr(e instanceof Error ? e.message : 'Erneutes Senden fehlgeschlagen.'); }
    finally { setBusy(false); }
  };

  const confirm = async () => {
    if (!/^\d{6}$/.test(code.trim())) { setErr('Bitte den 6-stelligen Code eingeben.'); return; }
    setBusy(true); setErr('');
    try {
      const r = await confirmTicket(email.trim(), code.trim(), cfg?.eventKey);
      setResult({ code: r.code, quantity: r.quantity, donationUrl: r.donationUrl || '', blockLabel: r.blockLabel || '' });
      setStep('done'); window.scrollTo(0, 0);
      if (r.donationPopup && r.donationUrl) {
        const d = { url: r.donationUrl, title: r.donationTitle || 'Kurze, ehrliche Bitte', text: r.donationText || '' };
        setTimeout(() => setDonation(d), 900); // erst kurz das bestätigte Ticket zeigen
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Bestätigung fehlgeschlagen.');
    } finally { setBusy(false); }
  };

  const closed = cfg && !cfg.open;
  const soldOut = cfg && cfg.open && remaining <= 0;

  return (
    <div
      className="min-h-screen bg-brand-dark text-hl-text font-sans flex flex-col relative overflow-hidden"
      style={{ ['--tk' as string]: accent } as React.CSSProperties}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[440px]" style={{ background: `radial-gradient(120% 100% at 50% -10%, ${accent}3d, transparent 60%)` }} />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[440px]" style={{ background: `radial-gradient(90% 80% at 100% 0%, ${accentDark}59, transparent 55%)` }} />

      <header className="relative border-b border-white/[.07] backdrop-blur-xl" style={{ paddingTop: 'calc(env(safe-area-inset-top) + .75rem)' }}>
        <div className="max-w-3xl mx-auto px-4 pb-3 flex items-center justify-between">
          <button onClick={() => (step === 'form' || step === 'done' ? onNavigate(backTo) : window.history.back())}
            className="flex items-center gap-1.5 text-[13px] text-hl-mute hover:text-white transition-colors font-semibold cursor-pointer">
            <ArrowLeft className="w-4 h-4" /> {step === 'form' || step === 'done' ? backLabel : 'Zurück'}
          </button>
          <img src="/assets/hero-league-logo.png" alt="Hero League" className="h-8 w-auto" />
        </div>
      </header>

      <main className="relative flex-1 w-full max-w-lg mx-auto px-4 py-7">
        <input type="text" tabIndex={-1} autoComplete="off" aria-hidden="true"
          onChange={(e) => (honeypot.current = e.target.value)} style={{ position: 'absolute', left: '-9999px', width: 1, height: 1, opacity: 0 }} />

        <AnimatePresence mode="wait">
          <motion.div key={step} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }} transition={{ type: 'spring', stiffness: 380, damping: 32 }}>

            {/* Mehrere Veranstaltungen offen und keine ausgewählt: bewusst fragen,
                statt eine zu raten. Genau hier ging vorher der Testspieltag
                versehentlich auf die Opening Night. */}
            {step === 'form' && choices && (
              <div className="space-y-4">
                <h1 className="font-display font-black text-3xl uppercase tracking-tight text-white leading-tight">
                  Welche Veranstaltung?
                </h1>
                {choices.length === 0 && (
                  <p className="text-hl-soft text-[15px]">Aktuell gibt es keine offene Ticket-Anmeldung.</p>
                )}
                {choices.map((c) => (
                  <button
                    key={c.eventKey}
                    onClick={() => onNavigate(`/tickets/${encodeURIComponent(c.eventKey)}`)}
                    className="w-full text-left hl-card rounded-2xl px-4 py-4 cursor-pointer hover:bg-white/[.06] transition-colors border"
                    style={{ borderColor: `${c.accent}59` }}
                  >
                    <div className="font-display font-black text-lg text-white">{c.title}</div>
                    {c.dateLabel && <div className="text-[13px] text-hl-soft mt-0.5">{c.dateLabel}</div>}
                    <div className="text-[12px] mt-1.5" style={{ color: c.accent }}>
                      Noch {c.remaining} von {c.capacity} Plätzen frei
                    </div>
                  </button>
                ))}
              </div>
            )}

            {step === 'form' && !choices && (
              <div className="space-y-5">
                <div>
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider mb-3" style={{ background: `${accent}29`, color: `${accent}`, border: `1px solid ${accent}59` }}>
                    <TicketIcon className="w-3.5 h-3.5" /> Zuschauer-Tickets
                  </div>
                  <h1 className="font-display font-black text-3xl sm:text-4xl uppercase tracking-tight text-white leading-[1.05]">{cfg?.title || 'Zuschauer-Tickets'}</h1>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2.5 text-[14px] text-hl-soft">
                    {cfg?.dateLabel && <span className="inline-flex items-center gap-1.5"><CalendarDays className="w-4 h-4" style={{ color: accent }} /> {cfg.dateLabel}</span>}
                    {cfg?.locationLabel && <span className="inline-flex items-center gap-1.5"><MapPin className="w-4 h-4" style={{ color: accent }} /> {cfg.locationLabel}</span>}
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
                    {blocks ? (
                      <BlockPicker
                        blocks={blocks}
                        allowFull={cfg.allowFull !== false}
                        fullFree={fullFree}
                        value={block}
                        accent={accent}
                        onChange={(id) => { setBlock(id); setQty((q) => Math.max(1, Math.min(q, blockFree(id) || 1))); }}
                      />
                    ) : (
                      <div className="flex items-center justify-between hl-card rounded-2xl px-4 py-3">
                        <span className="text-[13px] text-hl-mute">Noch verfügbar</span>
                        <span className="font-display font-black text-lg text-white tabular-nums">{remaining} / <span style={{ color: `${accent}` }}>{cfg.capacity}</span></span>
                      </div>
                    )}
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
                    {/* Einwilligung: Pflicht-Haken, Wortlaut aufklappbar zum Lesen.
                        Gespeichert wird später, WANN und WELCHEM Text zugestimmt wurde. */}
                    <div className="rounded-2xl border border-white/10 bg-white/[.03] px-4 py-3">
                      <label className="flex items-start gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={consent}
                          onChange={(e) => setConsent(e.target.checked)}
                          className="mt-0.5 w-5 h-5 shrink-0 cursor-pointer accent-current"
                          style={{ accentColor: accent }}
                        />
                        <span className="text-[13px] text-hl-soft leading-snug">
                          Ich stimme der Speicherung meiner Daten zu.{' '}
                          <button
                            type="button"
                            onClick={(e) => { e.preventDefault(); setConsentOpen((o) => !o); }}
                            className="underline underline-offset-2 cursor-pointer"
                            style={{ color: accent }}
                          >
                            {consentOpen ? 'Text ausblenden' : 'Text lesen'}
                          </button>
                        </span>
                      </label>
                      {consentOpen && (
                        <div className="mt-3 pt-3 border-t border-white/10 text-[12px] text-hl-mute leading-relaxed whitespace-pre-line">
                          {cfg.consentText}
                          <button
                            type="button"
                            onClick={() => onNavigate('/datenschutz')}
                            className="block mt-2 underline underline-offset-2 cursor-pointer"
                            style={{ color: accent }}
                          >
                            Zur Datenschutzerklärung
                          </button>
                        </div>
                      )}
                      {/* Fester Hinweis auf Foto-/Videoaufnahmen – immer sichtbar, unabhängig vom Einwilligungstext im Admin. */}
                      <div className="mt-3 pt-3 border-t border-white/10 flex items-start gap-2.5 text-[12px] text-hl-soft leading-relaxed">
                        <Camera className="w-4 h-4 shrink-0 mt-0.5" style={{ color: accent }} />
                        <p>
                          <b className="text-white">Hinweis:</b> Bei der Veranstaltung werden Fotos und Videos gemacht,
                          die auf unserer Website und unseren Social-Media-Kanälen veröffentlicht werden. Zuschauer können
                          außerdem im Livestream zu sehen sein.
                        </p>
                      </div>
                    </div>
                    {cfg.turnstileSiteKey && <div ref={turnstile.ref} className="flex justify-center" />}
                    <PrimaryBtn grad={grad} onClick={requestCode} disabled={busy || !name.trim() || !emailValid || !consent}>
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
                  <div className="w-14 h-14 rounded-2xl grid place-items-center mx-auto mb-3" style={{ background: `${accent}29`, border: `1px solid ${accent}59` }}>
                    <KeyRound className="w-7 h-7" style={{ color: accent }} />
                  </div>
                  <h2 className="font-display font-black text-2xl uppercase tracking-tight text-white">E-Mail bestätigen</h2>
                  <p className="text-hl-soft text-[14px] mt-1.5">Code an <span className="font-semibold text-white">{email}</span> geschickt. Deine Plätze sind 15 Min reserviert.</p>
                </div>
                {devCode && <div className="text-center text-[12px] text-yellow-300 bg-yellow-500/10 border border-yellow-500/20 rounded-xl py-2">Test-Modus – dein Code: <strong className="tracking-widest">{devCode}</strong></div>}
                {err && <ErrorMsg>{err}</ErrorMsg>}
                <input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code"
                  placeholder="••••••" className={`${inputCls} text-center text-[26px] tracking-[.5em] font-mono font-bold`} autoFocus />
                <PrimaryBtn grad={grad} onClick={confirm} disabled={busy || code.length !== 6}>
                  {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <><CheckCircle2 className="w-4 h-4" /> Ticket bestätigen</>}
                </PrimaryBtn>
                <button onClick={resend} disabled={busy} className="w-full flex items-center justify-center gap-1.5 text-[13px] text-hl-mute hover:text-white transition-colors cursor-pointer">
                  <RefreshCw className="w-3.5 h-3.5" /> Code erneut senden
                </button>
              </div>
            )}

            {step === 'done' && result && (
              <motion.div initial={{ scale: .9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 300, damping: 20 }} className="text-center py-6 space-y-4">
                <div className="w-20 h-20 rounded-full grid place-items-center mx-auto" style={{ background: grad, boxShadow: `0 20px 50px -18px ${accent}d9` }}>
                  <PartyPopper className="w-11 h-11 text-white" />
                </div>
                <h2 className="font-display font-black text-3xl uppercase tracking-tight text-white">Ticket bestätigt!</h2>
                <p className="text-hl-soft text-[15px]">Für <span className="text-white font-semibold">{result.quantity} Person{result.quantity === 1 ? '' : 'en'}</span> · wir haben dir alles per E-Mail geschickt.</p>
                {result.blockLabel && (
                  <p className="text-[14px] text-white font-semibold">Einlass: <span style={{ color: accent }}>{result.blockLabel}</span></p>
                )}

                <div className="hl-card rounded-2xl p-5">
                  <div className="text-[11px] font-mono uppercase tracking-wider text-hl-dim mb-1.5">Dein Ticket-Code</div>
                  <div className="font-mono font-black text-3xl tracking-[.2em] text-white">{result.code}</div>
                  <div className="text-[12px] text-hl-faint mt-2">Zeig diesen Code am Einlass.</div>
                </div>

                {result.donationUrl && (
                  <div className="hl-card rounded-2xl p-5 text-left">
                    <div className="flex items-center gap-2 text-white font-display font-black uppercase tracking-tight"><Heart className="w-4 h-4" style={{ color: accent }} /> Uns unterstützen?</div>
                    <p className="text-[13px] text-hl-mute mt-1 mb-3">Die Tickets sind kostenlos. Wenn du magst, freuen wir uns über einen freiwilligen Beitrag – jeder Euro hilft der Liga. 💚</p>
                    <a href={result.donationUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-[14px] font-bold text-white cursor-pointer" style={{ background: grad }}>
                      <Heart className="w-4 h-4" /> Freiwillig unterstützen
                    </a>
                  </div>
                )}

                <button onClick={() => onNavigate(backTo)} className="inline-flex items-center gap-2 rounded-2xl px-6 py-3 mt-1 text-[14px] font-display font-black uppercase tracking-wide text-white cursor-pointer" style={{ background: grad }}>
                  {backLabel} <ArrowRight className="w-4 h-4" />
                </button>
              </motion.div>
            )}
          </motion.div>
        </AnimatePresence>
      </main>

      <AnimatePresence>
        {donation && (
          <motion.div
            key="donation"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-6"
            role="dialog"
            aria-modal="true"
          >
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setDonation(null)} />
            <motion.div
              initial={{ y: 40, scale: .97, opacity: 0 }}
              animate={{ y: 0, scale: 1, opacity: 1 }}
              exit={{ y: 30, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 320, damping: 28 }}
              className="hl-modal-card relative w-full sm:max-w-md max-h-[90vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl border border-white/10 px-6 pt-7 text-left"
              style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 1.5rem)' }}
            >
              <button
                onClick={() => setDonation(null)}
                aria-label="Schließen"
                className="absolute top-3 right-3 w-9 h-9 grid place-items-center rounded-xl text-hl-mute hover:text-white hover:bg-white/10 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
              <div className="w-14 h-14 rounded-2xl grid place-items-center mb-4" style={{ background: grad, boxShadow: `0 16px 40px -16px ${accent}d9` }}>
                <Heart className="w-7 h-7 text-white" />
              </div>
              <h2 className="font-display font-black text-2xl uppercase tracking-tight text-white pr-8">{donation.title}</h2>
              <p className="text-[14.5px] text-hl-soft leading-relaxed mt-3 whitespace-pre-line">{donation.text}</p>
              <a
                href={donation.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setDonation(null)}
                className="mt-6 w-full inline-flex items-center justify-center gap-2 rounded-2xl px-5 py-3.5 text-[15px] font-display font-black uppercase tracking-wide text-white cursor-pointer"
                style={{ background: grad }}
              >
                <Heart className="w-4 h-4" /> Jetzt spenden
              </a>
              <button
                onClick={() => setDonation(null)}
                className="mt-2 w-full rounded-2xl px-5 py-3 text-[13px] font-bold text-hl-mute hover:text-white cursor-pointer"
              >
                Vielleicht später
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <footer className="relative border-t border-white/[.06] py-5 text-center">
        <div className="flex items-center justify-center gap-4 text-[12px] text-hl-faint">
          <button onClick={() => onNavigate('/impressum')} className="hover:text-hl-mute transition-colors cursor-pointer">Impressum</button>
          <button onClick={() => onNavigate('/datenschutz')} className="hover:text-hl-mute transition-colors cursor-pointer">Datenschutz</button>
        </div>
      </footer>
    </div>
  );
}

// Block-Auswahl (Block-Tickets): je Block Uhrzeit, freie Plätze und die Teams,
// die in diesem Block spielen (live aus dem Spielplan) + optional „Ganzer Abend".
function BlockPicker({
  blocks,
  allowFull,
  fullFree,
  value,
  accent,
  onChange,
}: {
  blocks: TicketBlockPublic[];
  allowFull: boolean;
  fullFree: number;
  value: string;
  accent: string;
  onChange: (id: string) => void;
}) {
  const options = [
    ...blocks.map((b) => ({ id: b.id, title: b.label, time: `${b.from}–${b.to} Uhr`, free: b.remaining, teams: b.teams, hint: '' })),
    ...(allowFull
      ? [{
          id: 'all', title: 'Ganzer Abend', time: `${blocks[0].from}–${blocks[blocks.length - 1].to} Uhr`, free: fullFree,
          teams: [] as TicketBlockTeam[], hint: 'Alle Spiele – du bleibst den ganzen Abend (belegt in jedem Block einen Platz).',
        }]
      : []),
  ];
  return (
    <div>
      <span className="block text-[11px] font-mono uppercase tracking-wider text-hl-dim mb-1.5">Wann kommst du?</span>
      <div className="grid grid-cols-1 gap-2.5">
        {options.map((o) => {
          const on = value === o.id;
          const full = o.free <= 0;
          return (
            <button
              key={o.id}
              type="button"
              disabled={full}
              onClick={() => onChange(o.id)}
              className={`w-full text-left rounded-2xl border px-4 py-3 transition-colors min-w-0 ${
                full ? 'opacity-50 cursor-not-allowed border-white/10 bg-white/[.02]' : 'cursor-pointer hover:bg-white/[.05]'
              }`}
              style={on ? { borderColor: accent, background: `${accent}1f`, boxShadow: `0 0 0 1px ${accent}` } : { borderColor: 'rgba(255,255,255,.1)' }}
            >
              <div className="flex items-center gap-3 min-w-0">
                <span
                  className="w-5 h-5 rounded-full border-2 grid place-items-center shrink-0"
                  style={{ borderColor: on ? accent : 'rgba(255,255,255,.3)' }}
                >
                  {on && <span className="w-2.5 h-2.5 rounded-full" style={{ background: accent }} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-display font-black uppercase tracking-tight text-white text-[17px] leading-tight">{o.title}</span>
                  <span className="block text-[12px] text-hl-mute">{o.time}</span>
                </span>
                <span className={`shrink-0 text-[12px] font-bold tabular-nums ${full ? 'text-rose-300' : 'text-hl-soft'}`}>
                  {full ? 'Ausgebucht' : `${o.free} frei`}
                </span>
              </div>
              {o.hint && <p className="text-[12px] text-hl-dim mt-2 leading-snug">{o.hint}</p>}
              {o.teams.length > 0 && (
                <div className="flex flex-wrap gap-x-3 gap-y-1.5 mt-2.5">
                  {o.teams.map((t) => (
                    <span key={t.id} className="inline-flex items-center gap-1.5 min-w-0 max-w-full">
                      {t.logoUrl ? (
                        <img src={t.logoUrl} alt="" loading="lazy" className="w-5 h-5 object-contain shrink-0" />
                      ) : (
                        <span className="w-5 h-5 rounded-full grid place-items-center text-[8px] font-black text-white shrink-0" style={{ background: t.color }}>
                          {(t.shortName || t.name).slice(0, 2).toUpperCase()}
                        </span>
                      )}
                      <span className="text-[12.5px] text-hl-soft truncate">{t.name}</span>
                    </span>
                  ))}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
