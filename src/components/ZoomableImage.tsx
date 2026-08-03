import { useRef, useState } from 'react';

// Ein zoombares Bild – volle Eingabe-Fläche über dem Medium.
// - Handy: mit zwei Fingern auf-/zuziehen (Pinch), im Zoom verschieben.
// - PC: Mausrad = zoomen (auf den Cursor), Doppelklick = rein/raus, im Zoom ziehen.
// - Einfaches Tippen (nur Touch, unzoomt) meldet die Zone (links/mitte/rechts) –
//   damit die Story-Ansicht darüber weiterblättern kann.
// - Gedrückt halten (Touch, unzoomt) meldet onHoldChange (Pause in der Story).
// - Wischen (Touch, unzoomt) meldet onSwipe (Ordnerwechsel).
const MIN = 1;
const MAX = 5;
const DOUBLE = 2.5;

export default function ZoomableImage({
  src,
  alt = '',
  className = '',
  onTapZone,
  onSwipe,
  onHoldChange,
  onZoomChange,
}: {
  src: string;
  alt?: string;
  className?: string;
  onTapZone?: (zone: 'left' | 'center' | 'right') => void;
  onSwipe?: (dir: 1 | -1) => void; // 1 = nach links gewischt (weiter), -1 = zurück
  onHoldChange?: (held: boolean) => void;
  onZoomChange?: (zoomed: boolean) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  const [scale, setScale] = useState(1);
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);
  const [gesturing, setGesturing] = useState(false);

  const scaleRef = useRef(1);
  const txRef = useRef(0);
  const tyRef = useRef(0);

  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; scale: number; midX: number; midY: number; tx: number; ty: number } | null>(null);
  const pan = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);
  const tap = useRef<{ x: number; y: number; t: number; touch: boolean } | null>(null);
  const holding = useRef(false);
  const holdTimer = useRef(0);
  const lastType = useRef<string>('mouse');

  const rel = (e: { clientX: number; clientY: number }) => {
    const r = containerRef.current?.getBoundingClientRect();
    return { x: e.clientX - (r?.left ?? 0), y: e.clientY - (r?.top ?? 0) };
  };
  const center = () => {
    const c = containerRef.current;
    return { x: (c?.clientWidth ?? 0) / 2, y: (c?.clientHeight ?? 0) / 2 };
  };

  const clampT = (nx: number, ny: number, s: number) => {
    const cont = containerRef.current;
    const img = imgRef.current;
    if (!cont || !img) return { x: nx, y: ny };
    const maxX = Math.max(0, (img.clientWidth * s - cont.clientWidth) / 2);
    const maxY = Math.max(0, (img.clientHeight * s - cont.clientHeight) / 2);
    return { x: Math.min(maxX, Math.max(-maxX, nx)), y: Math.min(maxY, Math.max(-maxY, ny)) };
  };

  const apply = (s: number, nx: number, ny: number) => {
    const clamped = clampT(nx, ny, s);
    const wasZoomed = scaleRef.current > 1.01;
    scaleRef.current = s;
    txRef.current = clamped.x;
    tyRef.current = clamped.y;
    setScale(s);
    setTx(clamped.x);
    setTy(clamped.y);
    const nowZoomed = s > 1.01;
    if (nowZoomed !== wasZoomed) onZoomChange?.(nowZoomed);
  };

  const reset = () => {
    setGesturing(false);
    apply(1, 0, 0);
  };

  // Um einen Punkt (Container-Koordinaten) auf newScale zoomen (Ursprung = Mitte).
  const zoomAround = (px: number, py: number, newScale: number) => {
    const s = Math.min(MAX, Math.max(MIN, newScale));
    const c = center();
    const contentX = (px - c.x - txRef.current) / scaleRef.current;
    const contentY = (py - c.y - tyRef.current) / scaleRef.current;
    apply(s, px - c.x - contentX * s, py - c.y - contentY * s);
  };

  const clearHold = () => {
    if (holdTimer.current) {
      window.clearTimeout(holdTimer.current);
      holdTimer.current = 0;
    }
  };

  const onPointerDown = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    lastType.current = e.pointerType;
    const p = rel(e);
    pointers.current.set(e.pointerId, p);
    setGesturing(true);

    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = {
        dist: Math.hypot(a.x - b.x, a.y - b.y) || 1,
        scale: scaleRef.current,
        midX: (a.x + b.x) / 2,
        midY: (a.y + b.y) / 2,
        tx: txRef.current,
        ty: tyRef.current,
      };
      pan.current = null;
      tap.current = null;
      clearHold();
      return;
    }

    if (scaleRef.current > 1.01) {
      pan.current = { x: p.x, y: p.y, tx: txRef.current, ty: tyRef.current };
      tap.current = null;
    } else {
      tap.current = { x: p.x, y: p.y, t: Date.now(), touch: e.pointerType === 'touch' };
      if (e.pointerType === 'touch') {
        holdTimer.current = window.setTimeout(() => {
          holding.current = true;
          onHoldChange?.(true);
        }, 220);
      }
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    const p = rel(e);
    pointers.current.set(e.pointerId, p);

    if (pinch.current && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const midX = (a.x + b.x) / 2;
      const midY = (a.y + b.y) / 2;
      const s = Math.min(MAX, Math.max(MIN, (pinch.current.scale * dist) / pinch.current.dist));
      const c = center();
      const contentX = (pinch.current.midX - c.x - pinch.current.tx) / pinch.current.scale;
      const contentY = (pinch.current.midY - c.y - pinch.current.ty) / pinch.current.scale;
      apply(s, midX - c.x - contentX * s, midY - c.y - contentY * s);
      return;
    }

    if (pan.current && scaleRef.current > 1.01) {
      apply(scaleRef.current, pan.current.tx + (p.x - pan.current.x), pan.current.ty + (p.y - pan.current.y));
      return;
    }

    if (tap.current) {
      if (Math.abs(p.x - tap.current.x) > 8 || Math.abs(p.y - tap.current.y) > 8) clearHold();
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const start = tap.current;
    const p = rel(e);
    pointers.current.delete(e.pointerId);

    if (pinch.current && pointers.current.size < 2) {
      pinch.current = null;
      if (scaleRef.current <= 1.02) reset();
    }
    if (pan.current && pointers.current.size === 0) pan.current = null;

    if (start && pointers.current.size === 0) {
      clearHold();
      if (holding.current) {
        holding.current = false;
        onHoldChange?.(false);
      } else {
        const dx = p.x - start.x;
        const dy = p.y - start.y;
        const moved = Math.abs(dx) > 10 || Math.abs(dy) > 10;
        if (!moved) {
          // Sauberes Tippen (nur Touch) → Zone melden (Story blättert weiter).
          if (start.touch) {
            const cw = containerRef.current?.clientWidth ?? 1;
            onTapZone?.(p.x < cw / 3 ? 'left' : p.x > (cw * 2) / 3 ? 'right' : 'center');
          }
        } else if (start.touch && Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy)) {
          onSwipe?.(dx < 0 ? 1 : -1);
        }
      }
      tap.current = null;
    }

    if (pointers.current.size === 0) setGesturing(false);
  };

  const onPointerCancel = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    clearHold();
    if (holding.current) {
      holding.current = false;
      onHoldChange?.(false);
    }
    pinch.current = null;
    pan.current = null;
    tap.current = null;
    if (pointers.current.size === 0) setGesturing(false);
  };

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const p = rel(e);
    zoomAround(p.x, p.y, scaleRef.current * (1 - e.deltaY * 0.0015));
    if (scaleRef.current <= 1.01) reset();
  };

  const onDoubleClick = (e: React.MouseEvent) => {
    if (lastType.current === 'touch') return;
    if (scaleRef.current > 1.01) reset();
    else {
      const p = rel(e);
      zoomAround(p.x, p.y, DOUBLE);
    }
  };

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 flex items-center justify-center overflow-hidden touch-none"
      style={{ cursor: scale > 1.01 ? 'grab' : 'auto' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onWheel={onWheel}
      onDoubleClick={onDoubleClick}
    >
      <img
        ref={imgRef}
        src={src}
        alt={alt}
        referrerPolicy="no-referrer"
        draggable={false}
        className={className || 'max-h-full max-w-full object-contain select-none'}
        style={{
          transform: `translate(${tx}px, ${ty}px) scale(${scale})`,
          transformOrigin: 'center center',
          transition: gesturing ? 'none' : 'transform .18s ease-out',
          willChange: 'transform',
        }}
      />
    </div>
  );
}
