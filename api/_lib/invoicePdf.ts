// Fertige Rechnung als echte PDF-Datei (A4) im selben Hero-League-Look wie die
// HTML-Rechnung. Wird beim Erstellen EINMAL erzeugt und im Archiv (Tabelle
// `invoices`) gespeichert – danach nie mehr verändert (Buchhaltung).
// Schrift: Helvetica (Standard-PDF-Schrift) + Saira Condensed 900 für Überschriften.
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage, type RGB } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { invoiceData, type InvoiceBooking, type InvoiceContext } from './invoice.js';
import { LOGO_PNG, SAIRA_900_TTF } from './invoiceAssets.js';

export type InvoiceKind = 'invoice' | 'storno' | 'test';
export interface InvoicePdfInput {
  kind: InvoiceKind;
  no: string;
  issuedAt: string;
  booking: Omit<InvoiceBooking, 'invoiceNo' | 'invoiceAt'>;
  ctx: InvoiceContext;
  cancels?: { no: string; at: string }; // nur Storno: welche Rechnung aufgehoben wird
}

const hex = (h: string): RGB => rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);
const NAVY = hex('#06091A');
const BLUE = hex('#2F5BFF');
const VOLT = hex('#D7FF3B');
const INK = hex('#0B1020');
const MUTED = hex('#5E6788');
const LINE = hex('#E3E7F2');
const FAINT = hex('#8A93B0');
const WHITE = rgb(1, 1, 1);
const ROSE = hex('#D93A4A');

const money = (cents: number) =>
  `${cents < 0 ? '-' : ''}${(Math.abs(cents) / 100).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
const day = (d: Date) => d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Berlin' });

// Buchstaben ohne Zerlegung in Grundbuchstabe + Akzent.
const SPECIAL: Record<string, string> = { Ł: 'L', ł: 'l', Đ: 'D', đ: 'd', ı: 'i', Ħ: 'H', ħ: 'h', ŧ: 't', Ŧ: 'T', '„': '"', '“': '"', '”': '"' };

const W = 595.28;
const H = 841.89;
const M = 40;
const CW = W - 2 * M;

export async function invoicePdf(input: InvoicePdfInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const helv = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  let disp: PDFFont = bold;
  try {
    disp = await doc.embedFont(Buffer.from(SAIRA_900_TTF, 'base64'), { subset: true });
  } catch {
    /* Fallback: Helvetica Bold */
  }
  const logo = await doc.embedPng(Buffer.from(LOGO_PNG, 'base64')).catch(() => null);

  // Nur Zeichen schreiben, die die Schrift kennt (sonst bricht pdf-lib ab) – Akzente
  // werden notfalls entfernt, alles andere wird zu „?".
  const sets = new Map<PDFFont, Set<number>>();
  const safe = (s: string, f: PDFFont) => {
    let set = sets.get(f);
    if (!set) sets.set(f, (set = new Set(f.getCharacterSet())));
    const cs = set;
    return [...String(s ?? '').normalize('NFC').replace(/[‐-–−]/g, (c) => (c === '–' && cs.has(0x2013) ? c : '-')).replace(/[\t\r\n]+/g, ' ')]
      .map((ch) => {
        if (cs.has(ch.codePointAt(0)!)) return ch;
        if (/[\p{Extended_Pictographic}\p{M}‍️]/u.test(ch)) return ''; // Emojis o. Ä. weglassen
        const base = (SPECIAL[ch] ?? ch.normalize('NFD').replace(/[̀-ͯ]/g, '')) || '?';
        return [...base].every((x) => cs.has(x.codePointAt(0)!)) ? base : '?';
      })
      .join('')
      .replace(/ {2,}/g, ' ');
  };

  const page = doc.addPage([W, H]);
  const b: InvoiceBooking = { ...input.booking, invoiceNo: input.no, invoiceAt: input.issuedAt };
  const c = input.ctx;
  const d = invoiceData(b, c);
  const storno = input.kind === 'storno';
  const test = input.kind === 'test';
  const paid = !storno && b.status === 'paid';
  const sign = storno ? -1 : 1;

  // --- Zeichen-Helfer (y = Grundlinie, von OBEN gemessen) ---------------------
  const width = (t: string, f: PDFFont, size: number, track = 0) => {
    const s = safe(t, f);
    return f.widthOfTextAtSize(s, size) + Math.max(0, [...s].length - 1) * track;
  };
  const text = (p: PDFPage, t: string, x: number, y: number, f: PDFFont, size: number, color: RGB, opts: { align?: 'left' | 'right'; track?: number } = {}) => {
    const s = safe(t, f);
    const track = opts.track ?? 0;
    const w = width(s, f, size, track);
    let cx = opts.align === 'right' ? x - w : x;
    if (!track) return void p.drawText(s, { x: cx, y: H - y, size, font: f, color });
    for (const ch of s) {
      p.drawText(ch, { x: cx, y: H - y, size, font: f, color });
      cx += f.widthOfTextAtSize(ch, size) + track;
    }
  };
  const round = (p: PDFPage, x: number, top: number, w: number, h: number, r: number, color: RGB, border?: RGB) => {
    const k = Math.min(r, h / 2, w / 2);
    p.drawSvgPath(`M ${k},0 H ${w - k} Q ${w},0 ${w},${k} V ${h - k} Q ${w},${h} ${w - k},${h} H ${k} Q 0,${h} 0,${h - k} V ${k} Q 0,0 ${k},0 Z`, {
      x, y: H - top, color, borderColor: border, borderWidth: border ? 0.8 : 0,
    });
  };
  // Einfacher Zeilenumbruch (Wort für Wort, überlange Wörter werden hart getrennt).
  const wrap = (t: string, f: PDFFont, size: number, maxW: number): string[] => {
    const out: string[] = [];
    for (const para of String(t ?? '').split('\n')) {
      let line = '';
      for (const word of para.split(/\s+/).filter(Boolean)) {
        const cand = line ? `${line} ${word}` : word;
        if (width(cand, f, size) <= maxW) { line = cand; continue; }
        if (line) out.push(line);
        let w = word;
        while (width(w, f, size) > maxW && w.length > 1) {
          let n = w.length - 1;
          while (n > 1 && width(w.slice(0, n), f, size) > maxW) n--;
          out.push(w.slice(0, n));
          w = w.slice(n);
        }
        line = w;
      }
      if (line) out.push(line);
    }
    return out;
  };
  const fit = (t: string, f: PDFFont, size: number, maxW: number) => {
    if (width(t, f, size) <= maxW) return t;
    let s = t;
    while (s.length > 1 && width(`${s}…`, f, size) > maxW) s = s.slice(0, -1);
    return `${s.trimEnd()}…`;
  };
  const kicker = (t: string, x: number, y: number, color: RGB, align: 'left' | 'right' = 'left') =>
    text(page, t.toUpperCase(), x, y, bold, 7.2, color, { track: 1.25, align });
  const chip = (t: string, x: number, top: number, bg: RGB, fg: RGB) => {
    const label = t.toUpperCase();
    const w = width(label, bold, 7.4, 0.7) + 14;
    round(page, x, top, w, 15, 7.5, bg);
    text(page, label, x + 7, top + 10.4, bold, 7.4, fg, { track: 0.7 });
    return w;
  };

  // --- Kopf ------------------------------------------------------------------
  const HEAD = 92;
  const stops = [[0, [6, 9, 26]], [0.62, [11, 23, 69]], [1, [22, 39, 122]]] as const;
  const STRIPS = 60;
  for (let i = 0; i < STRIPS; i++) {
    const t = i / (STRIPS - 1);
    const j = t <= stops[1][0] ? 0 : 1;
    const [t0, c0] = stops[j];
    const [t1, c1] = stops[j + 1];
    const u = (t - t0) / (t1 - t0);
    const col = rgb(...(c0.map((v, k) => (v + (c1[k] - v) * u) / 255) as [number, number, number]));
    page.drawRectangle({ x: (W / STRIPS) * i, y: H - HEAD, width: W / STRIPS + 0.6, height: HEAD, color: col });
  }
  if (logo) {
    const lh = 50;
    const lw = (logo.width / logo.height) * lh;
    page.drawImage(logo, { x: M - 4, y: H - (HEAD + lh) / 2, width: lw, height: lh });
  }
  text(page, storno ? 'STORNORECHNUNG' : 'RECHNUNG', W - M, 50, disp, storno ? 27 : 32, WHITE, { align: 'right' });
  text(page, `${storno ? 'Storno-Nr.' : 'Nr.'} ${b.invoiceNo}`, W - M, 68, bold, 9.6, VOLT, { align: 'right', track: 0.5 });
  page.drawRectangle({ x: 0, y: H - HEAD - 4, width: W * 0.72, height: 4, color: BLUE });
  page.drawRectangle({ x: W * 0.72, y: H - HEAD - 4, width: W * 0.28, height: 4, color: VOLT });
  if (test) text(page, 'TESTRECHNUNG – NICHT GÜLTIG', W - M, HEAD + 17, bold, 8, ROSE, { align: 'right', track: 0.8 });

  // --- Paket-Karte ------------------------------------------------------------
  const cardTop = HEAD + 26;
  const seasons = b.package === 'two' ? c.twoLabel.split(' + ') : [c.seasonLabel];
  const dates = b.package === 'two' ? [c.seasonDates, c.nextSeasonDates] : [c.seasonDates];
  const dateLines = seasons.map((sn, i) => (dates[i] ? `${sn}: ${dates[i]}` : '')).filter(Boolean);
  const leftH = 18 + 14 + 30 + 21 + dateLines.length * 13 + 8;
  const cardH = Math.max(leftH, 104);
  round(page, M, cardTop, CW, cardH, 12, hex('#F2F5FF'), hex('#DCE3FF'));
  let cy = cardTop + 18;
  kicker(storno ? 'Storniert wird' : 'Euer Paket', M + 16, cy + 7, BLUE);
  cy += 14;
  let tx = M + 16;
  const titleSize = 25;
  seasons.forEach((sn, i) => {
    if (i > 0) {
      text(page, ' + ', tx, cy + 22, disp, titleSize, BLUE);
      tx += width(' + ', disp, titleSize);
    }
    text(page, sn.toUpperCase(), tx, cy + 22, disp, titleSize, INK);
    tx += width(sn.toUpperCase(), disp, titleSize);
  });
  cy += 30;
  let chx = M + 16;
  chx += chip(b.package === 'two' ? 'Doppelpaket' : 'Eine Season', chx, cy, NAVY, WHITE) + 4;
  if (b.earlyBird) chx += chip('Early Bird', chx, cy, VOLT, NAVY) + 4;
  if (storno) chip('Storno', chx, cy, ROSE, WHITE);
  cy += 21;
  dateLines.forEach((l) => {
    text(page, l, M + 16, cy + 9, helv, 9.3, MUTED);
    cy += 13;
  });
  const rx = W - M - 16;
  kicker(storno ? 'Gutschrift' : 'Rechnungsbetrag', rx, cardTop + 25, MUTED, 'right');
  text(page, money(sign * d.gross), rx, cardTop + 60, disp, 30, INK, { align: 'right' });
  const sub = storno ? `zu Rechnung ${input.cancels?.no ?? ''}` : paid ? 'Bezahlt – danke!' : `fällig bis ${day(d.due)}`;
  text(page, sub, rx, cardTop + 77, paid ? bold : helv, 9, paid ? hex('#0E8A4F') : MUTED, { align: 'right' });

  // --- Absender-Zeile, Empfänger + Rechnungsdaten -------------------------------
  let top = cardTop + cardH + 24;
  const issuerLine = c.inv.issuer.split('\n').map((l) => l.trim()).filter(Boolean).join(' · ');
  const issuerShort = fit(issuerLine, helv, 6.8, 280);
  text(page, issuerShort, M, top + 7, helv, 6.8, FAINT);
  page.drawLine({ start: { x: M, y: H - top - 10 }, end: { x: M + width(issuerShort, helv, 6.8), y: H - top - 10 }, thickness: 0.6, color: LINE });
  kicker(storno ? 'Stornorechnung an' : 'Rechnung an', M, top + 25, MUTED);
  let ay = top + 41;
  d.to.forEach((l, i) => {
    for (const part of wrap(l, i === 0 ? bold : helv, 11, 260)) {
      text(page, part, M, ay, i === 0 ? bold : helv, 11, INK);
      ay += 15;
    }
  });
  const meta: [string, string, boolean?][] = storno
    ? [
        ['Storno-Nr.', b.invoiceNo, true],
        ['Datum', day(d.at)],
        ['Zu Rechnung', input.cancels?.no ?? ''],
        ['Rechnung vom', input.cancels?.at ? day(new Date(input.cancels.at)) : ''],
        ['Buchungsnummer', b.ref],
        ['Team', b.teamName],
      ]
    : [
        ['Rechnungsnummer', b.invoiceNo, true],
        ['Rechnungsdatum', day(d.at)],
        paid ? ['Status', 'bezahlt'] : ['Fällig am', day(d.due)],
        ['Buchungsnummer', b.ref],
        ['Team', b.teamName],
      ];
  let my = top + 9;
  for (const [k, v, strong] of meta) {
    text(page, k, W - M - 215, my, helv, 9.4, MUTED);
    text(page, fit(v, strong ? bold : helv, 9.4, 120), W - M, my, strong ? bold : helv, 9.4, INK, { align: 'right' });
    my += 15;
  }
  top = Math.max(ay, my) + 14;

  // --- Position ----------------------------------------------------------------
  kicker('Leistung', M, top + 8, MUTED);
  kicker('Betrag', W - M, top + 8, MUTED, 'right');
  page.drawLine({ start: { x: M, y: H - top - 13 }, end: { x: W - M, y: H - top - 13 }, thickness: 1.5, color: INK });
  let iy = top + 30;
  const itemTitle = storno ? `Storno: ${d.item}` : d.item;
  const itemLines = wrap(itemTitle, bold, 10.5, CW - 110);
  text(page, money(sign * d.gross), W - M, iy, helv, 10.5, INK, { align: 'right' });
  itemLines.forEach((l) => {
    text(page, l, M, iy, bold, 10.5, INK);
    iy += 14;
  });
  const subLine = `Startplatz für Team „${b.teamName}“${d.period ? ` · ${d.period}` : ''}`;
  for (const l of wrap(subLine, helv, 9.3, CW - 110)) {
    text(page, l, M, iy + 1, helv, 9.3, MUTED);
    iy += 13;
  }
  if (storno && input.cancels) {
    text(page, `Aufhebung der Rechnung Nr. ${input.cancels.no} vom ${day(new Date(input.cancels.at))}`, M, iy + 1, helv, 9.3, MUTED);
    iy += 13;
  }
  iy += 6;
  page.drawLine({ start: { x: M, y: H - iy }, end: { x: W - M, y: H - iy }, thickness: 0.7, color: LINE });
  iy += 10;

  // --- Summen --------------------------------------------------------------------
  const boxW = 220;
  const bx = W - M - boxW;
  if (c.inv.vatRate > 0) {
    text(page, 'Nettobetrag', bx, iy + 9, helv, 9.6, MUTED);
    text(page, money(sign * d.net), W - M, iy + 9, helv, 9.6, INK, { align: 'right' });
    iy += 16;
    text(page, `zzgl. ${c.inv.vatRate} % USt.`, bx, iy + 9, helv, 9.6, MUTED);
    text(page, money(sign * d.vat), W - M, iy + 9, helv, 9.6, INK, { align: 'right' });
    iy += 20;
  }
  round(page, bx, iy, boxW, 36, 9, NAVY);
  text(page, 'GESAMT', bx + 13, iy + 23.5, disp, 13.5, WHITE);
  text(page, money(sign * d.gross), W - M - 13, iy + 25, disp, 19, VOLT, { align: 'right' });
  iy += 36;
  if (c.inv.vatRate === 0 && c.inv.taxNote) {
    iy += 4;
    for (const l of wrap(c.inv.taxNote, helv, 8.6, CW)) {
      iy += 11;
      text(page, l, W - M, iy, helv, 8.6, MUTED, { align: 'right' });
    }
  }
  iy += 20;

  // --- Zahlung / Hinweis -----------------------------------------------------------
  const boxX = M;
  const inner = CW - 34;
  type Run = { t: string; f: PDFFont };
  // Text mit fetten Stellen umbrechen.
  const richLines = (runs: Run[], size: number, maxW: number) => {
    const words: Run[] = runs.flatMap((r) => r.t.split(/\s+/).filter(Boolean).map((t) => ({ t, f: r.f })));
    const lines: Run[][] = [];
    let cur: Run[] = [];
    let w = 0;
    for (const word of words) {
      const ww = width(word.t, word.f, size);
      const sp = cur.length ? width(' ', helv, size) : 0;
      if (cur.length && w + sp + ww > maxW) {
        lines.push(cur);
        cur = [];
        w = 0;
      }
      w += (cur.length ? width(' ', helv, size) : 0) + ww;
      cur.push(word);
    }
    if (cur.length) lines.push(cur);
    return lines;
  };
  const drawRich = (lines: Run[][], x: number, y: number, size: number, lh: number, color: RGB) => {
    lines.forEach((ln, i) => {
      let cx = x;
      ln.forEach((r, k) => {
        if (k) cx += width(' ', helv, size);
        text(page, r.t, cx, y + i * lh, r.f, size, color);
        cx += width(r.t, r.f, size);
      });
    });
  };
  let boxLines: { draw: (top: number) => void; h: number }[] = [];
  let accent = BLUE;
  let bg = hex('#F6F7FB');
  if (storno) {
    accent = ROSE;
    bg = hex('#FDF0F1');
    const rl = richLines([
      { t: 'Hiermit stornieren wir die Rechnung', f: helv },
      { t: `Nr. ${input.cancels?.no ?? ''}`, f: bold },
      { t: `vom ${input.cancels?.at ? day(new Date(input.cancels.at)) : ''} vollständig. Der Rechnungsbetrag von ${money(d.gross)} ist damit aufgehoben.`, f: helv },
    ], 10.6, inner);
    boxLines = [{ h: rl.length * 15, draw: (t) => drawRich(rl, boxX + 19, t + 11, 10.6, 15, INK) }];
  } else if (paid) {
    accent = hex('#12A35B');
    bg = hex('#E9F8EF');
    const rl = richLines([{ t: 'Bereits bezahlt.', f: bold }, { t: 'Der Rechnungsbetrag ist bei uns eingegangen – vielen Dank!', f: helv }], 10.6, inner);
    boxLines = [{ h: rl.length * 15, draw: (t) => drawRich(rl, boxX + 19, t + 11, 10.6, 15, INK) }];
  } else {
    const rl = richLines([
      { t: 'Bitte überweist den Betrag', f: helv },
      { t: `bis zum ${day(d.due)}`, f: bold },
      { t: `(${c.paymentDays} Tage ab Rechnungsdatum) ohne Abzug.`, f: helv },
    ], 10.6, inner);
    const bank = c.inv.bank.split('\n').map((l) => l.trim()).filter(Boolean).flatMap((l) => wrap(l, helv, 10, inner));
    boxLines = [
      { h: 16, draw: (t) => kicker('So bezahlt ihr', boxX + 19, t + 8, BLUE) },
      { h: rl.length * 15 + 4, draw: (t) => drawRich(rl, boxX + 19, t + 11, 10.6, 15, INK) },
      { h: bank.length * 13.5 + 6, draw: (t) => bank.forEach((l, i) => text(page, l, boxX + 19, t + 10 + i * 13.5, helv, 10, INK)) },
      {
        h: 18,
        draw: (t) => {
          text(page, 'Verwendungszweck:', boxX + 19, t + 12, helv, 10, INK);
          const vx = boxX + 19 + width('Verwendungszweck: ', helv, 10);
          const vw = width(b.invoiceNo, bold, 10) + 14;
          round(page, vx, t, vw, 17, 4, VOLT);
          text(page, b.invoiceNo, vx + 7, t + 12, bold, 10, NAVY);
        },
      },
    ];
  }
  const boxH = 14 + boxLines.reduce((s, l) => s + l.h, 0) + 10;
  round(page, boxX, iy, CW, boxH, 8, bg);
  page.drawRectangle({ x: boxX, y: H - iy - boxH, width: 3, height: boxH, color: accent });
  let by = iy + 14;
  for (const l of boxLines) {
    l.draw(by);
    by += l.h;
  }
  iy += boxH + 16;
  if (!storno) {
    for (const l of wrap('Die Buchung ist verbindlich. Es gelten die bei der Buchung akzeptierten Teilnahmebedingungen. Wir freuen uns auf eine starke Season mit euch!', helv, 9, CW)) {
      text(page, l, M, iy + 7, helv, 9, MUTED);
      iy += 12.5;
    }
  }

  // --- Fuß (unten an der Seite) ---------------------------------------------------
  const footText = [
    `${issuerLine}${c.inv.taxId ? ` · Steuer-Nr./USt-IdNr.: ${c.inv.taxId}` : ''}`,
    c.inv.contact.split('\n').map((l) => l.trim()).filter(Boolean).join(' · '),
  ].filter(Boolean).flatMap((l) => wrap(l, helv, 7.8, CW));
  const footH = 28 + footText.length * 11;
  page.drawRectangle({ x: 0, y: 0, width: W, height: footH, color: NAVY });
  footText.forEach((l, i) => text(page, l, M, H - footH + 18 + i * 11, helv, 7.8, hex('#C9D1EE')));

  const at = new Date(input.issuedAt);
  doc.setTitle(`${storno ? 'Stornorechnung' : 'Rechnung'} ${b.invoiceNo} – ${safe(b.teamName, helv)}`);
  doc.setAuthor('Hero League');
  doc.setCreator('Hero League');
  doc.setProducer('Hero League');
  doc.setCreationDate(at);
  doc.setModificationDate(at);
  return doc.save();
}
