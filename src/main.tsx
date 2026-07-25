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

// Service Worker registrieren: macht die Seite auf Android zuverlässig installierbar.
// Läuft nur im Browser (nicht bei SSR) und stört bei Fehler die App nicht.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => undefined);
  });
}
