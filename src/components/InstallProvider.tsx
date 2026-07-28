import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

// Chrome/Edge (Android + Desktop) liefern dieses Event, wenn die Seite installierbar ist.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISS_KEY = 'hl-install-dismissed';

interface InstallContextValue {
  /** Android/Chrome: echtes Installieren ist möglich (beforeinstallprompt liegt vor). */
  canInstall: boolean;
  /** iPhone/iPad: nur Anleitung möglich (Apple erlaubt keinen programmatischen Trigger). */
  isIos: boolean;
  /** Läuft bereits als installierte App? Dann nichts anbieten. */
  isStandalone: boolean;
  /** Auto-Banner (über dem Footer) wurde weggeklickt. */
  bannerDismissed: boolean;
  /** Auto-Banner dauerhaft ausblenden (im Browser gespeichert). */
  dismissBanner: () => void;
  /** Nativen Installations-Dialog auslösen (nur wenn canInstall). */
  promptInstall: () => Promise<void>;
  /** Hilfe-Dialog (vom Footer aus erreichbar) offen? */
  helpOpen: boolean;
  openHelp: () => void;
  closeHelp: () => void;
}

const InstallContext = createContext<InstallContextValue | null>(null);

// Stellt den Installations-Zustand app-weit bereit, damit sowohl das Auto-Banner
// als auch der dauerhafte Footer-Eintrag „App installieren" dieselbe Logik nutzen.
// Wird einmal beim App-Start montiert, damit das beforeinstallprompt-Event nicht
// verpasst wird (es feuert früh und nur ein einziges Mal).
export function InstallProvider({ children }: { children: React.ReactNode }) {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [isIos, setIsIos] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState<boolean>(
    () => localStorage.getItem(DISMISS_KEY) === '1',
  );
  const [helpOpen, setHelpOpen] = useState(false);

  useEffect(() => {
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as unknown as { standalone?: boolean }).standalone === true;
    setIsStandalone(standalone);
    if (standalone) return;

    const ua = navigator.userAgent;
    setIsIos(/iPhone|iPad|iPod/.test(ua) || (ua.includes('Mac') && 'ontouchend' in document));

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as BeforeInstallPromptEvent);
    };
    // Ist die App installiert worden, verschwindet das Angebot wieder.
    const onInstalled = () => {
      setInstallEvent(null);
      setHelpOpen(false);
      setIsStandalone(true);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const dismissBanner = useCallback(() => {
    localStorage.setItem(DISMISS_KEY, '1');
    setBannerDismissed(true);
  }, []);

  const promptInstall = useCallback(async () => {
    if (!installEvent) return;
    await installEvent.prompt();
    await installEvent.userChoice;
    // Ein beforeinstallprompt-Event lässt sich nur einmal verwenden.
    setInstallEvent(null);
  }, [installEvent]);

  const openHelp = useCallback(() => setHelpOpen(true), []);
  const closeHelp = useCallback(() => setHelpOpen(false), []);

  const value = useMemo<InstallContextValue>(
    () => ({
      canInstall: installEvent !== null,
      isIos,
      isStandalone,
      bannerDismissed,
      dismissBanner,
      promptInstall,
      helpOpen,
      openHelp,
      closeHelp,
    }),
    [installEvent, isIos, isStandalone, bannerDismissed, dismissBanner, promptInstall, helpOpen, openHelp, closeHelp],
  );

  return <InstallContext.Provider value={value}>{children}</InstallContext.Provider>;
}

export function useInstall(): InstallContextValue {
  const ctx = useContext(InstallContext);
  if (!ctx) throw new Error('useInstall muss innerhalb von <InstallProvider> verwendet werden');
  return ctx;
}
