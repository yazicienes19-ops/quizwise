import React, { useEffect, useRef, useState } from 'react';
// @ts-ignore — virtuelles Modul von vite-plugin-pwa, erst zur Build-Zeit aufgelöst
import { registerSW } from 'virtual:pwa-register';
import { useTranslation } from '../i18n/I18nProvider';

/**
 * Zeigt eine kleine Leiste „Neue Version verfügbar", sobald ein neuer
 * Service Worker bereitsteht. Der Nutzer entscheidet selbst, wann neu geladen
 * wird — so geht keine laufende Quiz-/Lern-Session verloren und es können keine
 * veralteten Lazy-Chunks (404) mitten in der Sitzung auftreten.
 */
export const PwaUpdatePrompt: React.FC = () => {
  const { t } = useTranslation();
  const [needRefresh, setNeedRefresh] = useState(false);
  const updateRef = useRef<((reload?: boolean) => Promise<void>) | null>(null);
  const regRef = useRef<ServiceWorkerRegistration | null>(null);

  useEffect(() => {
    try {
      updateRef.current = registerSW({
        immediate: true,
        onNeedRefresh() { setNeedRefresh(true); },
        onRegisteredSW(_swUrl: string, reg?: ServiceWorkerRegistration) {
          if (!reg) return;
          regRef.current = reg;

          // Wartet bereits ein neuer SW aus einem FRÜHEREN Besuch, feuert
          // `updatefound` (und damit onNeedRefresh) nie wieder — der Nutzer
          // sähe für immer die alte Version. Deshalb hier direkt prüfen.
          if (reg.waiting) setNeedRefresh(true);

          const check = () => { reg.update().catch(() => {}); };
          // Browser drosseln update() in Hintergrund-Tabs — deshalb
          // zusätzlich beim Zurückkehren in den Tab und bei Netz-Rückkehr.
          document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') check();
          });
          window.addEventListener('online', check);
          setInterval(check, 60_000);
        },
      });
    } catch {
      // Service Worker nicht verfügbar (z. B. privates Fenster) — still ignorieren
    }
  }, []);

  const applyUpdate = async () => {
    const GUARD_KEY = 'quizwise_sw_reload_at';
    const unregisterAll = async () => {
      try {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map(r => r.unregister()));
      } catch {}
    };

    // Reload-Schleifen-Bremse: Hat DIESES Banner vor Kurzem schon einen Reload
    // ausgelöst und der Worker hängt immer noch fest (z.B. mehrere wartende
    // Versionen nach mehreren Deploys), dann die Registrierung komplett lösen —
    // der nächste Load installiert den neuesten Worker frisch, Schleife beendet.
    const last = Number(sessionStorage.getItem(GUARD_KEY) || 0);
    if (Date.now() - last < 20_000) {
      await unregisterAll();
      sessionStorage.removeItem(GUARD_KEY);
      window.location.reload();
      return;
    }
    sessionStorage.setItem(GUARD_KEY, String(Date.now()));

    const waiting = regRef.current?.waiting;
    if (waiting) {
      // Wartendem SW direkt skipWaiting schicken und nach der Übernahme neu
      // laden — funktioniert auch, wenn registerSW den Wechsel intern nicht
      // mitbekommen hat (der Fall „waiting aus früherem Besuch").
      let done = false;
      navigator.serviceWorker.addEventListener(
        'controllerchange',
        () => { if (!done) { done = true; window.location.reload(); } },
        { once: true },
      );
      waiting.postMessage({ type: 'SKIP_WAITING' });
      window.setTimeout(async () => {
        if (done) return;
        done = true;
        // skipWaiting kam nicht durch (festgefahrener Worker): lösen statt
        // blind neu zu laden — sonst Banner→Reload→Banner in Endlosschleife.
        if (regRef.current?.waiting) await unregisterAll();
        window.location.reload();
      }, 3000);
    } else {
      updateRef.current?.(true);
    }
  };

  if (!needRefresh) return null;

  return (
    <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[10000] flex items-center gap-4 px-5 py-3 rounded-2xl bg-slate-900 text-white shadow-3d-deep border border-white/10 animate-in slide-in-from-bottom-4 duration-300 max-w-[calc(100vw-2rem)]">
      <span className="text-sm font-semibold whitespace-nowrap">{t('pwa.newVersion')}</span>
      <button
        onClick={applyUpdate}
        className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-[11px] font-black uppercase tracking-widest transition-colors shrink-0"
      >
        {t('pwa.reload')}
      </button>
      <button
        onClick={() => setNeedRefresh(false)}
        className="text-white/50 hover:text-white text-xs shrink-0"
      >
        {t('pwa.later')}
      </button>
    </div>
  );
};
