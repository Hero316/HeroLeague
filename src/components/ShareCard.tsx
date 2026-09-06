import React, { useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { X, Share2, Check, Loader2 } from 'lucide-react';
import { shareNode } from '../lib/share';
import { useBackClose } from '../lib/backStack';
import { ModalPortal } from './ui';

// ---------------------------------------------------------------------------
// Teilbare Story-Karte (9:16) mit fest eingebautem Hero-League-Wasserzeichen –
// egal was man teilt, jeder sieht sofort, dass es von Hero League kommt.
// ShareCardFrame = der zu teilende Rahmen. ShareSheet = Overlay mit Teilen-Taste.
// Bewusst OHNE backdrop-filter/externe Masken, damit der Bild-Export sauber ist.
// ---------------------------------------------------------------------------

export const ShareCardFrame = React.forwardRef<
  HTMLDivElement,
  { children: React.ReactNode; accent?: string }
>(function ShareCardFrame({ children, accent = '#22DFC9' }, ref) {
  return (
    <div
      ref={ref}
      style={{
        width: '100%',
        aspectRatio: '9 / 16',
        position: 'relative',
        overflow: 'hidden',
        borderRadius: 24,
        color: '#fff',
        fontFamily: '"Saira", ui-sans-serif, system-ui, sans-serif',
        background: `radial-gradient(120% 80% at 50% 0%, ${accent}22 0%, transparent 55%), linear-gradient(180deg, #0a1512 0%, #060b0d 55%, #04070a 100%)`,
        border: '1px solid rgba(255,255,255,0.08)',
      }}
    >
      {/* dezenter Farbschimmer unten */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: '45%',
          background: `radial-gradient(90% 100% at 50% 100%, ${accent}1f 0%, transparent 70%)`,
          pointerEvents: 'none',
        }}
      />

      {/* Inhalt */}
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', padding: '7% 7% 0' }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>{children}</div>

        {/* Wasserzeichen / Footer */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingBottom: '6%', paddingTop: '4%' }}>
          <div
            style={{
              width: 30,
              height: 30,
              borderRadius: 9,
              background: accent,
              color: '#04120d',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: '"Saira Condensed", "Saira", sans-serif',
              fontWeight: 900,
              fontSize: 20,
              lineHeight: 1,
            }}
          >
            H
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.05 }}>
            <span
              style={{
                fontFamily: '"Saira Condensed", "Saira", sans-serif',
                fontWeight: 900,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                fontSize: 17,
              }}
            >
              Hero League
            </span>
            <span style={{ fontSize: 11, letterSpacing: '0.12em', color: 'rgba(255,255,255,0.55)', textTransform: 'uppercase' }}>
              hero-league.de
            </span>
          </div>
        </div>
      </div>
    </div>
  );
});

export function ShareSheet({
  open,
  onClose,
  filename,
  shareText,
  accent = '#22DFC9',
  children,
}: {
  open: boolean;
  onClose: () => void;
  filename: string;
  shareText?: string;
  accent?: string;
  children: React.ReactNode;
}) {
  useBackClose(open, onClose);
  const frameRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<null | 'shared' | 'downloaded' | 'error'>(null);

  const doShare = async () => {
    if (!frameRef.current || busy) return;
    setBusy(true);
    setDone(null);
    const res = await shareNode(frameRef.current, filename, { text: shareText, background: '#04070a' });
    setBusy(false);
    setDone(res);
    if (res !== 'error') setTimeout(() => setDone(null), 2500);
  };

  if (!open) return null;

  return (
    <ModalPortal>
      <AnimatePresence>
        <motion.div
          className="fixed inset-0 z-[130] bg-black/85 backdrop-blur-md flex flex-col items-center justify-center px-5 py-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
        >
          <button
            onClick={onClose}
            aria-label="Schließen"
            className="absolute top-4 right-4 w-10 h-10 rounded-full hl-surf-soft border border-white/10 text-hl-soft hover:text-white flex items-center justify-center cursor-pointer active:scale-90 transition-transform"
          >
            <X className="w-5 h-5" />
          </button>

          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="w-full max-w-[300px]"
          >
            <ShareCardFrame ref={frameRef} accent={accent}>
              {children}
            </ShareCardFrame>

            <button
              onClick={doShare}
              disabled={busy}
              className="mt-5 w-full inline-flex items-center justify-center gap-2 rounded-2xl px-5 py-3.5 text-sm font-sans font-bold uppercase tracking-wider text-[#04120d] cursor-pointer transition-transform active:scale-95 disabled:opacity-70"
              style={{ background: accent }}
            >
              {busy ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Bild wird erstellt…
                </>
              ) : done === 'downloaded' ? (
                <>
                  <Check className="w-4 h-4" /> Gespeichert
                </>
              ) : done === 'shared' ? (
                <>
                  <Check className="w-4 h-4" /> Geteilt
                </>
              ) : (
                <>
                  <Share2 className="w-4 h-4" /> Teilen / Speichern
                </>
              )}
            </button>
            {done === 'error' && (
              <p className="mt-2 text-center text-xs font-sans text-rose-300">
                Teilen hat nicht geklappt – bitte Screenshot machen.
              </p>
            )}
          </motion.div>
        </motion.div>
      </AnimatePresence>
    </ModalPortal>
  );
}
