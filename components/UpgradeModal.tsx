import React, { useState } from 'react';
import { X, Zap, Check, Loader2 } from 'lucide-react';
import { startCheckout } from '../services/stripeService';

interface UpgradeModalProps {
  onClose: () => void;
}

export const UpgradeModal: React.FC<UpgradeModalProps> = ({ onClose }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleUpgrade = async () => {
    setIsLoading(true);
    setError('');
    try {
      await startCheckout(); // leitet zu Stripe weiter
    } catch (e: any) {
      setError(e.message || 'Fehler beim Checkout.');
      setIsLoading(false);
    }
  };

  const features = [
    'Unlimitierte KI-Anfragen',
    'Alle Module freigeschaltet',
    'Klausur-Simulator ohne Limit',
    'Prioritäts-Support',
  ];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="w-full max-w-sm rounded-[32px] shadow-3d-deep animate-in zoom-in-95 duration-300 overflow-hidden"
        style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border-color)' }}
      >
        {/* Header */}
        <div className="p-8 pb-6 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg">
              <Zap className="w-5 h-5 text-white" strokeWidth={2} />
            </div>
            <div>
              <h2 className="text-base font-black dark:text-white uppercase tracking-tight">QuizWise Pro</h2>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Unlimitiert lernen</p>
            </div>
          </div>
          <button aria-label="Schließen" onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors">
            <X className="w-5 h-5" strokeWidth={2} />
          </button>
        </div>

        {/* Preis */}
        <div className="px-8 pb-6">
          <div className="p-6 rounded-[24px] text-center space-y-1" style={{ background: 'color-mix(in srgb, var(--primary) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--primary) 30%, transparent)' }}>
            <p className="text-4xl font-black dark:text-white">4,99 €</p>
            <p className="text-[11px] text-slate-400 font-bold uppercase tracking-widest">pro Monat · jederzeit kündbar</p>
          </div>
        </div>

        {/* Features */}
        <div className="px-8 pb-6 space-y-3">
          {features.map(f => (
            <div key={f} className="flex items-center gap-3">
              <div className="w-5 h-5 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center shrink-0">
                <Check className="w-3 h-3 text-emerald-600" strokeWidth={2.5} />
              </div>
              <p className="text-[12px] font-bold dark:text-white">{f}</p>
            </div>
          ))}
        </div>

        {/* Fehler */}
        {error && (
          <div className="mx-8 mb-4 p-3 bg-rose-50 dark:bg-rose-950/20 rounded-2xl">
            <p className="text-[11px] font-bold text-rose-600">{error}</p>
          </div>
        )}

        {/* Button */}
        <div className="px-8 pb-8">
          <button
            onClick={handleUpgrade}
            disabled={isLoading}
            className="w-full py-4 rounded-2xl text-[11px] font-black uppercase tracking-widest text-white transition-all hover:scale-[1.02] active:scale-95 shadow-lg disabled:opacity-50 flex items-center justify-center gap-2"
            style={{ background: 'var(--primary)' }}
          >
            {isLoading
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Weiterleitung...</>
              : <><Zap className="w-4 h-4" strokeWidth={2} /> Jetzt upgraden</>
            }
          </button>
          <p className="text-center text-[10px] text-slate-400 mt-3">
            Sichere Zahlung über Stripe · Keine versteckten Kosten
          </p>
        </div>
      </div>
    </div>
  );
};
