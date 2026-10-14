import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Check, CheckSquare, Copy, FileText, Gavel, Link2, ListChecks, Loader2, MessageSquareText, Sparkles, StickyNote, X } from 'lucide-react';
import type { HuddleState, MeetingSummary, TranscriptLine } from '../types';
import { huddleSummarize, huddleTranscript } from '../lib/huddle';
import { ModalPortal } from './ui';
import { goBackLayer, useBackClose } from '../lib/backStack';
import { NotesView } from './HuddleNotes';

// ===========================================================================
// Meeting-Protokoll eines Huddles (wie Notion-Meeting-Notizen):
//   • Zusammenfassung (KI, auf Knopfdruck): Action Items, Entscheidungen, Themen
//   • Transkript: wer hat wann was gesagt (jedes Gerät schreibt die eigene Stimme)
//   • Alles kopieren / Transkript kopieren / Link kopieren (/chat?protokoll=ID)
// ===========================================================================

const ACCENT = '#22DFC9';
type Tab = 'summary' | 'transcript' | 'notes';

const fmtDate = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) + ' Uhr' : '';
const mmss = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

// Farbe je Sprecher (stabil über den Namen).
// Kräftige Töne, die auf dem hellen Team-App-Grund UND dunkel gut lesbar sind.
const SPEAKER_COLORS = ['#0AA79A', '#B07D0A', '#4F6BED', '#D63D2C', '#0E9D6A', '#C41E76', '#C2650A'];
const colorOf = (name: string) => {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return SPEAKER_COLORS[h % SPEAKER_COLORS.length];
};

export function summaryToText(s: MeetingSummary, date: string): string {
  const out: string[] = [`📝 ${s.title}`];
  if (date) out.push(date);
  if (s.overview) out.push('', s.overview);
  if (s.actionItems.length) {
    out.push('', '✅ Action Items');
    for (const a of s.actionItems) out.push(`☐ ${a.task}${a.owner ? ` (${a.owner})` : ''}`);
  }
  if (s.decisions.length) {
    out.push('', '📌 Entscheidungen');
    for (const d of s.decisions) out.push(`• ${d}`);
  }
  for (const sec of s.sections) {
    out.push('', `▸ ${sec.heading}`);
    for (const p of sec.points) out.push(`• ${p}`);
  }
  return out.join('\n');
}
function transcriptToText(lines: TranscriptLine[]): string {
  if (!lines.length) return '';
  const start = new Date(lines[0].createdAt).getTime();
  return lines.map((l) => `[${mmss(new Date(l.createdAt).getTime() - start)}] ${l.userName}: ${l.text}`).join('\n');
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    window.prompt('Kopieren:', text);
    return false;
  }
}

export function ProtocolView({ huddleId, live = false }: { huddleId: string; live?: boolean }) {
  const [state, setState] = useState<HuddleState | null>(null);
  const [lines, setLines] = useState<TranscriptLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('summary');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [copied, setCopied] = useState('');
  const lastAt = useRef('');

  // Laden + (im laufenden Huddle) alle 4 s neue Zeilen nachholen.
  useEffect(() => {
    let alive = true;
    let t: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      try {
        const r = await huddleTranscript(huddleId, lastAt.current);
        if (!alive) return;
        if (r.huddle) setState(r.huddle);
        const fresh = r.transcript ?? [];
        if (fresh.length) {
          lastAt.current = fresh[fresh.length - 1].createdAt;
          setLines((l) => {
            const seen = new Set(l.map((x) => x.id));
            return [...l, ...fresh.filter((x) => !seen.has(x.id))];
          });
        }
      } catch {
        /* nächster Versuch */
      } finally {
        if (alive) setLoading(false);
      }
      if (alive && live) t = setTimeout(tick, 4000);
    };
    void tick();
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [huddleId, live]);

  const summary = state?.summary ?? null;
  const date = fmtDate(state?.startedAt);
  const hasNotes = !!state?.notes?.trim();
  const start = lines.length ? new Date(lines[0].createdAt).getTime() : 0;

  // Aufeinanderfolgende Zeilen derselben Person zu Blöcken zusammenfassen.
  const blocks = useMemo(() => {
    const out: { userName: string; at: number; texts: string[] }[] = [];
    for (const l of lines) {
      const last = out[out.length - 1];
      const at = new Date(l.createdAt).getTime();
      if (last && last.userName === l.userName && at - last.at < 90_000) last.texts.push(l.text);
      else out.push({ userName: l.userName, at, texts: [l.text] });
    }
    return out;
  }, [lines]);

  const summarize = async () => {
    setBusy(true);
    setErr('');
    try {
      const r = await huddleSummarize(huddleId);
      setState((s) => (s ? { ...s, summary: r.summary, summaryAt: r.summaryAt } : s));
      setTab('summary');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Zusammenfassen hat nicht geklappt.');
    } finally {
      setBusy(false);
    }
  };
  const flash = (k: string) => {
    setCopied(k);
    setTimeout(() => setCopied((c) => (c === k ? '' : c)), 1600);
  };
  const copyAll = async () => {
    const parts = [summary ? summaryToText(summary, date) : `📝 Huddle${date ? ` · ${date}` : ''}`];
    if (hasNotes) parts.push('', '🗒 Notizen', state!.notes);
    if (lines.length) parts.push('', '— Transkript —', transcriptToText(lines));
    if (await copyText(parts.join('\n'))) flash('all');
  };
  const copyTranscript = async () => {
    if (await copyText(transcriptToText(lines))) flash('tr');
  };
  const copyLink = async () => {
    if (await copyText(`${window.location.origin}/chat?protokoll=${encodeURIComponent(huddleId)}`)) flash('link');
  };

  if (loading) {
    return (
      <div className="grid place-items-center py-16 text-hl-mute">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  const tabs: { id: Tab; label: string; icon: typeof FileText; show: boolean }[] = [
    { id: 'summary', label: 'Zusammenfassung', icon: Sparkles, show: true },
    { id: 'transcript', label: 'Transkript', icon: MessageSquareText, show: true },
    { id: 'notes', label: 'Notizen', icon: StickyNote, show: hasNotes },
  ];

  const actionBtn = 'inline-flex items-center gap-1.5 rounded-xl border border-white/12 bg-white/[.04] px-3 py-2 text-[12.5px] font-sans font-bold text-white cursor-pointer hover:border-white/25 active:scale-95 transition';

  return (
    <div className="min-w-0">
      {/* Aktionen */}
      <div className="flex flex-wrap gap-2 mb-4">
        <button onClick={copyAll} className={actionBtn}>
          {copied === 'all' ? <Check className="w-4 h-4 text-hl-green" /> : <Copy className="w-4 h-4" />} Alles kopieren
        </button>
        {lines.length > 0 && (
          <button onClick={copyTranscript} className={actionBtn}>
            {copied === 'tr' ? <Check className="w-4 h-4 text-hl-green" /> : <MessageSquareText className="w-4 h-4" />} Transkript kopieren
          </button>
        )}
        <button onClick={copyLink} className={actionBtn}>
          {copied === 'link' ? <Check className="w-4 h-4 text-hl-green" /> : <Link2 className="w-4 h-4" />} Link kopieren
        </button>
      </div>

      {/* Reiter */}
      <div className="relative flex gap-1 p-1 rounded-2xl bg-white/[.04] border border-white/10 mb-5 overflow-x-auto [scrollbar-width:none]">
        {tabs.filter((t) => t.show).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`relative flex-1 min-w-fit inline-flex items-center justify-center gap-1.5 px-2 sm:px-3 py-2 rounded-xl text-[12.5px] sm:text-[13px] font-sans font-bold whitespace-nowrap cursor-pointer transition-colors ${tab === t.id ? 'text-[#04120d]' : 'text-hl-mute hover:text-white'}`}
          >
            {tab === t.id && (
              <motion.span layoutId="protocol-tab" className="absolute inset-0 rounded-xl" style={{ background: ACCENT }} transition={{ type: 'spring', stiffness: 450, damping: 38 }} />
            )}
            <t.icon className="relative w-4 h-4" />
            <span className="relative">{t.label}</span>
          </button>
        ))}
      </div>

      {err && <p className="mb-3 text-sm text-hl-red-soft font-sans">{err}</p>}

      <AnimatePresence mode="wait">
        <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18 }}>
          {tab === 'summary' &&
            (summary ? (
              <div className="space-y-6">
                <div>
                  <h3 className="font-display font-black uppercase text-white text-[26px] sm:text-[30px] leading-[.95] tracking-tight">{summary.title}</h3>
                  {date && <div className="mt-1.5 text-[12px] font-mono text-hl-dim">{date}</div>}
                  {summary.overview && <p className="mt-3 text-[15px] text-hl-soft font-sans leading-relaxed">{summary.overview}</p>}
                </div>
                {summary.actionItems.length > 0 && (
                  <section>
                    <h4 className="flex items-center gap-2 text-[12px] font-sans font-black uppercase tracking-[1.5px] mb-2.5 text-brand-accent-light">
                      <ListChecks className="w-4 h-4" /> Action Items
                    </h4>
                    <ul className="space-y-1.5">
                      {summary.actionItems.map((a, i) => (
                        <li key={i} className="flex items-start gap-2.5 rounded-xl bg-white/[.035] border border-white/[.07] px-3 py-2.5">
                          <CheckSquare className="w-4 h-4 mt-0.5 shrink-0 text-hl-dim" />
                          <span className="flex-1 min-w-0 text-[14.5px] text-white font-sans leading-snug">{a.task}</span>
                          {a.owner && (
                            <span className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold" style={{ background: `${colorOf(a.owner)}22`, color: colorOf(a.owner) }}>
                              {a.owner}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
                {summary.decisions.length > 0 && (
                  <section>
                    <h4 className="flex items-center gap-2 text-[12px] font-sans font-black uppercase tracking-[1.5px] mb-2.5 text-hl-gold">
                      <Gavel className="w-4 h-4" /> Entscheidungen
                    </h4>
                    <ul className="space-y-1.5">
                      {summary.decisions.map((d, i) => (
                        <li key={i} className="flex items-start gap-2.5 text-[14.5px] text-hl-soft font-sans leading-snug">
                          <span className="mt-[8px] w-1.5 h-1.5 shrink-0 rounded-full bg-[#E0A92E]" /> {d}
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
                {summary.sections.map((sec, i) => (
                  <section key={i} className="pt-4 border-t border-white/[.07]">
                    <h4 className="font-sans font-black text-white text-[16px] mb-2">{sec.heading}</h4>
                    <ul className="space-y-1.5">
                      {sec.points.map((p, j) => (
                        <li key={j} className="flex items-start gap-2.5 text-[14.5px] text-hl-soft font-sans leading-snug">
                          <span className="mt-[8px] w-1.5 h-1.5 shrink-0 rounded-full bg-[#14B8A6]" /> {p}
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-4 border-t border-white/[.07]">
                  <span className="text-[11.5px] text-hl-faint font-sans">KI-Zusammenfassung{state?.summaryAt ? ` · ${fmtDate(state.summaryAt)}` : ''} – Hörfehler möglich</span>
                  <button onClick={summarize} disabled={busy || !lines.length} className={`${actionBtn} disabled:opacity-40`}>
                    {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} Neu zusammenfassen
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-center py-8 px-2">
                <div className="mx-auto w-14 h-14 rounded-2xl grid place-items-center mb-4 bg-[#14B8A6]/15 text-brand-accent-light">
                  <Sparkles className="w-7 h-7" />
                </div>
                <h3 className="font-display font-black uppercase text-white text-[22px] leading-none">KI-Protokoll</h3>
                <p className="mt-2 text-[14px] text-hl-mute font-sans leading-relaxed max-w-sm mx-auto">
                  {lines.length
                    ? 'Aus der Mitschrift entsteht in Sekunden ein Protokoll mit Action Items, Entscheidungen und allen Themen.'
                    : live
                      ? 'Sobald gesprochen wird, erscheint hier die Mitschrift. Danach kannst du alles zusammenfassen lassen.'
                      : 'Für diesen Huddle gibt es keine Mitschrift.'}
                </p>
                {lines.length > 0 && (
                  <button
                    onClick={summarize}
                    disabled={busy}
                    className="mt-5 inline-flex items-center gap-2 rounded-2xl px-6 py-3 font-sans font-black text-[15px] text-[#04120d] cursor-pointer active:scale-95 transition disabled:opacity-60"
                    style={{ background: ACCENT }}
                  >
                    {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
                    {busy ? 'Fasse zusammen …' : 'Jetzt zusammenfassen'}
                  </button>
                )}
              </div>
            ))}

          {tab === 'transcript' &&
            (blocks.length ? (
              <div className="space-y-3.5">
                {blocks.map((b, i) => (
                  <div key={i} className="flex gap-3">
                    <span className="shrink-0 w-8 h-8 rounded-full grid place-items-center text-[12px] font-black" style={{ background: colorOf(b.userName), color: '#fff' }}>
                      {b.userName.trim().charAt(0).toUpperCase() || '?'}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <span className="font-sans font-bold text-[14px]" style={{ color: colorOf(b.userName) }}>{b.userName}</span>
                        <span className="text-[11px] font-mono text-hl-faint">{mmss(b.at - start)}</span>
                      </div>
                      <p className="text-[14.5px] text-hl-soft font-sans leading-relaxed break-words">{b.texts.join(' ')}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-hl-faint italic py-6 text-center">{live ? 'Noch nichts mitgeschrieben – einfach losreden.' : 'Keine Mitschrift vorhanden.'}</p>
            ))}

          {tab === 'notes' && hasNotes && <NotesView text={state!.notes} />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

// Vollbild-Fenster (Handy) bzw. großes Fenster (PC) mit Safe-Area.
export function ProtocolModal({ huddleId, live = false, onClose }: { huddleId: string; live?: boolean; onClose: () => void }) {
  useBackClose(true, onClose);
  return (
    <ModalPortal>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="fixed inset-0 z-[95] bg-black/70 backdrop-blur-sm flex sm:items-center justify-center sm:p-6"
        onClick={() => goBackLayer()}
      >
        <motion.div
          initial={{ y: 40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 320, damping: 32 }}
          className="hl-card hl-modal-card relative w-full sm:max-w-2xl h-full sm:h-auto sm:max-h-[88vh] flex flex-col !rounded-none sm:!rounded-3xl overflow-hidden"
          onClick={(e) => e.stopPropagation()}
          style={{ paddingTop: 'env(safe-area-inset-top)' }}
        >
          <div className="flex items-center gap-3 px-4 sm:px-6 pt-4 pb-3 border-b border-white/[.07] shrink-0">
            <span className="grid place-items-center w-9 h-9 rounded-xl shrink-0 bg-[#14B8A6]/15 text-brand-accent-light">
              <FileText className="w-5 h-5" />
            </span>
            <div className="flex-1 min-w-0">
              <div className="font-display font-black uppercase text-white text-[18px] leading-none tracking-tight">Meeting-Protokoll</div>
              <div className="text-[11.5px] text-hl-mute font-sans mt-1">{live ? 'Live – wird gerade mitgeschrieben' : 'Huddle'}</div>
            </div>
            <button onClick={() => goBackLayer()} className="p-2 rounded-full text-hl-mute hover:text-white hover:bg-white/10 cursor-pointer" aria-label="Schließen">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-5" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 1.25rem)' }}>
            <ProtocolView huddleId={huddleId} live={live} />
          </div>
        </motion.div>
      </motion.div>
    </ModalPortal>
  );
}
