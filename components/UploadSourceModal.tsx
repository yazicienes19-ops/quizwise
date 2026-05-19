import React, { useState, useRef, useCallback } from 'react';
import type { SourceMeta } from '../services/libraryService';

interface Props {
  onClose: () => void;
  onUpload: (file: File, meta: Partial<SourceMeta>) => Promise<void>;
}

const ACCEPTED = '.pdf,.docx,.txt,.md';
const FILE_EMOJI: Record<string, string> = { pdf: '📕', docx: '📘', txt: '📄', md: '📄' };

const Field: React.FC<{
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  textarea?: boolean;
}> = ({ label, value, onChange, placeholder, type = 'text', textarea }) => (
  <div className="space-y-1">
    <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">{label}</label>
    {textarea ? (
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        rows={3}
        className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 rounded-xl text-sm font-medium outline-none border-2 border-transparent focus:border-indigo-500 dark:text-white resize-none"
      />
    ) : (
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 rounded-xl text-sm font-medium outline-none border-2 border-transparent focus:border-indigo-500 dark:text-white"
      />
    )}
  </div>
);

export const UploadSourceModal: React.FC<Props> = ({ onClose, onUpload }) => {
  const [file, setFile]             = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [displayTitle, setDisplayTitle] = useState('');
  const [module, setModule]         = useState('');
  const [semester, setSemester]     = useState('');
  const [category, setCategory]     = useState('');
  const [tags, setTags]             = useState('');
  const [examDate, setExamDate]     = useState('');
  const [notes, setNotes]           = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const pickFile = useCallback((picked: File) => {
    setFile(picked);
    if (!displayTitle) setDisplayTitle(picked.name.replace(/\.[^/.]+$/, ''));
  }, [displayTitle]);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) pickFile(f);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) pickFile(f);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;
    setIsUploading(true);
    try {
      const meta: Partial<SourceMeta> = {
        displayTitle: displayTitle.trim() || undefined,
        module:       module.trim()   || undefined,
        semester:     semester.trim() || undefined,
        category:     category.trim() || undefined,
        tags:         tags.trim() ? tags.split(',').map(t => t.trim()).filter(Boolean) : undefined,
        examDate:     examDate || undefined,
        notes:        notes.trim() || undefined,
        status:       'ready',
      };
      await onUpload(file, meta);
      onClose();
    } finally {
      setIsUploading(false);
    }
  };

  const ext = file?.name.split('.').pop()?.toLowerCase() ?? '';

  return (
    <div
      className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 animate-in fade-in duration-200"
      onClick={() => { if (!isUploading) onClose(); }}
    >
      <div
        className="bg-white dark:bg-slate-900 rounded-[32px] w-full max-w-lg shadow-3d-deep overflow-hidden animate-in zoom-in-95 duration-300"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex justify-between items-center px-8 py-6 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h2 className="text-xl font-black dark:text-white">Quelle hinzufügen</h2>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mt-0.5">PDF · DOCX · TXT · MD</p>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-rose-500 transition-colors rounded-xl">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-8 py-6 space-y-5 max-h-[70vh] overflow-y-auto">
          {isUploading && (
            <div className="flex items-center justify-center gap-3 py-2 text-indigo-600">
              <span className="w-4 h-4 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
              <span className="text-[10px] font-black uppercase tracking-widest">Wird hochgeladen…</span>
            </div>
          )}
          {/* Drop Zone */}
          {!file ? (
            <div
              onDrop={handleDrop}
              onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all ${
                isDragging
                  ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20'
                  : 'border-slate-200 dark:border-slate-700 hover:border-indigo-400 hover:bg-slate-50 dark:hover:bg-slate-800/50'
              }`}
            >
              <input ref={fileInputRef} type="file" accept={ACCEPTED} className="hidden" onChange={handleFileInput} />
              <p className="text-4xl mb-3">📂</p>
              <p className="font-black dark:text-white text-sm">Datei hierher ziehen</p>
              <p className="text-[10px] text-slate-400 mt-1 uppercase tracking-widest">oder klicken zum Auswählen</p>
              <p className="text-[9px] text-slate-300 dark:text-slate-600 mt-3">PDF · DOCX · TXT · Markdown</p>
            </div>
          ) : (
            <div className="flex items-center gap-4 p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl">
              <span className="text-2xl">{FILE_EMOJI[ext] ?? '📄'}</span>
              <div className="flex-grow min-w-0">
                <p className="font-black dark:text-white text-sm truncate">{file.name}</p>
                <p className="text-[10px] text-slate-400 uppercase tracking-widest">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
              </div>
              <button type="button" onClick={() => setFile(null)} className="text-slate-400 hover:text-rose-500 transition-colors font-black text-lg leading-none">×</button>
            </div>
          )}

          {/* Metadata form */}
          <fieldset disabled={isUploading} className="space-y-4 disabled:opacity-60">
            <Field
              label="Titel (optional)"
              value={displayTitle}
              onChange={setDisplayTitle}
              placeholder={file ? file.name.replace(/\.[^/.]+$/, '') : 'z.B. KI Grundlagen SS 2025'}
            />
            <div className="grid grid-cols-2 gap-4">
              <Field label="Modul / Fach"   value={module}   onChange={setModule}   placeholder="z.B. Psychologie" />
              <Field label="Semester"        value={semester} onChange={setSemester} placeholder="z.B. SS 2025" />
            </div>
            <Field
              label="Tags (kommasepariert)"
              value={tags}
              onChange={setTags}
              placeholder="z.B. Klausur, Kapitel 3, Definitionen"
            />
            <div className="grid grid-cols-2 gap-4">
              <Field label="Kategorie"       value={category} onChange={setCategory} placeholder="z.B. Skript" />
              <Field label="Prüfungstermin"  value={examDate} onChange={setExamDate} type="date" />
            </div>
            <Field label="Notiz (optional)"  value={notes}    onChange={setNotes}    placeholder="z.B. Klausurrelevant laut Prof." textarea />
          </fieldset>

          <button
            type="submit"
            disabled={!file || isUploading}
            className="w-full bg-indigo-600 py-4 rounded-2xl text-[11px] font-black uppercase tracking-widest shadow-lg hover:scale-[1.02] transition-all disabled:opacity-40 disabled:scale-100"
            style={{ color: 'var(--primary-text)' }}
          >
            {isUploading ? 'Wird hochgeladen…' : 'Quelle hochladen'}
          </button>
        </form>
      </div>
    </div>
  );
};
