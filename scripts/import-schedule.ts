// Spielplan-Import aus der Hero-League-Excel (Blätter "Gesamtspielplan" + "Stammdaten").
// Legt Teams, Kader und alle Ansetzungen einer Saison an – wiederholbar (idempotent).
//
// Aufruf:
//   npm run import:schedule -- "<pfad/zur/Datei.xlsx>"              (Upsert, sicher wiederholbar)
//   npm run import:schedule -- "<...>.xlsx" --dry-run               (nur prüfen, ohne DB)
//   npm run import:schedule -- "<...>.xlsx" --reset --yes           (DB erst leeren, dann importieren)
//
// Verhalten:
//  - Import legt nur ANSETZUNGEN an (Status "geplant", keine Tore).
//  - Re-Import gleicht Spiele per Spiel-ID (z.B. HL-001) ab und ERHÄLT bereits im Admin
//    eingetragene Ergebnisse/Torschützen/Abwesende – diese werden nie überschrieben.
//  - --reset löscht vorher matches+teams+seasons (nur mit zusätzlichem --yes; destruktiv!).
import { readFileSync } from 'node:fs';
import { neon } from '@neondatabase/serverless';
import * as XLSX from 'xlsx';

const SEASON_LABEL = '2026/27';
const SEASON_ID = 'saison-2026-27';

// ---------------------------------------------------------------------------
// Argumente
// ---------------------------------------------------------------------------
const argv = process.argv.slice(2);
const flags = new Set(argv.filter((a) => a.startsWith('--')));
const positional = argv.filter((a) => !a.startsWith('--'));
const filePath = positional[0];
const dryRun = flags.has('--dry-run');
const reset = flags.has('--reset');

if (!filePath) {
  console.error(
    'Kein Dateipfad angegeben.\n' +
      'Aufruf: npm run import:schedule -- "<pfad/zur/Spielplan.xlsx>" [--dry-run] [--reset --yes]'
  );
  process.exit(1);
}
if (reset && !flags.has('--yes')) {
  console.error(
    '--reset löscht ALLE Teams, Spiele und Saisons in der Datenbank, bevor neu importiert wird.\n' +
      'Zum Bestätigen zusätzlich --yes angeben: npm run import:schedule -- "<datei>" --reset --yes'
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Hilfsfunktionen zum Umrechnen der Excel-Werte
// ---------------------------------------------------------------------------
// Excel-Serienzahl (z.B. 46285.5) -> "YYYY-MM-DD". Zeitanteil (Nachkommastelle) wird verworfen.
function excelDateToISO(serial: number): string | null {
  if (typeof serial !== 'number' || !isFinite(serial)) return null;
  const ms = (Math.floor(serial) - 25569) * 86400000; // 25569 = Excel-Serie von 1970-01-01
  return new Date(ms).toISOString().slice(0, 10);
}
// Tagesbruchteil (z.B. 0.8333) -> "HH:MM".
function fracToHHMM(frac: number): string | null {
  if (typeof frac !== 'number' || !isFinite(frac)) return null;
  const total = Math.round(frac * 1440);
  const hh = Math.floor(total / 60);
  const mm = total % 60;
  return String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
}
function cell(row: unknown[], idx: number): string {
  if (idx < 0 || !row) return '';
  const v = row[idx];
  return v === undefined || v === null ? '' : String(v).trim();
}
function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
// Platzhalter-Kürzel aus dem Namen (im Admin editierbar).
function makeShortName(name: string): string {
  const words = name.replace(/[.\-]/g, ' ').split(/\s+/).filter(Boolean);
  let s = words.map((w) => w[0]).join('').toUpperCase();
  if (s.length < 2) s = name.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3);
  return s.slice(0, 4) || 'TBD';
}

// ---------------------------------------------------------------------------
// Excel parsen
// ---------------------------------------------------------------------------
interface ParsedTeam { name: string; roster: { name: string }[] }
interface ParsedMatch {
  importRef: string;
  matchday: number;
  date: string;
  time: string;
  field: number | null;
  slot: number | null;
  homeName: string;
  awayName: string;
}

function parseWorkbook(buf: Buffer): { teams: ParsedTeam[]; matches: ParsedMatch[] } {
  const wb = XLSX.read(buf, { type: 'buffer' });

  // --- Gesamtspielplan ---
  const gsSheet = wb.Sheets['Gesamtspielplan'];
  if (!gsSheet) throw new Error('Blatt "Gesamtspielplan" fehlt in der Datei.');
  const gs = XLSX.utils.sheet_to_json<unknown[]>(gsSheet, { header: 1, raw: true, blankrows: false });
  const hi = gs.findIndex((r) => Array.isArray(r) && r.some((c) => String(c).trim() === 'Spiel-ID'));
  if (hi < 0) throw new Error('Kopfzeile mit "Spiel-ID" im Blatt "Gesamtspielplan" nicht gefunden.');
  const header = (gs[hi] as unknown[]).map((x) => String(x).trim());
  const col = (label: string) => header.indexOf(label);
  const ci = {
    id: col('Spiel-ID'), abend: col('Abend'), datum: col('Datum'), slot: col('Slot'),
    beginn: col('Beginn'), feld: col('Feld'), heim: col('Heimteam'), aus: col('Auswärtsteam'),
  };
  for (const [k, v] of Object.entries(ci)) {
    if (v < 0) throw new Error(`Spalte für "${k}" in der Kopfzeile des Gesamtspielplans nicht gefunden.`);
  }

  const matches: ParsedMatch[] = [];
  for (const row of gs.slice(hi + 1) as unknown[][]) {
    const importRef = cell(row, ci.id);
    if (!importRef) continue; // Leerzeile / Anhang überspringen
    const rawDatum = row[ci.datum];
    const rawBeginn = row[ci.beginn];
    matches.push({
      importRef,
      matchday: Number(cell(row, ci.abend)),
      date: excelDateToISO(rawDatum as number) ?? '',
      time: fracToHHMM(rawBeginn as number) ?? '',
      field: cell(row, ci.feld) ? Number(cell(row, ci.feld)) : null,
      slot: cell(row, ci.slot) ? Number(cell(row, ci.slot)) : null,
      homeName: cell(row, ci.heim),
      awayName: cell(row, ci.aus),
    });
  }

  // --- Stammdaten: Teamliste + Kader ---
  const sdSheet = wb.Sheets['Stammdaten'];
  if (!sdSheet) throw new Error('Blatt "Stammdaten" fehlt in der Datei.');
  // blankrows behalten: Leerzeilen begrenzen die Kader-Blöcke.
  const sd = XLSX.utils.sheet_to_json<unknown[]>(sdSheet, { header: 1, raw: false, blankrows: true });

  // Kanonische Teamliste aus der Kopftabelle "Team-ID | Bezeichnung im Spielplan".
  const teamNames: string[] = [];
  const thi = sd.findIndex((r) => Array.isArray(r) && r.some((c) => String(c).trim() === 'Team-ID'));
  if (thi >= 0) {
    for (const row of sd.slice(thi + 1) as unknown[][]) {
      const id = cell(row, 0);
      const name = cell(row, 1);
      if (!id || !name) break; // Ende der Teamtabelle
      teamNames.push(name);
    }
  }

  // Kader-Blöcke: jede Zelle "Teamkader" markiert einen Block; der Teamname steht rechts daneben,
  // die Spieler stehen darunter (Vorname in Markerspalte, Nachname eine Spalte rechts).
  const rosterByName = new Map<string, { name: string }[]>();
  for (let r = 0; r < sd.length; r++) {
    const rowArr = sd[r] as unknown[];
    if (!Array.isArray(rowArr)) continue;
    for (let cIdx = 0; cIdx < rowArr.length; cIdx++) {
      if (String(rowArr[cIdx]).trim() !== 'Teamkader') continue;
      const teamName = cell(rowArr, cIdx + 1);
      if (!teamName) continue;
      const players: { name: string }[] = [];
      for (let rr = r + 2; rr < sd.length; rr++) {
        const pr = sd[rr] as unknown[];
        const first = cell(pr, cIdx);
        const last = cell(pr, cIdx + 1);
        if (first === 'Teamkader') break; // nächster Block
        if (!first && !last) break; // Leerzeile beendet den Block
        const full = `${first} ${last}`.trim();
        if (full) players.push({ name: full });
      }
      rosterByName.set(teamName, players);
    }
  }

  // Falls die Kopftabelle fehlte, Teams aus dem Spielplan ableiten.
  if (teamNames.length === 0) {
    const set = new Set<string>();
    for (const m of matches) { set.add(m.homeName); set.add(m.awayName); }
    teamNames.push(...[...set].filter(Boolean).sort());
  }

  const teams: ParsedTeam[] = teamNames.map((name) => ({ name, roster: rosterByName.get(name) ?? [] }));
  return { teams, matches };
}

// ---------------------------------------------------------------------------
// Validierung (bricht ab, bevor irgendetwas geschrieben wird)
// ---------------------------------------------------------------------------
function validate(teams: ParsedTeam[], matches: ParsedMatch[]): void {
  const errors: string[] = [];
  const teamNames = new Set(teams.map((t) => t.name));
  const seenRefs = new Set<string>();

  if (matches.length === 0) errors.push('Keine Spiele im "Gesamtspielplan" gefunden.');

  for (const m of matches) {
    const where = `Spiel ${m.importRef}`;
    if (seenRefs.has(m.importRef)) errors.push(`${where}: Spiel-ID kommt doppelt vor.`);
    seenRefs.add(m.importRef);
    if (!Number.isInteger(m.matchday) || m.matchday < 1) errors.push(`${where}: ungültiger Abend/Spieltag.`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(m.date)) errors.push(`${where}: ungültiges Datum ("${m.date}").`);
    if (!/^\d{2}:\d{2}$/.test(m.time)) errors.push(`${where}: ungültige Uhrzeit ("${m.time}").`);
    if (!m.homeName || !m.awayName) errors.push(`${where}: Heim- oder Auswärtsteam fehlt.`);
    if (m.homeName === m.awayName) errors.push(`${where}: Team spielt gegen sich selbst.`);
    if (m.homeName && !teamNames.has(m.homeName)) errors.push(`${where}: unbekanntes Heimteam "${m.homeName}".`);
    if (m.awayName && !teamNames.has(m.awayName)) errors.push(`${where}: unbekanntes Auswärtsteam "${m.awayName}".`);
  }

  if (errors.length > 0) {
    console.error(`Import abgebrochen – ${errors.length} Problem(e) gefunden:`);
    for (const e of errors.slice(0, 40)) console.error('  • ' + e);
    if (errors.length > 40) console.error(`  … und ${errors.length - 40} weitere.`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Hauptablauf
// ---------------------------------------------------------------------------
async function main() {
  const buf = readFileSync(filePath);
  const { teams, matches } = parseWorkbook(buf);
  validate(teams, matches);

  const kaderTotal = teams.reduce((n, t) => n + t.roster.length, 0);
  console.log(
    `Datei gelesen: ${matches.length} Spiele, ${teams.length} Teams, ${kaderTotal} Kaderspieler ` +
      `(Abende ${Math.min(...matches.map((m) => m.matchday))}–${Math.max(...matches.map((m) => m.matchday))}).`
  );

  if (dryRun) {
    console.log('\n--dry-run: es wurde NICHTS in die Datenbank geschrieben.');
    console.log('Beispiel-Spiele:');
    for (const m of matches.slice(0, 5)) {
      console.log(`  ${m.importRef}  Abend ${m.matchday}  ${m.date} ${m.time}  Feld ${m.field ?? '-'}  ${m.homeName} – ${m.awayName}`);
    }
    return;
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('DATABASE_URL ist nicht gesetzt. Erst `vercel env pull .env.local` ausführen.');
    process.exit(1);
  }
  const sql = neon(databaseUrl);

  // Zielsaison auflösen:
  //  - --reset: frische, saubere Saison SEASON_ID (alles andere wird vorher gelöscht).
  //  - sonst: die aktuell aktive Saison weiterverwenden; gibt es keine, SEASON_ID anlegen.
  let seasonId = SEASON_ID;
  let createSeason = true; // im Nicht-Reset-Fall nur anlegen, wenn keine aktive Saison existiert
  if (!reset) {
    const cur = (await sql`SELECT id FROM seasons WHERE is_current = true LIMIT 1`) as { id: string }[];
    if (cur[0]?.id) {
      seasonId = cur[0].id;
      createSeason = false;
    }
  }

  // Vorhandenen Zustand lesen (bei --reset irrelevant, da alles gelöscht wird).
  const existingTeams: { id: string; name: string; spielerliste: unknown }[] = reset
    ? []
    : (await sql`SELECT id, name, spielerliste FROM teams`) as any;
  const existingRefRows: { import_ref: string }[] = reset
    ? []
    : (await sql`SELECT import_ref FROM matches WHERE season_id = ${seasonId} AND import_ref IS NOT NULL`) as any;
  const existingRefs = new Set(existingRefRows.map((r) => r.import_ref));

  // Name -> Team-ID (bestehende + neu anzulegende) auflösen.
  const usedIds = new Set(existingTeams.map((t) => t.id));
  const nameToId = new Map<string, string>();
  for (const t of existingTeams) nameToId.set(t.name, t.id);

  const teamInserts: { id: string; name: string; shortName: string; roster: { name: string }[] }[] = [];
  const rosterUpdates: { id: string; roster: { name: string }[] }[] = [];

  for (const t of teams) {
    const existing = existingTeams.find((e) => e.name === t.name);
    if (existing) {
      const currentLen = Array.isArray(existing.spielerliste) ? existing.spielerliste.length : 0;
      // Kader nur setzen, wenn bislang leer – vorhandene Kader (evtl. mit Fotos) nicht überschreiben.
      if (currentLen === 0 && t.roster.length > 0) rosterUpdates.push({ id: existing.id, roster: t.roster });
      continue;
    }
    let id = slugify(t.name) || 't-' + Math.abs(hashStr(t.name));
    while (usedIds.has(id)) id = id + '-2';
    usedIds.add(id);
    nameToId.set(t.name, id);
    teamInserts.push({ id, name: t.name, shortName: makeShortName(t.name), roster: t.roster });
  }

  // Spiele: einfügen oder aktualisieren.
  const matchInserts: ParsedMatch[] = [];
  const matchUpdates: ParsedMatch[] = [];
  for (const m of matches) {
    if (!reset && existingRefs.has(m.importRef)) matchUpdates.push(m);
    else matchInserts.push(m);
  }

  // Alles in EINER Transaktion schreiben (atomar) – Muster wie api/_lib/seed.ts.
  await sql.transaction((txn) => {
    const q: unknown[] = [];
    if (reset) {
      q.push(txn`DELETE FROM matches`, txn`DELETE FROM teams`, txn`DELETE FROM seasons`);
    }
    if (createSeason) {
      // Frische Saison anlegen und als einzige "aktuelle" markieren.
      q.push(txn`UPDATE seasons SET is_current = false`);
      q.push(txn`
        INSERT INTO seasons (id, label, is_current) VALUES (${seasonId}, ${SEASON_LABEL}, true)
        ON CONFLICT (id) DO UPDATE SET label = EXCLUDED.label, is_current = true
      `);
    }
    // sonst: vorhandene aktive Saison unverändert weiterverwenden (Label/Status nicht anfassen).
    for (const t of teamInserts) {
      q.push(txn`
        INSERT INTO teams (id, name, short_name, spielerliste)
        VALUES (${t.id}, ${t.name}, ${t.shortName}, ${JSON.stringify(t.roster)}::jsonb)
      `);
    }
    for (const t of rosterUpdates) {
      q.push(txn`UPDATE teams SET spielerliste = ${JSON.stringify(t.roster)}::jsonb WHERE id = ${t.id}`);
    }
    for (const m of matchInserts) {
      q.push(txn`
        INSERT INTO matches (id, season_id, matchday, home_team_id, away_team_id,
                             home_score, away_score, status, date, time, field, slot, import_ref)
        VALUES (${`imp-${seasonId}-${m.importRef}`}, ${seasonId}, ${m.matchday},
                ${nameToId.get(m.homeName)!}, ${nameToId.get(m.awayName)!},
                null, null, 'geplant', ${m.date}, ${m.time}, ${m.field}, ${m.slot}, ${m.importRef})
      `);
    }
    for (const m of matchUpdates) {
      // Ergebnisfelder (home_score, away_score, status, scorers, absentees, live_started_at)
      // bewusst NICHT anfassen – sie bleiben erhalten.
      q.push(txn`
        UPDATE matches SET
          matchday = ${m.matchday}, date = ${m.date}, time = ${m.time},
          field = ${m.field}, slot = ${m.slot},
          home_team_id = ${nameToId.get(m.homeName)!}, away_team_id = ${nameToId.get(m.awayName)!}
        WHERE season_id = ${seasonId} AND import_ref = ${m.importRef}
      `);
    }
    return q as any;
  });

  console.log(
    `\nImport fertig (Saison ${SEASON_LABEL}${reset ? ', nach --reset' : ''}):\n` +
      `  Teams angelegt:      ${teamInserts.length}\n` +
      `  Kader aktualisiert:  ${rosterUpdates.length}\n` +
      `  Spiele angelegt:     ${matchInserts.length}\n` +
      `  Spiele aktualisiert: ${matchUpdates.length} (eingetragene Ergebnisse blieben erhalten)`
  );
}

// kleiner Fallback-Hash für Team-IDs ohne ASCII-Zeichen
function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

main().catch((err) => {
  console.error('Import fehlgeschlagen:', err);
  process.exit(1);
});
