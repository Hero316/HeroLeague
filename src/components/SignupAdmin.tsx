import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Users, Trophy, Mail, Phone, Trash2, X, ChevronRight, Settings2, Plus, Save,
  Loader2, ShieldCheck, RefreshCw, Download, User,
} from 'lucide-react';
import { ModalPortal } from './ui';
import { useBackClose } from '../lib/backStack';
import {
  signupAdminList, signupAdminDetail, signupAdminDelete, signupAdminConfig, signupAdminSave,
  type SignupListItem, type SignupDetail, type Captain, type SignupConfig,
} from '../lib/register';

const LEVEL_LABEL: Record<string, string> = { hobby: 'Hobby', mixed: 'Gemischt', ambitioniert: 'Ambitioniert' };
const ROSTER_LABEL: Record<string, string> = { same: 'Bleibt gleich', minor: 'Kleine Änderungen', major: 'Großer Umbruch' };
const POS_LABEL: Record<string, string> = { tor: 'Tor', abwehr: 'Abwehr', mittelfeld: 'Mittelfeld', sturm: 'Sturm', flexibel: 'Flexibel' };
const FOOT_LABEL: Record<string, string> = { links: 'Links', rechts: 'Rechts', beid: 'Beidfüßig' };
const FREQ_LABEL: Record<string, string> = { selten: 'Selten', monatlich: 'Monatlich', woechentlich: 'Wöchentlich', mehrmals: 'Mehrmals/Woche' };
const RATING_LABEL: Record<string, string> = { technik: 'Technik', ausdauer: 'Ausdauer', tempo: 'Schnelligkeit', uebersicht: 'Übersicht', abschluss: 'Abschluss' };
const fmtDate = (iso: string) => { try { return new Date(iso).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }); } catch { return iso; } };
const inp = 'w-full bg-white/[.05] border border-white/10 rounded-xl px-3 py-2 text-[14px] text-white placeholder-hl-faint focus:border-brand-accent-light focus:outline-none';

// Detail-Overlay: alle Antworten einer Anmeldung.
function DetailModal({ id, onClose, onDeleted }: { id: string; onClose: () => void; onDeleted: () => void }) {
  const [d, setD] = useState<SignupDetail | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);
  useBackClose(true, onClose);
  useEffect(() => { signupAdminDetail(id).then(setD).catch(() => onClose()); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const isPlayer = d?.entry === 'player';
  const rows: [string, string][] = !d ? [] : isPlayer ? [
    ['Name', d.data.name || d.contactName],
    ['E-Mail', d.email],
    ['Handynummer', d.data.phone || '–'],
    ['Alter', d.data.age != null ? String(d.data.age) : '–'],
    ['Typ', d.kind === 'verein' ? 'Vereinsspieler' : 'Hobby-Kicker'],
    ['Position', POS_LABEL[d.data.position || ''] || '–'],
    ['Starker Fuß', FOOT_LABEL[d.data.foot || ''] || '–'],
    ...(d.kind === 'verein' ? [
      ['Verein', d.data.club || '–'] as [string, string],
      ['Spielklasse', d.data.league || '–'] as [string, string],
    ] : [
      ['Jahre Erfahrung', d.data.years != null ? String(d.data.years) : '–'] as [string, string],
      ['Spielt', FREQ_LABEL[d.data.frequency || ''] || '–'] as [string, string],
    ]),
    ['Angemeldet am', fmtDate(d.createdAt)],
  ] : [
    ['Team', d.data.teamName || d.teamName],
    ['Ansprechpartner', d.data.contactName || d.contactName],
    ['E-Mail', d.email],
    ['Handynummer', d.data.phone || '–'],
    ['Art', d.kind === 'returning' ? 'Bestehendes Team (Season 1)' : 'Neues Team'],
    ...(d.kind === 'returning' ? [
      ['Season-1-Team', d.data.s1TeamName || '–'] as [string, string],
      ['Teamname behalten', d.data.keepName ? 'Ja' : 'Nein'] as [string, string],
      ['Kader', ROSTER_LABEL[d.data.rosterChange || ''] || '–'] as [string, string],
    ] : []),
    ['Geplante Kadergröße', d.data.squadSize != null ? String(d.data.squadSize) : '–'],
    ['Durchschnittsalter', d.data.avgAge || '–'],
    ['Ausrichtung', LEVEL_LABEL[d.data.level || ''] || '–'],
    ['Spieler im Verein', d.data.clubPlayers != null ? String(d.data.clubPlayers) : '–'],
    ['Nur Hobby', d.data.hobbyPlayers != null ? String(d.data.hobbyPlayers) : '–'],
    ['Angemeldet am', fmtDate(d.createdAt)],
  ];
  const ratings = isPlayer && d?.data.ratings ? Object.entries(d.data.ratings).filter(([, v]) => v != null) : [];

  return (
    <ModalPortal>
      <motion.div className="fixed inset-0 z-[90] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
        <motion.div onClick={(e) => e.stopPropagation()} className="w-full sm:max-w-lg bg-[#0d1512] border border-white/10 rounded-t-3xl sm:rounded-3xl max-h-[90vh] overflow-y-auto"
          initial={{ y: 40, opacity: 0, scale: .98 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: 40, opacity: 0, scale: .98 }} transition={{ type: 'spring', stiffness: 380, damping: 32 }}>
          <div className="sticky top-0 bg-[#0d1512]/95 backdrop-blur px-5 py-4 border-b border-white/10 flex items-center justify-between">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="w-9 h-9 rounded-xl grid place-items-center shrink-0 text-white" style={{ background: isPlayer ? 'linear-gradient(135deg,#3B2E86,#6D5DE6)' : 'linear-gradient(135deg,#0C7A70,#12A594)' }}>{isPlayer ? <User className="w-4 h-4" /> : d?.kind === 'returning' ? <Trophy className="w-4 h-4" /> : <Users className="w-4 h-4" />}</span>
              <div className="min-w-0">
                <div className="font-display font-black text-white uppercase tracking-tight truncate">{(isPlayer ? d?.data.name : d?.teamName) || d?.contactName || 'Anmeldung'}</div>
                <div className="text-[12px] text-hl-mute truncate">{isPlayer ? (d?.kind === 'verein' ? 'Vereinsspieler' : 'Hobby-Kicker') : d?.contactName}</div>
              </div>
            </div>
            <button onClick={onClose} className="p-2 rounded-lg text-hl-mute hover:text-white hover:bg-white/10 cursor-pointer shrink-0"><X className="w-5 h-5" /></button>
          </div>

          {!d ? <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-hl-mute" /></div> : (
            <div className="p-5 space-y-4">
              <div className="rounded-2xl border border-white/10 divide-y divide-white/[.06]">
                {rows.map(([k, v]) => (
                  <div key={k} className="flex items-start justify-between gap-3 px-4 py-2.5">
                    <span className="text-[12px] text-hl-dim shrink-0">{k}</span>
                    <span className="text-[14px] text-white text-right font-medium break-words">{v}</span>
                  </div>
                ))}
              </div>
              {ratings.length > 0 && (
                <div>
                  <div className="text-[11px] font-mono uppercase tracking-wider text-hl-dim mb-2">Selbsteinschätzung</div>
                  <div className="space-y-2">
                    {ratings.map(([k, v]) => (
                      <div key={k} className="flex items-center gap-3">
                        <span className="text-[13px] text-hl-soft w-28 shrink-0">{RATING_LABEL[k] || k}</span>
                        <div className="flex-1 h-2 rounded-full overflow-hidden bg-white/10"><div className="h-full rounded-full" style={{ width: `${(Number(v) / 10) * 100}%`, background: 'linear-gradient(90deg,#0C7A70,#12A594)' }} /></div>
                        <span className="text-[13px] font-black tabular-nums text-white w-10 text-right">{v}<span className="text-hl-faint font-normal">/10</span></span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {d.data.motivation && (
                <div>
                  <div className="text-[11px] font-mono uppercase tracking-wider text-hl-dim mb-1.5">{isPlayer ? 'Warum ein Team ihn nehmen sollte' : 'Motivation'}</div>
                  <p className="text-[14px] text-hl-soft leading-relaxed bg-white/[.03] border border-white/[.06] rounded-xl p-3 whitespace-pre-wrap break-words">{d.data.motivation}</p>
                </div>
              )}
              <div className="flex gap-2 pt-1">
                <a href={`mailto:${d.email}`} className="flex-1 flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-[13px] font-bold text-brand-accent-light bg-brand-accent-light/10 border border-brand-accent-light/25 cursor-pointer"><Mail className="w-4 h-4" /> E-Mail</a>
                {d.data.phone && <a href={`tel:${d.data.phone}`} className="flex-1 flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-[13px] font-bold text-white bg-white/[.06] border border-white/10 cursor-pointer"><Phone className="w-4 h-4" /> Anrufen</a>}
              </div>
              {confirmDel ? (
                <div className="flex gap-2">
                  <button onClick={async () => { await signupAdminDelete(id).catch(() => {}); onDeleted(); onClose(); }} className="flex-1 rounded-xl py-2.5 text-[13px] font-bold text-white bg-rose-600 cursor-pointer">Wirklich löschen</button>
                  <button onClick={() => setConfirmDel(false)} className="flex-1 rounded-xl py-2.5 text-[13px] font-bold text-hl-mute bg-white/[.06] cursor-pointer">Abbrechen</button>
                </div>
              ) : (
                <button onClick={() => setConfirmDel(true)} className="w-full flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-[13px] font-bold text-rose-300 bg-rose-500/10 border border-rose-500/20 cursor-pointer"><Trash2 className="w-4 h-4" /> Anmeldung löschen</button>
              )}
            </div>
          )}
        </motion.div>
      </motion.div>
    </ModalPortal>
  );
}

export default function SignupAdmin() {
  const [list, setList] = useState<SignupListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [showConfig, setShowConfig] = useState(false);

  // Config-State
  const [cfg, setCfg] = useState<Omit<SignupConfig, 'turnstileSiteKey'> | null>(null);
  const [captains, setCaptains] = useState<Captain[]>([]);
  const [turnstileActive, setTurnstileActive] = useState(false);
  const [savingCfg, setSavingCfg] = useState(false);
  const [savedCfg, setSavedCfg] = useState(false);

  const load = () => { setLoading(true); signupAdminList().then(setList).catch(() => setList([])).finally(() => setLoading(false)); };
  useEffect(() => { load(); }, []);
  const loadCfg = () => signupAdminConfig().then((r) => { setCfg(r.config); setCaptains(r.captains); setTurnstileActive(r.turnstileActive); }).catch(() => {});
  useEffect(() => { if (showConfig && !cfg) loadCfg(); }, [showConfig]); // eslint-disable-line react-hooks/exhaustive-deps

  const [filter, setFilter] = useState<'all' | 'team' | 'player'>('all');
  const teamsCount = useMemo(() => list.filter((s) => s.entry !== 'player').length, [list]);
  const playersCount = useMemo(() => list.filter((s) => s.entry === 'player').length, [list]);
  const filtered = useMemo(() => list.filter((s) => filter === 'all' || s.entry === filter || (filter === 'team' && s.entry !== 'player')), [list, filter]);

  const saveConfig = async () => {
    if (!cfg) return;
    setSavingCfg(true);
    try {
      await signupAdminSave({ config: cfg, captains: captains.filter((c) => c.email.trim()) });
      setSavedCfg(true); setTimeout(() => setSavedCfg(false), 2000);
    } catch { /* ignore */ } finally { setSavingCfg(false); }
  };

  const exportCsv = () => {
    const head = ['Typ', 'Name/Team', 'Ansprechpartner', 'E-Mail', 'Detail', 'Angemeldet'];
    const lines = filtered.map((s) => [
      s.entry === 'player' ? 'Spieler' : 'Team',
      s.entry === 'player' ? s.contactName : s.teamName,
      s.contactName, s.email,
      s.entry === 'player' ? (s.kind === 'verein' ? 'Verein' : 'Hobby') : (s.kind === 'returning' ? 'Bestehend' : 'Neu'),
      fmtDate(s.createdAt),
    ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','));
    const blob = new Blob(['﻿' + [head.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'season2-anmeldungen.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      {/* Kopf mit Zählern (als Filter) */}
      <div className="grid grid-cols-3 gap-2.5">
        {([{ id: 'all', l: 'Gesamt', v: list.length }, { id: 'team', l: 'Teams', v: teamsCount }, { id: 'player', l: 'Spieler', v: playersCount }] as const).map((s) => (
          <button key={s.id} onClick={() => setFilter(s.id)} className={`hl-card rounded-2xl p-3 text-center cursor-pointer transition-all ${filter === s.id ? 'border-brand-accent-light/50' : ''}`} style={filter === s.id ? { boxShadow: '0 0 0 1px rgba(18,165,148,.4)' } : undefined}>
            <div className="font-display font-black text-2xl text-white tabular-nums leading-none">{s.v}</div>
            <div className="text-[10px] font-sans font-bold uppercase tracking-wide text-hl-dim mt-1">{s.l}</div>
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <button onClick={load} className="flex items-center gap-1.5 text-[12px] font-bold text-hl-mute hover:text-white cursor-pointer px-3 py-2 rounded-xl bg-white/[.04]"><RefreshCw className="w-3.5 h-3.5" /> Aktualisieren</button>
        {list.length > 0 && <button onClick={exportCsv} className="flex items-center gap-1.5 text-[12px] font-bold text-hl-mute hover:text-white cursor-pointer px-3 py-2 rounded-xl bg-white/[.04]"><Download className="w-3.5 h-3.5" /> CSV</button>}
        <button onClick={() => setShowConfig((v) => !v)} className={`ml-auto flex items-center gap-1.5 text-[12px] font-bold cursor-pointer px-3 py-2 rounded-xl ${showConfig ? 'text-brand-accent-light bg-brand-accent-light/10' : 'text-hl-mute bg-white/[.04] hover:text-white'}`}><Settings2 className="w-3.5 h-3.5" /> Einstellungen</button>
      </div>

      {/* Einstellungen + Captains */}
      <AnimatePresence>
        {showConfig && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <div className="hl-card rounded-2xl p-4 space-y-4">
              {!cfg ? <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-hl-mute" /></div> : (
                <>
                  <label className="flex items-center justify-between gap-3">
                    <span className="text-[14px] font-semibold text-white">Anmeldung geöffnet</span>
                    <button onClick={() => setCfg({ ...cfg, open: !cfg.open })} className={`relative w-12 h-7 rounded-full transition-colors cursor-pointer ${cfg.open ? 'bg-brand-accent' : 'bg-white/15'}`}>
                      <span className={`absolute top-1 w-5 h-5 rounded-full bg-white transition-all ${cfg.open ? 'left-6' : 'left-1'}`} />
                    </button>
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block"><span className="block text-[11px] font-mono uppercase tracking-wider text-hl-dim mb-1">Season-Label</span><input value={cfg.seasonLabel} onChange={(e) => setCfg({ ...cfg, seasonLabel: e.target.value })} className={inp} /></label>
                    <label className="block"><span className="block text-[11px] font-mono uppercase tracking-wider text-hl-dim mb-1">Start-Info</span><input value={cfg.startInfo} onChange={(e) => setCfg({ ...cfg, startInfo: e.target.value })} className={inp} /></label>
                    <label className="block"><span className="block text-[11px] font-mono uppercase tracking-wider text-hl-dim mb-1">Min. Kader</span><input type="number" value={cfg.minSquad} onChange={(e) => setCfg({ ...cfg, minSquad: Number(e.target.value) })} className={inp} /></label>
                    <label className="block"><span className="block text-[11px] font-mono uppercase tracking-wider text-hl-dim mb-1">Max. Kader</span><input type="number" value={cfg.maxSquad} onChange={(e) => setCfg({ ...cfg, maxSquad: Number(e.target.value) })} className={inp} /></label>
                  </div>
                  <label className="block"><span className="block text-[11px] font-mono uppercase tracking-wider text-hl-dim mb-1">Hinweis (unverbindlich)</span><textarea value={cfg.note} onChange={(e) => setCfg({ ...cfg, note: e.target.value })} rows={3} className={`${inp} resize-none`} /></label>

                  <div className="rounded-xl bg-white/[.03] border border-white/[.06] px-3 py-2 flex items-center gap-2 text-[12px]">
                    <ShieldCheck className={`w-4 h-4 ${turnstileActive ? 'text-brand-accent-light' : 'text-hl-faint'}`} />
                    <span className="text-hl-mute">Captcha (Turnstile): <strong className={turnstileActive ? 'text-brand-accent-light' : 'text-hl-mute'}>{turnstileActive ? 'aktiv' : 'aus (Keys in Vercel setzen)'}</strong></span>
                  </div>

                  {/* Captains */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[13px] font-bold text-white flex items-center gap-1.5"><Trophy className="w-4 h-4 text-brand-accent-light" /> Season-1-Captains</span>
                      <button onClick={() => setCaptains([...captains, { email: '', teamName: '' }])} className="flex items-center gap-1 text-[12px] font-bold text-brand-accent-light cursor-pointer"><Plus className="w-3.5 h-3.5" /> Hinzufügen</button>
                    </div>
                    <p className="text-[11px] text-hl-faint mb-2">E-Mail + Season-1-Teamname. Damit erkennt das Formular bestehende Teams.</p>
                    <div className="space-y-2">
                      {captains.map((c, i) => (
                        <div key={i} className="flex gap-2">
                          <input value={c.email} onChange={(e) => setCaptains(captains.map((x, j) => j === i ? { ...x, email: e.target.value } : x))} placeholder="captain@mail.de" className={`${inp} flex-1`} />
                          <input value={c.teamName} onChange={(e) => setCaptains(captains.map((x, j) => j === i ? { ...x, teamName: e.target.value } : x))} placeholder="Teamname" className={`${inp} flex-1`} />
                          <button onClick={() => setCaptains(captains.filter((_, j) => j !== i))} className="p-2 rounded-lg text-rose-300 hover:bg-rose-500/10 cursor-pointer shrink-0"><Trash2 className="w-4 h-4" /></button>
                        </div>
                      ))}
                      {captains.length === 0 && <p className="text-[12px] text-hl-faint text-center py-2">Noch keine Captains hinterlegt.</p>}
                    </div>
                  </div>

                  <button onClick={saveConfig} disabled={savingCfg} className="w-full flex items-center justify-center gap-2 rounded-xl py-3 text-[14px] font-display font-black uppercase tracking-wide text-white cursor-pointer disabled:opacity-50" style={{ background: 'linear-gradient(135deg,#0C7A70,#12A594)' }}>
                    {savingCfg ? <Loader2 className="w-4 h-4 animate-spin" /> : savedCfg ? <>Gespeichert ✓</> : <><Save className="w-4 h-4" /> Speichern</>}
                  </button>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Liste */}
      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-hl-mute" /></div>
      ) : filtered.length === 0 ? (
        <div className="hl-card rounded-2xl p-8 text-center">
          <Users className="w-8 h-8 mx-auto text-hl-faint mb-2" />
          <p className="text-[14px] text-hl-mute">Noch keine {filter === 'player' ? 'Spieler' : filter === 'team' ? 'Team-Anmeldungen' : 'Anmeldungen'}.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((s) => {
            const player = s.entry === 'player';
            const badge = player ? (s.kind === 'verein' ? 'Verein' : 'Hobby') : (s.kind === 'returning' ? 'Bestehend' : 'Neu');
            return (
              <button key={s.id} onClick={() => setOpenId(s.id)} className="w-full text-left hl-card rounded-2xl p-3.5 flex items-center gap-3 hover:border-brand-accent-light/30 transition-colors cursor-pointer active:scale-[.99]">
                <span className="w-10 h-10 rounded-xl grid place-items-center shrink-0 text-white" style={{ background: player ? 'linear-gradient(135deg,#3B2E86,#6D5DE6)' : s.kind === 'returning' ? 'linear-gradient(135deg,#0C7A70,#12A594)' : 'linear-gradient(135deg,#2A6E66,#12A594)' }}>
                  {player ? <User className="w-5 h-5" /> : s.kind === 'returning' ? <Trophy className="w-5 h-5" /> : <Users className="w-5 h-5" />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[15px] font-semibold text-white leading-snug truncate">{(player ? s.contactName : s.teamName) || 'Ohne Namen'}</div>
                  <div className="text-[12px] text-hl-mute truncate">{player ? s.email : `${s.contactName} · ${s.email}`}</div>
                </div>
                <div className="text-right shrink-0">
                  <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${player ? 'text-[#b3a8ff] bg-[#6D5DE6]/15' : 'text-brand-accent-light bg-brand-accent-light/10'}`}>{player ? 'Spieler' : 'Team'} · {badge}</span>
                  <div className="text-[10px] text-hl-faint mt-1 font-mono">{fmtDate(s.createdAt).split(',')[0]}</div>
                </div>
                <ChevronRight className="w-4 h-4 text-hl-faint shrink-0" />
              </button>
            );
          })}
        </div>
      )}

      <AnimatePresence>
        {openId && <DetailModal id={openId} onClose={() => setOpenId(null)} onDeleted={load} />}
      </AnimatePresence>
    </div>
  );
}
