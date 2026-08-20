import { useState } from 'react';
import { uploadImage } from '../lib/api';
import type { HighlightAlbum, HighlightMedia } from '../types';
import { toEmbed, youtubeThumb } from '../lib/videoEmbed';

export const genMediaId = () => `hl-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
export const genAlbumId = () => `alb-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

// Erstellzeit aus der ID lesen: IDs haben die Form `hl-<timestamp>-<zufall>`
// bzw. `alb-<timestamp>-<zufall>` (siehe genMediaId/genAlbumId). Der Zeitstempel
// (Date.now(), 13-stellig) steckt zwischen den ersten beiden Bindestrichen.
const createdAt = (id: string): number => {
  const m = /-(\d{10,})-/.exec(id);
  return m ? Number(m[1]) : 0;
};

// Neueste zuerst – strikt nach Erstellzeit (aus der ID), NICHT nur nach
// Speicher-Reihenfolge. Wichtig, weil auf der Startseite mit Stern markierte
// Medien aus mehreren Quellen (lose Highlights + Ordner) zusammengeführt werden:
// Nur so steht der jüngste Beitrag – egal ob Bild oder Link – immer ganz vorne.
// Sortierung ist stabil (gleiche Zeit ⇒ ursprüngliche Reihenfolge bleibt).
export const newestFirst = <T extends { id: string }>(list: T[]): T[] =>
  [...list].sort((a, b) => createdAt(b.id) - createdAt(a.id));

// Baut die Standard-Handler (Bild/Video hinzufügen, löschen, beschriften,
// Stern setzen) für eine Medienliste – wiederverwendet für die losen Highlights
// und für jeden Ordner.
export function mediaListHandlers(list: HighlightMedia[], setList: (next: HighlightMedia[]) => void) {
  return {
    onAddImage: (url: string, ratio?: number) =>
      setList([...list, { id: genMediaId(), type: 'image' as const, url, ...(ratio ? { ratio } : {}) }]),
    // Mehrere frisch hochgeladene Bilder auf einmal anhängen – EIN State-Update,
    // EIN Speichern. Verhindert, dass sich parallele Einzel-Speicherungen beim
    // Mehrfach-Upload gegenseitig überschreiben (Race) oder die Galerie springt.
    onAddImages: (images: { url: string; ratio?: number }[]) =>
      setList([
        ...list,
        ...images.map((im) => ({
          id: genMediaId(),
          type: 'image' as const,
          url: im.url,
          ...(im.ratio ? { ratio: im.ratio } : {}),
        })),
      ]),
    onAddVideo: (url: string) => setList([...list, { id: genMediaId(), type: 'video' as const, url: url.trim() }]),
    // Bereits hochgeladene Medien (aus Mediathek) übernehmen – neue IDs, gleiche
    // URL. So muss ein Foto nie doppelt hochgeladen werden.
    onAddExisting: (media: HighlightMedia[]) =>
      setList([...list, ...media.map((m) => ({ ...m, id: genMediaId(), featured: undefined }))]),
    onDeleteItem: (id: string) => setList(list.filter((m) => m.id !== id)),
    onSetCaption: (id: string, caption: string) =>
      setList(list.map((m) => (m.id === id ? { ...m, caption: caption.trim() || undefined } : m))),
    onToggleFeatured: (id: string) =>
      setList(list.map((m) => (m.id === id ? { ...m, featured: !m.featured || undefined } : m))),
  };
}

// Alle mit Stern markierten Medien einer Konfiguration einsammeln (lose
// Highlights + alle Ordner). Reihenfolge: erst lose, dann je Ordner – so bleibt
// die Auswahl stabil. Grundlage für das Startseiten-Karussell.
export function collectFeatured(items: HighlightMedia[], albums: HighlightAlbum[]): HighlightMedia[] {
  const featured: HighlightMedia[] = items.filter((m) => m.featured);
  for (const album of albums) featured.push(...album.items.filter((m) => m.featured));
  return featured;
}

// Datei-Auswahl + Upload für Highlight-Fotos. Erlaubt die Mehrfach-Auswahl:
// alle Bilder werden nacheinander hochgeladen (mit Zähler), aber erst ganz am
// Ende gemeinsam über `onAddMany` in die Liste geschrieben – EIN State-Update,
// EIN Speichern. So springt die Galerie während des Uploads nicht und es geht
// kein Bild durch parallele Speicherungen verloren. Nutzt die bestehende Browser-
// Komprimierung (1600px, scharf aber klein) und erfasst vorab das Seitenverhältnis
// (Breite/Höhe) fürs Mosaik – so springt das Layout beim Laden nicht.
export function useAddImage(onAddMany: (images: { url: string; ratio?: number }[]) => void) {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const pick = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/png,image/jpeg,image/webp,image/gif';
    input.multiple = true;
    input.onchange = async () => {
      const files = Array.from(input.files ?? []);
      if (files.length === 0) return;
      setBusy(true);
      setProgress({ done: 0, total: files.length });
      const uploaded: { url: string; ratio?: number }[] = [];
      const errors: string[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        try {
          let ratio: number | undefined;
          try {
            const bmp = await createImageBitmap(file);
            if (bmp.width > 0 && bmp.height > 0) ratio = bmp.width / bmp.height;
            bmp.close();
          } catch {
            /* Seitenverhältnis optional – Mosaik misst sonst per onLoad */
          }
          const url = await uploadImage(file, { maxDimension: 1600 });
          uploaded.push({ url, ...(ratio ? { ratio } : {}) });
        } catch (err) {
          errors.push(`${file.name}: ${err instanceof Error ? err.message : 'Fehler'}`);
        } finally {
          setProgress({ done: i + 1, total: files.length });
        }
      }
      if (uploaded.length > 0) onAddMany(uploaded);
      setBusy(false);
      setProgress(null);
      if (errors.length > 0) alert(`Einige Bilder konnten nicht hochgeladen werden:\n${errors.join('\n')}`);
    };
    input.click();
  };

  return { busy, pick, progress };
}

// Cover-Upload für einen Ordner: wie ein Wappen (512px, komprimiert, Transparenz
// bleibt via WebP erhalten). Liefert die fertige URL.
export function useCoverUpload(onUploaded: (url: string) => void) {
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
        onUploaded(await uploadImage(file, { maxDimension: 512 }));
      } catch (err) {
        alert(err instanceof Error ? err.message : 'Fehler beim Cover-Upload.');
      } finally {
        setBusy(false);
      }
    };
    input.click();
  };
  return { busy, pick };
}

// Cover eines Ordners: eigenes Cover (Wappen-Stil, object-contain) bevorzugt,
// sonst erstes Bild bzw. Video-Vorschau (object-cover). null = Platzhalter.
export function albumCoverInfo(album: HighlightAlbum): { url: string; custom: boolean } | null {
  if (album.cover) return { url: album.cover, custom: true };
  const first = album.items.find((m) => m.type === 'image') ?? album.items[0];
  if (!first) return null;
  if (first.type === 'image') return { url: first.url, custom: false };
  const embed = toEmbed(first.url);
  return embed?.youtubeId ? { url: youtubeThumb(embed.youtubeId), custom: false } : null;
}
