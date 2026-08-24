// ===========================================================================
// Gemini-Anbindung für das Voice-Tracking (Statistics Center).
//
// Der Trainer/Reporter redet ein Spiel in ~0,7-facher Geschwindigkeit ein
// ("Nummer 5 Süß passt zu Mike, verliert den Ball …"). Gemini transkribiert das
// Audio UND ordnet jede Aussage direkt einer Tracking-Taste (ActionKey) samt
// Spieler/Team zu – in EINEM Aufruf. Zurückgegeben wird eine geprüfte Ereignis-
// liste, die der Nutzer im Frontend kontrolliert und dann per Klick übernimmt.
//
// Schlüssel liegt ausschließlich in der Umgebungsvariable GEMINI_API_KEY
// (nie im Code/Repo). Modell überschreibbar via GEMINI_MODEL.
// ===========================================================================

const BASE = 'https://generativelanguage.googleapis.com';

export function isGeminiConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

function model(): string {
  return process.env.GEMINI_MODEL || 'gemini-3.6-flash';
}

// --- Aktions-Katalog (bewusst hier gespiegelt, mit Synonymen für die KI) -----
// Reihenfolge/Schlüssel identisch zu src/lib/scoring.ts. Die Hinweise helfen der
// KI, natürliche Sprache auf genau eine Taste abzubilden.
interface ActionDef {
  key: string;
  label: string;
  hint: string;
}

export const ACTION_CATALOG: ActionDef[] = [
  { key: 'pass_ok', label: 'Pass erfolgreich', hint: 'angekommener/gespielter Pass, Ablage, Abspiel, "passt zu", "legt ab", "findet"' },
  { key: 'pass_fail', label: 'Fehlpass', hint: 'Pass kommt nicht an, "verspringt", "Fehlpass", "zu ungenau", "vertändelt den Pass"' },
  { key: 'key_pass', label: 'Schlüsselpass', hint: 'gefährlicher Pass, der eine Torchance einleitet: Steilpass, tödlicher Pass, Zuckerpass, "legt auf". Zählt ZUSÄTZLICH auch als pass_ok, wenn er ankommt.' },
  { key: 'assist', label: 'Assist', hint: 'Vorlage – der letzte Pass VOR einem Tor. "Vorlage von", "bereitet das Tor vor", "assistiert".' },
  { key: 'shot_on', label: 'Torschuss', hint: 'Schuss aufs Tor, gehalten oder geblockt vom Torwart, "prüft den Keeper", "aufs Tor".' },
  { key: 'shot_miss', label: 'Fehlschuss', hint: 'Schuss daneben/drüber/an den Pfosten, "verzieht", "vorbei".' },
  { key: 'shot_blocked_off', label: 'Schuss geblockt (offensiv)', hint: 'eigener Schuss wird von einem Gegner geblockt.' },
  { key: 'goal', label: 'Tor', hint: 'erzieltes Tor, "trifft", "macht das Tor", "Netz". Ein Tor zählt automatisch als Schuss – gib NICHT zusätzlich shot_on aus.' },
  { key: 'dribble_won', label: 'Dribbling gewonnen', hint: 'erfolgreicher Dribbling/Haken, "setzt sich durch", "tunnelt", "lässt stehen", "geht vorbei".' },
  { key: 'dribble_lost', label: 'Dribbling verloren', hint: 'Dribbling misslingt, "wird abgelaufen", "verstolpert im Dribbling".' },
  { key: 'duel_won', label: 'Zweikampf gewonnen', hint: 'gewonnener Zweikampf/Tackling, "gewinnt den Zweikampf", "grätscht sauber", "erobert den Ball", "holt sich den Ball".' },
  { key: 'duel_lost', label: 'Zweikampf verloren', hint: 'verlorener Zweikampf, "verliert das Duell", "wird überlaufen".' },
  { key: 'interception', label: 'Interception', hint: 'abgefangener Pass, "fängt ab", "geht dazwischen", "liest den Pass".' },
  { key: 'shot_blocked_def', label: 'Schuss geblockt (defensiv)', hint: 'blockt einen gegnerischen Schuss, "wirft sich rein", "blockt den Abschluss".' },
  { key: 'turnover', label: 'Ballverlust', hint: 'verliert den Ball ohne Zweikampf/Pass, "verliert den Ball", "Ballverlust", "wird der Ball abgenommen".' },
  { key: 'own_goal', label: 'Eigentor', hint: '"Eigentor", "fälscht ins eigene Tor ab".' },
  { key: 'penalty_goal', label: 'Strafstoßtor', hint: 'verwandelter Elfmeter. Gib zusätzlich goal aus, da es ein Tor ist.' },
  { key: 'save', label: 'Parade', hint: 'Torwart hält, "pariert", "hält stark", "lenkt über die Latte". Nur Torwart.' },
  { key: 'gk_goal_against', label: 'Gegentor (Torwart)', hint: 'Torwart kassiert ein Tor. Nur Torwart.' },
  { key: 'gk_position_save', label: 'Standparade', hint: 'einfache/sichere Parade ohne Gefahr, "sichere Beute", "nimmt den Ball auf". Nur Torwart.' },
  { key: 'penalty_save', label: 'Gehaltener Elfmeter', hint: 'Torwart hält einen Strafstoß. Nur Torwart.' },
];

export const ACTION_KEYS = ACTION_CATALOG.map((a) => a.key);

// --- Ergebnis-Typen ---------------------------------------------------------

export interface VoiceEvent {
  team: string; // Team-Name aus dem Kader (oder "home"/"away")
  player: string; // Spielername aus dem Kader
  action: string; // ActionKey
  delta: number; // Anzahl (meist 1)
  quote?: string; // die Stelle im Transkript
  confidence?: number; // 0..1
  note?: string; // optionaler Hinweis der KI
}

export interface VoiceResult {
  transcript: string;
  events: VoiceEvent[];
}

export interface RosterPlayer {
  team: string; // "home" | "away"
  teamName: string;
  name: string;
  role: 'field' | 'keeper';
  number?: number; // feste Trikotnummer (optional)
}

export interface VoiceContext {
  homeTeam: string;
  awayTeam: string;
  players: RosterPlayer[];
  rules?: string; // saisonweite Regeln (frei formuliert)
}

// --- Audio via Files-API hochladen (kein 20-MB-Inline-Limit) -----------------

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function uploadAudio(bytes: Buffer, mimeType: string): Promise<{ uri: string; mimeType: string }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('Gemini ist nicht konfiguriert (GEMINI_API_KEY fehlt).');

  const start = await fetch(`${BASE}/upload/v1beta/files?key=${apiKey}`, {
    method: 'POST',
    headers: {
      'X-Goog-Upload-Protocol': 'resumable',
      'X-Goog-Upload-Command': 'start',
      'X-Goog-Upload-Header-Content-Length': String(bytes.length),
      'X-Goog-Upload-Header-Content-Type': mimeType,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ file: { display_name: 'tracking-audio' } }),
  });
  if (!start.ok) {
    const t = await start.text().catch(() => '');
    throw new Error(`Gemini-Upload (Start) fehlgeschlagen: ${start.status} ${t.slice(0, 200)}`);
  }
  const uploadUrl = start.headers.get('x-goog-upload-url');
  if (!uploadUrl) throw new Error('Gemini-Upload-URL fehlt in der Antwort.');

  const up = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'X-Goog-Upload-Command': 'upload, finalize',
      'X-Goog-Upload-Offset': '0',
      'Content-Length': String(bytes.length),
    },
    body: bytes,
  });
  if (!up.ok) {
    const t = await up.text().catch(() => '');
    throw new Error(`Gemini-Upload fehlgeschlagen: ${up.status} ${t.slice(0, 200)}`);
  }
  const info = (await up.json()) as { file?: { name?: string; uri?: string; mimeType?: string; state?: string } };
  let file = info.file;
  // Audio wird kurz verarbeitet – auf ACTIVE warten.
  for (let i = 0; i < 25 && file?.state === 'PROCESSING'; i++) {
    await sleep(800);
    const poll = await fetch(`${BASE}/v1beta/${file.name}?key=${apiKey}`);
    file = (await poll.json()) as typeof file;
  }
  if (!file?.uri || file.state !== 'ACTIVE') {
    throw new Error('Audio konnte von Gemini nicht verarbeitet werden.');
  }
  return { uri: file.uri, mimeType: file.mimeType || mimeType };
}

// --- Prompt bauen -----------------------------------------------------------

function buildInstruction(ctx: VoiceContext): string {
  const home = ctx.players.filter((p) => p.team === 'home');
  const away = ctx.players.filter((p) => p.team === 'away');
  const list = (arr: RosterPlayer[]) =>
    arr.length
      ? arr
          .map((p) => `- ${typeof p.number === 'number' ? `#${p.number} ` : ''}${p.name}${p.role === 'keeper' ? ' (Torwart)' : ''}`)
          .join('\n')
      : '- (kein Kader hinterlegt)';

  const actions = ACTION_CATALOG.map((a) => `- ${a.key} — ${a.label}: ${a.hint}`).join('\n');

  return `Du bist ein professioneller Fußball-Datenanalyst ("Tracker/Scout") für die "Hero League" – eine Kleinfeld-/Soccer-Liga (kleines Feld, kleine Teams, viele Zweikämpfe, schnelles Umschaltspiel, kein Abseits). Deine Aufgabe: ein KOMPLETTES Spiel auswerten und dabei JEDEN Spieler EINZELN über alle unten stehenden Tasten erfassen – so, wie es ein Profi-Analyst tut, der den Spielverlauf und die Fußballlogik versteht.

Du bekommst eine Sprachaufnahme (oder ein Transkript), in der jemand das Spiel live kommentiert – locker und in Alltagssprache, oft langsam/abschnittsweise. Wandle das in strukturierte Tracking-Ereignisse um.

## Spiel
Heim ("home"): ${ctx.homeTeam}
Auswärts ("away"): ${ctx.awayTeam}

## Kader Heim (${ctx.homeTeam})
${list(home)}

## Kader Auswärts (${ctx.awayTeam})
${list(away)}

## Erlaubte Aktionen (feld "action" MUSS exakt einer dieser Schlüssel sein)
${actions}

## SO WIRD GEZÄHLT (sehr wichtig)
Jede Taste ist ein EIGENER Zähler, der nur nach OBEN geht. Jedes Vorkommen einer Aktion ist EIN eigenes Ereignis mit delta 1.
- Beispiel: Spieler dribbelt erfolgreich → dribble_won +1. Kurz danach nochmal erfolgreich → nochmal dribble_won +1 (er steht dann bei 2).
- Ein MISSLUNGENES Dribbling zieht NICHTS von den gewonnenen ab! Es ist ein eigener Zähler: dribble_lost +1. Niemals dribble_won verringern, weil ein Dribbling schiefging.
- Dasselbe für ALLE Gegensatz-Paare: pass_ok ↔ pass_fail, duel_won ↔ duel_lost, shot_on ↔ shot_miss. Positive und negative Aktionen werden GETRENNT hochgezählt, nie gegeneinander verrechnet.
- "delta" ist daher fast immer 1 und IMMER positiv. Gib pro einzelner Aktion ein eigenes Ereignis aus (kein Zusammenfassen mit negativem delta).

## Zuordnung
1. Ordne jede erkennbare Aktion GENAU einem Spieler aus den obigen Kadern zu. Nutze im Feld "player" den EXAKTEN Namen aus dem Kader. Der Sprecher nennt oft nur Vorname, Spitzname ODER die Rückennummer ("die Nummer 5", "die 7") – ordne über die #Nummer bzw. den Namen dem richtigen Kaderspieler zu und gib trotzdem den EXAKTEN Namen aus. Im Feld "team" den passenden Team-Namen ("${ctx.homeTeam}" oder "${ctx.awayTeam}").
2. Erkenne Synonyme und Umgangssprache (siehe Hinweise oben). Der Sprecher benutzt NICHT die exakten Button-Namen; erschließe die richtige Taste aus der Fußball-Situation.
3. Gepaarte Ereignisse (zwei getrennte Einträge):
   - Ein Zweikampf hat zwei Beteiligte: "X gewinnt den Zweikampf gegen Y" → duel_won für X UND duel_lost für Y (nur wenn Y klar benannt/erkennbar und im Kader ist).
   - "X holt sich den Ball von Y" / "erobert gegen Y" → duel_won für X (und duel_lost für Y, falls benannt).
   - Ein Schlüsselpass, der ankommt → key_pass UND pass_ok für den Passgeber.
   - Ein Tor mit Vorlage → goal für den Torschützen UND assist für den Vorlagengeber (falls benannt).
   - Ein Tor zählt automatisch als Schuss: gib bei goal NICHT zusätzlich shot_on aus.
4. Korrekturen: Wenn der Sprecher etwas zurücknimmt ("nein", "doch nicht", "verspreche", "streich das", "Entschuldigung, das war falsch", "Quatsch"), dann gib das zurückgenommene Ereignis GAR NICHT aus (nicht etwa mit negativem delta ausgleichen). Liefere immer das bereinigte Endergebnis.
5. Erfinde nichts. Nur Aktionen ausgeben, die klar genannt werden und zu einem Kaderspieler passen. Unklares mit niedriger "confidence" und kurzer "note" markieren.
6. "quote" = kurzer wörtlicher Ausschnitt aus dem Transkript, der zu diesem Ereignis führt.
${ctx.rules ? `\n## Zusätzliche, dauerhafte Liga-Regeln (immer beachten)\n${ctx.rules}\n` : ''}
## Ausgabe
Gib zuerst das vollständige "transcript" (wörtliche Transkription der Aufnahme; bei reinem Text-Input den Text unverändert) und dann "events" in zeitlicher Reihenfolge – ein Eintrag pro Einzelaktion.`;
}

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    transcript: { type: 'STRING' },
    events: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          team: { type: 'STRING' },
          player: { type: 'STRING' },
          action: { type: 'STRING', enum: ACTION_KEYS },
          delta: { type: 'INTEGER' },
          quote: { type: 'STRING' },
          confidence: { type: 'NUMBER' },
          note: { type: 'STRING' },
        },
        required: ['team', 'player', 'action', 'delta'],
      },
    },
  },
  required: ['transcript', 'events'],
} as const;

// --- Hauptaufruf ------------------------------------------------------------

export async function parseTracking(opts: {
  audio?: { uri: string; mimeType: string };
  audioInline?: { base64: string; mimeType: string };
  transcript?: string;
  context: VoiceContext;
}): Promise<VoiceResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('Gemini ist nicht konfiguriert (GEMINI_API_KEY fehlt).');

  const parts: Record<string, unknown>[] = [];
  if (opts.audioInline) {
    parts.push({ inlineData: { mimeType: opts.audioInline.mimeType, data: opts.audioInline.base64 } });
    parts.push({ text: 'Transkribiere die Aufnahme und werte sie wie beschrieben aus.' });
  } else if (opts.audio) {
    parts.push({ fileData: { fileUri: opts.audio.uri, mimeType: opts.audio.mimeType } });
    parts.push({ text: 'Transkribiere die Aufnahme und werte sie wie beschrieben aus.' });
  } else if (opts.transcript) {
    parts.push({ text: `Transkript des Spiels:\n\n${opts.transcript}` });
  } else {
    throw new Error('Weder Audio noch Transkript übergeben.');
  }

  const res = await fetch(`${BASE}/v1beta/models/${model()}:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: buildInstruction(opts.context) }] },
      contents: [{ role: 'user', parts }],
      generationConfig: {
        temperature: 0.1,
        responseMimeType: 'application/json',
        responseSchema: RESPONSE_SCHEMA,
      },
    }),
  });

  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`Gemini-Auswertung fehlgeschlagen: ${res.status} ${t.slice(0, 300)}`);
  }

  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
    promptFeedback?: { blockReason?: string };
  };
  if (data.promptFeedback?.blockReason) {
    throw new Error('Gemini hat die Anfrage blockiert: ' + data.promptFeedback.blockReason);
  }
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') ?? '';
  if (!text) throw new Error('Gemini lieferte keine Antwort.');

  let parsed: VoiceResult;
  try {
    parsed = JSON.parse(text) as VoiceResult;
  } catch {
    throw new Error('Gemini-Antwort war kein gültiges JSON.');
  }

  const allowed = new Set(ACTION_KEYS);
  const events = Array.isArray(parsed.events)
    ? parsed.events
        .filter((e) => e && typeof e.player === 'string' && allowed.has(e.action))
        .map((e) => ({
          team: String(e.team ?? ''),
          player: String(e.player ?? ''),
          action: String(e.action),
          delta: Number.isFinite(e.delta) ? Math.max(1, Math.min(20, Math.round(e.delta))) : 1,
          quote: e.quote ? String(e.quote).slice(0, 240) : undefined,
          confidence: typeof e.confidence === 'number' ? Math.max(0, Math.min(1, e.confidence)) : undefined,
          note: e.note ? String(e.note).slice(0, 240) : undefined,
        }))
    : [];

  return { transcript: typeof parsed.transcript === 'string' ? parsed.transcript : '', events };
}
