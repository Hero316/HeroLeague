// HERO-Award – die höchste Auszeichnung der Liga. Der Titel zählt pro Saison hoch:
// 1. Saison = „HERO ONE", 2. = „HERO TWO" … als englisches Zahlwort.

const NUMBER_ONES = [
  'ZERO', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE', 'TEN',
  'ELEVEN', 'TWELVE', 'THIRTEEN', 'FOURTEEN', 'FIFTEEN', 'SIXTEEN', 'SEVENTEEN', 'EIGHTEEN', 'NINETEEN',
];
const NUMBER_TENS = ['', '', 'TWENTY', 'THIRTY', 'FORTY', 'FIFTY', 'SIXTY', 'SEVENTY', 'EIGHTY', 'NINETY'];

// Englisches Zahlwort für die Saison-Nummer. Bei >99 Fallback auf die Ziffer.
export function numberWord(n: number): string {
  if (!Number.isFinite(n) || n < 1) return NUMBER_ONES[1]; // Fallback: ONE
  if (n < 20) return NUMBER_ONES[n];
  if (n < 100) {
    const tens = Math.floor(n / 10);
    const ones = n % 10;
    return ones ? `${NUMBER_TENS[tens]}-${NUMBER_ONES[ones]}` : NUMBER_TENS[tens];
  }
  return String(n);
}

// Vollständiger Award-Titel, z. B. „HERO ONE".
export function heroAwardTitle(seasonNumber: number): string {
  return `HERO ${numberWord(seasonNumber)}`;
}
