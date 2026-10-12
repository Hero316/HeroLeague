import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { ImagePlus, List, ListChecks, Loader2, StickyNote, X, Eye, PenLine, Check } from 'lucide-react';
import { ModalPortal } from './ui';
import { uploadFile } from '../lib/api';

// ===========================================================================
// Huddle-Notizen: einfacher Text mit kleinen Extras – Bilder, Listen und
// Aufgaben-Häkchen. Gespeichert wird weiterhin EIN Text (kompatibel zu alten
// Notizen):
//   ![Bild](https://…)   → Bild (eigene Zeile)
//   - Punkt               → Aufzählung
//   ☐ Aufgabe / ☑ erledigt → Häkchen (im Huddle antippbar)
// ===========================================================================

const IMG_RE = /^!\[([^\]]*)\]\((https:\/\/[^\s)]+)\)\s*$/;
const TODO_RE = /^(☐|☑)\s?(.*)$/;
const BULLET_RE = /^[-•*]\s+(.*)$/;
const URL_RE = /(https?:\/\/[^\s]+)/g;

function Linkified({ text }: { text: string }) {
  const parts = text.split(URL_RE);
  return (
    <>
      {parts.map((p, i) =>
        i % 2 === 1 ? (
          <a key={i} href={p} target="_blank" rel="noopener noreferrer" className="text-[#22DFC9] underline break-all">{p}</a>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

// Lesende Darstellung (auch für alte Huddles im Chat). onToggle = Häkchen umschalten.
export function NotesView({ text, onToggle }: { text: string; onToggle?: (lineIndex: number) => void }) {
  const lines = text.split('\n');
  if (!text.trim()) return <p className="text-sm text-hl-faint italic">Noch keine Notizen.</p>;
  return (
    <div className="space-y-1.5 text-[15px] text-hl-soft font-sans leading-relaxed break-words">
      {lines.map((line, i) => {
        const img = line.match(IMG_RE);
        if (img) {
          return (
            <a key={i} href={img[2]} target="_blank" rel="noopener noreferrer" className="block py-1">
              <img src={img[2]} alt={img[1] || 'Bild'} loading="lazy" className="max-h-72 max-w-full w-auto rounded-xl border border-white/10" />
            </a>
          );
        }
        const todo = line.match(TODO_RE);
        if (todo) {
          const done = todo[1] === '☑';
          return (
            <button
              key={i}
              type="button"
              disabled={!onToggle}
              onClick={() => onToggle?.(i)}
              className={`w-full flex items-start gap-2.5 text-left ${onToggle ? 'cursor-pointer' : 'cursor-default'}`}
            >
              <span className={`mt-0.5 w-5 h-5 shrink-0 rounded-md border grid place-items-center transition-colors ${done ? 'bg-[#0C7A70] border-[#0C7A70]' : 'border-white/30'}`}>
                {done && <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />}
              </span>
              <span className={`min-w-0 ${done ? 'line-through text-hl-faint' : ''}`}><Linkified text={todo[2]} /></span>
            </button>
          );
        }
        const bullet = line.match(BULLET_RE);
        if (bullet) {
          return (
            <div key={i} className="flex items-start gap-2.5">
              <span className="mt-[9px] w-1.5 h-1.5 shrink-0 rounded-full bg-[#22DFC9]" />
              <span className="min-w-0"><Linkified text={bullet[1]} /></span>
            </div>
          );
        }
        if (!line.trim()) return <div key={i} className="h-2" />;
        return <p key={i}><Linkified text={line} /></p>;
      })}
    </div>
  );
}

// Häkchen in Zeile i umschalten.
export function toggleTodo(text: string, i: number): string {
  const lines = text.split('\n');
  const m = lines[i]?.match(TODO_RE);
  if (!m) return text;
  lines[i] = `${m[1] === '☑' ? '☐' : '☑'} ${m[2]}`;
  return lines.join('\n');
}

// Bearbeiten-Fenster im laufenden Huddle.
export function NotesSheet({
  notes, onChange, onClose, saving,
}: {
  notes: string;
  onChange: (v: string) => void;
  onClose: () => void;
  saving: boolean;
}) {
  const [mode, setMode] = useState<'write' | 'view'>(notes.trim() ? 'view' : 'write');
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState('');
  const ta = useRef<HTMLTextAreaElement | null>(null);
  const file = useRef<HTMLInputElement | null>(null);
  const notesRef = useRef(notes);
  notesRef.current = notes;

  // Textfeld wächst mit.
  useEffect(() => {
    const el = ta.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(window.innerHeight * 0.5, Math.max(180, el.scrollHeight))}px`;
  }, [notes, mode]);

  // Text an der Cursor-Position einfügen (eigene Zeile, wenn block=true).
  const insert = (snippet: string, block = false) => {
    const cur = notesRef.current;
    const el = ta.current;
    const pos = el && mode === 'write' ? el.selectionStart ?? cur.length : cur.length;
    const before = cur.slice(0, pos);
    const after = cur.slice(pos);
    const pre = block && before && !before.endsWith('\n') ? '\n' : '';
    const post = block && !after.startsWith('\n') ? '\n' : '';
    const next = before + pre + snippet + post + after;
    onChange(next);
    const caret = (before + pre + snippet + post).length;
    requestAnimationFrame(() => {
      if (!ta.current) return;
      ta.current.focus();
      ta.current.setSelectionRange(caret, caret);
    });
  };

  const addImages = async (files: File[]) => {
    const imgs = files.filter((f) => f.type.startsWith('image/'));
    if (imgs.length === 0) return;
    setUploading(true);
    setErr('');
    try {
      for (const f of imgs) {
        const { url } = await uploadFile(f);
        insert(`![Bild](${url})`, true);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Bild konnte nicht hochgeladen werden.');
    } finally {
      setUploading(false);
      if (file.current) file.current.value = '';
    }
  };

  const linePrefix = (prefix: string) => {
    if (mode !== 'write') setMode('write');
    insert(prefix, true);
  };

  const images = notes.split('\n').map((l) => l.match(IMG_RE)?.[2]).filter((u): u is string => !!u);
  const removeImage = (url: string) => {
    onChange(notes.split('\n').filter((l) => l.match(IMG_RE)?.[2] !== url).join('\n'));
  };

  return (
    <ModalPortal>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[95] bg-black/70 flex items-end sm:items-center justify-center sm:p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ y: 40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 380, damping: 32 }}
          onClick={(e) => e.stopPropagation()}
          className="hl-card hl-modal-card w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl flex flex-col max-h-[88vh]"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          {/* Kopf */}
          <div className="px-4 pt-4 pb-3 border-b border-white/10">
            <div className="flex items-center gap-2">
              <span className="w-9 h-9 rounded-xl grid place-items-center text-white shrink-0" style={{ background: 'linear-gradient(135deg,#0C7A70,#22DFC9)' }}>
                <StickyNote className="w-4 h-4" />
              </span>
              <div className="min-w-0 flex-1">
                <h4 className="font-display font-bold text-white uppercase tracking-tight leading-none">Huddle-Notizen</h4>
                <div className="text-[11px] text-hl-mute mt-1 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#22DFC9] animate-pulse" /> Live für alle im Huddle
                  <span className="text-hl-faint">· {uploading ? 'Bild lädt …' : saving ? 'Speichert …' : 'Gespeichert'}</span>
                </div>
              </div>
              <button onClick={onClose} className="p-1.5 rounded-full text-hl-mute hover:text-white hover:bg-white/10 cursor-pointer shrink-0" aria-label="Schließen"><X className="w-5 h-5" /></button>
            </div>
            {/* Werkzeuge */}
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <input ref={file} type="file" accept="image/*" multiple className="hidden" onChange={(e) => addImages([...(e.target.files ?? [])])} />
              <button type="button" onClick={() => file.current?.click()} disabled={uploading} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12.5px] font-bold text-white bg-[#0C7A70] hover:bg-[#0e8a7e] cursor-pointer disabled:opacity-60">
                {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImagePlus className="w-4 h-4" />} Bild
              </button>
              <button type="button" onClick={() => linePrefix('- ')} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12.5px] font-bold text-hl-soft bg-white/[.06] hover:bg-white/10 cursor-pointer">
                <List className="w-4 h-4" /> Liste
              </button>
              <button type="button" onClick={() => linePrefix('☐ ')} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12.5px] font-bold text-hl-soft bg-white/[.06] hover:bg-white/10 cursor-pointer">
                <ListChecks className="w-4 h-4" /> Aufgabe
              </button>
              <div className="ml-auto flex rounded-xl bg-white/[.06] p-0.5">
                <button type="button" onClick={() => setMode('write')} className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[12px] font-bold cursor-pointer ${mode === 'write' ? 'bg-white/15 text-white' : 'text-hl-mute'}`}>
                  <PenLine className="w-3.5 h-3.5" /> Schreiben
                </button>
                <button type="button" onClick={() => setMode('view')} className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[12px] font-bold cursor-pointer ${mode === 'view' ? 'bg-white/15 text-white' : 'text-hl-mute'}`}>
                  <Eye className="w-3.5 h-3.5" /> Ansicht
                </button>
              </div>
            </div>
          </div>

          {/* Inhalt */}
          <div className="flex-1 overflow-y-auto px-4 py-3">
            {mode === 'write' ? (
              <>
                <textarea
                  ref={ta}
                  value={notes}
                  onChange={(e) => onChange(e.target.value)}
                  onPaste={(e) => {
                    const files = [...e.clipboardData.files].filter((f) => f.type.startsWith('image/'));
                    if (files.length) {
                      e.preventDefault();
                      void addImages(files);
                    }
                  }}
                  autoFocus
                  placeholder={'Was wurde besprochen? To-dos, Ideen …\nTipp: Bilder einfach hier einfügen (kopieren & einfügen).'}
                  className="w-full hl-surf-0 border border-white/10 rounded-xl px-3 py-2.5 text-[15px] leading-relaxed text-white focus:outline-none focus:border-brand-accent-light resize-none"
                />
                {images.length > 0 && (
                  <div className="mt-3 grid grid-cols-3 sm:grid-cols-4 gap-2">
                    {images.map((u) => (
                      <div key={u} className="relative aspect-square rounded-xl overflow-hidden border border-white/10 bg-black/30">
                        <img src={u} alt="" className="w-full h-full object-cover" />
                        <button type="button" onClick={() => removeImage(u)} className="absolute top-1 right-1 p-1 rounded-full bg-black/60 text-white hover:bg-rose-600 cursor-pointer" aria-label="Bild entfernen">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <NotesView text={notes} onToggle={(i) => onChange(toggleTodo(notes, i))} />
            )}
            {err && <p className="mt-2 text-[12.5px] text-rose-300">{err}</p>}
          </div>
        </motion.div>
      </motion.div>
    </ModalPortal>
  );
}
