import type { AdminPermission, UserRole } from '../types';
import { ALL_ADMIN_PERMISSIONS } from '../types';

// Spiegel von api/_lib/auth.ts (effectivePermissions) fürs Frontend: was wird
// im Backoffice angezeigt? Geschützt wird serverseitig – das hier blendet nur aus.
export const AREA_IDS: AdminPermission[] = ALL_ADMIN_PERMISSIONS.map((a) => a.id);

export const ROLE_DEFAULT_PERMISSIONS: Record<UserRole, AdminPermission[]> = {
  superadmin: AREA_IDS,
  match_admin: ['tracking', 'results', 'clubs', 'awards', 'highlights'],
  referee: [],
  team_member: [],
};

// Vorlage „Tracking-Admin": nur das Statistics Center (inkl. Spieler hinzufügen).
export const TRACKING_ADMIN_PRESET: AdminPermission[] = ['tracking'];

export function normalizePermissions(value: unknown): AdminPermission[] {
  if (!Array.isArray(value)) return [];
  return AREA_IDS.filter((id) => value.includes(id));
}

export function effectivePermissions(role: UserRole | undefined, permissions: unknown): AdminPermission[] {
  if (!role) return [];
  if (role === 'superadmin') return AREA_IDS;
  if (role === 'referee') return [];
  const own = normalizePermissions(permissions);
  return own.length > 0 ? own : ROLE_DEFAULT_PERMISSIONS[role];
}

// Rollen, bei denen „individuell einstellen" Sinn ergibt.
export const customizableRole = (role: UserRole) => role === 'match_admin' || role === 'team_member';
