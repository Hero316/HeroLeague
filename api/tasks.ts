import type { VercelRequest, VercelResponse } from '@vercel/node';
import { tasks, task, taskGet, taskComment } from './_lib/collab.js';
import { ensureSchema } from './_lib/ensure.js';

// Aufgaben-Board (Monday-Style): eigener Endpunkt.
//  GET  /api/tasks                 -> alle Aufgaben (inkl. Zuweisungen)
//  GET  /api/tasks?week=2026-W33   -> Aufgaben einer Kalenderwoche
//  GET  /api/tasks?from=..&to=..   -> Aufgaben in einem Datumsbereich
//  POST /api/tasks                 -> neue Aufgabe (kein id im Body)
//  POST /api/tasks  {id,...}       -> Aufgabe aktualisieren oder {op:'delete'}
//  POST /api/tasks?sub=comment {taskId,body} -> Kommentar/Thread hinzufügen
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    await ensureSchema();
    if (req.query.sub === 'comment') return taskComment(req, res);
    if (req.method === 'GET' && req.query.id) return taskGet(req, res);
    if (req.method === 'POST' && req.body?.id) return task(req, res);
    return tasks(req, res);
  } catch (err) {
    console.error('Fehler in /api/tasks:', err);
    if (req.method === 'GET') return res.json([]);
    return res.status(500).json({ error: 'Interner Fehler' });
  }
}
