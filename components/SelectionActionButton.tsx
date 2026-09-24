import React, { useLayoutEffect, useRef, useState } from 'react';
import { EmojiImage } from './EmojiImage';
import { detectSelectionAction, type SelectionAction } from '../services/selectionAction';
import { useTranslation } from '../i18n/I18nProvider';
import type { TKey } from '../i18n';

/** Mindest-Freiraum über der Markierung, damit der Button dort noch passt —
 *  sonst rutscht er unter die Markierung (wie bei nativer macOS/iOS-Auswahl). */
const SELECTION_BUTTON_CLEARANCE = 46;
const MIN_SELECTION_CHARS = 8;
const MAX_SELECTION_CHARS = 600;

const SELECTION_ACTION_META: Record<SelectionAction, { emoji: string; labelKey: TKey }> = {
  term: { emoji: '💡', labelKey: 'rd.actionExplainTerm' },
  ask: { emoji: '🧠', labelKey: 'rd.actionAskTutor' },
  summarize: { emoji: '📝', labelKey: 'rd.actionSummarize' },
};

export interface ReaderSelection {
  text: string;
  /** Position relativ zur (nicht scrollenden) Reader-Fläche, in der der Button absolut sitzt. */
  x: number;
  y: number;
  action: SelectionAction;
  /** Über der Markierung, sonst darunter, wenn oben kein Platz ist. */
  placement: 'above' | 'below';
}

/** Liest die aktuelle Browser-Textauswahl aus — null, wenn zu kurz oder außerhalb von `area`. */
/** Auswahltext; mit joinLines werden getrennte Elemente (Zeilen-Spans der
 *  PDF-Textebene) mit Leerzeichen verbunden statt zusammengeklebt. */
const selectionText = (sel: Selection, joinLines: boolean): string => {
  if (!joinLines || sel.rangeCount === 0) return sel.toString();
  const frag = sel.getRangeAt(0).cloneContents();
  const parts = Array.from(frag.childNodes).map(n => n.textContent ?? '');
  return parts.length > 1 ? parts.join(' ') : sel.toString();
};

export function readSelection(area: HTMLElement | null, opts: { joinLines?: boolean } = {}): ReaderSelection | null {
  const sel = window.getSelection();
  const text = sel ? selectionText(sel, !!opts.joinLines).replace(/\s+/g, ' ').trim() : '';
  if (!area || !sel || sel.rangeCount === 0 || text.length < MIN_SELECTION_CHARS) return null;
  const range = sel.getRangeAt(0);
  if (!area.contains(range.commonAncestorContainer)) return null;
  const rect = range.getBoundingClientRect();
  const areaRect = area.getBoundingClientRect();
  const placement: ReaderSelection['placement'] = rect.top - areaRect.top >= SELECTION_BUTTON_CLEARANCE ? 'above' : 'below';
  return {
    text: text.slice(0, MAX_SELECTION_CHARS),
    action: detectSelectionAction(text),
    placement,
    x: Math.max(90, Math.min(rect.left - areaRect.left + rect.width / 2, areaRect.width - 90)),
    y: placement === 'above' ? rect.top - areaRect.top - 10 : rect.bottom - areaRect.top + 10,
  };
}

type Translate = (key: TKey, vars?: Record<string, string | number>) => string;

/** Formuliert aus der Markierung die Frage an den Tutor, passend zur erkannten Aktion. */
export function selectionQuestion(selection: ReaderSelection, t: Translate): string {
  if (selection.action === 'term') return t('rd.explainTermQuestion', { term: selection.text });
  if (selection.action === 'summarize') return t('rd.summarizeSelectionQuestion', { text: selection.text });
  return t('rd.selectionQuestion', { text: selection.text.slice(0, 300) });
}

/** Schwebende Aktions-Leiste an der Textauswahl, weicht wie die native Auswahl nach oben
 *  oder unten aus und verdeckt den markierten Text nie. */
export const SelectionActionButton: React.FC<{ selection: ReaderSelection; onClick: () => void; extra?: React.ReactNode }> = ({ selection, onClick, extra }) => {
  const { t } = useTranslation();
  const meta = SELECTION_ACTION_META[selection.action];
  // Verankerung über die Rahmen-Kante statt über transform: der Punkt (x, y) ist
  // die Unterkante (above) bzw. Oberkante (below) des Buttons, horizontal zentriert.
  const anchor: React.CSSProperties = selection.placement === 'above'
    ? { left: selection.x, bottom: `calc(100% - ${selection.y}px)` }
    : { left: selection.x, top: selection.y };
  // Mehrere Knöpfe sind breiter als die Klemmung in readSelection annimmt:
  // nach dem Rendern messen und so weit verschieben, dass die Leiste im
  // umgebenden Bereich bleibt (sonst ragt sie z. B. unter die Seitenleiste).
  const boxRef = useRef<HTMLDivElement>(null);
  const [shift, setShift] = useState(0);
  useLayoutEffect(() => {
    const box = boxRef.current;
    const area = box?.offsetParent as HTMLElement | null;
    if (!box || !area) return;
    const pad = 8;
    const half = box.offsetWidth / 2;
    const left = selection.x - half;
    const right = selection.x + half;
    const next = left < pad ? pad - left : right > area.clientWidth - pad ? area.clientWidth - pad - right : 0;
    setShift(next);
  }, [selection.x, selection.y, extra]);
  return (
    <div ref={boxRef} className="absolute z-20 flex items-center gap-1.5" style={{ ...anchor, transform: `translateX(calc(-50% + ${shift}px))` }}>
      {extra}
      <button
        onClick={onClick}
        className="flex items-center gap-1.5 px-3.5 py-2 rounded-full text-[13px] font-semibold shadow-lg transition-transform hover:scale-105 animate-in fade-in duration-150"
        style={{ background: 'var(--primary)', color: 'var(--primary-text)' }}
      >
        <EmojiImage emoji={meta.emoji} size={13} />
        {t(meta.labelKey)}
      </button>
    </div>
  );
};
