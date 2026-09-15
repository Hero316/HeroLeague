// Bild herunterladen – mit Hero-League-Wasserzeichen (Logo unten links) direkt
// in die Datei eingebrannt. Blob-URLs liegen auf einer anderen Domain (Vercel
// Blob), daher zieht das `download`-Attribut allein nicht zuverlässig: wir laden
// die Datei per fetch als Blob, brennen das Logo per Canvas ein und speichern das
// Ergebnis. Klappt das nicht (blockierter Fetch/Canvas), speichern wir das
// Original bzw. öffnen es als Fallback im neuen Tab.

const LOGO_URL = '/assets/hero-league-logo.png';

function loadImage(src: string, crossOrigin?: boolean): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (crossOrigin) img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Bild konnte nicht geladen werden'));
    img.src = src;
  });
}

let logoPromise: Promise<HTMLImageElement> | null = null;
function loadLogo(): Promise<HTMLImageElement> {
  if (!logoPromise) logoPromise = loadImage(LOGO_URL);
  return logoPromise;
}

// Logo unten links ins Bild rechnen. Gibt einen (evtl. watermarkierten) Blob zurück –
// bei jedem Problem den Original-Blob unverändert.
async function watermark(blob: Blob): Promise<Blob> {
  if (!blob.type.startsWith('image/') || blob.type === 'image/gif' || blob.type === 'image/svg+xml') return blob;
  const objectUrl = URL.createObjectURL(blob);
  try {
    const [img, logo] = await Promise.all([loadImage(objectUrl), loadLogo()]);
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    if (!w || !h) return blob;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return blob;
    ctx.drawImage(img, 0, 0, w, h);

    // Logo-Größe ~16% der Bildbreite (mit Grenzen), Seitenverhältnis erhalten.
    const targetW = Math.max(84, Math.min(Math.round(w * 0.16), 340));
    const scale = targetW / (logo.naturalWidth || targetW);
    const lw = targetW;
    const lh = Math.round((logo.naturalHeight || targetW) * scale);
    const pad = Math.round(Math.min(w, h) * 0.035);
    const x = pad;
    const y = h - pad - lh;
    // Weicher Schatten für Lesbarkeit auf hellen wie dunklen Bildern.
    ctx.save();
    ctx.globalAlpha = 0.92;
    ctx.shadowColor = 'rgba(0,0,0,.55)';
    ctx.shadowBlur = Math.max(4, Math.round(lh * 0.28));
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = Math.max(1, Math.round(lh * 0.04));
    ctx.drawImage(logo, x, y, lw, lh);
    ctx.restore();

    const type = blob.type === 'image/png' ? 'image/png' : 'image/jpeg';
    const out = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), type, type === 'image/jpeg' ? 0.92 : undefined)
    );
    return out ?? blob;
  } catch {
    return blob; // Wasserzeichen fehlgeschlagen → Original speichern
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export async function downloadImage(url: string, filename?: string): Promise<void> {
  const fallbackName =
    filename?.trim() || url.split('/').pop()?.split('?')[0] || `hero-league-${Date.now()}.jpg`;

  try {
    const res = await fetch(url, { mode: 'cors' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const raw = await res.blob();
    const blob = await watermark(raw);
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = fallbackName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 4000);
  } catch {
    window.open(url, '_blank', 'noopener');
  }
}
