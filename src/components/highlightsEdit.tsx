import { useState } from 'react';
import { uploadImage } from '../lib/api';

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
