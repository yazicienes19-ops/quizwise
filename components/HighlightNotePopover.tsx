import React, { useEffect, useRef, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { useTranslation } from '../i18n/I18nProvider';
import { HIGHLIGHT_COLORS, HIGHLIGHT_HEX, type HighlightColor, type UserHighlight } from '../services/userHighlights';

export const NOTE_POPOVER_WIDTH = 272;
/** Ungefähre Höhe, reicht für die Entscheidung oben oder unten. */
export const NOTE_POPOVER_HEIGHT = 190;

interface Props {
  highlight: UserHighlight;
  /** Position auf der PDF-Seite (CSS-Pixel, relativ zur Seite). */
  x: number;
  y: number;
  onSave: (note: string) => void;
  onColor: (color: HighlightColor) => void;
  onDelete: () => void;
  onClose: () => void;
}

/**
 * Kleine Notiz-Blase direkt an einer eigenen Markierung im PDF: lesen,
 * schreiben, Farbe wechseln, löschen. Speichert beim Schließen (Fertig,
 * Escape, Klick daneben), nicht pro Tastendruck.
 */
export const HighlightNotePopover: React.FC<Props> = ({ highlight, x, y, onSave, onColor, onDelete, onClose }) => {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(highlight.note ?? '');
  const boxRef = useRef<HTMLDivElement>(null);
  const draftRef = useRef(draft);
  draftRef.current = draft;

  const close = () => {
    const next = draftRef.current.trim();
    if (next !== (highlight.note ?? '').trim()) onSave(next);
    onClose();
  };
  const closeRef = useRef(close);
  closeRef.current = close;

  useEffect(() => {
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) closeRef.current();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); closeRef.current(); } };
    // Erst nach dem öffnenden Klick lauschen, sonst schließt er die Blase sofort wieder.
    const id = window.setTimeout(() => {
      document.addEventListener('mousedown', onDown);
      document.addEventListener('touchstart', onDown);
    }, 0);
    document.addEventListener('keydown', onKey, true);
    return () => {
      window.clearTimeout(id);
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
      document.removeEventListener('keydown', onKey, true);
    };
  }, []);

  return (
    <div
      ref={boxRef}
      role="dialog"
      aria-label={t('hl.note')}
      className="absolute z-30 rounded-2xl shadow-3d-deep p-3 space-y-2.5 animate-in fade-in zoom-in-95 duration-150"
      style={{ left: x, top: y, width: NOTE_POPOVER_WIDTH, background: 'var(--bg-sidebar)', border: '1px solid var(--border-color)' }}
      onMouseUp={e => e.stopPropagation()}
    >
      <div className="flex gap-2">
        <span className="w-1 self-stretch rounded-full shrink-0" style={{ background: HIGHLIGHT_HEX[highlight.color] }} aria-hidden="true" />
        <p className="text-[12.5px] leading-snug line-clamp-2" style={{ color: 'var(--text-secondary)' }}>{highlight.quote ? `„${highlight.quote}“` : t('hl.pinLabel', { n: highlight.page })}</p>
      </div>
      <textarea
        autoFocus
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') close(); }}
        placeholder={t('hl.notePlaceholder')}
        aria-label={t('hl.note')}
        rows={3}
        className="w-full resize-none rounded-lg px-2.5 py-2 text-[13.5px] leading-snug outline-none"
        style={{ background: 'var(--bg-main)', border: '1px solid var(--border-color)', color: 'var(--text-main)' }}
      />
      <div className="flex items-center gap-1.5">
        {HIGHLIGHT_COLORS.map(c => (
          <button
            key={c}
            onClick={() => onColor(c)}
            aria-label={t(`hl.color.${c}` as const)}
            aria-pressed={highlight.color === c}
            className="w-5 h-5 rounded-full transition-transform hover:scale-110"
            style={{ background: HIGHLIGHT_HEX[c], boxShadow: highlight.color === c ? '0 0 0 2px var(--bg-sidebar), 0 0 0 3.5px var(--text-main)' : undefined }}
          />
        ))}
        <button
          onClick={onDelete}
          aria-label={t('hl.delete')}
          title={t('hl.delete')}
          className="ml-1 w-7 h-7 rounded-lg flex items-center justify-center transition-colors hover:text-rose-500"
          style={{ color: 'var(--text-secondary)' }}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={close}
          className="ml-auto px-3 py-1.5 rounded-lg text-[12.5px] font-semibold transition-opacity hover:opacity-90"
          style={{ background: 'var(--primary)', color: 'var(--primary-text)' }}
        >
          {t('hl.done')}
        </button>
      </div>
    </div>
  );
};
