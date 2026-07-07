import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Shield, Lock, Phone, Key, AlertCircle, CheckCircle, ArrowRight, Smartphone } from 'lucide-react';

interface AdminLoginProps {
  onLoginSuccess: () => void;
}

export default function AdminLogin({ onLoginSuccess }: AdminLoginProps) {
  const [step, setStep] = useState<'credentials' | 'phone' | 'verify'>('credentials');
  
  // Step 1: Credentials
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [credentialError, setCredentialError] = useState('');

  // Step 2: Phone Input
  const [phoneNumber, setPhoneNumber] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [recaptchaVerified, setRecaptchaVerified] = useState(false);
  const [isVerifyingRecaptcha, setIsVerifyingRecaptcha] = useState(false);

  // Step 3: SMS Verification Code
  const [smsCode, setSmsCode] = useState('');
  const [verificationError, setVerificationError] = useState('');
  const [generatedCode, setGeneratedCode] = useState('');
  const [showSmsToast, setShowSmsToast] = useState(false);

  // Handle Credentials Submit
  const handleCredentialsSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setCredentialError('');

    if (username.trim().toLowerCase() === 'admin' && password === 'admin') {
      setStep('phone');
    } else {
      setCredentialError('Ungültiger Benutzername oder Passwort. (Tipp: admin / admin)');
    }
  };

  // Simulate Recaptcha & Trigger SMS Code Generation
  const handleRequestSmsCode = (e: React.FormEvent) => {
    e.preventDefault();
    setPhoneError('');

    if (!phoneNumber.trim()) {
      setPhoneError('Bitte gib eine gültige Telefonnummer ein.');
      return;
    }

    // High fidelity phone validation format
    const phoneRegex = /^\+?[1-9]\d{1,14}$/;
    const sanitizedPhone = phoneNumber.replace(/[\s-]/g, '');
    if (!phoneRegex.test(sanitizedPhone)) {
      setPhoneError('Ungültiges Telefonnummern-Format. Bitte ländervorwahl eingeben (z.B. +49176...)');
      return;
    }

    setIsVerifyingRecaptcha(true);

    // Simulate ReCAPTCHA verification (1.2 seconds)
    setTimeout(() => {
      setIsVerifyingRecaptcha(false);
      setRecaptchaVerified(true);
      
      // Generate a random 6 digit verification code
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      setGeneratedCode(code);
      setStep('verify');
      
      // Show high fidelity simulated SMS toast notification
      setTimeout(() => {
        setShowSmsToast(true);
      }, 800);
    }, 1200);
  };

  // Handle Code Verification
  const handleVerifyCode = (e: React.FormEvent) => {
    e.preventDefault();
    setVerificationError('');

    if (smsCode === generatedCode) {
      onLoginSuccess();
    } else {
      setVerificationError('Der eingegebene Bestätigungscode ist falsch oder abgelaufen.');
    }
  };

  // Handle Resend SMS
  const handleResendSms = () => {
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    setGeneratedCode(code);
    setSmsCode('');
    setVerificationError('');
    setShowSmsToast(false);
    
    setTimeout(() => {
      setShowSmsToast(true);
    }, 500);
  };

  return (
    <div className="w-full max-w-md mx-auto relative">
      {/* High fidelity SMS simulation banner notification */}
      <AnimatePresence>
        {showSmsToast && (
          <motion.div
            initial={{ opacity: 0, y: -80, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -80, scale: 0.9 }}
            className="fixed top-4 left-1/2 -translate-x-1/2 w-full max-w-sm bg-[#1E1B4B] border-2 border-brand-accent-light/50 rounded-2xl p-4 shadow-2xl z-50 text-white flex items-start gap-3 cursor-pointer"
            onClick={() => setShowSmsToast(false)}
          >
            <div className="w-10 h-10 rounded-full bg-brand-accent-light/20 flex items-center justify-center shrink-0 text-brand-accent-light">
              <Smartphone className="w-5 h-5 animate-bounce" />
            </div>
            <div className="flex-1 text-left">
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-mono uppercase tracking-wider text-brand-accent-light font-bold">NACHRICHT (SIMULIERT)</span>
                <span className="text-[9px] text-gray-400 font-mono">Gerade eben</span>
              </div>
              <h4 className="text-xs font-semibold mt-0.5 text-white">HERO LEAGUE AUTH</h4>
              <p className="text-xs text-gray-300 font-sans mt-1">
                Dein 2FA-Sicherheitscode lautet: <strong className="font-mono text-sm text-yellow-400 bg-black/40 px-1.5 py-0.5 rounded tracking-wider">{generatedCode}</strong>
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Login Card */}
      <div className="bg-[#1E1B4B]/30 border border-white/10 rounded-2xl p-6 sm:p-8 shadow-2xl backdrop-blur-md overflow-hidden relative">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-1 bg-gradient-to-r from-transparent via-brand-accent-light to-transparent" />
        
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-brand-accent/20 border border-brand-accent-light/30 mb-4 text-brand-accent-light">
            <Shield className="w-7 h-7" />
          </div>
          <h2 className="font-display font-black text-2xl tracking-tight text-white uppercase">
            ADMIN <span className="text-brand-accent-light">PORTAL</span>
          </h2>
          <p className="text-xs text-gray-400 font-sans mt-1">
            Zwei-Faktor-Sicherheitsverifizierung erforderlich
          </p>
        </div>

        <AnimatePresence mode="wait">
          {/* STEP 1: CREDENTIALS */}
          {step === 'credentials' && (
            <motion.form
              key="credentials"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              onSubmit={handleCredentialsSubmit}
              className="space-y-4"
            >
              <div>
                <label className="block text-xs font-mono text-gray-400 mb-1.5 uppercase tracking-wider">Benutzername</label>
                <input
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="admin"
                  className="w-full bg-[#0A0118]/80 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-brand-accent-light transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-mono text-gray-400 mb-1.5 uppercase tracking-wider">Passwort</label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-[#0A0118]/80 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-brand-accent-light transition-all"
                />
              </div>

              {credentialError && (
                <div className="flex items-center space-x-2 text-rose-400 text-xs bg-rose-500/10 border border-rose-500/25 p-3 rounded-xl">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{credentialError}</span>
                </div>
              )}

              <button
                type="submit"
                className="w-full bg-brand-accent hover:bg-brand-accent-light text-white text-xs font-bold uppercase tracking-wider py-3.5 rounded-xl transition-all shadow-lg shadow-brand-accent-light/10 flex items-center justify-center space-x-2 cursor-pointer mt-6"
              >
                <span>Weiter zur 2-Faktor-Auth</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </motion.form>
          )}

          {/* STEP 2: PHONE INPUT */}
          {step === 'phone' && (
            <motion.form
              key="phone"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              onSubmit={handleRequestSmsCode}
              className="space-y-5"
            >
              <div className="text-left bg-brand-accent/5 border border-brand-accent/15 p-3 rounded-xl text-xs text-gray-300 font-sans leading-relaxed">
                <strong>Schritt 2/3:</strong> Um unbefugten Zugriff zu verhindern, ist eine Authentifizierung per SMS-Sicherheitscode erforderlich.
              </div>

              <div>
                <label className="block text-xs font-mono text-gray-400 mb-1.5 uppercase tracking-wider">Mobiltelefonnummer</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-sans">+49</span>
                  <input
                    type="tel"
                    required
                    placeholder="176 12345678"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    className="w-full bg-[#0A0118]/80 border border-white/10 rounded-xl pl-12 pr-4 py-2.5 text-sm text-white focus:outline-none focus:border-brand-accent-light transition-all"
                  />
                </div>
                <p className="text-[10px] text-gray-400 font-sans mt-1.5 leading-relaxed">
                  Ländervorwahl (+49 für Deutschland) ist voreingestellt. Bitte restliche Rufnummer eingeben.
                </p>
              </div>

              {/* Simulated ReCAPTCHA Container */}
              <div className="border border-white/10 rounded-xl p-3 bg-[#0A0118]/60 flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  {isVerifyingRecaptcha ? (
                    <div className="w-5 h-5 border-2 border-brand-accent-light border-t-transparent rounded-full animate-spin" />
                  ) : recaptchaVerified ? (
                    <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0" />
                  ) : (
                    <input
                      type="checkbox"
                      required
                      onChange={(e) => {
                        if (e.target.checked) {
                          setIsVerifyingRecaptcha(true);
                          setTimeout(() => {
                            setIsVerifyingRecaptcha(false);
                            setRecaptchaVerified(true);
                          }, 1000);
                        }
                      }}
                      className="w-5 h-5 rounded border-white/20 bg-black text-brand-accent focus:ring-0 cursor-pointer"
                    />
                  )}
                  <span className="text-xs text-gray-300 font-sans">Ich bin kein Roboter (Firebase reCAPTCHA)</span>
                </div>
                <img
                  src="https://www.gstatic.com/recaptcha/api2/logo_48.png"
                  alt="recaptcha"
                  className="w-6 h-6 object-contain opacity-50"
                />
              </div>

              {phoneError && (
                <div className="flex items-center space-x-2 text-rose-400 text-xs bg-rose-500/10 border border-rose-500/25 p-3 rounded-xl">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{phoneError}</span>
                </div>
              )}

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setStep('credentials')}
                  className="flex-1 py-3 bg-white/5 hover:bg-white/10 text-gray-300 text-xs font-bold uppercase rounded-xl transition-all cursor-pointer border border-white/5"
                >
                  Zurück
                </button>
                <button
                  type="submit"
                  disabled={!recaptchaVerified || isVerifyingRecaptcha}
                  className="flex-1 bg-brand-accent hover:bg-brand-accent-light disabled:opacity-40 text-white text-xs font-bold uppercase tracking-wider py-3 rounded-xl transition-all shadow-lg shadow-brand-accent-light/10 flex items-center justify-center space-x-2 cursor-pointer"
                >
                  <span>Code senden</span>
                  <Phone className="w-4 h-4" />
                </button>
              </div>
            </motion.form>
          )}

          {/* STEP 3: SMS VERIFICATION CODE */}
          {step === 'verify' && (
            <motion.form
              key="verify"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              onSubmit={handleVerifyCode}
              className="space-y-5"
            >
              <div className="text-left bg-emerald-500/10 border border-emerald-500/20 p-3 rounded-xl text-xs text-emerald-300 font-sans leading-relaxed">
                Der Verifizierungscode wurde per SMS an <strong>+49 {phoneNumber}</strong> gesendet.
              </div>

              <div>
                <label className="block text-xs font-mono text-gray-400 mb-1.5 uppercase tracking-wider">6-stelliger Bestätigungscode</label>
                <div className="relative">
                  <Key className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <input
                    type="text"
                    required
                    maxLength={6}
                    placeholder="z.B. 123456"
                    value={smsCode}
                    onChange={(e) => setSmsCode(e.target.value)}
                    className="w-full bg-[#0A0118]/80 border border-white/10 rounded-xl pl-11 pr-4 py-2.5 text-center font-mono text-lg font-bold tracking-[0.5em] text-white focus:outline-none focus:border-brand-accent-light transition-all"
                  />
                </div>
              </div>

              {verificationError && (
                <div className="flex items-center space-x-2 text-rose-400 text-xs bg-rose-500/10 border border-rose-500/25 p-3 rounded-xl">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{verificationError}</span>
                </div>
              )}

              <div className="flex flex-col gap-2.5">
                <button
                  type="submit"
                  className="w-full bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold uppercase tracking-wider py-3.5 rounded-xl transition-all shadow-lg shadow-emerald-500/20 flex items-center justify-center space-x-2 cursor-pointer"
                >
                  <Shield className="w-4 h-4" />
                  <span>Code verifizieren</span>
                </button>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setStep('phone');
                      setShowSmsToast(false);
                    }}
                    className="flex-1 py-2.5 bg-white/5 hover:bg-white/10 text-gray-300 text-xs font-bold uppercase rounded-xl transition-all cursor-pointer border border-white/5"
                  >
                    Nummer ändern
                  </button>
                  <button
                    type="button"
                    onClick={handleResendSms}
                    className="flex-1 py-2.5 bg-brand-accent/15 hover:bg-brand-accent/25 text-brand-accent-light text-xs font-bold uppercase rounded-xl transition-all cursor-pointer border border-brand-accent/25"
                  >
                    Code erneut senden
                  </button>
                </div>
              </div>
            </motion.form>
          )}
        </AnimatePresence>
      </div>
      
      <div className="mt-4 text-[10px] text-gray-500 font-sans text-center">
        Demo-Anmeldedaten: <code className="text-gray-400 bg-white/5 px-1 py-0.5 rounded font-mono">admin</code> / <code className="text-gray-400 bg-white/5 px-1 py-0.5 rounded font-mono">admin</code>
      </div>
    </div>
  );
}
