import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Mail, KeyRound, LogIn, AlertCircle, ArrowLeft, Lock } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { SessionUser } from '../types';

interface AdminLoginProps {
  onLoginSuccess: (user: SessionUser) => void;
}

type Mode = 'email' | 'code' | 'password' | 'master-code';

const inputClass =
  'w-full bg-[#060E0F] border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-brand-accent-light';

const primaryBtn =
  'w-full px-6 py-3.5 bg-brand-accent-light hover:bg-brand-accent disabled:opacity-50 rounded-full text-xs font-bold uppercase tracking-wider transition-all duration-300 shadow-lg shadow-brand-accent-light/25 cursor-pointer text-white flex items-center justify-center space-x-2';

function ErrorBox({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-2 text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-xl px-3 py-2.5">
      <AlertCircle className="w-4 h-4 shrink-0" />
      <span>{text}</span>
    </div>
  );
}

export default function AdminLogin({ onLoginSuccess }: AdminLoginProps) {
  const [mode, setMode] = useState<Mode>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const requestCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setInfo('');
    if (!email.trim()) {
      setError('Bitte E-Mail-Adresse eingeben.');
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await apiFetch<{ ok: boolean; devCode?: string }>('/api/auth/request-code', {
        method: 'POST',
        body: JSON.stringify({ email: email.trim() }),
      });
      setMode('code');
      setInfo(
        res.devCode
          ? `Test-Modus (noch kein Mailversand): dein Code lautet ${res.devCode}`
          : 'Wir haben dir einen 6-stelligen Code per E-Mail geschickt. Prüfe ggf. den Spam-Ordner.'
      );
      if (res.devCode) setCode(res.devCode);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Code konnte nicht angefordert werden.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const verifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!/^\d{6}$/.test(code.trim())) {
      setError('Bitte den 6-stelligen Code eingeben.');
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await apiFetch<{ ok: boolean; user: SessionUser }>('/api/auth/verify-code', {
        method: 'POST',
        body: JSON.stringify({ email: email.trim(), code: code.trim() }),
      });
      onLoginSuccess(res.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Anmeldung fehlgeschlagen.');
      setCode('');
    } finally {
      setIsSubmitting(false);
    }
  };

  const loginWithPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setInfo('');
    if (!password) {
      setError('Bitte Passwort eingeben.');
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await apiFetch<{ ok: boolean; user?: SessionUser; twoFactor?: boolean; devCode?: string }>(
        '/api/auth/login',
        {
          method: 'POST',
          body: JSON.stringify({ password }),
        }
      );
      if (res.twoFactor) {
        // Zweiter Faktor aktiv: Passwort war richtig, jetzt Code aus der E-Mail eingeben.
        setPassword('');
        setCode(res.devCode ?? '');
        setInfo(
          res.devCode
            ? `Test-Modus (noch kein Mailversand): dein Code lautet ${res.devCode}`
            : 'Wir haben dir einen 6-stelligen Bestätigungscode per E-Mail geschickt. Prüfe ggf. den Spam-Ordner.'
        );
        setMode('master-code');
      } else if (res.user) {
        onLoginSuccess(res.user);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falsches Passwort.');
      setPassword('');
    } finally {
      setIsSubmitting(false);
    }
  };

  const verifyMasterCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!/^\d{6}$/.test(code.trim())) {
      setError('Bitte den 6-stelligen Code eingeben.');
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await apiFetch<{ ok: boolean; user: SessionUser }>('/api/auth/verify-login', {
        method: 'POST',
        body: JSON.stringify({ code: code.trim() }),
      });
      onLoginSuccess(res.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Anmeldung fehlgeschlagen.');
      setCode('');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md mx-auto">
      <div className="bg-[#101A19]/40 border border-white/10 rounded-2xl p-8 shadow-2xl backdrop-blur-sm">
        <div className="flex flex-col items-center text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-brand-accent-light/15 border border-brand-accent-light/30 flex items-center justify-center mb-4">
            {mode === 'password' ? (
              <Lock className="w-6 h-6 text-brand-accent-light" />
            ) : mode === 'code' || mode === 'master-code' ? (
              <KeyRound className="w-6 h-6 text-brand-accent-light" />
            ) : (
              <Mail className="w-6 h-6 text-brand-accent-light" />
            )}
          </div>
          <h2 className="font-display font-black text-2xl uppercase tracking-tight text-white">Backoffice-Anmeldung</h2>
          <p className="text-xs text-gray-400 font-sans mt-2">
            {mode === 'password'
              ? 'Notzugang mit Master-Passwort'
              : mode === 'master-code'
              ? 'Bestätige die Anmeldung mit dem Code aus deiner E-Mail'
              : mode === 'code'
              ? 'Gib den Code aus deiner E-Mail ein'
              : 'Anmeldung per E-Mail-Code'}
          </p>
        </div>

        {/* Schritt 1: E-Mail */}
        {mode === 'email' && (
          <form onSubmit={requestCode} className="space-y-5">
            <div>
              <label className="block text-xs font-mono text-gray-400 mb-1.5 uppercase tracking-wider">E-Mail-Adresse</label>
              <input
                type="email"
                autoFocus
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="du@verein.de"
                className={inputClass}
              />
            </div>
            {error && <ErrorBox text={error} />}
            <button type="submit" disabled={isSubmitting} className={primaryBtn}>
              <Mail className="w-4 h-4" />
              <span>{isSubmitting ? 'Sende Code...' : 'Code anfordern'}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('password');
                setError('');
                setInfo('');
              }}
              className="w-full text-center text-[11px] font-sans text-hl-dim hover:text-hl-soft transition-colors cursor-pointer"
            >
              Stattdessen mit Master-Passwort anmelden
            </button>
          </form>
        )}

        {/* Schritt 2: Code */}
        {mode === 'code' && (
          <form onSubmit={verifyCode} className="space-y-5">
            {info && (
              <div className="text-xs text-brand-accent-light bg-brand-accent-light/10 border border-brand-accent-light/20 rounded-xl px-3 py-2.5">
                {info}
              </div>
            )}
            <div>
              <label className="block text-xs font-mono text-gray-400 mb-1.5 uppercase tracking-wider">6-stelliger Code</label>
              <input
                type="text"
                inputMode="numeric"
                autoFocus
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="••••••"
                className={`${inputClass} text-center text-2xl tracking-[10px] font-mono`}
              />
            </div>
            {error && <ErrorBox text={error} />}
            <button type="submit" disabled={isSubmitting} className={primaryBtn}>
              <LogIn className="w-4 h-4" />
              <span>{isSubmitting ? 'Prüfe...' : 'Anmelden'}</span>
            </button>
            <div className="flex items-center justify-between text-[11px] font-sans">
              <button
                type="button"
                onClick={() => {
                  setMode('email');
                  setCode('');
                  setError('');
                  setInfo('');
                }}
                className="flex items-center gap-1 text-hl-dim hover:text-hl-soft transition-colors cursor-pointer"
              >
                <ArrowLeft className="w-3 h-3" /> E-Mail ändern
              </button>
              <button
                type="button"
                onClick={requestCode}
                disabled={isSubmitting}
                className="text-brand-accent-light hover:underline cursor-pointer disabled:opacity-50"
              >
                Code erneut senden
              </button>
            </div>
          </form>
        )}

        {/* Notzugang: Master-Passwort */}
        {mode === 'password' && (
          <form onSubmit={loginWithPassword} className="space-y-5">
            <div>
              <label className="block text-xs font-mono text-gray-400 mb-1.5 uppercase tracking-wider">Master-Passwort</label>
              <input
                type="password"
                autoFocus
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={inputClass}
              />
            </div>
            {error && <ErrorBox text={error} />}
            <button type="submit" disabled={isSubmitting} className={primaryBtn}>
              <LogIn className="w-4 h-4" />
              <span>{isSubmitting ? 'Prüfe...' : 'Anmelden'}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('email');
                setError('');
              }}
              className="w-full text-center text-[11px] font-sans text-hl-dim hover:text-hl-soft transition-colors cursor-pointer flex items-center justify-center gap-1"
            >
              <ArrowLeft className="w-3 h-3" /> Zurück zur E-Mail-Anmeldung
            </button>
          </form>
        )}

        {/* Zweiter Faktor nach dem Master-Passwort */}
        {mode === 'master-code' && (
          <form onSubmit={verifyMasterCode} className="space-y-5">
            {info && (
              <div className="text-xs text-brand-accent-light bg-brand-accent-light/10 border border-brand-accent-light/20 rounded-xl px-3 py-2.5">
                {info}
              </div>
            )}
            <div>
              <label className="block text-xs font-mono text-gray-400 mb-1.5 uppercase tracking-wider">6-stelliger Code</label>
              <input
                type="text"
                inputMode="numeric"
                autoFocus
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="••••••"
                className={`${inputClass} text-center text-2xl tracking-[10px] font-mono`}
              />
            </div>
            {error && <ErrorBox text={error} />}
            <button type="submit" disabled={isSubmitting} className={primaryBtn}>
              <LogIn className="w-4 h-4" />
              <span>{isSubmitting ? 'Prüfe...' : 'Anmelden'}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('password');
                setCode('');
                setError('');
                setInfo('');
              }}
              className="w-full text-center text-[11px] font-sans text-hl-dim hover:text-hl-soft transition-colors cursor-pointer flex items-center justify-center gap-1"
            >
              <ArrowLeft className="w-3 h-3" /> Zurück
            </button>
          </form>
        )}
      </div>
    </motion.div>
  );
}
