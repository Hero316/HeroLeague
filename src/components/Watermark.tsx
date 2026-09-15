// Sichtbares Hero-League-Wasserzeichen (Logo) unten links über einem Bild.
// Nur optisch auf der Website – beim Download wird das Logo zusätzlich fest ins
// Bild eingebrannt (src/lib/download.ts).
export default function Watermark({ className = '' }: { className?: string }) {
  return (
    <img
      src="/assets/hero-league-logo.png"
      alt=""
      aria-hidden="true"
      loading="lazy"
      decoding="async"
      className={`pointer-events-none absolute z-10 select-none opacity-90 drop-shadow-[0_1px_5px_rgba(0,0,0,.75)] ${className}`}
    />
  );
}
