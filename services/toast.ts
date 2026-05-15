
export type ToastType = 'success' | 'error' | 'info';

let _handler: ((msg: string, type: ToastType) => void) | null = null;

export const toast = {
  success: (msg: string) => _handler?.(msg, 'success'),
  error:   (msg: string) => _handler?.(msg, 'error'),
  info:    (msg: string) => _handler?.(msg, 'info'),
  _register: (fn: (msg: string, type: ToastType) => void) => { _handler = fn; },
};
