// Fehler-Telemetrie: unbehandelte JS-Fehler landen im Backend (Railway-Log +
// Supabase client_errors) — damit Crashes wie der QuotaExceededError vom
// 19.07. sofort sichtbar werden statt erst, wenn ein Nutzer die Konsole öffnet.
// Anonym: keine Nutzerdaten, nur Fehlertext, URL, Browser, Bundle-Version.

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000';
const MAX_REPORTS_PER_SESSION = 5;

/** Bekanntes Rauschen, das keine echten App-Fehler sind. */
const IGNORED = [
  /^Script error\.?$/,                 // Cross-Origin (Browser-Extensions etc.)
  /ResizeObserver loop/,
];

let sent = 0;
const seen = new Set<string>();

export function reportClientError(message: unknown, stack?: string, source = 'window'): void {
  try {
    const msg = String(message ?? '').trim();
    if (!msg || IGNORED.some(rx => rx.test(msg))) return;
    const key = msg.slice(0, 120);
    if (sent >= MAX_REPORTS_PER_SESSION || seen.has(key)) return;
    seen.add(key);
    sent++;
    const bundle = (document.querySelector('script[src*="index-"]') as HTMLScriptElement | null)
      ?.src.match(/index-[\w-]+\.js/)?.[0] ?? '';
    fetch(`${BACKEND_URL}/api/client-error`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: msg.slice(0, 500),
        stack: String(stack ?? '').slice(0, 2000),
        source,
        url: location.href.slice(0, 200),
        userAgent: navigator.userAgent.slice(0, 300),
        appVersion: bundle,
      }),
      // keepalive: Meldung übersteht auch ein sofort folgendes Reload/Schließen
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Der Melder selbst darf niemals ein Problem verursachen
  }
}

export function initErrorReporter(): void {
  window.addEventListener('error', e => {
    reportClientError(e.message || e.error, (e.error as Error | undefined)?.stack, 'onerror');
  });
  window.addEventListener('unhandledrejection', e => {
    const r = e.reason as { message?: string; stack?: string } | undefined;
    reportClientError(r?.message ?? String(e.reason ?? '').slice(0, 300), r?.stack, 'promise');
  });
}
