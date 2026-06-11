
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { StudyEntry, TopicMetric, FlashcardDeck, ExamTerm } from '../types';
import { GeneratedImage } from './GeneratedImage';
import { AgentChat } from './AgentChat';
import { generateSmartStudyPlan } from '../services/geminiService';
import { toast } from '../services/toast';
import { ChevronLeft, ChevronRight, X, Plus, Bot } from 'lucide-react';

type ViewMode = 'monat' | 'woche' | 'liste';

interface StudyEvent {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD
  type: 'study' | 'reminder';
  description?: string;
}

interface CalendarItem {
  id: string;
  title: string;
  source: 'exam' | 'event';
}

interface MonthCell {
  date: Date;
  isCurrentMonth: boolean;
  items: CalendarItem[];
}

const HOURS = Array.from({ length: 18 }, (_, i) => i + 7);
const DAYS = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
const WEEK_DAYS_SHORT = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const HOUR_HEIGHT = 80;
const STEP = 15;

interface StudyTemplate {
  id: string;
  subject: string;
  topic: string;
  color: string;
}

const COLORS = [
  { id: 'emerald', label: 'Grün', bg: 'bg-emerald-500', text: 'text-emerald-600', border: 'border-emerald-500' },
  { id: 'blue', label: 'Blau', bg: 'bg-blue-500', text: 'text-blue-600', border: 'border-blue-500' },
  { id: 'purple', label: 'Lila', bg: 'bg-purple-500', text: 'text-purple-600', border: 'border-purple-500' },
  { id: 'rose', label: 'Rot', bg: 'bg-rose-500', text: 'text-rose-600', border: 'border-rose-500' },
];

interface StudyPlannerProps {
  metrics: TopicMetric[];
  decks: FlashcardDeck[];
  examTerms: ExamTerm[];
  onUpdateExams: (terms: ExamTerm[]) => void;
}

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function buildMonthCells(year: number, month: number, examTerms: ExamTerm[], events: StudyEvent[]): MonthCell[] {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);

  const startDate = new Date(firstDay);
  const dow = startDate.getDay();
  startDate.setDate(startDate.getDate() - (dow === 0 ? 6 : dow - 1));

  const endDate = new Date(lastDay);
  const endDow = endDate.getDay();
  if (endDow !== 0) endDate.setDate(endDate.getDate() + (7 - endDow));

  const cells: MonthCell[] = [];
  const cur = new Date(startDate);

  while (cur <= endDate) {
    const dateStr = toDateStr(cur);
    const items: CalendarItem[] = [
      ...examTerms.filter(e => e.date === dateStr).map(e => ({ id: e.id, title: e.title, source: 'exam' as const })),
      ...events.filter(ev => ev.date === dateStr).map(ev => ({ id: ev.id, title: ev.title, source: 'event' as const })),
    ];
    cells.push({ date: new Date(cur), isCurrentMonth: cur.getMonth() === month, items });
    cur.setDate(cur.getDate() + 1);
  }

  return cells;
}

export const StudyPlanner: React.FC<StudyPlannerProps> = ({ metrics, decks, examTerms, onUpdateExams }) => {
  const today = useMemo(() => new Date(), []);
  const todayStr = useMemo(() => toDateStr(today), [today]);

  const [studyFlowOpen, setStudyFlowOpen] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('monat');
  const [calMonth, setCalMonth] = useState(today.getMonth());
  const [calYear, setCalYear] = useState(today.getFullYear());
  const [events, setEvents] = useState<StudyEvent[]>([]);

  // Weekly view
  const [entries, setEntries] = useState<StudyEntry[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [selectedDay, setSelectedDay] = useState(DAYS[0]);
  const [templates, setTemplates] = useState<StudyTemplate[]>([]);
  const [showTplInput, setShowTplInput] = useState(false);
  const [tplInputValue, setTplInputValue] = useState('');

  // Forms
  const [showExamForm, setShowExamForm] = useState(false);
  const [newExamTitle, setNewExamTitle] = useState('');
  const [newExamDate, setNewExamDate] = useState('');

  const [showEventForm, setShowEventForm] = useState(false);
  const [newEventTitle, setNewEventTitle] = useState('');
  const [newEventDate, setNewEventDate] = useState('');
  const [newEventType, setNewEventType] = useState<'study' | 'reminder'>('study');
  const [newEventDesc, setNewEventDesc] = useState('');

  // Mobile quick-add
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [qaSubject, setQaSubject] = useState('');
  const [qaTopic, setQaTopic] = useState('');
  const [qaStart, setQaStart] = useState('08:00');
  const [qaEnd, setQaEnd] = useState('09:30');
  const [qaColor, setQaColor] = useState('indigo');

  // Resize
  const [resizingId, setResizingId] = useState<string | null>(null);
  const resizeStateRef = useRef({ id: null as string | null, initialY: 0, initialDuration: 0, startTimeMinutes: 0 });
  const entriesRef = useRef(entries);
  useEffect(() => { entriesRef.current = entries; }, [entries]);

  useEffect(() => {
    try { const s = localStorage.getItem('study_plan'); if (s) setEntries(JSON.parse(s)); } catch {}
    try { const s = localStorage.getItem('study_templates'); if (s) setTemplates(JSON.parse(s)); } catch {}
    try { const s = localStorage.getItem('study_events'); if (s) setEvents(JSON.parse(s)); } catch {}
  }, []);

  const saveEvents = (evs: StudyEvent[]) => { setEvents(evs); localStorage.setItem('study_events', JSON.stringify(evs)); };
  const savePlan = (e: StudyEntry[]) => { setEntries(e); localStorage.setItem('study_plan', JSON.stringify(e)); };

  const monthCells = useMemo(() => buildMonthCells(calYear, calMonth, examTerms, events), [calYear, calMonth, examTerms, events]);
  const monthLabel = new Date(calYear, calMonth, 1).toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });

  const goPrev = () => { if (calMonth === 0) { setCalMonth(11); setCalYear(y => y - 1); } else setCalMonth(m => m - 1); };
  const goNext = () => { if (calMonth === 11) { setCalMonth(0); setCalYear(y => y + 1); } else setCalMonth(m => m + 1); };
  const goToday = () => { setCalMonth(today.getMonth()); setCalYear(today.getFullYear()); };

  const upcomingItems = useMemo(() => [
    ...examTerms.map(e => ({ id: e.id, title: e.title, date: e.date, source: 'exam' as const, description: undefined })),
    ...events.map(ev => ({ id: ev.id, title: ev.title, date: ev.date, source: 'event' as const, description: ev.description })),
  ].filter(item => item.date >= todayStr).sort((a, b) => a.date.localeCompare(b.date)), [examTerms, events, todayStr]);

  const parseTimeToMinutes = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  const minutesToTime = (total: number) => `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;

  const handleSmartPlan = async () => {
    setIsGenerating(true);
    try {
      const plan = await generateSmartStudyPlan(metrics, decks, examTerms);
      savePlan(plan);
      const days = [...new Set(plan.map(e => e.day))];
      toast.success(`Plan erstellt: ${plan.length} Einträge für ${days.length} Tag${days.length !== 1 ? 'e' : ''}.`);
    } catch { toast.error('Smart Plan konnte nicht generiert werden.'); }
    finally { setIsGenerating(false); }
  };

  const handleResizeStart = (e: React.MouseEvent, entry: StudyEntry) => {
    e.preventDefault(); e.stopPropagation();
    const startMin = parseTimeToMinutes(entry.startTime);
    resizeStateRef.current = { id: entry.id, initialY: e.clientY, initialDuration: parseTimeToMinutes(entry.endTime) - startMin, startTimeMinutes: startMin };
    setResizingId(entry.id);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const state = resizeStateRef.current;
      if (!state.id) return;
      const deltaMinutes = Math.round((((e.clientY - state.initialY) / HOUR_HEIGHT) * 60) / STEP) * STEP;
      const newEndTime = minutesToTime(state.startTimeMinutes + Math.max(STEP, state.initialDuration + deltaMinutes));
      setEntries(prev => prev.map(entry => entry.id === state.id ? { ...entry, endTime: newEndTime } : entry));
    };
    const handleMouseUp = () => {
      if (resizeStateRef.current.id) {
        localStorage.setItem('study_plan', JSON.stringify(entriesRef.current));
        resizeStateRef.current.id = null;
        setResizingId(null);
        document.body.style.cursor = 'default';
        document.body.style.userSelect = 'auto';
      }
    };
    if (resizingId) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'ns-resize';
      document.body.style.userSelect = 'none';
    }
    return () => { window.removeEventListener('mousemove', handleMouseMove); window.removeEventListener('mouseup', handleMouseUp); };
  }, [resizingId]);

  const onDrop = (e: React.DragEvent, day: string) => {
    e.preventDefault();
    if (e.dataTransfer.getData('type') !== 'template') return;
    const rect = e.currentTarget.getBoundingClientRect();
    const gridMinutes = Math.round((((e.clientY - rect.top) / HOUR_HEIGHT) * 60) / STEP) * STEP;
    const clampedStart = Math.min(Math.max(7 * 60 + gridMinutes, 7 * 60), 23 * 60 + 45);
    const t: StudyTemplate = JSON.parse(e.dataTransfer.getData('data'));
    savePlan([...entries, { id: Math.random().toString(36).substr(2, 9), day, subject: t.subject, topic: t.topic, color: t.color, startTime: minutesToTime(clampedStart), endTime: minutesToTime(clampedStart + 90), completed: false }]);
  };

  const calculatePosition = (start: string, end: string) => {
    const s = parseTimeToMinutes(start);
    const e = parseTimeToMinutes(end);
    return { top: ((s - 7 * 60) / 60) * HOUR_HEIGHT, height: ((e - s) / 60) * HOUR_HEIGHT };
  };

  const knowledgeGaps = metrics.filter(m => m.confidence < 70);
  const dueDecks = decks.filter(d => d.cards.some(c => c.nextReview <= Date.now() || c.level === 0));

  return (
    <div className="max-w-6xl mx-auto space-y-10 animate-in fade-in duration-1000 pb-20 px-4">
      {/* Header */}
      <div className="text-center space-y-4">
        <div className="inline-block px-4 py-1.5 bg-indigo-50 dark:bg-indigo-950/30 rounded-full border border-indigo-100 dark:border-indigo-900/50">
          <span className="text-[10px] font-black uppercase tracking-[0.3em] text-indigo-600">Zeitmanagement</span>
        </div>
        <h1 className="text-5xl lg:text-7xl font-black tracking-tighter" style={{ color: 'var(--text-main)' }}>
          Study <span className="text-indigo-600">Flow</span>
        </h1>
        <p className="text-slate-500 dark:text-slate-400 font-medium max-w-xl mx-auto">
          Dein akademischer Rhythmus. Kalender, Wochenplan und KI-gesteuerte Lernstruktur.
        </p>

        <div className="flex justify-center gap-3 pt-2">
          <button
            onClick={handleSmartPlan}
            disabled={isGenerating}
            className="bg-indigo-600 text-white px-8 py-4 rounded-3xl font-black uppercase tracking-[0.2em] text-[11px] shadow-3d-deep hover:scale-105 active:scale-95 transition-all flex items-center gap-2 disabled:opacity-50"
          >
            {isGenerating ? 'KI plant...' : '✦ Smart Plan'}
          </button>
          <button
            onClick={() => { setShowExamForm(true); setShowEventForm(false); }}
            className="px-6 py-4 rounded-3xl font-black uppercase tracking-[0.2em] text-[11px] transition-all"
            style={{ background: 'var(--bg-sidebar)', color: 'var(--text-main)', border: '2px solid var(--border-color)' }}
          >
            + Klausur
          </button>
          <button
            onClick={() => { setShowEventForm(true); setShowExamForm(false); }}
            className="px-6 py-4 rounded-3xl font-black uppercase tracking-[0.2em] text-[11px] transition-all"
            style={{ background: 'var(--bg-sidebar)', color: 'var(--text-main)', border: '2px solid var(--border-color)' }}
          >
            + Termin
          </button>
          <button
            onClick={() => setStudyFlowOpen(true)}
            className="px-6 py-4 rounded-3xl font-black uppercase tracking-[0.2em] text-[11px] transition-all flex items-center gap-2"
            style={{ background: 'color-mix(in srgb, var(--primary) 12%, var(--bg-sidebar))', color: 'var(--primary)', border: '2px solid color-mix(in srgb, var(--primary) 30%, transparent)' }}
          >
            <Bot size={14} />
            KI-Berater
          </button>
        </div>
      </div>

      {/* Widgets */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
        <div className="p-6 rounded-[32px] bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm border border-slate-200/50 dark:border-slate-800/50 hover:bg-white dark:hover:bg-slate-900 transition-all">
          <h3 className="text-[9px] font-black uppercase tracking-[0.4em] text-indigo-500 mb-4">Wissenslücken ({knowledgeGaps.length})</h3>
          <div className="space-y-2">
            {knowledgeGaps.slice(0, 3).map(gap => (
              <div key={gap.id} className="flex justify-between items-center">
                <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300 truncate pr-2">{gap.topic}</span>
                <span className="text-[10px] font-black text-indigo-600">{gap.confidence}%</span>
              </div>
            ))}
            {knowledgeGaps.length === 0 && <p className="text-[10px] text-slate-400 italic">Keine Lücken!</p>}
          </div>
        </div>
        <div className="p-6 rounded-[32px] bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm border border-slate-200/50 dark:border-slate-800/50 hover:bg-white dark:hover:bg-slate-900 transition-all">
          <h3 className="text-[9px] font-black uppercase tracking-[0.4em] text-indigo-600 mb-4">Fällige Karten ({dueDecks.length})</h3>
          <div className="space-y-2">
            {dueDecks.slice(0, 3).map(deck => (
              <div key={deck.id} className="flex justify-between items-center">
                <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300 truncate pr-2">{deck.title}</span>
                <div className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
              </div>
            ))}
            {dueDecks.length === 0 && <p className="text-[10px] text-slate-400 italic">Alles gelernt!</p>}
          </div>
        </div>
        <div className="p-6 rounded-[32px] bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm border border-slate-200/50 dark:border-slate-800/50 hover:bg-white dark:hover:bg-slate-900 transition-all">
          <h3 className="text-[9px] font-black uppercase tracking-[0.4em] text-rose-500 mb-4">Klausuren ({examTerms.length})</h3>
          <div className="space-y-2">
            {examTerms.slice(0, 3).map(exam => (
              <div key={exam.id} className="flex justify-between items-center">
                <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300 truncate pr-2">{exam.title}</span>
                <span className="text-[9px] font-black text-rose-500">{new Date(exam.date + 'T12:00:00').toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}</span>
              </div>
            ))}
            {examTerms.length === 0 && <p className="text-[10px] text-slate-400 italic">Keine Termine.</p>}
          </div>
        </div>
      </div>

      {/* Klausur Form */}
      {showExamForm && (
        <div className="max-w-xl mx-auto p-8 bg-white dark:bg-slate-900 rounded-[32px] border border-slate-200 dark:border-slate-800 shadow-3d-raised animate-in zoom-in-95 duration-200">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-black dark:text-white">Klausur eintragen</h3>
            <button onClick={() => setShowExamForm(false)} className="w-8 h-8 flex items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-400 hover:text-rose-500 transition-colors"><X size={14} /></button>
          </div>
          <div className="space-y-3">
            <input value={newExamTitle} onChange={e => setNewExamTitle(e.target.value)} placeholder="Titel der Klausur" className="w-full p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl outline-none dark:text-white font-bold text-sm" />
            <input type="date" value={newExamDate} onChange={e => setNewExamDate(e.target.value)} className="w-full p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl outline-none dark:text-white font-bold text-sm" />
            <button onClick={() => {
              if (!newExamTitle || !newExamDate) return;
              onUpdateExams([...examTerms, { id: Math.random().toString(36).substr(2, 5), title: newExamTitle, date: newExamDate, topics: [] }]);
              setNewExamTitle(''); setNewExamDate(''); setShowExamForm(false);
            }} className="w-full bg-rose-500 text-white py-4 rounded-2xl text-[11px] font-black uppercase tracking-widest hover:bg-rose-600 transition-colors">Klausur speichern</button>
          </div>
        </div>
      )}

      {/* Event Form */}
      {showEventForm && (
        <div className="max-w-xl mx-auto p-8 bg-white dark:bg-slate-900 rounded-[32px] border border-slate-200 dark:border-slate-800 shadow-3d-raised animate-in zoom-in-95 duration-200">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-black dark:text-white">Termin hinzufügen</h3>
            <button onClick={() => setShowEventForm(false)} className="w-8 h-8 flex items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-400 hover:text-rose-500 transition-colors"><X size={14} /></button>
          </div>
          <div className="space-y-3">
            <input value={newEventTitle} onChange={e => setNewEventTitle(e.target.value)} placeholder="Titel des Termins" className="w-full p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl outline-none dark:text-white font-bold text-sm" />
            <input type="date" value={newEventDate} onChange={e => setNewEventDate(e.target.value)} className="w-full p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl outline-none dark:text-white font-bold text-sm" />
            <input value={newEventDesc} onChange={e => setNewEventDesc(e.target.value)} placeholder="Beschreibung (optional)" className="w-full p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl outline-none dark:text-white text-sm" />
            <div className="flex gap-2">
              {(['study', 'reminder'] as const).map(t => (
                <button key={t} onClick={() => setNewEventType(t)} className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${newEventType === t ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'}`}>
                  {t === 'study' ? 'Lerntermin' : 'Erinnerung'}
                </button>
              ))}
            </div>
            <button onClick={() => {
              if (!newEventTitle || !newEventDate) return;
              saveEvents([...events, { id: Math.random().toString(36).substr(2, 9), title: newEventTitle, date: newEventDate, type: newEventType, description: newEventDesc || undefined }]);
              setNewEventTitle(''); setNewEventDate(''); setNewEventDesc(''); setShowEventForm(false);
            }} className="w-full bg-indigo-600 text-white py-4 rounded-2xl text-[11px] font-black uppercase tracking-widest hover:bg-indigo-700 transition-colors">Termin speichern</button>
          </div>
        </div>
      )}

      {/* ── View Toggle ── */}
      <div className="max-w-5xl mx-auto">
        <div className="inline-flex bg-slate-100 dark:bg-slate-800/60 rounded-2xl p-1 gap-1">
          {([['monat', 'Monat'], ['liste', 'Liste'], ['woche', 'Wochenplan']] as [ViewMode, string][]).map(([mode, label]) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={`px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${viewMode === mode ? 'shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
              style={viewMode === mode ? { background: 'var(--bg-sidebar)', color: 'var(--text-main)' } : {}}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── MONAT VIEW ── */}
      {viewMode === 'monat' && (
        <div className="max-w-5xl mx-auto rounded-[32px] shadow-3d-raised overflow-hidden" style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border-color)' }}>
          {/* Calendar Nav */}
          <div className="flex items-center justify-between px-6 py-5" style={{ borderBottom: '1px solid var(--border-color)' }}>
            <div className="flex items-center gap-3">
              <button onClick={goPrev} className="w-9 h-9 flex items-center justify-center rounded-xl transition-colors" style={{ background: 'var(--bg-main)', color: 'var(--border-color)' }}>
                <ChevronLeft size={16} />
              </button>
              <button onClick={goNext} className="w-9 h-9 flex items-center justify-center rounded-xl transition-colors" style={{ background: 'var(--bg-main)', color: 'var(--border-color)' }}>
                <ChevronRight size={16} />
              </button>
              <h2 className="text-base font-black capitalize ml-1" style={{ color: 'var(--text-main)' }}>{monthLabel}</h2>
            </div>
            <button onClick={goToday} className="px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors" style={{ background: 'var(--bg-main)', color: 'var(--border-color)' }}>
              Heute
            </button>
          </div>

          {/* Weekday headers */}
          <div className="grid grid-cols-7" style={{ borderBottom: '1px solid var(--border-color)' }}>
            {WEEK_DAYS_SHORT.map(d => (
              <div key={d} className="py-3 text-center text-[9px] font-black uppercase tracking-widest text-slate-400">
                {d}
              </div>
            ))}
          </div>

          {/* Calendar grid */}
          <div className="grid grid-cols-7">
            {monthCells.map((cell, idx) => {
              const isToday = toDateStr(cell.date) === todayStr;
              const visible = cell.items.slice(0, 2);
              const overflow = cell.items.length - 2;
              return (
                <div
                  key={idx}
                  className={`min-h-[100px] p-2 transition-colors ${idx % 7 === 6 ? '' : ''}`}
                  style={{
                    borderBottom: '1px solid var(--border-color)',
                    borderRight: idx % 7 === 6 ? 'none' : '1px solid var(--border-color)',
                    background: !cell.isCurrentMonth ? 'color-mix(in srgb, var(--bg-main) 60%, var(--bg-sidebar))' : undefined,
                  }}
                >
                  <span
                    className="inline-flex items-center justify-center w-7 h-7 text-xs font-bold rounded-full mb-1.5 transition-colors"
                    style={isToday
                      ? { background: 'rgb(251,191,36)', color: 'rgb(120,53,15)', fontWeight: 900 }
                      : { color: cell.isCurrentMonth ? 'var(--text-main)' : 'var(--border-color)' }
                    }
                  >
                    {cell.date.getDate()}
                  </span>
                  <div className="space-y-1">
                    {visible.map(item => (
                      <div
                        key={item.id}
                        className={`px-2 py-0.5 rounded-md text-[9px] font-bold truncate ${
                          item.source === 'exam'
                            ? 'bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400'
                            : 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
                        }`}
                      >
                        {item.title}
                      </div>
                    ))}
                    {overflow > 0 && (
                      <div className="px-2 py-0.5 text-[9px] font-black text-slate-400">
                        +{overflow} weitere
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Legend */}
          <div className="flex items-center gap-4 px-6 py-4" style={{ borderTop: '1px solid var(--border-color)' }}>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm bg-rose-200 dark:bg-rose-900/50" />
              <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Klausur</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm bg-blue-200 dark:bg-blue-900/50" />
              <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Termin</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-7 h-7 rounded-full bg-amber-400 flex items-center justify-center text-[9px] font-black text-amber-900">{today.getDate()}</div>
              <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Heute</span>
            </div>
          </div>
        </div>
      )}

      {/* ── LISTE VIEW ── */}
      {viewMode === 'liste' && (
        <div className="max-w-5xl mx-auto space-y-3">
          {upcomingItems.length === 0 ? (
            <div className="text-center py-16 text-slate-400">
              <p className="text-[10px] font-black uppercase tracking-widest">Keine bevorstehenden Termine</p>
              <p className="text-sm mt-2">Füge Klausuren oder Lerntermine hinzu.</p>
            </div>
          ) : (
            upcomingItems.map(item => {
              const d = new Date(item.date + 'T12:00:00');
              const daysUntil = Math.ceil((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
              return (
                <div key={item.id} className={`flex items-center gap-4 px-6 py-5 bg-white dark:bg-slate-900 rounded-[20px] border shadow-sm ${item.source === 'exam' ? 'border-rose-100 dark:border-rose-900/30' : 'border-slate-100 dark:border-slate-800'}`}>
                  <div className={`w-2 h-10 rounded-full shrink-0 ${item.source === 'exam' ? 'bg-rose-400' : 'bg-blue-400'}`} />
                  <div className="flex-grow min-w-0">
                    <p className="text-sm font-black dark:text-white">{item.title}</p>
                    {item.description && <p className="text-xs text-slate-400 mt-0.5 truncate">{item.description}</p>}
                    <p className="text-[9px] font-black uppercase tracking-widest mt-1 text-slate-400">
                      {item.source === 'exam' ? 'Klausur' : 'Termin'}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-black dark:text-white">{d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })}</p>
                    <p className={`text-[9px] font-black uppercase tracking-widest mt-0.5 ${daysUntil <= 7 ? 'text-rose-500' : daysUntil <= 14 ? 'text-amber-500' : 'text-slate-400'}`}>
                      {daysUntil === 0 ? 'Heute' : daysUntil === 1 ? 'Morgen' : `in ${daysUntil} Tagen`}
                    </p>
                  </div>
                  {item.source !== 'exam' && (
                    <button onClick={() => saveEvents(events.filter(ev => ev.id !== item.id))} className="w-7 h-7 shrink-0 flex items-center justify-center rounded-lg text-slate-300 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors">
                      <X size={12} />
                    </button>
                  )}
                  {item.source === 'exam' && (
                    <button onClick={() => onUpdateExams(examTerms.filter(e => e.id !== item.id))} className="w-7 h-7 shrink-0 flex items-center justify-center rounded-lg text-slate-300 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors">
                      <X size={12} />
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ── WOCHE VIEW ── */}
      {viewMode === 'woche' && (
        <div className="max-w-5xl mx-auto space-y-6">

          {/* Day Nav — short names on mobile, full on desktop */}
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none -mx-4 px-4 md:flex-wrap md:justify-center md:overflow-visible md:mx-0 md:px-0">
            {DAYS.map((day, i) => (
              <button
                key={day}
                onClick={() => setSelectedDay(day)}
                className={`shrink-0 px-4 md:px-5 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${selectedDay === day ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
              >
                <span className="md:hidden">{WEEK_DAYS_SHORT[i]}</span>
                <span className="hidden md:inline">{day}</span>
              </button>
            ))}
          </div>

          {/* ── MOBILE: Liste + Schnell-Hinzufügen ── */}
          <div className="md:hidden space-y-4">
            {/* Entries for selected day */}
            {entries.filter(e => e.day === selectedDay).length === 0 ? (
              <div className="py-10 text-center text-slate-400 rounded-[24px] border border-dashed border-slate-200 dark:border-slate-700">
                <p className="text-[10px] font-black uppercase tracking-widest">Keine Blöcke für {selectedDay}</p>
              </div>
            ) : (
              <div className="space-y-3">
                {entries
                  .filter(e => e.day === selectedDay)
                  .sort((a, b) => a.startTime.localeCompare(b.startTime))
                  .map(entry => {
                    const c = COLORS.find(x => x.id === entry.color) || COLORS[0];
                    return (
                      <div key={entry.id} className={`flex items-center gap-4 px-5 py-4 bg-white dark:bg-slate-900 rounded-[20px] border-2 shadow-sm ${entry.completed ? 'opacity-40' : c.border} border-opacity-40`}>
                        <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${c.bg}`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">{entry.subject}</p>
                          <p className="text-sm font-black dark:text-white truncate">{entry.topic}</p>
                          <p className="text-[10px] font-mono text-slate-400 mt-0.5">{entry.startTime} – {entry.endTime}</p>
                        </div>
                        <button
                          onClick={() => savePlan(entries.map(x => x.id === entry.id ? { ...x, completed: !x.completed } : x))}
                          className={`w-8 h-8 rounded-xl border-2 flex items-center justify-center shrink-0 transition-all text-xs font-black ${entry.completed ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-slate-200 dark:border-slate-700'}`}
                        >
                          {entry.completed ? '✓' : ''}
                        </button>
                        <button
                          onClick={() => savePlan(entries.filter(x => x.id !== entry.id))}
                          className="text-slate-300 hover:text-rose-500 transition-colors shrink-0"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    );
                  })
                }
              </div>
            )}

            {/* Quick-add form */}
            {showQuickAdd ? (
              <form
                onSubmit={e => {
                  e.preventDefault();
                  if (!qaSubject.trim()) return;
                  savePlan([...entries, {
                    id: Math.random().toString(36).substr(2, 9),
                    day: selectedDay,
                    subject: qaSubject.trim(),
                    topic: qaTopic.trim() || qaSubject.trim(),
                    color: qaColor,
                    startTime: qaStart,
                    endTime: qaEnd,
                    completed: false,
                  }]);
                  setQaSubject(''); setQaTopic(''); setQaStart('08:00'); setQaEnd('09:30');
                  setShowQuickAdd(false);
                }}
                className="bg-white dark:bg-slate-900 rounded-[24px] border border-slate-100 dark:border-slate-800 p-5 space-y-4 animate-in zoom-in-95 duration-200"
              >
                <p className="text-[9px] font-black uppercase tracking-widest text-indigo-600">Lernblock hinzufügen · {selectedDay}</p>
                <div className="grid grid-cols-2 gap-3">
                  <input
                    autoFocus
                    value={qaSubject}
                    onChange={e => setQaSubject(e.target.value)}
                    placeholder="Fach *"
                    className="col-span-2 p-3 bg-slate-50 dark:bg-slate-800 rounded-xl border-2 border-transparent focus:border-indigo-500 outline-none dark:text-white text-sm font-bold transition-colors"
                  />
                  <input
                    value={qaTopic}
                    onChange={e => setQaTopic(e.target.value)}
                    placeholder="Thema"
                    className="col-span-2 p-3 bg-slate-50 dark:bg-slate-800 rounded-xl border-2 border-transparent focus:border-indigo-500 outline-none dark:text-white text-sm transition-colors"
                  />
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-400 uppercase ml-1">Von</label>
                    <input type="time" value={qaStart} onChange={e => setQaStart(e.target.value)} className="w-full p-3 bg-slate-50 dark:bg-slate-800 rounded-xl border-2 border-transparent focus:border-indigo-500 outline-none dark:text-white text-sm font-bold" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-400 uppercase ml-1">Bis</label>
                    <input type="time" value={qaEnd} onChange={e => setQaEnd(e.target.value)} className="w-full p-3 bg-slate-50 dark:bg-slate-800 rounded-xl border-2 border-transparent focus:border-indigo-500 outline-none dark:text-white text-sm font-bold" />
                  </div>
                </div>
                {/* Color picker */}
                <div className="flex gap-2">
                  {COLORS.map(c => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setQaColor(c.id)}
                      className={`w-8 h-8 rounded-full ${c.bg} transition-all ${qaColor === c.id ? 'ring-2 ring-offset-2 ring-indigo-500 scale-110' : 'opacity-50 hover:opacity-100'}`}
                    />
                  ))}
                </div>
                <div className="flex gap-2">
                  <button type="submit" disabled={!qaSubject.trim()} className="flex-1 py-3 bg-indigo-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest disabled:opacity-50 transition-all">
                    Hinzufügen
                  </button>
                  <button type="button" onClick={() => setShowQuickAdd(false)} className="px-4 py-3 bg-slate-100 dark:bg-slate-800 text-slate-400 rounded-xl text-[10px] font-black uppercase">
                    Abbrechen
                  </button>
                </div>
              </form>
            ) : (
              <button
                onClick={() => setShowQuickAdd(true)}
                className="w-full py-4 rounded-[20px] border-2 border-dashed border-slate-200 dark:border-slate-700 text-slate-400 hover:border-indigo-400 hover:text-indigo-500 transition-all flex items-center justify-center gap-2 font-black text-[10px] uppercase tracking-widest"
              >
                <Plus size={14} /> Lernblock hinzufügen
              </button>
            )}
          </div>

          {/* ── DESKTOP: Templates + Zeitgitter ── */}
          <div className="hidden md:block space-y-6">
            {/* Templates */}
            <div className="flex flex-col items-center gap-4 py-2">
              <p className="text-[9px] font-black uppercase tracking-[0.3em] text-slate-400">Vorlagen zum Reinziehen</p>
              <div className="flex flex-wrap justify-center gap-3">
                {templates.map(t => (
                  <div
                    key={t.id}
                    draggable
                    onDragStart={e => { e.dataTransfer.setData('type', 'template'); e.dataTransfer.setData('data', JSON.stringify(t)); }}
                    className={`px-6 py-3 bg-white dark:bg-slate-900 border-2 rounded-2xl cursor-grab shadow-sm hover:scale-105 active:cursor-grabbing transition-all ${COLORS.find(c => c.id === t.color)?.border} border-opacity-30`}
                  >
                    <p className="text-[10px] font-black dark:text-white uppercase tracking-wider">{t.subject}</p>
                  </div>
                ))}
                {showTplInput ? (
                  <form onSubmit={e => {
                    e.preventDefault();
                    if (!tplInputValue.trim()) return;
                    const saved = localStorage.getItem('study_templates');
                    const existing = saved ? JSON.parse(saved) : [];
                    const updated = [...existing, { id: Math.random().toString(36).substr(2, 9), subject: tplInputValue.trim(), topic: 'Study', color: COLORS[Math.floor(Math.random() * COLORS.length)].id }];
                    setTemplates(updated);
                    localStorage.setItem('study_templates', JSON.stringify(updated));
                    setTplInputValue('');
                    setShowTplInput(false);
                  }} className="flex items-center gap-2">
                    <input autoFocus value={tplInputValue} onChange={e => setTplInputValue(e.target.value)} placeholder="Fachname..." className="px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl text-sm font-bold dark:text-white outline-none focus:ring-2 ring-indigo-500/30 w-36" />
                    <button type="submit" className="w-8 h-8 flex items-center justify-center bg-indigo-600 text-white rounded-full font-black text-sm">✓</button>
                    <button type="button" onClick={() => setShowTplInput(false)} className="w-8 h-8 flex items-center justify-center bg-slate-100 dark:bg-slate-800 rounded-full text-slate-400">✕</button>
                  </form>
                ) : (
                  <button onClick={() => setShowTplInput(true)} className="w-10 h-10 flex items-center justify-center bg-slate-100 dark:bg-slate-800 rounded-full text-slate-400 hover:text-indigo-600 transition-colors text-xl font-black">
                    <Plus size={16} />
                  </button>
                )}
              </div>
            </div>

            {/* Time Grid */}
            <div className="bg-white dark:bg-slate-900 rounded-[32px] border border-slate-100 dark:border-slate-800 shadow-3d-raised overflow-hidden">
              <div className="flex">
                <div className="w-16 shrink-0 border-r border-slate-100 dark:border-slate-800">
                  {HOURS.map(h => (
                    <div key={h} style={{ height: HOUR_HEIGHT }} className="flex justify-center pt-2 border-b border-slate-50 dark:border-slate-800/50">
                      <span className="text-[9px] font-mono font-black text-slate-300 dark:text-slate-700">{h}:00</span>
                    </div>
                  ))}
                </div>
                <div className="flex-grow">
                  <div
                    onDragOver={e => e.preventDefault()}
                    onDrop={e => onDrop(e, selectedDay)}
                    className="relative select-none"
                    style={{ minHeight: HOUR_HEIGHT * HOURS.length }}
                  >
                    {HOURS.map(h => (
                      <div key={h} style={{ height: HOUR_HEIGHT }} className="border-b border-slate-50 dark:border-slate-800/50 w-full" />
                    ))}
                    {entries.filter(e => e.day === selectedDay).map(entry => {
                      const { top, height } = calculatePosition(entry.startTime, entry.endTime);
                      const c = COLORS.find(x => x.id === entry.color) || COLORS[0];
                      const isResizing = resizingId === entry.id;
                      return (
                        <div
                          key={entry.id}
                          style={{ top: `${top}px`, height: `${height}px`, left: '12px', right: '12px' }}
                          className={`absolute rounded-[24px] border-2 p-4 transition-all duration-300 cursor-pointer group/item ${entry.completed ? 'opacity-30 grayscale blur-[0.5px]' : `bg-white dark:bg-slate-900 ${c.border} border-opacity-40 hover:border-opacity-100 shadow-3d-raised hover:shadow-3d-deep`} ${isResizing ? 'ring-4 ring-indigo-500/20 z-50' : 'z-10'}`}
                        >
                          <div className="flex flex-col h-full gap-1.5">
                            <div className="flex justify-between items-start">
                              <div className="flex items-center gap-2">
                                <span className={`w-2 h-2 rounded-full ${c.bg}`} />
                                <span className="text-[9px] font-black uppercase text-slate-400 tracking-widest">{entry.subject}</span>
                              </div>
                              <button onClick={e => { e.stopPropagation(); savePlan(entries.filter(x => x.id !== entry.id)); }} className="text-slate-300 hover:text-rose-500 opacity-0 group-hover/item:opacity-100 transition-opacity">
                                <X size={12} />
                              </button>
                            </div>
                            <p className="text-sm font-black dark:text-white truncate leading-tight">{entry.topic}</p>
                            <div className="mt-auto flex justify-between items-end">
                              <span className="text-[9px] font-mono font-black text-slate-400">{entry.startTime} – {entry.endTime}</span>
                              <button
                                onClick={e => { e.stopPropagation(); savePlan(entries.map(x => x.id === entry.id ? { ...x, completed: !x.completed } : x)); }}
                                className={`w-7 h-7 rounded-lg border-2 flex items-center justify-center transition-all text-xs ${entry.completed ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 hover:border-indigo-500'}`}
                              >
                                {entry.completed ? '✓' : ''}
                              </button>
                            </div>
                          </div>
                          {!entry.completed && (
                            <div onMouseDown={e => handleResizeStart(e, entry)} className="absolute bottom-0 left-0 right-0 h-5 cursor-ns-resize flex items-end justify-center pb-1.5 opacity-0 group-hover/item:opacity-100 transition-opacity">
                              <div className="w-10 h-1 bg-slate-200 dark:bg-slate-700 rounded-full" />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <AgentChat
        agentType="studyFlow"
        context={{ metrics, examTerms, currentTab: 'PLANNER' }}
        isOpen={studyFlowOpen}
        onClose={() => setStudyFlowOpen(false)}
      />
    </div>
  );
};
