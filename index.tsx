
import React from 'react';
import ReactDOM from 'react-dom/client';
import './app.css';
import App from './App';
import { PwaUpdatePrompt } from './components/PwaUpdatePrompt';
import { I18nProvider } from './i18n/I18nProvider';

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
      <App />
      <PwaUpdatePrompt />
    </I18nProvider>
  </React.StrictMode>
);
