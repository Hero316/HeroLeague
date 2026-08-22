import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import ErrorBoundary from './components/ErrorBoundary.tsx';
import { InstallProvider } from './components/InstallProvider.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <InstallProvider>
        <App />
      </InstallProvider>
    </ErrorBoundary>
  </StrictMode>,
);

// App ist erfolgreich gestartet → Selbstheilungs-Sperre lösen, damit ein
// späterer Deploy in einer neuen Sitzung wieder heilen darf.
try {
  sessionStorage.removeItem('hl-recovered');
} catch {
  /* ignore */
}

// Service Worker registrieren: macht die Seite auf Android zuverlässig installierbar.
// WICHTIG: In der Team-App (/chat) mit Scope '/chat' registrieren, damit Push-
// Benachrichtigungen UND die Zahl am App-Icon der TEAM-APP („Hero Team") zugeordnet
// werden – nicht der Website-App („Hero League"). Beide Apps teilten sich sonst den
// einen Scope-'/'-Worker, wodurch Android alles der Website-App zurechnete.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    const scope = location.pathname.startsWith('/chat') ? '/chat' : '/';
    navigator.serviceWorker.register('/sw.js', { scope }).catch(() => undefined);
  });
}
