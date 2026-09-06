import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Mail, Loader2, ShieldCheck, ArrowLeft } from 'lucide-react';
import { registerRequestCode, registerVerify, type TippIdentity } from '../lib/tips';
import { fetchSignupConfig, useTurnstile } from '../lib/register';

// ---------------------------------------------------------------------------
// Anmeldung fürs Tippspiel: echtes Profil + E-Mail-Bestätigung (6-stelliger
// Code). Zwei Schritte: Formular → Code. Bot-Schutz via Turnstile (falls aktiv).
// ---------------------------------------------------------------------------

const FOUND_OPTIONS = ['Instagram', 'TikTok', 'Freunde / Bekannte', 'Google / Suche', 'Vor Ort / Stadion', 'Sonstiges'];

export default function TippRegister({ onVerified }: { onVerified: (id: TippIdentity) => void }) {
  const [siteKey, setSiteKey] = useState<string | undefined>(undefined);
  useEffect(() => {
    fetchSignupConfig().then((c) => setSiteKey(c.turnstileSiteKey || undefined)).catch(() => {});
  }, []);
  const turnstile = useTurnstile(siteKey);

  const [step, setStep] = useState<'form' | 'code'>('form');
  const [vorname, setVorname] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [age, setAge] = useState('');
  const [foundVia, setFoundVia] = useState('');
  const [suggestion, setSuggestion] = useState('');
  const [consent, setConsent] = useState(false);
  const website = React.useRef(''); // Honeypot

  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [devCode, setDevCode] = useState<string | null>(null);

  const submitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    if (vorname.trim().length < 2 || name.trim().length < 2) return setErr('Bitte Vor- und Nachnamen angeben.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setErr('Bitte eine gültige E-Mail-Adresse eingeben.');
    const ageNum = Number(age);
    if (!Number.isFinite(ageNum) || ageNum < 6 || ageNum > 120) return setErr('Bitte ein gültiges Alter eingeben.');
    if (!consent) return setErr('Bitte der Datenverarbeitung zustimmen.');
    if (!turnstile.ready) return setErr('Bitte kurz die Bot-Prüfung abschließen.');
    setBusy(true);
    try {
      const r = await registerRequestCode({
        vorname: vorname.trim(), name: name.trim(), email: email.trim(), age: ageNum,
        foundVia, suggestion: suggestion.trim(), consent, website: website.current, turnstileToken: turnstile.token,
      });
      setDevCode(r.devCode ?? null);
      setStep('code');
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : 'Fehler.');
      turnstile.reset();
    } finally {
      setBusy(false);
    }
  };

  const submitCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    if (!/^\d{6}$/.test(code.trim())) return setErr('Bitte den 6-stelligen Code eingeben.');
    setBusy(true);
    try {
      const id = await registerVerify(email.trim(), code.trim());
      onVerified(id);
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : 'Fehler.');
    } finally {
      setBusy(false);
    }
  };

  const inputCls =
    'w-full bg-brand-dark border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white font-sans focus:outline-none focus:border-brand-accent-light placeholder:text-hl-faint';

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className="hl-card rounded-2xl border border-white/10 p-5"
    >
      <div className="flex items-center gap-2 mb-1">
        <ShieldCheck className="w-5 h-5 text-brand-accent-light" />
        <h2 className="font-display font-black text-lg uppercase tracking-tight text-white">Zum Mitspielen anmelden</h2>
      </div>
      <p className="text-[13px] text-hl-mute font-sans mb-4 leading-relaxed">
        Einmalig anmelden &amp; E-Mail bestätigen – dann kannst du tippen. So bleibt das Tippspiel fair (keine Bots) und
        bei Gewinnen erreichen wir dich sicher.
      </p>

      {step === 'form' ? (
        <form onSubmit={submitForm} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <input value={vorname} onChange={(e) => setVorname(e.target.value)} placeholder="Vorname" className={inputCls} maxLength={40} autoComplete="given-name" />
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nachname" className={inputCls} maxLength={40} autoComplete="family-name" />
          </div>
          <div className="grid grid-cols-[1fr_90px] gap-3">
            <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="E-Mail" type="email" className={inputCls} maxLength={120} autoComplete="email" />
            <input value={age} onChange={(e) => setAge(e.target.value.replace(/\D/g, '').slice(0, 3))} placeholder="Alter" inputMode="numeric" className={inputCls} />
          </div>
          <select value={foundVia} onChange={(e) => setFoundVia(e.target.value)} className={`${inputCls} cursor-pointer`}>
            <option value="">Wie hast du von Hero League erfahren? (optional)</option>
            {FOUND_OPTIONS.map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </select>
          <textarea
            value={suggestion}
            onChange={(e) => setSuggestion(e.target.value)}
            placeholder="Verbesserungsvorschläge für die Hero League? (optional)"
            rows={2}
            maxLength={600}
            className={`${inputCls} resize-none`}
          />
          {/* Honeypot (für Menschen unsichtbar) */}
          <input tabIndex={-1} autoComplete="off" onChange={(e) => (website.current = e.target.value)} className="hidden" aria-hidden="true" />

          <label className="flex items-start gap-2.5 cursor-pointer select-none py-1">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 w-4 h-4 accent-brand-accent-light shrink-0" />
            <span className="text-[12px] text-hl-mute font-sans leading-snug">
              Ich bin einverstanden, dass meine Daten zur Teilnahme am Tippspiel gespeichert werden.
            </span>
          </label>

          {siteKey && <div ref={turnstile.ref} className="flex justify-center" />}
          {err && <p className="text-xs font-sans text-rose-300">{err}</p>}

          <button
            type="submit"
            disabled={busy}
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-brand-accent-light px-4 py-3 text-sm font-sans font-black uppercase tracking-wider text-[#04120d] cursor-pointer active:scale-[0.98] transition-transform disabled:opacity-60"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
            Code anfordern
          </button>
        </form>
      ) : (
        <form onSubmit={submitCode} className="space-y-3">
          <p className="text-[13px] text-hl-soft font-sans">
            Wir haben dir einen 6-stelligen Code an <span className="font-bold text-white">{email}</span> geschickt.
          </p>
          {devCode && (
            <p className="text-[12px] font-mono text-hl-gold">Dev-Code: {devCode}</p>
          )}
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="• • • • • •"
            inputMode="numeric"
            className={`${inputCls} text-center tracking-[0.5em] text-lg font-display font-black`}
          />
          {err && <p className="text-xs font-sans text-rose-300">{err}</p>}
          <button
            type="submit"
            disabled={busy}
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-brand-accent-light px-4 py-3 text-sm font-sans font-black uppercase tracking-wider text-[#04120d] cursor-pointer active:scale-[0.98] transition-transform disabled:opacity-60"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
            Bestätigen &amp; mitspielen
          </button>
          <button type="button" onClick={() => { setStep('form'); setErr(''); }} className="w-full inline-flex items-center justify-center gap-1.5 text-xs font-sans font-bold uppercase tracking-wider text-hl-dim hover:text-white transition-colors cursor-pointer">
            <ArrowLeft className="w-3.5 h-3.5" /> Angaben ändern
          </button>
        </form>
      )}
    </motion.div>
  );
}
