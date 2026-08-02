
import React from 'react';
import ReactDOM from 'react-dom/client';
import './app.css';
import App from './App';
import { PwaUpdatePrompt } from './components/PwaUpdatePrompt';
import { I18nProvider } from './i18n/I18nProvider';
import { ErrorBoundary } from './components/ErrorBoundary';
import { initErrorReporter } from './services/errorReporter';

// So früh wie möglich: ab hier werden unbehandelte Fehler gemeldet
initErrorReporter();

// SW-Updates früh anstoßen. Die Leerseiten-Selbstheilung lebt in index.html
// (mit Einmal-Bremse pro Sitzung) — der frühere ungebremste 4s-Reload hier
// erzeugte bei Startup-Crashes eine Endlos-Schleife.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(regs => {
    regs.forEach(reg => reg.update());
  });
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

// Offizieller Development Harness des Knowledge Graph (s. components/GraphDevHarness.tsx)
// — dauerhafte Entwicklungsinfrastruktur, kein Produktfeature. Zweifach
// abgesichert: import.meta.env.DEV ist in einem Produktions-Build statisch
// `false`, wodurch Vite/Rollup den untenstehenden dynamischen Import
// vollständig aus dem Bundle eliminieren (kein Code, keine Erreichbarkeit,
// keine Bundle-Größe in Produktion — verifiziert per `npm run build` + Grep
// auf den Output). Zusätzlich nur bei explizitem Query-Parameter, damit er
// auch im normalen `npm run dev` nicht ungefragt die App verdrängt.
const isGraphDevHarness = import.meta.env.DEV && new URLSearchParams(window.location.search).has('graphDevHarness');
const GraphDevHarnessLazy = isGraphDevHarness
  ? React.lazy(() => import('./components/GraphDevHarness').then(m => ({ default: m.GraphDevHarness })))
  : null;

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    {GraphDevHarnessLazy ? (
      // I18nProvider seit Phase 2 (Wissensnetz-Seitenpanel) nötig — GraphNodeDetailPanel
      // nutzt useTranslation() für seine Chrome-Texte, exakt wie GraphSystem.tsx
      // es in der echten App auch bräuchte.
      <I18nProvider>
        <React.Suspense fallback={null}>
          <GraphDevHarnessLazy />
        </React.Suspense>
      </I18nProvider>
    ) : (
      <I18nProvider>
        {/* Äußerste Auffanglinie: Nutzer sehen nie wieder eine Leerseite, sondern
            einen Fehler-Bildschirm mit Neu-laden — und der Crash wird gemeldet. */}
        <ErrorBoundary>
          <App />
          <PwaUpdatePrompt />
        </ErrorBoundary>
      </I18nProvider>
    )}
  </React.StrictMode>
);
