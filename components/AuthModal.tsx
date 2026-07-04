import React, { useState } from 'react';
import { X, Mail, Lock, User, Loader2, GraduationCap } from 'lucide-react';
import { supabase } from '../services/supabaseClient';

interface AuthModalProps {
  onClose: () => void;
  /** Optional, da AuthModal an mehreren Stellen ohne Erfolgs-Callback gemountet wird (z.B. Landing-/Shared-Deck-Seite) */
  onSuccess?: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ onClose, onSuccess }) => {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');
    setIsLoading(true);

    try {
      if (mode === 'register') {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: name } }
        });
        if (error) throw error;
        setSuccessMsg('Bestätigungs-E-Mail verschickt! Bitte E-Mail bestätigen.');
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        onSuccess?.();
        onClose();
      }
    } catch (err: any) {
      // Supabase-Fehlermeldungen auf Deutsch übersetzen
      const msg = err.message || '';
      if (msg.includes('Invalid login')) setError('E-Mail oder Passwort falsch.');
      else if (msg.includes('already registered')) setError('Diese E-Mail ist bereits registriert.');
      else if (msg.includes('Password should')) setError('Passwort muss mindestens 6 Zeichen haben.');
      else setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="w-full max-w-md rounded-[32px] shadow-3d-deep animate-in zoom-in-95 slide-in-from-bottom-4 duration-300 overflow-hidden"
        style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border-color)' }}
      >
        {/* Header */}
        <div className="p-8 pb-0 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg">
              <GraduationCap className="w-5 h-5 text-white" strokeWidth={1.75} />
            </div>
            <div>
              <h2 className="text-base font-black dark:text-white uppercase tracking-tight">QuizWise</h2>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                {mode === 'login' ? 'Willkommen zurück' : 'Konto erstellen'}
              </p>
            </div>
          </div>
          <button aria-label="Schließen"
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-white transition-all"
            style={{ background: 'color-mix(in srgb, var(--border-color) 60%, var(--bg-sidebar))' }}
          >
            <X className="w-4 h-4" strokeWidth={2} />
          </button>
        </div>

        {/* Mode Toggle */}
        <div className="px-8 pt-6">
          <div className="flex p-1 rounded-2xl" style={{ background: 'color-mix(in srgb, var(--border-color) 40%, var(--bg-main))' }}>
            {(['login', 'register'] as const).map(m => (
              <button
                key={m}
                onClick={() => { setMode(m); setError(''); setSuccessMsg(''); }}
                className={`flex-1 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                  mode === m ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                {m === 'login' ? 'Einloggen' : 'Registrieren'}
              </button>
            ))}
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-8 space-y-4">
          {mode === 'register' && (
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Name</label>
              <div className="relative">
                <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" strokeWidth={1.75} />
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Dein Name"
                  required
                  className="w-full pl-11 pr-4 py-3.5 rounded-2xl text-sm dark:text-white placeholder-slate-400 outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all"
                  style={{ background: 'color-mix(in srgb, var(--border-color) 30%, var(--bg-main))', border: '1px solid var(--border-color)' }}
                />
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">E-Mail</label>
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" strokeWidth={1.75} />
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="deine@email.de"
                required
                className="w-full pl-11 pr-4 py-3.5 rounded-2xl text-sm dark:text-white placeholder-slate-400 outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all"
                style={{ background: 'color-mix(in srgb, var(--border-color) 30%, var(--bg-main))', border: '1px solid var(--border-color)' }}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Passwort</label>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" strokeWidth={1.75} />
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Mindestens 6 Zeichen"
                required
                minLength={6}
                className="w-full pl-11 pr-4 py-3.5 rounded-2xl text-sm dark:text-white placeholder-slate-400 outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all"
                style={{ background: 'color-mix(in srgb, var(--border-color) 30%, var(--bg-main))', border: '1px solid var(--border-color)' }}
              />
            </div>
          </div>

          {error && (
            <div className="p-3 bg-rose-50 dark:bg-rose-950/20 rounded-2xl border border-rose-100 dark:border-rose-900/30">
              <p className="text-[11px] font-bold text-rose-600 dark:text-rose-400">{error}</p>
            </div>
          )}

          {successMsg && (
            <div className="p-3 bg-emerald-50 dark:bg-emerald-950/20 rounded-2xl border border-emerald-100 dark:border-emerald-900/30">
              <p className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400">{successMsg}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-4 rounded-2xl text-[11px] font-black uppercase tracking-widest text-white transition-all hover:scale-[1.02] active:scale-95 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            style={{ background: 'var(--primary)' }}
          >
            {isLoading
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Bitte warten...</>
              : mode === 'login' ? 'Einloggen' : 'Konto erstellen'
            }
          </button>
        </form>
      </div>
    </div>
  );
};
