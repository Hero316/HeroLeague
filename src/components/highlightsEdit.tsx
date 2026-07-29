import { useState } from 'react';
import { uploadImage } from '../lib/api';

// Datei-Auswahl + Upload für Highlight-Fotos. Nutzt die bestehende Browser-
// Komprimierung, aber mit größerer Kante (1600px) als bei Logos – scharf, aber klein.
export function useAddImage(onAdd: (url: string) => void) {
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
        onAdd(await uploadImage(file, { maxDimension: 1600 }));
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
