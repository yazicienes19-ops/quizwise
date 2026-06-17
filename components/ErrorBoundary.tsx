import React from 'react';

interface EBState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundaryImpl extends React.Component<React.PropsWithChildren<{}>, EBState> {
  constructor(props: React.PropsWithChildren<{}>) {
    super(props);
    (this as any).state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): EBState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('ErrorBoundary:', error, info.componentStack);
  }

  render() {
    const state = (this as any).state as EBState;
    const props = (this as any).props as React.PropsWithChildren<{}>;
    if (!state.hasError) return props.children;

    return (
      <div className="min-h-screen flex items-center justify-center p-8" style={{ background: 'var(--bg-main)', color: 'var(--text-main)' }}>
        <div className="max-w-md w-full text-center space-y-6">
          <div className="w-16 h-16 mx-auto rounded-full bg-rose-100 dark:bg-rose-900/30 flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-rose-500">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
          </div>
          <h1 className="text-xl font-black">Etwas ist schiefgelaufen</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
            Ein unerwarteter Fehler ist aufgetreten. Lade die Seite neu, um fortzufahren.
          </p>
          {state.error && (
            <pre className="text-[10px] text-left bg-slate-100 dark:bg-slate-800/50 p-3 rounded-xl overflow-auto max-h-32 text-slate-600 dark:text-slate-400">
              {state.error.message}
            </pre>
          )}
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest text-white"
            style={{ background: 'var(--primary)' }}
          >
            Seite neu laden
          </button>
        </div>
      </div>
    );
  }
}

export { ErrorBoundaryImpl as ErrorBoundary };
