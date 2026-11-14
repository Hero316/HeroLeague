import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ImagePlus, Loader2, X } from 'lucide-react';
import type { Player } from '../types';
import { removeBackground } from '../lib/cutout';
import { uploadImage } from '../lib/api';
import { useBackClose } from '../lib/backStack';
import { PLAYER_PHOTO_BG } from '../lib/playerPhoto';

// ===========================================================================
// Foto-Studio (Backoffice, Liga-Kader): ein ganz normales Foto auswählen → der
// Spieler wird freigestellt (KI im Browser, lib/cutout) und auf den
// Hero-League-Hintergrund gesetzt – wie bisher von Hand: Format 4:5, mittig,
// unten angeschnitten, Kopf im türkisen Lichtkegel. Vorschau mit Größen-Regler;
// erst „Übernehmen" lädt hoch (fertiges Spielerbild + Freistellung).
// „Ohne Bearbeitung hochladen" nimmt das Foto unverändert (fertige Bilder).
// ===========================================================================

const OUT_W = 800;
const OUT_H = 1000;
const HEAD_TOP = 0.13; // Abstand Kopf → oberer Rand, wie bei den handgemachten Bildern
const CUTOUT_MAX = 900; // wie lib/cutout

type Cut = { bmp: ImageBitmap; blob: Blob; headX: number };
type Phase = 'cutting' | 'ready' | 'saving' | 'error';

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

// Waagerechte Mitte des Kopfes: Schwerpunkt der Deckkraft im oberen Viertel –
// so sitzt der Kopf mittig im Lichtkegel, auch wenn ein Arm zur Seite ragt.
function headCenterX(bmp: ImageBitmap): number {
  const w = bmp.width;
  const h = Math.max(1, Math.round(bmp.height * 0.25));
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (!ctx) return w / 2;
  ctx.drawImage(bmp, 0, 0, w, h, 0, 0, w, h);
  const d = ctx.getImageData(0, 0, w, h).data;
  let sum = 0;
  let weight = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const a = d[(y * w + x) * 4 + 3];
      sum += a * x;
      weight += a;
    }
  }
  return weight > 0 ? sum / weight : w / 2;
}

// Spieler auf den Hintergrund setzen. size = 1: Kopf bei 13 % von oben und unten
// bündig. Größer: Kopf bleibt oben, unten wird angeschnitten (z. B. bei
// Ganzkörperfotos). Kleiner: unten bündig, der Kopf rutscht tiefer – so ist nie
// eine Schnittkante mitten im Bild zu sehen.
function compose(ctx: CanvasRenderingContext2D, W: number, H: number, bg: HTMLImageElement, cut: Cut, size: number) {
  ctx.clearRect(0, 0, W, H);
  ctx.drawImage(bg, 0, 0, W, H);
  const s = ((H * (1 - HEAD_TOP)) / cut.bmp.height) * size;
  const dw = cut.bmp.width * s;
  const dh = cut.bmp.height * s;
  const x = W / 2 - cut.headX * s;
  const y = Math.max(H * HEAD_TOP, H - dh);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(cut.bmp, x, y, dw, dh);
}

function canvasBlob(c: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    c.toBlob(
      (webp) => {
        if (webp && webp.type === 'image/webp') return resolve(webp);
        c.toBlob((png) => (png ? resolve(png) : reject(new Error('Bild konnte nicht erzeugt werden.'))), 'image/png');
      },
      'image/webp',
      0.9
    );
  });
}

const fileFrom = (blob: Blob, base: string) =>
  new File([blob], `${base}.${blob.type === 'image/webp' ? 'webp' : 'png'}`, { type: blob.type });

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
  const [size, setSize] = useState(1);
  const canvasRef = useRef<HTMLCanvasElement>(null);
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
    setSize(1);
    (async () => {
      try {
        const [blob, bgImg] = await Promise.all([removeBackground(file), loadBackground()]);
        const bmp = await createImageBitmap(blob);
        if (!alive) {
          bmp.close();
          return;
        }
        setBg(bgImg);
        setCut({ bmp, blob, headX: headCenterX(bmp) });
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
  useEffect(() => () => cut?.bmp.close(), [cut]);

  // Vorschau zeichnen
  useEffect(() => {
    const c = canvasRef.current;
    if (!c || !cut || !bg) return;
    const ctx = c.getContext('2d');
    if (ctx) compose(ctx, c.width, c.height, bg, cut, size);
  }, [cut, bg, size]);

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

  // Fertiges Spielerbild (4:5 mit Hintergrund) + Freistellung hochladen
  const accept = async () => {
    if (!cut || !bg) return;
    setPhase('saving');
    setErr('');
    try {
      const c = document.createElement('canvas');
      c.width = OUT_W;
      c.height = OUT_H;
      const ctx = c.getContext('2d');
      if (!ctx) throw new Error('Bild konnte nicht erzeugt werden.');
      compose(ctx, OUT_W, OUT_H, bg, cut, size);
      const imageUrl = await uploadImage(fileFrom(await canvasBlob(c), 'spielerbild'), { maxDimension: OUT_H });
      const cutoutUrl = await uploadImage(fileFrom(cut.blob, 'freigestellt'), { maxDimension: CUTOUT_MAX });
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
      if (hadCut) {
        try {
          patch.cutoutUrl = await uploadImage(fileFrom(hadCut.blob, 'freigestellt'), { maxDimension: CUTOUT_MAX });
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
            <canvas ref={canvasRef} width={560} height={700} className={`block w-full h-full ${cut ? '' : 'invisible'}`} />
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

          {cut && (
            <label className="mt-4 block">
              <span className="flex justify-between text-[11px] font-mono uppercase tracking-wider text-gray-400">
                <span>Größe</span>
                <span>{Math.round(size * 100)} %</span>
              </span>
              <input
                type="range"
                min={0.7}
                max={2.5}
                step={0.01}
                value={size}
                disabled={saving}
                onChange={(e) => setSize(Number(e.target.value))}
                className="mt-1 w-full accent-[#22DFC9] cursor-pointer"
              />
            </label>
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
