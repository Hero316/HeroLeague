import { toPng } from 'html-to-image';

// ---------------------------------------------------------------------------
// Ein DOM-Element als Bild teilen: auf dem Handy über die native Teilen-Funktion
// (Instagram-Story, WhatsApp …), am PC als Download. Immer als PNG.
// ---------------------------------------------------------------------------

export type ShareResult = 'shared' | 'downloaded' | 'error';

export async function shareNode(
  node: HTMLElement,
  filename: string,
  opts?: { text?: string; targetWidth?: number; background?: string }
): Promise<ShareResult> {
  const targetWidth = opts?.targetWidth ?? 1080;
  const rect = node.getBoundingClientRect();
  const pixelRatio = rect.width > 0 ? Math.max(2, targetWidth / rect.width) : 3;
  try {
    // Zwei Durchläufe: html-to-image lädt eingebettete Schriften/Bilder erst beim
    // ersten Rendern nach – der zweite Lauf ist dann sauber gefüllt.
    await toPng(node, { pixelRatio, cacheBust: true, backgroundColor: opts?.background });
    const dataUrl = await toPng(node, { pixelRatio, cacheBust: true, backgroundColor: opts?.background });

    const blob = await (await fetch(dataUrl)).blob();
    const file = new File([blob], filename, { type: 'image/png' });
    const nav = navigator as Navigator & {
      canShare?: (data?: ShareData) => boolean;
      share?: (data?: ShareData) => Promise<void>;
    };

    if (nav.share && nav.canShare && nav.canShare({ files: [file] })) {
      try {
        await nav.share({ files: [file], text: opts?.text });
        return 'shared';
      } catch (err) {
        // Nutzer hat den Teilen-Dialog abgebrochen → kein Fehler, kein Download.
        if (err instanceof DOMException && err.name === 'AbortError') return 'shared';
      }
    }

    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    return 'downloaded';
  } catch (e) {
    console.error('Teilen fehlgeschlagen', e);
    return 'error';
  }
}
