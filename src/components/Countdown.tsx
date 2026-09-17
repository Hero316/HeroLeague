import React, { useEffect, useState } from 'react';

interface CountdownProps {
  target: string; // lokale datetime-local-Zeichenkette, z. B. "2026-10-04T19:00"
  title: string;
  gold?: boolean; // goldene Opening-Night-Farbwelt statt Türkis
  ctaLabel?: string; // Taste unter dem Timer (leer = keine Taste)
  onCta?: () => void;
}

// Fetter Countdown oben auf der Startseite bis zum Anstoß. Rechnet live gegen
// den Zielzeitpunkt – egal wie oft an-/ausgeschaltet wird. Nach Ablauf bleibt
// er (rot glühend) stehen, bis er im Backend deaktiviert wird.
export default function Countdown({ target, title, gold = false, ctaLabel, onCta }: CountdownProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const targetMs = new Date(target).getTime();
  const diff = Number.isFinite(targetMs) ? targetMs - now : 0;
  const expired = diff <= 0;
  const clamped = Math.max(0, diff);

  const days = Math.floor(clamped / 86400000);
  const hours = Math.floor((clamped % 86400000) / 3600000);
  const minutes = Math.floor((clamped % 3600000) / 60000);
  const seconds = Math.floor((clamped % 60000) / 1000);

  const cells = [
    { v: days, l: days === 1 ? 'Tag' : 'Tage' },
    { v: hours, l: 'Stunden' },
    { v: minutes, l: 'Minuten' },
    { v: seconds, l: 'Sekunden' },
  ];
  const pad = (n: number) => String(n).padStart(2, '0');

  // Farbwelt: Gold für die Opening Night, sonst das gewohnte Türkis.
  // Nach Ablauf schaltet beides auf Rot und der Timer bleibt stehen.
  const numberGlow = expired
    ? 'text-hl-red [text-shadow:0_0_44px_rgba(255,84,66,.6)]'
    : gold
      ? 'text-hl-gold [text-shadow:0_0_44px_rgba(233,196,106,.5)]'
      : 'text-brand-accent-light [text-shadow:0_0_44px_rgba(34,223,201,.45)]';
  const showCta = !!(ctaLabel && onCta) && !expired;

  // Überschrift: ohne eingegebenen Text bleibt es textlos (nur die Zahlen).
  const kicker = expired ? (title ? 'Anpfiff — es geht los!' : '') : title;

  return (
    <section
      className={`relative overflow-hidden border-b ${
        expired ? 'border-[rgba(255,84,66,.25)]' : gold ? 'border-hl-gold/25' : 'border-white/[.06]'
      }`}
    >
      {/* dezenter Farbschimmer + riesiges Hintergrundwort ("ganz leicht dahinter") */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: expired
            ? 'radial-gradient(120% 130% at 50% 0%, rgba(255,84,66,.16), transparent 60%)'
            : gold
              ? 'radial-gradient(120% 130% at 50% 0%, rgba(233,196,106,.20), transparent 62%)'
              : 'radial-gradient(120% 130% at 50% 0%, rgba(34,223,201,.14), transparent 60%)',
        }}
      />
      {title && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none">
          <span
            className={`font-display font-black uppercase tracking-tight leading-none whitespace-nowrap text-[15vw] ${
              expired ? 'text-hl-red/[.05]' : gold ? 'text-hl-gold/[.055]' : 'text-white/[.035]'
            }`}
          >
            {title}
          </span>
        </div>
      )}

      <div
        className={`relative max-w-[1320px] mx-auto px-4 sm:px-10 text-center hl-fade ${
          showCta ? 'py-7 sm:py-10' : 'py-5 sm:py-6'
        }`}
      >
        {kicker && (
          <div
            className={`font-sans font-extrabold text-[11px] sm:text-xs tracking-[3.5px] uppercase mb-5 ${
              expired ? 'text-hl-red-soft' : gold ? 'text-hl-gold' : 'text-brand-accent-light'
            }`}
          >
            {kicker}
          </div>
        )}

        <div className={`flex items-start justify-center gap-1.5 sm:gap-4 mx-auto ${showCta ? 'max-w-[720px]' : 'max-w-[560px]'}`}>
          {cells.map((c, i) => (
            <React.Fragment key={c.l}>
              {i > 0 && (
                <span
                  className={`font-display font-black text-3xl sm:text-6xl leading-[.8] ${
                    expired ? 'text-hl-red/30' : 'text-white/15'
                  }`}
                >
                  :
                </span>
              )}
              <div className={`flex flex-col items-center ${showCta ? 'min-w-[52px] sm:min-w-[108px]' : 'min-w-[46px] sm:min-w-[92px]'}`}>
                <span className={`font-display font-black tabular-nums text-4xl sm:text-7xl xl:text-8xl leading-[.85] ${numberGlow}`}>
                  {pad(c.v)}
                </span>
                <span className="font-sans font-bold text-[9px] sm:text-[11px] tracking-[2px] uppercase text-hl-dim mt-2.5">
                  {c.l}
                </span>
              </div>
            </React.Fragment>
          ))}
        </div>

        {/* Untere Hälfte: direkt anmelden, ohne die Seite zu verlassen. */}
        {showCta && (
          <div className="mt-6 sm:mt-8">
            <button
              onClick={onCta}
              className="inline-flex items-center gap-2 rounded-full px-7 sm:px-9 py-3 sm:py-3.5 font-display font-black uppercase tracking-wide text-[13px] sm:text-[15px] text-brand-dark transition-transform cursor-pointer hover:scale-[1.03] active:scale-[.99]"
              style={{
                background: 'linear-gradient(135deg,#F4D588,#E9C46A)',
                boxShadow: '0 14px 34px -14px rgba(233,196,106,.75)',
              }}
            >
              {ctaLabel}
              <span aria-hidden="true">→</span>
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
