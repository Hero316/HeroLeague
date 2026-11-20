// ===========================================================================
// Gemeinsamer Unterbau für die KI-Modelle im Backoffice (Freisteller und
// Gesichtserkennung): onnxruntime-web (WASM) einmal laden, Modelldateien
// einmal herunterladen und im Browser-Cache ablegen. Wird nur per dynamischem
// Import geladen – die öffentliche Seite lädt davon nichts.
// ===========================================================================

export type Ort = typeof import('onnxruntime-web/wasm');
export type Session = Awaited<ReturnType<Ort['InferenceSession']['create']>>;

const MODEL_CACHE = 'hl-cutout-model-v1';

let ortP: Promise<Ort> | null = null;

export function loadOrt(): Promise<Ort> {
  if (!ortP) {
    ortP = (async () => {
      const ort = await import('onnxruntime-web/wasm');
      // Die WASM-Datei liefert Vite als eigenes Asset aus (nur bei Bedarf geladen).
      const [wasmUrl, mjsUrl] = await Promise.all([
        import('../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm?url').then((m) => m.default),
        import('../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.mjs?url').then((m) => m.default),
      ]);
      ort.env.wasm.wasmPaths = { wasm: wasmUrl, mjs: mjsUrl };
      ort.env.wasm.numThreads = 1;
      ort.env.logLevel = 'error'; // keine Modell-Hinweise in der Konsole
      return ort;
    })();
    ortP.catch(() => {
      ortP = null;
    });
  }
  return ortP;
}

// Modelldatei laden (erst aus dem Cache, sonst aus dem Netz; mehrere Quellen
// werden der Reihe nach probiert).
async function fetchModel(urls: string[], what: string): Promise<ArrayBuffer> {
  let cache: Cache | null = null;
  try {
    cache = await caches.open(MODEL_CACHE);
  } catch {
    /* kein Cache-API (z. B. privater Modus) – dann eben jedes Mal laden */
  }
  for (const url of urls) {
    try {
      const hit = cache ? await cache.match(url) : undefined;
      if (hit) return await hit.arrayBuffer();
      const res = await fetch(url);
      if (!res.ok) continue;
      if (cache) await cache.put(url, res.clone()).catch(() => {});
      return await res.arrayBuffer();
    } catch {
      /* nächste Variante probieren */
    }
  }
  throw new Error(`${what} konnte nicht geladen werden (Internet?).`);
}

// Sitzung für ein Modell – einmal pro Seite. Ein Fehlschlag wird nicht
// gemerkt, der nächste Versuch lädt neu.
export function modelSession(urls: string[], what: string): () => Promise<{ ort: Ort; session: Session }> {
  let p: Promise<{ ort: Ort; session: Session }> | null = null;
  return () => {
    if (!p) {
      p = (async () => {
        const [ort, model] = await Promise.all([loadOrt(), fetchModel(urls, what)]);
        const session = await ort.InferenceSession.create(model, { executionProviders: ['wasm'], logSeverityLevel: 3 });
        return { ort, session };
      })();
      p.catch(() => {
        p = null;
      });
    }
    return p;
  };
}
