import { useEffect, useState } from 'react';

// Reagiert auf eine CSS-Medienabfrage. Für Fälle, in denen sich nicht nur das
// Aussehen, sondern der AUFBAU unterscheidet (z.B. Auszeichnungen: am PC eine
// Blase unter der Kachelreihe, am Handy eine einfache Liste zum Aufklappen) –
// so etwas lässt sich nicht allein mit Tailwind-Klassen lösen.
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(query).matches : false
  );
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia(query);
    const on = () => setMatches(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return matches;
}
