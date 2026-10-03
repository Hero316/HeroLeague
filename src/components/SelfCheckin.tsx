import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowLeft, ArrowRight, CheckCircle2, AlertCircle, Loader2, Ticket as TicketIcon, Users, MapPin, CalendarDays } from 'lucide-react';
import { fetchSelfCheckinEvents, selfLookup, selfCheckin, type SelfCheckinEvent, type SelfTicket } from '../lib/register';
import { useBackClose } from '../lib/backStack';

// ===========================================================================
// Selbst-Check-in am Eingang (/einchecken) – erreicht über den QR-Code auf dem
// Plakat. Gast gibt E-Mail ODER Ticket-Code ein → sieht sein Ticket → meldet,
// wie viele seiner Anmeldung da sind → fertig. Das zählt direkt als „Erschienen"
// im Backend (Zuschauer-Tickets). Eigenständige Vollbild-Seite → Safe-Area.
// ===========================================================================

type Step = 'find' | 'confirm' | 'done';
const FALLBACK = '#E9C46A';
const FALLBACK_DARK = '#6b4d12';

function ErrorMsg({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 text-[13px] text-rose-200 bg-rose-500/10 border border-rose-500/20 rounded-xl px-3 py-2.5">
      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
      <span>{children}</span>
    </div>
  );
}

export default function SelfCheckin({ onNavigate, eventKey: keyFromUrl }: { onNavigate: (path: string) => void; eventKey?: string }) {
  const [events, setEvents] = useState<SelfCheckinEvent[] | null>(null);
  const [eventKey, setEventKey] = useState<string>('');
  const [step, setStep] = useState<Step>('find');
  const [query, setQuery] = useState('');
  const [ticket, setTicket] = useState<SelfTicket | null>(null);
  const [count, setCount] = useState(1);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    fetchSelfCheckinEvents()
      .then((d) => {
        setEvents(d.events);
        const pick = d.events.find((e) => e.eventKey === keyFromUrl) ?? (d.events.length === 1 ? d.events[0] : null);
        if (pick) setEventKey(pick.eventKey);
      })
      .catch(() => setEvents([]));
  }, [keyFromUrl]);

  // Handy-Zurück: aus Schritt 2 zurück zur Eingabe statt die Seite zu verlassen.
  useBackClose(step === 'confirm', () => setStep('find'));

  const ev = events?.find((e) => e.eventKey === eventKey) ?? null;
  const accent = ev?.accent || FALLBACK;
  const accentDark = ev?.accentDark || FALLBACK_DARK;
  const grad = `linear-gradient(135deg, ${accent}, ${accentDark})`;

  const find = async () => {
    if (!ev || !query.trim()) return;
    setBusy(true);
    setErr('');
    try {
      const t = await selfLookup(ev.eventKey, query.trim());
      setTicket(t);
      setCount(t.arrived > 0 ? t.arrived : t.quantity);
      setStep('confirm');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Kein Ticket gefunden.');
    } finally {
      setBusy(false);
    }
  };

  const checkin = async (n: number) => {
    if (!ev || !ticket) return;
    setBusy(true);
    setErr('');
    try {
      const r = await selfCheckin(ev.eventKey, query.trim(), n);
      setTicket({ ...ticket, arrived: r.arrived });
      setStep('done');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Check-in fehlgeschlagen.');
    } finally {
      setBusy(false);
    }
  };

  const restart = () => {
    setStep('find');
    setQuery('');
    setTicket(null);
    setErr('');
  };

  return (
    <div
      className="min-h-[100svh] w-full text-white flex flex-col"
      style={{
        background: `radial-gradient(120% 70% at 50% 0%, ${accent}2e, transparent 60%), radial-gradient(90% 60% at 50% 100%, ${accentDark}55, transparent 65%), #070b0c`,
        paddingTop: 'calc(env(safe-area-inset-top) + 1rem)',
        paddingBottom: 'calc(env(safe-area-inset-bottom) + 1.25rem)',
        ['--tk' as string]: accent,
      }}
    >
      <div className="w-full max-w-md mx-auto px-4 flex-1 flex flex-col">
        {/* Kopf */}
        <div className="flex items-center justify-between">
          <button onClick={() => onNavigate('/')} className="inline-flex items-center gap-1.5 text-xs font-sans font-bold uppercase tracking-wider text-hl-mute hover:text-white cursor-pointer py-2">
            <ArrowLeft className="w-3.5 h-3.5" /> Website
          </button>
          <img src="/assets/hero-league-logo.png" alt="Hero League" className="h-8 w-auto" />
        </div>

        <div className="mt-6 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-[10px] font-sans font-black uppercase tracking-[2.5px]" style={{ borderColor: `${accent}55`, color: accent, background: `${accent}14` }}>
            <TicketIcon className="w-3.5 h-3.5" /> Check-in
          </div>
          <h1 className="mt-4 font-display font-black uppercase leading-[.9] tracking-tight text-[40px]">
            Willkommen
            <br />
            <span style={{ color: accent, textShadow: `0 0 40px ${accent}66` }}>bei der Hero League</span>
          </h1>
          {ev && (
            <div className="mt-3 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[12px] font-sans text-hl-mute">
              <span className="font-bold text-white/85">{ev.title}</span>
              {ev.dateLabel && (
                <span className="inline-flex items-center gap-1">
                  <CalendarDays className="w-3.5 h-3.5" /> {ev.dateLabel}
                </span>
              )}
              {ev.locationLabel && (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5" /> {ev.locationLabel}
                </span>
              )}
            </div>
          )}
        </div>

        <div className="mt-7 flex-1">
          {events === null ? (
            <div className="flex justify-center py-10">
              <Loader2 className="w-6 h-6 animate-spin text-hl-mute" />
            </div>
          ) : events.length === 0 ? (
            <div className="hl-card rounded-2xl p-5 text-center text-sm text-hl-mute">Der Check-in ist gerade nicht geöffnet. Bitte melde dich am Einlass.</div>
          ) : !ev ? (
            // Mehrere Veranstaltungen mit Check-in: kurz auswählen.
            <div className="flex flex-col gap-2">
              <p className="text-center text-sm text-hl-mute mb-1">Zu welcher Veranstaltung bist du da?</p>
              {events.map((e) => (
                <button key={e.eventKey} onClick={() => setEventKey(e.eventKey)} className="hl-card rounded-2xl px-4 py-3.5 text-left cursor-pointer active:scale-[.99]">
                  <div className="font-display font-black uppercase text-lg">{e.title}</div>
                  <div className="text-xs text-hl-mute">{e.dateLabel}</div>
                </button>
              ))}
            </div>
          ) : (
            <AnimatePresence mode="wait">
              {step === 'find' && (
                <motion.div key="find" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="flex flex-col gap-3">
                  <label className="block">
                    <span className="block text-[13px] font-sans font-semibold text-white/85 mb-2 text-center">
                      Gib die <b>E-Mail-Adresse</b> ein, mit der du dich angemeldet hast – oder deinen <b>Ticket-Code</b>.
                    </span>
                    <input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && find()}
                      type="text"
                      inputMode="email"
                      autoComplete="email"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      placeholder="name@mail.de oder HL-ABC123"
                      className="w-full bg-white/[.06] border border-white/12 rounded-2xl px-4 py-4 text-[17px] text-white text-center placeholder-hl-faint focus:border-[color:var(--tk)] focus:outline-none focus:ring-2 focus:ring-[color:var(--tk)]/25"
                    />
                  </label>
                  {err && <ErrorMsg>{err}</ErrorMsg>}
                  <button
                    type="button"
                    disabled={busy || !query.trim()}
                    onClick={find}
                    className="w-full flex items-center justify-center gap-2 rounded-2xl py-4 text-[16px] font-display font-black uppercase tracking-wide text-white cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed active:scale-[.99]"
                    style={{ background: grad, boxShadow: `0 14px 34px -14px ${accent}aa` }}
                  >
                    {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <>Ticket finden <ArrowRight className="w-5 h-5" /></>}
                  </button>
                  <p className="text-center text-[11px] text-hl-faint leading-snug">Den Ticket-Code findest du in deiner Bestätigungs-Mail.</p>
                </motion.div>
              )}

              {step === 'confirm' && ticket && (
                <motion.div key="confirm" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="flex flex-col gap-4">
                  <div className="rounded-3xl border p-5 text-center" style={{ borderColor: `${accent}55`, background: `linear-gradient(180deg, ${accent}1c, rgba(255,255,255,.02))` }}>
                    <div className="text-[13px] font-sans text-hl-mute">Hi {ticket.firstName || 'du'}! 👋 Dein Ticket:</div>
                    <div className="mt-1 font-display font-black text-[34px] tracking-wider tabular-nums" style={{ color: accent }}>{ticket.code}</div>
                    <div className="mt-1 inline-flex items-center gap-1.5 text-[13px] font-sans font-bold text-white/85">
                      <Users className="w-4 h-4" /> gültig für {ticket.quantity} Person{ticket.quantity === 1 ? '' : 'en'}
                    </div>
                    {ticket.arrived > 0 && (
                      <div className="mt-2 text-[12px] font-sans text-emerald-300">Schon eingecheckt: {ticket.arrived} – du kannst es hier ändern.</div>
                    )}
                  </div>

                  {ticket.quantity <= 1 ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => checkin(1)}
                      className="w-full flex items-center justify-center gap-2 rounded-2xl py-4 text-[17px] font-display font-black uppercase tracking-wide text-white cursor-pointer disabled:opacity-40 active:scale-[.99]"
                      style={{ background: grad, boxShadow: `0 14px 34px -14px ${accent}aa` }}
                    >
                      {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <><CheckCircle2 className="w-5 h-5" /> Ich bin da</>}
                    </button>
                  ) : (
                    <>
                      <div className="text-center font-display font-black uppercase text-[22px] leading-tight">Bist du mit deiner Begleitung da?</div>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => checkin(ticket.quantity)}
                        className="w-full flex items-center justify-center gap-2 rounded-2xl py-4 text-[16px] font-display font-black uppercase tracking-wide text-white cursor-pointer disabled:opacity-40 active:scale-[.99]"
                        style={{ background: grad, boxShadow: `0 14px 34px -14px ${accent}aa` }}
                      >
                        {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <>Ja, wir sind alle {ticket.quantity} da</>}
                      </button>
                      <div className="hl-card rounded-2xl p-4">
                        <div className="text-center text-[13px] font-sans font-semibold text-white/85">Nicht alle? Wie viele seid ihr – dich mitgezählt?</div>
                        <div className="mt-3 flex flex-wrap justify-center gap-2">
                          {Array.from({ length: ticket.quantity - 1 }, (_, i) => i + 1).map((n) => (
                            <button
                              key={n}
                              type="button"
                              onClick={() => setCount(n)}
                              className="min-w-[56px] rounded-xl px-3 py-2.5 font-display font-black text-xl tabular-nums cursor-pointer border transition-colors"
                              style={count === n ? { background: `${accent}26`, borderColor: accent, color: '#fff' } : { borderColor: 'rgba(255,255,255,.12)', color: 'rgba(255,255,255,.75)' }}
                            >
                              {n}
                            </button>
                          ))}
                        </div>
                        <div className="mt-2 text-center text-[11px] text-hl-faint">1 = nur ich, ohne Begleitung</div>
                        <button
                          type="button"
                          disabled={busy || count >= ticket.quantity}
                          onClick={() => checkin(count)}
                          className="mt-3 w-full rounded-xl py-3 text-[14px] font-sans font-black uppercase tracking-wider cursor-pointer border disabled:opacity-40 active:scale-[.99]"
                          style={{ borderColor: `${accent}77`, color: accent }}
                        >
                          {count >= ticket.quantity ? 'Anzahl wählen' : `Mit ${count} Person${count === 1 ? '' : 'en'} einchecken`}
                        </button>
                      </div>
                    </>
                  )}
                  {err && <ErrorMsg>{err}</ErrorMsg>}
                  <button onClick={restart} className="text-center text-[12px] font-sans font-bold text-hl-mute hover:text-white cursor-pointer py-1">
                    Nicht dein Ticket? Zurück
                  </button>
                </motion.div>
              )}

              {step === 'done' && ticket && (
                <motion.div key="done" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-center text-center gap-4">
                  <motion.div
                    initial={{ scale: 0.4, rotate: -20 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ type: 'spring', stiffness: 260, damping: 16 }}
                    className="w-24 h-24 rounded-full grid place-items-center"
                    style={{ background: grad, boxShadow: `0 0 60px -6px ${accent}aa` }}
                  >
                    <CheckCircle2 className="w-12 h-12 text-white" />
                  </motion.div>
                  <div className="font-display font-black uppercase text-[32px] leading-[.95]">
                    Du bist
                    <br />
                    <span style={{ color: accent }}>eingecheckt!</span>
                  </div>
                  <div className="text-sm text-white/85">
                    {ticket.arrived === 1 ? '1 Person' : `${ticket.arrived} Personen`} · Ticket <b className="tabular-nums">{ticket.code}</b>
                  </div>
                  <div className="text-sm text-hl-mute">Viel Spaß beim Spieltag! 🎉</div>
                  <button
                    type="button"
                    onClick={() => onNavigate('/')}
                    className="mt-2 w-full rounded-2xl py-4 text-[15px] font-display font-black uppercase tracking-wide text-white cursor-pointer active:scale-[.99]"
                    style={{ background: grad }}
                  >
                    Zur Live-Tabelle & den Streams
                  </button>
                  <button onClick={() => setStep('confirm')} className="text-[12px] font-sans font-bold text-hl-mute hover:text-white cursor-pointer py-1">
                    Anzahl korrigieren
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          )}
        </div>
      </div>
    </div>
  );
}
