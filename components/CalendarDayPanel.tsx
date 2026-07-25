import React, { useState } from 'react';
import { X, Plus, BookOpen, Pencil, Trash2, CalendarX, Check, Repeat, Clock, FileText, MapPin } from 'lucide-react';
import { Collection, ExamTerm, StudyEvent } from '../types';
import { ResolvedSession, SessionFormInput, SessionEditTarget, MODULE_COLOR_SWATCHES, resolveModuleColor } from '../services/calendarSessions';
import { useTranslation } from '../i18n/I18nProvider';
import { formatDate } from '../i18n/dates';
import type { TKey } from '../i18n';

const WEEKDAY_KEYS = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];

interface CalendarDayPanelProps {
  date: Date;
  examsToday: ExamTerm[];
  eventsToday: StudyEvent[];
  sessions: ResolvedSession[];
  collections: Collection[];
  onUpdateCollectionColor: (collectionId: string, color: string) => void;
  onDeleteExam: (id: string) => void;
  onDeleteEvent: (id: string) => void;
  onDeleteOneOffSession: (id: string) => void;
  onSkipRecurringOccurrence: (ruleId: string) => void;
  onDeleteRecurringRule: (ruleId: string) => void;
  onSaveSession: (input: SessionFormInput) => void;
}

const DEFAULT_START = '16:00';
const DEFAULT_END = '17:30';

export const CalendarDayPanel: React.FC<CalendarDayPanelProps> = ({
  date, examsToday, eventsToday, sessions, collections,
  onUpdateCollectionColor, onDeleteExam, onDeleteEvent, onDeleteOneOffSession,
  onSkipRecurringOccurrence, onDeleteRecurringRule, onSaveSession,
}) => {
  const { t, tp } = useTranslation();
  const weekday = date.getDay();
  const weekdayName = t((`dow.${WEEKDAY_KEYS[weekday]}`) as TKey);

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<SessionEditTarget | undefined>(undefined);
  const [moduleId, setModuleId] = useState<string | undefined>(undefined);
  const [useCustom, setUseCustom] = useState(false);
  const [customSubject, setCustomSubject] = useState('');
  const [topic, setTopic] = useState('');
  const [startTime, setStartTime] = useState(DEFAULT_START);
  const [endTime, setEndTime] = useState(DEFAULT_END);
  const [repeat, setRepeat] = useState<'once' | 'weekly'>('once');
  const [openColorFor, setOpenColorFor] = useState<string | null>(null);

  const totalCount = examsToday.length + eventsToday.length + sessions.length;
  const recurringToday = sessions.find(s => s.recurring);

  const resetForm = () => {
    setEditing(undefined);
    setModuleId(undefined);
    setUseCustom(false);
    setCustomSubject('');
    setTopic('');
    setStartTime(DEFAULT_START);
    setEndTime(DEFAULT_END);
    setRepeat('once');
    setOpenColorFor(null);
  };

  const openAddForm = () => { resetForm(); setShowForm(true); };

  const openEditForm = (s: ResolvedSession) => {
    setModuleId(s.moduleId);
    setUseCustom(!s.moduleId);
    setCustomSubject(s.customSubject ?? '');
    setTopic(s.topic);
    setStartTime(s.startTime);
    setEndTime(s.endTime);
    if (s.recurring && s.sourceRuleId) {
      setEditing({ kind: 'recurring', ruleId: s.sourceRuleId });
      setRepeat('weekly');
    } else {
      setEditing({ kind: 'oneoff', id: s.id });
      setRepeat('once');
    }
    setOpenColorFor(null);
    setShowForm(true);
  };

  const handleSave = () => {
    if (!useCustom && !moduleId) return;
    const input: SessionFormInput = {
      editing,
      moduleId: useCustom ? undefined : moduleId,
      customSubject: useCustom ? customSubject.trim() : undefined,
      topic: topic.trim(),
      startTime,
      endTime,
      repeat,
    };
    onSaveSession(input);
    setShowForm(false);
    resetForm();
  };

  return (
    <div className="rounded-[32px] shadow-3d-raised overflow-hidden" style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border-color)' }}>
      <div className="px-6 py-5" style={{ borderBottom: '1px solid var(--border-color)' }}>
        <p className="text-lg font-black capitalize" style={{ color: 'var(--text-main)' }}>
          {formatDate(date, { weekday: 'long', day: 'numeric', month: 'long' })}
        </p>
        <p className="text-[11px] font-bold text-slate-400 mt-1">
          {recurringToday
            ? t('sp2.recurringSubtitle', { day: weekdayName })
            : totalCount > 0
            ? tp('sp2.dayPanelCountN', totalCount)
            : t('sp2.dayPanelEmpty')}
        </p>
      </div>

      <div className="p-5 space-y-3">
        {totalCount === 0 && (
          <div className="py-6 text-center">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{t('sp2.dayPanelEmpty')}</p>
            <p className="text-xs text-slate-400 mt-1">{t('sp2.dayPanelEmptyHint')}</p>
          </div>
        )}

        {examsToday.map(exam => (
          <div key={exam.id} className="flex items-center gap-3 p-3 rounded-2xl" style={{ background: 'var(--bg-main)', border: '1px solid var(--border-color)' }}>
            <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-rose-100 dark:bg-rose-900/30">
              <FileText size={16} className="text-rose-500" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-black break-words" style={{ color: 'var(--text-main)' }}>{exam.title}</p>
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mt-0.5">{t('sp2.examTermLabel')}</p>
            </div>
            <button aria-label={t('common.delete')} onClick={() => onDeleteExam(exam.id)} className="w-7 h-7 shrink-0 flex items-center justify-center rounded-lg text-slate-300 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors">
              <X size={14} />
            </button>
          </div>
        ))}

        {eventsToday.map(ev => (
          <div key={ev.id} className="flex items-center gap-3 p-3 rounded-2xl" style={{ background: 'var(--bg-main)', border: '1px solid var(--border-color)' }}>
            <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-blue-100 dark:bg-blue-900/30">
              <MapPin size={16} className="text-blue-500" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-black break-words" style={{ color: 'var(--text-main)' }}>{ev.title}</p>
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mt-0.5">{t('sp2.legendEvent')}</p>
            </div>
            <button aria-label={t('common.delete')} onClick={() => onDeleteEvent(ev.id)} className="w-7 h-7 shrink-0 flex items-center justify-center rounded-lg text-slate-300 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors">
              <X size={14} />
            </button>
          </div>
        ))}

        {sessions.map(s => (
          <div key={s.id} className="flex items-center gap-3 p-3 rounded-2xl" style={{ background: 'var(--bg-main)', border: '1px solid var(--border-color)' }}>
            <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: `color-mix(in srgb, ${s.color} 18%, transparent)` }}>
              <BookOpen size={16} style={{ color: s.color }} />
            </div>
            <div className="flex-1 min-w-0">
              {s.topic ? (
                <>
                  {s.subjectLabel && <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">{s.subjectLabel}</p>}
                  <p className="text-sm font-black break-words leading-tight" style={{ color: 'var(--text-main)' }}>{s.topic}</p>
                </>
              ) : (
                <p className="text-sm font-black break-words leading-tight" style={{ color: 'var(--text-main)' }}>{s.subjectLabel}</p>
              )}
              <p className="text-[10px] font-bold text-slate-400 mt-0.5 flex items-center gap-1.5 flex-wrap">
                <span className="font-mono tabular-nums">{s.startTime}–{s.endTime}</span>
                <span className="opacity-50">·</span>
                <span className="flex items-center gap-1">
                  {s.recurring ? <Repeat size={10} /> : <Clock size={10} />}
                  {s.recurring ? t('sp2.recurringLabel', { day: weekdayName }) : t('sp2.onceLabel')}
                </span>
              </p>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button aria-label={t('sp2.edit')} onClick={() => openEditForm(s)} className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-300 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors">
                <Pencil size={13} />
              </button>
              {s.recurring && s.sourceRuleId ? (
                <>
                  <button aria-label={t('sp2.skipOccurrence')} title={t('sp2.skipOccurrence')} onClick={() => onSkipRecurringOccurrence(s.sourceRuleId!)} className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-300 hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors">
                    <CalendarX size={13} />
                  </button>
                  <button
                    aria-label={t('sp2.deleteRule')}
                    title={t('sp2.deleteRule')}
                    onClick={() => { if (window.confirm(t('sp2.deleteRuleConfirm'))) onDeleteRecurringRule(s.sourceRuleId!); }}
                    className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-300 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors"
                  >
                    <Trash2 size={13} />
                  </button>
                </>
              ) : (
                <button aria-label={t('common.delete')} onClick={() => onDeleteOneOffSession(s.id)} className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-300 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors">
                  <X size={14} />
                </button>
              )}
            </div>
          </div>
        ))}

        {!showForm && (
          <button
            onClick={openAddForm}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl border-2 border-dashed text-slate-400 hover:text-indigo-500 transition-all text-[10px] font-black uppercase tracking-widest"
            style={{ borderColor: 'var(--border-color)' }}
          >
            <Plus size={14} /> {t('sp2.addSession')}
          </button>
        )}

        {showForm && (
          <div className="rounded-[24px] p-4 space-y-4" style={{ background: 'var(--bg-main)', border: '1px solid var(--border-color)' }}>
            <div className="flex items-center justify-between">
              <p className="text-[9px] font-black uppercase tracking-widest text-indigo-600">
                {editing ? t('sp2.editSession') : t('sp2.addSession')}
              </p>
              <button onClick={() => { setShowForm(false); resetForm(); }} className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-rose-500 transition-colors">
                <X size={14} />
              </button>
            </div>

            <div>
              <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2 block">{t('sp2.subjectLabel')}</span>
              <div className="flex flex-wrap gap-2">
                {collections.map(col => {
                  const color = resolveModuleColor(col.color);
                  const selected = !useCustom && moduleId === col.id;
                  return (
                    <div key={col.id} className="flex items-stretch rounded-xl border-[1.5px]" style={{ borderColor: selected ? 'var(--primary)' : 'var(--border-color)', background: selected ? 'color-mix(in srgb, var(--primary) 10%, transparent)' : 'transparent' }}>
                      <button
                        type="button"
                        aria-label={t('sp2.changeColorFor', { module: col.name })}
                        onClick={() => setOpenColorFor(o => (o === col.id ? null : col.id))}
                        className="flex items-center pl-3 pr-0"
                      >
                        <span className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
                      </button>
                      <button
                        type="button"
                        onClick={() => { setModuleId(col.id); setUseCustom(false); setOpenColorFor(null); }}
                        className="flex items-center gap-1.5 px-3 py-2 text-[11px] font-bold"
                        style={{ color: selected ? 'var(--primary)' : 'var(--text-main)' }}
                      >
                        <BookOpen size={13} style={{ color }} />
                        {col.name}
                      </button>
                    </div>
                  );
                })}
                <button
                  type="button"
                  onClick={() => { setUseCustom(true); setModuleId(undefined); setOpenColorFor(null); }}
                  className="px-3 py-2 rounded-xl border-[1.5px] border-dashed text-[11px] font-bold transition-colors"
                  style={{ borderColor: useCustom ? 'var(--primary)' : 'var(--border-color)', color: useCustom ? 'var(--primary)' : 'var(--text-muted, #94a3b8)' }}
                >
                  {t('sp2.customSubjectOption')}
                </button>
              </div>
              <p className="text-[10px] text-slate-400 mt-2">{t('sp2.colorPickerHint')}</p>

              {openColorFor && (() => {
                const col = collections.find(c => c.id === openColorFor);
                if (!col) return null;
                const color = resolveModuleColor(col.color);
                return (
                  <div className="mt-2 rounded-2xl p-3 flex items-center gap-2 flex-wrap" style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border-color)' }}>
                    <span className="text-[10px] font-bold mr-1" style={{ color: 'var(--text-main)' }}>{t('sp2.changeColorFor', { module: col.name })}</span>
                    {MODULE_COLOR_SWATCHES.map(sw => (
                      <button
                        key={sw}
                        type="button"
                        aria-label={sw}
                        onClick={() => { onUpdateCollectionColor(col.id, sw); setOpenColorFor(null); }}
                        className="w-6 h-6 rounded-full flex items-center justify-center transition-transform hover:scale-110 shrink-0"
                        style={{ background: sw }}
                      >
                        {sw.toLowerCase() === color.toLowerCase() && <Check size={12} className="text-white" strokeWidth={3} />}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => setOpenColorFor(null)}
                      className="w-6 h-6 flex items-center justify-center rounded-full text-slate-400 hover:text-rose-500 transition-colors ml-auto shrink-0"
                      aria-label={t('common.cancel')}
                    >
                      <X size={13} />
                    </button>
                  </div>
                );
              })()}

              {useCustom && (
                <input
                  autoFocus
                  value={customSubject}
                  onChange={e => setCustomSubject(e.target.value)}
                  placeholder={t('sp2.customSubjectInputPlaceholder')}
                  className="w-full mt-2 p-3 bg-slate-50 dark:bg-slate-800 rounded-xl outline-none dark:text-white text-sm font-bold"
                />
              )}
            </div>

            <div>
              <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2 block">{t('sp2.topicLabel')}</span>
              <input
                value={topic}
                onChange={e => setTopic(e.target.value)}
                placeholder={t('sp2.topicInputPlaceholder')}
                className="w-full p-3 bg-slate-50 dark:bg-slate-800 rounded-xl outline-none dark:text-white text-sm font-bold"
              />
            </div>

            <div className="flex gap-3">
              <div className="flex-1">
                <label className="text-[9px] font-black text-slate-400 uppercase ml-1 mb-1 block">{t('sp2.from')}</label>
                <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 rounded-xl outline-none dark:text-white text-sm font-bold" />
              </div>
              <div className="flex-1">
                <label className="text-[9px] font-black text-slate-400 uppercase ml-1 mb-1 block">{t('sp2.to')}</label>
                <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 rounded-xl outline-none dark:text-white text-sm font-bold" />
              </div>
            </div>

            <div>
              <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2 block">{t('sp2.repeatLabel')}</span>
              <div className="flex rounded-xl p-1 gap-1" style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border-color)' }}>
                <button
                  type="button"
                  onClick={() => setRepeat('once')}
                  className="flex-1 py-2 rounded-lg text-[10px] font-black transition-all"
                  style={repeat === 'once' ? { background: 'var(--primary)', color: 'var(--primary-text, white)' } : { color: 'var(--text-muted, #94a3b8)' }}
                >
                  {t('sp2.repeatOnce')}
                </button>
                <button
                  type="button"
                  onClick={() => setRepeat('weekly')}
                  className="flex-1 py-2 rounded-lg text-[10px] font-black transition-all"
                  style={repeat === 'weekly' ? { background: 'var(--primary)', color: 'var(--primary-text, white)' } : { color: 'var(--text-muted, #94a3b8)' }}
                >
                  {t('sp2.repeatWeekly', { day: weekdayName })}
                </button>
              </div>
              <p className="text-[10px] text-slate-400 mt-1.5">
                {repeat === 'weekly'
                  ? t('sp2.repeatHintWeekly', { day: weekdayName })
                  : t('sp2.repeatHintOnce', { date: formatDate(date, { day: '2-digit', month: '2-digit' }) })}
              </p>
            </div>

            <button
              onClick={handleSave}
              disabled={(!useCustom && !moduleId) || (useCustom && !customSubject.trim())}
              className="w-full py-3.5 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-opacity disabled:opacity-40"
              style={{ background: 'var(--primary)', color: 'var(--primary-text, white)' }}
            >
              {t('sp2.saveSession')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
