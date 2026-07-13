import React, { useEffect, useState } from 'react';
import { Share, SquarePlus, X, Smartphone } from 'lucide-react';

// Chrome/Edge (Android + Desktop) liefern dieses Event, wenn die Seite installierbar ist.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISS_KEY = 'hl-install-dismissed';

// „Zum Home-Bildschirm"-Hinweis über dem Footer:
// - Android/Chrome: echter Installieren-Button (beforeinstallprompt)
// - iOS/Safari: kurze Anleitung (Apple erlaubt keinen programmatischen Trigger)
// - Bereits installiert (Standalone-Modus) oder weggeklickt: nichts anzeigen
export default function InstallPrompt() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState<boolean>(() => localStorage.getItem(DISMISS_KEY) === '1');
  const [isIos, setIsIos] = useState(false);

  useEffect(() => {
    // Läuft die Seite bereits als installierte App? Dann nie anzeigen.
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as unknown as { standalone?: boolean }).standalone === true;
    if (standalone) return;

    const ua = navigator.userAgent;
    setIsIos(/iPhone|iPad|iPod/.test(ua) || (ua.includes('Mac') && 'ontouchend' in document));

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, '1');
    setDismissed(true);
  };

  const install = async () => {
    if (!installEvent) return;
    await installEvent.prompt();
    const choice = await installEvent.userChoice;
    if (choice.outcome === 'accepted') setDismissed(true);
    setInstallEvent(null);
  };

  // Nur zeigen, wenn es etwas Sinnvolles zu zeigen gibt
  if (dismissed || (!installEvent && !isIos)) return null;

  return (
    <div className="max-w-[1320px] mx-auto px-4 sm:px-10 pb-10">
      <div className="relative hl-card rounded-[20px] p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center gap-4">
        <button
          onClick={dismiss}
          aria-label="Hinweis schließen"
          className="absolute top-3 right-3 w-7 h-7 grid place-items-center rounded-full bg-white/5 border border-white/10 text-hl-dim hover:text-white transition-colors cursor-pointer"
        >
          <X className="w-3.5 h-3.5" />
        </button>
        <span className="w-11 h-11 shrink-0 rounded-[13px] bg-[rgba(34,223,201,.12)] border border-[rgba(34,223,201,.25)] grid place-items-center text-brand-accent-light">
          <Smartphone className="w-5 h-5" />
        </span>
        <div className="min-w-0 flex-1 pr-6">
          <div className="font-display font-black text-lg uppercase text-white leading-tight">Hero League als App</div>
          {installEvent ? (
            <p className="font-sans text-[13px] text-hl-mute mt-1">
              Füge die Hero League zum Startbildschirm hinzu — für schnellen Zugriff wie bei einer App.
            </p>
          ) : (
            <p className="font-sans text-[13px] text-hl-mute mt-1 leading-relaxed">
              Auf dem iPhone/iPad: unten <Share className="w-3.5 h-3.5 inline align-[-2px] text-hl-text" />{' '}
              <span className="text-hl-text font-semibold">Teilen</span> antippen, dann{' '}
              <SquarePlus className="w-3.5 h-3.5 inline align-[-2px] text-hl-text" />{' '}
              <span className="text-hl-text font-semibold">„Zum Home-Bildschirm"</span> wählen.
            </p>
          )}
        </div>
        {installEvent && (
          <button
            onClick={install}
            className="shrink-0 inline-flex items-center gap-2 px-5 py-3 rounded-[13px] bg-brand-accent-light text-[#062018] font-sans font-extrabold text-[13px] tracking-wider shadow-[0_10px_30px_rgba(34,223,201,.28)] transition-all hover:-translate-y-0.5 cursor-pointer"
          >
            <SquarePlus className="w-4 h-4" />
            ZUM STARTBILDSCHIRM
          </button>
        )}
      </div>
    </div>
  );
}
