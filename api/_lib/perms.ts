// Backoffice-Bereiche (individuelle Rechte) – ohne Abhängigkeiten, damit
// auth.ts UND db.ts sie nutzen können. MUSS mit ALL_ADMIN_PERMISSIONS in
// src/types.ts übereinstimmen. Benutzerverwaltung + Saisons bleiben bewusst
// IMMER beim Super-Admin.
import type { AdminPermission, UserRole } from '../../src/types';

export const AREA_IDS: AdminPermission[] = [
  'tracking',
  'results',
  'clubs',
  'awards',
  'highlights',
  'homepage',
  'channels',
  'partners',
  'bookings',
  'signups',
  'tickets',
];

// Standard-Rechte je Rolle, solange NICHT individuell eingestellt wurde.
export const ROLE_DEFAULTS: Record<UserRole, AdminPermission[]> = {
  superadmin: AREA_IDS,
  match_admin: ['tracking', 'results', 'clubs', 'awards', 'highlights'],
  referee: [],
  team_member: [],
};

// Seit „v2" sind Partner und Buchungen eigene Häkchen. Früher steckten sie in
// „Startseite" (Partner-Logos, Sponsoren-Klicks) bzw. „Anmeldungen & Tippspiel"
// (Partneranfragen, Season-Buchungen). Ältere gespeicherte Listen ohne Marker
// werden deshalb beim Lesen so erweitert, dass niemand etwas verliert.
export const PERM_VERSION = 'v2';

// Nur bekannte Bereiche, ohne Doppelte – so wie sie aus der Benutzerverwaltung kommen.
export function cleanPermissions(value: unknown): AdminPermission[] {
  if (!Array.isArray(value)) return [];
  return AREA_IDS.filter((id) => value.includes(id));
}

// Gespeicherte Liste (DB / Session) lesen – inkl. Übernahme alter Listen.
export function normalizePermissions(value: unknown): AdminPermission[] {
  if (!Array.isArray(value)) return [];
  if (value.includes(PERM_VERSION)) return cleanPermissions(value);
  const v = [...value];
  if (v.includes('signups')) v.push('bookings', 'partners');
  if (v.includes('homepage')) v.push('partners');
  return cleanPermissions(v);
}

// Zum Speichern: bereinigt + Versions-Marker (leer = Standard der Rolle).
export function storePermissions(list: AdminPermission[]): string[] {
  const clean = cleanPermissions(list);
  return clean.length ? [...clean, PERM_VERSION] : [];
}

// Was darf diese Person WIRKLICH? Super-Admin: alles. Schiedsrichter: nur der
// Schiedsrichtermodus (über seine Rolle). Sonst: individuell angehakte Bereiche,
// und wenn nichts angehakt ist, die Standard-Rechte der Rolle.
export function effectivePermissions(role: UserRole, permissions: unknown): AdminPermission[] {
  if (role === 'superadmin') return AREA_IDS;
  if (role === 'referee') return [];
  const own = normalizePermissions(permissions);
  return own.length > 0 ? own : ROLE_DEFAULTS[role];
}
