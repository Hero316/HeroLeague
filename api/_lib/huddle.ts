import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sql } from './db.js';
import { getSession } from './auth.js';
import { badRequest } from './validate.js';
import { genId, sessionName } from './collab.js';
import { sendPushToUser } from './push.js';
import { summarizeMeeting } from './gemini.js';

// Huddle = WLAN-Anruf im Slack-Style (Audio-Raum zu einer Unterhaltung).
// Signalisierung (WebRTC) läuft kurzlebig per Polling über huddle_signals –
// bewusst KEIN WebSocket (Vercel-Hobby kann das nicht) und KEIN Fremddienst.
// Verbindung selbst ist Peer-to-Peer über gratis STUN – also keine laufenden
// Kosten. Dispatch aus api/chat.ts über ?resource=huddle.

async function isMember(conversationId: string, userId: string): Promise<boolean> {
  const rows = await sql`SELECT 1 FROM conversation_members WHERE conversation_id = ${conversationId} AND user_id = ${userId} LIMIT 1`;
  return rows.length > 0;
}

// Aktive Teilnehmer = nicht abgemeldet UND Heartbeat jünger als 25 s.
async function activeParticipants(huddleId: string) {
  return (await sql`
    SELECT user_id AS "userId", user_name AS "userName"
    FROM huddle_participants
    WHERE huddle_id = ${huddleId} AND left_at IS NULL AND last_seen > now() - interval '25 seconds'
    ORDER BY joined_at
  `) as { userId: string; userName: string }[];
}

// Läuft noch jemand im Huddle? Sonst beenden (Karte im Chat aktualisieren).
async function endIfEmpty(huddleId: string): Promise<boolean> {
  const act = await activeParticipants(huddleId);
  if (act.length > 0) return false;
  const rows = (await sql`
    UPDATE huddles SET ended_at = now(), recording_at = NULL WHERE id = ${huddleId} AND ended_at IS NULL
    RETURNING message_id, COALESCE(notes,'') AS notes,
      (SELECT count(*) FROM huddle_transcript t WHERE t.huddle_id = huddles.id)::int AS "lines",
      to_char(started_at AT TIME ZONE 'Europe/Berlin', 'DD.MM.YYYY') AS "dateLabel",
      to_char(started_at AT TIME ZONE 'Europe/Berlin', 'HH24:MI') AS "startLabel",
      GREATEST(1, round(extract(epoch from (now() - started_at)) / 60))::int AS "durMin"
  `) as {
    message_id: string | null; notes: string; lines: number; dateLabel: string; startLabel: string; durMin: number;
  }[];
  if (rows.length && rows[0].message_id) {
    const r = rows[0];
    // Karte bekommt Datum, Startzeit und Dauer in den Body; attach_title = 'notes'
    // markiert, dass es Notizen gibt (sonst leer ⇒ kein Notizen-Knopf).
    const hasNotes = r.notes.trim().length > 0 || r.lines > 0; // auch eine Mitschrift zählt
    const body = `Beendet · ${r.dateLabel}, ${r.startLabel} Uhr · ${r.durMin} Min`;
    await sql`UPDATE messages SET body = ${body}, attach_title = ${hasNotes ? 'notes' : ''} WHERE id = ${r.message_id}`;
  }
  return true;
}

async function huddleById(id: string) {
  const rows = (await sql`
    SELECT id, conversation_id AS "conversationId", created_by AS "createdBy",
           COALESCE(notes,'') AS notes, message_id AS "messageId",
           started_at AS "startedAt", ended_at AS "endedAt",
           recording_at AS "recordingAt", summary, summary_at AS "summaryAt",
           (SELECT count(*) FROM huddle_transcript t WHERE t.huddle_id = huddles.id)::int AS "transcriptCount"
    FROM huddles WHERE id = ${id}
  `) as {
    id: string; conversationId: string; createdBy: string; notes: string;
    messageId: string | null; startedAt: string; endedAt: string | null;
    recordingAt: string | null; summary: unknown; summaryAt: string | null; transcriptCount: number;
  }[];
  return rows[0] ?? null;
}

async function activeHuddleForConversation(conversationId: string) {
  const rows = (await sql`
    SELECT id FROM huddles WHERE conversation_id = ${conversationId} AND ended_at IS NULL
    ORDER BY started_at DESC LIMIT 1
  `) as { id: string }[];
  return rows.length ? huddleById(rows[0].id) : null;
}

export async function huddle(req: VercelRequest, res: VercelResponse) {
  const session = await getSession(req);
  if (!session) return res.status(401).json({ error: 'Nicht angemeldet' });
  const uid = session.userId;

  // --- Poll (Zustand + Signale abholen + Heartbeat) ------------------------
  if (req.method === 'GET') {
    res.setHeader('Cache-Control', 'no-store');
    const huddleId = typeof req.query.huddleId === 'string' ? req.query.huddleId : '';
    const conversationId = typeof req.query.conversationId === 'string' ? req.query.conversationId : '';

    let h = huddleId ? await huddleById(huddleId) : conversationId ? await activeHuddleForConversation(conversationId) : null;
    if (!h) return res.json({ huddle: null, participants: [], signals: [] });
    if (!(await isMember(h.conversationId, uid)) && session.role !== 'superadmin') {
      return res.status(403).json({ error: 'Kein Zugriff.' });
    }

    let signals: unknown[] = [];
    // Bin ich (noch) im Call? Dann Heartbeat + meine Signale abholen & löschen.
    const mine = (await sql`SELECT 1 FROM huddle_participants WHERE huddle_id = ${h.id} AND user_id = ${uid} AND left_at IS NULL LIMIT 1`) as unknown[];
    if (mine.length && !h.endedAt) {
      await sql`UPDATE huddle_participants SET last_seen = now() WHERE huddle_id = ${h.id} AND user_id = ${uid}`;
      const sigRows = (await sql`
        SELECT id, sender_id AS "senderId", kind, payload
        FROM huddle_signals WHERE huddle_id = ${h.id} AND target_id = ${uid}
        ORDER BY created_at LIMIT 50
      `) as { id: string; senderId: string; kind: string; payload: unknown }[];
      if (sigRows.length) {
        signals = sigRows.map((s) => ({ senderId: s.senderId, kind: s.kind, payload: s.payload }));
        await sql`DELETE FROM huddle_signals WHERE id = ANY(${sigRows.map((s) => s.id)})`;
      }
      // Nebenbei aufräumen: sind alle anderen weg, Huddle beenden.
      await endIfEmpty(h.id);
      h = (await huddleById(h.id))!;
    }
    const participants = await activeParticipants(h.id);
    // Mitschrift nur auf Wunsch mitliefern (tAfter = nur neue Zeilen seit Zeitpunkt).
    let transcript: unknown[] | undefined;
    if (typeof req.query.transcript === 'string') {
      const after = typeof req.query.tAfter === 'string' && req.query.tAfter ? req.query.tAfter : '1970-01-01T00:00:00Z';
      transcript = await sql`
        SELECT id, user_id AS "userId", user_name AS "userName", text, created_at AS "createdAt"
        FROM huddle_transcript WHERE huddle_id = ${h.id} AND created_at > ${after}::timestamptz
        ORDER BY created_at LIMIT 3000`;
    }
    return res.json({ huddle: h, participants, signals, transcript });
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Nicht unterstützt' });
  const b = req.body ?? {};
  const op = typeof b.op === 'string' ? b.op : '';

  // --- Huddle starten / beitreten ------------------------------------------
  if (op === 'start') {
    const conversationId = typeof b.conversationId === 'string' ? b.conversationId : '';
    if (!conversationId) return badRequest(res, 'Unterhaltungs-ID fehlt.');
    if (!(await isMember(conversationId, uid))) return res.status(403).json({ error: 'Kein Zugriff.' });
    const name = sessionName(session);

    let h = await activeHuddleForConversation(conversationId);
    let isNew = false;
    if (!h) {
      isNew = true;
      const id = genId('hud');
      const msgId = genId('msg');
      await sql`INSERT INTO huddles (id, conversation_id, created_by, message_id) VALUES (${id}, ${conversationId}, ${uid}, ${msgId})`;
      // Anklickbare Karte im Chat (mittig). attach_id = Huddle-ID.
      await sql`
        INSERT INTO messages (id, conversation_id, author_id, author_name, body, attach_type, attach_id, attach_title)
        VALUES (${msgId}, ${conversationId}, ${uid}, ${name}, '🎧 Huddle gestartet', 'huddle', ${id}, 'Huddle')
      `;
      await sql`UPDATE conversations SET updated_at = now() WHERE id = ${conversationId}`;
      h = await huddleById(id);
    }
    const hud = h!;
    await sql`
      INSERT INTO huddle_participants (huddle_id, user_id, user_name, joined_at, last_seen, left_at)
      VALUES (${hud.id}, ${uid}, ${name}, now(), now(), NULL)
      ON CONFLICT (huddle_id, user_id) DO UPDATE SET left_at = NULL, last_seen = now()
    `;

    // Beim NEUEN Huddle die übrigen Mitglieder sanft „anklopfen" (Push).
    if (isNew) {
      const members = (await sql`SELECT user_id AS "userId" FROM conversation_members WHERE conversation_id = ${conversationId}`) as { userId: string }[];
      const url = `/chat?c=${encodeURIComponent(conversationId)}`;
      for (const m of members) {
        if (m.userId === uid) continue;
        await sendPushToUser(m.userId, { title: '🎧 Huddle', body: `${name} hat einen Huddle gestartet – beitreten`, url });
      }
    }
    return res.json({ huddle: hud, participants: await activeParticipants(hud.id) });
  }

  // Ab hier brauchen alle Aktionen eine gültige Huddle-ID.
  const huddleId = typeof b.huddleId === 'string' ? b.huddleId : '';
  if (!huddleId) return badRequest(res, 'Huddle-ID fehlt.');
  const h = await huddleById(huddleId);
  if (!h) return res.status(404).json({ error: 'Huddle nicht gefunden.' });
  if (!(await isMember(h.conversationId, uid)) && session.role !== 'superadmin') return res.status(403).json({ error: 'Kein Zugriff.' });

  if (op === 'join') {
    if (h.endedAt) return badRequest(res, 'Dieser Huddle ist beendet.');
    const name = sessionName(session);
    await sql`
      INSERT INTO huddle_participants (huddle_id, user_id, user_name, joined_at, last_seen, left_at)
      VALUES (${huddleId}, ${uid}, ${name}, now(), now(), NULL)
      ON CONFLICT (huddle_id, user_id) DO UPDATE SET left_at = NULL, last_seen = now()
    `;
    return res.json({ huddle: h, participants: await activeParticipants(huddleId) });
  }

  if (op === 'leave') {
    await sql`UPDATE huddle_participants SET left_at = now(), last_seen = now() WHERE huddle_id = ${huddleId} AND user_id = ${uid}`;
    await endIfEmpty(huddleId);
    return res.json({ ok: true });
  }

  if (op === 'signal') {
    if (h.endedAt) return res.json({ ok: true }); // stiller No-Op auf beendetem Huddle
    const targetId = typeof b.targetId === 'string' ? b.targetId : '';
    const kind = typeof b.kind === 'string' ? b.kind.slice(0, 16) : '';
    if (!targetId || !kind) return badRequest(res, 'Signal unvollständig.');
    await sql`
      INSERT INTO huddle_signals (id, huddle_id, sender_id, target_id, kind, payload)
      VALUES (${genId('hs')}, ${huddleId}, ${uid}, ${targetId}, ${kind}, ${JSON.stringify(b.payload ?? null)}::jsonb)
    `;
    return res.json({ ok: true });
  }

  // --- Mitschreiben (Meeting-Protokoll) ---------------------------------------
  // An/aus: alle im Huddle sehen sofort, dass mitgeschrieben wird.
  if (op === 'record') {
    if (h.endedAt) return badRequest(res, 'Dieser Huddle ist beendet.');
    const on = b.on === true;
    await sql`UPDATE huddles SET recording_at = ${on ? new Date().toISOString() : null} WHERE id = ${huddleId}`;
    return res.json({ ok: true, recordingAt: on ? new Date().toISOString() : null });
  }
  // Eigene erkannte Sätze speichern (jedes Gerät nur die EIGENE Stimme).
  if (op === 'transcript') {
    const fresh = await huddleById(huddleId);
    if (!fresh || fresh.endedAt || !fresh.recordingAt) return res.json({ ok: true, skipped: true });
    const lines = (Array.isArray(b.lines) ? b.lines : [])
      .filter((x: unknown): x is string => typeof x === 'string')
      .map((x: string) => x.replace(/\s+/g, ' ').trim().slice(0, 1200))
      .filter(Boolean)
      .slice(0, 30);
    const name = sessionName(session);
    for (const text of lines) {
      await sql`INSERT INTO huddle_transcript (id, huddle_id, user_id, user_name, text) VALUES (${genId('ht')}, ${huddleId}, ${uid}, ${name}, ${text})`;
    }
    return res.json({ ok: true });
  }
  // KI-Zusammenfassung (ein Aufruf, nur Text → sehr günstig).
  if (op === 'summarize') {
    const rows = (await sql`
      SELECT user_name AS "userName", text, created_at AS "createdAt"
      FROM huddle_transcript WHERE huddle_id = ${huddleId} ORDER BY created_at LIMIT 5000
    `) as { userName: string; text: string; createdAt: string }[];
    if (!rows.length) return badRequest(res, 'Es gibt noch keine Mitschrift für diesen Huddle.');
    const start = new Date(rows[0].createdAt).getTime();
    let body = rows
      .map((r) => `[${Math.max(0, Math.floor((new Date(r.createdAt).getTime() - start) / 60000))}] ${r.userName}: ${r.text}`)
      .join('\n');
    if (body.length > 160_000) body = body.slice(0, 160_000); // Deckel ~2,5 Std. – hält die Kosten klein
    const names = [...new Set(rows.map((r) => r.userName).filter(Boolean))];
    try {
      const summary = await summarizeMeeting(body, names);
      await sql`UPDATE huddles SET summary = ${JSON.stringify(summary)}::jsonb, summary_at = now() WHERE id = ${huddleId}`;
      return res.json({ ok: true, summary, summaryAt: new Date().toISOString() });
    } catch (e) {
      return res.status(502).json({ error: e instanceof Error ? e.message : 'Zusammenfassung fehlgeschlagen.' });
    }
  }

  if (op === 'notes') {
    const notes = typeof b.notes === 'string' ? b.notes.slice(0, 8000) : '';
    await sql`UPDATE huddles SET notes = ${notes} WHERE id = ${huddleId}`;
    return res.json({ ok: true });
  }

  return badRequest(res, 'Unbekannte Aktion.');
}
