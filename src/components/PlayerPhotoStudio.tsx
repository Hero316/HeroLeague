import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Eraser, ImagePlus, Loader2, Move, RotateCcw, Undo2, X } from 'lucide-react';
import type { Player } from '../types';
import { removeBackground } from '../lib/cutout';
import { uploadImage } from '../lib/api';
import { useBackClose } from '../lib/backStack';
import { PLAYER_PHOTO_BG } from '../lib/playerPhoto';

// ===========================================================================
// Foto-Studio (Backoffice, Liga-Kader): ein ganz normales Foto auswählen → der
// Spieler wird freigestellt (KI im Browser, lib/cutout) und auf den
// Hero-League-Hintergrund gesetzt – wie bisher von Hand: Format 4:5, mittig,
// unten angeschnitten, Kopf im türkisen Lichtkegel.
// Werkzeuge in der Vorschau:
//  • Verschieben – Bild ziehen, Größe per Regler (PC zusätzlich Mausrad)
//  • Radieren – störende Personen/Reste wegwischen (Rückgängig, Alles zurück).
//    Zurück auf „Verschieben" wird der übrig gebliebene Spieler neu eingepasst.
// Erst „Übernehmen" lädt hoch (fertiges Spielerbild + Freistellung).
// „Ohne Bearbeitung hochladen" nimmt das Foto unverändert (fertige Bilder).
// ===========================================================================

const OUT_W = 800;
const OUT_H = 1000;
const PREVIEW_W = 560;
const PREVIEW_H = 700;
const HEAD_TOP = 0.13; // Abstand Kopf → oberer Rand, wie bei den handgemachten Bildern
const CUTOUT_MAX = 900; // wie lib/cutout
const SIZE_MIN = 0.7;
const SIZE_MAX = 3.5;
const UNDO_MAX = 8;

type Phase = 'cutting' | 'ready' | 'saving' | 'error';
type Tool = 'move' | 'erase';
type Pt = { x: number; y: number };
type Box = { x: number; y: number; w: number; h: number };
// box = sichtbarer Inhalt der Freistellung, headX = waagerechte Kopfmitte (beides in Freistellungs-Pixeln)
type Layout = { box: Box; headX: number };
type Cut = { work: HTMLCanvasElement; orig: ImageBitmap };

let bgPromise: Promise<HTMLImageElement> | null = null;
function loadBackground(): Promise<HTMLImageElement> {
  if (!bgPromise) {
    bgPromise = new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => {
        bgPromise = null;
        reject(new Error('Hintergrund konnte nicht geladen werden.'));
      };
      img.src = PLAYER_PHOTO_BG;
    });
  }
  return bgPromise;
}

const ctx2d = (c: HTMLCanvasElement) => c.getContext('2d', { willReadFrequently: true })!;

// Sichtbarer Inhalt + Kopfmitte (Schwerpunkt der Deckkraft im oberen Viertel des
// Inhalts) – so sitzt der Kopf mittig im Lichtkegel, auch wenn ein Arm zur Seite
// ragt. null = nichts mehr zu sehen (alles wegradiert).
function measure(c: HTMLCanvasElement): Layout | null {
  const { width: w, height: h } = c;
  const d = ctx2d(c).getImageData(0, 0, w, h).data;
  let x0 = w;
  let y0 = h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (d[(y * w + x) * 4 + 3] > 24) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return null;
  const box = { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  const yEnd = y0 + Math.max(1, Math.round(box.h * 0.25));
  let sum = 0;
  let weight = 0;
  for (let y = y0; y < yEnd; y++) {
    for (let x = x0; x <= x1; x++) {
      const a = d[(y * w + x) * 4 + 3];
      sum += a * x;
      weight += a;
    }
  }
  return { box, headX: weight > 0 ? sum / weight : x0 + box.w / 2 };
}

// Wo und wie groß die Freistellung gezeichnet wird. size = 1: Kopf bei 13 % von
// oben und unten bündig; größer: Kopf bleibt oben; kleiner: unten bündig. Dazu
// kommt das Verschieben (pan = Anteil der Bildbreite/-höhe).
function place(W: number, H: number, l: Layout, size: number, pan: Pt) {
  const s = ((H * (1 - HEAD_TOP)) / l.box.h) * size;
  const boxTop = Math.max(H * HEAD_TOP, H - l.box.h * s);
  return { x: W / 2 - l.headX * s + pan.x * W, y: boxTop - l.box.y * s + pan.y * H, s };
}

// Verschieben begrenzen: Der Spieler bleibt im Bild, und sein unterer Rand nie
// über dem Bildrand – sonst wäre mitten im Bild eine Schnittkante zu sehen.
function clampPan(l: Layout, size: number, pan: Pt): Pt {
  const W = PREVIEW_W; // gleiches Seitenverhältnis (4:5) wie das fertige Bild
  const H = PREVIEW_H;
  const b = place(W, H, l, size, { x: 0, y: 0 });
  const minY = (H - (l.box.y + l.box.h) * b.s - b.y) / H; // unterer Rand ≥ Bildrand
  const minX = (0.15 * W - (l.box.x + l.box.w) * b.s - b.x) / W; // rechter Rand nicht links von 15 %
  const maxX = (0.85 * W - l.box.x * b.s - b.x) / W; // linker Rand nicht rechts von 85 %
  return { x: Math.min(maxX, Math.max(minX, pan.x)), y: Math.max(minY, pan.y) };
}

function compose(ctx: CanvasRenderingContext2D, W: number, H: number, bg: HTMLImageElement, src: HTMLCanvasElement, l: Layout, size: number, pan: Pt) {
  ctx.clearRect(0, 0, W, H);
  ctx.drawImage(bg, 0, 0, W, H);
  const { x, y, s } = place(W, H, l, size, pan);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, x, y, src.width * s, src.height * s);
}

function canvasBlob(c: HTMLCanvasElement, quality = 0.9): Promise<Blob> {
  return new Promise((resolve, reject) => {
    c.toBlob(
      (webp) => {
        if (webp && webp.type === 'image/webp') return resolve(webp);
        c.toBlob((png) => (png ? resolve(png) : reject(new Error('Bild konnte nicht erzeugt werden.'))), 'image/png');
      },
      'image/webp',
      quality
    );
  });
}

const fileFrom = (blob: Blob, base: string) =>
  new File([blob], `${base}.${blob.type === 'image/webp' ? 'webp' : 'png'}`, { type: blob.type });

// Freistellung (nach dem Radieren) eng zuschneiden – für das Hochladen.
async function cutoutBlob(work: HTMLCanvasElement, l: Layout): Promise<Blob> {
  const pad = Math.round(Math.max(work.width, work.height) * 0.01);
  const x0 = Math.max(0, l.box.x - pad);
  const y0 = Math.max(0, l.box.y - pad);
  const x1 = Math.min(work.width, l.box.x + l.box.w + pad);
  const y1 = Math.min(work.height, l.box.y + l.box.h + pad);
  const c = document.createElement('canvas');
  c.width = x1 - x0;
  c.height = y1 - y0;
  ctx2d(c).drawImage(work, x0, y0, c.width, c.height, 0, 0, c.width, c.height);
  return canvasBlob(c);
}

export default function PlayerPhotoStudio({
  file: initialFile,
  playerName,
  onClose,
  onDone,
}: {
  file: File;
  playerName: string;
  onClose: () => void;
  onDone: (patch: Partial<Player>) => void;
}) {
  const [file, setFile] = useState(initialFile);
  const [phase, setPhase] = useState<Phase>('cutting');
  const [err, setErr] = useState('');
  const [cut, setCut] = useState<Cut | null>(null);
  const [bg, setBg] = useState<HTMLImageElement | null>(null);
  const [layout, setLayout] = useState<Layout | null>(null);
  const [size, setSize] = useState(1);
  const [pan, setPan] = useState<Pt>({ x: 0, y: 0 });
  const [tool, setTool] = useState<Tool>('move');
  const [brush, setBrush] = useState(44); // Pinsel-Durchmesser in Vorschau-Pixeln
  const [cursor, setCursor] = useState<Pt | null>(null);
  const [version, setVersion] = useState(0); // neu zeichnen nach dem Radieren
  const [undoCount, setUndoCount] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const undoRef = useRef<ImageData[]>([]);
  const dragRef = useRef<{ start: Pt; pan0: Pt } | null>(null);
  const strokeRef = useRef<Pt | null>(null);
  const erasedRef = useRef(false); // seit dem Wechsel auf „Radieren" etwas weggewischt?
  const saving = phase === 'saving';
  const close = () => {
    if (!saving) onClose();
  };
  useBackClose(true, close); // Handy-Zurück schließt das Studio

  // Freistellen (bei jedem neuen Foto)
  useEffect(() => {
    let alive = true;
    setPhase('cutting');
    setErr('');
    setCut(null);
    setLayout(null);
    setSize(1);
    setPan({ x: 0, y: 0 });
    setTool('move');
    undoRef.current = [];
    setUndoCount(0);
    (async () => {
      try {
        const [blob, bgImg] = await Promise.all([removeBackground(file), loadBackground()]);
        const orig = await createImageBitmap(blob);
        if (!alive) {
          orig.close();
          return;
        }
        const work = document.createElement('canvas');
        work.width = orig.width;
        work.height = orig.height;
        ctx2d(work).drawImage(orig, 0, 0);
        setBg(bgImg);
        setCut({ work, orig });
        setLayout(measure(work));
        setPhase('ready');
      } catch (e) {
        if (!alive) return;
        setErr(e instanceof Error ? e.message : 'Freistellen fehlgeschlagen.');
        setPhase('error');
      }
    })();
    return () => {
      alive = false;
    };
  }, [file]);

  // Bild-Speicher freigeben, sobald eine Freistellung ersetzt wird
  useEffect(() => () => cut?.orig.close(), [cut]);

  // Vorschau zeichnen (+ Pinsel-Umriss beim Radieren)
  useEffect(() => {
    const c = canvasRef.current;
    if (!c || !cut || !bg || !layout) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    compose(ctx, c.width, c.height, bg, cut.work, layout, size, pan);
    if (tool === 'erase' && cursor) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(cursor.x, cursor.y, brush / 2, 0, Math.PI * 2);
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(255,255,255,.9)';
      ctx.shadowColor = 'rgba(0,0,0,.8)';
      ctx.shadowBlur = 4;
      ctx.stroke();
      ctx.restore();
    }
  }, [cut, bg, layout, size, pan, version, tool, cursor, brush]);

  // PC: Mausrad zoomt (nur beim Verschieben). Eigener Listener, weil React-Wheel
  // passiv ist und das Scrollen der Seite sonst nicht verhindert werden kann.
  useEffect(() => {
    const c = canvasRef.current;
    if (!c || tool !== 'move' || !layout) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setSize((s) => {
        const next = Math.min(SIZE_MAX, Math.max(SIZE_MIN, s * Math.exp(-e.deltaY * 0.0015)));
        setPan((p) => clampPan(layout, next, p));
        return next;
      });
    };
    c.addEventListener('wheel', onWheel, { passive: false });
    return () => c.removeEventListener('wheel', onWheel);
  }, [tool, layout, cut]);

  const toCanvas = (e: React.PointerEvent<HTMLCanvasElement>): Pt => {
    const c = e.currentTarget;
    const r = c.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * c.width, y: ((e.clientY - r.top) / r.height) * c.height };
  };

  const eraseLine = (a: Pt, b: Pt) => {
    if (!cut || !layout) return;
    const c = canvasRef.current!;
    const p = place(c.width, c.height, layout, size, pan);
    const r = brush / 2 / p.s;
    const ax = (a.x - p.x) / p.s;
    const ay = (a.y - p.y) / p.s;
    const bx = (b.x - p.x) / p.s;
    const by = (b.y - p.y) / p.s;
    const ctx = ctx2d(cut.work);
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = r * 2;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(bx, by, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    erasedRef.current = true;
    setVersion((v) => v + 1);
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!cut || !layout || saving) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const pt = toCanvas(e);
    if (tool === 'move') {
      dragRef.current = { start: pt, pan0: pan };
      return;
    }
    // Radieren: Stand für „Rückgängig" merken, dann losradieren
    const ctx = ctx2d(cut.work);
    undoRef.current.push(ctx.getImageData(0, 0, cut.work.width, cut.work.height));
    if (undoRef.current.length > UNDO_MAX) undoRef.current.shift();
    setUndoCount(undoRef.current.length);
    strokeRef.current = pt;
    setCursor(pt);
    eraseLine(pt, pt);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!layout) return;
    const pt = toCanvas(e);
    if (tool === 'move') {
      const d = dragRef.current;
      if (!d) return;
      const c = e.currentTarget;
      setPan(clampPan(layout, size, { x: d.pan0.x + (pt.x - d.start.x) / c.width, y: d.pan0.y + (pt.y - d.start.y) / c.height }));
      return;
    }
    setCursor(pt);
    if (strokeRef.current) {
      eraseLine(strokeRef.current, pt);
      strokeRef.current = pt;
    }
  };

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    dragRef.current = null;
    strokeRef.current = null;
    if (e.pointerType !== 'mouse') setCursor(null); // am Handy den Pinsel-Umriss wieder ausblenden
  };

  const undo = () => {
    if (!cut) return;
    const last = undoRef.current.pop();
    if (!last) return;
    ctx2d(cut.work).putImageData(last, 0, 0);
    setUndoCount(undoRef.current.length);
    erasedRef.current = true;
    setVersion((v) => v + 1);
  };

  const resetAll = () => {
    if (!cut) return;
    const ctx = ctx2d(cut.work);
    ctx.clearRect(0, 0, cut.work.width, cut.work.height);
    ctx.drawImage(cut.orig, 0, 0);
    undoRef.current = [];
    setUndoCount(0);
    erasedRef.current = false;
    setLayout(measure(cut.work));
    setSize(1);
    setPan({ x: 0, y: 0 });
    setVersion((v) => v + 1);
  };

  const switchTool = (next: Tool) => {
    if (next === tool) return;
    // Nach dem Radieren den übrig gebliebenen Spieler neu einpassen
    if (tool === 'erase' && erasedRef.current && cut) {
      const l = measure(cut.work);
      if (l) {
        setLayout(l);
        setSize(1);
        setPan({ x: 0, y: 0 });
      }
    }
    erasedRef.current = false;
    setCursor(null);
    setTool(next);
  };

  const changeSize = (next: number) => {
    setSize(next);
    if (layout) setPan((p) => clampPan(layout, next, p));
  };

  const pickOther = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/png,image/jpeg,image/webp';
    input.onchange = () => {
      const f = input.files?.[0];
      if (f) setFile(f);
    };
    input.click();
  };

  // Fertiges Spielerbild (4:5 mit Hintergrund) + Freistellung hochladen –
  // genau so, wie es in der Vorschau zu sehen ist.
  const accept = async () => {
    if (!cut || !bg || !layout) return;
    const content = measure(cut.work);
    if (!content) {
      setErr('Es ist kein Spieler mehr im Bild – „Rückgängig" oder „Alles zurück".');
      return;
    }
    setPhase('saving');
    setErr('');
    try {
      const c = document.createElement('canvas');
      c.width = OUT_W;
      c.height = OUT_H;
      const ctx = c.getContext('2d');
      if (!ctx) throw new Error('Bild konnte nicht erzeugt werden.');
      compose(ctx, OUT_W, OUT_H, bg, cut.work, layout, size, pan);
      const imageUrl = await uploadImage(fileFrom(await canvasBlob(c), 'spielerbild'), { maxDimension: OUT_H });
      const cutoutUrl = await uploadImage(fileFrom(await cutoutBlob(cut.work, content), 'freigestellt'), { maxDimension: CUTOUT_MAX });
      onDone({ imageUrl, cutoutUrl, cutoutSrc: imageUrl });
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Hochladen fehlgeschlagen.');
      setPhase('ready');
    }
  };

  // Foto unverändert übernehmen (z. B. ein schon fertig bearbeitetes Bild)
  const uploadAsIs = async () => {
    const hadCut = cut;
    setPhase('saving');
    setErr('');
    try {
      const imageUrl = await uploadImage(file);
      const patch: Partial<Player> = { imageUrl, cutoutUrl: undefined, cutoutSrc: undefined };
      const content = hadCut ? measure(hadCut.work) : null;
      if (hadCut && content) {
        try {
          patch.cutoutUrl = await uploadImage(fileFrom(await cutoutBlob(hadCut.work, content), 'freigestellt'), { maxDimension: CUTOUT_MAX });
          patch.cutoutSrc = imageUrl;
        } catch {
          /* Freistellung lässt sich später mit der Schere nachholen */
        }
      }
      onDone(patch);
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Hochladen fehlgeschlagen.');
      setPhase(hadCut ? 'ready' : 'error');
    }
  };

  const ready = Boolean(cut && layout);
  const toolBtn = (active: boolean) =>
    `inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[13px] font-semibold cursor-pointer transition-colors disabled:opacity-40 ${
      active ? 'bg-white/10 text-white border border-brand-accent-light/60' : 'border border-white/10 text-gray-400 hover:text-white hover:bg-white/5'
    }`;

  return createPortal(
    <div className="fixed inset-0 z-[120] bg-black/80 backdrop-blur-sm overflow-y-auto" onClick={close}>
      <div className="min-h-full flex items-center justify-center px-4 pt-[calc(env(safe-area-inset-top)+1rem)] pb-[calc(env(safe-area-inset-bottom)+1rem)]">
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Spielerfoto ${playerName}`}
          className="w-full max-w-[380px] rounded-2xl border border-white/10 bg-[#0B1415] p-4 shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center gap-2 mb-3">
            <div className="min-w-0 flex-1 font-display font-black uppercase tracking-tight text-white truncate">{playerName || 'Spielerfoto'}</div>
            <button
              type="button"
              onClick={close}
              disabled={saving}
              aria-label="Schließen"
              className="shrink-0 w-8 h-8 grid place-items-center rounded-full text-gray-400 hover:text-white hover:bg-white/5 cursor-pointer disabled:opacity-40"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="relative mx-auto w-full max-w-[280px] aspect-[4/5] rounded-xl overflow-hidden bg-[#03080a]">
            <canvas
              ref={canvasRef}
              width={PREVIEW_W}
              height={PREVIEW_H}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              onPointerLeave={() => !strokeRef.current && setCursor(null)}
              className={`block w-full h-full touch-none select-none ${ready ? '' : 'invisible'} ${
                tool === 'erase' ? 'cursor-crosshair' : 'cursor-grab active:cursor-grabbing'
              }`}
            />
            {phase === 'cutting' && (
              <div className="absolute inset-0 grid place-items-center text-center px-6">
                <div>
                  <Loader2 className="w-6 h-6 animate-spin text-brand-accent-light mx-auto" />
                  <div className="mt-3 text-sm text-gray-200">Spieler wird freigestellt …</div>
                  <div className="mt-1 text-[11px] text-gray-500">Beim ersten Mal lädt das KI-Modell (ca. 25 MB).</div>
                </div>
              </div>
            )}
            {phase === 'error' && <div className="absolute inset-0 grid place-items-center text-center px-6 text-sm text-rose-300">{err}</div>}
          </div>

          {ready && (
            <>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <button type="button" aria-pressed={tool === 'move'} onClick={() => switchTool('move')} disabled={saving} className={toolBtn(tool === 'move')}>
                  <Move className="w-4 h-4" />
                  Verschieben
                </button>
                <button type="button" aria-pressed={tool === 'erase'} onClick={() => switchTool('erase')} disabled={saving} className={toolBtn(tool === 'erase')}>
                  <Eraser className="w-4 h-4" />
                  Radieren
                </button>
              </div>

              {tool === 'move' ? (
                <label className="mt-3 block">
                  <span className="flex justify-between text-[11px] font-mono uppercase tracking-wider text-gray-400">
                    <span>Größe</span>
                    <span>{Math.round(size * 100)} %</span>
                  </span>
                  <input
                    type="range"
                    min={SIZE_MIN}
                    max={SIZE_MAX}
                    step={0.01}
                    value={size}
                    disabled={saving}
                    onChange={(e) => changeSize(Number(e.target.value))}
                    className="mt-1 w-full accent-[#22DFC9] cursor-pointer"
                  />
                </label>
              ) : (
                <>
                  <label className="mt-3 block">
                    <span className="flex justify-between text-[11px] font-mono uppercase tracking-wider text-gray-400">
                      <span>Pinsel</span>
                      <span>{Math.round(brush / 2)}</span>
                    </span>
                    <input
                      type="range"
                      min={12}
                      max={120}
                      step={1}
                      value={brush}
                      disabled={saving}
                      onChange={(e) => setBrush(Number(e.target.value))}
                      className="mt-1 w-full accent-[#22DFC9] cursor-pointer"
                    />
                  </label>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <button type="button" onClick={undo} disabled={saving || undoCount === 0} className={toolBtn(false)}>
                      <Undo2 className="w-4 h-4" />
                      Rückgängig
                    </button>
                    <button type="button" onClick={resetAll} disabled={saving} className={toolBtn(false)}>
                      <RotateCcw className="w-4 h-4" />
                      Alles zurück
                    </button>
                  </div>
                </>
              )}
            </>
          )}
          {err && phase !== 'error' && <div className="mt-2 text-xs text-rose-300">{err}</div>}

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={accept}
              disabled={phase !== 'ready'}
              className="flex-1 min-w-[150px] inline-flex items-center justify-center gap-2 rounded-lg bg-brand-accent-light px-4 py-2.5 text-sm font-bold text-[#062018] cursor-pointer disabled:opacity-40 disabled:cursor-default"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              Übernehmen
            </button>
            <button
              type="button"
              onClick={pickOther}
              disabled={saving}
              className="flex-1 min-w-[130px] inline-flex items-center justify-center gap-2 rounded-lg border border-white/15 px-4 py-2.5 text-sm font-semibold text-gray-200 hover:bg-white/5 cursor-pointer disabled:opacity-40"
            >
              <ImagePlus className="w-4 h-4" />
              Anderes Foto
            </button>
          </div>
          <button
            type="button"
            onClick={uploadAsIs}
            disabled={saving}
            className="mt-3 w-full text-center text-[11px] text-gray-500 hover:text-gray-200 cursor-pointer disabled:opacity-40"
          >
            Ohne Bearbeitung hochladen (fertiges Bild)
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
