import React from 'react';
import type { PdfTocEntry } from '../services/pdfOutlineService';

interface TocListProps {
  entries: PdfTocEntry[];
  depth: number;
  expanded: Set<string>;
  activePage: number | null;
  onToggle: (e: PdfTocEntry) => void;
  onJump: (e: PdfTocEntry) => void;
  tocKey: (e: PdfTocEntry) => string;
  /** false unterdrückt das "S. X"-Label — sinnvoll wenn `page` gar keine echte
   *  Seitenzahl ist (z.B. ein Kapitel-Index bei Text/DOCX ohne Seitenkonzept). */
  showPageLabel?: boolean;
  /** Optional: zeigt ein "✓" hinter Blatt-Einträgen, deren Seite/Kapitel als
   *  gelesen markiert wurde (Text/DOCX-Reader hat diesen Zustand, PDF-Reader nicht). */
  isDone?: (page: number) => boolean;
}

/**
 * Rekursive Darstellung eines Dokument-Inhaltsverzeichnisses — von beiden
 * Split-Screen-Readern geteilt (PDF: services/pdfOutlineService.ts erkennt
 * Überschriften aus Schriftgröße/Textmenge; Text/DOCX: chapterService.ts
 * erkennt sie direkt aus Markdown-/Nummerierungsmustern im Text, beide laufen
 * durch buildTocTree()). Einträge MIT Unterpunkten klappen nur auf/zu (keine
 * eigene navigierbare Seite, sondern eine Gruppierung); Einträge OHNE
 * Unterpunkte springen direkt zur Seite/zum Kapitel.
 */
export const TocList: React.FC<TocListProps> = ({ entries, depth, expanded, activePage, onToggle, onJump, tocKey, showPageLabel = true, isDone }) => (
  <ul className="space-y-[1px]">
    {entries.map(entry => {
      const key = tocKey(entry);
      const hasChildren = entry.children.length > 0;
      const isOpen = expanded.has(key);
      const isActive = entry.page === activePage;
      return (
        <li key={key}>
          <button
            onClick={() => (hasChildren ? onToggle(entry) : onJump(entry))}
            className={`w-full flex items-center gap-2 text-left py-2.5 pr-3 rounded-lg text-[12.5px] leading-snug transition-colors ${isActive ? '' : 'hover:bg-black/[0.04] dark:hover:bg-white/[0.06]'}`}
            style={{
              paddingLeft: `${12 + depth * 16}px`,
              background: isActive ? 'color-mix(in srgb, var(--primary) 12%, transparent)' : 'transparent',
              color: isActive ? 'var(--primary)' : 'var(--text-main)',
              fontWeight: hasChildren && depth === 0 ? 700 : isActive ? 600 : 500,
              opacity: hasChildren || isActive ? 1 : 0.85,
            }}
          >
            {hasChildren ? (
              <svg
                width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"
                className="shrink-0 opacity-50"
                style={{ transform: isOpen ? 'rotate(90deg)' : undefined, transition: 'transform .15s' }}
              >
                <path d="M9 6l6 6-6 6" />
              </svg>
            ) : (
              <span className="shrink-0 w-[11px]" />
            )}
            <span className="truncate flex-1">{entry.title}</span>
            {!hasChildren && isDone?.(entry.page) && <span className="shrink-0 text-[10px]">✓</span>}
            {!hasChildren && showPageLabel && <span className="shrink-0 text-[10.5px] tabular-nums opacity-50">S. {entry.page}</span>}
          </button>
          {hasChildren && isOpen && (
            <TocList entries={entry.children} depth={depth + 1} expanded={expanded} activePage={activePage} onToggle={onToggle} onJump={onJump} tocKey={tocKey} showPageLabel={showPageLabel} isDone={isDone} />
          )}
        </li>
      );
    })}
  </ul>
);
