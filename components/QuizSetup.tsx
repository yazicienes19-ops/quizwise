
import React, { useState, useMemo } from 'react';
import type { ProcessedDocument, QuizConfig } from '../types';
import { getDocStats } from '../services/quizHistoryService';

interface QuizSetupProps {
  doc: ProcessedDocument;
  availableDocs?: ProcessedDocument[];
  onStart: (config: QuizConfig, docIds: string[]) => void;
  onBack: () => void;
  initialFocus?: QuizConfig['focus'];
}

const QUESTION_TYPES: { value: QuizConfig['questionType']; label: string; desc: string }[] = [
  { value: 'mixed',     label: 'Gemischt',        desc: 'MC + Wahr/Falsch' },
  { value: 'mc',        label: 'Multiple Choice',  desc: 'Mehrere korrekte' },
  { value: 'truefalse', label: 'Wahr / Falsch',    desc: 'Schnell & direkt' },
  { value: 'open',      label: 'Offen',            desc: 'Selbsteinschätzung' },
];

const DIFFICULTIES: { value: QuizConfig['difficulty']; label: string }[] = [
  { value: 'leicht',     label: 'Leicht'     },
  { value: 'mittel',     label: 'Mittel'     },
  { value: 'schwer',     label: 'Schwer'     },
  { value: 'klausurnah', label: 'Klausurnah' },
];

const COUNTS = [5, 10, 20] as const;

const Chip: React.FC<{
  selected: boolean;
  onClick: () => void;
  label: string;
  desc?: string;
  solid?: boolean;
}> = ({ selected, onClick, label, desc, solid }) => {
  const style: React.CSSProperties = selected
    ? solid
      ? { background: 'var(--accent)', borderColor: 'var(--accent)', color: '#ffffff' }
      : { background: 'var(--accent-soft)', borderColor: 'var(--accent)', color: 'var(--accent)' }
    : {};

  return (
    <button
      onClick={onClick}
      className={`rounded-[14px] px-4 py-3 text-left transition-colors border-2 w-full ${
        selected
          ? ''
          : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
      }`}
      style={style}
    >
      <p className="text-[11px] font-black">{label}</p>
      {desc && (
        <p
          className="text-[9px] mt-0.5"
          style={selected ? { color: solid ? 'rgba(255,255,255,0.7)' : 'var(--accent)' } : { color: '#94a3b8' }}
        >
          {desc}
        </p>
      )}
    </button>
  );
};

export const QuizSetup: React.FC<QuizSetupProps> = ({
  doc, availableDocs, onStart, onBack, initialFocus,
}) => {
  const [questionType, setQuestionType]     = useState<QuizConfig['questionType']>('mixed');
  const [difficulty, setDifficulty]         = useState<QuizConfig['difficulty']>('mittel');
  const [questionCount, setQuestionCount]   = useState(10);
  const [customCount, setCustomCount]       = useState('');
  const [showCustom, setShowCustom]         = useState(false);
  const [examMode, setExamMode]             = useState(false);
  const [focus, setFocus]                   = useState<QuizConfig['focus']>(initialFocus ?? 'all');
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([doc.id]);

  const toggleDoc = (id: string) => {
    setSelectedDocIds(prev =>
      prev.includes(id) ? (prev.length > 1 ? prev.filter(d => d !== id) : prev) : [...prev, id]
    );
  };

  const otherDocs = availableDocs?.filter(d => d.id !== doc.id) ?? [];
  const stats = useMemo(() => getDocStats(doc.id), [doc.id]);
  const docTitle = doc.name.replace(/\.[^/.]+$/, '');
  const effectiveCount = showCustom
    ? Math.min(50, Math.max(3, parseInt(customCount) || 10))
    : questionCount;

  return (
    <div className="max-w-2xl mx-auto py-6 px-4 space-y-6 animate-in fade-in slide-in-from-right-8 duration-500 pb-20">

      {/* Back */}
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-slate-400 transition-colors text-[10px] font-black uppercase tracking-widest"
        style={{ color: '#94a3b8' }}
        onMouseEnter={e => (e.currentTarget.style.color = 'var(--accent)')}
        onMouseLeave={e => (e.currentTarget.style.color = '#94a3b8')}
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="15 18 9 12 15 6"/>
        </svg>
        Zurück zur Bibliothek
      </button>

      {/* Source header — Navy primary card */}
      <div className="rounded-[18px] p-6" style={{ background: 'var(--card-primary)' }}>
        <p className="text-[9px] font-black uppercase tracking-[0.3em] text-slate-400 mb-1">Quiz aus</p>
        <p className="text-xl font-black text-white leading-tight">{docTitle}</p>
        {stats.count > 0 && (
          <div className="flex gap-5 mt-4 pt-4" style={{ borderTop: '1px solid rgba(255,255,255,0.1)' }}>
            <div>
              <p className="text-[8px] uppercase tracking-widest text-slate-400">Quizze</p>
              <p className="text-sm font-black text-white">{stats.count}</p>
            </div>
            <div>
              <p className="text-[8px] uppercase tracking-widest text-slate-400">Ø Genauigkeit</p>
              <p className="text-sm font-black text-white">{stats.avgAccuracy}%</p>
            </div>
            {stats.lastAt && (
              <div>
                <p className="text-[8px] uppercase tracking-widest text-slate-400">Zuletzt</p>
                <p className="text-sm font-black text-white">
                  {new Date(stats.lastAt).toLocaleDateString('de-DE', { day: '2-digit', month: 'short' })}
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Multi-Dokument Auswahl */}
      {otherDocs.length > 0 && (
        <div className="space-y-2">
          <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Dokumente einschließen</p>
          {[doc, ...otherDocs].map(d => {
            const checked = selectedDocIds.includes(d.id);
            return (
              <button
                key={d.id}
                onClick={() => toggleDoc(d.id)}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-[14px] border-2 transition-colors text-left"
                style={checked
                  ? { borderColor: 'var(--accent)', background: 'var(--accent-soft)' }
                  : { borderColor: 'var(--border)', background: 'var(--bg-sidebar)' }
                }
              >
                <div
                  className="w-4 h-4 rounded flex items-center justify-center shrink-0 border-2 transition-colors"
                  style={checked
                    ? { background: 'var(--accent)', borderColor: 'var(--accent)' }
                    : { borderColor: '#94a3b8' }
                  }
                >
                  {checked && (
                    <svg width="8" height="8" viewBox="0 0 10 10" fill="none">
                      <polyline points="1.5,5 4,7.5 8.5,2.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                </div>
                <span className="text-[10px] font-black truncate dark:text-white">
                  {d.name.replace(/\.[^/.]+$/, '')}
                </span>
                {d.id === doc.id && (
                  <span className="text-[8px] font-black text-slate-400 shrink-0">Primär</span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Fragetyp */}
      <div className="space-y-3">
        <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Fragetyp</p>
        <div className="grid grid-cols-2 gap-2">
          {QUESTION_TYPES.map(({ value, label, desc }) => (
            <Chip key={value} selected={questionType === value} onClick={() => setQuestionType(value)} label={label} desc={desc} />
          ))}
        </div>
      </div>

      {/* Schwierigkeit */}
      <div className="space-y-3">
        <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Schwierigkeit</p>
        <div className="grid grid-cols-4 gap-2">
          {DIFFICULTIES.map(({ value, label }) => (
            <Chip
              key={value}
              selected={difficulty === value}
              onClick={() => setDifficulty(value)}
              label={label}
              solid={value === 'klausurnah' && difficulty === 'klausurnah'}
            />
          ))}
        </div>
      </div>

      {/* Anzahl */}
      <div className="space-y-3">
        <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Anzahl Fragen</p>
        <div className="grid grid-cols-4 gap-2">
          {COUNTS.map(n => (
            <Chip key={n} selected={!showCustom && questionCount === n}
              onClick={() => { setShowCustom(false); setQuestionCount(n); }} label={String(n)} />
          ))}
          <Chip selected={showCustom} onClick={() => setShowCustom(true)} label="Eigene" desc="3–50" />
        </div>
        {showCustom && (
          <input
            autoFocus
            type="number" min="3" max="50"
            value={customCount}
            onChange={e => setCustomCount(e.target.value)}
            placeholder="Wie viele? (3–50)"
            className="w-full px-5 py-4 bg-white dark:bg-slate-900 rounded-[14px] text-lg font-black dark:text-white outline-none transition-colors"
            style={{ border: '2px solid var(--accent)' }}
          />
        )}
      </div>

      {/* Fokus */}
      {stats.weakTopics.length > 0 && (
        <div className="space-y-3">
          <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Fokus</p>
          <div className="grid grid-cols-2 gap-2">
            <Chip selected={focus === 'all'}  onClick={() => setFocus('all')}  label="Gesamtes Dokument" desc="Alles abdecken" />
            <Chip selected={focus === 'weak'} onClick={() => setFocus('weak')} label="Schwache Themen"   desc={stats.weakTopics.slice(0, 2).join(', ')} />
          </div>
        </div>
      )}

      {/* Prüfungsmodus */}
      <div
        className="flex items-center justify-between rounded-[18px] border"
        style={{ padding: '18px 20px', background: 'var(--surface)', borderColor: 'var(--border)' }}
      >
        <div>
          <p className="text-sm font-bold text-slate-900 dark:text-white">Prüfungsmodus</p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">Keine Erklärungen während des Quizzes</p>
        </div>
        <button
          onClick={() => setExamMode(v => !v)}
          aria-label="Prüfungsmodus umschalten"
          className="relative w-12 h-6 rounded-full transition-colors shrink-0"
          style={examMode ? { background: 'var(--accent)' } : { background: '#e2e8f0' }}
        >
          <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${examMode ? 'translate-x-6' : 'translate-x-0'}`} />
        </button>
      </div>

      {/* CTA */}
      <button
        onClick={() => onStart({ questionType, difficulty, questionCount: effectiveCount, focus, examMode }, selectedDocIds)}
        className="w-full rounded-[16px] font-black uppercase tracking-widest text-[11px] text-white transition-transform hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-3"
        style={{ background: 'var(--accent)', padding: '18px' }}
      >
        <span>{effectiveCount} Fragen generieren</span>
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
        </svg>
      </button>
    </div>
  );
};
