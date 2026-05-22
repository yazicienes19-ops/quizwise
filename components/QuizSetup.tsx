import React, { useState, useMemo } from 'react';
import type { ProcessedDocument, QuizConfig } from '../types';
import { getDocStats } from '../services/quizHistoryService';

interface QuizSetupProps {
  doc: ProcessedDocument;
  onStart: (config: QuizConfig) => void;
  onBack: () => void;
  initialFocus?: QuizConfig['focus'];
}

const QUESTION_TYPES: { value: QuizConfig['questionType']; label: string; desc: string }[] = [
  { value: 'mixed',    label: 'Gemischt',        desc: 'MC + Wahr/Falsch' },
  { value: 'mc',       label: 'Multiple Choice', desc: 'Mehrere korrekte' },
  { value: 'truefalse',label: 'Wahr / Falsch',   desc: 'Schnell & direkt' },
  { value: 'open',     label: 'Offen',           desc: 'Selbsteinschätzung' },
];

const DIFFICULTIES: { value: QuizConfig['difficulty']; label: string; color: string }[] = [
  { value: 'leicht',    label: 'Leicht',     color: 'text-emerald-600 dark:text-emerald-400' },
  { value: 'mittel',    label: 'Mittel',     color: 'text-amber-600 dark:text-amber-400' },
  { value: 'schwer',    label: 'Schwer',     color: 'text-rose-600 dark:text-rose-400' },
  { value: 'klausurnah',label: 'Klausurnah', color: 'text-indigo-600 dark:text-indigo-400' },
];

const COUNTS = [5, 10, 20] as const;

const Chip: React.FC<{ selected: boolean; onClick: () => void; label: string; desc?: string; accent?: boolean }> = ({
  selected, onClick, label, desc, accent
}) => (
  <button
    onClick={onClick}
    className={`
      rounded-[20px] px-4 py-3 text-left transition-all border-2 w-full
      ${selected
        ? accent
          ? 'bg-indigo-600 border-indigo-600 text-white shadow-3d-deep'
          : 'bg-indigo-50 dark:bg-indigo-900/30 border-indigo-500 text-indigo-700 dark:text-indigo-300 shadow-3d-raised'
        : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-indigo-300'
      }
    `}
  >
    <p className="text-[11px] font-black">{label}</p>
    {desc && <p className={`text-[9px] mt-0.5 ${selected && !accent ? 'text-indigo-500' : selected && accent ? 'text-white/70' : 'text-slate-400'}`}>{desc}</p>}
  </button>
);

export const QuizSetup: React.FC<QuizSetupProps> = ({ doc, onStart, onBack, initialFocus }) => {
  const [questionType, setQuestionType] = useState<QuizConfig['questionType']>('mixed');
  const [difficulty, setDifficulty]     = useState<QuizConfig['difficulty']>('mittel');
  const [questionCount, setQuestionCount] = useState(10);
  const [customCount, setCustomCount]   = useState('');
  const [showCustom, setShowCustom]     = useState(false);
  const [examMode, setExamMode]         = useState(false);
  const [focus, setFocus]               = useState<QuizConfig['focus']>(initialFocus ?? 'all');

  const stats = useMemo(() => getDocStats(doc.id), [doc.id]);
  const docTitle = doc.name.replace(/\.[^/.]+$/, '');
  const effectiveCount = showCustom ? Math.min(50, Math.max(3, parseInt(customCount) || 10)) : questionCount;

  return (
    <div className="max-w-2xl mx-auto py-6 lg:py-10 px-4 space-y-6 animate-in fade-in slide-in-from-right-8 duration-500 pb-20">
      {/* Back */}
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-slate-400 hover:text-indigo-600 transition-colors text-[10px] font-black uppercase tracking-widest"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="15 18 9 12 15 6"/>
        </svg>
        Zurück zur Bibliothek
      </button>

      {/* Source header */}
      <div className="bg-indigo-600 text-white rounded-[28px] p-6 shadow-3d-deep">
        <p className="text-[9px] font-black uppercase tracking-[0.3em] opacity-60 mb-1">Quiz aus</p>
        <p className="text-xl font-black leading-tight">{docTitle}</p>
        {stats.count > 0 && (
          <div className="flex gap-4 mt-3 pt-3 border-t border-white/20">
            <div>
              <p className="text-[8px] uppercase tracking-widest opacity-60">Quizze</p>
              <p className="text-sm font-black">{stats.count}</p>
            </div>
            <div>
              <p className="text-[8px] uppercase tracking-widest opacity-60">Ø Genauigkeit</p>
              <p className="text-sm font-black">{stats.avgAccuracy}%</p>
            </div>
            {stats.lastAt && (
              <div>
                <p className="text-[8px] uppercase tracking-widest opacity-60">Zuletzt</p>
                <p className="text-sm font-black">{new Date(stats.lastAt).toLocaleDateString('de-DE', { day: '2-digit', month: 'short' })}</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Question type */}
      <div className="space-y-3">
        <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Fragetyp</p>
        <div className="grid grid-cols-2 gap-2">
          {QUESTION_TYPES.map(({ value, label, desc }) => (
            <Chip key={value} selected={questionType === value} onClick={() => setQuestionType(value)} label={label} desc={desc} />
          ))}
        </div>
      </div>

      {/* Difficulty */}
      <div className="space-y-3">
        <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Schwierigkeit</p>
        <div className="grid grid-cols-4 gap-2">
          {DIFFICULTIES.map(({ value, label }) => (
            <Chip key={value} selected={difficulty === value} onClick={() => setDifficulty(value)} label={label} accent={value === 'klausurnah' && difficulty === 'klausurnah'} />
          ))}
        </div>
      </div>

      {/* Count */}
      <div className="space-y-3">
        <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Anzahl Fragen</p>
        <div className="grid grid-cols-4 gap-2">
          {COUNTS.map(n => (
            <Chip key={n} selected={!showCustom && questionCount === n} onClick={() => { setShowCustom(false); setQuestionCount(n); }} label={String(n)} />
          ))}
          <Chip selected={showCustom} onClick={() => setShowCustom(true)} label="Eigene" desc="3–50" />
        </div>
        {showCustom && (
          <input
            autoFocus
            type="number"
            min="3"
            max="50"
            value={customCount}
            onChange={e => setCustomCount(e.target.value)}
            placeholder="Wie viele? (3–50)"
            className="w-full px-5 py-4 bg-white dark:bg-slate-900 border-2 border-indigo-400 rounded-2xl text-lg font-black dark:text-white outline-none focus:border-indigo-600 transition-colors"
          />
        )}
      </div>

      {/* Focus (only if weak topics exist) */}
      {stats.weakTopics.length > 0 && (
        <div className="space-y-3">
          <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Fokus</p>
          <div className="grid grid-cols-2 gap-2">
            <Chip selected={focus === 'all'} onClick={() => setFocus('all')} label="Gesamtes Dokument" desc="Alles abdecken" />
            <Chip selected={focus === 'weak'} onClick={() => setFocus('weak')} label="Schwache Themen" desc={stats.weakTopics.slice(0, 2).join(', ')} />
          </div>
        </div>
      )}

      {/* Exam mode toggle */}
      <div className="flex items-center justify-between p-5 bg-white dark:bg-slate-900 rounded-[24px] border border-slate-200 dark:border-slate-800 shadow-3d-raised">
        <div>
          <p className="text-sm font-black dark:text-white">Prüfungsmodus</p>
          <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">Keine Erklärungen während des Quizzes</p>
        </div>
        <button
          onClick={() => setExamMode(v => !v)}
          aria-label="Prüfungsmodus umschalten"
          className={`relative w-12 h-6 rounded-full transition-colors ${examMode ? 'bg-indigo-600' : 'bg-slate-200 dark:bg-slate-700'}`}
        >
          <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${examMode ? 'translate-x-6' : 'translate-x-0'}`} />
        </button>
      </div>

      {/* CTA */}
      <button
        onClick={() => onStart({ questionType, difficulty, questionCount: effectiveCount, focus, examMode })}
        className="w-full bg-indigo-600 text-white py-5 rounded-[24px] font-black uppercase tracking-widest text-[11px] shadow-3d-deep hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-3"
      >
        <span>{effectiveCount} Fragen generieren</span>
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
        </svg>
      </button>
    </div>
  );
};
