import React from 'react';
import { ProcessedDocument } from '../types';
import type { SourceMeta } from '../services/libraryService';
import { SourceStatusBadge, DigestStatusBadge } from './SourceStatusBadge';
import { EmojiImage } from './EmojiImage';

const FILE_EMOJI: Record<string, string> = { pdf: '📕', docx: '📘', text: '📄' };

const IconTrash = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
  </svg>
);

const IconEye = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
  </svg>
);

interface Props {
  doc: ProcessedDocument;
  meta: SourceMeta;
  view: 'grid' | 'list';
  onOpen: () => void;
  onView: () => void;
  onDelete: () => void;
  onEdit: () => void;
  /** Stößt die Dokument-Analyse erneut an (nur bei Status 'error' sichtbar). */
  onRetryAnalysis?: () => void;
}

/** Digest-Badge + Retry: PDFs/Bilder ohne Status gelten als „wird analysiert" (Nachhol-Lauf läuft). */
const DigestInfo: React.FC<{ doc: ProcessedDocument; onRetry?: () => void }> = ({ doc, onRetry }) => {
  const status = doc.digestStatus ?? ((doc.type === 'pdf' || doc.type === 'image') ? 'pending' : undefined);
  if (!status) return null;
  return (
    <>
      <DigestStatusBadge status={status} />
      {status === 'error' && onRetry && (
        <button
          onClick={e => { e.stopPropagation(); onRetry(); }}
          className="text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full transition-all hover:opacity-80"
          style={{ background: 'color-mix(in srgb, var(--primary) 12%, transparent)', color: 'var(--primary)', border: '1px solid color-mix(in srgb, var(--primary) 30%, transparent)' }}
        >
          Erneut versuchen
        </button>
      )}
    </>
  );
};

const Stat: React.FC<{ label: string; value: number }> = ({ label, value }) => (
  <div className="text-center">
    <p className="font-black text-sm" style={{ color: 'var(--text-main)' }}>{value}</p>
    <p className="text-[8px] font-black uppercase text-slate-400 tracking-widest">{label}</p>
  </div>
);

const confirmDelete = (onDelete: () => void, title: string) => {
  if (window.confirm(`„${title}" löschen? Diese Aktion kann nicht rückgängig gemacht werden.`)) {
    onDelete();
  }
};

const IconEdit = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
  </svg>
);

export const SourceCard: React.FC<Props> = ({ doc, meta, view, onOpen, onView, onDelete, onEdit, onRetryAnalysis }) => {
  const title = meta.displayTitle || doc.name.replace(/\.[^/.]+$/, '');
  const status = meta.status ?? 'ready';
  const emoji = FILE_EMOJI[doc.type] ?? '📄';
  const uploadedAt = new Date(doc.uploadDate).toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: 'numeric' });
  const lastOpened = meta.lastOpenedAt
    ? new Date(meta.lastOpenedAt).toLocaleDateString('de-DE', { day: '2-digit', month: 'short' })
    : null;
  const hasStats = !!(meta.quizCount || meta.flashcardCount || meta.topicCount);

  if (view === 'list') {
    return (
      <div className="flex items-center gap-4 px-5 py-4 rounded-2xl hover:shadow-3d-raised transition-all group" style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border-color)' }}>
        <EmojiImage emoji={emoji} size={28} />
        <div className="flex-grow min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="font-black text-sm break-words" style={{ color: 'var(--text-main)' }}>{title}</h4>
            <SourceStatusBadge status={status} />
            <DigestInfo doc={doc} onRetry={onRetryAnalysis} />
          </div>
          <div className="flex items-center gap-3 mt-0.5 flex-wrap">
            {meta.module   && <span className="text-[9px] font-black uppercase text-indigo-600">{meta.module}</span>}
            {meta.semester && <span className="text-[9px] font-black uppercase text-slate-400">{meta.semester}</span>}
            <span className="text-[9px] text-slate-300 dark:text-slate-600">
              {lastOpened ? `Zuletzt: ${lastOpened}` : `Hochgeladen ${uploadedAt}`}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {meta.quizCount      ? <span className="text-[9px] font-bold text-slate-400 hidden sm:block">{meta.quizCount} Quiz</span> : null}
          {meta.flashcardCount ? <span className="text-[9px] font-bold text-slate-400 hidden sm:block">{meta.flashcardCount} Karten</span> : null}
          {meta.isAltklausur && <span className="hidden sm:block text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-rose-50 dark:bg-rose-950/20 text-rose-500">Altklausur</span>}
          <button
            onClick={onOpen}
            className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-[9px] font-black uppercase tracking-widest hover:scale-105 transition-all"
            style={{ color: 'var(--primary-text)' }}
          >
            Öffnen
          </button>
          <button onClick={onView} className="p-2 text-slate-300 hover:text-indigo-500 transition-colors" title="Dokument ansehen">
            <IconEye />
          </button>
          <button onClick={onEdit} className="p-2 text-slate-300 hover:text-indigo-500 transition-colors" title="Bearbeiten">
            <IconEdit />
          </button>
          <button onClick={() => confirmDelete(onDelete, title)} className="p-2 text-slate-300 hover:text-rose-500 transition-colors">
            <IconTrash />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-[28px] p-6 shadow-3d-raised hover:shadow-3d-deep transition-all flex flex-col group" style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border-color)' }}>
      <div className="flex justify-between items-start mb-4">
        <div className="flex gap-1 flex-wrap flex-grow min-w-0 mr-2">
          {meta.isAltklausur && (
            <span className="text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-rose-50 dark:bg-rose-950/20 text-rose-500">Altklausur</span>
          )}
          {meta.tags?.slice(0, 2).map(t => (
            <span key={t} className="bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 text-[8px] font-black px-2 py-0.5 rounded-full uppercase tracking-tight">
              {t}
            </span>
          ))}
        </div>
        <div className="flex gap-1 shrink-0 opacity-40 sm:opacity-0 sm:group-hover:opacity-100">
          <button onClick={onView} className="p-2 text-slate-300 hover:text-indigo-500 transition-colors" title="Dokument ansehen">
            <IconEye />
          </button>
          <button onClick={onEdit} className="p-2 text-slate-300 hover:text-indigo-500 transition-colors" title="Bearbeiten">
            <IconEdit />
          </button>
          <button onClick={() => confirmDelete(onDelete, title)} className="p-2 text-slate-300 hover:text-rose-500 transition-colors" title="Löschen">
            <IconTrash />
          </button>
        </div>
      </div>
      <div className="mb-4">
        <EmojiImage emoji={emoji} size={36} />
      </div>

      <div className="flex-grow space-y-2">
        <h3 className="font-black leading-snug break-words text-base" style={{ color: 'var(--text-main)' }}>{title}</h3>
        <div className="flex flex-wrap gap-x-3 gap-y-0.5">
          {meta.module   && <span className="text-[9px] font-black uppercase text-indigo-600">{meta.module}</span>}
          {meta.semester && <span className="text-[9px] font-black uppercase text-slate-400">{meta.semester}</span>}
        </div>
        <div className="pt-1 flex items-center gap-1.5 flex-wrap">
          <SourceStatusBadge status={status} />
          <DigestInfo doc={doc} onRetry={onRetryAnalysis} />
        </div>
      </div>

      {hasStats && (
        <div className="flex gap-6 py-3 mt-3" style={{ borderTop: '1px solid var(--border-color)' }}>
          {meta.quizCount      ? <Stat label="Quiz"   value={meta.quizCount} /> : null}
          {meta.flashcardCount ? <Stat label="Karten" value={meta.flashcardCount} /> : null}
          {meta.topicCount     ? <Stat label="Themen" value={meta.topicCount} /> : null}
        </div>
      )}

      <div className="mt-4 space-y-2">
        <div className="flex justify-between items-center">
          <p className="text-[9px] text-slate-400">
            {lastOpened ? `Zuletzt: ${lastOpened}` : `Hochgeladen ${uploadedAt}`}
          </p>
          <span className="text-[8px] font-black uppercase text-slate-300 dark:text-slate-600">{doc.type.toUpperCase()}</span>
        </div>
        <button
          onClick={onOpen}
          className="w-full bg-indigo-600 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:scale-[1.02] active:scale-95 transition-all shadow-md"
          style={{ color: 'var(--primary-text)' }}
        >
          Öffnen →
        </button>
      </div>
    </div>
  );
};
