import React from 'react';

interface ErrorBoundaryState {
  hasError: boolean;
}

// Fängt unerwartete Render-Fehler ab, statt eine weiße Seite zu zeigen
export default class ErrorBoundary extends React.Component<React.PropsWithChildren, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('Unerwarteter Fehler:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#060E0F] text-white flex flex-col items-center justify-center font-sans space-y-6 p-6 text-center">
          <span className="text-5xl">⚽</span>
          <div className="space-y-2">
            <h1 className="font-bold text-xl">Da ist etwas schiefgelaufen.</h1>
            <p className="text-sm text-gray-400">Bitte lade die Seite neu. Tritt der Fehler erneut auf, melde dich beim Admin.</p>
          </div>
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-3 bg-blue-500 hover:bg-blue-400 rounded-full text-xs font-bold uppercase tracking-wider text-white cursor-pointer"
          >
            Seite neu laden
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
