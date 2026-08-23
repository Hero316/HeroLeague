import { sql } from './db.js';

// Anonyme Besucherzählung.
// - Kein Personenbezug: gespeichert wird nur eine zufällige Besucher-ID
//   (vom Browser erzeugt, in localStorage) plus Datum/Zeitstempel. Keine IP,
//   keine Namen, kein Fremd-Tracking.
// - „Jetzt online" = eindeutige Besucher mit Aktivität in den letzten Sekunden.
// - Der Ping läuft (aus Function-Limit-Gründen) über /api/seasons.

const LIVE_WINDOW_SECONDS = 90; // Heartbeat kommt alle ~45s, doppelt = online

// Tabelle bei Bedarf selbst anlegen (idempotent, einmal pro Kaltstart).
let ensured = false;
async function ensureTable(): Promise<void> {
  if (ensured) return;
  await sql`
    CREATE TABLE IF NOT EXISTS visits (
      visitor_id TEXT NOT NULL,
      day        DATE NOT NULL,
      last_seen  TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (visitor_id, day)
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_visits_last_seen ON visits(last_seen)`;
  ensured = true;
}

// Einen Besucher-Heartbeat verbuchen. Pro Besucher & Tag genau eine Zeile,
// deren last_seen bei jedem Ping aktualisiert wird.
export async function recordVisit(visitorId: unknown): Promise<void> {
  const vid = typeof visitorId === 'string' ? visitorId.trim().slice(0, 64) : '';
  if (!vid) return;
  await ensureTable();
  await sql`
    INSERT INTO visits (visitor_id, day, last_seen)
    VALUES (${vid}, (now() AT TIME ZONE 'Europe/Berlin')::date, now())
    ON CONFLICT (visitor_id, day) DO UPDATE SET last_seen = now()
  `;
}

export interface VisitStats {
  online: number; // eindeutige Besucher gerade aktiv
  today: number; // eindeutige Besucher heute
  perDay: number; // Ø eindeutige Besucher pro Tag (letzte 30 abgeschlossene Tage mit Daten)
  perWeek: number; // eindeutige Besucher der letzten 7 Tage (rollierend)
  perFortnight: number; // eindeutige Besucher der letzten 14 Tage (rollierend)
  perMonth: number; // eindeutige Besucher der letzten 30 Tage (rollierend)
  daily: { day: string; count: number }[]; // letzte 14 Tage (Mini-Verlauf)
}

function toInt(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

export async function readVisitStats(): Promise<VisitStats> {
  await ensureTable();
  // Alte Zeilen (>400 Tage) gelegentlich aufräumen – hält die Tabelle klein.
  await sql`DELETE FROM visits WHERE day < (now() AT TIME ZONE 'Europe/Berlin')::date - 400`;

  const [online, daily, perDay, perWeek, perFortnight, perMonth] = await Promise.all([
    // Gerade online
    sql`SELECT count(DISTINCT visitor_id)::int AS n
        FROM visits WHERE last_seen > now() - interval '90 seconds'`,
    // Verlauf letzte 14 Tage (eine Zeile pro Besucher & Tag ⇒ count(*) = eindeutig)
    sql`SELECT to_char(day, 'YYYY-MM-DD') AS day, count(*)::int AS count
        FROM visits
        WHERE day > (now() AT TIME ZONE 'Europe/Berlin')::date - 14
        GROUP BY day ORDER BY day`,
    // Ø pro Tag über die letzten 30 abgeschlossenen Tage (nur Tage mit Besuchern
    // zählen; der angebrochene heutige Tag bleibt außen vor, damit er den
    // Schnitt nicht verwässert).
    sql`SELECT avg(c) AS avg FROM (
          SELECT count(*)::int AS c FROM visits
          WHERE day > (now() AT TIME ZONE 'Europe/Berlin')::date - 30
            AND day < (now() AT TIME ZONE 'Europe/Berlin')::date
          GROUP BY day
        ) t`,
    // Eindeutige Besucher der letzten 7 Tage (rollierendes Fenster statt
    // Kalenderwoche – so kippt der Wert am Wochenanfang nicht weg).
    sql`SELECT count(DISTINCT visitor_id)::int AS n FROM visits
        WHERE day > (now() AT TIME ZONE 'Europe/Berlin')::date - 7`,
    // Eindeutige Besucher der letzten 14 Tage (rollierendes Fenster).
    sql`SELECT count(DISTINCT visitor_id)::int AS n FROM visits
        WHERE day > (now() AT TIME ZONE 'Europe/Berlin')::date - 14`,
    // Eindeutige Besucher der letzten 30 Tage (rollierendes Fenster statt
    // Kalendermonat).
    sql`SELECT count(DISTINCT visitor_id)::int AS n FROM visits
        WHERE day > (now() AT TIME ZONE 'Europe/Berlin')::date - 30`,
  ]);

  const days = daily as { day: string; count: number }[];
  const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Berlin' });

  return {
    online: toInt(online[0]?.n),
    today: toInt(days.find((d) => d.day === todayStr)?.count),
    perDay: toInt(perDay[0]?.avg),
    perWeek: toInt(perWeek[0]?.n),
    perFortnight: toInt(perFortnight[0]?.n),
    perMonth: toInt(perMonth[0]?.n),
    daily: days,
  };
}
