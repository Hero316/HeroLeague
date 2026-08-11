import { setVapidDetails, sendNotification } from 'web-push';
import { sql } from './db.js';

// Web-Push (Handy-Benachrichtigungen). Ohne konfigurierte VAPID-Schlüssel
// (Env-Variablen) ist Push einfach inaktiv – alles andere funktioniert normal.

let configured: boolean | null = null;
function ensureConfigured(): boolean {
  if (configured !== null) return configured;
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || 'mailto:admin@hero-league.de';
  if (!pub || !priv) {
    configured = false;
    return false;
  }
  setVapidDetails(subject, pub, priv);
  configured = true;
  return true;
}

export function pushPublicKey(): string {
  return process.env.VAPID_PUBLIC_KEY || '';
}

type SubInput = { endpoint?: string; keys?: { p256dh?: string; auth?: string } };

export async function saveSubscription(userId: string, sub: SubInput): Promise<void> {
  const endpoint = sub?.endpoint;
  const p256dh = sub?.keys?.p256dh;
  const auth = sub?.keys?.auth;
  if (!endpoint || !p256dh || !auth) throw new Error('Ungültige Push-Anmeldung.');
  await sql`
    INSERT INTO push_subscriptions (endpoint, user_id, p256dh, auth)
    VALUES (${endpoint}, ${userId}, ${p256dh}, ${auth})
    ON CONFLICT (endpoint) DO UPDATE SET user_id = EXCLUDED.user_id, p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth
  `;
}

export async function removeSubscription(endpoint: string): Promise<void> {
  if (endpoint) await sql`DELETE FROM push_subscriptions WHERE endpoint = ${endpoint}`;
}

// Ist der Nutzer aktuell auf „nicht stören" (Wochenende / bis Datum)?
function isMuted(prefs: unknown): boolean {
  if (!prefs || typeof prefs !== 'object') return false;
  const p = prefs as { muteWeekends?: boolean; muteUntil?: string };
  const now = new Date();
  if (p.muteUntil) {
    const until = new Date(p.muteUntil);
    if (!Number.isNaN(until.getTime()) && until.getTime() > now.getTime()) return true;
  }
  if (p.muteWeekends) {
    const day = now.getDay(); // 0=So, 6=Sa (Serverzeit)
    if (day === 0 || day === 6) return true;
  }
  return false;
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
}

// Best-effort Push an alle Geräte eines Nutzers (respektiert „nicht stören").
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<void> {
  try {
    if (!userId || userId === 'bootstrap' || !ensureConfigured()) return;
    const prefRows = await sql`SELECT COALESCE(notify_prefs, '{}'::jsonb) AS prefs FROM users WHERE id = ${userId}`;
    if (prefRows[0] && isMuted((prefRows[0] as { prefs: unknown }).prefs)) return;

    const subs = (await sql`SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ${userId}`) as {
      endpoint: string;
      p256dh: string;
      auth: string;
    }[];
    const body = JSON.stringify({ title: payload.title, body: payload.body, url: payload.url ?? '/admin' });
    for (const s of subs) {
      try {
        await sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body);
      } catch (err) {
        const code = (err as { statusCode?: number })?.statusCode;
        if (code === 404 || code === 410) await sql`DELETE FROM push_subscriptions WHERE endpoint = ${s.endpoint}`;
      }
    }
  } catch (err) {
    console.error('Push fehlgeschlagen:', err);
  }
}
