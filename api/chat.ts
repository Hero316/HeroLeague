import type { VercelRequest, VercelResponse } from '@vercel/node';
import { conversations, messages, markRead, searchMessages, updateConversation, manageMember, presence } from './_lib/chat.js';
import { ensureSchema } from './_lib/ensure.js';

// Interner Chat (Phase 3). Eigener Endpunkt (Vercel Pro).
//  GET  /api/chat?resource=conversations              -> meine Unterhaltungen
//  POST /api/chat?resource=conversations {kind,...}   -> Gruppe/DM anlegen
//  GET  /api/chat?resource=messages&conversationId=X[&parentId=Y]
//  POST /api/chat?resource=messages {conversationId,body,parentId?,attach*}
//  POST /api/chat?resource=read {conversationId}      -> als gelesen markieren
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    await ensureSchema();
    const resource = req.query.resource;
    if (resource === 'messages') return messages(req, res);
    if (resource === 'read') return markRead(req, res);
    if (resource === 'search') return searchMessages(req, res);
    if (resource === 'group') return updateConversation(req, res);
    if (resource === 'member') return manageMember(req, res);
    if (resource === 'presence') return presence(req, res);
    return conversations(req, res);
  } catch (err) {
    console.error('Fehler in /api/chat:', err);
    // Lese-Anfragen (Polling) degradieren leer statt 500 – falls die DB noch
    // nicht bereit ist, bleibt die App ruhig statt Fehler zu spammen.
    // Präsenz erwartet ein Objekt, alle anderen Listen ein Array.
    if (req.method === 'GET') return res.json(req.query.resource === 'presence' ? { online: [], typing: [] } : []);
    return res.status(500).json({ error: 'Interner Fehler' });
  }
}
