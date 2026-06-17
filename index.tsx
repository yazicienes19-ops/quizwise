
import React from 'react';
import ReactDOM from 'react-dom/client';
import './app.css';
import App from './App';

// Wenn der SW eine leere/fehlerhafte Seite liefert: automatisch alles leeren und neu laden.
// Tritt vor allem in Safari auf wenn ein alter SW gecacht ist.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(regs => {
    regs.forEach(reg => reg.update());
  });

  // Prüfe nach 4s ob React gemountet hat — wenn nicht, SW-Cache leeren + Reload
  setTimeout(() => {
    if ((document.getElementById('root')?.childElementCount ?? 0) === 0) {
      navigator.serviceWorker.getRegistrations()
        .then(regs => Promise.all(regs.map(r => r.unregister())))
        .then(() => caches.keys())
        .then(names => Promise.all(names.map(n => caches.delete(n))))
        .then(() => window.location.reload());
    }
  }, 4000);
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
