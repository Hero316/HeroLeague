// Bild herunterladen. Blob-URLs liegen auf einer anderen Domain (Vercel Blob),
// daher zieht das `download`-Attribut allein nicht zuverlässig. Deshalb laden wir
// die Datei per fetch als Blob und speichern sie über eine Object-URL. Klappt das
// nicht (z. B. blockierter Fetch), öffnen wir das Bild als Fallback im neuen Tab –
// dort kann man es lange gedrückt halten / mit Rechtsklick speichern.
export async function downloadImage(url: string, filename?: string): Promise<void> {
  const fallbackName =
    filename?.trim() || url.split('/').pop()?.split('?')[0] || `hero-league-${Date.now()}.jpg`;

  try {
    const res = await fetch(url, { mode: 'cors' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
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
