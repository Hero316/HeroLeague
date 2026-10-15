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

// Druckfertige Rechnung (A4) im Hero-League-Look. Inline-Styles + Tabellen → funktioniert
// im Browser-Druck (→ PDF) und in Mail-Programmen; Spalten als inline-block, damit sie am Handy umbrechen.
// Logo + Hero-Schrift kommen direkt von der Website (Mail-Programme laden sie von dort).
export const INVOICE_ASSETS = 'https://hero-league.de';
const NAVY = '#06091A';
const BLUE = '#2F5BFF';
const VOLT = '#D7FF3B';
const INK = '#0B1020';
const MUTED = '#5E6788';
const LINE = '#E3E7F2';

export function invoiceHtml(b: InvoiceBooking, c: InvoiceContext, { forPrint = false, assetBase = INVOICE_ASSETS } = {}): string {
  const d = invoiceData(b, c);
  const inv = c.inv;
  const paid = b.status === 'paid';
  const T = `font-family:Arial,Helvetica,sans-serif;color:${INK};`;
  const D = `font-family:'Saira Condensed','Arial Narrow',Arial,sans-serif;font-weight:900;text-transform:uppercase;letter-spacing:.2px;`;
  const issuerLine = escapeHtml(inv.issuer.split('\n').map((l) => l.trim()).filter(Boolean).join(' · '));
  const seasons = b.package === 'two' ? c.twoLabel.split(' + ') : [c.seasonLabel];
  const dates = b.package === 'two' ? [c.seasonDates, c.nextSeasonDates] : [c.seasonDates];
  const chip = (txt: string, bg: string, fg: string) =>
    `<span style="${T}display:inline-block;background:${bg};color:${fg};font-size:10.5px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;padding:4px 9px;border-radius:999px;margin:0 4px 4px 0;">${txt}</span>`;
  const kicker = (txt: string, color = MUTED) => `<div style="${T}font-size:10px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:${color};margin-bottom:6px;">${txt}</div>`;
  const metaRow = (k: string, v: string, strong = false) =>
    `<tr><td style="${T}font-size:12.5px;color:${MUTED};padding:3px 14px 3px 0;white-space:nowrap;">${k}</td><td style="${T}font-size:12.5px;padding:3px 0;text-align:right;white-space:nowrap;${strong ? 'font-weight:700;' : ''}">${v}</td></tr>`;
  const taxRows = inv.vatRate > 0
    ? `<tr><td style="${T}padding:5px 16px 5px 0;font-size:13px;color:${MUTED};">Nettobetrag</td><td style="${T}padding:5px 0;font-size:13px;text-align:right;white-space:nowrap;">${money(d.net)}</td></tr>
       <tr><td style="${T}padding:5px 16px 5px 0;font-size:13px;color:${MUTED};">zzgl. ${inv.vatRate} % USt.</td><td style="${T}padding:5px 0;font-size:13px;text-align:right;white-space:nowrap;">${money(d.vat)}</td></tr>`
    : '';
  const col = (w: number, html: string, extra = '') => `<div style="display:inline-block;vertical-align:top;width:100%;max-width:${w}px;${extra}">${html}</div>`;

  const body = `
<table role="presentation" class="sheet" width="100%" cellpadding="0" cellspacing="0" style="max-width:720px;margin:0 auto;background:#ffffff;">
  <!-- Kopf -->
  <tr><td bgcolor="${NAVY}" style="background:${NAVY};background-image:linear-gradient(120deg,${NAVY} 0%,#0B1745 62%,#16277A 100%);padding:26px 36px 24px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      <td style="vertical-align:middle;"><img src="${assetBase}/assets/hero-league-logo.png" alt="Hero League" width="128" style="display:block;width:128px;height:auto;border:0;"></td>
      <td style="vertical-align:middle;text-align:right;">
        <div style="${D}color:#ffffff;font-size:40px;line-height:1;">Rechnung</div>
        <div style="${T}color:${VOLT};font-size:13px;font-weight:700;letter-spacing:.06em;margin-top:6px;white-space:nowrap;">Nr. ${escapeHtml(b.invoiceNo)}</div>
      </td>
    </tr></table>
  </td></tr>
  <tr><td style="padding:0;font-size:0;line-height:0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
    <td bgcolor="${BLUE}" width="72%" style="background:${BLUE};height:5px;font-size:0;line-height:0;">&nbsp;</td>
    <td bgcolor="${VOLT}" style="background:${VOLT};height:5px;font-size:0;line-height:0;">&nbsp;</td>
  </tr></table></td></tr>

  <!-- Paket -->
  <tr><td style="padding:26px 36px 0;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F2F5FF;border:1px solid #DCE3FF;border-radius:16px;"><tr><td style="padding:18px 20px 16px;">
      ${col(420, `
        ${kicker('Euer Paket', BLUE)}
        <div style="${D}color:${INK};font-size:34px;line-height:.95;">${seasons.map(escapeHtml).join(`<span style="color:${BLUE};"> + </span>`)}</div>
        <div style="margin-top:10px;">${b.package === 'two' ? chip('Doppelpaket', NAVY, '#ffffff') : chip('Eine Season', NAVY, '#ffffff')}${b.earlyBird ? chip('Early Bird', VOLT, NAVY) : ''}</div>
        <div style="${T}font-size:12.5px;color:${MUTED};line-height:1.55;margin-top:4px;">${seasons.map((sn, i) => (dates[i] ? `${escapeHtml(sn)}: ${escapeHtml(dates[i])}` : '')).filter(Boolean).join('<br>')}</div>
      `)}${col(200, `
        <div style="text-align:right;padding-top:6px;">
          ${kicker('Rechnungsbetrag')}
          <div style="${D}color:${INK};font-size:38px;line-height:1;white-space:nowrap;">${money(d.gross)}</div>
          <div style="${T}font-size:12px;color:${paid ? '#0E8A4F' : MUTED};margin-top:6px;font-weight:${paid ? 700 : 400};">${paid ? 'Bezahlt – danke!' : `fällig bis ${date(d.due)}`}</div>
        </div>
      `, 'float:right;')}
    </td></tr></table>
  </td></tr>

  <!-- Empfänger + Daten -->
  <tr><td style="padding:24px 36px 0;">
    ${col(330, `
      <div style="${T}font-size:9px;color:#8A93B0;border-bottom:1px solid ${LINE};padding-bottom:3px;margin-bottom:8px;display:inline-block;">${issuerLine}</div>
      ${kicker('Rechnung an')}
      <div style="${T}font-size:14.5px;line-height:1.5;">${d.to.map((l, i) => (i === 0 ? `<b>${escapeHtml(l)}</b>` : escapeHtml(l))).join('<br>')}</div>
    `, 'margin-bottom:16px;')}${col(290, `
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin-left:auto;">
        ${metaRow('Rechnungsnummer', escapeHtml(b.invoiceNo), true)}
        ${metaRow('Rechnungsdatum', date(d.at))}
        ${paid ? metaRow('Status', 'bezahlt') : metaRow('Fällig am', date(d.due))}
        ${metaRow('Buchungsnummer', escapeHtml(b.ref))}
        ${metaRow('Team', escapeHtml(b.teamName))}
      </table>
    `, 'float:right;')}
  </td></tr>

  <!-- Positionen -->
  <tr><td style="padding:22px 36px 0;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
      <tr>
        <td style="${T}font-size:10px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:${MUTED};border-bottom:2px solid ${INK};padding:0 0 7px;">Leistung</td>
        <td style="${T}font-size:10px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:${MUTED};border-bottom:2px solid ${INK};padding:0 0 7px;text-align:right;">Betrag</td>
      </tr>
      <tr>
        <td style="${T}font-size:14px;padding:13px 12px 13px 0;vertical-align:top;border-bottom:1px solid ${LINE};line-height:1.45;">
          <b>${escapeHtml(d.item)}</b><br>
          <span style="font-size:12.5px;color:${MUTED};">Startplatz für Team „${escapeHtml(b.teamName)}“${d.period ? ` · ${escapeHtml(d.period)}` : ''}</span>
        </td>
        <td style="${T}font-size:14px;padding:13px 0;vertical-align:top;text-align:right;border-bottom:1px solid ${LINE};white-space:nowrap;">${money(d.gross)}</td>
      </tr>
    </table>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:10px 0 0 auto;min-width:260px;">
      ${taxRows}
      <tr><td colspan="2" style="padding-top:6px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${NAVY}" style="background:${NAVY};border-radius:12px;"><tr>
          <td style="${D}color:#ffffff;font-size:17px;padding:12px 18px 12px 16px;">Gesamt</td>
          <td style="${D}color:${VOLT};font-size:24px;padding:12px 16px;text-align:right;white-space:nowrap;">${money(d.gross)}</td>
        </tr></table>
      </td></tr>
    </table>
    ${inv.vatRate === 0 && inv.taxNote ? `<div style="${T}font-size:11.5px;color:${MUTED};text-align:right;margin-top:7px;">${escapeHtml(inv.taxNote)}</div>` : ''}
  </td></tr>

  <!-- Zahlung -->
  <tr><td style="padding:22px 36px 0;">
    ${paid
      ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#E9F8EF;border-left:4px solid #12A35B;border-radius:10px;"><tr><td style="${T}padding:14px 16px;font-size:14px;line-height:1.5;"><b>Bereits bezahlt.</b> Der Rechnungsbetrag ist bei uns eingegangen – vielen Dank!</td></tr></table>`
      : `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F6F7FB;border-left:4px solid ${BLUE};border-radius:10px;"><tr><td style="padding:15px 18px;">
          ${kicker('So bezahlt ihr', BLUE)}
          <div style="${T}font-size:14px;line-height:1.55;">Bitte überweist den Betrag <b>bis zum ${date(d.due)}</b> (${c.paymentDays} Tage ab Rechnungsdatum) ohne Abzug.</div>
          <div style="${T}font-size:13.5px;line-height:1.6;margin-top:8px;">${lines(inv.bank)}</div>
          <div style="${T}font-size:13px;margin-top:10px;">Verwendungszweck: <span style="display:inline-block;background:${VOLT};color:${NAVY};font-weight:700;padding:3px 9px;border-radius:6px;white-space:nowrap;">${escapeHtml(b.invoiceNo)}</span></div>
        </td></tr></table>`}
    <div style="${T}font-size:12px;line-height:1.55;color:${MUTED};margin-top:14px;">Die Buchung ist verbindlich. Es gelten die bei der Buchung akzeptierten Teilnahmebedingungen. Wir freuen uns auf eine starke Season mit euch!</div>
  </td></tr>

  <!-- Fuß -->
  <tr><td style="padding:26px 0 0;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${NAVY}" style="background:${NAVY};"><tr><td style="padding:16px 36px;">
      <div style="${T}color:#C9D1EE;font-size:10.5px;line-height:1.6;">${issuerLine}${inv.taxId ? ` · Steuer-Nr./USt-IdNr.: ${escapeHtml(inv.taxId)}` : ''}${inv.contact ? `<br>${escapeHtml(inv.contact.split('\n').map((l) => l.trim()).filter(Boolean).join(' · '))}` : ''}</div>
    </td></tr></table>
  </td></tr>
</table>`;
  const head = `<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<style>@font-face{font-family:'Saira Condensed';font-style:normal;font-weight:900;src:url(${assetBase}/fonts/EJRLQgErUN8XuHNEtX81i9TmEkrnIcxQ962f.woff2) format('woff2')}</style>`;
  const colorExact = '*{-webkit-print-color-adjust:exact;print-color-adjust:exact}';
  if (!forPrint) return `<!doctype html><html lang="de"><head>${head}<title>Rechnung ${escapeHtml(b.invoiceNo)}</title><style>${colorExact}</style></head><body style="margin:0;padding:16px 0;background:#EEF1F8;">${body}</body></html>`;
  return `<!doctype html><html lang="de"><head>${head}<title>Rechnung ${escapeHtml(b.invoiceNo)} – ${escapeHtml(b.teamName)}</title>
<style>${colorExact}@page{size:A4;margin:0}body{margin:0;background:#EEF1F8}.sheet{box-shadow:0 10px 40px rgba(6,9,26,.12)}@media print{body{background:#fff}.np{display:none!important}.sheet{max-width:none!important;box-shadow:none}}</style></head>
<body><div class="np" style="text-align:center;padding:14px;font-family:Arial,sans-serif;"><button onclick="window.print()" style="font-size:15px;font-weight:700;padding:10px 22px;border-radius:10px;border:0;background:${BLUE};color:#fff;cursor:pointer;">Drucken / als PDF speichern</button></div>${body}<div class="np" style="height:24px"></div></body></html>`;
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
