// Einmaliges Datenbank-Setup: legt die Tabellen an und spielt die Demo-Daten ein.
// Aufruf: npm run db:setup            (liest DATABASE_URL aus .env.local)
// Erneutes Ausführen (löscht ALLE Daten!): npm run db:setup -- --force
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { neon } from '@neondatabase/serverless';
import { applySeed } from '../api/_lib/seed.js';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL ist nicht gesetzt. Erst `vercel env pull .env.local` ausführen (siehe README).');
  process.exit(1);
}

const sql = neon(databaseUrl);
const force = process.argv.includes('--force');

async function main() {
  const existing = await sql`SELECT to_regclass('public.teams') AS table_name`;
  if (existing[0]?.table_name) {
    if (!force) {
      console.error(
        'Die Tabellen existieren bereits. Abbruch, um Datenverlust zu vermeiden.\n' +
          'Zum kompletten Zurücksetzen auf Demo-Daten: npm run db:setup -- --force'
      );
      process.exit(1);
    }
    console.log('--force gesetzt: bestehende Tabellen werden gelöscht...');
    await sql.query('DROP TABLE IF EXISTS matches, teams, seasons, settings CASCADE');
  }

  const schemaPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'db', 'schema.sql');
  const schema = readFileSync(schemaPath, 'utf8');
  const statements = schema
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  for (const statement of statements) {
    await sql.query(statement);
  }
  console.log(`Schema angelegt (${statements.length} Statements).`);

  await applySeed(sql);
  console.log('Demo-Daten eingespielt: 1 Saison, 10 Teams, 25 Spiele, Spieler des Monats.');
  console.log('Fertig. Die App kann jetzt mit `vercel dev` gestartet werden.');
}

main().catch((err) => {
  console.error('Setup fehlgeschlagen:', err);
  process.exit(1);
});
