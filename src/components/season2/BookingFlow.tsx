import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowLeft, ArrowRight, X, Mail, KeyRound, Users, Shirt, Package, ShieldCheck, Loader2, AlertCircle,
  Plus, Trash2, Crown, Hand, Upload, FileText, CheckCircle2, Copy, Check, CreditCard, Sparkles, ChevronDown, Info, NotebookPen,
} from 'lucide-react';
import { goBackLayer, useBackClose } from '../../lib/backStack';
import { useTurnstile } from '../../lib/register';
import {
  euro, formatDeadline, logoToDataUrl, requestBookingCode, submitBooking, verifyBookingCode,
  type BookingPublicConfig, type BookingSummary, type PackageId, type Prereg, type RosterRow,
} from '../../lib/booking';
import { S2 } from './theme';

// ===========================================================================
// Verbindliche Season-2-Buchung als Vollbild-Ebene über der Landingpage.
// Ablauf: E-Mail → Code → Team → Kader → Paket & Logo → Bestätigen → Bezahlen.
// Der Formularzustand liegt in der Landingpage (BookingDraft), damit nach einem
// versehentlichen Schließen nichts verloren geht.
// ===========================================================================

export type Step = 'email' | 'code' | 'status' | 'soldout' | 'team' | 'roster' | 'package' | 'confirm' | 'done';

export interface BookingDraft {
  email: string;
  token: string;
  prereg: Prereg | null;
  existing: BookingSummary | null;
  teamName: string;
  contactName: string;
  phone: string;
  roster: RosterRow[];
  pkg: PackageId | null;
  logo: string; // Data-URL
  logoName: string;
  keepLogoUrl: string; // Logo des aktuellen Teams (wird übernommen, wenn kein neues kommt)
  note: string;
  acceptJersey: boolean;
  acceptRules: boolean;
  acceptTerms: boolean;
  result: { booking: BookingSummary | null; reference: string } | null;
}

export const emptyRow = (): RosterRow => ({ firstName: '', lastName: '', number: null, captain: false, keeper: false });
export const newDraft = (rows: number): BookingDraft => ({
  email: '', token: '', prereg: null, existing: null, teamName: '', contactName: '', phone: '',
  roster: Array.from({ length: rows }, emptyRow), pkg: null, logo: '', logoName: '', keepLogoUrl: '', note: '',
  acceptJersey: false, acceptRules: false, acceptTerms: false, result: null,
});

const FLOW: Step[] = ['team', 'roster', 'package', 'confirm'];
const STEP_LABEL: Partial<Record<Step, string>> = { team: 'Team', roster: 'Kader', package: 'Paket', confirm: 'Abschluss' };

const inputBase =
  'min-w-0 bg-white/[.06] border border-white/10 rounded-xl px-3.5 py-3 text-[15px] text-white placeholder-white/30 focus:border-[#5B7FFF] focus:outline-none focus:ring-2 focus:ring-[#5B7FFF]/25 transition-colors';
const inputCls = `w-full ${inputBase}`;

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block min-w-0">
      <span className="block text-[11px] font-mono uppercase tracking-[.14em] text-white/45 mb-1.5">{label}</span>
      {children}
      {hint && <span className="block text-[12px] text-white/40 mt-1.5 leading-snug">{hint}</span>}
    </label>
  );
}

function ErrorBox({ children }: { children: React.ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="flex items-start gap-2 text-[13.5px] text-rose-200 bg-rose-500/10 border border-rose-400/25 rounded-xl px-3.5 py-3">
      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
      <span className="min-w-0">{children}</span>
    </motion.div>
  );
}

function Primary({ children, onClick, disabled, type = 'button' }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean; type?: 'button' | 'submit' }) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className="w-full inline-flex items-center justify-center gap-2 rounded-2xl px-5 py-4 font-display font-black uppercase tracking-wide text-[16px] text-[#06091A] cursor-pointer transition-transform active:scale-[.98] disabled:opacity-50 disabled:cursor-not-allowed"
      style={{ background: S2.volt, boxShadow: '0 14px 40px -14px rgba(215,255,59,.55)' }}
    >
      {children}
    </button>
  );
}

function CheckBox({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode }) {
  return (
    <label className={`flex items-start gap-3 rounded-2xl border p-3.5 cursor-pointer transition-colors ${checked ? 'border-[#5B7FFF]/60 bg-[#2F5BFF]/10' : 'border-white/10 bg-white/[.03] hover:border-white/20'}`}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="sr-only" />
      <span className={`mt-0.5 w-5 h-5 shrink-0 rounded-md grid place-items-center border transition-colors ${checked ? 'bg-[#2F5BFF] border-[#2F5BFF]' : 'border-white/30'}`}>
        {checked && <Check2 />}
      </span>
      <span className="min-w-0 text-[13.5px] leading-snug text-white/80">{children}</span>
    </label>
  );
}
const Check2 = () => <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />;

// Ausklappbarer Volltext (Regelwerk / Teilnahmebedingungen) direkt im Abschluss.
function Expand({ title, text }: { title: string; text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[.03]">
      <button type="button" onClick={() => setOpen((o) => !o)} className="w-full flex items-center justify-between gap-3 px-3.5 py-3 text-left cursor-pointer">
        <span className="flex items-center gap-2 text-[13.5px] font-bold text-white/85"><FileText className="w-4 h-4 text-[#8FA8FF]" />{title}</span>
        <ChevronDown className={`w-4 h-4 text-white/50 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.3 }} className="overflow-hidden">
            <div className="px-3.5 pb-3.5 text-[13px] leading-relaxed text-white/70 whitespace-pre-line max-h-[50vh] overflow-y-auto">{text}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Kader-Prüfung – identisch zur Server-Prüfung.
export function rosterProblem(rows: RosterRow[], min: number, max: number): string {
  const filled = rows.filter((r) => r.firstName.trim() || r.lastName.trim());
  if (filled.some((r) => !r.firstName.trim() || !r.lastName.trim())) return 'Bitte bei jedem Spieler Vor- und Nachnamen angeben.';
  if (filled.length < min) return `Bitte mindestens ${min} Spieler eintragen (aktuell ${filled.length}).`;
  if (filled.length > max) return `Maximal ${max} Spieler (aktuell ${filled.length}).`;
  if (filled.filter((r) => r.captain).length !== 1) return 'Bitte genau einen Teamkapitän markieren (C).';
  if (!filled.some((r) => r.keeper)) return 'Bitte mindestens einen Torwart markieren (TW).';
  const nums = filled.map((r) => r.number).filter((n): n is number => n !== null);
  if (new Set(nums).size !== nums.length) return 'Jede Rückennummer darf im Team nur einmal vergeben sein.';
  return '';
}

// „Season 2" → „Season 2 + Season 3" (Doppelpaket).
export function twoSeasonsLabel(seasonLabel: string): string {
  const next = /\d+\s*$/.test(seasonLabel) ? seasonLabel.replace(/(\d+)\s*$/, (m) => String(Number(m) + 1)) : 'Folge-Season';
  return `${seasonLabel} + ${next}`;
}

export function priceOf(cfg: BookingPublicConfig, pkg: PackageId, earlyActive: boolean) {
  if (pkg === 'one') return { cents: cfg.prices.one, label: cfg.seasonLabel, early: false };
  const two = twoSeasonsLabel(cfg.seasonLabel);
  return earlyActive
    ? { cents: cfg.prices.twoEarly, label: `${two} · Early Bird`, early: true }
    : { cents: cfg.prices.two, label: two, early: false };
}

export default function BookingFlow({
  open, onClose, cfg, draft, setDraft, step, setStep, earlyActive, intro,
}: {
  open: boolean;
  onClose: () => void;
  cfg: BookingPublicConfig;
  draft: BookingDraft;
  setDraft: React.Dispatch<React.SetStateAction<BookingDraft>>;
  step: Step;
  setStep: (s: Step) => void;
  earlyActive: boolean;
  intro: 'prereg' | 'new';
}) {
  useBackClose(open, onClose);
  const scroller = useRef<HTMLDivElement | null>(null);
  const [dir, setDir] = useState(1);

  // Seite dahinter nicht mitscrollen.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  const go = (s: Step, d = 1) => {
    setDir(d);
    setStep(s);
    scroller.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const patch = (p: Partial<BookingDraft>) => setDraft((d) => ({ ...d, ...p }));
  const flowIdx = FLOW.indexOf(step);
  const back = () => {
    if (step === 'code') return go('email', -1);
    if (flowIdx > 0) return go(FLOW[flowIdx - 1], -1);
    goBackLayer();
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="booking"
          className="fixed inset-0 z-[80] flex flex-col"
          style={{ background: S2.bg }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          role="dialog"
          aria-modal="true"
          aria-label="Startplatz buchen"
        >
          <div className="pointer-events-none absolute inset-0" style={{ background: `radial-gradient(90% 60% at 50% -10%, rgba(47,91,255,.28), transparent 60%)` }} />
          {/* Kopf – um die Safe-Area gepolstert */}
          <header className="relative shrink-0 border-b border-white/[.07] bg-[#04060E]/80 backdrop-blur-xl" style={{ paddingTop: 'calc(env(safe-area-inset-top) + .6rem)' }}>
            <div className="max-w-xl mx-auto px-4 pb-3 flex items-center gap-3">
              {step !== 'email' && step !== 'done' && step !== 'status' && step !== 'team' ? (
                <button onClick={back} className="shrink-0 w-10 h-10 grid place-items-center rounded-full bg-white/[.06] hover:bg-white/10 text-white cursor-pointer" aria-label="Zurück">
                  <ArrowLeft className="w-5 h-5" />
                </button>
              ) : (
                <span className="shrink-0 w-10 h-10" />
              )}
              <div className="min-w-0 flex-1 text-center">
                <div className="font-display font-black uppercase tracking-tight text-white text-[17px] leading-none truncate">{cfg.seasonLabel} · Startplatz buchen</div>
                {cfg.testMode && <div className="mt-1 text-[10.5px] font-mono uppercase tracking-wider text-amber-300">Testmodus – nur für Admins</div>}
              </div>
              <button onClick={() => goBackLayer()} className="shrink-0 w-10 h-10 grid place-items-center rounded-full bg-white/[.06] hover:bg-white/10 text-white cursor-pointer" aria-label="Schließen">
                <X className="w-5 h-5" />
              </button>
            </div>
            {flowIdx >= 0 && (
              <div className="max-w-xl mx-auto px-4 pb-3 grid grid-cols-4 gap-1.5">
                {FLOW.map((s, i) => (
                  <div key={s} className="min-w-0">
                    <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                      <motion.div className="h-full rounded-full" initial={false} animate={{ width: i <= flowIdx ? '100%' : '0%' }} transition={{ duration: 0.45 }} style={{ background: i <= flowIdx ? S2.blue : 'transparent' }} />
                    </div>
                    <div className={`mt-1 text-[10px] font-mono uppercase tracking-wider truncate ${i <= flowIdx ? 'text-white/75' : 'text-white/30'}`}>{STEP_LABEL[s]}</div>
                  </div>
                ))}
              </div>
            )}
          </header>

          <div ref={scroller} className="relative flex-1 overflow-y-auto overscroll-contain">
            <div className="max-w-xl mx-auto px-4 pt-6" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 2.5rem)' }}>
              <AnimatePresence mode="wait" custom={dir} initial={false}>
                <motion.div
                  key={step}
                  custom={dir}
                  initial={{ opacity: 0, x: dir * 36 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: dir * -36 }}
                  transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                >
                  {step === 'email' && <EmailStep cfg={cfg} draft={draft} patch={patch} intro={intro} onSent={() => go('code')} />}
                  {step === 'code' && (
                    <CodeStep
                      email={draft.email}
                      onVerified={(r) => {
                        // Vorregistrierung übernehmen – nur leere Felder füllen.
                        setDraft((d) => {
                          const p = r.prereg;
                          let roster = d.roster;
                          const filled = roster.filter((x) => x.firstName || x.lastName).length;
                          if (p?.roster?.length && filled === 0) {
                            // Kader des aktuellen Teams übernehmen (auf Mindestgröße auffüllen).
                            roster = [...p.roster.map((x) => ({ ...x })), ...Array.from({ length: Math.max(0, cfg.minSquad - p.roster.length) }, emptyRow)];
                          } else if (p?.squadSize && filled === 0) {
                            const n = Math.min(cfg.maxSquad, Math.max(cfg.minSquad, p.squadSize));
                            roster = Array.from({ length: n }, emptyRow);
                          }
                          return {
                            ...d,
                            token: r.token,
                            email: r.email,
                            prereg: p,
                            existing: r.booking,
                            teamName: d.teamName || (p?.entry === 'team' ? p.teamName : '') || '',
                            contactName: d.contactName || p?.contactName || '',
                            phone: d.phone || p?.phone || '',
                            roster,
                            keepLogoUrl: d.logo ? d.keepLogoUrl : p?.logoUrl || d.keepLogoUrl,
                          };
                        });
                        go(r.booking && r.booking.status !== 'cancelled' ? 'status' : r.soldOut ? 'soldout' : 'team');
                      }}
                      onBack={() => go('email', -1)}
                    />
                  )}
                  {step === 'status' && draft.existing && <StatusStep booking={draft.existing} cfg={cfg} />}
                  {step === 'soldout' && (
                    <div>
                      <StepHead icon={Users} title="Leider ausgebucht" text={`Alle ${cfg.maxTeams ?? ''} Startplätze für ${cfg.seasonLabel} sind vergeben. Wird ein Platz wieder frei, melden wir uns bei euch.`} />
                    </div>
                  )}
                  {step === 'team' && <TeamStep draft={draft} patch={patch} onNext={() => go('roster')} />}
                  {step === 'roster' && <RosterStep cfg={cfg} draft={draft} patch={patch} onNext={() => go('package')} />}
                  {step === 'package' && <PackageStep cfg={cfg} draft={draft} patch={patch} earlyActive={earlyActive} onNext={() => go('confirm')} />}
                  {step === 'confirm' && (
                    <ConfirmStep
                      cfg={cfg}
                      draft={draft}
                      patch={patch}
                      earlyActive={earlyActive}
                      onDone={(result) => { patch({ result }); go('done'); }}
                      onExpired={() => { patch({ token: '' }); go('email', -1); }}
                      onEdit={(s) => go(s, -1)}
                    />
                  )}
                  {step === 'done' && draft.result && <DoneStep cfg={cfg} result={draft.result} email={draft.email} />}
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// --- Schritte ---------------------------------------------------------------

function StepHead({ icon: Icon, title, text }: { icon: React.ComponentType<{ className?: string }>; title: string; text?: React.ReactNode }) {
  return (
    <div className="mb-6">
      <span className="inline-grid place-items-center w-12 h-12 rounded-2xl mb-4 text-white" style={{ background: S2.grad }}>
        <Icon className="w-6 h-6" />
      </span>
      <h2 className="font-display font-black text-[28px] sm:text-[32px] uppercase tracking-tight text-white leading-[.95]">{title}</h2>
      {text && <p className="text-white/60 text-[14.5px] mt-2 leading-relaxed">{text}</p>}
    </div>
  );
}

function EmailStep({ cfg, draft, patch, intro, onSent }: { cfg: BookingPublicConfig; draft: BookingDraft; patch: (p: Partial<BookingDraft>) => void; intro: 'prereg' | 'new'; onSent: () => void }) {
  const turnstile = useTurnstile(cfg.turnstileSiteKey || undefined);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [hp, setHp] = useState('');
  const send = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setErr('');
    if (!/^\S+@\S+\.\S+$/.test(draft.email.trim())) return setErr('Bitte eine gültige E-Mail-Adresse eingeben.');
    if (!turnstile.ready) return setErr('Bitte kurz die Bot-Prüfung abwarten.');
    setBusy(true);
    try {
      const r = await requestBookingCode({ email: draft.email.trim(), website: hp, turnstileToken: turnstile.token });
      if (r.devCode) sessionStorage.setItem('hl-booking-devcode', r.devCode);
      turnstile.reset();
      onSent();
    } catch (x) {
      setErr(x instanceof Error ? x.message : 'Fehler beim Senden.');
      turnstile.reset();
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={send}>
      <StepHead
        icon={intro === 'prereg' ? NotebookPen : Mail}
        title={intro === 'prereg' ? 'Schon vorregistriert?' : 'Los geht’s'}
        text={
          intro === 'prereg'
            ? 'Gib die E-Mail-Adresse ein, mit der ihr euch vorregistriert habt – oder die bei eurem Team als Manager hinterlegt ist. Nach der Bestätigung füllen wir eure Angaben automatisch aus, bei aktuellen Teams inklusive Kader, Rückennummern und Logo.'
            : 'Bestätige zuerst deine E-Mail-Adresse. Warst du schon vorregistriert, übernehmen wir deine Angaben automatisch.'
        }
      />
      <div className="space-y-4">
        <Field label="E-Mail-Adresse">
          <input type="email" inputMode="email" autoComplete="email" value={draft.email} onChange={(e) => patch({ email: e.target.value })} placeholder="name@beispiel.de" className={inputCls} autoFocus />
        </Field>
        <input tabIndex={-1} autoComplete="off" value={hp} onChange={(e) => setHp(e.target.value)} className="hidden" aria-hidden="true" name="website" />
        {cfg.turnstileSiteKey && <div ref={turnstile.ref} className="flex justify-center" />}
        {err && <ErrorBox>{err}</ErrorBox>}
        <Primary type="submit" disabled={busy}>{busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <>Code senden <ArrowRight className="w-4 h-4" /></>}</Primary>
        <p className="text-[12px] text-white/40 text-center">Wir schicken dir einen 6-stelligen Code. Deine Daten nutzen wir nur für die Buchung.</p>
      </div>
    </form>
  );
}

function CodeStep({ email, onVerified, onBack }: { email: string; onVerified: (r: Awaited<ReturnType<typeof verifyBookingCode>>) => void; onBack: () => void }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const devCode = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('hl-booking-devcode') : null;
  const check = async (c = code) => {
    if (c.length !== 6) return;
    setBusy(true);
    setErr('');
    try {
      const r = await verifyBookingCode(email.trim(), c);
      sessionStorage.removeItem('hl-booking-devcode');
      onVerified(r);
    } catch (x) {
      setErr(x instanceof Error ? x.message : 'Code ungültig.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div>
      <StepHead icon={KeyRound} title="Code eingeben" text={<>Wir haben einen Code an <strong className="text-white [overflow-wrap:anywhere]">{email}</strong> geschickt. Schau auch im Spam-Ordner nach.</>} />
      <div className="space-y-4">
        <input
          value={code}
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, '').slice(0, 6);
            setCode(v);
            if (v.length === 6) void check(v);
          }}
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder="••••••"
          autoFocus
          className={`${inputCls} text-center font-mono text-[28px] tracking-[.5em] py-4`}
        />
        {devCode && <p className="text-[12px] text-amber-300/90 text-center font-mono">Test-Code (nur Vorschau): {devCode}</p>}
        {err && <ErrorBox>{err}</ErrorBox>}
        <Primary onClick={() => check()} disabled={busy || code.length !== 6}>{busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <>Bestätigen <ArrowRight className="w-4 h-4" /></>}</Primary>
        <button type="button" onClick={onBack} className="w-full text-[13px] text-white/50 hover:text-white cursor-pointer py-2">Andere E-Mail / Code neu senden</button>
      </div>
    </div>
  );
}

function StatusStep({ booking, cfg }: { booking: BookingSummary; cfg: BookingPublicConfig }) {
  const paid = booking.status === 'paid';
  return (
    <div>
      <StepHead
        icon={paid ? CheckCircle2 : CreditCard}
        title={paid ? 'Ihr seid dabei!' : 'Buchung gefunden'}
        text={paid
          ? `Die Zahlung für „${booking.teamName}" ist eingegangen – euer Startplatz für ${cfg.seasonLabel} ist fix.`
          : `Zu dieser E-Mail gibt es bereits eine verbindliche Buchung für „${booking.teamName}". Es fehlt nur noch die Zahlung.`}
      />
      <PaymentCard booking={booking} reference={booking.reference || `${booking.ref} · ${booking.teamName} · ${booking.packageLabel}`} />
    </div>
  );
}

function TeamStep({ draft, patch, onNext }: { draft: BookingDraft; patch: (p: Partial<BookingDraft>) => void; onNext: () => void }) {
  const [err, setErr] = useState('');
  const next = () => {
    if (!draft.teamName.trim()) return setErr('Bitte euren Teamnamen angeben.');
    if (!draft.contactName.trim()) return setErr('Bitte einen Ansprechpartner angeben.');
    if (draft.phone.replace(/\D/g, '').length < 6) return setErr('Bitte eine gültige Telefonnummer angeben.');
    setErr('');
    onNext();
  };
  const p = draft.prereg;
  return (
    <div>
      <StepHead icon={Users} title="Euer Team" text="Wie heißt ihr und wer ist euer Ansprechpartner?" />
      {p && (
        <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} className="mb-5 flex items-start gap-3 rounded-2xl border border-emerald-400/25 bg-emerald-500/10 px-3.5 py-3">
          <Sparkles className="w-4 h-4 text-emerald-300 shrink-0 mt-0.5" />
          <p className="text-[13.5px] text-emerald-100/90 leading-snug min-w-0">
            {p.current
              ? <>Willkommen zurück, <strong>{p.teamName}</strong>! Euer aktueller Kader mit Rückennummern{p.logoUrl ? ' und euer Logo' : ''} ist schon übernommen – ihr könnt alles bearbeiten, Spieler entfernen oder neue eintragen.</>
              : <>{p.captain ? 'Willkommen zurück, Captain! ' : 'Wir haben eure Vorregistrierung gefunden. '}Eure Angaben sind schon eingetragen – bitte kurz prüfen.</>}
          </p>
        </motion.div>
      )}
      <div className="space-y-4">
        <Field label="Teamname"><input value={draft.teamName} onChange={(e) => patch({ teamName: e.target.value })} maxLength={60} placeholder="z. B. FC Beispiel" className={inputCls} /></Field>
        <Field label="Ansprechpartner"><input value={draft.contactName} onChange={(e) => patch({ contactName: e.target.value })} maxLength={80} autoComplete="name" placeholder="Vor- und Nachname" className={inputCls} /></Field>
        <Field label="Handynummer" hint="Für Rückfragen zur Buchung – wird nicht veröffentlicht."><input type="tel" inputMode="tel" autoComplete="tel" value={draft.phone} onChange={(e) => patch({ phone: e.target.value })} maxLength={40} placeholder="+49 …" className={inputCls} /></Field>
        <Field label="E-Mail"><input value={draft.email} disabled className={`${inputCls} opacity-60`} /></Field>
        {err && <ErrorBox>{err}</ErrorBox>}
        <Primary onClick={next}>Weiter zum Kader <ArrowRight className="w-4 h-4" /></Primary>
      </div>
    </div>
  );
}

function RosterStep({ cfg, draft, patch, onNext }: { cfg: BookingPublicConfig; draft: BookingDraft; patch: (p: Partial<BookingDraft>) => void; onNext: () => void }) {
  const [err, setErr] = useState('');
  const rows = draft.roster;
  const set = (i: number, p: Partial<RosterRow>) =>
    patch({ roster: rows.map((r, j) => (j === i ? { ...r, ...p } : p.captain ? { ...r, captain: false } : r)) });
  const filled = rows.filter((r) => r.firstName.trim() || r.lastName.trim()).length;
  const dupes = useMemo(() => {
    const seen = new Map<number, number>();
    rows.forEach((r) => { if (r.number !== null) seen.set(r.number, (seen.get(r.number) ?? 0) + 1); });
    return seen;
  }, [rows]);
  const next = () => {
    const problem = rosterProblem(rows, cfg.minSquad, cfg.maxSquad);
    if (problem) return setErr(problem);
    setErr('');
    patch({ roster: rows.filter((r) => r.firstName.trim() || r.lastName.trim()).map((r) => ({ ...r, firstName: r.firstName.trim(), lastName: r.lastName.trim() })) });
    onNext();
  };
  return (
    <div>
      <StepHead icon={Shirt} title="Euer Kader" text={`${cfg.minSquad} bis ${cfg.maxSquad} Spieler. Markiert euren Kapitän (C) und mindestens einen Torwart (TW).`} />
      <div className="mb-4 flex items-start gap-2.5 rounded-2xl border border-[#5B7FFF]/30 bg-[#2F5BFF]/10 px-3.5 py-3">
        <Info className="w-4 h-4 text-[#8FA8FF] shrink-0 mt-0.5" />
        <p className="text-[12.5px] text-white/75 leading-snug min-w-0">
          Rückennummer optional – kennt ihr sie schon, tragt sie gleich ein (jede Nummer nur einmal). Sonst könnt ihr sie später nachreichen.
        </p>
      </div>
      <div className="space-y-2.5">
        <AnimatePresence initial={false}>
          {rows.map((r, i) => (
            <motion.div
              key={i}
              layout
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, height: 0, marginTop: 0 }}
              className="rounded-2xl border border-white/10 bg-white/[.035] p-2.5"
            >
              <div className="flex items-center gap-2">
                <span className="shrink-0 w-6 text-center text-[12px] font-mono text-white/35">{i + 1}</span>
                <div className="min-w-0 flex-1 grid grid-cols-2 gap-2">
                  <input value={r.firstName} onChange={(e) => set(i, { firstName: e.target.value })} maxLength={40} placeholder="Vorname" className={`${inputCls} py-2.5 px-3 text-[14px]`} aria-label={`Spieler ${i + 1} Vorname`} />
                  <input value={r.lastName} onChange={(e) => set(i, { lastName: e.target.value })} maxLength={40} placeholder="Nachname" className={`${inputCls} py-2.5 px-3 text-[14px]`} aria-label={`Spieler ${i + 1} Nachname`} />
                </div>
              </div>
              <div className="mt-2 pl-8 flex flex-wrap items-center gap-2">
                <div className="relative shrink-0">
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[13px] font-mono text-white/40">#</span>
                  <input
                    value={r.number ?? ''}
                    onChange={(e) => {
                      const v = e.target.value.replace(/\D/g, '').slice(0, 2);
                      set(i, { number: v === '' ? null : Number(v) });
                    }}
                    inputMode="numeric"
                    placeholder="Nr."
                    className={`${inputBase} w-[72px] py-2 pl-6 pr-2 text-[14px] font-mono ${r.number !== null && (dupes.get(r.number) ?? 0) > 1 ? 'border-rose-400/70' : ''}`}
                    aria-label={`Spieler ${i + 1} Rückennummer`}
                  />
                </div>
                <button type="button" onClick={() => set(i, { captain: !r.captain })} className={`shrink-0 inline-flex items-center gap-1 px-2.5 py-2 rounded-xl text-[12px] font-bold cursor-pointer transition-colors ${r.captain ? 'text-[#06091A]' : 'text-white/55 bg-white/[.06] hover:bg-white/10'}`} style={r.captain ? { background: S2.volt } : undefined}>
                  <Crown className="w-3.5 h-3.5" /> C
                </button>
                <button type="button" onClick={() => set(i, { keeper: !r.keeper })} className={`shrink-0 inline-flex items-center gap-1 px-2.5 py-2 rounded-xl text-[12px] font-bold cursor-pointer transition-colors ${r.keeper ? 'text-white' : 'text-white/55 bg-white/[.06] hover:bg-white/10'}`} style={r.keeper ? { background: S2.grad } : undefined}>
                  <Hand className="w-3.5 h-3.5" /> TW
                </button>
                <button type="button" onClick={() => patch({ roster: rows.filter((_, j) => j !== i) })} className="ml-auto shrink-0 p-2 rounded-xl text-white/35 hover:text-rose-300 hover:bg-rose-500/10 cursor-pointer" aria-label={`Spieler ${i + 1} entfernen`}>
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
      {rows.length < cfg.maxSquad && (
        <button type="button" onClick={() => patch({ roster: [...rows, emptyRow()] })} className="mt-3 w-full inline-flex items-center justify-center gap-2 rounded-2xl border border-dashed border-white/20 py-3 text-[13.5px] font-bold text-white/70 hover:text-white hover:border-white/40 cursor-pointer">
          <Plus className="w-4 h-4" /> Spieler hinzufügen
        </button>
      )}
      <div className="mt-5 space-y-3">
        <p className="text-[12.5px] text-white/45 text-center">{filled} von max. {cfg.maxSquad} Spielern eingetragen</p>
        {err && <ErrorBox>{err}</ErrorBox>}
        <Primary onClick={next}>Weiter zum Paket <ArrowRight className="w-4 h-4" /></Primary>
      </div>
    </div>
  );
}

function PackageStep({ cfg, draft, patch, earlyActive, onNext }: { cfg: BookingPublicConfig; draft: BookingDraft; patch: (p: Partial<BookingDraft>) => void; earlyActive: boolean; onNext: () => void }) {
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement | null>(null);
  const pickLogo = async (f: File | undefined) => {
    if (!f) return;
    setBusy(true);
    setErr('');
    try {
      patch({ logo: await logoToDataUrl(f), logoName: f.name });
    } catch (x) {
      setErr(x instanceof Error ? x.message : 'Logo konnte nicht gelesen werden.');
    } finally {
      setBusy(false);
      if (file.current) file.current.value = '';
    }
  };
  const next = () => {
    if (!draft.pkg) return setErr('Bitte ein Paket wählen.');
    setErr('');
    onNext();
  };
  const two = priceOf(cfg, 'two', earlyActive);
  const options: { id: PackageId; title: string; sub: string; cents: number; strike?: number; badge?: string }[] = [
    { id: 'two', title: twoSeasonsLabel(cfg.seasonLabel), sub: `${earlyActive ? 'Early Bird · ' : ''}nur ${euro(Math.round(two.cents / 2))} pro Season`, cents: two.cents, strike: cfg.prices.one * 2, badge: earlyActive ? `Early Bird · −${euro(cfg.prices.two - cfg.prices.twoEarly)}` : 'Bester Preis' },
    { id: 'one', title: cfg.seasonLabel, sub: cfg.seasonDates ? `Eine Season · ${cfg.seasonDates}` : 'Eine Season', cents: cfg.prices.one },
  ];
  return (
    <div>
      <StepHead icon={Package} title="Paket & Logo" text="Wählt euer Paket und ladet euer Team-Logo hoch." />
      <div className="space-y-3">
        {options.map((o) => {
          const on = draft.pkg === o.id;
          return (
            <button key={o.id} type="button" onClick={() => patch({ pkg: o.id })} className={`relative w-full text-left rounded-2xl border p-4 cursor-pointer transition-all ${on ? 'border-[#5B7FFF] bg-[#2F5BFF]/15 shadow-[0_0_0_3px_rgba(47,91,255,.2)]' : 'border-white/10 bg-white/[.035] hover:border-white/25'}`}>
              {o.badge && <span className="absolute -top-2.5 right-3 px-2.5 py-0.5 rounded-full text-[10.5px] font-black uppercase tracking-wider text-[#06091A]" style={{ background: S2.volt }}>{o.badge}</span>}
              <div className="flex items-center gap-3">
                <span className={`shrink-0 w-5 h-5 rounded-full border-2 grid place-items-center ${on ? 'border-[#5B7FFF]' : 'border-white/30'}`}>{on && <span className="w-2.5 h-2.5 rounded-full bg-[#5B7FFF]" />}</span>
                <div className="min-w-0 flex-1">
                  <div className="font-display font-black uppercase text-white text-[20px] leading-none">{o.title}</div>
                  <div className="text-[12.5px] text-white/55 mt-1 truncate">{o.sub}</div>
                </div>
                <div className="shrink-0 text-right">
                  {o.strike && <div className="text-[12.5px] font-bold text-rose-500 line-through decoration-2 tabular-nums">{euro(o.strike)}</div>}
                  <div className="font-display font-black text-white text-[24px] leading-none tabular-nums">{euro(o.cents)}</div>
                </div>
              </div>
            </button>
          );
        })}
        {earlyActive && cfg.earlyBirdUntil && (
          <p className="text-[12.5px] text-[#D7FF3B]/85 leading-snug">
            Early Bird gilt bis {formatDeadline(cfg.earlyBirdUntil)}
            {cfg.deadlineBasis === 'payment' ? ' – maßgeblich ist der Zahlungseingang bis dahin.' : ' – maßgeblich ist der verbindliche Buchungsabschluss bis dahin.'}
          </p>
        )}

        <div className="pt-3">
          <Field label="Team-Logo (Bild oder PDF, optional)" hint="Habt ihr noch keins, könnt ihr es auch später nachreichen.">
            <input ref={file} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml,application/pdf" className="hidden" onChange={(e) => pickLogo(e.target.files?.[0])} />
            <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[.035] p-3">
              <div className="shrink-0 w-14 h-14 rounded-xl bg-white/[.06] grid place-items-center overflow-hidden">
                {busy ? <Loader2 className="w-5 h-5 animate-spin text-white/60" /> : draft.logo.startsWith('data:image') ? <img src={draft.logo} alt="" className="w-full h-full object-contain" /> : draft.logo ? <FileText className="w-6 h-6 text-[#8FA8FF]" /> : draft.keepLogoUrl ? <img src={draft.keepLogoUrl} alt="" className="w-full h-full object-contain" /> : <Upload className="w-5 h-5 text-white/40" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[13.5px] text-white/85 truncate">{draft.logoName || (draft.keepLogoUrl ? 'Euer aktuelles Logo (übernommen)' : 'Noch kein Logo gewählt')}</div>
                <div className="flex flex-wrap gap-2 mt-1.5">
                  <button type="button" onClick={(e) => { e.preventDefault(); file.current?.click(); }} className="px-3 py-1.5 rounded-lg text-[12px] font-bold text-white bg-white/10 hover:bg-white/15 cursor-pointer">{draft.logo || draft.keepLogoUrl ? 'Ändern' : 'Datei wählen'}</button>
                  {(draft.logo || draft.keepLogoUrl) && <button type="button" onClick={(e) => { e.preventDefault(); patch({ logo: '', logoName: '', keepLogoUrl: '' }); }} className="px-3 py-1.5 rounded-lg text-[12px] font-bold text-white/60 hover:text-rose-300 cursor-pointer">Entfernen</button>}
                </div>
              </div>
            </div>
          </Field>
        </div>
        <Field label="Anmerkung (optional)">
          <textarea value={draft.note} onChange={(e) => patch({ note: e.target.value })} rows={3} maxLength={800} placeholder="z. B. Wunsch zu Spielzeiten, Rechnungsadresse …" className={`${inputCls} resize-none`} />
        </Field>
        {err && <ErrorBox>{err}</ErrorBox>}
        <Primary onClick={next}>Weiter zum Abschluss <ArrowRight className="w-4 h-4" /></Primary>
      </div>
    </div>
  );
}

function ConfirmStep({
  cfg, draft, patch, earlyActive, onDone, onExpired, onEdit,
}: {
  cfg: BookingPublicConfig;
  draft: BookingDraft;
  patch: (p: Partial<BookingDraft>) => void;
  earlyActive: boolean;
  onDone: (r: { booking: BookingSummary | null; reference: string }) => void;
  onExpired: () => void;
  onEdit: (s: Step) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const price = priceOf(cfg, draft.pkg ?? 'one', earlyActive);
  const all = draft.acceptJersey && draft.acceptRules && draft.acceptTerms;
  const captain = draft.roster.find((r) => r.captain);
  const submit = async () => {
    if (!all) return setErr('Bitte alle drei Punkte bestätigen.');
    if (!draft.pkg) return onEdit('package');
    setBusy(true);
    setErr('');
    try {
      const r = await submitBooking({
        token: draft.token, teamName: draft.teamName.trim(), contactName: draft.contactName.trim(), phone: draft.phone.trim(),
        package: draft.pkg, roster: draft.roster, logo: draft.logo || undefined, keepLogo: !draft.logo && !!draft.keepLogoUrl, note: draft.note.trim(),
        acceptJersey: draft.acceptJersey, acceptRules: draft.acceptRules, acceptTerms: draft.acceptTerms,
      });
      onDone({ booking: r.booking, reference: r.reference });
    } catch (x) {
      const msg = x instanceof Error ? x.message : 'Buchung fehlgeschlagen.';
      if (/abgelaufen/i.test(msg)) {
        window.alert('Deine E-Mail-Bestätigung ist abgelaufen. Bitte bestätige sie kurz erneut – deine Angaben bleiben erhalten.');
        return onExpired();
      }
      setErr(msg);
    } finally {
      setBusy(false);
    }
  };
  const Row = ({ label, value, edit }: { label: string; value: React.ReactNode; edit: Step }) => (
    <div className="flex items-start gap-3 py-2.5 border-b border-white/[.06] last:border-0">
      <span className="shrink-0 w-24 text-[11px] font-mono uppercase tracking-wider text-white/40 pt-0.5">{label}</span>
      <span className="min-w-0 flex-1 text-[14px] text-white/90 break-words">{value}</span>
      <button type="button" onClick={() => onEdit(edit)} className="shrink-0 text-[12px] font-bold text-[#8FA8FF] hover:text-white cursor-pointer">Ändern</button>
    </div>
  );
  return (
    <div>
      <StepHead icon={ShieldCheck} title="Prüfen & buchen" text="Alles richtig? Dann bestätigt die Bedingungen und schließt die Buchung ab." />
      <div className="rounded-2xl border border-white/10 bg-white/[.035] px-3.5 mb-5">
        <Row label="Team" value={draft.teamName} edit="team" />
        <Row label="Kontakt" value={<>{draft.contactName}<br /><span className="text-white/55">{draft.email} · {draft.phone}</span></>} edit="team" />
        <Row label="Kader" value={<>{draft.roster.length} Spieler{captain ? ` · Kapitän: ${captain.firstName} ${captain.lastName}` : ''}</>} edit="roster" />
        <Row label="Paket" value={<>{price.label} · <strong>{euro(price.cents)}</strong></>} edit="package" />
        <Row label="Logo" value={draft.logoName || (draft.keepLogoUrl ? 'aktuelles Logo' : 'wird nachgereicht')} edit="package" />
      </div>

      <div className="space-y-2.5">
        <Expand title="Regelwerk lesen" text={cfg.rules} />
        <Expand title="Teilnahmebedingungen lesen" text={cfg.terms} />
        <CheckBox checked={draft.acceptJersey} onChange={(v) => patch({ acceptJersey: v })}>{cfg.jerseyCheckbox}</CheckBox>
        <CheckBox checked={draft.acceptRules} onChange={(v) => patch({ acceptRules: v })}>Ich habe das Regelwerk gelesen und akzeptiere es.</CheckBox>
        <CheckBox checked={draft.acceptTerms} onChange={(v) => patch({ acceptTerms: v })}>{cfg.termsCheckbox}</CheckBox>
      </div>

      {/* Hinweis direkt vor dem Buchungsabschluss */}
      <div className="mt-5 rounded-2xl border border-amber-300/30 bg-amber-400/[.08] px-3.5 py-3.5 flex items-start gap-2.5">
        <ShieldCheck className="w-4 h-4 text-amber-200 shrink-0 mt-0.5" />
        <p className="text-[13.5px] text-amber-50/90 leading-snug min-w-0">{cfg.bindingNotice}</p>
      </div>

      <div className="mt-4 space-y-3">
        {err && <ErrorBox>{err}</ErrorBox>}
        <Primary onClick={submit} disabled={busy || !all}>
          {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <>Verbindlich buchen · {euro(price.cents)}</>}
        </Primary>
        <p className="text-[12px] text-white/40 text-center leading-snug">Nach dem Absenden bekommst du die Zahlungsinfos und eine Bestätigung per E-Mail.</p>
      </div>
    </div>
  );
}

// Kopierbares Feld (Betrag / Nachricht).
function CopyField({ label, value, big = false }: { label: string; value: string; big?: boolean }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* egal */
    }
  };
  return (
    <button type="button" onClick={copy} className="w-full flex items-center gap-2 rounded-xl bg-black/35 border border-white/15 px-3.5 py-3 text-left cursor-pointer hover:border-white/30">
      <span className="min-w-0 flex-1">
        <span className="block text-[10.5px] font-mono uppercase tracking-[.14em] text-white/45">{label}</span>
        <span className={`block font-mono text-white [overflow-wrap:anywhere] ${big ? 'text-[20px] font-bold' : 'text-[14px]'}`}>{value}</span>
      </span>
      <span className={`shrink-0 inline-flex items-center gap-1 text-[11px] font-bold ${copied ? 'text-emerald-300' : 'text-white/60'}`}>
        {copied ? <><Check className="w-4 h-4" /> Kopiert</> : <><Copy className="w-4 h-4" /> Kopieren</>}
      </span>
    </button>
  );
}

function PaymentCard({ booking, reference }: { booking: BookingSummary; reference: string }) {
  const paid = booking.status === 'paid';
  const amount = (booking.priceCents / 100).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const isPayPal = /paypal\./i.test(booking.payLink);
  const Step = ({ n, children }: { n: number; children: React.ReactNode }) => (
    <div className="flex items-start gap-3">
      <span className="shrink-0 w-7 h-7 rounded-full grid place-items-center font-display font-black text-[15px] text-[#06091A]" style={{ background: S2.volt }}>{n}</span>
      <div className="min-w-0 flex-1 pt-0.5">{children}</div>
    </div>
  );
  return (
    <div className="rounded-3xl border border-white/10 overflow-hidden" style={{ background: 'linear-gradient(160deg,rgba(47,91,255,.18),rgba(255,255,255,.03))' }}>
      <div className="p-5">
        <div className="text-[11px] font-mono uppercase tracking-[.16em] text-white/45">{booking.packageLabel}</div>
        <div className="font-display font-black text-white text-[44px] leading-none mt-1 tabular-nums">{euro(booking.priceCents)}</div>
        <div className={`inline-flex items-center gap-1.5 mt-3 px-2.5 py-1 rounded-full text-[11px] font-black uppercase tracking-wider ${paid ? 'bg-emerald-400/15 text-emerald-300' : 'bg-amber-300/15 text-amber-200'}`}>
          {paid ? <CheckCircle2 className="w-3.5 h-3.5" /> : <CreditCard className="w-3.5 h-3.5" />}
          {paid ? 'Bezahlt' : 'Zahlung offen'}
        </div>
      </div>
      {!paid && (
        <div className="px-5 pb-5 space-y-4">
          <div className="rounded-2xl border-2 border-[#D7FF3B]/50 bg-[#D7FF3B]/[.06] px-3.5 py-3">
            <div className="text-[12px] font-black uppercase tracking-wider text-[#D7FF3B]">Wichtig beim Bezahlen</div>
            <p className="text-[13px] text-white/80 leading-snug mt-1">
              Betrag und Nachricht müsst ihr beim Bezahlen <strong className="text-white">selbst eintragen</strong> – nur so können wir eure Zahlung eurem Team und Paket zuordnen.
            </p>
          </div>
          <Step n={1}>
            <div className="text-[13.5px] font-bold text-white mb-1.5">Diesen Betrag eingeben</div>
            <CopyField label="Betrag in Euro" value={amount} big />
          </Step>
          <Step n={2}>
            <div className="text-[13.5px] font-bold text-white mb-1.5">Diese Nachricht angeben</div>
            <CopyField label="Nachricht / Verwendungszweck" value={reference} />
            <p className="text-[11.5px] text-white/45 mt-1.5">Buchungsnummer · Teamname · Paket</p>
          </Step>
          <Step n={3}>
            {booking.payLink ? (
              <a href={booking.payLink} target="_blank" rel="noopener noreferrer" className="w-full inline-flex items-center justify-center gap-2 rounded-2xl px-5 py-4 font-display font-black uppercase tracking-wide text-[16px] text-[#06091A]" style={{ background: S2.volt }}>
                <CreditCard className="w-5 h-5" /> {isPayPal ? 'Weiter zu PayPal' : 'Jetzt bezahlen'}
              </a>
            ) : (
              <p className="text-[13px] text-white/60 rounded-xl bg-white/[.04] px-3.5 py-3">Den Zahlungslink schicken wir dir in Kürze per E-Mail.</p>
            )}
          </Step>
          <p className="text-[12px] text-white/40 leading-snug">Sobald die Zahlung eingegangen ist, bekommt ihr eine Bestätigung und euer Startplatz ist fix. Alles steht auch nochmal in eurer Bestätigungsmail.</p>
        </div>
      )}
    </div>
  );
}

function DoneStep({ cfg, result, email }: { cfg: BookingPublicConfig; result: { booking: BookingSummary | null; reference: string }; email: string }) {
  return (
    <div>
      <motion.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 240, damping: 16 }} className="w-16 h-16 rounded-full grid place-items-center mb-5" style={{ background: S2.volt }}>
        <CheckCircle2 className="w-9 h-9 text-[#06091A]" />
      </motion.div>
      <h2 className="font-display font-black text-[32px] uppercase tracking-tight text-white leading-[.95]">Buchung eingegangen!</h2>
      <p className="text-white/60 text-[14.5px] mt-2 mb-6 leading-relaxed">
        Eure verbindliche Buchung für {cfg.seasonLabel} ist bei uns. Die Bestätigung mit allen Infos und den Teilnahmebedingungen ist unterwegs an <strong className="text-white [overflow-wrap:anywhere]">{email}</strong>. Jetzt fehlt nur noch die Zahlung.
      </p>
      {result.booking ? <PaymentCard booking={result.booking} reference={result.reference} /> : <p className="text-white/60">Buchungsnummer: {result.reference}</p>}
    </div>
  );
}
