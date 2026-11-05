// Rechnungsarchiv (Buchhaltung): Jede Rechnung und jede Stornorechnung landet beim
// Erstellen EINMAL in der Tabelle `invoices` – mit eingefrorenen Daten (Buchung +
// Rechnungsvorlage zum Zeitpunkt der Ausstellung) und der fertigen PDF-Datei.
// Einträge werden nie gelöscht und inhaltlich nie geändert; Korrektur nur per Storno.
//
// Nummernvergabe: Zähler ziehen, Nummer an die Buchung hängen und Archiv-Eintrag
// anlegen passiert in EINER SQL-Anweisung (atomar). Schlägt etwas fehl, passiert
// gar nichts → keine doppelten Nummern, keine Lücken. Gleichzeitige Klicks auf
// dieselbe Buchung sperren sich gegenseitig (FOR UPDATE), die zweite bekommt
// einfach die schon vergebene Rechnung.
import { sql } from './db.js';
import type { InvoiceBooking, InvoiceContext } from './invoice.js';
import { invoicePdf, type InvoiceKind } from './invoicePdf.js';

export type InvoiceSnapshot = {
  booking: Omit<InvoiceBooking, 'invoiceNo' | 'invoiceAt'>;
  ctx: InvoiceContext;
  cancels?: { no: string; at: string };
};
export interface ArchivedInvoice {
  no: string;
  kind: InvoiceKind;
  bookingId: string;
  ref: string;
  teamName: string;
  grossCents: number;
  issuedAt: string;
  cancelsNo: string;
  cancelledBy: string;
  sentAt: string | null;
  data: InvoiceSnapshot;
}

const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : '');

export function snapshotOf(b: Omit<InvoiceBooking, 'invoiceNo' | 'invoiceAt'>, ctx: InvoiceContext): InvoiceSnapshot {
  return {
    booking: {
      ref: b.ref, teamName: b.teamName, contactName: b.contactName, email: b.email, package: b.package,
      priceCents: b.priceCents, earlyBird: b.earlyBird, billing: b.billing ?? null, status: b.status === 'paid' ? 'paid' : 'pending',
    },
    ctx,
  };
}

// Neue Rechnung für eine Buchung. Gibt die Nummer zurück (null = hatte schon eine / nicht gefunden).
export async function issueInvoice(bookingId: string, snap: InvoiceSnapshot): Promise<string | null> {
  const s = snap.booking;
  const rows = await sql`
    WITH b AS (SELECT id FROM season_bookings WHERE id = ${bookingId} AND invoice_no = '' FOR UPDATE),
    n AS (
      UPDATE settings SET value = value || jsonb_build_object('invoice',
        COALESCE(value->'invoice', '{}'::jsonb) || jsonb_build_object('nextNo', COALESCE((value->'invoice'->>'nextNo')::int, 1) + 1))
      WHERE key = 'season_booking' AND EXISTS (SELECT 1 FROM b)
      RETURNING COALESCE(value->'invoice'->>'prefix', '') AS prefix, (value->'invoice'->>'nextNo')::int - 1 AS seq),
    num AS (
      SELECT prefix || to_char(now() AT TIME ZONE 'Europe/Berlin', 'YYYY') || '-' || lpad(seq::text, GREATEST(3, length(seq::text)), '0') AS no FROM n),
    u AS (
      UPDATE season_bookings sb SET invoice_no = num.no, invoice_at = now(), invoice_sent_at = NULL, updated_at = now()
      FROM num WHERE sb.id = ${bookingId} AND sb.invoice_no = '' RETURNING sb.invoice_no, sb.invoice_at)
    INSERT INTO invoices (no, kind, booking_id, ref, team_name, gross_cents, issued_at, data)
    SELECT u.invoice_no, 'invoice', ${bookingId}, ${s.ref}, ${s.teamName}, ${s.priceCents}, u.invoice_at, ${JSON.stringify(snap)}::jsonb FROM u
    RETURNING no`;
  return (rows[0]?.no as string) ?? null;
}

// Testbuchungen: eigene Nummer „TEST-<Buchungsnr.>", zieht KEINE echte Rechnungsnummer.
export async function issueTestInvoice(bookingId: string, snap: InvoiceSnapshot): Promise<string | null> {
  const s = snap.booking;
  const rows = await sql`
    WITH u AS (
      UPDATE season_bookings SET invoice_no = 'TEST-' || ref || '-' || to_char(now(), 'HH24MISS'), invoice_at = now(), invoice_sent_at = NULL, updated_at = now()
      WHERE id = ${bookingId} AND invoice_no = '' RETURNING invoice_no, invoice_at)
    INSERT INTO invoices (no, kind, booking_id, ref, team_name, gross_cents, issued_at, data)
    SELECT u.invoice_no, 'test', ${bookingId}, ${s.ref}, ${s.teamName}, ${s.priceCents}, u.invoice_at, ${JSON.stringify(snap)}::jsonb FROM u
    ON CONFLICT (no) DO NOTHING
    RETURNING no`;
  return (rows[0]?.no as string) ?? null;
}

// Stornorechnung zu einer bestehenden Rechnung (eigene Nummer aus demselben Nummernkreis).
// Die Buchung verliert danach ihre aktive Rechnung und kann neu abgerechnet werden.
export async function issueStorno(orig: ArchivedInvoice): Promise<string | null> {
  const snap: InvoiceSnapshot = { ...orig.data, cancels: { no: orig.no, at: orig.issuedAt } };
  const rows = await sql`
    WITH o AS (SELECT no FROM invoices WHERE no = ${orig.no} AND kind = 'invoice' AND cancelled_by = '' FOR UPDATE),
    n AS (
      UPDATE settings SET value = value || jsonb_build_object('invoice',
        COALESCE(value->'invoice', '{}'::jsonb) || jsonb_build_object('nextNo', COALESCE((value->'invoice'->>'nextNo')::int, 1) + 1))
      WHERE key = 'season_booking' AND EXISTS (SELECT 1 FROM o)
      RETURNING COALESCE(value->'invoice'->>'prefix', '') AS prefix, (value->'invoice'->>'nextNo')::int - 1 AS seq),
    num AS (
      SELECT prefix || to_char(now() AT TIME ZONE 'Europe/Berlin', 'YYYY') || '-' || lpad(seq::text, GREATEST(3, length(seq::text)), '0') AS no FROM n),
    oo AS (
      UPDATE invoices i SET cancelled_by = num.no FROM num WHERE i.no = ${orig.no} AND i.cancelled_by = '' RETURNING i.booking_id),
    bk AS (
      UPDATE season_bookings sb SET invoice_no = '', invoice_at = NULL, invoice_sent_at = NULL, updated_at = now()
      FROM oo WHERE sb.id = oo.booking_id AND sb.invoice_no = ${orig.no} RETURNING sb.id)
    INSERT INTO invoices (no, kind, booking_id, ref, team_name, gross_cents, issued_at, cancels_no, data)
    SELECT num.no, 'storno', oo.booking_id, ${orig.ref}, ${orig.teamName}, ${-orig.grossCents}, now(), ${orig.no}, ${JSON.stringify(snap)}::jsonb
    FROM num, oo
    RETURNING no`;
  return (rows[0]?.no as string) ?? null;
}

// Testrechnung „stornieren": keine Stornorechnung nötig, nur von der Buchung lösen.
export async function releaseTestInvoice(no: string): Promise<void> {
  await sql`UPDATE invoices SET cancelled_by = 'TEST' WHERE no = ${no} AND kind = 'test' AND cancelled_by = ''`;
  await sql`UPDATE season_bookings SET invoice_no = '', invoice_at = NULL, invoice_sent_at = NULL, updated_at = now() WHERE invoice_no = ${no}`;
}

// Rechnungen, die vor dem Archiv erstellt wurden, nachträglich aufnehmen (gleiche Nummer + Datum).
export async function backfillArchive(ctx: InvoiceContext): Promise<void> {
  await sql`
    INSERT INTO invoices (no, kind, booking_id, ref, team_name, gross_cents, issued_at, sent_at, data)
    SELECT sb.invoice_no, CASE WHEN sb.invoice_no LIKE 'TEST-%' THEN 'test' ELSE 'invoice' END, sb.id, sb.ref, sb.team_name, sb.price_cents,
      COALESCE(sb.invoice_at, now()), sb.invoice_sent_at,
      jsonb_build_object('booking', jsonb_build_object('ref', sb.ref, 'teamName', sb.team_name, 'contactName', sb.contact_name, 'email', sb.email,
        'package', sb.package, 'priceCents', sb.price_cents, 'earlyBird', sb.early_bird, 'billing', sb.billing,
        'status', CASE WHEN sb.paid_at IS NOT NULL AND sb.invoice_at IS NOT NULL AND sb.paid_at <= sb.invoice_at THEN 'paid' ELSE 'pending' END),
        'ctx', ${JSON.stringify(ctx)}::jsonb)
    FROM season_bookings sb
    WHERE sb.invoice_no <> '' AND NOT EXISTS (SELECT 1 FROM invoices i WHERE i.no = sb.invoice_no)
    ON CONFLICT (no) DO NOTHING`;
}

const COLS = sql.unsafe(`no, kind, booking_id AS "bookingId", ref, team_name AS "teamName", gross_cents AS "grossCents", issued_at AS "issuedAt",
  cancels_no AS "cancelsNo", cancelled_by AS "cancelledBy", sent_at AS "sentAt", data`);

function normalize(r: Record<string, unknown>): ArchivedInvoice {
  return { ...(r as unknown as ArchivedInvoice), issuedAt: iso(r.issuedAt), sentAt: r.sentAt ? iso(r.sentAt) : null };
}

export async function getInvoice(no: string): Promise<ArchivedInvoice | null> {
  const rows = await sql`SELECT ${COLS} FROM invoices WHERE no = ${no}`;
  return rows[0] ? normalize(rows[0]) : null;
}

export async function listInvoices(): Promise<Omit<ArchivedInvoice, 'data'>[]> {
  const rows = await sql`SELECT ${COLS} FROM invoices WHERE kind <> 'test' ORDER BY issued_at DESC, no DESC`;
  return rows.map((r) => {
    const { data: _data, ...rest } = normalize(r);
    return rest;
  });
}

export async function invoicesIssued(): Promise<boolean> {
  return (await sql`SELECT 1 FROM invoices WHERE kind <> 'test' LIMIT 1`).length > 0;
}

// Fertige PDF aus dem Archiv. Fehlt sie (z. B. Abbruch direkt nach dem Erstellen),
// wird sie EINMAL aus den eingefrorenen Daten erzeugt und gespeichert.
export async function invoicePdfBytes(no: string): Promise<Buffer | null> {
  const rows = await sql`SELECT pdf FROM invoices WHERE no = ${no}`;
  if (!rows[0]) return null;
  if (rows[0].pdf) return Buffer.from(rows[0].pdf as string, 'base64');
  const inv = await getInvoice(no);
  if (!inv) return null;
  const bytes = await invoicePdf({
    kind: inv.kind, no: inv.no, issuedAt: inv.issuedAt, booking: inv.data.booking, ctx: inv.data.ctx, cancels: inv.data.cancels,
  });
  await sql`UPDATE invoices SET pdf = ${Buffer.from(bytes).toString('base64')} WHERE no = ${no} AND pdf = ''`;
  const stored = await sql`SELECT pdf FROM invoices WHERE no = ${no}`;
  return Buffer.from(stored[0].pdf as string, 'base64');
}

export async function markInvoiceSent(no: string): Promise<void> {
  await sql`UPDATE invoices SET sent_at = now() WHERE no = ${no}`;
}
