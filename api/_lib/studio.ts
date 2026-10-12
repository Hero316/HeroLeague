import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sql } from './db.js';
import { requirePermission } from './auth.js';
import { badRequest } from './validate.js';

// ===========================================================================
// Live-Regie für den Studio-Stream (OBS-Overlay /overlay/studio).
//
// Im Admin drückt man eine Taste (Konfetti, Bauchbinde, Link …) → hier wird
// der „Cue" gespeichert. Das Overlay in OBS fragt jede Sekunde nach und spielt
// jeden NEUEN Cue genau einmal ab. Alles in EINEM Settings-Eintrag ('studio'),
// angesprochen über /api/twitch?resource=studio – kein neuer Endpunkt
// (Vercel-Hobby: max. 12 Funktionen).
// ===========================================================================

const KINDS = ['confetti', 'emoji', 'headline', 'lowerthird', 'link', 'partner', 'countdown', 'clear'] as const;
type CueKind = (typeof KINDS)[number];
const PARTNERS = ['dvag', 'volksbank', 'unisport'] as const;

interface CueBody {
  kind: CueKind;
  title: string;
  text: string;
  link: string;
  emoji: string;
  partner: string;
  duration: number; // Sekunden
}
interface Cue extends CueBody {
  id: number;
  at: number; // Server-Zeit (ms)
}
interface Preset {
  id: string;
  label: string;
  cue: CueBody;
}

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');

function toCueBody(v: unknown): CueBody | null {
  if (!v || typeof v !== 'object') return null;
  const b = v as Record<string, unknown>;
  const kind = KINDS.includes(b.kind as CueKind) ? (b.kind as CueKind) : null;
  if (!kind) return null;
  const partner = PARTNERS.includes(b.partner as (typeof PARTNERS)[number]) ? String(b.partner) : '';
  const maxDur = kind === 'countdown' ? 600 : 120;
  const duration = Math.round(Math.max(3, Math.min(maxDur, Number(b.duration) || 10)));
  return {
    kind,
    title: str(b.title, 80),
    text: str(b.text, 160),
    link: str(b.link, 200),
    emoji: str(b.emoji, 16),
    partner,
    duration,
  };
}

export async function getStudio(_req: VercelRequest, res: VercelResponse) {
  const rows = await sql`SELECT value FROM settings WHERE key = 'studio'`;
  const v = (rows[0]?.value ?? {}) as { cue?: Cue | null; presets?: Preset[] };
  const cue = v.cue ?? null;
  return res.json({
    cue,
    // Alter des Cues aus Sicht des Servers – so ist die Uhr des OBS-PCs egal.
    age: cue ? Math.max(0, Date.now() - cue.at) : null,
    presets: Array.isArray(v.presets) ? v.presets : null,
  });
}

export const saveStudio = requirePermission('channels')(async (req: VercelRequest, res: VercelResponse) => {
  const b = (req.body ?? {}) as Record<string, unknown>;

  if (b.action === 'fire') {
    const body = toCueBody(b.cue);
    if (!body) return badRequest(res, 'Unbekannte Einblendung.');
    const cue: Cue = { ...body, id: Date.now(), at: Date.now() };
    // Nur den Cue ersetzen, Schnelltasten bleiben (jsonb-Merge auf oberster Ebene).
    await sql`
      INSERT INTO settings (key, value) VALUES ('studio', ${JSON.stringify({ cue })}::jsonb)
      ON CONFLICT (key) DO UPDATE SET value = settings.value || EXCLUDED.value
    `;
    return res.json({ ok: true, cue });
  }

  if (b.action === 'presets') {
    if (!Array.isArray(b.presets)) return badRequest(res, 'Schnelltasten fehlen.');
    const presets: Preset[] = [];
    for (const p of b.presets.slice(0, 30)) {
      const o = (p ?? {}) as Record<string, unknown>;
      const cue = toCueBody(o.cue);
      const label = str(o.label, 40);
      if (!cue || !label || cue.kind === 'clear') continue;
      presets.push({ id: str(o.id, 40) || `p${Date.now()}${presets.length}`, label, cue });
    }
    await sql`
      INSERT INTO settings (key, value) VALUES ('studio', ${JSON.stringify({ presets })}::jsonb)
      ON CONFLICT (key) DO UPDATE SET value = settings.value || EXCLUDED.value
    `;
    return res.json({ ok: true, presets });
  }

  return badRequest(res, 'Unbekannte Aktion.');
});
