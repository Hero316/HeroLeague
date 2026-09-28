// Feste Spiel-Taktung der Hero League: 8 Minuten Spielzeit, 3 Minuten Pause
// zwischen zwei Spielen (= alle 11 Minuten ein Anpfiff). Gilt für Liga UND
// Testspiele – Countdown, Schiedsrichtermodus und die Zeiten-Berechnung im
// Admin nutzen diese Werte.
export const GAME_MINUTES = 8;
export const BREAK_MINUTES = 3;

// 'HH:MM' + n Minuten → 'HH:MM' (über Mitternacht hinweg rollierend).
export function addMinutes(hhmm: string, minutes: number): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return hhmm;
  const total = (((Number(m[1]) * 60 + Number(m[2]) + minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

// Anpfiff/Abpfiff des n-ten Zeitblocks (0-basiert) ab einer Startzeit.
export function slotTimes(firstStart: string, index: number): { start: string; end: string } {
  const start = addMinutes(firstStart, index * (GAME_MINUTES + BREAK_MINUTES));
  return { start, end: addMinutes(start, GAME_MINUTES) };
}

export const isHHMM = (s: string) => /^\d{1,2}:\d{2}$/.test(s.trim());
