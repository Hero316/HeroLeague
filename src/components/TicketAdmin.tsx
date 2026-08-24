import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Ticket as TicketIcon, Trash2, Settings2, Save, Loader2, RefreshCw, Download,
  CheckCircle2, Circle, Users, Heart, ShieldCheck, ChevronRight, X, Mail,
} from 'lucide-react';
import { ModalPortal } from './ui';
import { useBackClose } from '../lib/backStack';
import {
  ticketAdminList, ticketAdminCheckin, ticketAdminDelete, ticketAdminSave,
  type TicketAdminData, type TicketAdminConfig, type TicketRow,
} from '../lib/register';

const fmtDate = (iso: string | null) => { if (!iso) return '–'; try { return new Date(iso).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); } catch { return iso; } };
const inp = 'w-full bg-white/[.05] border border-white/10 rounded-xl px-3 py-2 text-[14px] text-white placeholder-hl-faint focus:border-[#E6238E] focus:outline-none';

// Detail-Overlay eines Tickets: alle Daten + Einlass + Löschen MIT Bestätigung.
function TicketDetail({ row, busy, onClose, onCheckin, onDelete }: {
  row: TicketRow; busy: boolean; onClose: () => void;
  onCheckin: () => void; onDelete: () => void;
}) {
  const [confirmDel, setConfirmDel] = useState(false);
  useBackClose(true, onClose);
  const rows: [string, string][] = [
    ['Name', row.name || '–'],
    ['E-Mail', row.email],
    ['Personen', String(row.quantity)],
    ['Ticket-Code', row.code || '–'],
    ['Eingecheckt', row.checkedIn ? 'Ja' : 'Nein'],
    ['Angemeldet am', fmtDate(row.createdAt)],
    ['Bestätigt am', fmtDate(row.verifiedAt)],
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
            <div className="flex gap-2">
              <button onClick={onCheckin} disabled={busy} className={`flex-1 flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-[13px] font-bold cursor-pointer border ${row.checkedIn ? 'text-brand-accent-light bg-brand-accent-light/10 border-brand-accent-light/25' : 'text-white bg-white/[.06] border-white/10'}`}>
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : row.checkedIn ? <><CheckCircle2 className="w-4 h-4" /> Eingecheckt</> : <><Circle className="w-4 h-4" /> Einchecken</>}
              </button>
              <a href={`mailto:${row.email}`} className="flex-1 flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-[13px] font-bold text-[#ff9ad4] bg-[#E6238E]/10 border border-[#E6238E]/25 cursor-pointer"><Mail className="w-4 h-4" /> E-Mail</a>
            </div>
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

  const load = () => { setLoading(true); ticketAdminList().then((d) => { setData(d); if (!cfg) setCfg(d.config); }).catch(() => setData(null)).finally(() => setLoading(false)); };
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleCheckin = async (r: TicketRow) => {
    setBusyId(r.id);
    try { await ticketAdminCheckin(r.id, !r.checkedIn); load(); } catch { /* ignore */ } finally { setBusyId(null); }
  };
  const del = async (id: string) => {
    setBusyId(id);
    try { await ticketAdminDelete(id); load(); } catch { /* ignore */ } finally { setBusyId(null); }
  };
  const saveConfig = async () => {
    if (!cfg) return;
    setSaving(true);
    try { const r = await ticketAdminSave(cfg); setCfg(r.config); setSaved(true); setTimeout(() => setSaved(false), 2000); load(); }
    catch { /* ignore */ } finally { setSaving(false); }
  };
  const exportCsv = () => {
    if (!data) return;
    const head = ['Name', 'E-Mail', 'Personen', 'Status', 'Code', 'Eingecheckt', 'Bestätigt'];
    const lines = data.rows.map((r) => [r.name, r.email, r.quantity, r.status, r.code || '', r.checkedIn ? 'ja' : 'nein', fmtDate(r.verifiedAt)]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','));
    const blob = new Blob(['﻿' + [head.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'zuschauer-tickets.csv'; a.click(); URL.revokeObjectURL(url);
  };

  const confirmedRows = data?.rows.filter((r) => r.status === 'confirmed') ?? [];
  const openRow = confirmedRows.find((r) => r.id === openId) || null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2.5">
        {[
          { l: 'Verkauft', v: `${data?.soldSeats ?? 0}`, sub: `/ ${data?.capacity ?? 40}` },
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
        <button onClick={load} className="flex items-center gap-1.5 text-[12px] font-bold text-hl-mute hover:text-white cursor-pointer px-3 py-2 rounded-xl bg-white/[.04]"><RefreshCw className="w-3.5 h-3.5" /> Aktualisieren</button>
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
              <label className="block"><span className="block text-[11px] font-mono uppercase tracking-wider text-hl-dim mb-1">Titel</span><input value={cfg.title} onChange={(e) => setCfg({ ...cfg, title: e.target.value })} className={inp} /></label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block"><span className="block text-[11px] font-mono uppercase tracking-wider text-hl-dim mb-1">Datum (Text)</span><input value={cfg.dateLabel} onChange={(e) => setCfg({ ...cfg, dateLabel: e.target.value })} className={inp} /></label>
                <label className="block"><span className="block text-[11px] font-mono uppercase tracking-wider text-hl-dim mb-1">Ort (optional)</span><input value={cfg.locationLabel} onChange={(e) => setCfg({ ...cfg, locationLabel: e.target.value })} className={inp} /></label>
                <label className="block"><span className="block text-[11px] font-mono uppercase tracking-wider text-hl-dim mb-1">Max. Plätze</span><input type="number" value={cfg.capacity} onChange={(e) => setCfg({ ...cfg, capacity: Number(e.target.value) })} className={inp} /></label>
                <label className="block"><span className="block text-[11px] font-mono uppercase tracking-wider text-hl-dim mb-1">Max. pro E-Mail</span><input type="number" value={cfg.maxPerEmail} onChange={(e) => setCfg({ ...cfg, maxPerEmail: Number(e.target.value) })} className={inp} /></label>
              </div>
              <label className="block"><span className="block text-[11px] font-mono uppercase tracking-wider text-hl-dim mb-1">Kurzer Hinweis</span><input value={cfg.note} onChange={(e) => setCfg({ ...cfg, note: e.target.value })} className={inp} /></label>
              <label className="block">
                <span className="block text-[11px] font-mono uppercase tracking-wider text-hl-dim mb-1 flex items-center gap-1.5"><Heart className="w-3.5 h-3.5 text-[#ff7ac4]" /> Spenden-Link (optional)</span>
                <input value={cfg.donationUrl} onChange={(e) => setCfg({ ...cfg, donationUrl: e.target.value })} placeholder="https://… (Stripe Payment Link oder PayPal.Me)" className={inp} />
                <span className="block text-[11px] text-hl-faint mt-1">Erscheint bei Tickets UND bei der Season-2-Anmeldung (Mail + Erfolgsseite) als „Hero League unterstützen".</span>
              </label>
              <label className="block"><span className="block text-[11px] font-mono uppercase tracking-wider text-hl-dim mb-1">Event-Schlüssel (intern)</span><input value={cfg.eventKey} onChange={(e) => setCfg({ ...cfg, eventKey: e.target.value })} className={inp} />
                <span className="block text-[11px] text-hl-faint mt-1">Nur ändern für ein NEUES Event – die alten Anmeldungen bleiben unter dem alten Schlüssel.</span></label>

              <div className="rounded-xl bg-white/[.03] border border-white/[.06] px-3 py-2 flex items-center gap-2 text-[12px]">
                <ShieldCheck className="w-4 h-4 text-hl-faint" />
                <span className="text-hl-mute">Bot-Schutz aktiv: E-Mail-Bestätigung, Reservierung, Rate-Limit, Wegwerf-Mail-Sperre.</span>
              </div>

              <button onClick={saveConfig} disabled={saving} className="w-full flex items-center justify-center gap-2 rounded-xl py-3 text-[14px] font-display font-black uppercase tracking-wide text-white cursor-pointer disabled:opacity-50" style={{ background: 'linear-gradient(135deg,#7a0f49,#E6238E)' }}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <>Gespeichert ✓</> : <><Save className="w-4 h-4" /> Speichern</>}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-hl-mute" /></div>
      ) : !data || confirmedRows.length === 0 ? (
        <div className="hl-card rounded-2xl p-8 text-center">
          <TicketIcon className="w-8 h-8 mx-auto text-hl-faint mb-2" />
          <p className="text-[14px] text-hl-mute">Noch keine bestätigten Tickets.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {confirmedRows.map((r) => (
            <button key={r.id} onClick={() => setOpenId(r.id)} className="w-full text-left hl-card rounded-2xl p-3.5 flex items-center gap-3 hover:border-[#E6238E]/30 transition-colors cursor-pointer active:scale-[.99]">
              {/* Schneller Einlass-Haken (öffnet NICHT das Detail) */}
              <span onClick={(e) => { e.stopPropagation(); if (busyId !== r.id) toggleCheckin(r); }} className="shrink-0 cursor-pointer" title="Einlass">
                {busyId === r.id ? <Loader2 className="w-6 h-6 animate-spin text-hl-mute" /> : r.checkedIn ? <CheckCircle2 className="w-6 h-6 text-brand-accent-light" /> : <Circle className="w-6 h-6 text-hl-faint" />}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[15px] font-semibold text-white leading-snug truncate flex items-center gap-2">{r.name}
                  <span className="inline-flex items-center gap-0.5 text-[11px] text-hl-mute font-normal"><Users className="w-3 h-3" />{r.quantity}</span>
                </div>
                <div className="text-[12px] text-hl-mute truncate">{r.email}</div>
              </div>
              <div className="text-right shrink-0">
                <div className="font-mono font-bold text-[13px] text-white tracking-wider">{r.code}</div>
                <div className="text-[10px] text-hl-faint mt-0.5">{r.checkedIn ? 'eingecheckt' : fmtDate(r.verifiedAt)}</div>
              </div>
              <ChevronRight className="w-4 h-4 text-hl-faint shrink-0" />
            </button>
          ))}
        </div>
      )}

      <AnimatePresence>
        {openRow && (
          <TicketDetail
            row={openRow}
            busy={busyId === openRow.id}
            onClose={() => setOpenId(null)}
            onCheckin={() => toggleCheckin(openRow)}
            onDelete={async () => { const id = openRow.id; await del(id); setOpenId(null); }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
