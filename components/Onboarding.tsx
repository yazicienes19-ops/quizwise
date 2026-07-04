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

const ICON_PROPS = {
  xmlns: 'http://www.w3.org/2000/svg', width: 30, height: 30, viewBox: '0 0 24 24',
  fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round',
} as const;

const STEPS: Step[] = [
  {
    icon: (
      <svg {...ICON_PROPS}>
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="17 8 12 3 7 8" />
        <line x1="12" y1="3" x2="12" y2="15" />
      </svg>
    ),
    title: 'Lade deine Unterlagen hoch',
    description: 'Vorlesungsfolien, Skripte, Notizen — PDF, Word oder Foto. QuizWise liest alles und versteht den Inhalt.',
    highlight: 'Deine Bibliothek ist der Startpunkt',
  },
  {
    icon: (
      <svg {...ICON_PROPS}>
        <circle cx="12" cy="12" r="10" />
        <circle cx="12" cy="12" r="6" />
        <circle cx="12" cy="12" r="2" />
      </svg>
    ),
    title: 'Übe, wie es dir liegt',
    description: 'Aus deinen Unterlagen entstehen Quizfragen, Karteikarten und komplette Klausursimulationen — ganz ohne manuelles Erstellen.',
    highlight: 'Quiz · Karteikarten · Klausur üben · Erklären üben',
  },
  {
    icon: (
      <svg {...ICON_PROPS}>
        <polyline points="23 4 23 10 17 10" />
        <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
      </svg>
    ),
    title: 'Fehler kommen von selbst wieder',
    description: 'Was du falsch beantwortest, legt dir QuizWise nach bewährten Lernintervallen automatisch wieder vor — kurz bevor du es vergessen würdest.',
    highlight: 'Wiederholen genau im richtigen Moment',
  },
  {
    icon: (
      <svg {...ICON_PROPS}>
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
        <polyline points="22 4 12 14.01 9 11.01" />
      </svg>
    ),
    title: 'Dein Coach behält den Überblick',
    description: 'Der Lern-Coach zeigt dir jeden Tag, was du als Nächstes tun solltest, wo deine Schwächen liegen und wie deine Klausurprognose steht.',
    highlight: '„Heute solltest du …" — jeden Tag ein klarer Plan',
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
      <div
        className="w-full max-w-md rounded-[28px] shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-300"
        style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border-color)' }}
      >

        {/* Fortschritts-Balken — zurückliegende Schritte sind anklickbar */}
        <div className="flex gap-1.5 p-5 pb-0">
          {STEPS.map((_, i) => (
            <button
              key={i}
              aria-label={`Zu Schritt ${i + 1}`}
              onClick={() => i < step && setStep(i)}
              className="h-1 flex-1 rounded-full transition-all duration-300"
              style={{
                background: i <= step ? 'var(--primary)' : 'var(--border-color)',
                opacity: i <= step ? 1 : 0.5,
                cursor: i < step ? 'pointer' : 'default',
              }}
            />
          ))}
        </div>

        <div className="p-8 pt-10 flex flex-col items-center text-center">
          <div
            className="w-16 h-16 rounded-[20px] flex items-center justify-center mb-6"
            style={{ background: 'var(--primary)', color: 'var(--primary-text)' }}
          >
            {current.icon}
          </div>

          <p className="text-[9px] font-black uppercase tracking-[0.3em] text-slate-400 mb-2">
            Schritt {step + 1} von {STEPS.length}
          </p>

          <h2 className="text-xl font-black tracking-tight mb-3" style={{ color: 'var(--text-main)' }}>
            {current.title}
          </h2>

          <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed mb-4">
            {current.description}
          </p>

          <p
            className="text-[10px] font-bold uppercase tracking-widest px-4 py-2 rounded-xl"
            style={{
              background: 'color-mix(in srgb, var(--primary) 10%, transparent)',
              color: 'var(--primary)',
              border: '1px solid color-mix(in srgb, var(--primary) 20%, transparent)',
            }}
          >
            {current.highlight}
          </p>
        </div>

        {/* Aktionen */}
        <div className="px-8 pb-8 space-y-3">
          {isLast ? (
            <>
              <button
                onClick={() => finish(true)}
                className="w-full py-3.5 rounded-[16px] text-[11px] font-black uppercase tracking-widest hover:scale-[1.02] active:scale-[0.98] transition-all"
                style={{ background: 'var(--primary)', color: 'var(--primary-text)' }}
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
                className="w-full py-3.5 rounded-[16px] text-[11px] font-black uppercase tracking-widest hover:scale-[1.02] active:scale-[0.98] transition-all"
                style={{ background: 'var(--primary)', color: 'var(--primary-text)' }}
              >
                Weiter
              </button>
              <div className="flex items-center justify-between">
                <button
                  onClick={() => setStep(Math.max(0, step - 1))}
                  disabled={step === 0}
                  className="py-3 text-[10px] font-bold uppercase tracking-widest text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors disabled:opacity-0"
                >
                  ← Zurück
                </button>
                <button
                  onClick={() => finish(false)}
                  className="py-3 text-[10px] font-bold uppercase tracking-widest text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                >
                  Überspringen
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
