import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sql } from './db.js';
import { getSession } from './auth.js';
import { badRequest, isNonEmptyString } from './validate.js';
import { genId, sessionName, loadMembers, memberName, notify, findMentions } from './collab.js';

// Phase 3: Interner Chat – Gruppen, DMs, Slack-Threads, Ticket-/Aufgaben-Anhänge.
// Dispatch aus api/chat.ts über ?resource=conversations|messages|read.

async function isMember(conversationId: string, userId: string): Promise<boolean> {
  const rows = await sql`
    SELECT 1 FROM conversation_members WHERE conversation_id = ${conversationId} AND user_id = ${userId} LIMIT 1
  `;
  return rows.length > 0;
}

// --- Unterhaltungen ---------------------------------------------------------
export async function conversations(req: VercelRequest, res: VercelResponse) {
  const session = await getSession(req);
  if (!session) return res.status(401).json({ error: 'Nicht angemeldet' });
  const uid = session.userId;

  if (req.method === 'GET') {
    res.setHeader('Cache-Control', 'no-store');
    const rows = await sql`
      SELECT c.id, c.kind, c.title, c.created_by AS "createdBy", c.updated_at AS "updatedAt",
        (SELECT count(*)::int FROM messages m
           WHERE m.conversation_id = c.id AND m.parent_id IS NULL
             AND m.created_at > cm.last_read_at AND m.author_id <> ${uid}) AS unread,
        (SELECT json_agg(json_build_object('userId', x.user_id, 'userName', x.user_name))
           FROM conversation_members x WHERE x.conversation_id = c.id) AS members,
        (SELECT json_build_object('body', m.body, 'authorName', m.author_name,
                                  'createdAt', m.created_at, 'attachType', m.attach_type)
           FROM messages m WHERE m.conversation_id = c.id AND m.parent_id IS NULL
           ORDER BY m.created_at DESC LIMIT 1) AS "lastMessage"
      FROM conversations c
      JOIN conversation_members cm ON cm.conversation_id = c.id AND cm.user_id = ${uid}
      ORDER BY c.updated_at DESC
    `;
    return res.json(rows);
  }

  if (req.method === 'POST') {
    const b = req.body ?? {};
    const members = await loadMembers();
    const meName = sessionName(session);

    if (b.kind === 'dm') {
      const otherId = typeof b.userId === 'string' ? b.userId : '';
      if (!otherId || otherId === uid || !members.has(otherId)) {
        return badRequest(res, 'Bitte eine gültige Person auswählen.');
      }
      const key = [uid, otherId].sort().join('|');
      const existing = await sql`SELECT id FROM conversations WHERE dm_key = ${key} LIMIT 1`;
      if (existing.length) return res.json({ id: (existing[0] as { id: string }).id, existing: true });

      const id = genId('conv');
      await sql`INSERT INTO conversations (id, kind, title, dm_key, created_by) VALUES (${id}, 'dm', '', ${key}, ${uid})`;
      await sql`INSERT INTO conversation_members (conversation_id, user_id, user_name) VALUES (${id}, ${uid}, ${meName})`;
      await sql`INSERT INTO conversation_members (conversation_id, user_id, user_name) VALUES (${id}, ${otherId}, ${memberName(members, otherId)})`;
      return res.json({ id });
    }

    if (b.kind === 'group') {
      if (!isNonEmptyString(b.title)) return badRequest(res, 'Bitte einen Gruppennamen angeben.');
      const wanted = Array.isArray(b.memberIds) ? b.memberIds : [];
      const ids = new Set<string>([uid]);
      for (const m of wanted) if (typeof m === 'string' && members.has(m)) ids.add(m);

      const id = genId('conv');
      await sql`INSERT INTO conversations (id, kind, title, created_by) VALUES (${id}, 'group', ${b.title.trim().slice(0, 80)}, ${uid})`;
      for (const memberId of ids) {
        const nm = memberId === uid ? meName : memberName(members, memberId);
        await sql`INSERT INTO conversation_members (conversation_id, user_id, user_name) VALUES (${id}, ${memberId}, ${nm})`;
      }
      // Andere Mitglieder über die neue Gruppe informieren.
      for (const memberId of ids) {
        if (memberId !== uid) {
          await notify(memberId, uid, 'chat', 'conversation', id, `${meName} hat dich zur Gruppe „${b.title.trim()}“ hinzugefügt.`);
        }
      }
      return res.json({ id });
    }

    return badRequest(res, 'Unbekannter Unterhaltungstyp.');
  }

  return res.status(405).json({ error: 'Nicht unterstützt' });
}

// --- Nachrichten ------------------------------------------------------------
const MSG_COLS = `
  m.id, m.conversation_id AS "conversationId", m.parent_id AS "parentId",
  m.author_id AS "authorId", m.author_name AS "authorName", m.body,
  m.attach_type AS "attachType", m.attach_id AS "attachId", m.attach_title AS "attachTitle",
  m.attach_url AS "attachUrl", m.attach_mime AS "attachMime",
  m.created_at AS "createdAt"
`;

// Nur http(s)-URLs als Anhang zulassen (kein javascript:/data:).
function safeUrl(v: unknown): string | null {
  return typeof v === 'string' && /^https?:\/\//i.test(v.trim()) ? v.trim() : null;
}

export async function messages(req: VercelRequest, res: VercelResponse) {
  const session = await getSession(req);
  if (!session) return res.status(401).json({ error: 'Nicht angemeldet' });
  const uid = session.userId;

  if (req.method === 'GET') {
    res.setHeader('Cache-Control', 'no-store');
    const conversationId = String(req.query.conversationId ?? '');
    if (!conversationId) return badRequest(res, 'Unterhaltungs-ID fehlt.');
    if (!(await isMember(conversationId, uid))) return res.status(403).json({ error: 'Kein Zugriff auf diese Unterhaltung.' });

    const parentId = typeof req.query.parentId === 'string' ? req.query.parentId : '';
    if (parentId) {
      // Thread-Antworten
      const replies = await sql.query(
        `SELECT ${MSG_COLS} FROM messages m WHERE m.conversation_id = $1 AND m.parent_id = $2 ORDER BY m.created_at`,
        [conversationId, parentId]
      );
      return res.json(replies);
    }

    // Top-Level-Nachrichten inkl. Antwort-Zähler
    const rows = await sql.query(
      `SELECT ${MSG_COLS},
         (SELECT count(*)::int FROM messages r WHERE r.parent_id = m.id) AS "replyCount"
       FROM messages m WHERE m.conversation_id = $1 AND m.parent_id IS NULL ORDER BY m.created_at`,
      [conversationId]
    );
    // Beim Öffnen als gelesen markieren.
    await sql`UPDATE conversation_members SET last_read_at = now() WHERE conversation_id = ${conversationId} AND user_id = ${uid}`;
    return res.json(rows);
  }

  if (req.method === 'POST') {
    const b = req.body ?? {};
    const conversationId = typeof b.conversationId === 'string' ? b.conversationId : '';
    if (!conversationId) return badRequest(res, 'Unterhaltungs-ID fehlt.');
    if (!(await isMember(conversationId, uid))) return res.status(403).json({ error: 'Kein Zugriff auf diese Unterhaltung.' });

    const hasBody = isNonEmptyString(b.body);
    const ATTACH = ['ticket', 'task', 'file', 'audio'];
    const attachType = ATTACH.includes(b.attachType) ? b.attachType : null;
    if (!hasBody && !attachType) return badRequest(res, 'Nachricht darf nicht leer sein.');

    const parentId = typeof b.parentId === 'string' && b.parentId ? b.parentId : null;
    if (parentId) {
      const p = await sql`SELECT 1 FROM messages WHERE id = ${parentId} AND conversation_id = ${conversationId} LIMIT 1`;
      if (p.length === 0) return badRequest(res, 'Ungültige Thread-Nachricht.');
    }
    // Ticket/Aufgabe: Verweis via attachId. Datei/Audio: Blob-URL + MIME.
    const isRef = attachType === 'ticket' || attachType === 'task';
    const isMedia = attachType === 'file' || attachType === 'audio';
    const attachId = isRef ? String(b.attachId ?? '').slice(0, 80) : null;
    const attachTitle = attachType ? String(b.attachTitle ?? '').slice(0, 200) : null;
    const attachUrl = isMedia ? safeUrl(b.attachUrl) : null;
    const attachMime = isMedia ? String(b.attachMime ?? '').slice(0, 120) || null : null;
    if (isMedia && !attachUrl) return badRequest(res, 'Anhang-URL fehlt oder ist ungültig.');
    const body = hasBody ? b.body.slice(0, 8000) : '';
    const id = genId('msg');
    const name = sessionName(session);

    const inserted = await sql`
      INSERT INTO messages (id, conversation_id, parent_id, author_id, author_name, body, attach_type, attach_id, attach_title, attach_url, attach_mime)
      VALUES (${id}, ${conversationId}, ${parentId}, ${uid}, ${name}, ${body}, ${attachType}, ${attachId}, ${attachTitle}, ${attachUrl}, ${attachMime})
      RETURNING id, conversation_id AS "conversationId", parent_id AS "parentId",
        author_id AS "authorId", author_name AS "authorName", body,
        attach_type AS "attachType", attach_id AS "attachId", attach_title AS "attachTitle",
        attach_url AS "attachUrl", attach_mime AS "attachMime", created_at AS "createdAt"
    `;
    await sql`UPDATE conversations SET updated_at = now() WHERE id = ${conversationId}`;

    // Erwähnungen benachrichtigen – aber nur Mitglieder dieser Unterhaltung.
    if (hasBody) {
      const allMembers = await loadMembers();
      const convMembers = (await sql`SELECT user_id AS "userId" FROM conversation_members WHERE conversation_id = ${conversationId}`) as { userId: string }[];
      const memberSet = new Set(convMembers.map((m) => m.userId));
      for (const mentionedId of findMentions(b.body, allMembers)) {
        if (memberSet.has(mentionedId)) {
          await notify(mentionedId, uid, 'mention', 'conversation', conversationId, `${name} hat dich im Chat erwähnt.`);
        }
      }
    }
    return res.json({ ...(inserted[0] as object), replyCount: 0 });
  }

  return res.status(405).json({ error: 'Nicht unterstützt' });
}

// --- Als gelesen markieren --------------------------------------------------
export async function markRead(req: VercelRequest, res: VercelResponse) {
  const session = await getSession(req);
  if (!session) return res.status(401).json({ error: 'Nicht angemeldet' });
  if (req.method !== 'POST') return res.status(405).json({ error: 'Nicht unterstützt' });
  const conversationId = typeof req.body?.conversationId === 'string' ? req.body.conversationId : '';
  if (!conversationId) return badRequest(res, 'Unterhaltungs-ID fehlt.');
  await sql`UPDATE conversation_members SET last_read_at = now() WHERE conversation_id = ${conversationId} AND user_id = ${session.userId}`;
  return res.json({ ok: true });
}
