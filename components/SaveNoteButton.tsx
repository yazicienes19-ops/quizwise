import React, { useEffect, useRef, useState } from 'react';
import { NotebookPen, Check } from 'lucide-react';
import type { Collection } from '../types';
import { useTranslation } from '../i18n/I18nProvider';
import { toast } from '../services/toast';
import { saveStudioItem, newStudioId } from '../services/studioStore';
import { buildAnswerNote, cachedCollections, resolveNoteCollection, type AnswerNoteInput } from '../services/studioNotes';

interface Props {
  note: AnswerNoteInput;
  /** Fach der Quelle; fehlt es, gilt das aktive Fach, sonst fragt der Knopf nach. */
  collectionId?: string | null;
  collections?: Collection[];
  userId?: string | null;
  /** 'icon': kleiner Knopf in einer Aktionsleiste (Tutor), 'text': Knopf mit Beschriftung (Reader). */
  variant?: 'icon' | 'text';
}

/** Antwort als Notiz ins Lernstudio des Fachs speichern (services/studioNotes.ts). */
export const SaveNoteButton: React.FC<Props> = ({ note, collectionId, collections, userId, variant = 'icon' }) => {
  const { t } = useTranslation();
  const [saved, setSaved] = useState(false);
  const [picking, setPicking] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const cols = collections?.length ? collections : cachedCollections();

  useEffect(() => {
    if (!picking) return;
    const close = (e: MouseEvent) => { if (!wrapRef.current?.contains(e.target as Node)) setPicking(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [picking]);

  const saveTo = async (col: Collection) => {
    setPicking(false);
    const { title, markdown, sources } = buildAnswerNote(note);
    const now = Date.now();
    try {
      await saveStudioItem(userId ?? undefined, {
        id: newStudioId(), collectionId: col.id, kind: 'note', title, markdown, sources, createdAt: now, updatedAt: now,
      });
      setSaved(true);
      toast.success(t('stu.note.savedIn', { name: col.name }));
    } catch {
      toast.error(t('stu.saveFailed'));
    }
  };

  const onClick = () => {
    if (saved) return;
    const col = resolveNoteCollection(collectionId, cols);
    if (col) { void saveTo(col); return; }
    if (!cols.length) { toast.info(t('stu.note.noSubject')); return; }
    setPicking(p => !p);
  };

  const label = saved ? t('stu.note.saved') : t('stu.note.save');
  const Icon = saved ? Check : NotebookPen;

  return (
    <span ref={wrapRef} className="relative inline-flex">
      {variant === 'icon' ? (
        <button
          onClick={onClick}
          aria-label={label}
          title={label}
          className="p-1.5 rounded-lg transition-colors text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          style={saved ? { color: 'var(--primary)' } : undefined}
        >
          <Icon size={13} strokeWidth={1.75} />
        </button>
      ) : (
        <button
          onClick={onClick}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[12.5px] font-semibold transition-all hover:opacity-80"
          style={saved
            ? { background: 'var(--primary-soft)', color: 'var(--primary-ink)' }
            : { border: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}
        >
          <Icon size={13} strokeWidth={2} /> {label}
        </button>
      )}
      {picking && (
        <div
          role="menu"
          className="absolute left-0 bottom-full mb-1.5 z-30 w-60 max-h-64 overflow-y-auto rounded-2xl p-1.5 shadow-3d-deep"
          style={{ background: 'var(--card)', border: '1px solid var(--border-color)' }}
        >
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] px-2.5 py-1.5" style={{ color: 'var(--text-secondary)' }}>{t('stu.note.pickSubject')}</p>
          {cols.map(c => (
            <button
              key={c.id}
              role="menuitem"
              onClick={() => void saveTo(c)}
              className="w-full text-left px-2.5 py-2 rounded-xl text-[13px] font-semibold break-words transition-colors hover:bg-[var(--bg-main)]"
              style={{ color: 'var(--text-main)' }}
            >
              {c.emoji} {c.name}
            </button>
          ))}
        </div>
      )}
    </span>
  );
};
