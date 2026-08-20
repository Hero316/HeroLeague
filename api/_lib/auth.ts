import type { VercelRequest, VercelResponse } from '@vercel/node';
import { SignJWT, jwtVerify } from 'jose';
import type { UserRole, AdminPermission, UserStatus } from '../../src/types';
import { sql } from './db.js';

const COOKIE_NAME = 'hl_session';
const SESSION_DAYS = 30;

// Die in der Session gespeicherte Identität
export interface SessionPayload {
  userId: string; // 'bootstrap' beim Master-Passwort-Login
  email: string;
  name: string;
  role: UserRole;
  permissions: AdminPermission[]; // zusätzliche, frei kombinierbare Rechte
  avatarUrl: string;
  status: UserStatus;
}

const KNOWN_STATUS: UserStatus[] = ['online', 'away', 'busy', 'vacation', 'out'];
export function normalizeStatus(value: unknown): UserStatus {
  return KNOWN_STATUS.includes(value as UserStatus) ? (value as UserStatus) : 'online';
}

// Aktuell gibt es keine frei kombinierbaren Zusatzrechte mehr (Tickets verwalten
// hängt allein an der Super-Admin-Rolle). Immer leer normalisieren.
export function normalizePermissions(_value: unknown): AdminPermission[] {
  return [];
}

function getSecret(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error('SESSION_SECRET ist nicht gesetzt');
  return new TextEncoder().encode(secret);
}

// Secure-Flag nur auf Vercel (Preview/Produktion) – Safari verwirft
// Secure-Cookies über http://localhost
function isSecureContext(): boolean {
  return !!process.env.VERCEL_ENV && process.env.VERCEL_ENV !== 'development';
}

export async function createSessionToken(user: SessionPayload): Promise<string> {
  return new SignJWT({
    userId: user.userId,
    email: user.email,
    name: user.name,
    role: user.role,
    permissions: normalizePermissions(user.permissions),
    avatarUrl: typeof user.avatarUrl === 'string' ? user.avatarUrl : '',
    status: normalizeStatus(user.status),
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(getSecret());
}

export function sessionCookie(token: string): string {
  const parts = [
    `${COOKIE_NAME}=${token}`,
    'HttpOnly',
    'SameSite=Lax',
    'Path=/',
    `Max-Age=${SESSION_DAYS * 24 * 60 * 60}`,
  ];
  if (isSecureContext()) parts.push('Secure');
  return parts.join('; ');
}

export function clearSessionCookie(): string {
  const parts = [`${COOKIE_NAME}=`, 'HttpOnly', 'SameSite=Lax', 'Path=/', 'Max-Age=0'];
  if (isSecureContext()) parts.push('Secure');
  return parts.join('; ');
}

function readCookie(req: VercelRequest, name: string): string | null {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return rest.join('=');
  }
  return null;
}

// „Stichtag" für Zwangs-Abmeldung: Alle Tokens, die VOR diesem Zeitpunkt ausgestellt
// wurden (payload.iat < sessionsValidFrom), gelten als ungültig. Der Wert steht im
// settings-Key 'auth' und wird über die Aktion 'logout-all' auf jetzt gesetzt.
// Kurzer In-Instance-Cache, damit nicht jeder Request Postgres trifft; eine erzwungene
// Abmeldung greift dadurch instanzweit innerhalb von ≤ EPOCH_TTL_MS.
const EPOCH_TTL_MS = 30_000;
let epochCache = { value: 0, fetchedAt: 0 };

async function getSessionsValidFrom(): Promise<number> {
  const now = Date.now();
  if (now - epochCache.fetchedAt < EPOCH_TTL_MS) return epochCache.value;
  try {
    const rows = await sql`SELECT value FROM settings WHERE key = 'auth'`;
    const raw = (rows[0]?.value as { sessionsValidFrom?: number } | undefined)?.sessionsValidFrom;
    const value = Number.isFinite(Number(raw)) ? Number(raw) : 0;
    epochCache = { value, fetchedAt: now };
  } catch {
    // DB-Fehler: niemanden aussperren – letzten bekannten Wert behalten, aber die Zeit
    // aktualisieren, damit wir nicht bei jedem Request erneut scheitern.
    epochCache = { value: epochCache.value, fetchedAt: now };
  }
  return epochCache.value;
}

// Von der 'logout-all'-Aktion aufgerufen, damit die ausführende Instanz den neuen
// Stichtag sofort kennt (ohne auf den Cache-Ablauf zu warten).
export function primeSessionsValidFrom(validFrom: number): void {
  epochCache = { value: validFrom, fetchedAt: Date.now() };
}

// Aktive Sitzung auslesen (oder null). Alt-Sessions mit role 'admin' gelten als Super-Admin.
export async function getSession(req: VercelRequest): Promise<SessionPayload | null> {
  const token = readCookie(req, COOKIE_NAME);
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecret());

    // Zwangs-Abmeldung: vor dem Stichtag ausgestellte Tokens verwerfen.
    const validFrom = await getSessionsValidFrom();
    const iat = typeof payload.iat === 'number' ? payload.iat : 0;
    if (validFrom > 0 && iat < validFrom) return null;
    // Rolle explizit normalisieren. WICHTIG: Jede NICHT ausdrücklich bekannte
    // Rolle fällt bewusst auf 'superadmin' zurück (Alt-Sessions mit role 'admin').
    // Neue, eingeschränkte Rollen MÜSSEN hier explizit stehen – sonst würde ein
    // solches Token fälschlich zu Super-Admin-Rechten eskalieren.
    const role: UserRole =
      payload.role === 'match_admin'
        ? 'match_admin'
        : payload.role === 'referee'
          ? 'referee'
          : // Alt-Rolle „ticket_manager" gibt es nicht mehr → wie Team-Mitglied behandeln.
            payload.role === 'team_member' || payload.role === 'ticket_manager'
            ? 'team_member'
            : 'superadmin';
    return {
      userId: typeof payload.userId === 'string' ? payload.userId : 'bootstrap',
      email: typeof payload.email === 'string' ? payload.email : '',
      name: typeof payload.name === 'string' ? payload.name : '',
      role,
      permissions: normalizePermissions(payload.permissions),
      avatarUrl: typeof payload.avatarUrl === 'string' ? payload.avatarUrl : '',
      status: normalizeStatus(payload.status),
    };
  } catch {
    return null;
  }
}

export async function isAuthenticated(req: VercelRequest): Promise<boolean> {
  return (await getSession(req)) !== null;
}

type Handler = (req: VercelRequest, res: VercelResponse) => Promise<unknown> | unknown;

// Wrapper: ohne gültige Session -> 401 (jeder eingeloggte Nutzer, egal welche Rolle)
export function requireAuth(handler: Handler): Handler {
  return async (req, res) => {
    if (!(await getSession(req))) {
      return res.status(401).json({ error: 'Nicht angemeldet' });
    }
    return handler(req, res);
  };
}

// Wrapper: nur bestimmte Rollen dürfen die Aktion ausführen.
export function requireRoles(roles: UserRole[]): (handler: Handler) => Handler {
  return (handler) => async (req, res) => {
    const session = await getSession(req);
    if (!session) return res.status(401).json({ error: 'Nicht angemeldet' });
    if (!roles.includes(session.role)) return res.status(403).json({ error: 'Keine Berechtigung für diese Aktion.' });
    return handler(req, res);
  };
}

// Wrapper: nur Super-Admins (Vereine, Saisons, Benutzerverwaltung)
export const requireSuperadmin = requireRoles(['superadmin']);

// Wrapper: Redaktionelle Pflege (Ticker, Highlights, Hero, Event, Uploads …).
// Super-Admin und Spiel-Admin – aber NICHT der Schiedsrichter.
export const requireStaff = requireRoles(['superadmin', 'match_admin']);

// Wrapper: Spiele + Abend-Aufstellung schreiben. Zusätzlich zum Staff darf hier
// auch der Schiedsrichter (referee) ran – das ist sein einziger Schreibzugriff.
export const requireMatchWrite = requireRoles(['superadmin', 'match_admin', 'referee']);

// Wrapper: Tickets verwalten (Status setzen, zuweisen, Priorität ändern,
// löschen). Der Super-Admin darf immer, der Ticket-Manager ist die spezialisierte
// Rolle nur dafür. Tickets STELLEN und kommentieren darf jeder eingeloggte Nutzer
// (dafür reicht requireAuth) – nur das Verwalten ist hier eingeschränkt.
export const requireTicketManage = requireRoles(['superadmin']);

// Rückwärtskompatibler Alias für reine Lese-Endpunkte hinter Login (jede Rolle).
export const requireAdmin = requireAuth;
