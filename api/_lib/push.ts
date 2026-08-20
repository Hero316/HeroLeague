import { sql } from './db.js';

// Web-Push (Handy-Benachrichtigungen). WICHTIG: web-push wird LAZY (dynamisch)
// geladen, damit ein Lade-/Konfigurationsproblem NIE die aufrufenden Endpunkte
// (Chat, Team, Aufgaben) mit 500 lahmlegt. Ohne VAPID-Env ist Push einfach aus.

type WebPush = typeof import('web-push');
let webpushMod: WebPush | null = null;
let configured: boolean | null = null;

async function getWebpush(): Promise<WebPush | null> {
  if (configured === false) return null;
  if (configured && webpushMod) return webpushMod;
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || 'mailto:admin@hero-league.de';
  if (!pub || !priv) {
    configured = false;
    return null;
  }
  try {
    const mod = await import('web-push');
    const wp = ((mod as unknown as { default?: WebPush }).default ?? mod) as WebPush;
    wp.setVapidDetails(subject, pub, priv);
    webpushMod = wp;
    configured = true;
    return wp;
  } catch (err) {
    console.error('web-push konnte nicht geladen werden:', err);
    configured = false;
    return null;
  }
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

// Aktuelles Datum (YYYY-MM-DD) und Wochentag in deutscher Ortszeit bestimmen –
// der Server läuft in UTC, „Nicht stören" ist aber aus Nutzersicht deutsche Zeit.
function berlinNow(): { date: string; weekday: number } {
  const now = new Date();
  const date = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Berlin',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now); // liefert "YYYY-MM-DD"
  const wd = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Berlin', weekday: 'short' }).format(now);
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return { date, weekday: map[wd] ?? 0 };
}

function isMuted(prefs: unknown): boolean {
  if (!prefs || typeof prefs !== 'object') return false;
  const p = prefs as { muteWeekends?: boolean; muteUntil?: string };
  const { date, weekday } = berlinNow();
  // „Pausieren bis: TT.MM.JJJJ" gilt INKLUSIVE des gewählten Tages (deutsche Zeit).
  if (p.muteUntil && /^\d{4}-\d{2}-\d{2}$/.test(p.muteUntil) && date <= p.muteUntil) return true;
  if (p.muteWeekends && (weekday === 0 || weekday === 6)) return true;
  return false;
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
}

// Gesamtzahl ungelesen (Benachrichtigungen + Chat) für die Zahl am App-Icon.
async function badgeCount(userId: string): Promise<number> {
  try {
    const n = (await sql`SELECT count(*)::int AS c FROM notifications WHERE user_id = ${userId} AND is_read = false`) as { c: number }[];
    const m = (await sql`
      SELECT count(*)::int AS c FROM messages msg
      JOIN conversation_members cm ON cm.conversation_id = msg.conversation_id AND cm.user_id = ${userId}
      WHERE msg.parent_id IS NULL AND msg.author_id <> ${userId} AND msg.created_at > cm.last_read_at
    `) as { c: number }[];
    return (n[0]?.c ?? 0) + (m[0]?.c ?? 0);
  } catch {
    return 0;
  }
}

// Best-effort Push an alle Geräte eines Nutzers. Fehlertolerant – wirft NIE.
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<void> {
  try {
    if (!userId || userId === 'bootstrap') return;
    const wp = await getWebpush();
    if (!wp) return;
    const prefRows = await sql`SELECT COALESCE(notify_prefs, '{}'::jsonb) AS prefs FROM users WHERE id = ${userId}`;
    if (prefRows[0] && isMuted((prefRows[0] as { prefs: unknown }).prefs)) return;

    const subs = (await sql`SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ${userId}`) as {
      endpoint: string;
      p256dh: string;
      auth: string;
    }[];
    const badge = await badgeCount(userId);
    const body = JSON.stringify({ title: payload.title, body: payload.body, url: payload.url ?? '/admin', badge });
    for (const s of subs) {
      try {
        await wp.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body);
      } catch (err) {
        const code = (err as { statusCode?: number })?.statusCode;
        if (code === 404 || code === 410) await sql`DELETE FROM push_subscriptions WHERE endpoint = ${s.endpoint}`;
      }
    }
  } catch (err) {
    console.error('Push fehlgeschlagen:', err);
  }
}

// Kann der Server Push VERSENDEN? Beide VAPID-Schlüssel müssen gesetzt sein.
export function pushSendConfigured(): boolean {
  return !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

// Diagnose: schickt eine Test-Meldung an alle Geräte des Nutzers und meldet in
// Klartext zurück, was passiert ist (ohne Secrets) – damit ein stummer Ausfall
// (fehlende/mismatchte VAPID-Schlüssel, keine Geräte) sofort sichtbar wird.
export async function sendTestToUser(
  userId: string
): Promise<{ configured: boolean; subscriptions: number; sent: number; error?: string }> {
  const subs = (await sql`SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ${userId}`) as {
    endpoint: string;
    p256dh: string;
    auth: string;
  }[];
  const wp = await getWebpush();
  if (!wp) return { configured: false, subscriptions: subs.length, sent: 0 };

  const badge = await badgeCount(userId);
  const body = JSON.stringify({ title: 'Test ✅', body: 'Push funktioniert – du bist erreichbar.', url: '/chat', badge });
  let sent = 0;
  let error: string | undefined;
  for (const s of subs) {
    try {
      await wp.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body);
      sent++;
    } catch (err) {
      const code = (err as { statusCode?: number })?.statusCode;
      if (code === 404 || code === 410) await sql`DELETE FROM push_subscriptions WHERE endpoint = ${s.endpoint}`;
      if (!error) error = `Code ${code ?? '?'}${err instanceof Error ? `: ${err.message}` : ''}`;
    }
  }
  return { configured: true, subscriptions: subs.length, sent, error };
}

