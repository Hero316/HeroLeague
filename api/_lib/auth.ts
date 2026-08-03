import type { VercelRequest, VercelResponse } from '@vercel/node';
import { SignJWT, jwtVerify } from 'jose';
import type { UserRole } from '../../src/types';

const COOKIE_NAME = 'hl_session';
const SESSION_DAYS = 7;

// Die in der Session gespeicherte Identität
export interface SessionPayload {
  userId: string; // 'bootstrap' beim Master-Passwort-Login
  email: string;
  name: string;
  role: UserRole;
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
  return new SignJWT({ userId: user.userId, email: user.email, name: user.name, role: user.role })
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

// Aktive Sitzung auslesen (oder null). Alt-Sessions mit role 'admin' gelten als Super-Admin.
export async function getSession(req: VercelRequest): Promise<SessionPayload | null> {
  const token = readCookie(req, COOKIE_NAME);
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecret());
    const role: UserRole =
      payload.role === 'match_admin' ? 'match_admin' : payload.role === 'referee' ? 'referee' : 'superadmin';
    return {
      userId: typeof payload.userId === 'string' ? payload.userId : 'bootstrap',
      email: typeof payload.email === 'string' ? payload.email : '',
      name: typeof payload.name === 'string' ? payload.name : '',
      role,
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

// Rückwärtskompatibler Alias für reine Lese-Endpunkte hinter Login (jede Rolle).
export const requireAdmin = requireAuth;
