import React, { useState, useRef, useCallback } from 'react';
import type { SourceMeta } from '../services/libraryService';
import { detectUrlKind, importFromUrl } from '../services/urlImport';
import { toast } from '../services/toast';
import { useTranslation } from '../i18n/I18nProvider';

interface Props {
  onClose: () => void;
  onUpload: (file: File, meta: Partial<SourceMeta>) => Promise<void>;
}

const ACCEPTED = '.pdf,.docx,.txt,.md,.png,.jpg,.jpeg,.webp,.heic,.heif';
const FILE_EMOJI: Record<string, string> = { pdf: '📕', docx: '📘', txt: '📄', md: '📄', png: '🖼️', jpg: '🖼️', jpeg: '🖼️', webp: '🖼️', heic: '📷', heif: '📷' };

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
  const { t } = useTranslation();
  const [mode, setMode]             = useState<'file' | 'text' | 'link'>('file');
  const [pastedText, setPastedText] = useState('');
  const [linkUrl, setLinkUrl]       = useState('');
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
  const [isAltklausur, setIsAltklausur] = useState(false);
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

  const linkKind = detectUrlKind(linkUrl);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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
        isAltklausur: isAltklausur || undefined,
        status:       'ready',
      };

      let uploadFile: File | null;
      if (mode === 'link') {
        // Link-Modus: Backend holt den Inhalt (YouTube → Lernskript,
        // Webseite → Artikeltext) — gespeichert wird eine normale Text-Quelle
        const imported = await importFromUrl(linkUrl);
        const title = displayTitle.trim() || imported.title;
        const safeName = title.replace(/[\\/:*?"<>|]/g, '').slice(0, 120) || t('upl.importFallbackName');
        uploadFile = new File([imported.text], `${safeName}.txt`, { type: 'text/plain' });
        meta.displayTitle = title;
        meta.sourceUrl  = imported.url;
        meta.sourceKind = imported.kind;
        if (!meta.notes && imported.author) meta.notes = t('upl.fromAuthor', { author: imported.author });
      } else if (mode === 'text') {
        // Text-Modus: eingefügte Notiz wird als .txt-Quelle gespeichert (z.B. aus
        // NotebookLM, ChatGPT, eigenen Mitschriften) — für QuizWise gleichwertig zu Dateien
        uploadFile = pastedText.trim().length >= 20
          ? new File([pastedText.trim()], `${(displayTitle.trim() || t('upl.noteFallbackName'))}.txt`, { type: 'text/plain' })
          : null;
      } else {
        uploadFile = file;
      }
      if (!uploadFile) return;

      await onUpload(uploadFile, meta);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('upl.importFailed'));
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
            <h2 className="text-xl font-black dark:text-white">{t('upl.title')}</h2>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mt-0.5">{t('upl.subtitle')}</p>
          </div>
          <button aria-label={t('upl.close')} onClick={onClose} className="p-2 text-slate-400 hover:text-rose-500 transition-colors rounded-xl">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-8 py-6 space-y-5 max-h-[70vh] overflow-y-auto">
          {isUploading && (
            <div className="flex items-center justify-center gap-3 py-2 text-indigo-600">
              <span className="w-4 h-4 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
              <span className="text-[10px] font-black uppercase tracking-widest">
                {mode === 'link'
                  ? (linkKind === 'youtube' ? t('upl.videoProcessing') : t('upl.pageLoading'))
                  : t('upl.uploading')}
              </span>
            </div>
          )}
          {/* Modus: Datei hochladen, Text einfügen oder Link importieren */}
          <div className="flex p-1 rounded-2xl gap-1" style={{ background: 'color-mix(in srgb, var(--border-color) 40%, var(--bg-main))' }}>
            {([['file', t('upl.modeFile')], ['text', t('upl.modeText')], ['link', t('upl.modeLink')]] as const).map(([m, lbl]) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`flex-1 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all ${
                  mode === m ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'
                }`}
              >
                {lbl}
              </button>
            ))}
          </div>

          {/* Text-Modus */}
          {mode === 'text' && (
            <div className="space-y-2">
              <textarea
                autoFocus
                value={pastedText}
                onChange={e => setPastedText(e.target.value)}
                placeholder={t('upl.textPlaceholder')}
                rows={7}
                className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 rounded-2xl text-sm font-medium outline-none border-2 border-transparent focus:border-indigo-500 dark:text-white resize-none leading-relaxed"
              />
              <p className="text-[10px] text-slate-400 px-1">
                {t('upl.wordsSaved', { n: pastedText.trim().split(/\s+/).filter(Boolean).length })}
              </p>
            </div>
          )}

          {/* Link-Modus */}
          {mode === 'link' && (
            <div className="space-y-2">
              <input
                autoFocus
                type="url"
                value={linkUrl}
                onChange={e => setLinkUrl(e.target.value)}
                placeholder={t('upl.linkPlaceholder')}
                className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 rounded-2xl text-sm font-medium outline-none border-2 border-transparent focus:border-indigo-500 dark:text-white"
              />
              <p className="text-[10px] text-slate-400 px-1 leading-relaxed">
                {linkKind === 'youtube' && <>{t('upl.youtubeDetected')}</>}
                {linkKind === 'web' && <>{t('upl.webDetected')}</>}
                {!linkKind && <>{t('upl.linkHint')}</>}
              </p>
            </div>
          )}

          {/* Drop Zone */}
          {mode === 'file' && (!file ? (
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
              <p className="font-black dark:text-white text-sm">{t('upl.dropFile')}</p>
              <p className="text-[10px] text-slate-400 mt-1 uppercase tracking-widest">{t('upl.orClick')}</p>
              <p className="text-[9px] text-slate-300 dark:text-slate-600 mt-3">{t('upl.fileTypes')}</p>
            </div>
          ) : (
            <div className="flex items-center gap-4 p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl">
              <span className="text-2xl">{FILE_EMOJI[ext] ?? '📄'}</span>
              <div className="flex-grow min-w-0">
                <p className="font-black dark:text-white text-sm break-words">{file.name}</p>
                <p className="text-[10px] text-slate-400 uppercase tracking-widest">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
              </div>
              <button type="button" onClick={() => setFile(null)} className="text-slate-400 hover:text-rose-500 transition-colors font-black text-lg leading-none">×</button>
            </div>
          ))}

          {/* Metadata form */}
          <fieldset disabled={isUploading} className="space-y-4 disabled:opacity-60">
            <Field
              label={t('upl.titleOptional')}
              value={displayTitle}
              onChange={setDisplayTitle}
              placeholder={file ? file.name.replace(/\.[^/.]+$/, '') : mode === 'link' ? t('upl.titleLinkPlaceholder') : t('upl.titlePlaceholder')}
            />
            <div className="grid grid-cols-2 gap-4">
              <Field label={t('upl.moduleLabel')}   value={module}   onChange={setModule}   placeholder={t('upl.modulePlaceholder')} />
              <Field label={t('upl.semesterLabel')}        value={semester} onChange={setSemester} placeholder={t('upl.semesterPlaceholder')} />
            </div>
            <Field
              label={t('upl.tagsLabel')}
              value={tags}
              onChange={setTags}
              placeholder={t('upl.tagsPlaceholder')}
            />
            <div className="grid grid-cols-2 gap-4">
              <Field label={t('upl.categoryLabel')}       value={category} onChange={setCategory} placeholder={t('upl.categoryPlaceholder')} />
              <Field label={t('upl.examDateLabel')}  value={examDate} onChange={setExamDate} type="date" />
            </div>
            <Field label={t('upl.notesLabel')}  value={notes}    onChange={setNotes}    placeholder={t('upl.notesPlaceholder')} textarea />
            <button
              type="button"
              onClick={() => setIsAltklausur(v => !v)}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl border-2 transition-all text-left ${
                isAltklausur
                  ? 'border-rose-400 bg-rose-50 dark:bg-rose-950/20'
                  : 'border-slate-200 dark:border-slate-700 hover:border-rose-300'
              }`}
            >
              <div>
                <p className={`text-[11px] font-black ${isAltklausur ? 'text-rose-600 dark:text-rose-400' : 'dark:text-white'}`}>{t('upl.isOldExam')}</p>
                <p className="text-[9px] text-slate-400 mt-0.5">{t('upl.isOldExamHint')}</p>
              </div>
              <div className={`w-5 h-5 rounded flex items-center justify-center shrink-0 border-2 transition-all ${
                isAltklausur ? 'bg-rose-500 border-rose-500' : 'border-slate-300 dark:border-slate-600'
              }`}>
                {isAltklausur && (
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                    <polyline points="1.5,5 4,7.5 8.5,2.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                )}
              </div>
            </button>
          </fieldset>

          <button
            type="submit"
            disabled={isUploading || (mode === 'file' ? !file : mode === 'text' ? pastedText.trim().length < 20 : !linkKind)}
            className="w-full bg-indigo-600 py-4 rounded-2xl text-[11px] font-black uppercase tracking-widest shadow-lg hover:scale-[1.02] transition-all disabled:opacity-40 disabled:scale-100"
            style={{ color: 'var(--primary-text)' }}
          >
            {isUploading ? t('upl.saving') : mode === 'text' ? t('upl.saveNote') : mode === 'link' ? t('upl.linkImport') : t('upl.uploadSource')}
          </button>
        </form>
      </div>
    </div>
  );
};
