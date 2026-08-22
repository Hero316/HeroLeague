import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sql, getUsers } from './db.js';
import { getSession, normalizeStatus } from './auth.js';
import type { SessionPayload } from './auth.js';
import { sendPushToUser } from './push.js';
import {
  badRequest,
  isNonEmptyString,
  isTicketPriority,
  isTicketStatus,
  isTaskStatus,
  sanitizeImageUrls,
  sanitizeLinks,
} from './validate.js';
import type { AppUser } from '../../src/types';

// Team-Zusammenarbeit: Tickets, Aufgaben-Board und Benachrichtigungen.
// Alle Handler liegen hier in einer _lib-Datei (zählt NICHT zum Vercel-
// Funktionslimit) und werden aus api/twitch.ts per ?resource=... dispatcht.
// Jeder Handler prüft die Sitzung selbst und verzweigt nach HTTP-Methode.

export function genId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// Anzeigename einer Sitzung (fällt sinnvoll zurück).
export function sessionName(s: SessionPayload): string {
  return (s.name && s.name.trim()) || (s.email && s.email.trim()) || 'Unbekannt';
}

// Aktive Team-Mitglieder als Nachschlagekarte (id -> {name, ...}).
export async function loadMembers(): Promise<Map<string, AppUser>> {
  const users = await getUsers();
  const map = new Map<string, AppUser>();
  for (const u of users) if (u.isActive) map.set(u.id, u);
  return map;
}

export function memberName(members: Map<string, AppUser>, id: string): string {
  const u = members.get(id);
  return u ? (u.name && u.name.trim() ? u.name : u.email) : 'Unbekannt';
}

// Eine Benachrichtigung anlegen (self-notify wird übersprungen).
// Ziel-URL für Klick auf die Benachrichtigung (Handy-Push): IMMER in die
// Team-App (/chat) – Chat direkt in die Unterhaltung, Ticket/Aufgabe als
// Detail-Fenster obendrauf. So landet man einheitlich in der Team-App und
// nicht mehr im Liga-Backoffice.
function notifyUrl(refType: 'ticket' | 'task' | 'conversation' | 'idea', refId: string): string {
  if (refType === 'conversation') return `/chat?c=${encodeURIComponent(refId)}`;
  if (refType === 'ticket') return `/chat?openTicket=${encodeURIComponent(refId)}`;
  if (refType === 'idea') return `/chat?tab=ideen&openIdea=${encodeURIComponent(refId)}`;
  return `/chat?openTask=${encodeURIComponent(refId)}`; // task (Aufgabe/Termin)
}

export async function notify(
  recipientId: string | null | undefined,
  actorId: string,
  kind: string,
  refType: 'ticket' | 'task' | 'conversation' | 'idea',
  refId: string,
  body: string
): Promise<void> {
  if (!recipientId || recipientId === actorId) return;
  await sql`
    INSERT INTO notifications (id, user_id, kind, ref_type, ref_id, body, is_read)
    VALUES (${genId('n')}, ${recipientId}, ${kind}, ${refType}, ${refId}, ${body.slice(0, 200)}, false)
  `;
  // Zusätzlich als Handy-Push (best-effort; respektiert „nicht stören").
  await sendPushToUser(recipientId, { title: 'Hero League', body: body.slice(0, 200), url: notifyUrl(refType, refId) });
}

// Einfache @Name-Erwähnungen gegen die Mitgliederliste auflösen.
export function findMentions(text: string, members: Map<string, AppUser>): string[] {
  if (!text.includes('@')) return [];
  const lower = text.toLowerCase();
  const ids: string[] = [];
  for (const u of members.values()) {
    const label = (u.name && u.name.trim() ? u.name : u.email).toLowerCase();
    if (label && lower.includes(`@${label}`)) ids.push(u.id);
  }
  return ids;
}

// --- Team-Mitglieder (für Zuweisungen/Erwähnungen) -------------------------
// Für JEDEN eingeloggten Nutzer lesbar (anders als /api/users, nur Super-Admin).
export async function teamMembers(req: VercelRequest, res: VercelResponse) {
  const session = await getSession(req);
  if (!session) return res.status(401).json({ error: 'Nicht angemeldet' });
  if (req.method !== 'GET') return res.status(405).json({ error: 'Nicht unterstützt' });
  res.setHeader('Cache-Control', 'no-store');
  const users = await getUsers();
  const members = users
    .filter((u) => u.isActive)
    .map((u) => ({
      id: u.id,
      name: u.name && u.name.trim() ? u.name : u.email,
      role: u.role,
      avatarUrl: u.avatarUrl ?? '',
      status: u.status ?? 'online',
    }));
  return res.json(members);
}

// Eigenes Profil bearbeiten (Name, Avatar, Status). Jeder eingeloggte Nutzer –
// aber nur die EIGENE Zeile. Der Master-Passwort-Zugang (bootstrap) hat keine
// Nutzerzeile und wird abgewiesen (bitte mit echtem Account anmelden).
export async function updateProfile(req: VercelRequest, res: VercelResponse) {
  const session = await getSession(req);
  if (!session) return res.status(401).json({ error: 'Nicht angemeldet' });
  if (req.method !== 'POST') return res.status(405).json({ error: 'Nicht unterstützt' });
  if (session.userId === 'bootstrap') {
    return badRequest(res, 'Bitte mit einem echten Account (E-Mail-Login) anmelden, um dein Profil zu bearbeiten.');
  }
  const b = req.body ?? {};
  const rows = await sql`SELECT name, COALESCE(avatar_url,'') AS "avatarUrl", COALESCE(status,'online') AS status FROM users WHERE id = ${session.userId}`;
  if (rows.length === 0) return res.status(404).json({ error: 'Profil nicht gefunden.' });
  const cur = rows[0] as { name: string; avatarUrl: string; status: string };

  const name = isNonEmptyString(b.name) ? b.name.trim().slice(0, 80) : cur.name;
  let avatarUrl = cur.avatarUrl;
  if (b.avatarUrl !== undefined) {
    const u = typeof b.avatarUrl === 'string' ? b.avatarUrl.trim() : '';
    avatarUrl = u === '' || /^https?:\/\//i.test(u) ? u : cur.avatarUrl;
  }
  const status = normalizeStatus(b.status ?? cur.status);

  await sql`UPDATE users SET name = ${name}, avatar_url = ${avatarUrl}, status = ${status} WHERE id = ${session.userId}`;
  return res.json({ id: session.userId, name, avatarUrl, status, role: session.role });
}

// --- Tickets ----------------------------------------------------------------
const TICKET_SELECT = `
  t.id, t.title, t.description, t.priority, t.status, t.category, t.images,
  t.created_by AS "createdBy", t.created_by_name AS "createdByName",
  t.assigned_to AS "assignedTo", t.assigned_to_name AS "assignedToName",
  t.created_at AS "createdAt", t.updated_at AS "updatedAt"
`;

export async function tickets(req: VercelRequest, res: VercelResponse) {
  const session = await getSession(req);
  if (!session) return res.status(401).json({ error: 'Nicht angemeldet' });

  if (req.method === 'GET') {
    res.setHeader('Cache-Control', 'no-store');
    const rows = await sql`
      SELECT
        t.id, t.title, t.description, t.priority, t.status, t.category, t.images,
        COALESCE(t.links, '[]'::jsonb) AS links,
        t.created_by AS "createdBy", t.created_by_name AS "createdByName",
        t.assigned_to AS "assignedTo", t.assigned_to_name AS "assignedToName",
        t.created_at AS "createdAt", t.updated_at AS "updatedAt",
        (SELECT count(*)::int FROM ticket_comments c WHERE c.ticket_id = t.id) AS "commentCount"
      FROM tickets t
      ORDER BY
        CASE t.status WHEN 'offen' THEN 0 WHEN 'in_bearbeitung' THEN 1 WHEN 'erledigt' THEN 2 ELSE 3 END,
        CASE t.priority WHEN 'dringend' THEN 0 WHEN 'hoch' THEN 1 WHEN 'mittel' THEN 2 ELSE 3 END,
        t.created_at DESC
    `;
    return res.json(rows);
  }

  if (req.method === 'POST') {
    const b = req.body ?? {};
    if (!isNonEmptyString(b.title)) return badRequest(res, 'Bitte einen Titel angeben.');
    const priority = isTicketPriority(b.priority) ? b.priority : 'mittel';
    const description = typeof b.description === 'string' ? b.description.slice(0, 8000) : '';
    const category = typeof b.category === 'string' ? b.category.trim().slice(0, 60) : '';
    const images = sanitizeImageUrls(b.images);
    const links = sanitizeLinks(b.links);
    const id = genId('t');
    const name = sessionName(session);
    const title = b.title.trim().slice(0, 200);

    // Optionale Zuständigkeit direkt beim Erstellen (nur gültige, aktive Person).
    const members = await loadMembers();
    const assignee = typeof b.assignedTo === 'string' && b.assignedTo && members.has(b.assignedTo) ? members.get(b.assignedTo)! : null;
    const assignedTo = assignee ? assignee.id : null;
    const assignedToName = assignee ? assignee.name : null;

    const rows = await sql`
      INSERT INTO tickets (id, title, description, priority, status, category, images, links, created_by, created_by_name, assigned_to, assigned_to_name)
      VALUES (${id}, ${title}, ${description}, ${priority}, 'offen',
              ${category}, ${JSON.stringify(images)}::jsonb, ${JSON.stringify(links)}::jsonb, ${session.userId}, ${name}, ${assignedTo}, ${assignedToName})
      RETURNING
        id, title, description, priority, status, category, images,
        COALESCE(links, '[]'::jsonb) AS links,
        created_by AS "createdBy", created_by_name AS "createdByName",
        assigned_to AS "assignedTo", assigned_to_name AS "assignedToName",
        created_at AS "createdAt", updated_at AS "updatedAt"
    `;

    // Alle Ticket-Bearbeiter (nur Super-Admins) über das neue Ticket informieren –
    // außer der zugewiesenen Person (die bekommt die gezieltere Meldung unten).
    for (const u of members.values()) {
      if (u.role === 'superadmin' && u.id !== assignedTo) {
        await notify(u.id, session.userId, 'ticket_new', 'ticket', id, `Neues Ticket von ${name}: „${title}“`);
      }
    }
    // Direkt zugewiesene Person gezielt benachrichtigen (Glocke + Push).
    if (assignedTo) {
      await notify(assignedTo, session.userId, 'ticket_assigned', 'ticket', id, `Dir wurde ein Ticket zugewiesen: „${title}“`);
    }
    return res.json({ ...rows[0], commentCount: 0, comments: [] });
  }

  return res.status(405).json({ error: 'Nicht unterstützt' });
}

// Einzelticket lesen (mit Kommentaren) bzw. verwalten/löschen.
export async function ticket(req: VercelRequest, res: VercelResponse) {
  const session = await getSession(req);
  if (!session) return res.status(401).json({ error: 'Nicht angemeldet' });

  if (req.method === 'GET') {
    res.setHeader('Cache-Control', 'no-store');
    const id = String(req.query.id ?? '');
    if (!id) return badRequest(res, 'Ticket-ID fehlt.');
    const rows = await sql`
      SELECT
        t.id, t.title, t.description, t.priority, t.status, t.category, t.images,
        COALESCE(t.links, '[]'::jsonb) AS links,
        t.created_by AS "createdBy", t.created_by_name AS "createdByName",
        t.assigned_to AS "assignedTo", t.assigned_to_name AS "assignedToName",
        t.created_at AS "createdAt", t.updated_at AS "updatedAt"
      FROM tickets t WHERE t.id = ${id}
    `;
    if (rows.length === 0) return res.status(404).json({ error: 'Ticket nicht gefunden.' });
    const comments = await sql`
      SELECT id, ticket_id AS "ticketId", author_id AS "authorId", author_name AS "authorName",
             body, images, created_at AS "createdAt"
      FROM ticket_comments WHERE ticket_id = ${id} ORDER BY created_at
    `;
    return res.json({ ...rows[0], comments });
  }

  if (req.method === 'POST') {
    const b = req.body ?? {};
    const id = typeof b.id === 'string' ? b.id : '';
    if (!id) return badRequest(res, 'Ticket-ID fehlt.');

    // Link-Tasten darf JEDER eingeloggte Nutzer setzen (harmlos, kollaborativ) –
    // anders als Status/Zuweisung/Löschen, das Super-Admins vorbehalten bleibt.
    if (b.op === 'links') {
      const links = sanitizeLinks(b.links);
      const rows = await sql`
        UPDATE tickets SET links = ${JSON.stringify(links)}::jsonb, updated_at = now()
        WHERE id = ${id}
        RETURNING
          id, title, description, priority, status, category, images,
          COALESCE(links, '[]'::jsonb) AS links,
          created_by AS "createdBy", created_by_name AS "createdByName",
          assigned_to AS "assignedTo", assigned_to_name AS "assignedToName",
          created_at AS "createdAt", updated_at AS "updatedAt"
      `;
      if (rows.length === 0) return res.status(404).json({ error: 'Ticket nicht gefunden.' });
      return res.json(rows[0]);
    }

    // Verwalten/Löschen (Status, Zuweisung, Priorität, Löschen): nur Super-Admins.
    const mayManage = session.role === 'superadmin';
    if (!mayManage) {
      return res.status(403).json({ error: 'Keine Berechtigung, Tickets zu bearbeiten.' });
    }

    const existing = await sql`
      SELECT id, status, priority, category, assigned_to AS "assignedTo", title
      FROM tickets WHERE id = ${id}
    `;
    if (existing.length === 0) return res.status(404).json({ error: 'Ticket nicht gefunden.' });
    const cur = existing[0] as { assignedTo: string | null; title: string };

    if (b.op === 'delete') {
      await sql`DELETE FROM tickets WHERE id = ${id}`;
      return res.json({ ok: true, deleted: id });
    }

    // Teilaktualisierung: nur mitgeschickte Felder ändern.
    const members = await loadMembers();
    if (b.status !== undefined && !isTicketStatus(b.status)) return badRequest(res, 'Ungültiger Status.');
    if (b.priority !== undefined && !isTicketPriority(b.priority)) return badRequest(res, 'Ungültige Priorität.');

    let assignedTo: string | null = cur.assignedTo;
    let assignedToName: string | null = null;
    let assignmentChanged = false;
    if (b.assignedTo !== undefined) {
      if (b.assignedTo === null || b.assignedTo === '') {
        assignedTo = null;
      } else if (typeof b.assignedTo === 'string' && members.has(b.assignedTo)) {
        assignedTo = b.assignedTo;
        assignedToName = memberName(members, b.assignedTo);
      } else {
        return badRequest(res, 'Zugewiesene Person ist kein aktives Team-Mitglied.');
      }
      assignmentChanged = assignedTo !== cur.assignedTo;
    } else {
      // Namen der Bestandszuweisung beibehalten
      assignedToName = cur.assignedTo ? memberName(members, cur.assignedTo) : null;
    }

    const status = b.status !== undefined ? b.status : undefined;
    const priority = b.priority !== undefined ? b.priority : undefined;
    const category = b.category !== undefined ? String(b.category).trim().slice(0, 60) : undefined;

    const rows = await sql`
      UPDATE tickets SET
        status = COALESCE(${status ?? null}, status),
        priority = COALESCE(${priority ?? null}, priority),
        category = COALESCE(${category ?? null}, category),
        assigned_to = ${assignedTo},
        assigned_to_name = ${assignedToName},
        updated_at = now()
      WHERE id = ${id}
      RETURNING
        id, title, description, priority, status, category, images,
        COALESCE(links, '[]'::jsonb) AS links,
        created_by AS "createdBy", created_by_name AS "createdByName",
        assigned_to AS "assignedTo", assigned_to_name AS "assignedToName",
        created_at AS "createdAt", updated_at AS "updatedAt"
    `;
    if (assignmentChanged && assignedTo) {
      await notify(assignedTo, session.userId, 'ticket_assigned', 'ticket', id, `Dir wurde ein Ticket zugewiesen: „${cur.title}“`);
    }
    return res.json(rows[0]);
  }

  return res.status(405).json({ error: 'Nicht unterstützt' });
}

// Kommentar zu einem Ticket hinzufügen (jeder eingeloggte Nutzer).
export async function ticketComment(req: VercelRequest, res: VercelResponse) {
  const session = await getSession(req);
  if (!session) return res.status(401).json({ error: 'Nicht angemeldet' });
  if (req.method !== 'POST') return res.status(405).json({ error: 'Nicht unterstützt' });

  const b = req.body ?? {};
  const ticketId = typeof b.ticketId === 'string' ? b.ticketId : '';
  if (!ticketId) return badRequest(res, 'Ticket-ID fehlt.');
  if (!isNonEmptyString(b.body)) return badRequest(res, 'Bitte einen Kommentar schreiben.');
  const images = sanitizeImageUrls(b.images);

  const rows = await sql`SELECT created_by AS "createdBy", assigned_to AS "assignedTo", title FROM tickets WHERE id = ${ticketId}`;
  if (rows.length === 0) return res.status(404).json({ error: 'Ticket nicht gefunden.' });
  const t = rows[0] as { createdBy: string; assignedTo: string | null; title: string };

  const id = genId('tc');
  const name = sessionName(session);
  const inserted = await sql`
    INSERT INTO ticket_comments (id, ticket_id, author_id, author_name, body, images)
    VALUES (${id}, ${ticketId}, ${session.userId}, ${name}, ${b.body.slice(0, 8000)}, ${JSON.stringify(images)}::jsonb)
    RETURNING id, ticket_id AS "ticketId", author_id AS "authorId", author_name AS "authorName",
              body, images, created_at AS "createdAt"
  `;
  await sql`UPDATE tickets SET updated_at = now() WHERE id = ${ticketId}`;

  // Benachrichtigen: Ersteller + Zuständige/r + Erwähnte.
  const members = await loadMembers();
  await notify(t.createdBy, session.userId, 'ticket_comment', 'ticket', ticketId, `${name} hat dein Ticket „${t.title}“ kommentiert.`);
  await notify(t.assignedTo, session.userId, 'ticket_comment', 'ticket', ticketId, `Neuer Kommentar zum Ticket „${t.title}“.`);
  for (const uid of findMentions(b.body, members)) {
    await notify(uid, session.userId, 'mention', 'ticket', ticketId, `${name} hat dich im Ticket „${t.title}“ erwähnt.`);
  }
  return res.json(inserted[0]);
}

// --- Aufgaben-Board ---------------------------------------------------------
async function fetchTasks(where: string, params: unknown[]) {
  const query = `
    SELECT t.id, t.title, t.notes, COALESCE(t.type, 'termin') AS "type", to_char(t.due_date, 'YYYY-MM-DD') AS "dueDate",
           to_char(t.end_date, 'YYYY-MM-DD') AS "endDate",
           t.start_time AS "startTime", t.end_time AS "endTime",
           t.iso_week AS "isoWeek", t.status, t.priority,
           COALESCE(t.links, '[]'::jsonb) AS links,
           t.created_by AS "createdBy", t.created_by_name AS "createdByName",
           t.created_at AS "createdAt", t.updated_at AS "updatedAt",
           COALESCE(
             json_agg(json_build_object('userId', a.user_id, 'userName', a.user_name))
             FILTER (WHERE a.user_id IS NOT NULL), '[]'
           ) AS assignees,
           (SELECT count(*)::int FROM task_comments c WHERE c.task_id = t.id) AS "commentCount"
    FROM tasks t
    LEFT JOIN task_assignees a ON a.task_id = t.id
    ${where}
    GROUP BY t.id
    ORDER BY t.due_date NULLS LAST, t.created_at
  `;
  return sql.query(query, params);
}

async function fetchTaskById(id: string) {
  const rows = await fetchTasks('WHERE t.id = $1', [id]);
  return rows[0] ?? null;
}

// Zuweisungen einer Aufgabe komplett ersetzen. Gibt die neu hinzugekommenen
// Nutzer-IDs zurück (für Benachrichtigungen).
async function replaceAssignees(
  taskId: string,
  userIds: string[],
  members: Map<string, AppUser>
): Promise<string[]> {
  const valid = [...new Set(userIds.filter((id) => members.has(id)))];
  const prev = (await sql`SELECT user_id AS "userId" FROM task_assignees WHERE task_id = ${taskId}`) as { userId: string }[];
  const prevSet = new Set(prev.map((r) => r.userId));
  await sql`DELETE FROM task_assignees WHERE task_id = ${taskId}`;
  for (const uid of valid) {
    await sql`INSERT INTO task_assignees (task_id, user_id, user_name) VALUES (${taskId}, ${uid}, ${memberName(members, uid)})`;
  }
  return valid.filter((id) => !prevSet.has(id));
}

function normalizeDueDate(v: unknown): string | null {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}
function normalizeWeek(v: unknown): string | null {
  return typeof v === 'string' && /^\d{4}-W\d{2}$/.test(v) ? v : null;
}
// Uhrzeit "HH:MM" (00:00–23:59). Alles andere -> null (= ganztägig).
function normalizeTime(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const m = /^(\d{2}):(\d{2})$/.exec(v.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h >= 0 && h <= 23 && min >= 0 && min <= 59 ? `${m[1]}:${m[2]}` : null;
}

export async function tasks(req: VercelRequest, res: VercelResponse) {
  const session = await getSession(req);
  if (!session) return res.status(401).json({ error: 'Nicht angemeldet' });

  if (req.method === 'GET') {
    res.setHeader('Cache-Control', 'no-store');
    const week = normalizeWeek(req.query.week);
    const from = normalizeDueDate(req.query.from);
    const to = normalizeDueDate(req.query.to);
    let rows;
    if (week) rows = await fetchTasks('WHERE t.iso_week = $1', [week]);
    // Überlappung mit dem Sichtbereich: Aufgabe startet vor/an "to" UND endet
    // (end_date, sonst due_date) nach/an "from" – so werden Mehrtages-Balken,
    // die in den Bereich hineinragen, ebenfalls geladen.
    else if (from && to) rows = await fetchTasks('WHERE t.due_date <= $2 AND COALESCE(t.end_date, t.due_date) >= $1', [from, to]);
    else rows = await fetchTasks('', []);
    return res.json(rows);
  }

  if (req.method === 'POST') {
    const b = req.body ?? {};
    if (!isNonEmptyString(b.title)) return badRequest(res, 'Bitte einen Titel angeben.');
    const status = isTaskStatus(b.status) ? b.status : 'offen';
    const priority = isTicketPriority(b.priority) ? b.priority : 'mittel';
    const type = ['termin', 'aufgabe', 'beides'].includes(b.type) ? b.type : 'termin';
    const notes = typeof b.notes === 'string' ? b.notes.slice(0, 4000) : '';
    const dueDate = normalizeDueDate(b.dueDate);
    const isoWeek = normalizeWeek(b.isoWeek);
    // Enddatum nur behalten, wenn es NACH dem Starttag liegt (sonst eintägig).
    let endDate = normalizeDueDate(b.endDate);
    if (!dueDate || (endDate && endDate <= dueDate)) endDate = null;
    // Uhrzeiten: ohne Startzeit ist die Aufgabe ganztägig (auch keine Endzeit).
    const startTime = normalizeTime(b.startTime);
    const endTime = startTime ? normalizeTime(b.endTime) : null;
    const assigneeIds = Array.isArray(b.assignees) ? b.assignees.filter((x: unknown): x is string => typeof x === 'string') : [];
    const links = sanitizeLinks(b.links);
    const id = genId('task');
    const name = sessionName(session);

    await sql`
      INSERT INTO tasks (id, title, notes, type, due_date, end_date, start_time, end_time, iso_week, status, priority, links, created_by, created_by_name)
      VALUES (${id}, ${b.title.trim().slice(0, 200)}, ${notes}, ${type}, ${dueDate}, ${endDate}, ${startTime}, ${endTime}, ${isoWeek}, ${status}, ${priority}, ${JSON.stringify(links)}::jsonb, ${session.userId}, ${name})
    `;
    const members = await loadMembers();
    const added = await replaceAssignees(id, assigneeIds, members);
    for (const uid of added) {
      await notify(uid, session.userId, 'task_assigned', 'task', id, `Dir wurde eine Aufgabe zugewiesen: „${b.title.trim()}“`);
    }
    return res.json(await fetchTaskById(id));
  }

  return res.status(405).json({ error: 'Nicht unterstützt' });
}

// Einzelaufgabe inkl. Kommentar-Verlauf lesen.
export async function taskGet(req: VercelRequest, res: VercelResponse) {
  const session = await getSession(req);
  if (!session) return res.status(401).json({ error: 'Nicht angemeldet' });
  if (req.method !== 'GET') return res.status(405).json({ error: 'Nicht unterstützt' });
  res.setHeader('Cache-Control', 'no-store');
  const id = String(req.query.id ?? '');
  if (!id) return badRequest(res, 'Aufgaben-ID fehlt.');
  const t = await fetchTaskById(id);
  if (!t) return res.status(404).json({ error: 'Aufgabe nicht gefunden.' });
  const comments = await sql`
    SELECT id, task_id AS "taskId", author_id AS "authorId", author_name AS "authorName", body, created_at AS "createdAt"
    FROM task_comments WHERE task_id = ${id} ORDER BY created_at
  `;
  return res.json({ ...t, comments });
}

// Aufgabe aktualisieren oder löschen.
export async function task(req: VercelRequest, res: VercelResponse) {
  const session = await getSession(req);
  if (!session) return res.status(401).json({ error: 'Nicht angemeldet' });
  if (req.method !== 'POST') return res.status(405).json({ error: 'Nicht unterstützt' });

  const b = req.body ?? {};
  const id = typeof b.id === 'string' ? b.id : '';
  if (!id) return badRequest(res, 'Aufgaben-ID fehlt.');

  const rows = await sql`SELECT id, created_by AS "createdBy", title FROM tasks WHERE id = ${id}`;
  if (rows.length === 0) return res.status(404).json({ error: 'Aufgabe nicht gefunden.' });
  const cur = rows[0] as { createdBy: string; title: string };

  if (b.op === 'delete') {
    if (session.role !== 'superadmin' && session.userId !== cur.createdBy) {
      return res.status(403).json({ error: 'Nur der Ersteller oder ein Super-Admin darf die Aufgabe löschen.' });
    }
    await sql`DELETE FROM tasks WHERE id = ${id}`;
    return res.json({ ok: true, deleted: id });
  }

  if (b.status !== undefined && !isTaskStatus(b.status)) return badRequest(res, 'Ungültiger Status.');
  if (b.priority !== undefined && !isTicketPriority(b.priority)) return badRequest(res, 'Ungültige Priorität.');
  const title = b.title !== undefined ? String(b.title).trim().slice(0, 200) : undefined;
  if (b.title !== undefined && !title) return badRequest(res, 'Titel darf nicht leer sein.');
  const type = b.type !== undefined && ['termin', 'aufgabe', 'beides'].includes(b.type) ? b.type : undefined;
  const notes = b.notes !== undefined ? String(b.notes).slice(0, 4000) : undefined;
  const dueDate = b.dueDate !== undefined ? normalizeDueDate(b.dueDate) : undefined;
  const isoWeek = b.isoWeek !== undefined ? normalizeWeek(b.isoWeek) : undefined;
  // Enddatum: nur behalten, wenn nach dem (mit-)gesetzten Starttag.
  let endDate = b.endDate !== undefined ? normalizeDueDate(b.endDate) : undefined;
  if (endDate && dueDate && endDate <= dueDate) endDate = null;
  const startTime = b.startTime !== undefined ? normalizeTime(b.startTime) : undefined;
  let endTime = b.endTime !== undefined ? normalizeTime(b.endTime) : undefined;
  // Ganztägig (Startzeit auf null gesetzt) => Endzeit ebenfalls leeren.
  if (startTime === null) endTime = null;
  const setEndTime = b.endTime !== undefined || startTime === null;
  const links = b.links !== undefined ? sanitizeLinks(b.links) : undefined;

  await sql`
    UPDATE tasks SET
      title = COALESCE(${title ?? null}, title),
      type = COALESCE(${type ?? null}, type),
      notes = COALESCE(${notes ?? null}, notes),
      due_date = CASE WHEN ${b.dueDate !== undefined} THEN ${dueDate ?? null}::date ELSE due_date END,
      end_date = CASE WHEN ${b.endDate !== undefined} THEN ${endDate ?? null}::date ELSE end_date END,
      start_time = CASE WHEN ${b.startTime !== undefined} THEN ${startTime ?? null} ELSE start_time END,
      end_time = CASE WHEN ${setEndTime} THEN ${endTime ?? null} ELSE end_time END,
      iso_week = CASE WHEN ${b.isoWeek !== undefined} THEN ${isoWeek ?? null} ELSE iso_week END,
      status = COALESCE(${b.status ?? null}, status),
      priority = COALESCE(${b.priority ?? null}, priority),
      links = CASE WHEN ${links !== undefined} THEN ${JSON.stringify(links ?? [])}::jsonb ELSE links END,
      updated_at = now()
    WHERE id = ${id}
  `;

  if (Array.isArray(b.assignees)) {
    const members = await loadMembers();
    const ids = b.assignees.filter((x: unknown): x is string => typeof x === 'string');
    const added = await replaceAssignees(id, ids, members);
    for (const uid of added) {
      await notify(uid, session.userId, 'task_assigned', 'task', id, `Dir wurde eine Aufgabe zugewiesen: „${cur.title}“`);
    }
  }
  return res.json(await fetchTaskById(id));
}

// Kommentar/Thread zu einer Aufgabe.
export async function taskComment(req: VercelRequest, res: VercelResponse) {
  const session = await getSession(req);
  if (!session) return res.status(401).json({ error: 'Nicht angemeldet' });
  if (req.method !== 'POST') return res.status(405).json({ error: 'Nicht unterstützt' });

  const b = req.body ?? {};
  const taskId = typeof b.taskId === 'string' ? b.taskId : '';
  if (!taskId) return badRequest(res, 'Aufgaben-ID fehlt.');
  if (!isNonEmptyString(b.body)) return badRequest(res, 'Bitte einen Kommentar schreiben.');

  const rows = await sql`SELECT created_by AS "createdBy", title FROM tasks WHERE id = ${taskId}`;
  if (rows.length === 0) return res.status(404).json({ error: 'Aufgabe nicht gefunden.' });
  const t = rows[0] as { createdBy: string; title: string };

  const id = genId('kc');
  const name = sessionName(session);
  const inserted = await sql`
    INSERT INTO task_comments (id, task_id, author_id, author_name, body)
    VALUES (${id}, ${taskId}, ${session.userId}, ${name}, ${b.body.slice(0, 4000)})
    RETURNING id, task_id AS "taskId", author_id AS "authorId", author_name AS "authorName", body, created_at AS "createdAt"
  `;

  const members = await loadMembers();
  const assignees = (await sql`SELECT user_id AS "userId" FROM task_assignees WHERE task_id = ${taskId}`) as { userId: string }[];
  await notify(t.createdBy, session.userId, 'task_comment', 'task', taskId, `${name} hat die Aufgabe „${t.title}“ kommentiert.`);
  for (const a of assignees) {
    await notify(a.userId, session.userId, 'task_comment', 'task', taskId, `Neuer Kommentar zur Aufgabe „${t.title}“.`);
  }
  for (const uid of findMentions(b.body, members)) {
    await notify(uid, session.userId, 'mention', 'task', taskId, `${name} hat dich in der Aufgabe „${t.title}“ erwähnt.`);
  }
  return res.json(inserted[0]);
}

// --- Benachrichtigungen -----------------------------------------------------
export async function notifications(req: VercelRequest, res: VercelResponse) {
  const session = await getSession(req);
  if (!session) return res.status(401).json({ error: 'Nicht angemeldet' });

  if (req.method === 'GET') {
    res.setHeader('Cache-Control', 'no-store');
    const items = await sql`
      SELECT id, kind, ref_type AS "refType", ref_id AS "refId", body, is_read AS "isRead", created_at AS "createdAt"
      FROM notifications WHERE user_id = ${session.userId}
      ORDER BY created_at DESC LIMIT 50
    `;
    const cnt = await sql`SELECT count(*)::int AS n FROM notifications WHERE user_id = ${session.userId} AND is_read = false`;
    return res.json({ items, unreadCount: (cnt[0] as { n: number }).n });
  }

  if (req.method === 'POST') {
    const b = req.body ?? {};
    if (b.all === true) {
      await sql`UPDATE notifications SET is_read = true WHERE user_id = ${session.userId} AND is_read = false`;
      return res.json({ ok: true });
    }
    if (typeof b.id === 'string') {
      await sql`UPDATE notifications SET is_read = true WHERE id = ${b.id} AND user_id = ${session.userId}`;
      return res.json({ ok: true });
    }
    return badRequest(res, 'Nichts zu markieren.');
  }

  return res.status(405).json({ error: 'Nicht unterstützt' });
}

// --- Ideen (Brainstorm) -----------------------------------------------------
// Eine Idee sehen/bearbeiten dürfen nur ihre Mitglieder (der Ersteller wählt sie
// beim Anlegen). Verlauf = idea_comments (chat-artig), Fazit = ideas.summary.
const IDEA_STATUS = ['offen', 'in_bearbeitung', 'erledigt', 'verworfen'];

async function isIdeaMember(ideaId: string, userId: string): Promise<boolean> {
  const rows = await sql`SELECT 1 FROM idea_members WHERE idea_id = ${ideaId} AND user_id = ${userId} LIMIT 1`;
  return rows.length > 0;
}

async function fetchIdeaById(id: string) {
  const rows = await sql`
    SELECT i.id, i.title, i.summary, i.status,
           COALESCE(i.links, '[]'::jsonb) AS links,
           i.created_by AS "createdBy", i.created_by_name AS "createdByName",
           i.linked_task_id AS "linkedTaskId",
           i.created_at AS "createdAt", i.updated_at AS "updatedAt",
           COALESCE((SELECT json_agg(json_build_object('userId', m.user_id, 'userName', m.user_name))
                     FROM idea_members m WHERE m.idea_id = i.id), '[]') AS members,
           (SELECT count(*)::int FROM idea_comments c WHERE c.idea_id = i.id) AS "commentCount"
    FROM ideas i WHERE i.id = ${id}`;
  return rows[0] ?? null;
}

// Mitglieder einer Idee komplett setzen (Ersteller bleibt immer dabei).
async function setIdeaMembers(ideaId: string, ownerId: string, wantedIds: string[], members: Map<string, AppUser>): Promise<string[]> {
  const ids = new Set<string>([ownerId]);
  for (const m of wantedIds) if (typeof m === 'string' && members.has(m)) ids.add(m);
  const prev = (await sql`SELECT user_id AS "userId" FROM idea_members WHERE idea_id = ${ideaId}`) as { userId: string }[];
  const prevSet = new Set(prev.map((r) => r.userId));
  // Entfernte löschen, neue anlegen (Lesestand der Bleibenden bleibt erhalten).
  for (const r of prev) if (!ids.has(r.userId)) await sql`DELETE FROM idea_members WHERE idea_id = ${ideaId} AND user_id = ${r.userId}`;
  for (const uid of ids) {
    if (prevSet.has(uid)) continue;
    const nm = uid === ownerId ? memberName(members, ownerId) : memberName(members, uid);
    await sql`INSERT INTO idea_members (idea_id, user_id, user_name) VALUES (${ideaId}, ${uid}, ${nm}) ON CONFLICT DO NOTHING`;
  }
  return [...ids].filter((id) => !prevSet.has(id)); // neu hinzugekommene
}

export async function ideas(req: VercelRequest, res: VercelResponse) {
  const session = await getSession(req);
  if (!session) return res.status(401).json({ error: 'Nicht angemeldet' });
  const uid = session.userId;

  if (req.method === 'GET') {
    res.setHeader('Cache-Control', 'no-store');
    const rows = await sql`
      SELECT i.id, i.title, i.summary, i.status,
             COALESCE(i.links, '[]'::jsonb) AS links,
             i.created_by AS "createdBy", i.created_by_name AS "createdByName",
             i.linked_task_id AS "linkedTaskId",
             i.created_at AS "createdAt", i.updated_at AS "updatedAt",
             COALESCE((SELECT json_agg(json_build_object('userId', m.user_id, 'userName', m.user_name))
                       FROM idea_members m WHERE m.idea_id = i.id), '[]') AS members,
             (SELECT count(*)::int FROM idea_comments c WHERE c.idea_id = i.id) AS "commentCount",
             (SELECT count(*)::int FROM idea_comments c
                WHERE c.idea_id = i.id AND c.author_id <> ${uid} AND c.created_at > me.last_read_at) AS "unread"
      FROM ideas i
      JOIN idea_members me ON me.idea_id = i.id AND me.user_id = ${uid}
      ORDER BY CASE i.status WHEN 'offen' THEN 0 WHEN 'in_bearbeitung' THEN 1 WHEN 'erledigt' THEN 2 ELSE 3 END,
               i.updated_at DESC`;
    return res.json(rows);
  }

  if (req.method === 'POST') {
    const b = req.body ?? {};
    if (!isNonEmptyString(b.title)) return badRequest(res, 'Bitte einen Titel für die Idee angeben.');
    if (session.userId === 'bootstrap') return badRequest(res, 'Bitte mit einem echten Account anmelden.');
    const members = await loadMembers();
    const meName = sessionName(session);
    const id = genId('idea');
    const title = b.title.trim().slice(0, 200);
    await sql`INSERT INTO ideas (id, title, created_by, created_by_name) VALUES (${id}, ${title}, ${uid}, ${meName})`;
    const wanted = Array.isArray(b.memberIds) ? b.memberIds : [];
    const added = await setIdeaMembers(id, uid, wanted, members);
    for (const mid of added) {
      if (mid === uid) continue;
      await notify(mid, uid, 'idea', 'idea', id, `${meName} hat dich zur Idee „${title}“ hinzugefügt.`);
    }
    return res.json(await fetchIdeaById(id));
  }

  return res.status(405).json({ error: 'Nicht unterstützt' });
}

export async function idea(req: VercelRequest, res: VercelResponse) {
  const session = await getSession(req);
  if (!session) return res.status(401).json({ error: 'Nicht angemeldet' });
  const uid = session.userId;

  if (req.method === 'GET') {
    res.setHeader('Cache-Control', 'no-store');
    const id = String(req.query.id ?? '');
    if (!id) return badRequest(res, 'Ideen-ID fehlt.');
    if (!(await isIdeaMember(id, uid))) return res.status(403).json({ error: 'Kein Zugriff auf diese Idee.' });
    const base = await fetchIdeaById(id);
    if (!base) return res.status(404).json({ error: 'Idee nicht gefunden.' });
    const comments = await sql`
      SELECT c.id, c.idea_id AS "ideaId", c.author_id AS "authorId", c.author_name AS "authorName", c.body,
             c.attach_type AS "attachType", c.attach_url AS "attachUrl", c.attach_mime AS "attachMime", c.attach_title AS "attachTitle",
             c.edited_at AS "editedAt", c.deleted_at AS "deletedAt", c.created_at AS "createdAt",
             COALESCE((SELECT json_agg(json_build_object('userId', r.user_id, 'emoji', r.emoji) ORDER BY r.created_at)
                       FROM idea_comment_reactions r WHERE r.comment_id = c.id), '[]') AS reactions
      FROM idea_comments c WHERE c.idea_id = ${id} ORDER BY c.created_at`;
    await sql`UPDATE idea_members SET last_read_at = now() WHERE idea_id = ${id} AND user_id = ${uid}`;
    return res.json({ ...base, comments });
  }

  if (req.method === 'POST') {
    const b = req.body ?? {};
    const id = typeof b.id === 'string' ? b.id : '';
    if (!id) return badRequest(res, 'Ideen-ID fehlt.');
    if (!(await isIdeaMember(id, uid))) return res.status(403).json({ error: 'Kein Zugriff auf diese Idee.' });
    const rows = await sql`SELECT created_by AS "createdBy", title, summary, status FROM ideas WHERE id = ${id}`;
    if (rows.length === 0) return res.status(404).json({ error: 'Idee nicht gefunden.' });
    const cur = rows[0] as { createdBy: string; title: string; summary: string; status: string };
    const isOwner = cur.createdBy === uid || session.role === 'superadmin';

    // Löschen (nur Ersteller oder Super-Admin).
    if (b.op === 'delete') {
      if (!isOwner) return res.status(403).json({ error: 'Nur der Ersteller darf die Idee löschen.' });
      await sql`DELETE FROM ideas WHERE id = ${id}`;
      return res.json({ ok: true, deleted: id });
    }

    // In Aufgabe/Termin umwandeln (verknüpft die Idee mit der neuen Aufgabe).
    if (b.op === 'convert') {
      const type = ['termin', 'aufgabe', 'beides'].includes(b.convertType) ? b.convertType : 'aufgabe';
      const members = await loadMembers();
      const mem = (await sql`SELECT user_id AS "userId" FROM idea_members WHERE idea_id = ${id}`) as { userId: string }[];
      const taskId = genId('task');
      const name = sessionName(session);
      const notes = cur.summary
        ? `Aus Idee „${cur.title}“:\n\n${cur.summary}`
        : `Aus Idee „${cur.title}“.`;
      await sql`
        INSERT INTO tasks (id, title, notes, type, status, priority, created_by, created_by_name)
        VALUES (${taskId}, ${cur.title}, ${notes}, ${type}, 'offen', 'mittel', ${uid}, ${name})`;
      for (const m of mem) {
        if (members.has(m.userId)) {
          await sql`INSERT INTO task_assignees (task_id, user_id, user_name) VALUES (${taskId}, ${m.userId}, ${memberName(members, m.userId)})`;
        }
      }
      await sql`UPDATE ideas SET linked_task_id = ${taskId}, status = 'erledigt', updated_at = now() WHERE id = ${id}`;
      // Zugewiesene über die neue Aufgabe informieren.
      for (const m of mem) {
        if (m.userId !== uid) await notify(m.userId, uid, 'task_assigned', 'task', taskId, `Aus der Idee „${cur.title}“ wurde eine Aufgabe.`);
      }
      return res.json(await fetchIdeaById(id));
    }

    // Teil-Aktualisierung: Titel, Status, Fazit, Mitglieder.
    if (b.status !== undefined && !IDEA_STATUS.includes(b.status)) return badRequest(res, 'Ungültiger Status.');
    const title = b.title !== undefined ? String(b.title).trim().slice(0, 200) : undefined;
    if (b.title !== undefined && !title) return badRequest(res, 'Titel darf nicht leer sein.');
    const summary = b.summary !== undefined ? String(b.summary).slice(0, 8000) : undefined;
    const links = b.links !== undefined ? sanitizeLinks(b.links) : undefined;

    await sql`
      UPDATE ideas SET
        title = COALESCE(${title ?? null}, title),
        status = COALESCE(${b.status ?? null}, status),
        summary = CASE WHEN ${b.summary !== undefined} THEN ${summary ?? ''} ELSE summary END,
        links = CASE WHEN ${links !== undefined} THEN ${JSON.stringify(links ?? [])}::jsonb ELSE links END,
        updated_at = now()
      WHERE id = ${id}`;

    // Mitglieder ändern darf nur der Ersteller.
    if (Array.isArray(b.memberIds) && isOwner) {
      const members = await loadMembers();
      const added = await setIdeaMembers(id, cur.createdBy, b.memberIds, members);
      const meName = sessionName(session);
      for (const mid of added) {
        if (mid === uid) continue;
        await notify(mid, uid, 'idea', 'idea', id, `${meName} hat dich zur Idee „${cur.title}“ hinzugefügt.`);
      }
    }
    return res.json(await fetchIdeaById(id));
  }

  return res.status(405).json({ error: 'Nicht unterstützt' });
}

// Beitrag zum Brainstorm einer Idee. Benachrichtigt die übrigen Mitglieder per
// Handy-Push (wie im Chat), Erwähnungen zusätzlich über die Glocke.
export async function ideaComment(req: VercelRequest, res: VercelResponse) {
  const session = await getSession(req);
  if (!session) return res.status(401).json({ error: 'Nicht angemeldet' });
  const uid = session.userId;

  // --- Bearbeiten (nur eigener, nicht gelöschter Beitrag) ------------------
  if (req.method === 'PATCH') {
    const pb = req.body ?? {};
    const commentId = typeof pb.commentId === 'string' ? pb.commentId : typeof pb.id === 'string' ? pb.id : '';
    if (!commentId) return badRequest(res, 'Beitrags-ID fehlt.');
    if (!isNonEmptyString(pb.body)) return badRequest(res, 'Bitte einen Text eingeben.');
    const own = (await sql`SELECT author_id AS "authorId", deleted_at AS "deletedAt" FROM idea_comments WHERE id = ${commentId} LIMIT 1`) as {
      authorId: string;
      deletedAt: string | null;
    }[];
    if (own.length === 0) return res.status(404).json({ error: 'Beitrag nicht gefunden.' });
    if (own[0].authorId !== uid) return res.status(403).json({ error: 'Nur eigene Beiträge bearbeiten.' });
    if (own[0].deletedAt) return badRequest(res, 'Gelöschte Beiträge können nicht bearbeitet werden.');
    await sql`UPDATE idea_comments SET body = ${pb.body.slice(0, 8000)}, edited_at = now() WHERE id = ${commentId}`;
    const updated = await sql`
      SELECT c.id, c.idea_id AS "ideaId", c.author_id AS "authorId", c.author_name AS "authorName", c.body,
             c.attach_type AS "attachType", c.attach_url AS "attachUrl", c.attach_mime AS "attachMime", c.attach_title AS "attachTitle",
             c.edited_at AS "editedAt", c.deleted_at AS "deletedAt", c.created_at AS "createdAt",
             COALESCE((SELECT json_agg(json_build_object('userId', r.user_id, 'emoji', r.emoji) ORDER BY r.created_at)
                       FROM idea_comment_reactions r WHERE r.comment_id = c.id), '[]') AS reactions
      FROM idea_comments c WHERE c.id = ${commentId}`;
    return res.json(updated[0] ?? { ok: true });
  }

  // --- Für alle löschen (nur eigener Beitrag) ------------------------------
  if (req.method === 'DELETE') {
    const commentId =
      typeof req.body?.commentId === 'string' ? req.body.commentId : String(req.query.commentId ?? req.query.id ?? '');
    if (!commentId) return badRequest(res, 'Beitrags-ID fehlt.');
    const own = (await sql`SELECT author_id AS "authorId" FROM idea_comments WHERE id = ${commentId} LIMIT 1`) as { authorId: string }[];
    if (own.length === 0) return res.status(404).json({ error: 'Beitrag nicht gefunden.' });
    if (own[0].authorId !== uid) return res.status(403).json({ error: 'Nur eigene Beiträge löschen.' });
    await sql`UPDATE idea_comments SET deleted_at = now(), body = '', attach_type = NULL, attach_url = NULL, attach_mime = NULL, attach_title = NULL WHERE id = ${commentId}`;
    await sql`DELETE FROM idea_comment_reactions WHERE comment_id = ${commentId}`;
    return res.json({ ok: true, id: commentId });
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Nicht unterstützt' });

  const b = req.body ?? {};
  const ideaId = typeof b.ideaId === 'string' ? b.ideaId : '';
  if (!ideaId) return badRequest(res, 'Ideen-ID fehlt.');
  if (!(await isIdeaMember(ideaId, uid))) return res.status(403).json({ error: 'Kein Zugriff auf diese Idee.' });

  // Chat-artig: Beitrag kann Text UND/ODER einen Medien-Anhang tragen.
  const hasBody = isNonEmptyString(b.body);
  const attachType = b.attachType === 'file' || b.attachType === 'audio' ? b.attachType : null;
  const attachUrl =
    attachType && typeof b.attachUrl === 'string' && /^https?:\/\//i.test(b.attachUrl.trim()) ? b.attachUrl.trim() : null;
  if (attachType && !attachUrl) return badRequest(res, 'Anhang-URL fehlt oder ist ungültig.');
  if (!hasBody && !attachType) return badRequest(res, 'Bitte einen Beitrag schreiben oder etwas anhängen.');
  const attachMime = attachType ? String(b.attachMime ?? '').slice(0, 120) || null : null;
  const attachTitle = attachType ? String(b.attachTitle ?? '').slice(0, 200) || null : null;
  const body = hasBody ? b.body.slice(0, 8000) : '';

  const rows = await sql`SELECT title FROM ideas WHERE id = ${ideaId}`;
  if (rows.length === 0) return res.status(404).json({ error: 'Idee nicht gefunden.' });
  const title = (rows[0] as { title: string }).title;

  const id = genId('ic');
  const name = sessionName(session);
  const inserted = await sql`
    INSERT INTO idea_comments (id, idea_id, author_id, author_name, body, attach_type, attach_url, attach_mime, attach_title)
    VALUES (${id}, ${ideaId}, ${uid}, ${name}, ${body}, ${attachType}, ${attachUrl}, ${attachMime}, ${attachTitle})
    RETURNING id, idea_id AS "ideaId", author_id AS "authorId", author_name AS "authorName", body,
              attach_type AS "attachType", attach_url AS "attachUrl", attach_mime AS "attachMime", attach_title AS "attachTitle",
              edited_at AS "editedAt", deleted_at AS "deletedAt", created_at AS "createdAt", '[]'::json AS reactions`;
  await sql`UPDATE ideas SET updated_at = now() WHERE id = ${ideaId}`;

  const members = await loadMembers();
  const mem = (await sql`SELECT user_id AS "userId" FROM idea_members WHERE idea_id = ${ideaId}`) as { userId: string }[];
  const mentioned = new Set<string>();
  if (hasBody) {
    for (const mid of findMentions(b.body, members)) {
      if (mid !== uid && mem.some((m) => m.userId === mid)) {
        mentioned.add(mid);
        await notify(mid, uid, 'mention', 'idea', ideaId, `${name} hat dich in der Idee „${title}“ erwähnt.`);
      }
    }
  }
  const preview = hasBody
    ? String(b.body).slice(0, 120)
    : attachType === 'audio'
      ? '🎤 Sprachnachricht'
      : (attachMime ?? '').startsWith('image/')
        ? '🖼️ Bild'
        : (attachMime ?? '').startsWith('video/')
          ? '🎬 Video'
          : '📎 Datei';
  for (const m of mem) {
    if (m.userId === uid || mentioned.has(m.userId)) continue;
    await sendPushToUser(m.userId, { title: `💡 ${title}`, body: `${name}: ${preview}`, url: `/chat?tab=ideen&openIdea=${encodeURIComponent(ideaId)}` });
  }
  return res.json(inserted[0]);
}

// Emoji-Reaktion auf einen Ideen-Beitrag umschalten (eine pro Nutzer & Beitrag,
// wie im Chat). Gibt die vollständige Reaktionsliste des Beitrags zurück.
export async function reactIdeaComment(req: VercelRequest, res: VercelResponse) {
  const session = await getSession(req);
  if (!session) return res.status(401).json({ error: 'Nicht angemeldet' });
  if (req.method !== 'POST') return res.status(405).json({ error: 'Nicht unterstützt' });
  const uid = session.userId;
  const b = req.body ?? {};
  const commentId = typeof b.commentId === 'string' ? b.commentId : '';
  const emoji = typeof b.emoji === 'string' ? b.emoji.slice(0, 16) : '';
  if (!commentId || !emoji) return badRequest(res, 'Beitrag oder Emoji fehlt.');
  const rows = (await sql`SELECT idea_id AS "ideaId" FROM idea_comments WHERE id = ${commentId} AND deleted_at IS NULL LIMIT 1`) as {
    ideaId: string;
  }[];
  if (rows.length === 0) return res.status(404).json({ error: 'Beitrag nicht gefunden.' });
  if (!(await isIdeaMember(rows[0].ideaId, uid))) return res.status(403).json({ error: 'Kein Zugriff auf diese Idee.' });
  const existing = (await sql`SELECT emoji FROM idea_comment_reactions WHERE comment_id = ${commentId} AND user_id = ${uid} LIMIT 1`) as {
    emoji: string;
  }[];
  const current = existing.length ? existing[0].emoji : null;
  if (current === emoji) {
    await sql`DELETE FROM idea_comment_reactions WHERE comment_id = ${commentId} AND user_id = ${uid}`;
  } else {
    await sql`INSERT INTO idea_comment_reactions (comment_id, user_id, emoji) VALUES (${commentId}, ${uid}, ${emoji})
              ON CONFLICT (comment_id, user_id) DO UPDATE SET emoji = EXCLUDED.emoji, created_at = now()`;
  }
  const reactions = await sql`SELECT user_id AS "userId", emoji FROM idea_comment_reactions WHERE comment_id = ${commentId} ORDER BY created_at`;
  return res.json({ commentId, reactions });
}
