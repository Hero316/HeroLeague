import { useState } from 'react';
import { uploadImage } from '../lib/api';
import type { HighlightMedia } from '../types';

export const genMediaId = () => `hl-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
export const genAlbumId = () => `alb-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

// Baut die Standard-Handler (Bild/Video hinzufügen, löschen, beschriften) für
// eine Medienliste – wiederverwendet für die losen Highlights und für jeden Ordner.
export function mediaListHandlers(list: HighlightMedia[], setList: (next: HighlightMedia[]) => void) {
  return {
    onAddImage: (url: string, ratio?: number) =>
      setList([...list, { id: genMediaId(), type: 'image' as const, url, ...(ratio ? { ratio } : {}) }]),
    onAddVideo: (url: string) => setList([...list, { id: genMediaId(), type: 'video' as const, url: url.trim() }]),
    onDeleteItem: (id: string) => setList(list.filter((m) => m.id !== id)),
    onSetCaption: (id: string, caption: string) =>
      setList(list.map((m) => (m.id === id ? { ...m, caption: caption.trim() || undefined } : m))),
  };
}

// Datei-Auswahl + Upload für Highlight-Fotos. Nutzt die bestehende Browser-
// Komprimierung (1600px, scharf aber klein) und erfasst vorab das Seitenverhältnis
// (Breite/Höhe) fürs Mosaik – so springt das Layout beim Laden nicht.
export function useAddImage(onAdd: (url: string, ratio?: number) => void) {
  const [busy, setBusy] = useState(false);

  const pick = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/png,image/jpeg,image/webp,image/gif';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      setBusy(true);
      try {
        let ratio: number | undefined;
        try {
          const bmp = await createImageBitmap(file);
          if (bmp.width > 0 && bmp.height > 0) ratio = bmp.width / bmp.height;
          bmp.close();
        } catch {
          /* Seitenverhältnis optional – Mosaik misst sonst per onLoad */
        }
        onAdd(await uploadImage(file, { maxDimension: 1600 }), ratio);
      } catch (err) {
        alert(err instanceof Error ? err.message : 'Fehler beim Bild-Upload.');
      } finally {
        setBusy(false);
      }
    };
    input.click();
  };

  return { busy, pick };
}
