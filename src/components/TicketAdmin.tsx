import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Ticket as TicketIcon, Trash2, Settings2, Save, Loader2, RefreshCw, Download,
  CheckCircle2, Circle, CircleDot, Users, Heart, ShieldCheck, ChevronRight, X, Mail, Search,
  CalendarDays, Plus, Wand2,
} from 'lucide-react';
import { ModalPortal } from './ui';
import { useBackClose } from '../lib/backStack';
import { usePolling } from '../lib/usePolling';
import {
  ticketAdminList, ticketAdminArrived, ticketAdminDelete, ticketAdminSave, ticketAdminMatchdays, ticketAdminDeleteEvent,
  type TicketAdminData, type TicketAdminConfig, type TicketRow, type TicketMatchdayOption,
} from '../lib/register';

const WEEKDAYS = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
// „2026-11-01" + „19:00" → „Sa, 01. November · 19:00 Uhr"
function matchdayDateLabel(date: string, time: string): string {
  const d = new Date(`${date}T12:00:00`);
  if (!date || Number.isNaN(d.getTime())) return time ? `${time} Uhr` : '';
  return `${WEEKDAYS[d.getDay()]}, ${String(d.getDate()).padStart(2, '0')}. ${MONTHS[d.getMonth()]}${time ? ` · ${time} Uhr` : ''}`;
}
// Block-Kürzel einer Anmeldung für Liste/Detail.
function blockShort(cfg: TicketAdminConfig | null, id?: string): string {
  if (!id || !cfg?.blocks || cfg.blocks.length < 2) return '';
  if (id === 'all') return 'Alle Blöcke';
  const ids = id.split(',');
  return cfg.blocks.filter((b) => ids.includes(b.id)).map((b) => b.label).join(' + ') || id;
}

const fmtDate = (iso: string | null) => { if (!iso) return '–'; try { return new Date(iso).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); } catch { return iso; } };
// Für die Suche an der Tür: Groß/Klein, Umlaute, Punkte und Leerzeichen egal.
// „muller" findet „Müller", „a7 f3" findet den Code „A7F3K2".
// Umlaute werden in ZWEI Schreibweisen geprüft (ü→u und ü→ue), damit es in
// beide Richtungen klappt: wer „Süß" eingetragen hat, wird auch über „Suess"
// gefunden – und umgekehrt.
const base = (v: string) => (v || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const normShort = (v: string) =>
  base(v).replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/ü/g, 'u').replace(/ß/g, 'ss').replace(/[^a-z0-9]/g, '');
const normLong = (v: string) =>
  (v || '').toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
// Trifft die Eingabe irgendeines der Felder – in einer der beiden Schreibweisen?
const hit = (field: string, q: string) =>
  normShort(field).includes(normShort(q)) || normLong(field).includes(normLong(q));

const inp = 'w-full bg-white/[.05] border border-white/10 rounded-xl px-3 py-2 text-[14px] text-white placeholder-hl-faint focus:border-[#E6238E] focus:outline-none';

// Einlass-Stand einer Anmeldung: niemand / teilweise / alle da.
const arrivedOf = (r: TicketRow) => Math.min(r.quantity, Math.max(0, Number(r.arrived) || 0));
const isComplete = (r: TicketRow) => arrivedOf(r) >= r.quantity;

// Auswahl „Wie viele sind da?" – eine Taste je Personenzahl (0 … Tickets).
// Jederzeit änderbar, z. B. wenn jemand später nachkommt.
function ArrivedPicker({ row, busy, onPick }: { row: TicketRow; busy: boolean; onPick: (n: number) => void }) {
  const cur = arrivedOf(row);
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {Array.from({ length: row.quantity + 1 }, (_, n) => (
        <button
          key={n}
          type="button"
          disabled={busy}
          onClick={(e) => { e.stopPropagation(); onPick(n); }}
          className={`min-w-[40px] h-10 px-3 rounded-xl text-[14px] font-bold tabular-nums cursor-pointer border transition-colors disabled:opacity-50 ${
            n === cur
              ? n === 0
                ? 'bg-white/[.12] border-white/25 text-white'
                : 'bg-brand-accent-light/15 border-brand-accent-light/50 text-brand-accent-light'
              : 'bg-white/[.04] border-white/10 text-hl-mute hover:text-white hover:border-white/25'
          }`}
        >
          {n === row.quantity && n > 1 ? `Alle ${n}` : n}
        </button>
      ))}
    </div>
  );
}

// Detail-Overlay eines Tickets: alle Daten + Einlass + Löschen MIT Bestätigung.
function TicketDetail({ row, busy, onClose, onSetArrived, onDelete }: {
  row: TicketRow; busy: boolean; onClose: () => void;
  onSetArrived: (n: number) => void; onDelete: () => void;
}) {
  const [confirmDel, setConfirmDel] = useState(false);
  useBackClose(true, onClose);
  const rows: [string, string][] = [
    ['Name', row.name || '–'],
    ['E-Mail', row.email],
    ['Personen', String(row.quantity)],
    ['Ticket-Code', row.code || '–'],
    ['Erschienen', `${arrivedOf(row)} von ${row.quantity}`],
    ['Angemeldet am', fmtDate(row.createdAt)],
    ['Bestätigt am', fmtDate(row.verifiedAt)],
    ['Einwilligung', row.consentAt ? fmtDate(row.consentAt) : 'nicht erfasst'],
  ];
  return (
    <ModalPortal>
      <motion.div className="fixed inset-0 z-[90] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
        <motion.div onClick={(e) => e.stopPropagation()} className="w-full sm:max-w-lg bg-[#150a11] border border-white/10 rounded-t-3xl sm:rounded-3xl max-h-[90vh] overflow-y-auto"
          initial={{ y: 40, opacity: 0, scale: .98 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: 40, opacity: 0, scale: .98 }} transition={{ type: 'spring', stiffness: 380, damping: 32 }}>
          <div className="sticky top-0 bg-[#150a11]/95 backdrop-blur px-5 py-4 border-b border-white/10 flex items-center justify-between">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="w-9 h-9 rounded-xl grid place-items-center shrink-0 text-white" style={{ background: 'linear-gradient(135deg,#7a0f49,#E6238E)' }}><TicketIcon className="w-4 h-4" /></span>
              <div className="min-w-0">
                <div className="font-display font-black text-white uppercase tracking-tight truncate">{row.name || 'Ticket'}</div>
                <div className="text-[12px] text-hl-mute truncate">{row.email}</div>
              </div>
            </div>
            <button onClick={onClose} className="p-2 rounded-lg text-hl-mute hover:text-white hover:bg-white/10 cursor-pointer shrink-0"><X className="w-5 h-5" /></button>
          </div>
          <div className="p-5 space-y-4">
            <div className="rounded-2xl border border-white/10 divide-y divide-white/[.06]">
              {rows.map(([k, v]) => (
                <div key={k} className="flex items-start justify-between gap-3 px-4 py-2.5">
                  <span className="text-[12px] text-hl-dim shrink-0">{k}</span>
                  <span className="text-[14px] text-white text-right font-medium break-words">{v}</span>
                </div>
              ))}
            </div>
            <div className="rounded-2xl border border-white/10 p-4 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[13px] font-bold text-white">Einlass – wie viele sind da?</span>
                {busy ? <Loader2 className="w-4 h-4 animate-spin text-hl-mute" /> : (
                  <span className={`text-[12px] font-bold tabular-nums ${isComplete(row) ? 'text-brand-accent-light' : arrivedOf(row) > 0 ? 'text-amber-300' : 'text-hl-dim'}`}>
                    {arrivedOf(row)} / {row.quantity}
                  </span>
                )}
              </div>
              <ArrivedPicker row={row} busy={busy} onPick={onSetArrived} />
              <p className="text-[11px] text-hl-faint">Kommt jemand später nach, einfach hier die neue Zahl antippen.</p>
            </div>
            <a href={`mailto:${row.email}`} className="w-full flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-[13px] font-bold text-[#ff9ad4] bg-[#E6238E]/10 border border-[#E6238E]/25 cursor-pointer"><Mail className="w-4 h-4" /> E-Mail</a>
            {confirmDel ? (
              <div className="flex gap-2">
                <button onClick={onDelete} disabled={busy} className="flex-1 rounded-xl py-2.5 text-[13px] font-bold text-white bg-rose-600 cursor-pointer">Wirklich löschen</button>
                <button onClick={() => setConfirmDel(false)} className="flex-1 rounded-xl py-2.5 text-[13px] font-bold text-hl-mute bg-white/[.06] cursor-pointer">Abbrechen</button>
              </div>
            ) : (
              <button onClick={() => setConfirmDel(true)} className="w-full flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-[13px] font-bold text-rose-300 bg-rose-500/10 border border-rose-500/20 cursor-pointer"><Trash2 className="w-4 h-4" /> Ticket löschen</button>
            )}
          </div>
        </motion.div>
      </motion.div>
    </ModalPortal>
  );
}

export default function TicketAdmin() {
  const [data, setData] = useState<TicketAdminData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showConfig, setShowConfig] = useState(false);
  const [cfg, setCfg] = useState<TicketAdminConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [onlyOpen, setOnlyOpen] = useState(false); // nur noch nicht (vollständig) Eingecheckte
  const [pickId, setPickId] = useState<string | null>(null); // Anmeldung, deren „wie viele da?"-Auswahl offen ist
  // Es können mehrere Veranstaltungen parallel offen sein (Opening Night,
  // Testspieltag, Spieltag …) – hier wird ausgewählt, welche man gerade sieht.
  const [selKey, setSelKey] = useState<string | null>(null);

  const load = (key?: string) => {
    setLoading(true);
    ticketAdminList(key ?? selKey ?? undefined)
      .then((d) => { setData(d); setCfg(d.config); if (d.config) setSelKey(d.config.eventKey); })
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Läuft der Selbst-Check-in am Eingang, lädt die Liste alle 15 s still nach –
  // so sieht man live, wer sich per QR-Code eingecheckt hat. Nur Liste & Zahlen,
  // die Einstellungen (evtl. gerade in Bearbeitung) bleiben unangetastet.
  const selfCheckinOn = !!data?.config?.selfCheckin;
  usePolling(
    () => {
      const key = selKey ?? undefined;
      ticketAdminList(key)
        .then((d) => { if (!key || d.config?.eventKey === key) setData(d); })
        .catch(() => {});
    },
    15_000,
    { enabled: selfCheckinOn, immediate: false }
  );

  // Neue Veranstaltung: Auswahl „Liga-Spieltag verknüpfen" oder „individuell".
  const [addOpen, setAddOpen] = useState(false);
  useBackClose(addOpen, () => setAddOpen(false));
  const [mdOptions, setMdOptions] = useState<{ season: { id: string; label: string } | null; matchdays: TicketMatchdayOption[] } | null>(null);
  const loadMatchdays = () => {
    if (mdOptions) return;
    ticketAdminMatchdays().then(setMdOptions).catch(() => setMdOptions({ season: null, matchdays: [] }));
  };
  useEffect(() => {
    if (showConfig) loadMatchdays();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showConfig]);

  // Neue Veranstaltung direkt aus einem Liga-Spieltag: Titel, Datum, Beginn und
  // die Blöcke (inkl. Teams je Block) kommen aus dem Spielplan.
  const addFromMatchday = (md: TicketMatchdayOption) => {
    const season = mdOptions?.season;
    if (!season) return;
    const base = `spieltag-${md.matchday}-${(md.date || '').slice(0, 4) || 'liga'}`;
    let key = base;
    for (let i = 2; data?.events.some((e) => e.eventKey === key); i++) key = `${base}-${i}`;
    const newest = data?.events.at(-1);
    const fresh: TicketAdminConfig = {
      id: key, open: false, eventKey: key, title: `${md.matchday}. SPIELTAG`,
      dateLabel: matchdayDateLabel(md.date, md.firstTime), locationLabel: newest?.locationLabel || '',
      capacity: 120, maxPerEmail: newest?.maxPerEmail || 4, note: '',
      donationUrl: newest?.donationUrl || '', startsAt: md.date && md.firstTime ? `${md.date}T${md.firstTime}` : '',
      donationPopup: true, donationTitle: newest?.donationTitle || '', donationText: newest?.donationText || '',
      accent: newest?.accent || '#E9C46A', accentDark: newest?.accentDark || '#6b4d12',
      consentText: newest?.consentText || '',
      link: { seasonId: season.id, matchday: md.matchday },
      blocks: md.blocks.length >= 2 ? md.blocks.map((b, i) => ({ id: `b${i + 1}`, label: `Block ${i + 1}`, from: b.from, to: b.to, capacity: 60 })) : [],
      allowFull: false,
    };
    setAddOpen(false);
    ticketAdminSave([...(data?.events ?? []), fresh])
      .then(() => { setSelKey(key); setShowConfig(true); load(key); })
      .catch(() => window.alert('Speichern fehlgeschlagen.'));
  };

  // Veranstaltung wechseln
  const selectEvent = (key: string) => { setSelKey(key); setShowConfig(false); load(key); };

  // Neue Veranstaltung anlegen (Schlüssel muss eindeutig sein und bleibt danach fest,
  // weil die Anmeldungen in der Datenbank daran hängen).
  const addEvent = () => {
    setAddOpen(false);
    const key = (window.prompt('Interner Schlüssel der neuen Veranstaltung (z. B. opening-night-2026).\nEr kann später NICHT mehr geändert werden:') || '').trim();
    if (!key) return;
    if (data?.events.some((e) => e.eventKey === key)) { window.alert('Dieser Schlüssel wird schon verwendet.'); return; }
    const fresh: TicketAdminConfig = {
      id: key, open: false, eventKey: key, title: 'Neue Veranstaltung', dateLabel: '', locationLabel: '',
      capacity: 50, maxPerEmail: 4, note: '', donationUrl: data?.events.at(-1)?.donationUrl || '', startsAt: '',
      donationPopup: true, donationTitle: data?.events.at(-1)?.donationTitle || '', donationText: data?.events.at(-1)?.donationText || '',
      accent: '#E9C46A', accentDark: '#6b4d12',
      consentText: data?.events[0]?.consentText || '',
    };
    const next = [...(data?.events ?? []), fresh];
    ticketAdminSave(next).then(() => { setSelKey(key); setShowConfig(true); load(key); }).catch(() => window.alert('Speichern fehlgeschlagen.'));
  };

  // Einlass speichern – sofort lokal anzeigen (an der Tür zählt jede Sekunde),
  // dann serverseitig sichern und neu laden.
  const setArrived = async (r: TicketRow, n: number) => {
    const val = Math.min(r.quantity, Math.max(0, n));
    setData((d) => (d ? { ...d, rows: d.rows.map((x) => (x.id === r.id ? { ...x, arrived: val, checkedIn: val > 0 } : x)) } : d));
    setBusyId(r.id);
    try { await ticketAdminArrived(r.id, val); load(); } catch { load(); } finally { setBusyId(null); }
  };
  // Schneller Haken in der Liste: Einzelticket = an/aus; mehrere Tickets =
  // Auswahl „wie viele sind da?" aufklappen.
  const quickCheck = (r: TicketRow) => {
    if (r.quantity <= 1) { setArrived(r, arrivedOf(r) > 0 ? 0 : 1); return; }
    setPickId((cur) => (cur === r.id ? null : r.id));
  };
  const del = async (id: string) => {
    setBusyId(id);
    try { await ticketAdminDelete(id); load(); } catch { /* ignore */ } finally { setBusyId(null); }
  };
  const saveConfig = async () => {
    if (!cfg || !data) return;
    setSaving(true);
    // Die komplette Liste schicken – nur der gerade bearbeitete Eintrag ist neu.
    const next = data.events.map((e) => (e.id === cfg.id ? cfg : e));
    try {
      await ticketAdminSave(next.some((e) => e.id === cfg.id) ? next : [...next, cfg]);
      setSaved(true); setTimeout(() => setSaved(false), 2000); load(cfg.eventKey);
    } catch { /* ignore */ } finally { setSaving(false); }
  };
  // Ganze Veranstaltung löschen – mit Sicherheitsabfrage. Sind schon Tickets
  // vergeben, muss LÖSCHEN eingetippt werden (die Anmeldungen gehen mit weg).
  const [deleting, setDeleting] = useState(false);
  const deleteEvent = async () => {
    if (!cfg || !data) return;
    const people = data.confirmedCount ?? 0;
    if (people > 0) {
      const typed = window.prompt(
        `ACHTUNG: „${cfg.title}" hat schon ${people} bestätigte Anmeldung${people === 1 ? '' : 'en'}.\n` +
          'Die Veranstaltung UND alle ihre Tickets werden endgültig gelöscht – nicht rückgängig zu machen.\n\n' +
          'Zum Bestätigen LÖSCHEN eintippen:'
      );
      if ((typed ?? '').trim().toUpperCase() !== 'LÖSCHEN') return;
    } else if (!window.confirm(`Veranstaltung „${cfg.title}" wirklich löschen?\n\nSie verschwindet aus der Liste und von der Ticket-Seite.`)) {
      return;
    }
    setDeleting(true);
    try {
      await ticketAdminDeleteEvent(cfg.eventKey);
      setShowConfig(false);
      setSelKey(null);
      load();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'Löschen fehlgeschlagen.');
    } finally {
      setDeleting(false);
    }
  };
  const exportCsv = () => {
    if (!data) return;
    // Einwilligung mit exportieren – das ist der Nachweis, wem wann was zugesagt wurde.
    const head = ['Name', 'E-Mail', 'Personen', 'Block', 'Status', 'Code', 'Erschienen', 'Bestätigt', 'Einwilligung am', 'Einwilligungstext'];
    const lines = data.rows.map((r) => [r.name, r.email, r.quantity, blockShort(data.config, r.block), r.status, r.code || '', arrivedOf(r), fmtDate(r.verifiedAt), r.consentAt ? fmtDate(r.consentAt) : '', r.consentText || '']
      .map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','));
    const blob = new Blob(['﻿' + [head.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'zuschauer-tickets.csv'; a.click(); URL.revokeObjectURL(url);
  };

  const confirmedRows = useMemo(
    // Alphabetisch – an der Tür sucht man nach Namen, nicht nach Anmeldezeit.
    () =>
      (data?.rows.filter((r) => r.status === 'confirmed') ?? []).slice().sort((a, b) =>
        a.name.localeCompare(b.name, 'de')
      ),
    [data]
  );
  const arrivedPersons = confirmedRows.reduce((sum, r) => sum + arrivedOf(r), 0);
  const soldPersons = confirmedRows.reduce((sum, r) => sum + r.quantity, 0);
  // Gesucht wird in Name, E-Mail UND Code – der Gast nennt irgendeines davon.
  const visibleRows = useMemo(() => {
    // „Nur offene" = noch nicht alle Personen dieser Anmeldung da.
    const list = onlyOpen ? confirmedRows.filter((r) => !isComplete(r)) : confirmedRows;
    const q = search.trim();
    if (!q) return list;
    return list.filter((r) => hit(r.name, q) || hit(r.email, q) || hit(r.code || '', q));
  }, [confirmedRows, search, onlyOpen]);
  const openRow = confirmedRows.find((r) => r.id === openId) || null;

  return (
    <div className="space-y-4">
      {/* Mehrere Veranstaltungen können gleichzeitig laufen – hier wird gewechselt.
          Neueste ganz links (neue werden hinten angehängt → umgedreht anzeigen),
          „+ Veranstaltung" vorne; bei vielen Einträgen seitlich scrollen. */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 -mb-1 [scrollbar-width:thin]">
        <button
          onClick={() => { setAddOpen((v) => !v); loadMatchdays(); }}
          className={`shrink-0 px-3 py-2 rounded-xl text-[12px] font-bold cursor-pointer border border-dashed whitespace-nowrap ${
            addOpen ? 'border-[#E6238E]/60 text-white bg-[#E6238E]/10' : 'border-white/20 text-hl-mute hover:text-white'
          }`}
        >
          + Veranstaltung
        </button>
        {[...(data?.overview ?? [])].reverse().map((e) => (
          <button
            key={e.eventKey}
            onClick={() => selectEvent(e.eventKey)}
            title={e.dateLabel || e.eventKey}
            className={`shrink-0 whitespace-nowrap px-3 py-2 rounded-xl text-[12px] font-bold cursor-pointer border transition-colors ${
              selKey === e.eventKey
                ? 'bg-white/10 border-white/25 text-white'
                : 'bg-white/[.03] border-white/10 text-hl-mute hover:text-hl-text'
            }`}
          >
            <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1.5 align-middle ${e.open ? 'bg-hl-green' : 'bg-hl-faint'}`} />
            {e.title}
            <span className="text-hl-faint font-normal ml-1.5 tabular-nums">{e.soldSeats}/{e.capacity}</span>
          </button>
        ))}
      </div>

      {addOpen && (
        <div className="hl-card rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <span className="font-display font-black uppercase tracking-tight text-white">Neue Veranstaltung</span>
            <button onClick={() => setAddOpen(false)} className="p-1.5 rounded-lg text-hl-mute hover:text-white cursor-pointer"><X className="w-4 h-4" /></button>
          </div>
          <div>
            <div className="text-[11px] font-mono uppercase tracking-wider text-hl-dim mb-1.5">Mit Liga-Spieltag verknüpfen{mdOptions?.season ? ` · ${mdOptions.season.label}` : ''}</div>
            {!mdOptions ? (
              <div className="text-[13px] text-hl-mute flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Lade Spielplan…</div>
            ) : mdOptions.matchdays.length === 0 ? (
              <div className="text-[13px] text-hl-mute">Keine Spieltage in der aktuellen Saison gefunden.</div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {mdOptions.matchdays.map((md) => (
                  <button
                    key={md.matchday}
                    onClick={() => addFromMatchday(md)}
                    className="text-left rounded-xl border border-white/10 bg-white/[.03] hover:bg-white/[.07] hover:border-[#E6238E]/40 px-3 py-2.5 cursor-pointer min-w-0"
                  >
                    <div className="flex items-center gap-2 text-white font-bold text-[14px]"><CalendarDays className="w-4 h-4 text-[#ff7ac4] shrink-0" /> {md.matchday}. Spieltag</div>
                    <div className="text-[11.5px] text-hl-mute mt-0.5 truncate">
                      {matchdayDateLabel(md.date, md.firstTime) || 'ohne Datum'} · {md.games} Spiele
                    </div>
                    {md.blocks.length >= 2 && (
                      <div className="text-[11px] text-hl-faint mt-0.5 truncate">
                        {md.blocks.map((b, i) => `Block ${i + 1}: ${b.from}–${b.to}`).join(' · ')}
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}
            <p className="text-[11px] text-hl-faint mt-2 leading-snug">
              Titel, Datum, Beginn und die Blöcke (60 Plätze je Block) werden aus dem Spielplan übernommen –
              danach unter „Einstellungen" anpassbar. Die Teams je Block zeigt die Ticket-Seite immer live aus dem Spielplan.
            </p>
          </div>
          <button onClick={addEvent} className="w-full rounded-xl border border-dashed border-white/20 py-2.5 text-[13px] font-bold text-hl-mute hover:text-white cursor-pointer">
            Individuelle Veranstaltung (ohne Spieltag) …
          </button>
        </div>
      )}

      {data?.blocks && data.blocks.length >= 2 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
          {data.blocks.map((b) => (
            <div key={b.id} className="hl-card rounded-2xl px-4 py-3 flex items-center justify-between gap-3 min-w-0">
              <span className="min-w-0">
                <span className="block text-[13px] font-bold text-white truncate">{b.label}</span>
                <span className="block text-[11px] text-hl-mute">{b.from}–{b.to} Uhr</span>
              </span>
              <span className="text-right shrink-0">
                <span className="block font-display font-black text-xl text-white tabular-nums leading-none">{b.sold}<span className="text-hl-faint text-sm"> / {b.capacity}</span></span>
                <span className="block text-[10px] text-hl-dim mt-0.5">{b.arrived} erschienen</span>
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        {[
          { l: 'Verkauft', v: `${data?.soldSeats ?? 0}`, sub: `/ ${data?.capacity ?? 40}` },
          { l: 'Erschienen', v: `${data?.arrivedSeats ?? arrivedPersons}`, sub: `/ ${data?.soldSeats ?? 0}` },
          { l: 'Anmeldungen', v: `${data?.confirmedCount ?? 0}` },
          { l: 'Frei', v: `${data?.remaining ?? 0}` },
        ].map((s) => (
          <div key={s.l} className="hl-card rounded-2xl p-3 text-center">
            <div className="font-display font-black text-2xl text-white tabular-nums leading-none">{s.v}{s.sub && <span className="text-hl-faint text-base"> {s.sub}</span>}</div>
            <div className="text-[10px] font-sans font-bold uppercase tracking-wide text-hl-dim mt-1">{s.l}</div>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <button onClick={() => load()} className="flex items-center gap-1.5 text-[12px] font-bold text-hl-mute hover:text-white cursor-pointer px-3 py-2 rounded-xl bg-white/[.04]"><RefreshCw className="w-3.5 h-3.5" /> Aktualisieren</button>
        {selfCheckinOn && (
          <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-emerald-300">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> Live – Selbst-Check-in aktiv
          </span>
        )}
        {confirmedRows.length > 0 && <button onClick={exportCsv} className="flex items-center gap-1.5 text-[12px] font-bold text-hl-mute hover:text-white cursor-pointer px-3 py-2 rounded-xl bg-white/[.04]"><Download className="w-3.5 h-3.5" /> CSV</button>}
        <button onClick={() => setShowConfig((v) => !v)} className={`ml-auto flex items-center gap-1.5 text-[12px] font-bold cursor-pointer px-3 py-2 rounded-xl ${showConfig ? 'text-[#ff7ac4] bg-[#E6238E]/10' : 'text-hl-mute bg-white/[.04] hover:text-white'}`}><Settings2 className="w-3.5 h-3.5" /> Einstellungen</button>
      </div>

      <AnimatePresence>
        {showConfig && cfg && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <div className="hl-card rounded-2xl p-4 space-y-3">
              <label className="flex items-center justify-between gap-3">
                <span className="text-[14px] font-semibold text-white">Ticket-Anmeldung geöffnet</span>
                <button onClick={() => setCfg({ ...cfg, open: !cfg.open })} className={`relative w-12 h-7 rounded-full transition-colors cursor-pointer ${cfg.open ? 'bg-[#E6238E]' : 'bg-white/15'}`}>
                  <span className={`absolute top-1 w-5 h-5 rounded-full bg-white transition-all ${cfg.open ? 'left-6' : 'left-1'}`} />
                </button>
              </label>
              <div className="rounded-xl border border-white/10 bg-white/[.03] p-3">
                <label className="flex items-center justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block text-[14px] font-semibold text-white">Selbst-Check-in am Eingang</span>
                    <span className="block text-[11px] text-hl-faint leading-snug mt-0.5">
                      Gäste scannen den QR-Code auf dem Plakat (hero-league.de/einchecken), geben E-Mail oder Ticket-Code ein
                      und melden, wie viele da sind – zählt direkt bei „Erschienen". Nur am Event-Tag einschalten.
                    </span>
                  </span>
                  <button onClick={() => setCfg({ ...cfg, selfCheckin: !cfg.selfCheckin })} className={`shrink-0 relative w-12 h-7 rounded-full transition-colors cursor-pointer ${cfg.selfCheckin ? 'bg-emerald-500' : 'bg-white/15'}`}>
                    <span className={`absolute top-1 w-5 h-5 rounded-full bg-white transition-all ${cfg.selfCheckin ? 'left-6' : 'left-1'}`} />
                  </button>
                </label>
                {cfg.selfCheckin && (
                  <a href={`/einchecken?e=${encodeURIComponent(cfg.eventKey)}`} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-[12px] font-bold text-emerald-300 hover:text-emerald-200">
                    Check-in-Seite öffnen ↗
                  </a>
                )}
              </div>
              <label className="block"><span className="block text-[11px] font-mono uppercase tracking-wider text-hl-dim mb-1">Titel</span><input value={cfg.title} onChange={(e) => setCfg({ ...cfg, title: e.target.value })} className={inp} /></label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block"><span className="block text-[11px] font-mono uppercase tracking-wider text-hl-dim mb-1">Datum (Text)</span><input value={cfg.dateLabel} onChange={(e) => setCfg({ ...cfg, dateLabel: e.target.value })} className={inp} /></label>
                <label className="block"><span className="block text-[11px] font-mono uppercase tracking-wider text-hl-dim mb-1">Ort (optional)</span><input value={cfg.locationLabel} onChange={(e) => setCfg({ ...cfg, locationLabel: e.target.value })} className={inp} /></label>
                <label className="block"><span className="block text-[11px] font-mono uppercase tracking-wider text-hl-dim mb-1">Max. Plätze</span><input type="number" value={cfg.capacity} onChange={(e) => setCfg({ ...cfg, capacity: Number(e.target.value) })} className={inp} /></label>
                <label className="block"><span className="block text-[11px] font-mono uppercase tracking-wider text-hl-dim mb-1">Max. pro E-Mail</span><input type="number" value={cfg.maxPerEmail} onChange={(e) => setCfg({ ...cfg, maxPerEmail: Number(e.target.value) })} className={inp} /></label>
              </div>
              <BlockEditor cfg={cfg} setCfg={setCfg} options={mdOptions} />
              <label className="block">
                <span className="block text-[11px] font-mono uppercase tracking-wider text-hl-dim mb-1">Beginn (schließt den Verkauf automatisch)</span>
                <input type="datetime-local" value={cfg.startsAt} onChange={(e) => setCfg({ ...cfg, startsAt: e.target.value })} className={inp} />
                <span className="block text-[11px] text-hl-faint mt-1.5 leading-snug">
                  Ab diesem Zeitpunkt gibt es keine Tickets mehr – auch wenn der Schalter oben noch auf „offen" steht.
                  Leer lassen = nur der Schalter entscheidet.
                </span>
              </label>
              <label className="block"><span className="block text-[11px] font-mono uppercase tracking-wider text-hl-dim mb-1">Kurzer Hinweis</span><input value={cfg.note} onChange={(e) => setCfg({ ...cfg, note: e.target.value })} className={inp} /></label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="block text-[11px] font-mono uppercase tracking-wider text-hl-dim mb-1">Farbe</span>
                  <div className="flex items-center gap-2">
                    <input type="color" value={cfg.accent} onChange={(e) => setCfg({ ...cfg, accent: e.target.value })} className="w-10 h-10 rounded-lg bg-transparent border border-white/10 cursor-pointer shrink-0" />
                    <input value={cfg.accent} onChange={(e) => setCfg({ ...cfg, accent: e.target.value })} className={inp} />
                  </div>
                </label>
                <label className="block">
                  <span className="block text-[11px] font-mono uppercase tracking-wider text-hl-dim mb-1">Farbe dunkel</span>
                  <div className="flex items-center gap-2">
                    <input type="color" value={cfg.accentDark} onChange={(e) => setCfg({ ...cfg, accentDark: e.target.value })} className="w-10 h-10 rounded-lg bg-transparent border border-white/10 cursor-pointer shrink-0" />
                    <input value={cfg.accentDark} onChange={(e) => setCfg({ ...cfg, accentDark: e.target.value })} className={inp} />
                  </div>
                </label>
              </div>
              <label className="block">
                <span className="block text-[11px] font-mono uppercase tracking-wider text-hl-dim mb-1">Einwilligungstext (Pflicht-Haken im Formular)</span>
                <textarea
                  value={cfg.consentText}
                  onChange={(e) => setCfg({ ...cfg, consentText: e.target.value })}
                  rows={5}
                  className={`${inp} leading-relaxed`}
                  placeholder="Text, dem die Zuschauer vor dem Absenden zustimmen müssen …"
                />
                <span className="block text-[11px] text-hl-faint mt-1.5 leading-snug">
                  Wird beim Anmelden zum Aufklappen angezeigt. Bei jeder Anmeldung wird gespeichert, <b>wann</b> und
                  <b> welchem Wortlaut</b> zugestimmt wurde – diesen Nachweis sieht man unten beim einzelnen Ticket.
                  Lass den Text von jemandem prüfen, der sich rechtlich auskennt.
                </span>
              </label>
              <label className="block">
                <span className="block text-[11px] font-mono uppercase tracking-wider text-hl-dim mb-1 flex items-center gap-1.5"><Heart className="w-3.5 h-3.5 text-[#ff7ac4]" /> Spenden-Link (optional)</span>
                <input value={cfg.donationUrl} onChange={(e) => setCfg({ ...cfg, donationUrl: e.target.value })} placeholder="https://… (Stripe Payment Link oder PayPal.Me)" className={inp} />
                <span className="block text-[11px] text-hl-faint mt-1">Erscheint bei Tickets UND bei der Season-2-Anmeldung (Mail + Erfolgsseite) als „Hero League unterstützen".</span>
              </label>
              <div className="rounded-xl bg-white/[.03] border border-white/[.08] p-3 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block text-[14px] font-semibold text-white">Spenden-Pop-up nach dem Ticket</span>
                    <span className="block text-[11px] text-hl-faint leading-snug mt-0.5">
                      Poppt direkt nach der Ticket-Bestätigung auf – mit deinem Text und dem Spenden-Link.
                      {!cfg.donationUrl && <b className="text-hl-gold"> Erscheint nur, wenn oben ein Spenden-Link eingetragen ist.</b>}
                    </span>
                  </span>
                  <button
                    onClick={() => setCfg({ ...cfg, donationPopup: cfg.donationPopup === false })}
                    className={`shrink-0 relative w-12 h-7 rounded-full transition-colors cursor-pointer ${cfg.donationPopup !== false ? 'bg-emerald-500' : 'bg-white/15'}`}
                  >
                    <span className={`absolute top-1 w-5 h-5 rounded-full bg-white transition-all ${cfg.donationPopup !== false ? 'left-6' : 'left-1'}`} />
                  </button>
                </div>
                {cfg.donationPopup !== false && (
                  <>
                    <label className="block">
                      <span className="block text-[11px] font-mono uppercase tracking-wider text-hl-dim mb-1">Pop-up-Überschrift</span>
                      <input value={cfg.donationTitle ?? ''} onChange={(e) => setCfg({ ...cfg, donationTitle: e.target.value })} placeholder="Kurze, ehrliche Bitte 💚" className={inp} />
                    </label>
                    <label className="block">
                      <span className="block text-[11px] font-mono uppercase tracking-wider text-hl-dim mb-1">Pop-up-Text</span>
                      <textarea value={cfg.donationText ?? ''} onChange={(e) => setCfg({ ...cfg, donationText: e.target.value })} rows={9} className={`${inp} resize-y leading-relaxed`} />
                      <span className="block text-[11px] text-hl-faint mt-1">Leere Zeile = neuer Absatz. Leer lassen = Standardtext.</span>
                    </label>
                  </>
                )}
              </div>
              <label className="block"><span className="block text-[11px] font-mono uppercase tracking-wider text-hl-dim mb-1">Event-Schlüssel (intern)</span><input value={cfg.eventKey} readOnly disabled className={`${inp} opacity-60 cursor-not-allowed`} />
                <span className="block text-[11px] text-hl-faint mt-1">Nur ändern für ein NEUES Event – die alten Anmeldungen bleiben unter dem alten Schlüssel.</span></label>

              <div className="rounded-xl bg-white/[.03] border border-white/[.06] px-3 py-2 flex items-center gap-2 text-[12px]">
                <ShieldCheck className="w-4 h-4 text-hl-faint" />
                <span className="text-hl-mute">Bot-Schutz aktiv: E-Mail-Bestätigung, Reservierung, Rate-Limit, Wegwerf-Mail-Sperre.</span>
              </div>

              <button onClick={saveConfig} disabled={saving} className="w-full flex items-center justify-center gap-2 rounded-xl py-3 text-[14px] font-display font-black uppercase tracking-wide text-white cursor-pointer disabled:opacity-50" style={{ background: 'linear-gradient(135deg,#7a0f49,#E6238E)' }}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <>Gespeichert ✓</> : <><Save className="w-4 h-4" /> Speichern</>}
              </button>
              <button
                onClick={deleteEvent}
                disabled={deleting}
                className="w-full flex items-center justify-center gap-2 rounded-xl py-2.5 text-[13px] font-bold text-rose-300 border border-rose-500/30 bg-rose-500/5 hover:bg-rose-500/15 cursor-pointer disabled:opacity-50"
              >
                {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />} Veranstaltung löschen
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Einlass-Suche: klebt oben, damit sie beim Durchscrollen der Liste
          erreichbar bleibt. An der Tür tippt man den Namen, den der Gast sagt. */}
      {confirmedRows.length > 0 && (
        <div className="sticky top-0 z-20 -mx-1 px-1 py-2 bg-[#05100e]/95 backdrop-blur-md space-y-2">
          <div className="relative">
            <Search className="w-4 h-4 text-hl-faint absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Name, E-Mail oder Code suchen…"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              className="w-full bg-white/[.06] border border-white/10 rounded-xl pl-9 pr-9 py-3 text-[15px] text-white placeholder-hl-faint focus:border-[#E6238E] focus:outline-none"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                aria-label="Suche leeren"
                className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 grid place-items-center rounded-lg text-hl-mute hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setOnlyOpen((v) => !v)}
              className={`px-3 py-1.5 rounded-lg text-[12px] font-bold cursor-pointer border transition-colors ${
                onlyOpen ? 'bg-[#E6238E]/15 border-[#E6238E]/40 text-[#ff7ac4]' : 'bg-white/[.04] border-white/10 text-hl-mute hover:text-white'
              }`}
            >
              Nur offene
            </button>
            <span className="text-[12px] text-hl-mute tabular-nums ml-auto">
              <b className="text-brand-accent-light">{arrivedPersons}</b> / {soldPersons} Personen da
            </span>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-hl-mute" /></div>
      ) : !data || confirmedRows.length === 0 ? (
        <div className="hl-card rounded-2xl p-8 text-center">
          <TicketIcon className="w-8 h-8 mx-auto text-hl-faint mb-2" />
          <p className="text-[14px] text-hl-mute">Noch keine bestätigten Tickets.</p>
        </div>
      ) : visibleRows.length === 0 ? (
        <div className="hl-card rounded-2xl p-8 text-center">
          <Search className="w-8 h-8 mx-auto text-hl-faint mb-2" />
          <p className="text-[14px] text-hl-mute">
            {onlyOpen && !search ? 'Alle sind da.' : <>Niemand gefunden für „<b className="text-white">{search}</b>".</>}
          </p>
          {onlyOpen && (
            <button onClick={() => setOnlyOpen(false)} className="mt-3 text-[12px] font-bold text-[#ff7ac4] cursor-pointer">
              Auch Eingecheckte zeigen
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {visibleRows.map((r) => {
            const a = arrivedOf(r);
            const done = isComplete(r);
            const partial = a > 0 && !done;
            return (
              <div key={r.id} className={`hl-card rounded-2xl transition-colors hover:border-[#E6238E]/30 ${done ? 'opacity-55' : ''}`}>
                <div className="flex items-center gap-3 p-3.5">
                  {/* Schneller Einlass (öffnet NICHT das Detail): Einzelticket an/aus,
                      mehrere Tickets → Auswahl „wie viele sind da?" */}
                  <button type="button" onClick={() => { if (busyId !== r.id) quickCheck(r); }} className="shrink-0 cursor-pointer" title="Einlass" aria-label="Einlass">
                    {busyId === r.id ? (
                      <Loader2 className="w-6 h-6 animate-spin text-hl-mute" />
                    ) : done ? (
                      <CheckCircle2 className="w-6 h-6 text-brand-accent-light" />
                    ) : partial ? (
                      <CircleDot className="w-6 h-6 text-amber-300" />
                    ) : (
                      <Circle className="w-6 h-6 text-hl-faint" />
                    )}
                  </button>
                  <button type="button" onClick={() => setOpenId(r.id)} className="min-w-0 flex-1 flex items-center gap-3 text-left cursor-pointer active:scale-[.99]">
                    <div className="min-w-0 flex-1">
                      <div className="text-[15px] font-semibold text-white leading-snug truncate flex items-center gap-2">{r.name}
                        <span className="inline-flex items-center gap-0.5 text-[11px] text-hl-mute font-normal"><Users className="w-3 h-3" />{r.quantity}</span>
                        {blockShort(data?.config ?? null, r.block) && (
                          <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-[#ff7ac4] bg-[#E6238E]/10 border border-[#E6238E]/25 rounded px-1.5 py-0.5">
                            {blockShort(data?.config ?? null, r.block)}
                          </span>
                        )}
                      </div>
                      <div className="text-[12px] text-hl-mute truncate">{r.email}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-mono font-bold text-[13px] text-white tracking-wider">{r.code}</div>
                      <div className={`text-[10px] mt-0.5 ${partial ? 'text-amber-300 font-bold' : 'text-hl-faint'}`}>
                        {done ? (r.quantity > 1 ? `alle ${r.quantity} da` : 'eingecheckt') : partial ? `${a} von ${r.quantity} da` : fmtDate(r.verifiedAt)}
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-hl-faint shrink-0" />
                  </button>
                </div>
                {pickId === r.id && (
                  <div className="px-3.5 pb-3.5 -mt-1 space-y-2">
                    <div className="text-[12px] font-bold text-white">Wie viele sind da?</div>
                    <ArrivedPicker row={r} busy={busyId === r.id} onPick={(n) => { setArrived(r, n); setPickId(null); }} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <AnimatePresence>
        {openRow && (
          <TicketDetail
            row={openRow}
            busy={busyId === openRow.id}
            onClose={() => setOpenId(null)}
            onSetArrived={(n) => setArrived(openRow, n)}
            onDelete={async () => { const id = openRow.id; await del(id); setOpenId(null); }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// Blockweise Tickets bearbeiten: Liga-Spieltag verknüpfen, Blöcke (Name,
// Zeitfenster, Plätze), Vorschlag aus dem Spielplan, „Ganzer Abend" an/aus.
function BlockEditor({
  cfg,
  setCfg,
  options,
}: {
  cfg: TicketAdminConfig;
  setCfg: (c: TicketAdminConfig) => void;
  options: { season: { id: string; label: string } | null; matchdays: TicketMatchdayOption[] } | null;
}) {
  const blocks = cfg.blocks ?? [];
  const on = blocks.length >= 2;
  const linkedMd = cfg.link ? options?.matchdays.find((m) => m.matchday === cfg.link?.matchday && options.season?.id === cfg.link?.seasonId) : undefined;
  const fromSchedule = (md?: TicketMatchdayOption) =>
    md && md.blocks.length >= 2
      ? md.blocks.map((b, i) => ({ id: `b${i + 1}`, label: blocks[i]?.label || `Block ${i + 1}`, from: b.from, to: b.to, capacity: blocks[i]?.capacity || 60 }))
      : [
          { id: 'b1', label: 'Block 1', from: '19:00', to: '20:30', capacity: 60 },
          { id: 'b2', label: 'Block 2', from: '20:30', to: '22:00', capacity: 60 },
        ];
  const setBlock = (i: number, patch: Partial<(typeof blocks)[number]>) =>
    setCfg({ ...cfg, blocks: blocks.map((b, j) => (j === i ? { ...b, ...patch } : b)) });
  const small = 'w-full bg-white/[.05] border border-white/10 rounded-lg px-2.5 py-1.5 text-[13px] text-white focus:border-[#E6238E] focus:outline-none min-w-0';
  return (
    <div className="rounded-xl border border-white/10 bg-white/[.03] p-3 space-y-3">
      <label className="block">
        <span className="block text-[11px] font-mono uppercase tracking-wider text-hl-dim mb-1">Verknüpfter Liga-Spieltag</span>
        <select
          value={cfg.link ? String(cfg.link.matchday) : ''}
          onChange={(e) => {
            const md = Number(e.target.value);
            setCfg({ ...cfg, link: md && options?.season ? { seasonId: options.season.id, matchday: md } : null });
          }}
          className="w-full bg-white/[.05] border border-white/10 rounded-xl px-3 py-2 text-[14px] text-white focus:outline-none"
        >
          <option value="">– keiner (individuelle Veranstaltung) –</option>
          {(options?.matchdays ?? []).map((m) => (
            <option key={m.matchday} value={m.matchday}>
              {m.matchday}. Spieltag{m.date ? ` · ${matchdayDateLabel(m.date, m.firstTime)}` : ''}
            </option>
          ))}
          {cfg.link && !linkedMd && <option value={cfg.link.matchday}>{cfg.link.matchday}. Spieltag</option>}
        </select>
        <span className="block text-[11px] text-hl-faint mt-1">Die Teams je Block kommen live aus dem Spielplan dieses Spieltags.</span>
      </label>

      <div className="flex items-center justify-between gap-3">
        <span className="min-w-0">
          <span className="block text-[14px] font-semibold text-white">Blockweise Tickets</span>
          <span className="block text-[11px] text-hl-faint leading-snug mt-0.5">Gäste haken an, in welchen Blöcken sie da sind (auch mehrere – dann belegen sie in jedem einen Platz). Jeder Block hat eigene Plätze („Max. Plätze" oben gilt dann nicht).</span>
        </span>
        <button
          onClick={() => setCfg({ ...cfg, blocks: on ? [] : fromSchedule(linkedMd) })}
          className={`shrink-0 relative w-12 h-7 rounded-full transition-colors cursor-pointer ${on ? 'bg-emerald-500' : 'bg-white/15'}`}
        >
          <span className={`absolute top-1 w-5 h-5 rounded-full bg-white transition-all ${on ? 'left-6' : 'left-1'}`} />
        </button>
      </div>

      {on && (
        <>
          <div className="space-y-2">
            {blocks.map((b, i) => (
              <div key={i} className="grid grid-cols-2 sm:grid-cols-[1.4fr_1fr_1fr_1fr_auto] gap-2 items-end">
                <label className="block col-span-2 sm:col-span-1"><span className="block text-[10px] text-hl-dim mb-0.5">Name</span><input value={b.label} onChange={(e) => setBlock(i, { label: e.target.value })} className={small} /></label>
                <label className="block"><span className="block text-[10px] text-hl-dim mb-0.5">Von</span><input type="time" value={b.from} onChange={(e) => setBlock(i, { from: e.target.value })} className={small} /></label>
                <label className="block"><span className="block text-[10px] text-hl-dim mb-0.5">Bis</span><input type="time" value={b.to} onChange={(e) => setBlock(i, { to: e.target.value })} className={small} /></label>
                <label className="block"><span className="block text-[10px] text-hl-dim mb-0.5">Plätze</span><input type="number" min={1} value={b.capacity} onChange={(e) => setBlock(i, { capacity: Number(e.target.value) })} className={small} /></label>
                <button
                  onClick={() => setCfg({ ...cfg, blocks: blocks.filter((_, j) => j !== i) })}
                  disabled={blocks.length <= 2}
                  title={blocks.length <= 2 ? 'Mindestens 2 Blöcke (sonst Blöcke ausschalten)' : 'Block entfernen'}
                  className="h-[34px] px-2 rounded-lg border border-white/10 text-hl-mute hover:text-rose-300 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => {
                const last = blocks[blocks.length - 1];
                setCfg({ ...cfg, blocks: [...blocks, { id: `b${blocks.length + 1}`, label: `Block ${blocks.length + 1}`, from: last?.to || '21:00', to: last?.to || '22:00', capacity: 60 }] });
              }}
              disabled={blocks.length >= 6}
              className="px-3 py-1.5 rounded-lg text-[12px] font-bold border border-white/10 bg-white/[.04] text-hl-mute hover:text-white cursor-pointer flex items-center gap-1.5 disabled:opacity-40"
            >
              <Plus className="w-3.5 h-3.5" /> Block
            </button>
            {linkedMd && (
              <button
                onClick={() => setCfg({ ...cfg, blocks: fromSchedule(linkedMd) })}
                className="px-3 py-1.5 rounded-lg text-[12px] font-bold border border-white/10 bg-white/[.04] text-hl-mute hover:text-white cursor-pointer flex items-center gap-1.5"
              >
                <Wand2 className="w-3.5 h-3.5" /> Zeiten aus Spielplan
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
