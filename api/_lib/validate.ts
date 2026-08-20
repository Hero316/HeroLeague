import type { VercelResponse } from '@vercel/node';
import type { Absence, BestPlayer, Goalkeeper, Player, Scorer } from '../../src/types';

export function badRequest(res: VercelResponse, message: string) {
  return res.status(400).json({ error: message });
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

// null oder ganze Zahl 0–99
export function isOptionalScore(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 99);
}

export function isStatus(value: unknown): value is 'geplant' | 'live' | 'beendet' {
  return value === 'geplant' || value === 'live' || value === 'beendet';
}

// --- Team-Zusammenarbeit (Tickets/Aufgaben) --------------------------------
export function isTicketPriority(value: unknown): value is 'niedrig' | 'mittel' | 'hoch' | 'dringend' {
  return value === 'niedrig' || value === 'mittel' || value === 'hoch' || value === 'dringend';
}

export function isTicketStatus(value: unknown): value is 'offen' | 'in_bearbeitung' | 'erledigt' | 'abgelehnt' {
  return value === 'offen' || value === 'in_bearbeitung' || value === 'erledigt' || value === 'abgelehnt';
}

export function isTaskStatus(
  value: unknown
): value is 'leer' | 'offen' | 'in_bearbeitung' | 'erledigt' | 'abgebrochen' {
  return (
    value === 'leer' ||
    value === 'offen' ||
    value === 'in_bearbeitung' ||
    value === 'erledigt' ||
    value === 'abgebrochen'
  );
}

// Array von http(s)-Bild-URLs säubern (max. `limit` Einträge).
export function sanitizeImageUrls(value: unknown, limit = 10): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((u): u is string => typeof u === 'string' && /^https?:\/\//i.test(u.trim()))
    .map((u) => u.trim())
    .slice(0, limit);
}

// Benannte Links („Link-Tasten"): nur http(s), optionaler Name (Anzeigetext).
// Ergebnis: [{ url, label }]. Bewusst begrenzt (Länge/Anzahl).
export function sanitizeLinks(value: unknown, limit = 20): { url: string; label: string }[] {
  if (!Array.isArray(value)) return [];
  const out: { url: string; label: string }[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const rawUrl = (item as { url?: unknown }).url;
    const url = typeof rawUrl === 'string' ? rawUrl.trim() : '';
    if (!/^https?:\/\//i.test(url)) continue;
    const rawLabel = (item as { label?: unknown }).label;
    const label = typeof rawLabel === 'string' ? rawLabel.trim().slice(0, 80) : '';
    out.push({ url: url.slice(0, 2000), label });
    if (out.length >= limit) break;
  }
  return out;
}

export function isRoster(value: unknown): value is Player[] {
  return (
    Array.isArray(value) &&
    value.every(
      (p) =>
        p !== null &&
        typeof p === 'object' &&
        isNonEmptyString((p as Player).name) &&
        ((p as Player).imageUrl === undefined || typeof (p as Player).imageUrl === 'string') &&
        // Kapitäns-Flag optional: fehlt oder boolean
        ((p as Player).captain === undefined || typeof (p as Player).captain === 'boolean') &&
        // Torwart-Flag optional: fehlt oder boolean
        ((p as Player).goalkeeper === undefined || typeof (p as Player).goalkeeper === 'boolean') &&
        // Trikotnummer optional: fehlt oder ganze Zahl 0–999
        ((p as Player).number === undefined ||
          (typeof (p as Player).number === 'number' &&
            Number.isInteger((p as Player).number as number) &&
            ((p as Player).number as number) >= 0 &&
            ((p as Player).number as number) <= 999))
    )
  );
}

export function isScorersArray(value: unknown): value is Scorer[] {
  return (
    Array.isArray(value) &&
    value.every(
      (s) =>
        s !== null &&
        typeof s === 'object' &&
        isNonEmptyString((s as Scorer).playerName) &&
        isNonEmptyString((s as Scorer).teamId) &&
        ((s as Scorer).assistName === undefined || typeof (s as Scorer).assistName === 'string')
    )
  );
}

export function isAbsenteesArray(value: unknown): value is Absence[] {
  return (
    Array.isArray(value) &&
    value.every(
      (a) =>
        a !== null &&
        typeof a === 'object' &&
        isNonEmptyString((a as Absence).playerName) &&
        isNonEmptyString((a as Absence).teamId)
    )
  );
}

export function isBestPlayersArray(value: unknown): value is BestPlayer[] {
  return (
    Array.isArray(value) &&
    value.every(
      (b) =>
        b !== null &&
        typeof b === 'object' &&
        isNonEmptyString((b as BestPlayer).playerName) &&
        isNonEmptyString((b as BestPlayer).teamId)
    )
  );
}

export function isGoalkeepersArray(value: unknown): value is Goalkeeper[] {
  return (
    Array.isArray(value) &&
    value.every(
      (g) =>
        g !== null &&
        typeof g === 'object' &&
        isNonEmptyString((g as Goalkeeper).playerName) &&
        isNonEmptyString((g as Goalkeeper).teamId)
    )
  );
}

export function isDateString(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function isTimeString(value: unknown): value is string {
  return typeof value === 'string' && /^\d{2}:\d{2}$/.test(value);
}
