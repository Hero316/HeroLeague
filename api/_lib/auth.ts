import type { VercelRequest, VercelResponse } from '@vercel/node';
import { SignJWT, jwtVerify } from 'jose';

const COOKIE_NAME = 'hl_session';
const SESSION_DAYS = 7;

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

export async function createSessionToken(): Promise<string> {
  return new SignJWT({ role: 'admin' })
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

export async function isAuthenticated(req: VercelRequest): Promise<boolean> {
  const token = readCookie(req, COOKIE_NAME);
  if (!token) return false;
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return payload.role === 'admin';
  } catch {
    return false;
  }
}

type Handler = (req: VercelRequest, res: VercelResponse) => Promise<unknown> | unknown;

// Wrapper für alle schreibenden Endpunkte: ohne gültige Session -> 401
export function requireAdmin(handler: Handler): Handler {
  return async (req, res) => {
    if (!(await isAuthenticated(req))) {
      return res.status(401).json({ error: 'Nicht angemeldet' });
    }
    return handler(req, res);
  };
}
