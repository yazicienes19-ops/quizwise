import React, { useState } from 'react';
import { Mail, Lock, User, Loader2 } from 'lucide-react';
import { supabase } from '../services/supabaseClient';

const DEMO_EMAIL = 'demo@quizwise.app';
const DEMO_PASSWORD = 'QuizWise2026!';

export const AuthPage: React.FC = () => {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isDemoLoading, setIsDemoLoading] = useState(false);
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
          options: { data: { full_name: name } },
        });
        if (error) throw error;
        setSuccessMsg('Bestätigungs-E-Mail verschickt! Bitte dein Postfach prüfen.');
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        // App.tsx-Listener setzt user → AuthPage verschwindet automatisch
      }
    } catch (err: any) {
      const msg = err.message || '';
      if (msg.includes('Invalid login')) setError('E-Mail oder Passwort falsch.');
      else if (msg.includes('already registered')) setError('Diese E-Mail ist bereits registriert.');
      else if (msg.includes('Password should')) setError('Passwort muss mindestens 6 Zeichen haben.');
      else setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDemoLogin = async () => {
    setIsDemoLoading(true);
    setError('');
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: DEMO_EMAIL,
        password: DEMO_PASSWORD,
      });
      if (error) throw error;
    } catch (err: any) {
      const msg = err.message || '';
      if (msg.includes('Invalid login')) setError('Demo-Konto: Zugangsdaten ungültig. Bitte neu anlegen.');
      else if (msg.includes('Email not confirmed')) setError('Demo-Konto: E-Mail nicht bestätigt. Bitte im Supabase-Dashboard bestätigen.');
      else setError(`Demo-Login fehlgeschlagen: ${msg}`);
    } finally {
      setIsDemoLoading(false);
    }
  };

  const FEATURES = [
    { label: 'Quiz aus deinen Unterlagen', sub: 'PDFs, Word, Fotos von Notizen' },
    { label: 'Karteikarten & Klausur-Simulation', sub: 'Spaced Repetition & Vollklausuren' },
    { label: 'Lernfortschritt & Feynman-Methode', sub: 'Schwächen erkennen und gezielt üben' },
    { label: 'KI-Agents & StudyFlow', sub: 'Persönlicher Lern-Coach für jeden Tag' },
  ];

  return (
    <div className="min-h-screen flex bg-white dark:bg-slate-950">

      {/* ── Linke Branding-Seite (nur Desktop) ── */}
      <div
        className="hidden lg:flex lg:w-1/2 flex-col justify-between p-12 relative overflow-hidden"
        style={{ background: 'var(--primary, #D97757)' }}
      >
        {/* Hintergrundmuster */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-[-80px] left-[-80px] w-[400px] h-[400px] rounded-full border-[60px] border-white" />
          <div className="absolute bottom-[-120px] right-[-60px] w-[500px] h-[500px] rounded-full border-[80px] border-white" />
        </div>

        {/* Wordmark */}
        <div className="relative z-10 flex items-center gap-3">
          <div className="w-10 h-10 bg-white/20 rounded-[14px] flex items-center justify-center">
            <span className="text-base font-black text-white tracking-tighter">QW</span>
          </div>
          <span className="text-xl font-black uppercase tracking-tighter text-white">
            Quiz<span className="opacity-70">Wise</span>
          </span>
        </div>

        {/* Headline */}
        <div className="relative z-10 space-y-6">
          <div className="space-y-3">
            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-white/60">
              Dein Lernbegleiter fürs Studium
            </p>
            <h1 className="text-4xl font-black tracking-tight text-white leading-tight">
              Lerne smarter,<br />nicht länger.
            </h1>
            <p className="text-base text-white/75 leading-relaxed max-w-sm">
              Lade deine Unterlagen hoch. QuizWise erstellt automatisch Quizze,
              Karteikarten und Klausur-Simulationen.
            </p>
          </div>

          {/* Feature-Liste */}
          <ul className="space-y-3">
            {FEATURES.map((f, i) => (
              <li key={i} className="flex items-start gap-3">
                <div className="mt-0.5 w-5 h-5 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                    <polyline points="1.5,5 3.5,7.5 8.5,2.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-bold text-white">{f.label}</p>
                  <p className="text-[11px] text-white/60">{f.sub}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/* Footer */}
        <p className="relative z-10 text-[10px] text-white/40 font-bold uppercase tracking-widest">
          © 2026 QuizWise
        </p>
      </div>

      {/* ── Rechte Form-Seite ── */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 lg:p-12">

        {/* Mobile-Wordmark */}
        <div className="lg:hidden flex items-center gap-2 mb-10">
          <div
            className="w-9 h-9 rounded-[12px] flex items-center justify-center"
            style={{ background: 'var(--primary, #D97757)' }}
          >
            <span className="text-sm font-black text-white tracking-tighter">QW</span>
          </div>
          <span className="text-lg font-black uppercase tracking-tighter text-slate-900 dark:text-white">
            Quiz<span style={{ color: 'var(--primary, #D97757)' }}>Wise</span>
          </span>
        </div>

        <div className="w-full max-w-sm space-y-8">

          {/* Titel */}
          <div className="space-y-1">
            <h2 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white">
              {mode === 'login' ? 'Willkommen zurück' : 'Konto erstellen'}
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {mode === 'login'
                ? 'Melde dich an, um weiterzulernen.'
                : 'Kostenlos starten, keine Kreditkarte nötig.'}
            </p>
          </div>

          {/* Tab-Toggle */}
          <div className="flex p-1 rounded-2xl bg-slate-100 dark:bg-slate-800">
            {(['login', 'register'] as const).map(m => (
              <button
                key={m}
                onClick={() => { setMode(m); setError(''); setSuccessMsg(''); }}
                className={`flex-1 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                  mode === m
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow'
                    : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
                }`}
              >
                {m === 'login' ? 'Einloggen' : 'Registrieren'}
              </button>
            ))}
          </div>

          {/* Formular */}
          <form onSubmit={handleSubmit} className="space-y-4">
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
                    className="w-full pl-11 pr-4 py-3.5 rounded-2xl text-sm bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white placeholder-slate-400 outline-none focus:ring-2 transition-all"
                    style={{ '--tw-ring-color': 'var(--primary, #D97757)' } as React.CSSProperties}
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
                  className="w-full pl-11 pr-4 py-3.5 rounded-2xl text-sm bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white placeholder-slate-400 outline-none focus:ring-2 transition-all"
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
                  className="w-full pl-11 pr-4 py-3.5 rounded-2xl text-sm bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white placeholder-slate-400 outline-none focus:ring-2 transition-all"
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
              className="w-full py-4 rounded-2xl text-[11px] font-black uppercase tracking-widest text-white transition-all hover:opacity-90 active:scale-95 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              style={{ background: 'var(--primary, #D97757)' }}
            >
              {isLoading
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Bitte warten...</>
                : mode === 'login' ? 'Einloggen' : 'Konto erstellen'}
            </button>
          </form>

          {/* Demo-Login */}
          <div className="relative flex items-center gap-3">
            <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">oder</span>
            <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700" />
          </div>

          <button
            type="button"
            onClick={handleDemoLogin}
            disabled={isDemoLoading || isLoading}
            className="w-full py-3.5 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all hover:opacity-80 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 border-2"
            style={{ borderColor: 'var(--primary, #D97757)', color: 'var(--primary, #D97757)' }}
          >
            {isDemoLoading
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Bitte warten...</>
              : 'Demo ausprobieren'}
          </button>

          <p className="text-center text-[10px] text-slate-400">
            Mit der Nutzung stimmst du unseren Nutzungsbedingungen zu.
          </p>
        </div>
      </div>
    </div>
  );
};
