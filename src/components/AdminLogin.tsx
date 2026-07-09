import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Lock, LogIn, AlertCircle } from 'lucide-react';
import { apiFetch } from '../lib/api';

interface AdminLoginProps {
  onLoginSuccess: () => void;
}

export default function AdminLogin({ onLoginSuccess }: AdminLoginProps) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!password) {
      setError('Bitte Passwort eingeben.');
      return;
    }
    setIsSubmitting(true);
    try {
      await apiFetch('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ password }),
      });
      onLoginSuccess();
    } catch {
      setError('Falsches Passwort.');
      setPassword('');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full max-w-md mx-auto"
    >
      <div className="bg-[#101A19]/40 border border-white/10 rounded-2xl p-8 shadow-2xl backdrop-blur-sm">
        <div className="flex flex-col items-center text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-brand-accent-light/15 border border-brand-accent-light/30 flex items-center justify-center mb-4">
            <Lock className="w-6 h-6 text-brand-accent-light" />
          </div>
          <h2 className="font-display font-black text-2xl uppercase tracking-tight text-white">
            Admin-Anmeldung
          </h2>
          <p className="text-xs text-gray-400 font-sans mt-2">
            Zugang zum Backoffice der Hero League
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-xs font-mono text-gray-400 mb-1.5 uppercase tracking-wider">
              Passwort
            </label>
            <input
              type="password"
              autoFocus
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-[#060E0F] border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-brand-accent-light"
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-xl px-3 py-2.5">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full px-6 py-3.5 bg-brand-accent-light hover:bg-brand-accent disabled:opacity-50 rounded-full text-xs font-bold uppercase tracking-wider transition-all duration-300 shadow-lg shadow-brand-accent-light/25 cursor-pointer text-white flex items-center justify-center space-x-2"
          >
            <LogIn className="w-4 h-4" />
            <span>{isSubmitting ? 'Prüfe...' : 'Anmelden'}</span>
          </button>
        </form>
      </div>
    </motion.div>
  );
}
