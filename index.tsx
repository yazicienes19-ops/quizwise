
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

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <I18nProvider>
      {/* Äußerste Auffanglinie: Nutzer sehen nie wieder eine Leerseite, sondern
          einen Fehler-Bildschirm mit Neu-laden — und der Crash wird gemeldet. */}
      <ErrorBoundary>
        <App />
        <PwaUpdatePrompt />
      </ErrorBoundary>
    </I18nProvider>
  </React.StrictMode>
);
