import type { VercelRequest, VercelResponse } from '@vercel/node';
import { teamMembers, updateProfile, ideas, idea, ideaComment, reactIdeaComment } from './_lib/collab.js';
import { denyWithoutTeamApp } from './_lib/auth.js';
import { ensureSchema } from './_lib/ensure.js';

// Team-Mitglieder + eigenes Profil + Ideen (Brainstorm). Für eingeloggte Nutzer.
//  GET  /api/team                         -> [{ id, name, role, avatarUrl, status }]
//  POST /api/team?resource=profile        -> eigenes Profil ändern
//  GET  /api/team?resource=ideas          -> meine Ideen (wo ich Mitglied bin)
//  POST /api/team?resource=ideas          -> neue Idee { title, memberIds }
//  GET  /api/team?resource=idea&id=X      -> Idee inkl. Verlauf + Mitglieder
//  POST /api/team?resource=idea {id,...}  -> Idee ändern / löschen / umwandeln
//  POST /api/team?resource=idea-comment   -> Beitrag { ideaId, body }
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    await ensureSchema();
    if (await denyWithoutTeamApp(req, res)) return;
    const resource = req.query.resource;
    if (req.method === 'POST' && resource === 'profile') return updateProfile(req, res);
    if (resource === 'ideas') return ideas(req, res);
    if (resource === 'idea') return idea(req, res);
    if (resource === 'idea-comment') return ideaComment(req, res); // POST neu · PATCH bearbeiten · DELETE für alle löschen
    if (resource === 'idea-comment-react') return reactIdeaComment(req, res);
    return teamMembers(req, res);
  } catch (err) {
    console.error('Fehler in /api/team:', err);
    if (req.method === 'GET') return res.json([]);
    return res.status(500).json({ error: 'Interner Fehler' });
  }
}
