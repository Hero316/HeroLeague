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

export function isRoster(value: unknown): value is Player[] {
  return (
    Array.isArray(value) &&
    value.every(
      (p) =>
        p !== null &&
        typeof p === 'object' &&
        isNonEmptyString((p as Player).name) &&
        ((p as Player).imageUrl === undefined || typeof (p as Player).imageUrl === 'string')
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
