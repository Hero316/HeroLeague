import type { VercelRequest, VercelResponse } from '@vercel/node';
import { conversations, messages, markRead } from './_lib/chat.js';

// Interner Chat (Phase 3). Eigener Endpunkt (Vercel Pro).
//  GET  /api/chat?resource=conversations              -> meine Unterhaltungen
//  POST /api/chat?resource=conversations {kind,...}   -> Gruppe/DM anlegen
//  GET  /api/chat?resource=messages&conversationId=X[&parentId=Y]
//  POST /api/chat?resource=messages {conversationId,body,parentId?,attach*}
//  POST /api/chat?resource=read {conversationId}      -> als gelesen markieren
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const resource = req.query.resource;
    if (resource === 'messages') return messages(req, res);
    if (resource === 'read') return markRead(req, res);
    return conversations(req, res);
  } catch (err) {
    console.error('Fehler in /api/chat:', err);
    return res.status(500).json({ error: 'Interner Fehler' });
  }
}
