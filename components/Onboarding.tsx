import React, { useState } from 'react';

const ONBOARDING_KEY = 'quizwise_onboarding_done';

export const isOnboardingDone = () => localStorage.getItem(ONBOARDING_KEY) === 'true';
export const resetOnboarding = () => localStorage.removeItem(ONBOARDING_KEY);

interface OnboardingProps {
  onComplete: () => void;
  /** Optional: direkt zum Upload navigieren nach Abschluss */
  onStartUpload?: () => void;
}

interface Step {
  icon: React.ReactNode;
  title: string;
  description: string;
  highlight: string;
}

const STEPS: Step[] = [
  {
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="12" y1="18" x2="12" y2="12" />
        <line x1="9" y1="15" x2="15" y2="15" />
      </svg>
    ),
    title: 'Lade deine Unterlagen hoch',
    description: 'PDFs, Word-Dokumente, Fotos von Notizen — QuizWise liest alles und versteht den Inhalt.',
    highlight: 'Vorlesungsfolien, Skripte, eigene Notizen',
  },
  {
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <circle cx="12" cy="12" r="6" />
        <circle cx="12" cy="12" r="2" />
      </svg>
    ),
    title: 'Die KI erstellt dein Quiz',
    description: 'Aus deinen Unterlagen entstehen automatisch Quizfragen, Karteikarten und Klausur-Simulationen.',
    highlight: 'Kein manuelles Kartenerstellen mehr',
  },
  {
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
        <polyline points="22 4 12 14.01 9 11.01" />
      </svg>
    ),
    title: 'Lerne gezielt deine Schwächen',
    description: 'QuizWise erkennt, wo du Lücken hast, und schlägt dir vor, was du als Nächstes wiederholen solltest.',
    highlight: 'Recall Studio · Klausur-Modus · Lern-Analyse',
  },
];

export const Onboarding: React.FC<OnboardingProps> = ({ onComplete, onStartUpload }) => {
  const [step, setStep] = useState(0);
  const isLast = step === STEPS.length - 1;
  const current = STEPS[step];

  const finish = (startUpload: boolean) => {
    localStorage.setItem(ONBOARDING_KEY, 'true');
    onComplete();
    if (startUpload && onStartUpload) onStartUpload();
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-[28px] shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-300">

        {/* Fortschritts-Balken */}
        <div className="flex gap-1.5 p-5 pb-0">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className="h-1 flex-1 rounded-full transition-all duration-300"
              style={{
                background: i <= step ? 'var(--primary, #4f46e5)' : 'var(--progress-bg, #e2e8f0)',
                opacity: i <= step ? 1 : 0.4,
              }}
            />
          ))}
        </div>

        <div className="p-8 pt-10 flex flex-col items-center text-center">
          {/* Icon */}
          <div
            className="w-16 h-16 rounded-[20px] flex items-center justify-center mb-6 text-white"
            style={{ background: 'var(--primary, #4f46e5)' }}
          >
            {current.icon}
          </div>

          <p className="text-[9px] font-black uppercase tracking-[0.3em] text-slate-400 mb-2">
            Schritt {step + 1} von {STEPS.length}
          </p>

          <h2 className="text-xl font-black tracking-tight text-slate-900 dark:text-white mb-3">
            {current.title}
          </h2>

          <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed mb-4">
            {current.description}
          </p>

          <p className="text-[10px] font-bold uppercase tracking-widest px-4 py-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-300">
            {current.highlight}
          </p>
        </div>

        {/* Aktionen */}
        <div className="px-8 pb-8 space-y-3">
          {isLast ? (
            <>
              <button
                onClick={() => finish(true)}
                className="w-full py-3.5 rounded-[16px] text-white text-[11px] font-black uppercase tracking-widest hover:scale-[1.02] active:scale-[0.98] transition-all"
                style={{ background: 'var(--primary, #4f46e5)' }}
              >
                Erstes Dokument hochladen
              </button>
              <button
                onClick={() => finish(false)}
                className="w-full py-3 text-[10px] font-bold uppercase tracking-widest text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
              >
                Erstmal umschauen
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setStep(step + 1)}
                className="w-full py-3.5 rounded-[16px] text-white text-[11px] font-black uppercase tracking-widest hover:scale-[1.02] active:scale-[0.98] transition-all"
                style={{ background: 'var(--primary, #4f46e5)' }}
              >
                Weiter
              </button>
              <button
                onClick={() => finish(false)}
                className="w-full py-3 text-[10px] font-bold uppercase tracking-widest text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
              >
                Überspringen
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
