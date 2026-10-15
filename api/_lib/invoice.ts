// Rechnungen für Season-Buchungen: Nummer vergeben, druckfertiges A4-HTML
// erzeugen (Admin → Drucken/PDF) und dieselbe Rechnung per E-Mail verschicken.
// Läuft über /api/signup?action=admin-booking-invoice (siehe booking.ts).
import { sql } from './db.js';
import { escapeHtml } from './mail.js';

export interface InvoiceSettings {
  issuer: string; // Absender: Name + Anschrift (mehrzeilig)
  contact: string; // E-Mail / Telefon / Web (mehrzeilig, optional)
  taxId: string; // Steuernummer oder USt-IdNr.
  vatRate: number; // 0 = Kleinunternehmer (§ 19 UStG), sonst z. B. 19 (Preise sind brutto)
  taxNote: string; // Hinweis bei 0 % USt
  bank: string; // Kontoinhaber, IBAN, BIC, Bank (mehrzeilig)
  prefix: string; // z. B. „HL-" → HL-2026-001
  nextNo: number; // laufende Nummer der nächsten Rechnung
}

export const DEFAULT_INVOICE: InvoiceSettings = {
  issuer: '',
  contact: '',
  taxId: '',
  vatRate: 0,
  taxNote: 'Gemäß § 19 UStG wird keine Umsatzsteuer berechnet.',
  bank: '',
  prefix: 'HL-',
  nextNo: 1,
};

export function cleanInvoice(v: unknown, cur: InvoiceSettings): InvoiceSettings {
  const o = (v && typeof v === 'object' ? v : {}) as Partial<InvoiceSettings>;
  const txt = (x: unknown, max: number) => (typeof x === 'string' ? x.replace(/\r/g, '').trim().slice(0, max) : '');
  const rate = Number(o.vatRate);
  const no = Math.round(Number(o.nextNo));
  return {
    issuer: txt(o.issuer, 400),
    contact: txt(o.contact, 300),
    taxId: txt(o.taxId, 60),
    vatRate: [0, 7, 19].includes(rate) ? rate : 0,
    taxNote: txt(o.taxNote, 300),
    bank: txt(o.bank, 300),
    prefix: txt(o.prefix, 12).replace(/[^A-Za-z0-9\-_/]/g, ''),
    // Nie unter die bereits vergebene Nummer zurückspringen (sonst doppelte Rechnungsnummern).
    nextNo: Math.max(cur.nextNo || 1, Number.isFinite(no) && no > 0 && no < 1_000_000 ? no : 1),
  };
}

export function invoiceMissing(inv: InvoiceSettings): string[] {
  return [
    !inv.issuer && 'Absender (Name + Anschrift)',
    !inv.bank && 'Bankverbindung',
    !inv.taxId && 'Steuernummer / USt-IdNr.',
  ].filter(Boolean) as string[];
}

// Nächste Nummer atomar ziehen (Zähler steckt in settings.season_booking.invoice.nextNo).
export async function drawInvoiceNo(inv: InvoiceSettings): Promise<string> {
  const rows = await sql`UPDATE settings SET value = value || jsonb_build_object('invoice',
      COALESCE(value->'invoice', '{}'::jsonb) || jsonb_build_object('nextNo', COALESCE((value->'invoice'->>'nextNo')::int, 1) + 1))
    WHERE key = 'season_booking' RETURNING (value->'invoice'->>'nextNo')::int - 1 AS no`;
  const no = Number(rows[0]?.no) || inv.nextNo || 1;
  return `${inv.prefix}${new Date().getFullYear()}-${String(no).padStart(3, '0')}`;
}

export interface InvoiceBooking {
  ref: string;
  teamName: string;
  contactName: string;
  email: string;
  package: 'one' | 'two';
  priceCents: number;
  earlyBird: boolean;
  billing: { name?: string; street?: string; zip?: string; city?: string } | null;
  invoiceNo: string;
  invoiceAt: string;
  status?: string; // 'paid' → Rechnung vermerkt „bereits bezahlt"
}
export interface InvoiceContext {
  seasonLabel: string;
  twoLabel: string;
  seasonDates: string;
  nextSeasonDates: string;
  paymentDays: number;
  inv: InvoiceSettings;
}

const money = (cents: number) => `${(cents / 100).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
const date = (d: Date) => d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Berlin' });
const lines = (s: string) => escapeHtml(s).split('\n').filter((l) => l.trim()).join('<br>');

export function invoiceData(b: InvoiceBooking, c: InvoiceContext) {
  const at = new Date(b.invoiceAt || Date.now());
  const due = new Date(at.getTime() + c.paymentDays * 86_400_000);
  const bill = b.billing ?? {};
  const to = [bill.name || b.contactName, b.teamName && bill.name !== b.teamName ? `Team „${b.teamName}“` : '', bill.street ?? '', `${bill.zip ?? ''} ${bill.city ?? ''}`.trim()].filter(Boolean);
  const item = b.package === 'two'
    ? `Teilnahmegebühr ${c.twoLabel} (Doppelpaket${b.earlyBird ? ', Early Bird' : ''})`
    : `Teilnahmegebühr ${c.seasonLabel}`;
  const period = b.package === 'two' ? [c.seasonDates, c.nextSeasonDates].filter(Boolean).join(' und ') : c.seasonDates;
  const gross = b.priceCents;
  const net = c.inv.vatRate > 0 ? Math.round(gross / (1 + c.inv.vatRate / 100)) : gross;
  return { at, due, to, item, period, gross, net, vat: gross - net };
}

// Druckfertige Rechnung (A4). Inline-Styles + Tabellen → funktioniert im Browser-Druck und in Mail-Programmen.
export function invoiceHtml(b: InvoiceBooking, c: InvoiceContext, { forPrint = false } = {}): string {
  const d = invoiceData(b, c);
  const inv = c.inv;
  const f = 'font-family:Arial,Helvetica,sans-serif;color:#111;';
  const issuerLine = escapeHtml(inv.issuer.split('\n').map((l) => l.trim()).filter(Boolean).join(' · '));
  const taxRows = inv.vatRate > 0
    ? `<tr><td style="${f}padding:4px 0;font-size:13px;color:#555;">Nettobetrag</td><td style="${f}padding:4px 0;font-size:13px;text-align:right;">${money(d.net)}</td></tr>
       <tr><td style="${f}padding:4px 0;font-size:13px;color:#555;">zzgl. ${inv.vatRate} % USt.</td><td style="${f}padding:4px 0;font-size:13px;text-align:right;">${money(d.vat)}</td></tr>`
    : '';
  const body = `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:720px;margin:0 auto;background:#fff;">
  <tr><td style="padding:40px 44px 0;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      <td style="${f}vertical-align:top;">
        <div style="font-size:26px;font-weight:900;letter-spacing:-.5px;">HERO LEAGUE</div>
      </td>
      <td style="${f}vertical-align:top;text-align:right;font-size:12px;line-height:1.5;color:#444;">${lines(inv.issuer)}${inv.contact ? `<br>${lines(inv.contact)}` : ''}</td>
    </tr></table>
  </td></tr>
  <tr><td style="padding:34px 44px 0;">
    <div style="${f}font-size:9.5px;color:#777;border-bottom:1px solid #ccc;padding-bottom:3px;margin-bottom:8px;display:inline-block;">${issuerLine}</div>
    <div style="${f}font-size:14px;line-height:1.5;">${d.to.map(escapeHtml).join('<br>')}</div>
  </td></tr>
  <tr><td style="padding:34px 44px 0;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      <td style="${f}vertical-align:bottom;font-size:28px;font-weight:900;">Rechnung</td>
      <td style="${f}vertical-align:bottom;text-align:right;font-size:12.5px;line-height:1.6;color:#333;">
        Rechnungsnummer: <b style="white-space:nowrap;">${escapeHtml(b.invoiceNo)}</b><br>
        Rechnungsdatum: <span style="white-space:nowrap;">${date(d.at)}</span><br>
        Buchungsnummer: <span style="white-space:nowrap;">${escapeHtml(b.ref)}</span>
      </td>
    </tr></table>
  </td></tr>
  <tr><td style="padding:22px 44px 0;${f}font-size:14px;line-height:1.55;">
    Vielen Dank für eure Buchung. Wir stellen euch folgende Leistung in Rechnung:
  </td></tr>
  <tr><td style="padding:18px 44px 0;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
      <tr>
        <td style="${f}font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#666;border-bottom:2px solid #111;padding:6px 0;">Pos.</td>
        <td style="${f}font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#666;border-bottom:2px solid #111;padding:6px 8px;">Leistung</td>
        <td style="${f}font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#666;border-bottom:2px solid #111;padding:6px 0;text-align:right;">Betrag</td>
      </tr>
      <tr>
        <td style="${f}font-size:14px;padding:12px 0;vertical-align:top;border-bottom:1px solid #ddd;">1</td>
        <td style="${f}font-size:14px;padding:12px 8px;vertical-align:top;border-bottom:1px solid #ddd;">
          <b>${escapeHtml(d.item)}</b><br>
          <span style="font-size:12.5px;color:#555;">Startplatz für Team „${escapeHtml(b.teamName)}“${d.period ? `<br>Leistungszeitraum: ${escapeHtml(d.period)}` : ''}</span>
        </td>
        <td style="${f}font-size:14px;padding:12px 0;vertical-align:top;text-align:right;border-bottom:1px solid #ddd;white-space:nowrap;">${money(d.gross)}</td>
      </tr>
    </table>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:8px;">
      <tr><td width="45%"></td><td>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          ${taxRows}
          <tr><td style="${f}padding:8px 16px 8px 0;font-size:16px;font-weight:900;border-top:2px solid #111;">Rechnungsbetrag</td><td style="${f}padding:8px 0;font-size:16px;font-weight:900;text-align:right;border-top:2px solid #111;white-space:nowrap;">${money(d.gross)}</td></tr>
        </table>
      </td></tr>
    </table>
  </td></tr>
  ${inv.vatRate === 0 && inv.taxNote ? `<tr><td style="padding:10px 44px 0;${f}font-size:12.5px;color:#444;">${escapeHtml(inv.taxNote)}</td></tr>` : ''}
  <tr><td style="padding:22px 44px 0;${f}font-size:14px;line-height:1.6;">
    ${b.status === 'paid'
      ? '<b>Der Rechnungsbetrag ist bereits bei uns eingegangen – vielen Dank.</b>'
      : `Bitte überweist den Rechnungsbetrag <b>bis zum ${date(d.due)}</b> (${c.paymentDays} Tage ab Rechnungsdatum) ohne Abzug auf das unten genannte Konto.
    Verwendungszweck: <b>${escapeHtml(b.invoiceNo)}</b>`}
  </td></tr>
  <tr><td style="padding:16px 44px 0;">
    <table role="presentation" cellpadding="0" cellspacing="0" style="background:#f3f5f9;border-radius:8px;"><tr><td style="${f}padding:12px 16px;font-size:13px;line-height:1.6;">${lines(inv.bank)}</td></tr></table>
  </td></tr>
  <tr><td style="padding:22px 44px 0;${f}font-size:12.5px;line-height:1.55;color:#444;">
    Die Buchung ist verbindlich. Es gelten die bei der Buchung akzeptierten Teilnahmebedingungen.
  </td></tr>
  <tr><td style="padding:28px 44px 40px;">
    <div style="${f}border-top:1px solid #ddd;padding-top:10px;font-size:10.5px;line-height:1.5;color:#777;">
      ${issuerLine}${inv.taxId ? ` · Steuer-Nr./USt-IdNr.: ${escapeHtml(inv.taxId)}` : ''}
    </div>
  </td></tr>
</table>`;
  if (!forPrint) return `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Rechnung ${escapeHtml(b.invoiceNo)}</title></head><body style="margin:0;padding:16px 0;background:#eef0f4;">${body}</body></html>`;
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Rechnung ${escapeHtml(b.invoiceNo)} – ${escapeHtml(b.teamName)}</title>
<style>@page{size:A4;margin:0}body{margin:0;background:#eef0f4}@media print{body{background:#fff}.np{display:none!important}}</style></head>
<body><div class="np" style="text-align:center;padding:14px;font-family:Arial,sans-serif;"><button onclick="window.print()" style="font-size:15px;font-weight:700;padding:10px 22px;border-radius:10px;border:0;background:#2F5BFF;color:#fff;cursor:pointer;">Drucken / als PDF speichern</button></div>${body}</body></html>`;
}

export function invoiceText(b: InvoiceBooking, c: InvoiceContext): string {
  const d = invoiceData(b, c);
  return [
    `Rechnung ${b.invoiceNo} vom ${date(d.at)} (Buchung ${b.ref})`,
    '',
    `An: ${d.to.join(', ')}`,
    '',
    `${d.item} – Team „${b.teamName}“${d.period ? ` – Leistungszeitraum: ${d.period}` : ''}`,
    c.inv.vatRate > 0 ? `Netto ${money(d.net)} + ${c.inv.vatRate} % USt. ${money(d.vat)}` : c.inv.taxNote,
    `Rechnungsbetrag: ${money(d.gross)}`,
    '',
    b.status === 'paid' ? 'Der Rechnungsbetrag ist bereits bei uns eingegangen – vielen Dank.' : `Zahlbar bis ${date(d.due)} ohne Abzug. Verwendungszweck: ${b.invoiceNo}`,
    c.inv.bank,
    '',
    c.inv.issuer.split('\n').join(' · '),
    c.inv.taxId ? `Steuer-Nr./USt-IdNr.: ${c.inv.taxId}` : '',
  ].join('\n');
}
