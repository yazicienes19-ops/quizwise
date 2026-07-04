
import React, { useState, useEffect, useCallback } from 'react';
import { CheckCircle, XCircle, Info, X } from 'lucide-react';
import { toast, type ToastType } from '../services/toast';

interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
}

const icons: Record<ToastType, React.ReactNode> = {
  success: <CheckCircle className="w-5 h-5 shrink-0" strokeWidth={2} />,
  error:   <XCircle    className="w-5 h-5 shrink-0" strokeWidth={2} />,
  info:    <Info       className="w-5 h-5 shrink-0" strokeWidth={2} />,
};

const styles: Record<ToastType, string> = {
  success: 'bg-emerald-600 text-white',
  error:   'bg-rose-600    text-white',
  info:    'bg-slate-800   text-white dark:bg-slate-700',
};

export const ToastContainer: React.FC = () => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const add = useCallback((message: string, type: ToastType) => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
  }, []);

  useEffect(() => { toast._register(add); }, [add]);

  const remove = (id: number) => setToasts(prev => prev.filter(t => t.id !== id));

  return (
    <div className="fixed top-6 right-6 z-[9999] flex flex-col gap-3 pointer-events-none" aria-live="polite" role="status">
      {toasts.map(t => (
        <div
          key={t.id}
          role={t.type === 'error' ? 'alert' : undefined}
          className={`flex items-center gap-3 px-5 py-4 rounded-2xl shadow-3d-deep text-sm font-semibold pointer-events-auto animate-in slide-in-from-right-4 duration-300 max-w-sm ${styles[t.type]}`}
        >
          {icons[t.type]}
          <span className="flex-1">{t.message}</span>
          <button onClick={() => remove(t.id)} aria-label="Meldung schließen" className="opacity-60 hover:opacity-100 transition-opacity ml-1">
            <X className="w-4 h-4" strokeWidth={2} />
          </button>
        </div>
      ))}
    </div>
  );
};
