import React, { useEffect, useState } from 'react';

interface CountdownProps {
  target: string; // lokale datetime-local-Zeichenkette, z. B. "2026-10-04T19:00"
  title: string;
}

// Fetter Countdown oben auf der Startseite bis zum Anstoß. Rechnet live gegen
// den Zielzeitpunkt – egal wie oft an-/ausgeschaltet wird. Nach Ablauf bleibt
// er (rot glühend) stehen, bis er im Backend deaktiviert wird.
export default function Countdown({ target, title }: CountdownProps) {
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

  const numberGlow = expired
    ? 'text-hl-red [text-shadow:0_0_44px_rgba(255,84,66,.6)]'
    : 'text-brand-accent-light [text-shadow:0_0_44px_rgba(34,223,201,.45)]';

  // Überschrift: ohne eingegebenen Text bleibt es textlos (nur die Zahlen).
  const kicker = expired ? (title ? 'Anpfiff — es geht los!' : '') : title;

  return (
    <section className={`relative overflow-hidden border-b ${expired ? 'border-[rgba(255,84,66,.25)]' : 'border-white/[.06]'}`}>
      {/* dezenter Farbschimmer + riesiges Hintergrundwort ("ganz leicht dahinter") */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: expired
            ? 'radial-gradient(120% 130% at 50% 0%, rgba(255,84,66,.16), transparent 60%)'
            : 'radial-gradient(120% 130% at 50% 0%, rgba(34,223,201,.14), transparent 60%)',
        }}
      />
      {title && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none">
          <span
            className={`font-display font-black uppercase tracking-tight leading-none whitespace-nowrap text-[15vw] ${
              expired ? 'text-hl-red/[.05]' : 'text-white/[.035]'
            }`}
          >
            {title}
          </span>
        </div>
      )}

      <div className="relative max-w-[1320px] mx-auto px-4 sm:px-10 py-9 sm:py-12 text-center hl-fade">
        {kicker && (
          <div
            className={`font-sans font-extrabold text-[11px] sm:text-xs tracking-[3.5px] uppercase mb-5 ${
              expired ? 'text-hl-red-soft' : 'text-brand-accent-light'
            }`}
          >
            {kicker}
          </div>
        )}

        <div className="flex items-start justify-center gap-1.5 sm:gap-4 max-w-[560px] mx-auto">
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
              <div className="flex flex-col items-center min-w-[46px] sm:min-w-[92px]">
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
      </div>
    </section>
  );
}
