import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sql } from './db.js';
import { getSession } from './auth.js';
import { badRequest, isNonEmptyString } from './validate.js';
import { genId, sessionName, loadMembers, memberName, notify, findMentions } from './collab.js';
import { sendPushToUser } from './push.js';

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
      SELECT c.id, c.kind, c.title, COALESCE(c.avatar_url, '') AS "avatarUrl", c.created_by AS "createdBy", c.updated_at AS "updatedAt",
        (SELECT count(*)::int FROM messages m
           WHERE m.conversation_id = c.id AND m.parent_id IS NULL
             AND m.created_at > cm.last_read_at AND m.author_id <> ${uid}) AS unread,
        (SELECT json_agg(json_build_object('userId', x.user_id, 'userName', x.user_name))
           FROM conversation_members x WHERE x.conversation_id = c.id) AS members,
        (SELECT json_build_object(
                  'body', CASE WHEN m.deleted_at IS NULL THEN m.body ELSE '' END,
                  'authorName', m.author_name, 'createdAt', m.created_at,
                  'attachType', CASE WHEN m.deleted_at IS NULL THEN m.attach_type END,
                  'deleted', m.deleted_at IS NOT NULL)
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
  m.author_id AS "authorId", m.author_name AS "authorName",
  CASE WHEN m.deleted_at IS NULL THEN m.body ELSE '' END AS body,
  CASE WHEN m.deleted_at IS NULL THEN m.attach_type END AS "attachType",
  CASE WHEN m.deleted_at IS NULL THEN m.attach_id END AS "attachId",
  CASE WHEN m.deleted_at IS NULL THEN m.attach_title END AS "attachTitle",
  CASE WHEN m.deleted_at IS NULL THEN m.attach_url END AS "attachUrl",
  CASE WHEN m.deleted_at IS NULL THEN m.attach_mime END AS "attachMime",
  m.edited_at AS "editedAt", m.deleted_at AS "deletedAt", m.created_at AS "createdAt",
  COALESCE((SELECT json_agg(json_build_object('userId', r.user_id, 'emoji', r.emoji) ORDER BY r.created_at)
            FROM message_reactions r WHERE r.message_id = m.id), '[]'::json) AS reactions
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
        attach_url AS "attachUrl", attach_mime AS "attachMime",
        edited_at AS "editedAt", deleted_at AS "deletedAt", created_at AS "createdAt"
    `;
    await sql`UPDATE conversations SET updated_at = now() WHERE id = ${conversationId}`;

    // Benachrichtigungen: @Erwähnungen (Glocke + Push) und Handy-Push an die
    // übrigen Mitglieder (wie WhatsApp – nur Push, keine Glocken-Flut).
    const convRows = await sql`SELECT kind, title FROM conversations WHERE id = ${conversationId}`;
    const conv = (convRows[0] as { kind: string; title: string } | undefined) ?? { kind: 'group', title: '' };
    const convMembers = (await sql`SELECT user_id AS "userId" FROM conversation_members WHERE conversation_id = ${conversationId}`) as { userId: string }[];
    const memberSet = new Set(convMembers.map((m) => m.userId));
    const mentioned = new Set<string>();
    if (hasBody) {
      const allMembers = await loadMembers();
      for (const mid of findMentions(b.body, allMembers)) {
        if (memberSet.has(mid) && mid !== uid) {
          mentioned.add(mid);
          await notify(mid, uid, 'mention', 'conversation', conversationId, `${name} hat dich im Chat erwähnt.`);
        }
      }
    }
    const preview = hasBody
      ? String(b.body).slice(0, 120)
      : attachType === 'audio'
        ? '🎤 Sprachnachricht'
        : attachType === 'file'
          ? '📎 Datei'
          : '📎 Anhang';
    const pushTitle = conv.kind === 'group' ? conv.title || 'Gruppe' : name;
    const pushBody = conv.kind === 'group' ? `${name}: ${preview}` : preview;
    for (const cm of convMembers) {
      if (cm.userId === uid || mentioned.has(cm.userId)) continue;
      await sendPushToUser(cm.userId, { title: pushTitle, body: pushBody, url: '/admin' });
    }
    return res.json({ ...(inserted[0] as object), reactions: [], replyCount: 0 });
  }

  // --- Nachricht bearbeiten (nur eigene, nicht gelöschte) -------------------
  if (req.method === 'PATCH') {
    const b = req.body ?? {};
    const messageId = typeof b.messageId === 'string' ? b.messageId : '';
    if (!messageId) return badRequest(res, 'Nachrichten-ID fehlt.');
    if (!isNonEmptyString(b.body)) return badRequest(res, 'Nachricht darf nicht leer sein.');
    const own = await sql`SELECT author_id, deleted_at FROM messages WHERE id = ${messageId} LIMIT 1`;
    const row = own[0] as { author_id: string; deleted_at: string | null } | undefined;
    if (!row) return res.status(404).json({ error: 'Nachricht nicht gefunden.' });
    if (row.author_id !== uid) return res.status(403).json({ error: 'Nur eigene Nachrichten können bearbeitet werden.' });
    if (row.deleted_at) return badRequest(res, 'Gelöschte Nachricht kann nicht bearbeitet werden.');
    await sql`UPDATE messages SET body = ${b.body.slice(0, 8000)}, edited_at = now() WHERE id = ${messageId}`;
    const updated = await sql.query(`SELECT ${MSG_COLS} FROM messages m WHERE m.id = $1`, [messageId]);
    return res.json(updated[0] ?? { ok: true });
  }

  // --- Nachricht für alle löschen (nur eigene) ------------------------------
  if (req.method === 'DELETE') {
    const messageId = typeof req.body?.messageId === 'string' ? req.body.messageId : String(req.query.messageId ?? '');
    if (!messageId) return badRequest(res, 'Nachrichten-ID fehlt.');
    const own = await sql`SELECT author_id FROM messages WHERE id = ${messageId} LIMIT 1`;
    const row = own[0] as { author_id: string } | undefined;
    if (!row) return res.status(404).json({ error: 'Nachricht nicht gefunden.' });
    if (row.author_id !== uid) return res.status(403).json({ error: 'Nur eigene Nachrichten können gelöscht werden.' });
    // Inhalt tatsächlich leeren (nicht nur ausblenden) + als gelöscht markieren.
    await sql`UPDATE messages SET deleted_at = now(), body = '', attach_type = NULL, attach_id = NULL, attach_title = NULL, attach_url = NULL, attach_mime = NULL WHERE id = ${messageId}`;
    await sql`DELETE FROM message_reactions WHERE message_id = ${messageId}`;
    return res.json({ ok: true, id: messageId });
  }

  return res.status(405).json({ error: 'Nicht unterstützt' });
}

// --- Emoji-Reaktion setzen/umschalten ---------------------------------------
// POST /api/chat?resource=react { messageId, emoji }
// Eine Reaktion pro Nutzer & Nachricht: gleicher Emoji = weg (Toggle), anderer
// Emoji = ersetzt. Antwort: aktuelle Reaktionsliste der Nachricht.
export async function reactMessage(req: VercelRequest, res: VercelResponse) {
  const session = await getSession(req);
  if (!session) return res.status(401).json({ error: 'Nicht angemeldet' });
  if (req.method !== 'POST') return res.status(405).json({ error: 'Nicht unterstützt' });
  const uid = session.userId;
  const b = req.body ?? {};
  const messageId = typeof b.messageId === 'string' ? b.messageId : '';
  const emoji = typeof b.emoji === 'string' ? b.emoji.slice(0, 16) : '';
  if (!messageId || !emoji) return badRequest(res, 'Angaben fehlen.');

  const rows = await sql`SELECT conversation_id, deleted_at FROM messages WHERE id = ${messageId} LIMIT 1`;
  const msg = rows[0] as { conversation_id: string; deleted_at: string | null } | undefined;
  if (!msg || msg.deleted_at) return res.status(404).json({ error: 'Nachricht nicht gefunden.' });
  if (!(await isMember(msg.conversation_id, uid))) return res.status(403).json({ error: 'Kein Zugriff auf diese Unterhaltung.' });

  const existing = await sql`SELECT emoji FROM message_reactions WHERE message_id = ${messageId} AND user_id = ${uid} LIMIT 1`;
  const current = (existing[0] as { emoji: string } | undefined)?.emoji;
  if (current === emoji) {
    await sql`DELETE FROM message_reactions WHERE message_id = ${messageId} AND user_id = ${uid}`;
  } else {
    await sql`
      INSERT INTO message_reactions (message_id, user_id, emoji) VALUES (${messageId}, ${uid}, ${emoji})
      ON CONFLICT (message_id, user_id) DO UPDATE SET emoji = EXCLUDED.emoji, created_at = now()
    `;
  }
  const reactions = await sql`
    SELECT user_id AS "userId", emoji FROM message_reactions WHERE message_id = ${messageId} ORDER BY created_at
  `;
  return res.json({ messageId, reactions });
}

// --- Globale Suche (nur eigene Unterhaltungen) ------------------------------
export async function searchMessages(req: VercelRequest, res: VercelResponse) {
  const session = await getSession(req);
  if (!session) return res.status(401).json({ error: 'Nicht angemeldet' });
  if (req.method !== 'GET') return res.status(405).json({ error: 'Nicht unterstützt' });
  res.setHeader('Cache-Control', 'no-store');
  const q = String(req.query.q ?? '').trim();
  if (q.length < 2) return res.json([]);
  const like = `%${q}%`;
  // Optional auf eine Unterhaltung eingrenzen (Lupe innerhalb eines Chats).
  // Es werden bewusst AUCH Thread-Antworten (parent_id gesetzt) durchsucht;
  // parentId wird mitgeliefert, damit der Client den Thread öffnen kann.
  const conversationId = typeof req.query.conversationId === 'string' ? req.query.conversationId : '';
  const params: unknown[] = [session.userId, like];
  let extra = '';
  if (conversationId) {
    params.push(conversationId);
    extra = ` AND m.conversation_id = $${params.length}`;
  }
  const rows = await sql.query(
    `SELECT m.id, m.conversation_id AS "conversationId", m.parent_id AS "parentId", m.author_id AS "authorId",
            m.author_name AS "authorName", m.body, m.attach_type AS "attachType",
            m.created_at AS "createdAt", c.kind AS "convKind", c.title AS "convTitle"
     FROM messages m
     JOIN conversations c ON c.id = m.conversation_id
     JOIN conversation_members cm ON cm.conversation_id = c.id AND cm.user_id = $1
     WHERE (m.body ILIKE $2 OR m.author_name ILIKE $2)${extra}
     ORDER BY m.created_at DESC LIMIT 40`,
    params
  );
  return res.json(rows);
}

// --- Gruppe verwalten (nur Super-Admin): Name & Bild ------------------------
export async function updateConversation(req: VercelRequest, res: VercelResponse) {
  const session = await getSession(req);
  if (!session) return res.status(401).json({ error: 'Nicht angemeldet' });
  if (req.method !== 'POST') return res.status(405).json({ error: 'Nicht unterstützt' });
  if (session.role !== 'superadmin') return res.status(403).json({ error: 'Nur Super-Admins dürfen Gruppen verwalten.' });

  const b = req.body ?? {};
  const id = typeof b.conversationId === 'string' ? b.conversationId : '';
  if (!id) return badRequest(res, 'Unterhaltungs-ID fehlt.');
  const rows = await sql`SELECT kind FROM conversations WHERE id = ${id}`;
  if (rows.length === 0) return res.status(404).json({ error: 'Gruppe nicht gefunden.' });
  if ((rows[0] as { kind: string }).kind !== 'group') return badRequest(res, 'Nur Gruppen können bearbeitet werden.');

  const title = typeof b.title === 'string' && b.title.trim() ? b.title.trim().slice(0, 80) : undefined;
  const avatarUrl =
    b.avatarUrl !== undefined &&
    typeof b.avatarUrl === 'string' &&
    (b.avatarUrl === '' || /^https?:\/\//i.test(b.avatarUrl))
      ? b.avatarUrl
      : undefined;
  await sql`UPDATE conversations SET title = COALESCE(${title ?? null}, title), avatar_url = COALESCE(${avatarUrl ?? null}, avatar_url) WHERE id = ${id}`;
  return res.json({ ok: true });
}

// --- Gruppenmitglied hinzufügen/entfernen (nur Super-Admin) ------------------
export async function manageMember(req: VercelRequest, res: VercelResponse) {
  const session = await getSession(req);
  if (!session) return res.status(401).json({ error: 'Nicht angemeldet' });
  if (req.method !== 'POST') return res.status(405).json({ error: 'Nicht unterstützt' });
  if (session.role !== 'superadmin') return res.status(403).json({ error: 'Nur Super-Admins dürfen Mitglieder verwalten.' });

  const b = req.body ?? {};
  const id = typeof b.conversationId === 'string' ? b.conversationId : '';
  const userId = typeof b.userId === 'string' ? b.userId : '';
  const op = b.op === 'remove' ? 'remove' : 'add';
  if (!id || !userId) return badRequest(res, 'Angaben fehlen.');
  const rows = await sql`SELECT kind FROM conversations WHERE id = ${id}`;
  if (rows.length === 0) return res.status(404).json({ error: 'Gruppe nicht gefunden.' });
  if ((rows[0] as { kind: string }).kind !== 'group') return badRequest(res, 'Mitglieder gibt es nur in Gruppen.');

  if (op === 'remove') {
    await sql`DELETE FROM conversation_members WHERE conversation_id = ${id} AND user_id = ${userId}`;
    return res.json({ ok: true });
  }
  const members = await loadMembers();
  if (!members.has(userId)) return badRequest(res, 'Kein aktives Team-Mitglied.');
  await sql`
    INSERT INTO conversation_members (conversation_id, user_id, user_name)
    VALUES (${id}, ${userId}, ${memberName(members, userId)})
    ON CONFLICT (conversation_id, user_id) DO NOTHING
  `;
  await notify(userId, session.userId, 'chat', 'conversation', id, 'Du wurdest zu einer Gruppe hinzugefügt.');
  return res.json({ ok: true });
}

// --- Präsenz: echter Online-Status + „tippt gerade" -------------------------
// Bewusst leichtgewichtig und ephemer (kein Verlauf, keine Lesebestätigung –
// das würde nur Antwortdruck erzeugen). Ein Eintrag pro Nutzer.
//   POST /api/chat?resource=presence {typingConversationId?}  -> Heartbeat (+Tippen)
//   GET  /api/chat?resource=presence[&conversationId=X]       -> {online[],typing[]}
export async function presence(req: VercelRequest, res: VercelResponse) {
  const session = await getSession(req);
  if (!session) return res.status(401).json({ error: 'Nicht angemeldet' });
  const uid = session.userId;

  if (req.method === 'POST') {
    const b = req.body ?? {};
    const typingConv = typeof b.typingConversationId === 'string' && b.typingConversationId ? b.typingConversationId : null;
    const name = sessionName(session);
    // Heartbeat aktualisiert immer last_seen; Tipp-Status wird gesetzt bzw.
    // gelöscht (typing_at nur, wenn tatsächlich in einer Unterhaltung getippt).
    await sql`
      INSERT INTO chat_presence (user_id, last_seen, typing_conv, typing_at, typing_name)
      VALUES (${uid}, now(), ${typingConv},
              CASE WHEN ${typingConv}::text IS NULL THEN NULL ELSE now() END, ${name})
      ON CONFLICT (user_id) DO UPDATE SET
        last_seen = now(),
        typing_conv = EXCLUDED.typing_conv,
        typing_at = EXCLUDED.typing_at,
        typing_name = EXCLUDED.typing_name
    `;
    return res.json({ ok: true });
  }

  if (req.method === 'GET') {
    res.setHeader('Cache-Control', 'no-store');
    const conversationId = String(req.query.conversationId ?? '');
    // Online = Heartbeat jünger als 35 s (Client sendet alle ~18 s).
    const onlineRows = (await sql`
      SELECT user_id AS "userId" FROM chat_presence WHERE last_seen > now() - interval '35 seconds'
    `) as { userId: string }[];
    let typing: { userId: string; userName: string }[] = [];
    if (conversationId && (await isMember(conversationId, uid))) {
      typing = (await sql`
        SELECT user_id AS "userId", COALESCE(typing_name, '') AS "userName"
        FROM chat_presence
        WHERE typing_conv = ${conversationId}
          AND typing_at > now() - interval '6 seconds'
          AND user_id <> ${uid}
      `) as { userId: string; userName: string }[];
    }
    return res.json({ online: onlineRows.map((o) => o.userId), typing });
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
