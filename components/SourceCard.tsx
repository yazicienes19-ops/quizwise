
import React from 'react';
import { ProcessedDocument } from '../types';
import type { SourceMeta } from '../services/libraryService';
import { SourceStatusBadge, DigestStatusBadge } from './SourceStatusBadge';
import { EmojiImage } from './EmojiImage';

const FILE_EMOJI: Record<string, string> = { pdf: '📕', docx: '📘', text: '📄' };

const IconTrash = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6"/>
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
  </svg>
);

interface Props {
  doc: ProcessedDocument;
  meta: SourceMeta;
  view: 'grid' | 'list';
  onOpen: () => void;
  onDelete: () => void;
}

const Stat: React.FC<{ label: string; value: number }> = ({ label, value }) => (
  <div className="text-center">
    <p className="font-black text-sm text-slate-900 dark:text-white">{value}</p>
    <p className="text-[8px] font-black uppercase text-slate-400 tracking-widest">{label}</p>
  </div>
);

const confirmDelete = (onDelete: () => void, title: string) => {
  if (window.confirm(`„${title}" löschen? Diese Aktion kann nicht rückgängig gemacht werden.`)) {
    onDelete();
  }
};

export const SourceCard: React.FC<Props> = ({ doc, meta, view, onOpen, onDelete }) => {
  const title = meta.displayTitle || doc.name.replace(/\.[^/.]+$/, '');
  const status = meta.status ?? 'ready';
  const emoji = FILE_EMOJI[doc.type] ?? '📄';
  const uploadedAt = new Date(doc.uploadDate).toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: 'numeric' });
  const lastOpened = meta.lastOpenedAt
    ? new Date(meta.lastOpenedAt).toLocaleDateString('de-DE', { day: '2-digit', month: 'short' })
    : null;
  const hasStats = !!(meta.quizCount || meta.flashcardCount || meta.topicCount);

  /* ── LIST VIEW ── */
  if (view === 'list') {
    return (
      <div
        className="flex items-center gap-4 px-5 py-4 rounded-[14px] transition-colors group"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
      >
        <EmojiImage emoji={emoji} size={28} />
        <div className="flex-grow min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="font-bold text-sm truncate text-slate-900 dark:text-white">{title}</h4>
            <SourceStatusBadge status={status} />
            {doc.digestStatus && <DigestStatusBadge status={doc.digestStatus} />}
          </div>
          <div className="flex items-center gap-3 mt-0.5 flex-wrap">
            {meta.module && (
              <span className="text-[9px] font-black uppercase" style={{ color: 'var(--accent)' }}>
                {meta.module}
              </span>
            )}
            {meta.semester && (
              <span className="text-[9px] font-black uppercase text-slate-400">{meta.semester}</span>
            )}
            <span className="text-[9px] text-slate-300 dark:text-slate-600">
              {lastOpened ? `Zuletzt: ${lastOpened}` : `Hochgeladen ${uploadedAt}`}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {meta.quizCount      ? <span className="text-[9px] font-bold text-slate-400 hidden sm:block">{meta.quizCount} Quiz</span>   : null}
          {meta.flashcardCount ? <span className="text-[9px] font-bold text-slate-400 hidden sm:block">{meta.flashcardCount} Karten</span> : null}
          <button
            onClick={onOpen}
            className="text-white rounded-[11px] text-[9px] font-black uppercase tracking-widest transition-transform hover:scale-[1.03] active:scale-[0.97]"
            style={{ background: 'var(--accent)', padding: '8px 14px' }}
          >
            Öffnen
          </button>
          <button
            onClick={() => confirmDelete(onDelete, title)}
            className="p-2 text-slate-300 hover:text-rose-500 transition-colors"
          >
            <IconTrash />
          </button>
        </div>
      </div>
    );
  }

  /* ── GRID VIEW ── */
  return (
    <div
      className="rounded-[18px] p-5 flex flex-col group transition-colors"
      style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
    >
      {/* Top row: tags + delete */}
      <div className="flex justify-between items-start mb-4">
        <div className="flex gap-1 flex-wrap flex-grow min-w-0 mr-2">
          {meta.tags?.slice(0, 3).map(t => (
            <span
              key={t}
              className="text-[8px] font-black px-2 py-0.5 rounded-full uppercase tracking-tight"
              style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}
            >
              {t}
            </span>
          ))}
        </div>
        <button
          onClick={() => confirmDelete(onDelete, title)}
          className="p-1.5 text-slate-300 hover:text-rose-500 transition-colors shrink-0 opacity-40 sm:opacity-0 sm:group-hover:opacity-100"
          title="Löschen"
        >
          <IconTrash />
        </button>
      </div>

      {/* Emoji */}
      <div className="mb-3">
        <EmojiImage emoji={emoji} size={32} />
      </div>

      {/* Content */}
      <div className="flex-grow space-y-1.5">
        <h3 className="font-bold leading-snug line-clamp-2 text-[15px] text-slate-900 dark:text-white">
          {title}
        </h3>
        <div className="flex flex-wrap gap-x-3 gap-y-0.5">
          {meta.module && (
            <span className="text-[9px] font-black uppercase" style={{ color: 'var(--accent)' }}>
              {meta.module}
            </span>
          )}
          {meta.semester && (
            <span className="text-[9px] font-black uppercase text-slate-400">{meta.semester}</span>
          )}
        </div>
        <div className="pt-0.5 flex items-center gap-1.5 flex-wrap">
          <SourceStatusBadge status={status} />
          {doc.digestStatus && <DigestStatusBadge status={doc.digestStatus} />}
        </div>
      </div>

      {/* Stats */}
      {hasStats && (
        <div className="flex gap-5 py-3 mt-3" style={{ borderTop: '1px solid var(--border)' }}>
          {meta.quizCount      ? <Stat label="Quiz"   value={meta.quizCount} />      : null}
          {meta.flashcardCount ? <Stat label="Karten" value={meta.flashcardCount} /> : null}
          {meta.topicCount     ? <Stat label="Themen" value={meta.topicCount} />     : null}
        </div>
      )}

      {/* Footer */}
      <div className="mt-4 space-y-2">
        <div className="flex justify-between items-center">
          <p className="text-[9px] text-slate-400">
            {lastOpened ? `Zuletzt: ${lastOpened}` : `Hochgeladen ${uploadedAt}`}
          </p>
          <span className="text-[8px] font-black uppercase text-slate-300 dark:text-slate-600">
            {doc.type.toUpperCase()}
          </span>
        </div>
        <button
          onClick={onOpen}
          className="w-full rounded-[12px] text-[10px] font-black uppercase tracking-widest text-white transition-opacity hover:opacity-90 active:scale-[0.98]"
          style={{ background: 'var(--accent)', padding: '11px' }}
        >
          Öffnen →
        </button>
      </div>
    </div>
  );
};
