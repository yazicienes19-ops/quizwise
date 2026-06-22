import React, { useEffect, useRef, useState } from 'react';
// @ts-ignore — virtuelles Modul von vite-plugin-pwa, erst zur Build-Zeit aufgelöst
import { registerSW } from 'virtual:pwa-register';

/**
 * Zeigt eine kleine Leiste „Neue Version verfügbar", sobald ein neuer
 * Service Worker bereitsteht. Der Nutzer entscheidet selbst, wann neu geladen
 * wird — so geht keine laufende Quiz-/Lern-Session verloren und es können keine
 * veralteten Lazy-Chunks (404) mitten in der Sitzung auftreten.
 */
export const PwaUpdatePrompt: React.FC = () => {
  const [needRefresh, setNeedRefresh] = useState(false);
  const updateRef = useRef<((reload?: boolean) => Promise<void>) | null>(null);

  useEffect(() => {
    try {
      updateRef.current = registerSW({
        immediate: true,
        onNeedRefresh() { setNeedRefresh(true); },
        onRegisteredSW(_swUrl: string, reg?: ServiceWorkerRegistration) {
          // Alle 60 s prüfen, ob ein neuer Build deployed wurde
          if (reg) setInterval(() => { reg.update().catch(() => {}); }, 60_000);
        },
      });
    } catch {
      // Service Worker nicht verfügbar (z. B. privates Fenster) — still ignorieren
    }
  }, []);

  if (!needRefresh) return null;

  return (
    <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[10000] flex items-center gap-4 px-5 py-3 rounded-2xl bg-slate-900 text-white shadow-3d-deep border border-white/10 animate-in slide-in-from-bottom-4 duration-300 max-w-[calc(100vw-2rem)]">
      <span className="text-sm font-semibold whitespace-nowrap">Neue Version verfügbar</span>
      <button
        onClick={() => updateRef.current?.(true)}
        className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-[11px] font-black uppercase tracking-widest transition-colors shrink-0"
      >
        Neu laden
      </button>
      <button
        onClick={() => setNeedRefresh(false)}
        className="text-white/50 hover:text-white text-xs shrink-0"
      >
        Später
      </button>
    </div>
  );
};
