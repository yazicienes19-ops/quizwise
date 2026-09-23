export type ToastType = 'success' | 'error' | 'info';

/** Optionaler Knopf in einer Meldung, z. B. "Rückgängig". */
export interface ToastAction {
  label: string;
  onClick: () => void;
}

type Handler = (msg: string, type: ToastType, opts?: { action?: ToastAction; durationMs?: number }) => void;
let _handler: Handler | null = null;

export const toast = {
  success: (msg: string) => _handler?.(msg, 'success'),
  error:   (msg: string) => _handler?.(msg, 'error'),
  info:    (msg: string) => _handler?.(msg, 'info'),
  /** Meldung mit Knopf; bleibt so lange stehen, wie der Knopf wirkt. */
  withAction: (msg: string, action: ToastAction, durationMs: number) => _handler?.(msg, 'info', { action, durationMs }),
  _register: (fn: Handler) => { _handler = fn; },
};
