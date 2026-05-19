
import React, { useState, useEffect, useRef } from 'react';
import { StudyEntry, TopicMetric, FlashcardDeck, ExamTerm } from '../types';
import { GeneratedImage } from './GeneratedImage';
import { generateSmartStudyPlan } from '../services/geminiService';
import { toast } from '../services/toast';

const HOURS = Array.from({ length: 18 }, (_, i) => i + 7); // 7 to 24
const DAYS = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
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

export const StudyPlanner: React.FC<StudyPlannerProps> = ({ metrics, decks, examTerms, onUpdateExams }) => {
  const [entries, setEntries] = useState<StudyEntry[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [selectedDay, setSelectedDay] = useState(DAYS[0]);
  
  const [templates, setTemplates] = useState<StudyTemplate[]>([]);
  const [newTplSubject, setNewTplSubject] = useState('');
  const [newTplTopic, setNewTplTopic] = useState('');
  const [selectedColor, setSelectedColor] = useState(COLORS[0].id);
  const [showTplInput, setShowTplInput] = useState(false);
  const [tplInputValue, setTplInputValue] = useState('');

  // Exam Form
  const [showExamForm, setShowExamForm] = useState(false);
  const [newExamTitle, setNewExamTitle] = useState('');
  const [newExamDate, setNewExamDate] = useState('');

  // Resizing State
  const [resizingId, setResizingId] = useState<string | null>(null);
  const resizeStateRef = useRef({
    id: null as string | null,
    initialY: 0,
    initialDuration: 0,
    startTimeMinutes: 0
  });

  const entriesRef = useRef(entries);
  useEffect(() => {
    entriesRef.current = entries;
  }, [entries]);

  useEffect(() => {
    const saved = localStorage.getItem('study_plan');
    const savedTemplates = localStorage.getItem('study_templates');
    if (saved) try { setEntries(JSON.parse(saved)); } catch (e) {}
    if (savedTemplates) try { setTemplates(JSON.parse(savedTemplates)); } catch (e) {}
  }, []);

  const savePlan = (newEntries: StudyEntry[]) => {
    setEntries(newEntries);
    localStorage.setItem('study_plan', JSON.stringify(newEntries));
  };

  const parseTimeToMinutes = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  };

  const minutesToTime = (total: number) => {
    const h = Math.floor(total / 60);
    const m = total % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
  };

  const handleSmartPlan = async () => {
    setIsGenerating(true);
    try {
      const plan = await generateSmartStudyPlan(metrics, decks, examTerms);
      savePlan(plan);
      const days = [...new Set(plan.map(e => e.day))];
      toast.success(`Plan erstellt: ${plan.length} Einträge für ${days.length} Tag${days.length !== 1 ? 'e' : ''}.`);
    } catch (e) {
      toast.error('Smart Plan konnte nicht generiert werden.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleResizeStart = (e: React.MouseEvent, entry: StudyEntry) => {
    e.preventDefault();
    e.stopPropagation();
    
    const startMin = parseTimeToMinutes(entry.startTime);
    const endMin = parseTimeToMinutes(entry.endTime);
    
    resizeStateRef.current = {
      id: entry.id,
      initialY: e.clientY,
      initialDuration: endMin - startMin,
      startTimeMinutes: startMin
    };
    
    setResizingId(entry.id);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const state = resizeStateRef.current;
      if (!state.id) return;
      const deltaY = e.clientY - state.initialY;
      const deltaMinutes = Math.round(((deltaY / HOUR_HEIGHT) * 60) / STEP) * STEP;
      const newDuration = Math.max(STEP, state.initialDuration + deltaMinutes);
      const newEndTime = minutesToTime(state.startTimeMinutes + newDuration);
      setEntries(prev => prev.map(entry => 
        entry.id === state.id ? { ...entry, endTime: newEndTime } : entry
      ));
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
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [resizingId]);

  const onDrop = (e: React.DragEvent, day: string) => {
    e.preventDefault();
    const type = e.dataTransfer.getData('type');
    if (type !== 'template') return;
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const gridMinutes = Math.round(((y / HOUR_HEIGHT) * 60) / STEP) * STEP;
    const startTotalMinutes = (7 * 60) + gridMinutes;
    const clampedStart = Math.min(Math.max(startTotalMinutes, 7 * 60), 23 * 60 + 45);
    const t: StudyTemplate = JSON.parse(e.dataTransfer.getData('data'));
    const defaultDuration = 90;
    savePlan([...entries, {
      id: Math.random().toString(36).substr(2, 9),
      day, 
      subject: t.subject, 
      topic: t.topic, 
      color: t.color,
      startTime: minutesToTime(clampedStart),
      endTime: minutesToTime(clampedStart + defaultDuration),
      completed: false
    }]);
  };

  const calculatePosition = (start: string, end: string) => {
    const s = parseTimeToMinutes(start);
    const e = parseTimeToMinutes(end);
    const dayStart = 7 * 60;
    return { top: ((s - dayStart) / 60) * HOUR_HEIGHT, height: ((e - s) / 60) * HOUR_HEIGHT };
  };

  const knowledgeGaps = metrics.filter(m => m.confidence < 70);
  const dueDecks = decks.filter(d => d.cards.some(c => c.nextReview <= Date.now() || c.level === 0));

  return (
    <div className="max-w-6xl mx-auto space-y-12 animate-in fade-in duration-1000 pb-20 px-4">
      {/* Centered Header */}
      <div className="text-center space-y-6">
        <div className="inline-block px-4 py-1.5 bg-indigo-50 dark:bg-indigo-950/30 rounded-full border border-indigo-100 dark:border-indigo-900/50 mb-4">
          <span className="text-[10px] font-black uppercase tracking-[0.3em] text-indigo-600">Zeitmanagement</span>
        </div>
        <h1 className="text-5xl lg:text-7xl font-black tracking-tighter dark:text-white">
          Study <span className="text-indigo-600">Flow</span> <GeneratedImage prompt="Calendar study planner icon, academic illustration" className="w-12 h-12 inline-block ml-2" />
        </h1>
        <p className="text-slate-500 dark:text-slate-400 font-medium max-w-xl mx-auto">
          Dein akademischer Rhythmus. KI-gesteuert, datenbasiert und nahtlos integriert.
        </p>
        
        <div className="flex justify-center gap-4 pt-4">
          <button 
            onClick={handleSmartPlan}
            disabled={isGenerating}
            className="bg-indigo-600 text-white px-10 py-5 rounded-3xl font-black uppercase tracking-[0.2em] text-[11px] shadow-3d-deep hover:scale-105 active:scale-95 transition-all flex items-center gap-3 disabled:opacity-50"
          >
            {isGenerating ? 'KI plant...' : <span>Smart Plan generieren <GeneratedImage prompt="Sparkles icon, minimalist" className="w-4 h-4 inline-block ml-1" /></span>}
          </button>
          <button 
             onClick={() => setShowExamForm(!showExamForm)}
             className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white border-2 border-slate-200 dark:border-slate-800 px-8 py-5 rounded-3xl font-black uppercase tracking-[0.2em] text-[11px] hover:bg-slate-50 dark:hover:bg-slate-800 transition-all"
          >
            + Termin
          </button>
        </div>
      </div>

      {/* Top Row Widgets (Integrated) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
        {/* Knowledge Gaps Widget */}
        <div className="p-6 rounded-[32px] bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm border border-slate-200/50 dark:border-slate-800/50 transition-all hover:bg-white dark:hover:bg-slate-900">
          <h3 className="text-[9px] font-black uppercase tracking-[0.4em] text-indigo-500 mb-4">Gaps ({knowledgeGaps.length})</h3>
          <div className="space-y-2">
            {knowledgeGaps.slice(0, 3).map(gap => (
              <div key={gap.id} className="flex justify-between items-center">
                <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300 truncate pr-2">{gap.topic}</span>
                <span className="text-[10px] font-black text-indigo-600">{gap.confidence}%</span>
              </div>
            ))}
            {knowledgeGaps.length === 0 && <p className="text-[10px] text-slate-400 italic">Keine Lücken! <GeneratedImage prompt="Rocket launch icon, minimalist" className="w-3 h-3 inline-block ml-1" /></p>}
          </div>
        </div>

        {/* Due Decks Widget */}
        <div className="p-6 rounded-[32px] bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm border border-slate-200/50 dark:border-slate-800/50 transition-all hover:bg-white dark:hover:bg-slate-900">
          <h3 className="text-[9px] font-black uppercase tracking-[0.4em] text-indigo-600 mb-4">Due Cards ({dueDecks.length})</h3>
          <div className="space-y-2">
            {dueDecks.slice(0, 3).map(deck => (
              <div key={deck.id} className="flex justify-between items-center">
                <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300 truncate pr-2">{deck.title}</span>
                <div className="w-1.5 h-1.5 rounded-full bg-indigo-500"></div>
              </div>
            ))}
            {dueDecks.length === 0 && <p className="text-[10px] text-slate-400 italic">Alles gelernt! <GeneratedImage prompt="Sparkles icon, minimalist" className="w-3 h-3 inline-block ml-1" /></p>}
          </div>
        </div>

        {/* Upcoming Exams Widget */}
        <div className="p-6 rounded-[32px] bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm border border-slate-200/50 dark:border-slate-800/50 transition-all hover:bg-white dark:hover:bg-slate-900">
          <h3 className="text-[9px] font-black uppercase tracking-[0.4em] text-rose-500 mb-4">Examen ({examTerms.length})</h3>
          <div className="space-y-2">
            {examTerms.slice(0, 3).map(exam => (
              <div key={exam.id} className="flex justify-between items-center">
                <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300 truncate pr-2">{exam.title}</span>
                <span className="text-[9px] font-black text-rose-500">{new Date(exam.date).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}</span>
              </div>
            ))}
            {examTerms.length === 0 && <p className="text-[10px] text-slate-400 italic">Keine Termine.</p>}
          </div>
        </div>
      </div>

      {/* Exam Dialog (Integrated) */}
      {showExamForm && (
        <div className="max-w-xl mx-auto p-8 bg-white dark:bg-slate-900 rounded-[32px] border-2 border-indigo-500/20 shadow-2xl animate-in zoom-in-95">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-xl font-black dark:text-white">Klausur eintragen</h3>
            <button onClick={() => setShowExamForm(false)} className="text-slate-300 hover:text-rose-500 transition-colors">
              <GeneratedImage prompt="Close icon, minimalist" className="w-3 h-3" />
            </button>
          </div>
          <div className="space-y-4">
            <input value={newExamTitle} onChange={e => setNewExamTitle(e.target.value)} placeholder="Titel der Klausur" className="w-full p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl outline-none dark:text-white font-bold" />
            <input type="date" value={newExamDate} onChange={e => setNewExamDate(e.target.value)} className="w-full p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl outline-none dark:text-white font-bold" />
            <button onClick={() => {
              if(!newExamTitle || !newExamDate) return;
              onUpdateExams([...examTerms, { id: Math.random().toString(36).substr(2, 5), title: newExamTitle, date: newExamDate, topics: [] }]);
              setNewExamTitle(''); setNewExamDate(''); setShowExamForm(false);
            }} className="w-full bg-indigo-600 text-white py-4 rounded-2xl text-[11px] font-black uppercase tracking-widest">Speichern & Schließen</button>
          </div>
        </div>
      )}

      {/* Integrated Templates Row */}
      <div className="flex flex-col items-center gap-4 py-4">
        <p className="text-[9px] font-black uppercase tracking-[0.3em] text-slate-400">Vorlagen zum Reiziehen</p>
        <div className="flex flex-wrap justify-center gap-3">
          {templates.map(t => (
            <div 
              key={t.id} 
              draggable 
              onDragStart={e => {
                e.dataTransfer.setData('type', 'template');
                e.dataTransfer.setData('data', JSON.stringify(t));
              }}
              className={`px-6 py-3 bg-white dark:bg-slate-900 border-2 rounded-2xl cursor-grab shadow-sm transition-all hover:scale-105 active:cursor-grabbing ${COLORS.find(c => c.id === t.color)?.border} border-opacity-30`}
            >
              <p className="text-[10px] font-black dark:text-white uppercase tracking-wider">{t.subject}</p>
            </div>
          ))}
          {showTplInput ? (
            <form
              onSubmit={e => {
                e.preventDefault();
                if (!tplInputValue.trim()) return;
                const saved = localStorage.getItem('study_templates');
                const existing = saved ? JSON.parse(saved) : [];
                const updated = [...existing, { id: Math.random().toString(36).substr(2, 9), subject: tplInputValue.trim(), topic: 'Study', color: COLORS[Math.floor(Math.random()*COLORS.length)].id }];
                setTemplates(updated);
                localStorage.setItem('study_templates', JSON.stringify(updated));
                setTplInputValue('');
                setShowTplInput(false);
              }}
              className="flex items-center gap-2"
            >
              <input
                autoFocus
                value={tplInputValue}
                onChange={e => setTplInputValue(e.target.value)}
                placeholder="Fachname..."
                className="px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl text-sm font-bold dark:text-white outline-none focus:ring-2 ring-indigo-500/30 w-36"
              />
              <button type="submit" className="w-8 h-8 flex items-center justify-center bg-indigo-600 text-white rounded-full text-lg font-black">✓</button>
              <button type="button" onClick={() => setShowTplInput(false)} className="w-8 h-8 flex items-center justify-center bg-slate-100 dark:bg-slate-800 rounded-full text-slate-400">✕</button>
            </form>
          ) : (
            <button
              onClick={() => setShowTplInput(true)}
              className="w-10 h-10 flex items-center justify-center bg-slate-100 dark:bg-slate-800 rounded-full text-slate-400 hover:text-indigo-600 transition-colors text-xl font-black"
            >+</button>
          )}
        </div>
      </div>

      {/* Seamless Calendar Grid */}
      <div className="relative flex flex-col gap-8 max-w-5xl mx-auto">
        {/* Day Nav */}
        <div className="flex justify-center gap-2">
          {DAYS.map(day => (
            <button 
              key={day} 
              onClick={() => setSelectedDay(day)} 
              className={`px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${selectedDay === day ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
            >
              {day}
            </button>
          ))}
        </div>

        <div className="flex">
          {/* Time Sidebar */}
          <div className="w-16 shrink-0 pt-16">
            {HOURS.map(h => (
              <div key={h} style={{ height: HOUR_HEIGHT }} className="flex justify-center pt-2">
                <span className="text-[9px] font-mono font-black text-slate-300 dark:text-slate-700">{h}:00</span>
              </div>
            ))}
          </div>

          {/* Grid Area */}
          <div className="flex-grow">
            <div className="grid grid-cols-1 relative">
              <div 
                onDragOver={e => e.preventDefault()} 
                onDrop={e => onDrop(e, selectedDay)} 
                className="relative min-h-[1440px] select-none"
              >
                {/* Horizontal lines */}
                {HOURS.map(h => (
                  <div 
                    key={h} 
                    style={{ height: HOUR_HEIGHT }} 
                    className="border-b border-slate-100 dark:border-slate-800/50 w-full"
                  />
                ))}
                
                {/* Entries */}
                {entries.filter(e => e.day === selectedDay).map(entry => {
                  const { top, height } = calculatePosition(entry.startTime, entry.endTime);
                  const c = COLORS.find(x => x.id === entry.color) || COLORS[0];
                  const isResizing = resizingId === entry.id;

                  return (
                    <div 
                      key={entry.id} 
                      style={{ top: `${top}px`, height: `${height}px`, left: '16px', right: '16px' }} 
                      className={`absolute rounded-[28px] border-2 p-5 transition-all duration-500 cursor-pointer group/item ${entry.completed ? 'opacity-30 grayscale blur-[0.5px]' : `bg-white dark:bg-slate-900 ${c.border} border-opacity-40 hover:border-opacity-100 shadow-3d-raised hover:shadow-3d-deep`} ${isResizing ? 'ring-4 ring-indigo-500/20 z-50' : 'z-10'}`}
                    >
                      <div className="flex flex-col h-full gap-2">
                        <div className="flex justify-between items-start">
                          <div className="flex items-center gap-2">
                            <span className={`w-2 h-2 rounded-full ${c.bg}`}></span>
                            <span className="text-[9px] font-black uppercase text-slate-400 tracking-widest">{entry.subject}</span>
                          </div>
                          <button onClick={e => { e.stopPropagation(); savePlan(entries.filter(x => x.id !== entry.id)); }} className="text-slate-300 hover:text-rose-500 opacity-0 group-hover/item:opacity-100 transition-opacity">
                            <GeneratedImage prompt="Close icon, minimalist" className="w-3 h-3" />
                          </button>
                        </div>
                        
                        <p className="text-sm font-black dark:text-white truncate mt-1 leading-tight">{entry.topic}</p>
                        
                        <div className="mt-auto flex justify-between items-end">
                          <span className="text-[9px] font-mono font-black text-slate-400">{entry.startTime} – {entry.endTime}</span>
                          <button 
                            onClick={(e) => { e.stopPropagation(); savePlan(entries.map(x => x.id === entry.id ? {...x, completed: !x.completed} : x))}} 
                            className={`w-8 h-8 rounded-xl border-2 flex items-center justify-center transition-all ${entry.completed ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 hover:border-indigo-500'}`}
                          >
                            {entry.completed ? '✓' : ''}
                          </button>
                        </div>
                      </div>
                      
                      {!entry.completed && (
                        <div 
                          onMouseDown={(e) => handleResizeStart(e, entry)} 
                          className={`absolute bottom-0 left-0 right-0 h-6 cursor-ns-resize flex items-end justify-center pb-2 opacity-0 group-hover/item:opacity-100 transition-opacity`}
                        >
                          <div className="w-12 h-1 bg-slate-200 dark:bg-slate-700 rounded-full" />
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

      <div className="max-w-xl mx-auto p-6 bg-indigo-600 rounded-[32px] text-white shadow-3d-deep flex items-center gap-6">
        <GeneratedImage prompt="Lightbulb idea icon, minimalist academic" className="w-8 h-8 shrink-0" />
        <p className="text-[11px] font-medium leading-relaxed italic opacity-90">
          "Dein Lernplan passt sich automatisch an. Je mehr Quiz du absolvierst, desto präziser werden die Pausen und Wiederholungen in deinen Smart Plan integriert."
        </p>
      </div>
    </div>
  );
};
