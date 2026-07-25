import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Share, SquarePlus, X, Smartphone, MoreVertical } from 'lucide-react';
import { useInstall } from './InstallProvider';

// „Zum Home-Bildschirm"-Angebot:
// - Auto-Banner über dem Footer (bis es installiert oder weggeklickt wird)
// - Hilfe-Dialog, der jederzeit über den Footer-Eintrag „App installieren" erreichbar ist
//   (auch nachdem das Banner weggeklickt wurde)
// In beiden Fällen gilt:
// - Android/Chrome: echter Installieren-Button (beforeinstallprompt)
// - iOS/Safari: kurze Anleitung (Apple erlaubt keinen programmatischen Trigger)
// - Sonst: Hinweis auf das Browser-Menü

// Android/Chrome: echter Installieren-Button.
function InstallButton() {
  const { promptInstall } = useInstall();
  return (
    <button
      onClick={promptInstall}
      className="shrink-0 inline-flex items-center gap-2 px-5 py-3 rounded-[13px] bg-brand-accent-light text-[#062018] font-sans font-extrabold text-[13px] tracking-wider shadow-[0_10px_30px_rgba(34,223,201,.28)] transition-all hover:-translate-y-0.5 cursor-pointer"
    >
      <SquarePlus className="w-4 h-4" />
      ZUM STARTBILDSCHIRM
    </button>
  );
}

// iOS/Safari: Anleitung zum manuellen Hinzufügen.
function IosHint() {
  return (
    <p className="font-sans text-[13px] text-hl-mute mt-1 leading-relaxed">
      Auf dem iPhone/iPad: unten <Share className="w-3.5 h-3.5 inline align-[-2px] text-hl-text" />{' '}
      <span className="text-hl-text font-semibold">Teilen</span> antippen, dann{' '}
      <SquarePlus className="w-3.5 h-3.5 inline align-[-2px] text-hl-text" />{' '}
      <span className="text-hl-text font-semibold">„Zum Home-Bildschirm"</span> wählen.
    </p>
  );
}

// Fallback (z.B. Android, wenn der Button noch nicht bereitsteht, oder Desktop):
// Weg über das Browser-Menü.
function MenuHint() {
  return (
    <p className="font-sans text-[13px] text-hl-mute mt-1 leading-relaxed">
      Öffne das Browser-Menü <MoreVertical className="w-3.5 h-3.5 inline align-[-2px] text-hl-text" /> und
      wähle <span className="text-hl-text font-semibold">„App installieren"</span> bzw.{' '}
      <span className="text-hl-text font-semibold">„Zum Startbildschirm hinzufügen"</span>.
    </p>
  );
}

// Kleines Handy-Icon links in der Karte.
function InstallIcon() {
  return (
    <span className="w-11 h-11 shrink-0 rounded-[13px] bg-[rgba(34,223,201,.12)] border border-[rgba(34,223,201,.25)] grid place-items-center text-brand-accent-light">
      <Smartphone className="w-5 h-5" />
    </span>
  );
}

// Auto-Banner über dem Footer.
function Banner() {
  const { canInstall, isIos, isStandalone, bannerDismissed, dismissBanner } = useInstall();

  // Nur zeigen, wenn es etwas Sinnvolles zu zeigen gibt und nicht bereits installiert/weggeklickt.
  if (isStandalone || bannerDismissed || (!canInstall && !isIos)) return null;

  return (
    <div className="max-w-[1320px] mx-auto px-4 sm:px-10 pb-10">
      <div className="relative hl-card rounded-[20px] p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center gap-4">
        <button
          onClick={dismissBanner}
          aria-label="Hinweis schließen"
          className="absolute top-3 right-3 w-7 h-7 grid place-items-center rounded-full bg-white/5 border border-white/10 text-hl-dim hover:text-white transition-colors cursor-pointer"
        >
          <X className="w-3.5 h-3.5" />
        </button>
        <InstallIcon />
        <div className="min-w-0 flex-1 pr-6">
          <div className="font-display font-black text-lg uppercase text-white leading-tight">Hero League als App</div>
          {canInstall ? (
            <p className="font-sans text-[13px] text-hl-mute mt-1">
              Füge die Hero League zum Startbildschirm hinzu — für schnellen Zugriff wie bei einer App.
            </p>
          ) : (
            <IosHint />
          )}
        </div>
        {canInstall && <InstallButton />}
      </div>
    </div>
  );
}

// Hilfe-Dialog, geöffnet über den dauerhaften Footer-Eintrag.
function HelpDialog() {
  const { helpOpen, closeHelp, canInstall, isIos } = useInstall();

  useEffect(() => {
    if (!helpOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeHelp();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [helpOpen, closeHelp]);

  if (!helpOpen) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
      onClick={closeHelp}
      role="dialog"
      aria-modal="true"
      aria-label="Hero League als App installieren"
    >
      <div
        className="relative hl-card rounded-[20px] p-6 w-full max-w-[440px]"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={closeHelp}
          aria-label="Schließen"
          className="absolute top-3 right-3 w-8 h-8 grid place-items-center rounded-full bg-white/5 border border-white/10 text-hl-dim hover:text-white transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
        <div className="flex items-center gap-4">
          <InstallIcon />
          <div className="font-display font-black text-lg uppercase text-white leading-tight pr-6">
            Hero League als App
          </div>
        </div>
        <div className="mt-3">
          {canInstall ? (
            <>
              <p className="font-sans text-[13px] text-hl-mute leading-relaxed">
                Füge die Hero League zum Startbildschirm hinzu — für schnellen Zugriff wie bei einer App.
              </p>
              <div className="mt-4">
                <InstallButton />
              </div>
            </>
          ) : isIos ? (
            <IosHint />
          ) : (
            <MenuHint />
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

export default function InstallPrompt() {
  return (
    <>
      <Banner />
      <HelpDialog />
    </>
  );
}
