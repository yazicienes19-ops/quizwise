
import React, { useState } from 'react';

interface LandingPageProps {
  onAuthClick: (mode?: 'login' | 'register') => void;
}

const features = [
  {
    icon: '🤖',
    title: 'Karteikarten',
    desc: 'PDF oder Text hochladen: QuizWise erstellt sofort einen kompletten Kartenstapel.',
    color: 'indigo',
  },
  {
    icon: '🔁',
    title: 'Spaced Repetition',
    desc: 'SM-2 Algorithmus wie Anki. Du siehst Karten genau dann, wenn du sie vergessen würdest.',
    color: 'emerald',
  },
  {
    icon: '📝',
    title: 'Intelligente Quizze',
    desc: 'Multiple Choice, Lückentexte und offene Fragen aus deinen eigenen Unterlagen.',
    color: 'amber',
  },
  {
    icon: '🧠',
    title: 'Feynman-Methode',
    desc: 'Erkläre ein Konzept in eigenen Worten und QuizWise bewertet dein Verständnis.',
    color: 'rose',
  },
  {
    icon: '📊',
    title: 'Klausur-Simulator',
    desc: 'Zeitdruck, Notenskala (1,0–5,0) und PDF-Export mit Feedback pro Frage.',
    color: 'blue',
  },
  {
    icon: '⚡',
    title: 'Streak & Motivation',
    desc: 'Tägliche Lernsträhnen, Fortschritts-Badges und ein Blick auf deine Schwachstellen.',
    color: 'violet',
  },
];

const colorMap: Record<string, { bg: string; text: string; ring: string }> = {
  indigo: { bg: 'bg-indigo-100 dark:bg-indigo-900/30', text: 'text-indigo-600 dark:text-indigo-400', ring: 'ring-indigo-200 dark:ring-indigo-800' },
  emerald: { bg: 'bg-emerald-100 dark:bg-emerald-900/30', text: 'text-emerald-600 dark:text-emerald-400', ring: 'ring-emerald-200 dark:ring-emerald-800' },
  amber: { bg: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-amber-600 dark:text-amber-400', ring: 'ring-amber-200 dark:ring-amber-800' },
  rose: { bg: 'bg-rose-100 dark:bg-rose-900/30', text: 'text-rose-600 dark:text-rose-400', ring: 'ring-rose-200 dark:ring-rose-800' },
  blue: { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-600 dark:text-blue-400', ring: 'ring-blue-200 dark:ring-blue-800' },
  violet: { bg: 'bg-violet-100 dark:bg-violet-900/30', text: 'text-violet-600 dark:text-violet-400', ring: 'ring-violet-200 dark:ring-violet-800' },
};

export const LandingPage: React.FC<LandingPageProps> = ({ onAuthClick }) => {
  const [darkMode] = useState(() => document.documentElement.classList.contains('dark'));

  return (
    <div className="min-h-screen bg-white dark:bg-slate-950 text-slate-900 dark:text-white">

      {/* Nav */}
      <nav className="sticky top-0 z-40 bg-white/80 dark:bg-slate-950/80 backdrop-blur-xl border-b border-slate-100 dark:border-slate-800">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl font-black tracking-tight" style={{ color: 'var(--primary)' }}>Quiz</span>
            <span className="text-xl font-black tracking-tight dark:text-white">Wise</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => onAuthClick('login')}
              className="px-4 py-2 text-[11px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
            >
              Anmelden
            </button>
            <button
              onClick={() => onAuthClick('register')}
              className="px-5 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-widest text-white shadow-lg hover:scale-105 transition-all"
              style={{ background: 'var(--primary)' }}
            >
              Kostenlos starten
            </button>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-6 pt-24 pb-20 text-center">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-200 dark:border-indigo-800 mb-8">
          <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
          <span className="text-[10px] font-black uppercase tracking-widest text-indigo-600 dark:text-indigo-400">Cleveres Lernen fürs Studium</span>
        </div>

        <h1 className="text-6xl sm:text-7xl lg:text-8xl font-black tracking-tighter leading-[0.9] mb-6">
          Lerne <span style={{ color: 'var(--primary)' }}>smarter.</span><br />
          Nicht mehr.
        </h1>

        <p className="text-xl text-slate-500 dark:text-slate-400 max-w-2xl mx-auto mb-12 leading-relaxed">
          Lade deine Unterlagen hoch. QuizWise erstellt daraus Karteikarten, Quizze und Klausuren.
          Spaced Repetition sorgt dafür, dass du nichts vergisst.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <button
            onClick={() => onAuthClick('register')}
            className="px-8 py-4 rounded-2xl text-[13px] font-black uppercase tracking-widest text-white shadow-2xl hover:scale-105 active:scale-95 transition-all"
            style={{ background: 'var(--primary)' }}
          >
            Jetzt kostenlos starten →
          </button>
          <button
            onClick={() => onAuthClick('login')}
            className="px-8 py-4 rounded-2xl text-[13px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all"
          >
            Bereits registriert
          </button>
        </div>

        <p className="mt-6 text-[11px] text-slate-400 uppercase tracking-widest">
          Kostenlos · Kein Abo nötig · DSGVO-konform
        </p>
      </section>

      {/* Features */}
      <section className="max-w-6xl mx-auto px-6 py-20 border-t border-slate-100 dark:border-slate-800">
        <div className="text-center mb-14">
          <p className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-400 mb-3">Features</p>
          <h2 className="text-4xl sm:text-5xl font-black tracking-tighter">Alles was du zum Lernen brauchst.</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map(f => {
            const cls = colorMap[f.color];
            return (
              <div
                key={f.title}
                className={`p-6 rounded-[28px] border-2 bg-white dark:bg-slate-900 border-slate-100 dark:border-slate-800 hover:border-indigo-200 dark:hover:border-indigo-800 transition-all group`}
              >
                <div className={`w-12 h-12 rounded-2xl ${cls.bg} flex items-center justify-center text-2xl mb-4 ring-1 ${cls.ring}`}>
                  {f.icon}
                </div>
                <h3 className="text-lg font-black mb-2 dark:text-white">{f.title}</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">{f.desc}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Pricing */}
      <section className="max-w-6xl mx-auto px-6 py-20 border-t border-slate-100 dark:border-slate-800">
        <div className="text-center mb-14">
          <p className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-400 mb-3">Preise</p>
          <h2 className="text-4xl sm:text-5xl font-black tracking-tighter">Einfach. Transparent.</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl mx-auto">

          {/* Free */}
          <div className="p-8 rounded-[28px] border-2 border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Free</p>
            <p className="text-5xl font-black mb-1">0 €</p>
            <p className="text-[11px] text-slate-400 mb-8">für immer kostenlos</p>
            <ul className="space-y-3 mb-8">
              {[
                '3 Dokumente',
                '20 Generierungen pro Tag',
                'Karteikarten & Quiz',
                'Spaced Repetition',
                'Streak & Dashboard',
              ].map(item => (
                <li key={item} className="flex items-center gap-3 text-sm text-slate-600 dark:text-slate-400">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-500 shrink-0"><polyline points="20 6 9 17 4 12"/></svg>
                  {item}
                </li>
              ))}
            </ul>
            <button
              onClick={() => onAuthClick('register')}
              className="w-full py-3.5 rounded-2xl text-[11px] font-black uppercase tracking-widest border-2 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-indigo-400 hover:text-indigo-600 transition-all"
            >
              Kostenlos starten
            </button>
          </div>

          {/* Pro */}
          <div className="p-8 rounded-[28px] border-2 border-indigo-500 dark:border-indigo-400 bg-white dark:bg-slate-900 relative">
            <div className="absolute top-6 right-6 px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest text-white" style={{ background: 'var(--primary)' }}>
              Empfohlen
            </div>
            <p className="text-[10px] font-black uppercase tracking-widest text-indigo-500 mb-2">Pro</p>
            <div className="flex items-end gap-3 mb-1">
              <p className="text-5xl font-black">9,99 €</p>
              <p className="text-xl font-black text-slate-300 dark:text-slate-600 line-through mb-1.5">14,99 €</p>
            </div>
            <p className="text-[10px] font-black uppercase tracking-widest mb-1" style={{ color: 'var(--primary)' }}>Einführungspreis: Frühstarter behalten ihn dauerhaft</p>
            <p className="text-[11px] text-slate-400 mb-8">pro Monat, jederzeit kündbar</p>
            <ul className="space-y-3 mb-8">
              {[
                'Unlimitierte Dokumente',
                'Unbegrenzte Generierungen',
                'Klausursimulation mit Notenskala',
                'Feynman-Methode',
                'Anki/Quizlet-Import & -Export',
                'Decks mit Kommilitonen teilen',
                'Priority Support',
              ].map(item => (
                <li key={item} className="flex items-center gap-3 text-sm text-slate-600 dark:text-slate-400">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-indigo-500 shrink-0"><polyline points="20 6 9 17 4 12"/></svg>
                  {item}
                </li>
              ))}
            </ul>
            <button
              onClick={() => onAuthClick('register')}
              className="w-full py-3.5 rounded-2xl text-[11px] font-black uppercase tracking-widest text-white shadow-lg hover:scale-[1.02] transition-all"
              style={{ background: 'var(--primary)' }}
            >
              Pro starten
            </button>
          </div>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="border-t border-slate-100 dark:border-slate-800">
        <div className="max-w-3xl mx-auto px-6 py-24 text-center">
          <h2 className="text-4xl sm:text-5xl font-black tracking-tighter mb-6">
            Bereit, smarter zu lernen?
          </h2>
          <p className="text-lg text-slate-500 dark:text-slate-400 mb-10">
            Starte kostenlos, ohne Abo und ohne Risiko.
          </p>
          <button
            onClick={() => onAuthClick('register')}
            className="px-10 py-5 rounded-2xl text-[13px] font-black uppercase tracking-widest text-white shadow-2xl hover:scale-105 active:scale-95 transition-all"
            style={{ background: 'var(--primary)' }}
          >
            Jetzt kostenlos registrieren →
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-100 dark:border-slate-800 py-8">
        <div className="max-w-6xl mx-auto px-6 flex flex-col sm:flex-row justify-between items-center gap-4">
          <p className="text-[11px] font-black tracking-widest text-slate-400 uppercase">
            © {new Date().getFullYear()} QuizWise
          </p>
          <div className="flex gap-6">
            {['Datenschutz', 'Impressum', 'AGB'].map(l => (
              <button key={l} className="text-[11px] font-bold text-slate-400 hover:text-slate-600 uppercase tracking-widest transition-colors">
                {l}
              </button>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
};
