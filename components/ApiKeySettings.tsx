
import React, { useState, useEffect } from 'react';
import { X, Key, ExternalLink, Check, AlertTriangle } from 'lucide-react';
import { hasApiKey } from '../services/geminiService';

interface ApiKeySettingsProps {
  onClose: () => void;
}

export const ApiKeySettings: React.FC<ApiKeySettingsProps> = ({ onClose }) => {
  const [inputKey, setInputKey] = useState('');
  const [saved, setSaved] = useState(false);
  const hasCurrent = hasApiKey();

  useEffect(() => {
    const existing = localStorage.getItem('gemini_api_key') || '';
    setInputKey(existing);
  }, []);

  const handleSave = () => {
    const trimmed = inputKey.trim();
    if (trimmed) {
      localStorage.setItem('gemini_api_key', trimmed);
    } else {
      localStorage.removeItem('gemini_api_key');
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleRemove = () => {
    localStorage.removeItem('gemini_api_key');
    setInputKey('');
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="w-full max-w-md rounded-[32px] p-8 shadow-3d-deep space-y-6 animate-in zoom-in-95 slide-in-from-bottom-4 duration-300"
        style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border-color)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg">
              <Key className="w-5 h-5 text-white" strokeWidth={1.75} />
            </div>
            <div>
              <h2 className="text-base font-black dark:text-white uppercase tracking-tight">API-Schlüssel</h2>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Gemini Konfiguration</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-white transition-all active:scale-95"
            style={{ background: 'color-mix(in srgb, var(--border-color) 60%, var(--bg-sidebar))' }}
          >
            <X className="w-4 h-4" strokeWidth={2} />
          </button>
        </div>

        {/* Status banner */}
        {hasCurrent && !inputKey ? (
          <div className="flex items-center gap-3 p-4 bg-emerald-50 dark:bg-emerald-950/20 rounded-2xl border border-emerald-100 dark:border-emerald-900/30">
            <Check className="w-4 h-4 text-emerald-500 shrink-0" strokeWidth={2} />
            <p className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400">API-Schlüssel ist gesetzt und aktiv.</p>
          </div>
        ) : !hasCurrent ? (
          <div className="flex items-center gap-3 p-4 bg-amber-50 dark:bg-amber-950/20 rounded-2xl border border-amber-100 dark:border-amber-900/30">
            <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" strokeWidth={2} />
            <p className="text-[11px] font-bold text-amber-700 dark:text-amber-400">Kein API-Schlüssel gesetzt — KI-Funktionen sind deaktiviert.</p>
          </div>
        ) : null}

        {/* Info */}
        <div className="space-y-3 text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
          <p>Dein Gemini-Schlüssel wird nur lokal in deinem Browser gespeichert und niemals übertragen.</p>
          <a
            href="https://aistudio.google.com/app/apikey"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 font-bold text-indigo-600 dark:text-indigo-400 hover:underline"
          >
            Kostenlosen Schlüssel bei Google AI Studio holen
            <ExternalLink className="w-3 h-3" strokeWidth={2} />
          </a>
        </div>

        {/* Input */}
        <div className="space-y-2">
          <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Gemini API Key</label>
          <input
            type="password"
            value={inputKey}
            onChange={(e) => setInputKey(e.target.value)}
            placeholder="AIza..."
            className="w-full px-4 py-3.5 rounded-2xl text-sm font-mono dark:text-white placeholder-slate-400 outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all"
            style={{
              background: 'color-mix(in srgb, var(--border-color) 30%, var(--bg-main))',
              border: '1px solid var(--border-color)',
            }}
            onKeyDown={(e) => e.key === 'Enter' && handleSave()}
          />
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={handleSave}
            className="flex-1 py-3.5 rounded-2xl text-[11px] font-black uppercase tracking-widest text-white transition-all hover:scale-[1.02] active:scale-95 shadow-lg"
            style={{ background: 'var(--primary)' }}
          >
            {saved ? (
              <span className="flex items-center justify-center gap-2">
                <Check className="w-4 h-4" strokeWidth={2.5} /> Gespeichert
              </span>
            ) : 'Speichern'}
          </button>
          {inputKey && (
            <button
              onClick={handleRemove}
              className="px-5 py-3.5 rounded-2xl text-[11px] font-black uppercase tracking-widest text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/20 transition-all active:scale-95"
              style={{ border: '1px solid var(--border-color)' }}
            >
              Löschen
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
