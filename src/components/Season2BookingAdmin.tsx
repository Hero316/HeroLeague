import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  RefreshCw, Download, Settings2, Mail, Phone, X, Loader2, CheckCircle2, Clock, Ban, Trash2, Users, Send,
  Copy, Check, Eye, Lock, Globe, FileText, ArrowRightLeft, ExternalLink, Save, KeyRound, Inbox, Crown, Hand,
} from 'lucide-react';
import { ModalPortal } from './ui';
import { goBackLayer, useBackClose } from '../lib/backStack';
import { apiFetch } from '../lib/api';
import {
  bookingAdminConfig, bookingAdminDelete, bookingAdminInvite, bookingAdminInvitees, bookingAdminList, bookingAdminSaveConfig,
  bookingAdminStatus, bookingAdminTransfer, euro, formatDeadline,
  type BookingAdminConfig, type BookingAdminRow, type BookingInvitee, type BookingStatus,
} from '../lib/booking';
import { signupAdminConfig, signupAdminSave, type SignupConfig } from '../lib/register';
import type { Player, Season, Team } from '../types';

// ===========================================================================
// Backoffice „Season 2 – Buchungen“: alle verbindlichen Buchungen (Team,
// Kontakt, Kader, Logo, Zustimmungen), Zahlung bestätigen, Kader in die Liga
// übernehmen, Vorregistrierte mit Vorab-Link anschreiben und die Landingpage
// /season2 freigeben (Einstellungen).
// ===========================================================================

type Tab = 'bookings' | 'invites' | 'settings';
const fmt = (iso: string | null | undefined) => {
  if (!iso) return '–';
  try {
    return new Date(iso).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' });
  } catch {
    return iso;
  }
};
const inp = 'w-full min-w-0 bg-white/[.05] border border-white/10 rounded-xl px-3 py-2 text-[14px] text-white placeholder-hl-faint focus:border-brand-accent-light focus:outline-none';
const STATUS: Record<BookingStatus, { label: string; cls: string; icon: typeof Clock }> = {
  pending: { label: 'Zahlung offen', cls: 'text-amber-200 bg-amber-400/10 border-amber-300/25', icon: Clock },
  paid: { label: 'Bezahlt', cls: 'text-emerald-300 bg-emerald-400/10 border-emerald-300/25', icon: CheckCircle2 },
  cancelled: { label: 'Storniert', cls: 'text-rose-300 bg-rose-500/10 border-rose-400/25', icon: Ban },
};
const PKG_LABEL = (b: BookingAdminRow) => (b.package === 'one' ? 'Eine Season' : b.earlyBird ? 'Doppelpaket · Early Bird' : 'Doppelpaket');
const isPdf = (url: string) => /\.pdf($|\?)/i.test(url);
const fullName = (r: { firstName: string; lastName: string }) => `${r.firstName} ${r.lastName}`.trim();

// Ende des Early Bird: festes Enddatum – sonst Öffnung + Tage.
function ebUntil(c: Pick<BookingAdminConfig, 'earlyBirdEnd' | 'openAt' | 'earlyBirdDays'> | null): string {
  if (!c) return '';
  if (c.earlyBirdEnd && Number.isFinite(new Date(c.earlyBirdEnd).getTime())) return new Date(c.earlyBirdEnd).toISOString();
  if (!c.openAt || !Number.isFinite(new Date(c.openAt).getTime())) return '';
  return new Date(new Date(c.openAt).getTime() + c.earlyBirdDays * 86400000).toISOString();
}

function csvDownload(name: string, rows: (string | number)[][]) {
  const esc = (v: string | number) => {
    const s = String(v ?? '');
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const blob = new Blob(['﻿' + rows.map((r) => r.map(esc).join(';')).join('\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export default function Season2BookingAdmin({
  teams, seasons, canEditClubs, onTeamsChanged,
}: {
  teams: Team[];
  seasons: Season[];
  canEditClubs: boolean;
  onTeamsChanged: () => void | Promise<void>;
}) {
  const [tab, setTab] = useState<Tab>('bookings');
  const [cfg, setCfg] = useState<BookingAdminConfig | null>(null);
  useEffect(() => {
    bookingAdminConfig().then(setCfg).catch(() => {});
  }, []);

  const link = cfg ? `${window.location.origin}/season2` : '';
  const pageState = !cfg ? '…' : cfg.published ? 'Öffentlich' : 'Entwurf (nicht öffentlich)';
  const bookState = !cfg ? '…' : !cfg.open ? 'Geschlossen' : cfg.preregOnly ? 'Nur Vorregistrierte' : 'Offen für alle';

  return (
    <div className="space-y-4">
      {/* Status auf einen Blick */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        <div className="hl-card rounded-2xl p-3 flex items-center gap-3 min-w-0">
          <span className={`shrink-0 w-9 h-9 rounded-xl grid place-items-center ${cfg?.published ? 'bg-emerald-500/15 text-emerald-300' : 'bg-white/[.06] text-hl-mute'}`}>{cfg?.published ? <Globe className="w-4 h-4" /> : <Lock className="w-4 h-4" />}</span>
          <div className="min-w-0">
            <div className="text-[10px] font-bold uppercase tracking-wide text-hl-dim">Landingpage</div>
            <div className="text-[14px] font-bold text-white truncate">{pageState}</div>
          </div>
          {link && <a href="/season2" target="_blank" rel="noreferrer" className="ml-auto shrink-0 inline-flex items-center gap-1 text-[12px] font-bold text-brand-accent-light hover:underline"><Eye className="w-3.5 h-3.5" /> Ansehen</a>}
        </div>
        <div className="hl-card rounded-2xl p-3 flex items-center gap-3 min-w-0">
          <span className={`shrink-0 w-9 h-9 rounded-xl grid place-items-center ${cfg?.open ? 'bg-emerald-500/15 text-emerald-300' : 'bg-white/[.06] text-hl-mute'}`}><Inbox className="w-4 h-4" /></span>
          <div className="min-w-0">
            <div className="text-[10px] font-bold uppercase tracking-wide text-hl-dim">Buchung</div>
            <div className="text-[14px] font-bold text-white truncate">{bookState}</div>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {([
          ['bookings', 'Buchungen', Inbox],
          ['invites', 'Vorregistrierte einladen', Send],
          ['settings', 'Einstellungen & Freigabe', Settings2],
        ] as [Tab, string, typeof Inbox][]).map(([id, label, Icon]) => (
          <button key={id} onClick={() => setTab(id)} className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12.5px] font-bold cursor-pointer transition-colors ${tab === id ? 'text-white bg-brand-accent/25 border border-brand-accent-light/40' : 'text-hl-mute bg-white/[.04] border border-transparent hover:text-white'}`}>
            <Icon className="w-3.5 h-3.5" /> {label}
          </button>
        ))}
      </div>

      {tab === 'bookings' && <BookingsTab cfg={cfg} teams={teams} seasons={seasons} canEditClubs={canEditClubs} onTeamsChanged={onTeamsChanged} />}
      {tab === 'invites' && <InvitesTab cfg={cfg} />}
      {tab === 'settings' && cfg && <SettingsTab cfg={cfg} onSaved={setCfg} />}
    </div>
  );
}

// --- Buchungen ---------------------------------------------------------------
function BookingsTab({ cfg, teams, seasons, canEditClubs, onTeamsChanged }: { cfg: BookingAdminConfig | null; teams: Team[]; seasons: Season[]; canEditClubs: boolean; onTeamsChanged: () => void | Promise<void> }) {
  const [list, setList] = useState<BookingAdminRow[] | null>(null);
  const [err, setErr] = useState('');
  const [filter, setFilter] = useState<'all' | BookingStatus | 'test'>('all');
  const [openId, setOpenId] = useState<string | null>(null);
  const load = () => {
    setErr('');
    bookingAdminList().then(setList).catch((e) => setErr(e instanceof Error ? e.message : 'Fehler beim Laden.'));
  };
  useEffect(load, []);

  const real = (list ?? []).filter((b) => !b.consents?.testMode);
  const counts = {
    all: real.length,
    paid: real.filter((b) => b.status === 'paid').length,
    pending: real.filter((b) => b.status === 'pending').length,
    test: (list ?? []).filter((b) => b.consents?.testMode).length,
  };
  const paidSum = real.filter((b) => b.status === 'paid').reduce((s, b) => s + b.priceCents, 0);
  const openSum = real.filter((b) => b.status === 'pending').reduce((s, b) => s + b.priceCents, 0);
  const shown = (list ?? []).filter((b) =>
    filter === 'all' ? !b.consents?.testMode : filter === 'test' ? b.consents?.testMode : b.status === filter && !b.consents?.testMode,
  );
  const current = list?.find((b) => b.id === openId) ?? null;

  const exportAll = () => {
    const rows: (string | number)[][] = [['Buchungsnr.', 'Status', 'Team', 'Ansprechpartner', 'E-Mail', 'Telefon', 'Paket', 'Betrag €', 'Gebucht am', 'Bezahlt am', 'Spieler', 'Nr.', 'Kapitän', 'Torwart', 'Logo', 'Test']];
    for (const b of list ?? []) {
      const base = [b.ref, STATUS[b.status].label, b.teamName, b.contactName, b.email, b.phone, PKG_LABEL(b), (b.priceCents / 100).toFixed(2).replace('.', ','), fmt(b.createdAt), fmt(b.paidAt)];
      if (b.roster.length === 0) rows.push([...base, '', '', '', '', b.logoUrl, b.consents?.testMode ? 'ja' : '']);
      for (const r of b.roster) rows.push([...base, fullName(r), r.number ?? '', r.captain ? 'ja' : '', r.keeper ? 'ja' : '', b.logoUrl, b.consents?.testMode ? 'ja' : '']);
    }
    csvDownload(`season2-buchungen-${new Date().toISOString().slice(0, 10)}.csv`, rows);
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        {[
          { id: 'all' as const, l: 'Buchungen', v: String(counts.all) },
          { id: 'paid' as const, l: `Bezahlt · ${euro(paidSum)}`, v: String(counts.paid) },
          { id: 'pending' as const, l: `Offen · ${euro(openSum)}`, v: String(counts.pending) },
          { id: 'test' as const, l: 'Testbuchungen', v: String(counts.test) },
        ].map((s) => (
          <button key={s.id} onClick={() => setFilter(s.id)} className={`hl-card rounded-2xl p-3 text-center cursor-pointer transition-all min-w-0 ${filter === s.id ? 'border-brand-accent-light/50' : ''}`} style={filter === s.id ? { boxShadow: '0 0 0 1px rgba(18,165,148,.4)' } : undefined}>
            <div className="font-display font-black text-2xl text-white tabular-nums leading-none">{s.v}</div>
            <div className="text-[10px] font-sans font-bold uppercase tracking-wide text-hl-dim mt-1 truncate">{s.l}</div>
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={load} className="flex items-center gap-1.5 text-[12px] font-bold text-hl-mute hover:text-white cursor-pointer px-3 py-2 rounded-xl bg-white/[.04]"><RefreshCw className="w-3.5 h-3.5" /> Aktualisieren</button>
        {(list?.length ?? 0) > 0 && <button onClick={exportAll} className="flex items-center gap-1.5 text-[12px] font-bold text-hl-mute hover:text-white cursor-pointer px-3 py-2 rounded-xl bg-white/[.04]"><Download className="w-3.5 h-3.5" /> CSV (alle inkl. Kader)</button>}
      </div>
      {err && <p className="text-[13px] text-rose-300">{err}</p>}
      {!list && !err && <div className="py-8 grid place-items-center"><Loader2 className="w-5 h-5 animate-spin text-hl-mute" /></div>}
      {list && shown.length === 0 && (
        <div className="hl-card rounded-2xl p-6 text-center text-[13.5px] text-hl-mute">
          {filter === 'test' ? 'Keine Testbuchungen.' : 'Noch keine Buchungen. Sobald ein Team auf /season2 bucht, erscheint es hier – mit Kader, Logo und allen Angaben.'}
        </div>
      )}
      <div className="grid grid-cols-1 gap-2">
        {shown.map((b) => {
          const st = STATUS[b.status];
          return (
            <button key={b.id} onClick={() => setOpenId(b.id)} className="hl-card rounded-2xl p-3 flex items-center gap-3 text-left cursor-pointer hover:border-white/20 transition-colors min-w-0">
              <span className="shrink-0 w-11 h-11 rounded-xl bg-white/[.05] grid place-items-center overflow-hidden">
                {b.logoUrl && !isPdf(b.logoUrl) ? <img src={b.logoUrl} alt="" className="w-full h-full object-contain" /> : b.logoUrl ? <FileText className="w-5 h-5 text-hl-mute" /> : <Users className="w-5 h-5 text-hl-faint" />}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-display font-black uppercase tracking-tight text-white text-[16px] truncate">{b.teamName}</span>
                  {b.consents?.testMode && <span className="shrink-0 text-[9.5px] font-black uppercase px-1.5 py-0.5 rounded bg-amber-400/20 text-amber-200">Test</span>}
                  {b.transferredAt && <span className="shrink-0 text-[9.5px] font-black uppercase px-1.5 py-0.5 rounded bg-brand-accent/25 text-brand-accent-light">In Liga</span>}
                </div>
                <div className="text-[12px] text-hl-mute truncate">{b.ref} · {PKG_LABEL(b)} · {b.roster.length} Spieler · {fmt(b.createdAt)}</div>
              </div>
              <div className="shrink-0 text-right">
                <div className="font-display font-black text-white text-[16px] tabular-nums">{euro(b.priceCents)}</div>
                <span className={`inline-flex items-center gap-1 mt-0.5 px-1.5 py-0.5 rounded-md border text-[10px] font-bold ${st.cls}`}><st.icon className="w-3 h-3" />{st.label}</span>
              </div>
            </button>
          );
        })}
      </div>
      <AnimatePresence>
        {current && (
          <BookingDetail
            key={current.id}
            b={current}
            cfg={cfg}
            teams={teams}
            seasons={seasons}
            canEditClubs={canEditClubs}
            onClose={() => setOpenId(null)}
            onChanged={load}
            onTeamsChanged={onTeamsChanged}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function BookingDetail({
  b, cfg, teams, seasons, canEditClubs, onClose, onChanged, onTeamsChanged,
}: {
  b: BookingAdminRow;
  cfg: BookingAdminConfig | null;
  teams: Team[];
  seasons: Season[];
  canEditClubs: boolean;
  onClose: () => void;
  onChanged: () => void;
  onTeamsChanged: () => void | Promise<void>;
}) {
  useBackClose(true, onClose);
  const [busy, setBusy] = useState('');
  const [transfer, setTransfer] = useState(false);
  const st = STATUS[b.status];
  const test = Boolean(b.consents?.testMode);

  const setStatus = async (status: BookingStatus) => {
    let notify = true;
    if (status === 'paid') {
      let warn = '';
      const until = ebUntil(cfg);
      if (b.earlyBird && cfg?.deadlineBasis === 'payment' && until && Date.now() > new Date(until).getTime()) {
        warn = `\n\nAchtung: Für den Early Bird zählt der Zahlungseingang – die Frist ist am ${formatDeadline(until)} abgelaufen.`;
      }
      if (!window.confirm(`Zahlung von ${euro(b.priceCents)} für „${b.teamName}“ als eingegangen markieren?${warn}`)) return;
      notify = window.confirm('Soll das Team jetzt die Bestätigungsmail „Ihr seid dabei!“ bekommen?\n\nOK = Mail senden · Abbrechen = ohne Mail');
    } else if (status === 'cancelled') {
      if (!window.confirm(`Buchung von „${b.teamName}“ als storniert markieren? (Es wird keine Mail verschickt.)`)) return;
    }
    setBusy(status);
    try {
      await bookingAdminStatus(b.id, status, notify);
      onChanged();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'Fehler.');
    } finally {
      setBusy('');
    }
  };
  const remove = async () => {
    if (!window.confirm(`Buchung ${b.ref} („${b.teamName}“) endgültig löschen? Das kann nicht rückgängig gemacht werden.`)) return;
    if (!test && !window.confirm('Das ist KEINE Testbuchung. Wirklich löschen?')) return;
    setBusy('delete');
    try {
      await bookingAdminDelete(b.id);
      onChanged();
      onClose();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'Fehler.');
      setBusy('');
    }
  };
  const exportRoster = () =>
    csvDownload(`kader-${b.teamName.replace(/[^\wäöüÄÖÜß-]+/g, '_')}.csv`, [
      ['Vorname', 'Nachname', 'Nr.', 'Kapitän', 'Torwart'],
      ...b.roster.map((r) => [r.firstName, r.lastName, r.number ?? '', r.captain ? 'ja' : '', r.keeper ? 'ja' : '']),
    ]);
  const Row = ({ k, v }: { k: string; v: React.ReactNode }) => (
    <div className="flex gap-3 py-2 border-b border-white/[.05] last:border-0 text-[13.5px]">
      <span className="shrink-0 w-32 text-hl-dim">{k}</span>
      <span className="min-w-0 flex-1 text-white break-words">{v}</span>
    </div>
  );

  return (
    <ModalPortal>
      <motion.div className="fixed inset-0 z-[90] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => goBackLayer()}>
        <motion.div
          onClick={(e) => e.stopPropagation()}
          className="w-full sm:max-w-2xl bg-[#0d1512] border border-white/10 rounded-t-3xl sm:rounded-3xl max-h-[92vh] overflow-y-auto"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
          initial={{ y: 40, opacity: 0, scale: 0.98 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={{ y: 40, opacity: 0, scale: 0.98 }}
          transition={{ type: 'spring', stiffness: 380, damping: 32 }}
        >
          <div className="sticky top-0 z-10 bg-[#0d1512]/95 backdrop-blur px-5 py-4 border-b border-white/10 flex items-center gap-3">
            <span className="shrink-0 w-11 h-11 rounded-xl bg-white/[.05] grid place-items-center overflow-hidden">
              {b.logoUrl && !isPdf(b.logoUrl) ? <img src={b.logoUrl} alt="" className="w-full h-full object-contain" /> : <Users className="w-5 h-5 text-hl-faint" />}
            </span>
            <div className="min-w-0 flex-1">
              <div className="font-display font-black text-white uppercase tracking-tight truncate text-[18px]">{b.teamName}</div>
              <div className="text-[12px] text-hl-mute truncate">{b.ref}{test ? ' · Testbuchung' : ''}</div>
            </div>
            <button onClick={() => goBackLayer()} className="shrink-0 p-2 rounded-xl text-hl-mute hover:text-white hover:bg-white/5 cursor-pointer" aria-label="Schließen"><X className="w-5 h-5" /></button>
          </div>

          <div className="p-5 space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[12px] font-bold ${st.cls}`}><st.icon className="w-3.5 h-3.5" />{st.label}</span>
              <span className="text-[13px] text-white font-bold">{euro(b.priceCents)} · {PKG_LABEL(b)}</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <button disabled={!!busy || b.status === 'paid'} onClick={() => setStatus('paid')} className="flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-[13px] font-bold text-white bg-emerald-600 disabled:opacity-40 cursor-pointer">
                {busy === 'paid' ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} Bezahlt
              </button>
              <button disabled={!!busy || b.status === 'pending'} onClick={() => setStatus('pending')} className="flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-[13px] font-bold text-amber-200 bg-amber-400/10 border border-amber-300/25 disabled:opacity-40 cursor-pointer">
                <Clock className="w-4 h-4" /> Offen
              </button>
              <button disabled={!!busy || b.status === 'cancelled'} onClick={() => setStatus('cancelled')} className="flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-[13px] font-bold text-rose-300 bg-rose-500/10 border border-rose-400/25 disabled:opacity-40 cursor-pointer">
                <Ban className="w-4 h-4" /> Storniert
              </button>
            </div>

            <section>
              <h4 className="text-[11px] font-mono uppercase tracking-wider text-hl-dim mb-1.5">Kontakt</h4>
              <div className="rounded-2xl bg-white/[.03] border border-white/[.06] px-3.5">
                <Row k="Ansprechpartner" v={b.contactName} />
                <Row k="E-Mail" v={<a href={`mailto:${b.email}`} className="text-brand-accent-light hover:underline break-all">{b.email}</a>} />
                <Row k="Telefon" v={<a href={`tel:${b.phone}`} className="text-brand-accent-light hover:underline">{b.phone}</a>} />
                <Row k="Gebucht am" v={fmt(b.createdAt)} />
                <Row k="Bezahlt am" v={fmt(b.paidAt)} />
                <Row k="Verwendungszweck" v={<span className="font-mono">{b.ref} {b.teamName}</span>} />
                {b.note && <Row k="Anmerkung" v={<span className="whitespace-pre-wrap">{b.note}</span>} />}
              </div>
            </section>

            <section>
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <h4 className="text-[11px] font-mono uppercase tracking-wider text-hl-dim">Kader ({b.roster.length})</h4>
                <button onClick={exportRoster} className="inline-flex items-center gap-1 text-[12px] font-bold text-hl-mute hover:text-white cursor-pointer"><Download className="w-3.5 h-3.5" /> CSV</button>
              </div>
              <div className="rounded-2xl bg-white/[.03] border border-white/[.06] divide-y divide-white/[.05]">
                {b.roster.map((r, i) => (
                  <div key={i} className="flex items-center gap-3 px-3.5 py-2 text-[13.5px] min-w-0">
                    <span className="shrink-0 w-8 text-center font-mono text-hl-mute">{r.number ?? '–'}</span>
                    <span className="min-w-0 flex-1 text-white truncate">{fullName(r)}</span>
                    {r.captain && <span className="shrink-0 inline-flex items-center gap-0.5 text-[10.5px] font-black text-amber-200"><Crown className="w-3 h-3" />C</span>}
                    {r.keeper && <span className="shrink-0 inline-flex items-center gap-0.5 text-[10.5px] font-black text-sky-300"><Hand className="w-3 h-3" />TW</span>}
                  </div>
                ))}
              </div>
              {b.roster.some((r) => r.number === null) && <p className="mt-1.5 text-[12px] text-amber-200/80">Noch nicht alle Rückennummern hinterlegt – müssen vor dem ersten Einsatz nachgereicht werden.</p>}
            </section>

            <section>
              <h4 className="text-[11px] font-mono uppercase tracking-wider text-hl-dim mb-1.5">Logo</h4>
              {b.logoUrl ? (
                <div className="flex items-center gap-3 rounded-2xl bg-white/[.03] border border-white/[.06] p-3">
                  <span className="shrink-0 w-20 h-20 rounded-xl bg-white/[.06] grid place-items-center overflow-hidden">
                    {isPdf(b.logoUrl) ? <FileText className="w-8 h-8 text-hl-mute" /> : <img src={b.logoUrl} alt="" className="w-full h-full object-contain" />}
                  </span>
                  <a href={b.logoUrl} target="_blank" rel="noreferrer" download className="inline-flex items-center gap-1.5 text-[13px] font-bold text-brand-accent-light hover:underline"><ExternalLink className="w-4 h-4" /> {isPdf(b.logoUrl) ? 'PDF öffnen' : 'Original öffnen / laden'}</a>
                </div>
              ) : <p className="text-[13px] text-hl-mute">Kein Logo hochgeladen – wird nachgereicht.</p>}
            </section>

            <section>
              <h4 className="text-[11px] font-mono uppercase tracking-wider text-hl-dim mb-1.5">Dokumentierte Zustimmung</h4>
              <div className="rounded-2xl bg-white/[.03] border border-white/[.06] px-3.5">
                <Row k="Zeitpunkt" v={fmt(b.consents?.acceptedAt)} />
                <Row k="Fassung AGB" v={b.consents?.termsVersion || '–'} />
                <Row k="Trikot-Pflicht" v={b.consents?.jerseyCheckbox ? `✓ ${b.consents.jerseyCheckbox}` : '✓'} />
                <Row k="Regelwerk" v="✓ gelesen und akzeptiert" />
                <Row k="Teilnahmebed." v={b.consents?.termsCheckbox ? `✓ ${b.consents.termsCheckbox}` : '✓'} />
                <Row k="IP / Gerät" v={<span className="text-[12px] text-hl-mute break-all">{b.consents?.ip || '–'} · {b.consents?.userAgent || '–'}</span>} />
              </div>
              {b.consents?.termsText && (
                <details className="mt-2">
                  <summary className="text-[12.5px] font-bold text-hl-mute cursor-pointer hover:text-white">Akzeptierter Wortlaut der Teilnahmebedingungen anzeigen</summary>
                  <p className="mt-2 text-[12.5px] text-hl-soft whitespace-pre-wrap bg-white/[.03] rounded-xl p-3">{b.consents.termsText}</p>
                </details>
              )}
            </section>

            <section className="rounded-2xl border border-brand-accent-light/25 bg-brand-accent/10 p-3.5">
              <div className="flex items-start gap-2.5">
                <ArrowRightLeft className="w-4 h-4 text-brand-accent-light shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1">
                  <div className="text-[13.5px] font-bold text-white">Kader in die Liga übernehmen</div>
                  <p className="text-[12.5px] text-hl-soft mt-0.5">
                    {b.transferredAt ? `Übernommen am ${fmt(b.transferredAt)}. Erneut übernehmen überschreibt den Kader des Vereins in der gewählten Saison (Fotos bleiben erhalten).` : 'Legt den Verein in der gewählten Saison an (oder aktualisiert ihn) – mit Kader, Rückennummern, Kapitän, Torwart und Logo.'}
                  </p>
                  {canEditClubs ? (
                    <button onClick={() => setTransfer(true)} className="mt-2.5 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12.5px] font-bold text-white bg-brand-accent cursor-pointer">
                      <ArrowRightLeft className="w-3.5 h-3.5" /> {b.transferredAt ? 'Erneut übernehmen' : 'Kader übernehmen'}
                    </button>
                  ) : <p className="mt-2 text-[12px] text-amber-200/80">Dafür braucht es die Berechtigung „Klubs &amp; Kader“.</p>}
                  {b.status !== 'paid' && !test && <p className="mt-2 text-[12px] text-amber-200/80">Tipp: erst übernehmen, wenn die Zahlung eingegangen ist.</p>}
                </div>
              </div>
            </section>

            <button disabled={!!busy} onClick={remove} className="w-full flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-[13px] font-bold text-rose-300 bg-rose-500/10 border border-rose-500/20 cursor-pointer disabled:opacity-40">
              <Trash2 className="w-4 h-4" /> Buchung löschen{test ? ' (Testbuchung)' : ''}
            </button>
          </div>
        </motion.div>
      </motion.div>
      <AnimatePresence>
        {transfer && <TransferDialog b={b} teams={teams} seasons={seasons} onClose={() => setTransfer(false)} onDone={async () => { await onTeamsChanged(); onChanged(); }} />}
      </AnimatePresence>
    </ModalPortal>
  );
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
function suggestShort(name: string) {
  const words = name.replace(/[^\p{L}\p{N} ]/gu, ' ').split(/\s+/).filter(Boolean);
  const s = words.length > 1 ? words.map((w) => w[0]).join('').slice(0, 4) : (words[0] ?? '').slice(0, 3);
  return s.toUpperCase();
}

function TransferDialog({ b, teams, seasons, onClose, onDone }: { b: BookingAdminRow; teams: Team[]; seasons: Season[]; onClose: () => void; onDone: () => void | Promise<void> }) {
  useBackClose(true, onClose);
  const nonCurrent = seasons.filter((s) => !s.isCurrent);
  const [seasonId, setSeasonId] = useState(() => (nonCurrent[nonCurrent.length - 1] ?? seasons[seasons.length - 1])?.id ?? '');
  const inSeason = (t: Team) => !t.seasonIds || t.seasonIds.length === 0 || t.seasonIds.includes(seasonId);
  const target = useMemo(() => teams.find((t) => inSeason(t) && norm(t.name) === norm(b.teamName)) ?? null, [teams, seasonId, b.teamName]); // eslint-disable-line react-hooks/exhaustive-deps
  // Älterer Verein mit gleichem Namen (z. B. Season 1) → Spielerfotos/Farbe übernehmen.
  const source = useMemo(() => target ?? teams.find((t) => norm(t.name) === norm(b.teamName)) ?? null, [teams, target, b.teamName]);
  const [name, setName] = useState(b.teamName);
  const [short, setShort] = useState(() => source?.shortName ?? suggestShort(b.teamName));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const roster: Player[] = useMemo(() => {
    const firstKeeper = b.roster.findIndex((r) => r.keeper);
    return b.roster.map((r, i) => {
      const n = fullName(r);
      const prev = source?.spielerliste?.find((p) => norm(p.name) === norm(n));
      const p: Player = { name: n };
      if (prev?.imageUrl) p.imageUrl = prev.imageUrl;
      if (prev?.cutoutUrl) { p.cutoutUrl = prev.cutoutUrl; p.cutoutSrc = prev.cutoutSrc; }
      if (r.number !== null) p.number = r.number;
      if (r.captain) p.captain = true;
      if (i === firstKeeper) p.goalkeeper = true;
      return p;
    });
  }, [b.roster, source]);
  const imageLogo = b.logoUrl && !isPdf(b.logoUrl) ? b.logoUrl : '';

  const run = async () => {
    if (!seasonId) return setErr('Bitte eine Saison wählen.');
    if (!name.trim() || !short.trim()) return setErr('Name und Kürzel sind Pflicht.');
    setBusy(true);
    setErr('');
    try {
      let teamId = target?.id ?? '';
      if (target) {
        await apiFetch(`/api/teams/${target.id}`, {
          method: 'PUT',
          body: JSON.stringify({ name: name.trim(), spielerliste: roster, ...(imageLogo && !target.logoUrl ? { logoUrl: imageLogo } : {}) }),
        });
      } else {
        const created = await apiFetch<Team>('/api/teams', {
          method: 'POST',
          body: JSON.stringify({
            name: name.trim(), shortName: short.trim().toUpperCase(),
            logoColor: source?.logoColor, logoIcon: source?.logoIcon,
            logoUrl: imageLogo || source?.logoUrl || '',
            spielerliste: roster, seasonIds: [seasonId],
          }),
        });
        teamId = created.id;
      }
      await bookingAdminTransfer(b.id, teamId);
      await onDone();
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Übernahme fehlgeschlagen.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <motion.div className="fixed inset-0 z-[95] bg-black/70 flex items-end sm:items-center justify-center p-0 sm:p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => goBackLayer()}>
      <motion.div onClick={(e) => e.stopPropagation()} className="w-full sm:max-w-md bg-[#0d1512] border border-white/10 rounded-t-3xl sm:rounded-3xl p-5 space-y-4 max-h-[90vh] overflow-y-auto" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 1.25rem)' }} initial={{ y: 40 }} animate={{ y: 0 }} exit={{ y: 40 }}>
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-display font-black uppercase tracking-tight text-white text-[18px]">Kader übernehmen</h3>
          <button onClick={() => goBackLayer()} className="p-2 rounded-xl text-hl-mute hover:text-white cursor-pointer" aria-label="Schließen"><X className="w-5 h-5" /></button>
        </div>
        <label className="block">
          <span className="block text-[11px] font-mono uppercase tracking-wider text-hl-dim mb-1">Saison</span>
          <select value={seasonId} onChange={(e) => setSeasonId(e.target.value)} className={inp}>
            {seasons.map((s, i) => <option key={s.id} value={s.id}>Season {i + 1}{s.label ? ` (${s.label})` : ''}{s.isCurrent ? ' · aktuell' : ''}{s.draft ? ' · Entwurf' : ''}</option>)}
          </select>
        </label>
        <div className="grid grid-cols-3 gap-2">
          <label className="block col-span-2 min-w-0">
            <span className="block text-[11px] font-mono uppercase tracking-wider text-hl-dim mb-1">Vereinsname</span>
            <input value={name} onChange={(e) => setName(e.target.value)} className={inp} />
          </label>
          <label className="block min-w-0">
            <span className="block text-[11px] font-mono uppercase tracking-wider text-hl-dim mb-1">Kürzel</span>
            <input value={short} onChange={(e) => setShort(e.target.value.toUpperCase().slice(0, 5))} disabled={!!target} className={`${inp} disabled:opacity-50`} />
          </label>
        </div>
        <div className={`rounded-xl px-3 py-2.5 text-[12.5px] ${target ? 'bg-amber-400/10 text-amber-100 border border-amber-300/25' : 'bg-white/[.04] text-hl-soft'}`}>
          {target
            ? `„${target.name}“ gibt es in dieser Saison schon – der Kader (${target.spielerliste?.length ?? 0} Spieler) wird durch die ${roster.length} gebuchten Spieler ersetzt. Vorhandene Spielerfotos bleiben bei gleichem Namen erhalten.`
            : `Neuer Verein in dieser Saison mit ${roster.length} Spielern${source ? ` – Fotos & Farbe von „${source.name}“ werden übernommen, wo die Namen passen` : ''}.`}
        </div>
        {err && <p className="text-[13px] text-rose-300">{err}</p>}
        <button disabled={busy} onClick={run} className="w-full flex items-center justify-center gap-1.5 rounded-xl py-3 text-[14px] font-bold text-white bg-brand-accent cursor-pointer disabled:opacity-50">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRightLeft className="w-4 h-4" />} Jetzt übernehmen
        </button>
      </motion.div>
    </motion.div>
  );
}

// --- Vorregistrierte einladen ---------------------------------------------
function InvitesTab({ cfg }: { cfg: BookingAdminConfig | null }) {
  const [list, setList] = useState<BookingInvitee[] | null>(null);
  const [err, setErr] = useState('');
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [kind, setKind] = useState<'team' | 'all'>('team');
  const [progress, setProgress] = useState<{ done: number; total: number; failed: number } | null>(null);
  const [copied, setCopied] = useState(false);
  const load = () => {
    setErr('');
    bookingAdminInvitees().then(setList).catch((e) => setErr(e instanceof Error ? e.message : 'Fehler beim Laden.'));
  };
  useEffect(load, []);
  const accessLink = cfg?.accessKey ? `${window.location.origin}/season2?zugang=${cfg.accessKey}` : '';
  const shown = (list ?? []).filter((p) => kind === 'all' || p.source !== 'player');
  const toggle = (e: string) => setSel((s) => { const n = new Set(s); if (n.has(e)) n.delete(e); else n.add(e); return n; });
  const running = progress !== null && progress.done < progress.total;

  const send = async () => {
    const emails = [...sel];
    if (emails.length === 0) return;
    const warn = !cfg?.open ? '\n\nHinweis: Die Buchung ist noch GESCHLOSSEN – die Teams sehen dann zwar die Seite, können aber noch nicht buchen. Erst unter „Einstellungen“ öffnen (z. B. „nur Vorregistrierte“).' : '';
    if (!window.confirm(`Einladung mit Vorab-Link an ${emails.length} Adresse(n) senden?${warn}`)) return;
    let done = 0;
    let failed = 0;
    setProgress({ done, total: emails.length, failed });
    for (let i = 0; i < emails.length; i += 10) {
      const chunk = emails.slice(i, i + 10);
      try {
        const r = await bookingAdminInvite(chunk);
        failed += r.failed.length;
      } catch {
        failed += chunk.length;
      }
      done += chunk.length;
      setProgress({ done, total: emails.length, failed });
    }
    setSel(new Set());
    load();
  };

  return (
    <div className="space-y-3">
      <div className="hl-card rounded-2xl p-3.5 space-y-2">
        <div className="flex items-center gap-2 text-[13px] font-bold text-white"><KeyRound className="w-4 h-4 text-brand-accent-light" /> Persönlicher Vorab-Link</div>
        <p className="text-[12.5px] text-hl-soft">Mit diesem Link sehen Vorregistrierte die Landingpage schon, bevor sie öffentlich ist. Er steht automatisch in der Einladungsmail.</p>
        {accessLink && (
          <button onClick={async () => { try { await navigator.clipboard.writeText(accessLink); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* egal */ } }} className="w-full flex items-center gap-2 rounded-xl bg-black/30 border border-white/10 px-3 py-2.5 text-left cursor-pointer min-w-0">
            <span className="min-w-0 flex-1 font-mono text-[12px] text-white truncate">{accessLink}</span>
            {copied ? <Check className="w-4 h-4 text-emerald-300 shrink-0" /> : <Copy className="w-4 h-4 text-hl-mute shrink-0" />}
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-xl bg-white/[.04] p-0.5">
          {([['team', 'Teams & Captains'], ['all', 'Alle inkl. Spieler']] as const).map(([id, l]) => (
            <button key={id} onClick={() => setKind(id)} className={`px-3 py-1.5 rounded-lg text-[12px] font-bold cursor-pointer ${kind === id ? 'bg-white/10 text-white' : 'text-hl-mute'}`}>{l}</button>
          ))}
        </div>
        <button onClick={() => setSel(new Set(shown.filter((p) => !p.invitedAt && !p.booking).map((p) => p.email)))} className="px-3 py-2 rounded-xl text-[12px] font-bold text-hl-mute bg-white/[.04] hover:text-white cursor-pointer">Alle noch nicht Eingeladenen</button>
        {sel.size > 0 && <button onClick={() => setSel(new Set())} className="px-3 py-2 rounded-xl text-[12px] font-bold text-hl-mute hover:text-white cursor-pointer">Auswahl leeren</button>}
        <button onClick={load} className="ml-auto flex items-center gap-1.5 text-[12px] font-bold text-hl-mute hover:text-white cursor-pointer px-3 py-2 rounded-xl bg-white/[.04]"><RefreshCw className="w-3.5 h-3.5" /></button>
      </div>

      {err && <p className="text-[13px] text-rose-300">{err}</p>}
      {!list && !err && <div className="py-8 grid place-items-center"><Loader2 className="w-5 h-5 animate-spin text-hl-mute" /></div>}
      {list && shown.length === 0 && <div className="hl-card rounded-2xl p-6 text-center text-[13.5px] text-hl-mute">Noch keine Vorregistrierungen.</div>}
      <div className="grid grid-cols-1 gap-1.5">
        {shown.map((p) => (
          <label key={p.email} className={`hl-card rounded-xl p-2.5 flex items-center gap-3 cursor-pointer min-w-0 ${sel.has(p.email) ? 'border-brand-accent-light/50' : ''}`}>
            <input type="checkbox" checked={sel.has(p.email)} onChange={() => toggle(p.email)} className="shrink-0 w-4 h-4 accent-[#12A594]" />
            <div className="min-w-0 flex-1">
              <div className="text-[13.5px] font-bold text-white truncate">{p.teamName || p.name || p.email}</div>
              <div className="text-[11.5px] text-hl-mute truncate">{p.email} · {p.source === 'team' ? 'Team' : p.source === 'player' ? 'Spieler' : 'Captain S1'}</div>
            </div>
            <div className="shrink-0 text-right text-[10.5px] font-bold">
              {p.booking ? (
                <span className={`px-1.5 py-0.5 rounded border ${STATUS[p.booking].cls}`}>{p.booking === 'paid' ? 'Bezahlt' : 'Gebucht'}</span>
              ) : p.invitedAt ? (
                <span className="text-emerald-300/90 inline-flex items-center gap-1"><Mail className="w-3 h-3" /> {fmt(p.invitedAt)}</span>
              ) : (
                <span className="text-hl-faint">nicht eingeladen</span>
              )}
            </div>
          </label>
        ))}
      </div>

      <div className="sticky bottom-0 pt-2 pb-1 bg-gradient-to-t from-[#0A1415] via-[#0A1415] to-transparent">
        <button disabled={sel.size === 0 || running} onClick={send} className="w-full flex items-center justify-center gap-2 rounded-xl py-3 text-[14px] font-bold text-white bg-brand-accent cursor-pointer disabled:opacity-40">
          {running ? <><Loader2 className="w-4 h-4 animate-spin" /> Sende … {progress!.done}/{progress!.total}</> : <><Send className="w-4 h-4" /> Einladung senden ({sel.size})</>}
        </button>
        {progress && !running && <p className="mt-1.5 text-[12px] text-center text-hl-mute">Fertig: {progress.done - progress.failed} gesendet{progress.failed ? ` · ${progress.failed} fehlgeschlagen` : ''}</p>}
      </div>
    </div>
  );
}

// --- Einstellungen & Freigabe ------------------------------------------------
const toLocalInput = (iso: string) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

function Toggle({ on, onChange, title, text }: { on: boolean; onChange: (v: boolean) => void; title: string; text: string }) {
  return (
    <button type="button" onClick={() => onChange(!on)} className={`w-full flex items-start gap-3 rounded-2xl border p-3.5 text-left cursor-pointer transition-colors ${on ? 'border-emerald-400/40 bg-emerald-500/10' : 'border-white/10 bg-white/[.03]'}`}>
      <span className={`mt-0.5 shrink-0 w-10 h-6 rounded-full p-0.5 transition-colors ${on ? 'bg-emerald-500' : 'bg-white/15'}`}>
        <motion.span className="block w-5 h-5 rounded-full bg-white" animate={{ x: on ? 16 : 0 }} transition={{ type: 'spring', stiffness: 500, damping: 30 }} />
      </span>
      <span className="min-w-0">
        <span className="block text-[14px] font-bold text-white">{title}</span>
        <span className="block text-[12.5px] text-hl-soft mt-0.5">{text}</span>
      </span>
    </button>
  );
}

function L({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block min-w-0">
      <span className="block text-[11px] font-mono uppercase tracking-wider text-hl-dim mb-1">{label}</span>
      {children}
      {hint && <span className="block text-[11.5px] text-hl-faint mt-1">{hint}</span>}
    </label>
  );
}

// Vorregistrierung (/anmeldung) an/aus – gleicher Schalter wie unter
// „Team- & Spieler-Anmeldungen", hier direkt neben der Landingpage-Freigabe.
function PreregSwitch({ published }: { published: boolean }) {
  const [sc, setSc] = useState<Omit<SignupConfig, 'turnstileSiteKey'> | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => {
    signupAdminConfig().then((r) => setSc(r.config)).catch((e) => setErr(e instanceof Error ? e.message : 'Fehler beim Laden.'));
  }, []);
  const toggle = async () => {
    if (!sc) return;
    const next = !sc.open;
    const q = next
      ? 'Vorregistrierung wieder ÖFFNEN? Dann können sich neue Teams/Spieler unverbindlich anmelden.'
      : 'Vorregistrierung SCHLIESSEN? Neue Anmeldungen sind dann nicht mehr möglich, die bestehenden bleiben erhalten.';
    if (!window.confirm(q)) return;
    setBusy(true);
    setErr('');
    try {
      await signupAdminSave({ config: { ...sc, open: next } });
      setSc({ ...sc, open: next });
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Fehler beim Speichern.');
    } finally {
      setBusy(false);
    }
  };
  const target = published ? 'die Season-2-Landingpage (/season2)' : sc?.open ? 'die Vorregistrierung (/anmeldung)' : 'nirgends – der Balken ist ausgeblendet';
  return (
    <section className="space-y-2">
      <h4 className="text-[11px] font-mono uppercase tracking-wider text-hl-dim">Vorregistrierung</h4>
      {sc ? (
        <Toggle on={sc.open} onChange={() => { if (!busy) void toggle(); }} title="Vorregistrierung offen (wirkt sofort)" text="Aus = auf /anmeldung kann sich niemand mehr neu vorregistrieren. Bestehende Vorregistrierungen bleiben erhalten und können eingeladen werden." />
      ) : !err ? <div className="py-3"><Loader2 className="w-4 h-4 animate-spin text-hl-mute" /></div> : null}
      {err && <p className="text-[12.5px] text-rose-300">{err}</p>}
      <p className="text-[12.5px] text-hl-soft">Der blaue Balken auf der Startseite führt gerade zu: <strong className="text-white">{target}</strong>.</p>
    </section>
  );
}

function SettingsTab({ cfg, onSaved }: { cfg: BookingAdminConfig; onSaved: (c: BookingAdminConfig) => void }) {
  const [c, setC] = useState<BookingAdminConfig>(cfg);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const set = (p: Partial<BookingAdminConfig>) => setC((x) => ({ ...x, ...p }));
  const dirty = JSON.stringify(c) !== JSON.stringify(cfg);
  const until = ebUntil(c);
  const ebState = !until ? 'unset' : Date.now() >= new Date(until).getTime() ? 'ended' : 'running';
  const missing = [
    !until && 'Enddatum des Early Bird',
    !c.payLinkOne && 'Zahlungslink Season 2',
    !c.payLinkTwo && 'Zahlungslink Doppelpaket',
    !c.payLinkTwoEarly && 'Zahlungslink Early Bird',
  ].filter(Boolean) as string[];

  const save = async (extra: { newKey?: boolean } = {}) => {
    if (c.open && !cfg.open && missing.length && !window.confirm(`Buchung öffnen, obwohl noch fehlt:\n• ${missing.join('\n• ')}?`)) return;
    if (c.published && !cfg.published && !window.confirm('Landingpage jetzt ÖFFENTLICH schalten? Dann sieht sie jeder unter /season2 und das Startseiten-Banner führt dorthin.')) return;
    setBusy(true);
    setMsg('');
    try {
      const saved = await bookingAdminSaveConfig({ ...c, ...extra });
      setC(saved);
      onSaved(saved);
      setMsg('Gespeichert ✓');
      setTimeout(() => setMsg(''), 2500);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Fehler beim Speichern.');
    } finally {
      setBusy(false);
    }
  };
  const euroInput = (key: 'priceOne' | 'priceTwo' | 'priceTwoEarly') => (
    <input type="number" min={0} step={1} inputMode="decimal" value={c[key] / 100} onChange={(e) => set({ [key]: Math.round(Number(e.target.value) * 100) || 0 } as Partial<BookingAdminConfig>)} className={inp} />
  );

  return (
    <div className="space-y-5">
      <PreregSwitch published={cfg.published} />
      <section className="space-y-2">
        <h4 className="text-[11px] font-mono uppercase tracking-wider text-hl-dim">Freigabe Landingpage &amp; Buchung</h4>
        <Toggle on={c.published} onChange={(v) => set({ published: v })} title="Landingpage öffentlich" text="Aus = Besucher sehen „Noch nicht veröffentlicht“. Admins und Vorregistrierte mit Vorab-Link sehen die Seite trotzdem. An = jeder sieht /season2, das Startseiten-Banner führt dorthin." />
        <Toggle on={c.open} onChange={(v) => set({ open: v })} title="Verbindliche Buchung geöffnet" text="Aus = Buchen nicht möglich (Admins können als Testbuchung ausprobieren)." />
        <Toggle on={c.preregOnly} onChange={(v) => set({ preregOnly: v })} title="Nur für Vorregistrierte" text="An = nur E-Mail-Adressen aus der Vorregistrierung (und Season-1-Captains) können buchen. Später ausschalten, um für alle zu öffnen." />
      </section>

      <section className="space-y-3">
        <h4 className="text-[11px] font-mono uppercase tracking-wider text-hl-dim">Early Bird</h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <L label="Early Bird endet am" hint="Ab diesem Zeitpunkt gilt automatisch der normale Preis.">
            <input type="datetime-local" value={toLocalInput(c.earlyBirdEnd)} onChange={(e) => set({ earlyBirdEnd: e.target.value ? new Date(e.target.value).toISOString() : '' })} className={inp} />
          </L>
          <L label="Offizielle Öffnung (optional)" hint={c.earlyBirdEnd ? 'Nur zur Info.' : `Ohne Enddatum: Early Bird = ${c.earlyBirdDays} Tage ab Öffnung.`}>
            <input type="datetime-local" value={toLocalInput(c.openAt)} onChange={(e) => set({ openAt: e.target.value ? new Date(e.target.value).toISOString() : '' })} className={inp} />
          </L>
        </div>
        <div className={`rounded-xl border px-3 py-2.5 text-[12.5px] leading-relaxed ${ebState === 'running' ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-100' : ebState === 'ended' ? 'border-white/10 bg-white/[.04] text-hl-soft' : 'border-amber-300/25 bg-amber-400/10 text-amber-100'}`}>
          {ebState === 'running' && <><strong>Early Bird läuft</strong> bis {formatDeadline(until)} – so steht es auf der Seite und in der Einladungsmail.</>}
          {ebState === 'ended' && <><strong>Early Bird ist vorbei</strong> (seit {formatDeadline(until)}). Die Seite zeigt automatisch {euro(c.priceTwo)} für zwei Seasons.</>}
          {ebState === 'unset' && <><strong>Noch kein Enddatum.</strong> Ohne Enddatum gibt es keinen Early-Bird-Preis – zwei Seasons kosten dann {euro(c.priceTwo)}.</>}
          <div className="mt-1.5 text-[12px] opacity-80">
            Läuft automatisch ab: Danach zeigt die Website den normalen Preis und neue Buchungen bekommen den {euro(c.priceTwo)}-Link. Ihr bekommt 24 Std. vorher und beim Ablauf eine Erinnerungsmail – dann bitte den {euro(c.priceTwoEarly)}-Link beim Zahlungsanbieter (PayPal/Revolut) deaktivieren.
          </div>
        </div>
        <L label="Was zählt für die Frist?">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {([['booking', 'Buchungsabschluss'], ['payment', 'Zahlungseingang']] as const).map(([id, l]) => (
              <button key={id} type="button" onClick={() => set({ deadlineBasis: id })} className={`rounded-xl py-2.5 text-[13px] font-bold cursor-pointer ${c.deadlineBasis === id ? 'bg-brand-accent text-white' : 'bg-white/[.05] text-hl-mute'}`}>{l}</button>
            ))}
          </div>
        </L>
      </section>

      <section className="space-y-3">
        <h4 className="text-[11px] font-mono uppercase tracking-wider text-hl-dim">Preise &amp; Zahlungslinks (PayPal, Revolut …)</h4>
        <div className="grid grid-cols-3 gap-2">
          <L label="Eine Season €">{euroInput('priceOne')}</L>
          <L label="Doppelpaket €">{euroInput('priceTwo')}</L>
          <L label="Early Bird €">{euroInput('priceTwoEarly')}</L>
        </div>
        <p className="text-[12px] text-hl-soft leading-relaxed">
          Je Preis ein Link mit <strong className="text-white">genau diesem Betrag</strong>. PayPal: <span className="font-mono text-white">https://paypal.me/EUERNAME/550EUR</span> – der Betrag steht hinten im Link und ist dann vorausgefüllt. Später geht genauso ein Revolut-Zahlungslink. Die Teams sehen nur „Jetzt bezahlen“, keinen Anbieternamen.
        </p>
        <L label={`Link Eine Season (${euro(c.priceOne)})`}><input value={c.payLinkOne} onChange={(e) => set({ payLinkOne: e.target.value })} placeholder={`https://paypal.me/…/${c.priceOne / 100}EUR`} className={inp} /></L>
        <L label={`Link Doppelpaket (${euro(c.priceTwo)})`}><input value={c.payLinkTwo} onChange={(e) => set({ payLinkTwo: e.target.value })} placeholder={`https://paypal.me/…/${c.priceTwo / 100}EUR`} className={inp} /></L>
        <L label={`Link Doppelpaket · Early Bird (${euro(c.priceTwoEarly)})`}><input value={c.payLinkTwoEarly} onChange={(e) => set({ payLinkTwoEarly: e.target.value })} placeholder={`https://paypal.me/…/${c.priceTwoEarly / 100}EUR`} className={inp} /></L>
      </section>

      <section className="space-y-3">
        <h4 className="text-[11px] font-mono uppercase tracking-wider text-hl-dim">Allgemein</h4>
        <div className="grid grid-cols-2 gap-2">
          <L label="Saison-Name"><input value={c.seasonLabel} onChange={(e) => set({ seasonLabel: e.target.value })} className={inp} /></L>
          <L label="Start-Info"><input value={c.startInfo} onChange={(e) => set({ startInfo: e.target.value })} className={inp} /></L>
          <L label="Kader min."><input type="number" min={1} max={30} value={c.minSquad} onChange={(e) => set({ minSquad: Number(e.target.value) || 1 })} className={inp} /></L>
          <L label="Kader max."><input type="number" min={1} max={40} value={c.maxSquad} onChange={(e) => set({ maxSquad: Number(e.target.value) || 1 })} className={inp} /></L>
        </div>
      </section>

      <section className="space-y-3">
        <h4 className="text-[11px] font-mono uppercase tracking-wider text-hl-dim">Regelwerk &amp; Teilnahmebedingungen</h4>
        <L label="Fassung der Teilnahmebedingungen" hint="Bei jeder inhaltlichen Änderung hochzählen (z. B. „v2 · geprüft 03/2027“) – wird mit jeder Zustimmung gespeichert."><input value={c.termsVersion} onChange={(e) => set({ termsVersion: e.target.value })} className={inp} /></L>
        <L label="Teilnahmebedingungen (Volltext)" hint="Überschrift = eigene Zeile, darunter der Absatz. Absätze mit Leerzeile trennen."><textarea value={c.terms} onChange={(e) => set({ terms: e.target.value })} rows={10} className={`${inp} font-mono text-[12.5px]`} /></L>
        <L label="Regelwerk (Volltext)"><textarea value={c.rules} onChange={(e) => set({ rules: e.target.value })} rows={10} className={`${inp} font-mono text-[12.5px]`} /></L>
      </section>

      <section className="space-y-2">
        <h4 className="text-[11px] font-mono uppercase tracking-wider text-hl-dim">Vorab-Link</h4>
        <p className="text-[12.5px] text-hl-soft break-all">{window.location.origin}/season2?zugang=<span className="font-mono text-white">{c.accessKey}</span></p>
        <button type="button" onClick={() => { if (window.confirm('Neuen Vorab-Link erzeugen? Der alte Link funktioniert danach nicht mehr.')) void save({ newKey: true }); }} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12px] font-bold text-hl-mute bg-white/[.04] hover:text-white cursor-pointer"><KeyRound className="w-3.5 h-3.5" /> Neuen Link erzeugen</button>
      </section>

      {missing.length > 0 && (
        <div className="rounded-xl border border-amber-300/25 bg-amber-400/10 px-3 py-2.5 text-[12.5px] text-amber-100">
          Vor dem Öffnen noch festlegen: {missing.join(' · ')}.
        </div>
      )}
      <div className="sticky bottom-0 pt-2 pb-1 bg-gradient-to-t from-[#0A1415] via-[#0A1415] to-transparent flex items-center gap-3">
        <button disabled={busy || !dirty} onClick={() => save()} className="flex-1 flex items-center justify-center gap-1.5 rounded-xl py-3 text-[14px] font-bold text-white bg-brand-accent cursor-pointer disabled:opacity-40">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Speichern
        </button>
        {msg && <span className="shrink-0 text-[12.5px] text-emerald-300">{msg}</span>}
      </div>
      <p className="text-[11.5px] text-hl-faint">Die Teilnahmebedingungen sind ein Entwurf – vor der Freischaltung bitte rechtlich prüfen lassen.</p>
    </div>
  );
}
