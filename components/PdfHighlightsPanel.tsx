import React, { useEffect, useState } from 'react';
import { Highlighter, Trash2 } from 'lucide-react';
import { useTranslation } from '../i18n/I18nProvider';
import { HIGHLIGHT_COLORS, HIGHLIGHT_HEX, type HighlightColor, type UserHighlight } from '../services/userHighlights';

interface Props {
  open: boolean;
  highlights: UserHighlight[];
  currentPage: number;
  onClose: () => void;
  onJump: (page: number) => void;
  onNote: (id: string, note: string) => void;
  onColor: (id: string, color: HighlightColor) => void;
  onDelete: (id: string) => void;
}

/** Notizfeld mit eigenem Entwurf, gespeichert beim Verlassen (nicht pro Tastendruck). */
const NoteField: React.FC<{ value: string; onSave: (v: string) => void; label: string; placeholder: string }> = ({ value, onSave, label, placeholder }) => {
  const [draft, setDraft] = useState(value);
  useEffect(() => { setDraft(value); }, [value]);
  return (
    <textarea
      value={draft}
      onChange={e => setDraft(e.target.value)}
      onBlur={() => { if (draft.trim() !== value.trim()) onSave(draft.trim()); }}
      aria-label={label}
      placeholder={placeholder}
      rows={draft ? 2 : 1}
      className="w-full resize-none rounded-lg px-2.5 py-1.5 text-[13px] leading-snug outline-none"
      style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border-color)', color: 'var(--text-main)' }}
    />
  );
};

/**
 * Seitenleiste mit den eigenen Markierungen eines PDFs (services/userHighlights.ts).
 * Legt sich wie das Inhaltsverzeichnis nur über die PDF-Spalte, von rechts.
 */
export const PdfHighlightsPanel: React.FC<Props> = ({ open, highlights, currentPage, onClose, onJump, onNote, onColor, onDelete }) => {
  const { t, tp } = useTranslation();
  return (
    <>
      <div
        onClick={onClose}
        className="absolute inset-0 rounded-[20px] transition-opacity duration-200 z-10"
        style={{ background: 'rgba(15,17,23,0.36)', opacity: open ? 1 : 0, pointerEvents: open ? 'auto' : 'none' }}
      />
      <aside
        aria-hidden={!open}
        aria-label={t('hl.title')}
        className="absolute inset-y-0 right-0 w-[320px] max-w-[88%] rounded-r-[20px] flex flex-col z-20 shadow-2xl transition-transform duration-200"
        style={{ background: 'var(--bg-main)', borderLeft: '1px solid var(--border-color)', transform: open ? 'translateX(0)' : 'translateX(100%)', visibility: open ? 'visible' : 'hidden' }}
      >
        <div className="shrink-0 px-5 py-4 flex items-center gap-2" style={{ borderBottom: '1px solid var(--border-color)' }}>
          <Highlighter className="w-4 h-4" style={{ color: 'var(--primary-ink)' }} aria-hidden="true" />
          <span className="text-[13px] font-semibold" style={{ color: 'var(--text-main)' }}>{t('hl.title')}</span>
          <span className="text-[12px] ml-auto" style={{ color: 'var(--text-secondary)' }}>{tp('hl.count', highlights.length)}</span>
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2.5">
          {highlights.length === 0 && (
            <p className="px-2 py-3 text-[13px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{t('hl.empty')}</p>
          )}
          {highlights.map(h => (
            <div
              key={h.id}
              className="rounded-xl p-3 space-y-2"
              style={{ background: 'var(--bg-sidebar)', border: `1px solid ${h.page === currentPage ? 'color-mix(in srgb, var(--primary) 45%, transparent)' : 'var(--border-color)'}` }}
            >
              <button onClick={() => onJump(h.page)} className="w-full text-left flex gap-2.5 group">
                <span className="w-1 self-stretch rounded-full shrink-0" style={{ background: HIGHLIGHT_HEX[h.color] }} aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-semibold mb-0.5" style={{ color: 'var(--text-secondary)' }}>{t('hl.page', { n: h.page })}</span>
                  <span className="block text-[13.5px] leading-snug line-clamp-3 group-hover:underline" style={{ color: 'var(--text-main)' }}>{h.quote ? `„${h.quote}“` : t('hl.pinLabel', { n: h.page })}</span>
                </span>
              </button>
              <NoteField value={h.note ?? ''} onSave={v => onNote(h.id, v)} label={t('hl.note')} placeholder={t('hl.notePlaceholder')} />
              <div className="flex items-center gap-1.5">
                {HIGHLIGHT_COLORS.map(c => (
                  <button
                    key={c}
                    onClick={() => onColor(h.id, c)}
                    aria-label={t(`hl.color.${c}` as const)}
                    aria-pressed={h.color === c}
                    className="w-5 h-5 rounded-full transition-transform hover:scale-110"
                    style={{ background: HIGHLIGHT_HEX[c], boxShadow: h.color === c ? '0 0 0 2px var(--bg-sidebar), 0 0 0 3.5px var(--text-main)' : undefined }}
                  />
                ))}
                <button
                  onClick={() => onDelete(h.id)}
                  aria-label={t('hl.delete')}
                  title={t('hl.delete')}
                  className="ml-auto w-7 h-7 rounded-lg flex items-center justify-center transition-colors hover:text-rose-500"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </aside>
    </>
  );
};
