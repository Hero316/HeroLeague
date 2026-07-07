import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ShieldAlert, X, Lock, Unlock, Eye, EyeOff } from 'lucide-react';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoginSuccess: () => void;
}

export default function LoginModal({ isOpen, onClose, onLoginSuccess }: LoginModalProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Let's support both typing 'admin' / 'admin' or just checking standard
    if (username.trim().toLowerCase() === 'admin' && password === 'admin') {
      onLoginSuccess();
      setUsername('');
      setPassword('');
      onClose();
    } else {
      setError('Ungültiger Benutzername oder Passwort. (Tipp: admin / admin)');
    }
  };

  const handleDemoLogin = () => {
    onLoginSuccess();
    setUsername('');
    setPassword('');
    onClose();
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        {/* Backdrop overlay */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-[#070114]/80 backdrop-blur-sm"
        />

        {/* Modal Content */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="relative w-full max-w-md bg-[#0d0524] border border-[#2d1a58] rounded-2xl p-6 shadow-2xl z-10 overflow-hidden"
        >
          {/* Ambient Glow */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-1 bg-gradient-to-r from-transparent via-brand-accent-light to-transparent" />

          {/* Close Button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-gray-400 hover:text-white p-1 rounded-lg hover:bg-[#150a30] transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-brand-accent/20 border border-brand-accent-light/30 mb-3 text-brand-accent-light">
              <Lock className="w-6 h-6" />
            </div>
            <h3 className="font-display font-bold text-xl text-white">Admin-Bereich freischalten</h3>
            <p className="text-xs text-gray-400 font-sans mt-1">
              Melde dich an, um Partien zu editieren, zu simulieren und Vereine zu verwalten
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-mono text-gray-400 mb-1.5">BENUTZERNAME</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="admin"
                className="w-full bg-[#150a30]/50 border border-[#221445] rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-brand-accent-light"
              />
            </div>

            <div>
              <label className="block text-xs font-mono text-gray-400 mb-1.5">PASSWORT</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="admin"
                  className="w-full bg-[#150a30]/50 border border-[#221445] rounded-xl pl-4 pr-10 py-2.5 text-sm text-white focus:outline-none focus:border-brand-accent-light"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white cursor-pointer"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="flex items-center space-x-2 text-rose-400 text-xs bg-rose-500/10 border border-rose-500/20 p-3 rounded-xl font-sans">
                <ShieldAlert className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="pt-2 space-y-2">
              <button
                type="submit"
                className="w-full bg-brand-accent hover:bg-brand-accent-light text-white text-sm font-semibold py-3 rounded-xl transition-all shadow-md cursor-pointer"
              >
                Anmelden
              </button>

              <button
                type="button"
                onClick={handleDemoLogin}
                className="w-full bg-[#1c0e44]/60 hover:bg-[#1c0e44] text-brand-accent-light text-xs font-semibold py-2.5 rounded-xl border border-[#3b1d7a]/50 transition-all cursor-pointer"
              >
                Als Demo-Admin anmelden (Sofort-Log)
              </button>
            </div>
          </form>

          <div className="mt-4 text-[11px] text-gray-500 font-sans text-center">
            Standard-Zugangsdaten: <code className="text-gray-400">admin</code> / <code className="text-gray-400">admin</code>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
