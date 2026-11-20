import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Eraser, ImagePlus, Loader2, Move, RotateCcw, Undo2, X } from 'lucide-react';
import type { Player } from '../types';
import { removeBackground } from '../lib/cutout';
import { detectFaces, preloadFaceModel, type FaceBox } from '../lib/faceDetect';
import { uploadImage } from '../lib/api';
import { useBackClose } from '../lib/backStack';
import { PLAYER_PHOTO_BG, keepPortrait, validCutout } from '../lib/playerPhoto';
import {
  type Layout,
  type Pt,
  clampCardPan,
  clampPortraitPan,
  ctx2d,
  drawCard,
  drawPortraitFrame,
  measure,
  placeCard,
  placePortrait,
  portraitAnchor,
  renderPortrait,
  trim,
} from '../lib/photoFrame';
import { CardPreview, PortraitPreviews } from './PhotoPreviews';

// ===========================================================================
// Foto-Studio (Backoffice, Liga-Kader). Jeder Spieler hat zwei Bilder:
//  • Kartenbild – 4:5 auf dem Hero-League-Hintergrund (FIFA-Karte, Kader)
//  • Porträt – Kopf & Schultern, freigestellt (Hero One, Statistik)
// Hat ein Spieler kein eigenes Porträt, nimmt die Seite das Kartenbild für alles.
// Oben wählt man, was übernommen wird: beide Bilder, nur das Kartenbild oder
// nur das Porträt. Beide Ausschnitte kommen aus derselben Freistellung und
// lassen sich getrennt verschieben/vergrößern; das Porträt sitzt dank
// Gesichtserkennung von selbst auf Kopf & Schultern. Radieren (störende
// Personen) gilt für beide. Rechts bzw. darunter: Vorschau, wie es auf der
// Seite aussieht. Erst „Übernehmen" lädt hoch.
// Mit Foto (Kamera) = neues Bild; ohne (Klick aufs Spielerbild) = vorhandene
// Bilder bearbeiten – dann ohne erneutes Freistellen aus der Freistellung.
// ===========================================================================

const OUT_W = 800;
const OUT_H = 1000;
const PREVIEW_W = 560;
const PREVIEW_H = 700;
const CUT_MAX = 1600; // Freistellung im Studio: groß genug für Porträt-Ausschnitte aus Ganzkörperfotos
const UPLOAD_MAX = 900; // hochgeladene Freistellung/Porträt (wie lib/cutout)
const SIZE_MIN = 0.5;
const SIZE_MAX = 3.5;
const UNDO_MAX = 6;

type Phase = 'loading' | 'ready' | 'saving' | 'error';
type Tool = 'move' | 'erase';
type Target = 'both' | 'card' | 'portrait';
type View = 'card' | 'portrait';
type Cut = { work: HTMLCanvasElement; orig: ImageBitmap };
type Frame = { size: number; pan: Pt };
type TeamLike = { name?: string; logoColor?: string; logoUrl?: string; logoIcon?: string };

const TARGETS: { key: Target; label: string }[] = [
  { key: 'both', label: 'Beide Bilder' },
  { key: 'card', label: 'Nur Kartenbild' },
  { key: 'portrait', label: 'Nur Porträt' },
];
const VIEWS: { key: View; label: string }[] = [
  { key: 'card', label: 'Kartenbild' },
  { key: 'portrait', label: 'Porträt' },
];
const FRESH: Frame = { size: 1, pan: { x: 0, y: 0 } };

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

async function uploadCanvas(c: HTMLCanvasElement, base: string, maxDimension: number): Promise<string> {
  return uploadImage(fileFrom(await canvasBlob(c), base), { maxDimension });
}

export default function PlayerPhotoStudio({
  player,
  team,
  file: initialFile,
  onClose,
  onDone,
}: {
  player: Player; // Stand beim Öffnen (Name, bisherige Bilder)
  team?: TeamLike; // für die Vorschau (Wappen auf der Karte, Vereinsname)
  file?: File; // neues Foto; ohne = vorhandene Bilder bearbeiten
  onClose: () => void;
  onDone: (patch: Partial<Player>) => void;
}) {
  const playerName = player.name;
  const [file, setFile] = useState<File | null>(initialFile ?? null);
  const [target, setTarget] = useState<Target>(initialFile ? 'both' : 'portrait');
  const [view, setView] = useState<View>(initialFile ? 'card' : 'portrait');
  const [phase, setPhase] = useState<Phase>('loading');
  const [err, setErr] = useState('');
  const [cut, setCut] = useState<Cut | null>(null);
  const [bg, setBg] = useState<HTMLImageElement | null>(null);
  const [layout, setLayout] = useState<Layout | null>(null);
  const [faces, setFaces] = useState<FaceBox[]>([]);
  const [card, setCard] = useState<Frame>(FRESH);
  const [portrait, setPortrait] = useState<Frame>(FRESH);
  const [tool, setTool] = useState<Tool>('move');
  const [brush, setBrush] = useState(44); // Pinsel-Durchmesser in Vorschau-Pixeln
  const [cursor, setCursor] = useState<Pt | null>(null);
  const [version, setVersion] = useState(0); // neu zeichnen nach dem Radieren
  const [undoCount, setUndoCount] = useState(0);
  const [previews, setPreviews] = useState<{ card?: string; portrait?: string }>({});
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const undoRef = useRef<ImageData[]>([]);
  const dragRef = useRef<{ start: Pt; pan0: Pt } | null>(null);
  const strokeRef = useRef<Pt | null>(null);
  const erasedRef = useRef(false); // seit dem Wechsel auf „Radieren" etwas weggewischt?
  const facesRef = useRef<FaceBox[]>([]); // Gesichter der unberührten Freistellung („Alles zurück")
  const saving = phase === 'saving';
  const editing = !file; // vorhandene Bilder bearbeiten
  const active: View = target === 'both' ? view : target; // was gerade im Rahmen bearbeitet wird
  const close = () => {
    if (!saving) onClose();
  };
  useBackClose(true, close); // Handy-Zurück schließt das Studio

  // Porträt-Ausschnitt bei 100 % (Kopf & Schultern) – aus Gesicht + Freistellung.
  const anchor = useMemo(() => (cut && layout ? portraitAnchor(cut.work, layout, faces) : null), [cut, layout, faces]);

  // Freistellung laden: neues Foto freistellen bzw. vorhandene Freistellung holen
  useEffect(() => {
    let alive = true;
    setPhase('loading');
    setErr('');
    setCut(null);
    setLayout(null);
    setCard(FRESH);
    setPortrait(FRESH);
    setTool('move');
    setPreviews({});
    undoRef.current = [];
    setUndoCount(0);
    preloadFaceModel();
    (async () => {
      try {
        let blob: Blob;
        const existingCut = validCutout(player) || player.portraitUrl;
        if (file) blob = await removeBackground(file, { maxSide: CUT_MAX });
        else if (validCutout(player)) blob = await (await fetch(validCutout(player)!, { mode: 'cors' })).blob();
        else if (player.imageUrl) blob = await removeBackground(player.imageUrl, { maxSide: CUT_MAX });
        else if (existingCut) blob = await (await fetch(existingCut, { mode: 'cors' })).blob();
        else throw new Error('Kein Bild vorhanden.');
        const [orig, bgImg] = await Promise.all([createImageBitmap(blob), loadBackground()]);
        if (!alive) {
          orig.close();
          return;
        }
        const work = document.createElement('canvas');
        work.width = orig.width;
        work.height = orig.height;
        ctx2d(work).drawImage(orig, 0, 0);
        const l = measure(work);
        if (!l) {
          orig.close();
          throw new Error('Auf dem Foto wurde keine Person erkannt.');
        }
        const found = await detectFaces(work).catch(() => [] as FaceBox[]);
        if (!alive) {
          orig.close();
          return;
        }
        facesRef.current = found;
        setFaces(found);
        setBg(bgImg);
        setCut({ work, orig });
        setLayout(l);
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
  }, [file]); // nur bei neuem Foto neu laden (player = Stand beim Öffnen)

  // Bild-Speicher freigeben, sobald eine Freistellung ersetzt wird
  useEffect(() => () => cut?.orig.close(), [cut]);

  // Rahmen zeichnen (+ Pinsel-Umriss beim Radieren)
  useEffect(() => {
    const c = canvasRef.current;
    if (!c || !cut || !bg || !layout) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    if (active === 'card') drawCard(ctx, c.width, c.height, bg, cut.work, layout, card.size, card.pan);
    else if (anchor) drawPortraitFrame(ctx, c.width, c.height, bg, cut.work, anchor, portrait.size, portrait.pan);
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
  }, [cut, bg, layout, anchor, active, card, portrait, version, tool, cursor, brush]);

  // Vorschauen (FIFA-Karte, Hero One, Statistik) – höchstens ~8× pro Sekunde
  // neu berechnen, auch während gezogen wird.
  const latest = useRef({ cut, bg, layout, anchor, card, portrait, target });
  latest.current = { cut, bg, layout, anchor, card, portrait, target };
  const previewTimer = useRef<number | null>(null);
  useEffect(() => {
    if (!cut || !bg || !layout || previewTimer.current !== null) return;
    previewTimer.current = window.setTimeout(() => {
      previewTimer.current = null;
      const v = latest.current;
      if (!v.cut || !v.bg || !v.layout) return;
      const next: { card?: string; portrait?: string } = {};
      if (v.target !== 'portrait') {
        const c = document.createElement('canvas');
        c.width = 400;
        c.height = 500;
        drawCard(ctx2d(c), 400, 500, v.bg, v.cut.work, v.layout, v.card.size, v.card.pan);
        next.card = c.toDataURL('image/jpeg', 0.86);
      }
      if (v.target !== 'card' && v.anchor) {
        next.portrait = renderPortrait(v.cut.work, v.layout, v.anchor, v.portrait.size, v.portrait.pan, 500)?.toDataURL('image/webp', 0.86);
      }
      setPreviews(next);
    }, 120);
  }, [cut, bg, layout, anchor, card, portrait, target, version]);
  useEffect(
    () => () => {
      if (previewTimer.current !== null) window.clearTimeout(previewTimer.current);
    },
    []
  );

  // Größe/Verschieben des gerade bearbeiteten Ausschnitts – immer begrenzt.
  const clampFor = (v: View, size: number, pan: Pt): Pt => {
    if (!layout) return pan;
    if (v === 'card') return clampCardPan(layout, size, pan);
    return anchor ? clampPortraitPan(layout, anchor, size, pan) : pan;
  };
  const frameOf = (v: View) => (v === 'card' ? card : portrait);
  const setFrame = (v: View, f: Frame) => (v === 'card' ? setCard(f) : setPortrait(f));
  const changeSize = (next: number) => {
    const f = frameOf(active);
    setFrame(active, { size: next, pan: clampFor(active, next, f.pan) });
  };

  // PC: Mausrad zoomt (nur beim Verschieben). Eigener Listener, weil React-Wheel
  // passiv ist und das Scrollen der Seite sonst nicht verhindert werden kann.
  const wheelRef = useRef<(e: WheelEvent) => void>(() => {});
  wheelRef.current = (e: WheelEvent) => {
    if (tool !== 'move' || !layout) return;
    e.preventDefault();
    const f = frameOf(active);
    changeSize(Math.min(SIZE_MAX, Math.max(SIZE_MIN, f.size * Math.exp(-e.deltaY * 0.0015))));
  };
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const onWheel = (e: WheelEvent) => wheelRef.current(e);
    c.addEventListener('wheel', onWheel, { passive: false });
    return () => c.removeEventListener('wheel', onWheel);
  }, [phase]);

  const toCanvas = (e: React.PointerEvent<HTMLCanvasElement>): Pt => {
    const c = e.currentTarget;
    const r = c.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * c.width, y: ((e.clientY - r.top) / r.height) * c.height };
  };

  // Wo die Freistellung im Rahmen liegt (für das Radieren)
  const placement = (c: HTMLCanvasElement) =>
    active === 'card' || !anchor
      ? placeCard(c.width, c.height, layout!, card.size, card.pan)
      : placePortrait(c.width, c.height, anchor, portrait.size, portrait.pan);

  const eraseLine = (a: Pt, b: Pt) => {
    if (!cut || !layout) return;
    const p = placement(canvasRef.current!);
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
      dragRef.current = { start: pt, pan0: frameOf(active).pan };
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
      const f = frameOf(active);
      setFrame(active, { size: f.size, pan: clampFor(active, f.size, { x: d.pan0.x + (pt.x - d.start.x) / c.width, y: d.pan0.y + (pt.y - d.start.y) / c.height }) });
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
    setFaces(facesRef.current);
    setCard(FRESH);
    setPortrait(FRESH);
    setVersion((v) => v + 1);
  };

  // Nach dem Radieren den übrig gebliebenen Spieler neu einpassen – Kartenbild
  // und Porträt (Gesichter neu suchen, weggewischte zählen nicht mehr).
  const refit = async () => {
    if (!cut) return;
    const l = measure(cut.work);
    if (!l) return;
    const found = await detectFaces(cut.work).catch(() => faces);
    setLayout(l);
    setFaces(found);
    setCard(FRESH);
    setPortrait(FRESH);
  };

  const switchTool = (next: Tool) => {
    if (next === tool) return;
    if (tool === 'erase' && erasedRef.current) void refit();
    erasedRef.current = false;
    setCursor(null);
    setTool(next);
  };

  const pickOther = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/png,image/jpeg,image/webp';
    input.onchange = () => {
      const f = input.files?.[0];
      if (!f) return;
      setFile(f);
      if (editing) {
        setTarget('both');
        setView('card');
      }
    };
    input.click();
  };

  // Hochladen – genau so, wie es in der Vorschau zu sehen ist.
  const accept = async () => {
    if (!cut || !bg || !layout) return;
    if (!measure(cut.work)) {
      setErr('Es ist kein Spieler mehr im Bild – „Rückgängig" oder „Alles zurück".');
      return;
    }
    setPhase('saving');
    setErr('');
    try {
      const patch: Partial<Player> = {};
      if (target !== 'portrait') {
        const c = document.createElement('canvas');
        c.width = OUT_W;
        c.height = OUT_H;
        drawCard(ctx2d(c), OUT_W, OUT_H, bg, cut.work, layout, card.size, card.pan);
        const freigestellt = trim(cut.work);
        if (!freigestellt) throw new Error('Bild konnte nicht erzeugt werden.');
        const imageUrl = await uploadCanvas(c, 'spielerbild', OUT_H);
        const cutoutUrl = await uploadCanvas(freigestellt, 'freigestellt', UPLOAD_MAX);
        Object.assign(patch, { imageUrl, cutoutUrl, cutoutSrc: imageUrl });
        if (target === 'card') Object.assign(patch, keepPortrait(player)); // Listen behalten ihr bisheriges Bild
      }
      if (target !== 'card') {
        const p = anchor ? renderPortrait(cut.work, layout, anchor, portrait.size, portrait.pan) : null;
        if (!p) throw new Error('Porträt konnte nicht erzeugt werden.');
        patch.portraitUrl = await uploadCanvas(p, 'portraet', UPLOAD_MAX);
      }
      onDone(patch);
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Hochladen fehlgeschlagen.');
      setPhase('ready');
    }
  };

  // Foto unverändert übernehmen (z. B. ein schon fertig bearbeitetes Bild)
  const uploadAsIs = async () => {
    if (!file) return;
    const hadCut = cut;
    setPhase('saving');
    setErr('');
    try {
      const freigestellt = hadCut ? trim(hadCut.work) : null;
      if (target === 'portrait') {
        if (!freigestellt) throw new Error('Porträt konnte nicht erzeugt werden.');
        onDone({ portraitUrl: await uploadCanvas(freigestellt, 'portraet', UPLOAD_MAX) });
        onClose();
        return;
      }
      const imageUrl = await uploadImage(file);
      const patch: Partial<Player> = { imageUrl, cutoutUrl: undefined, cutoutSrc: undefined };
      if (freigestellt) {
        try {
          patch.cutoutUrl = await uploadCanvas(freigestellt, 'freigestellt', UPLOAD_MAX);
          patch.cutoutSrc = imageUrl;
        } catch {
          /* Freistellung lässt sich später mit der Schere nachholen */
        }
      }
      // Beide: das Bild gilt für alles (kein eigenes Porträt). Nur Kartenbild:
      // Listen behalten ihr bisheriges Bild.
      if (target === 'both') patch.portraitUrl = undefined;
      else Object.assign(patch, keepPortrait(player));
      onDone(patch);
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Hochladen fehlgeschlagen.');
      setPhase(hadCut ? 'ready' : 'error');
    }
  };

  const ready = Boolean(cut && layout);
  const frame = frameOf(active);
  const showCard = target !== 'portrait';
  const showPortrait = target !== 'card';
  const toolBtn = (on: boolean) =>
    `inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[13px] font-semibold cursor-pointer transition-colors disabled:opacity-40 ${
      on ? 'bg-white/10 text-white border border-brand-accent-light/60' : 'border border-white/10 text-gray-400 hover:text-white hover:bg-white/5'
    }`;

  return createPortal(
    <div className="fixed inset-0 z-[120] bg-black/80 backdrop-blur-sm overflow-y-auto" onClick={close}>
      <div className="min-h-full flex items-center justify-center px-4 pt-[calc(env(safe-area-inset-top)+1rem)] pb-[calc(env(safe-area-inset-bottom)+1rem)]">
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Spielerbilder ${playerName}`}
          className="w-full max-w-[380px] sm:max-w-[760px] rounded-2xl border border-white/10 bg-[#0B1415] p-4 sm:p-5 shadow-2xl"
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

          {/* Was übernommen wird */}
          <div role="radiogroup" aria-label="Welche Bilder übernehmen" className="grid grid-cols-3 gap-1 rounded-xl border border-white/10 bg-white/[.03] p-1 mb-4">
            {TARGETS.map((t) => (
              <button
                key={t.key}
                type="button"
                role="radio"
                aria-checked={target === t.key}
                disabled={saving}
                onClick={() => {
                  setTarget(t.key);
                  if (t.key !== 'both') setView(t.key);
                }}
                className={`rounded-lg px-1 py-2 text-[12px] font-semibold leading-tight cursor-pointer transition-colors disabled:opacity-40 ${
                  target === t.key ? 'bg-brand-accent-light text-[#062018]' : 'text-gray-400 hover:text-white hover:bg-white/5'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-[280px_minmax(0,1fr)] gap-5 sm:gap-6">
            {/* Bearbeiten */}
            <div className="min-w-0">
              {target === 'both' && (
                <div role="tablist" className="flex gap-5 border-b border-white/10 mb-3">
                  {VIEWS.map((v) => (
                    <button
                      key={v.key}
                      type="button"
                      role="tab"
                      aria-selected={view === v.key}
                      onClick={() => setView(v.key)}
                      className={`-mb-px border-b-2 px-0.5 pb-2 text-[13px] font-semibold cursor-pointer transition-colors ${
                        view === v.key ? 'border-brand-accent-light text-white' : 'border-transparent text-gray-500 hover:text-gray-200'
                      }`}
                    >
                      {v.label}
                    </button>
                  ))}
                </div>
              )}

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
                  aria-label={active === 'card' ? 'Kartenbild bearbeiten' : 'Porträt bearbeiten'}
                  className={`block w-full h-full touch-none select-none ${ready ? '' : 'invisible'} ${
                    tool === 'erase' ? 'cursor-crosshair' : 'cursor-grab active:cursor-grabbing'
                  }`}
                />
                {phase === 'loading' && (
                  <div className="absolute inset-0 grid place-items-center text-center px-6">
                    <div>
                      <Loader2 className="w-6 h-6 animate-spin text-brand-accent-light mx-auto" />
                      <div className="mt-3 text-sm text-gray-200">{editing ? 'Bild wird geladen …' : 'Spieler wird freigestellt …'}</div>
                      {!editing && <div className="mt-1 text-[11px] text-gray-500">Beim ersten Mal lädt das KI-Modell (ca. 25 MB).</div>}
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
                        <span>{Math.round(frame.size * 100)} %</span>
                      </span>
                      <input
                        type="range"
                        min={SIZE_MIN}
                        max={SIZE_MAX}
                        step={0.01}
                        value={frame.size}
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
            </div>

            {/* Vorschau: so sieht es auf der Seite aus */}
            {ready && (
              <div className="min-w-0 space-y-4">
                <div className="text-[11px] font-mono uppercase tracking-wider text-gray-400">Vorschau</div>
                {showCard && <CardPreview name={playerName} imageUrl={previews.card} team={team} />}
                {showPortrait && <PortraitPreviews name={playerName} teamName={team?.name} url={previews.portrait} />}
              </div>
            )}
          </div>

          {err && phase !== 'error' && <div className="mt-3 text-xs text-rose-300">{err}</div>}

          <div className="mt-5 flex flex-wrap gap-2">
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
              {editing ? 'Neues Foto' : 'Anderes Foto'}
            </button>
          </div>
          {!editing && (
            <button
              type="button"
              onClick={uploadAsIs}
              disabled={saving || (target === 'portrait' && !cut)}
              className="mt-3 w-full text-center text-[11px] text-gray-500 hover:text-gray-200 cursor-pointer disabled:opacity-40"
            >
              Ohne Bearbeitung hochladen (fertiges Bild)
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
