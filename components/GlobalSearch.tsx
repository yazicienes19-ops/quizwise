import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Search, FileText, Layers, Folder, CornerDownLeft, LayoutGrid, StickyNote } from 'lucide-react';
import { useTranslation } from '../i18n/I18nProvider';
import { useModalA11y } from '../hooks/useModalA11y';
import { searchAll, MIN_QUERY, type SearchResult } from '../services/globalSearch';
import { NAV_GROUPS, LABOR_GROUP } from './navConfig';
import type { Collection, FlashcardDeck, ProcessedDocument } from '../types';

export const OPEN_SEARCH_EVENT = 'studearc:open-search';
export const SEARCH_SELECT_EVENT = 'studearc:search-select';

/** Öffnet die Suche von überall (Knopf in der Seitenleiste, Handy-Kopfzeile). */
export const openGlobalSearch = () => window.dispatchEvent(new CustomEvent(OPEN_SEARCH_EVENT));

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
export const SEARCH_SHORTCUT = isMac ? '⌘K' : 'Strg+K';

const ICONS: Record<SearchResult['kind'], React.FC<{ className?: string }>> = {
  page: LayoutGrid, collection: Folder, document: FileText, deck: Layers, card: StickyNote,
};

/** Suchbegriffe im Text hervorheben (Groß/Klein egal). */
const highlight = (text: string, query: string): React.ReactNode => {
  const terms = query.trim().split(/\s+/).filter(t => t.length >= 2).map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (!terms.length) return text;
  const parts = text.split(new RegExp(`(${terms.join('|')})`, 'gi'));
  return parts.map((p, i) => (i % 2 === 1
    ? <mark key={i} className="rounded-[3px] px-0.5" style={{ background: 'color-mix(in srgb, var(--primary) 30%, transparent)', color: 'inherit' }}>{p}</mark>
    : p));
};

interface Props {
  documents: ProcessedDocument[];
  decks: FlashcardDeck[];
  collections: Collection[];
  isAdminUser: boolean;
}

/**
 * Globale Suche (⌘K / Strg+K). Wählt man einen Treffer, geht ein
 * SEARCH_SELECT_EVENT an AppContent, das die passende Ansicht öffnet.
 */
export const GlobalSearch: React.FC<Props> = ({ documents, decks, collections, isAdminUser }) => {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setOpen(o => !o); }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener('keydown', onKey);
    window.addEventListener(OPEN_SEARCH_EVENT, onOpen);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener(OPEN_SEARCH_EVENT, onOpen); };
  }, []);

  if (!open) return null;
  return <SearchDialog documents={documents} decks={decks} collections={collections} isAdminUser={isAdminUser} onClose={() => setOpen(false)} />;
};

const SearchDialog: React.FC<Props & { onClose: () => void }> = ({ documents, decks, collections, isAdminUser, onClose }) => {
  const { t, tp } = useTranslation();
  const { titleId, dialogProps } = useModalA11y(onClose);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);

  const pages = useMemo(() => {
    const groups = isAdminUser ? [...NAV_GROUPS, LABOR_GROUP] : NAV_GROUPS;
    return groups.flatMap(g => g.items).map(i => ({ tab: i.tab, title: t(i.labelKey) }));
  }, [isAdminUser, t]);

  const results = useMemo(() => searchAll(query, {
    documents, decks, collections, pages,
    labels: { cardsN: n => tp('gs.cardsN', n), docsN: n => tp('gs.docsN', n), noSubject: t('gs.noSubject') },
  }), [query, documents, decks, collections, pages, t, tp]);

  useEffect(() => { setActive(0); }, [query]);
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const choose = (r: SearchResult) => {
    window.dispatchEvent(new CustomEvent(SEARCH_SELECT_EVENT, { detail: { result: r, query } }));
    onClose();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(results.length - 1, a + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(0, a - 1)); }
    else if (e.key === 'Enter' && results[active]) { e.preventDefault(); choose(results[active]); }
  };

  const groupLabel: Record<SearchResult['kind'], string> = {
    page: t('gs.group.page'), collection: t('gs.group.collection'), document: t('gs.group.document'),
    deck: t('gs.group.deck'), card: t('gs.group.card'),
  };

  return createPortal(
    <div className="fixed inset-0 bg-black/50 z-[80] flex items-start justify-center px-4 pt-[10vh] animate-in fade-in duration-150" onClick={onClose}>
      <div
        {...dialogProps}
        className="w-full max-w-xl rounded-[20px] shadow-3d-deep overflow-hidden flex flex-col max-h-[75vh]"
        style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border-color)' }}
        onClick={e => e.stopPropagation()}
      >
        <h2 id={titleId} className="sr-only">{t('gs.title')}</h2>
        <div className="flex items-center gap-3 px-5 py-4" style={{ borderBottom: '1px solid var(--border-color)' }}>
          <Search className="w-5 h-5 shrink-0" style={{ color: 'var(--text-secondary)' }} aria-hidden="true" />
          <input
            autoFocus
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={t('gs.placeholder')}
            aria-label={t('gs.title')}
            role="combobox"
            aria-expanded={results.length > 0}
            aria-controls="global-search-list"
            aria-activedescendant={results[active] ? `gs-opt-${active}` : undefined}
            className="focus-ring-none flex-1 bg-transparent outline-none text-[16px]"
            style={{ color: 'var(--text-main)' }}
          />
          <kbd className="hidden sm:inline text-[11px] font-semibold px-1.5 py-0.5 rounded-md" style={{ color: 'var(--text-secondary)', border: '1px solid var(--border-color)' }}>Esc</kbd>
        </div>

        <div className="overflow-y-auto">
          {query.trim().length < MIN_QUERY ? (
            <p className="px-5 py-6 text-[13px]" style={{ color: 'var(--text-secondary)' }}>{t('gs.hint')}</p>
          ) : results.length === 0 ? (
            <p className="px-5 py-6 text-[13px]" style={{ color: 'var(--text-secondary)' }}>{t('gs.empty', { q: query.trim() })}</p>
          ) : (
            <ul id="global-search-list" role="listbox" ref={listRef} className="py-2">
              {results.map((r, i) => {
                const Icon = ICONS[r.kind];
                const showGroup = i === 0 || results[i - 1].kind !== r.kind;
                const isActive = i === active;
                return (
                  <React.Fragment key={`${r.kind}-${r.id}`}>
                    {showGroup && (
                      <li role="presentation" className="px-5 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: 'var(--text-secondary)' }}>
                        {groupLabel[r.kind]}
                      </li>
                    )}
                    <li
                      id={`gs-opt-${i}`}
                      data-idx={i}
                      role="option"
                      aria-selected={isActive}
                      onMouseMove={() => setActive(i)}
                      onClick={() => choose(r)}
                      className="mx-2 px-3 py-2.5 rounded-xl flex items-start gap-3 cursor-pointer"
                      style={isActive ? { background: 'color-mix(in srgb, var(--primary) 14%, transparent)' } : undefined}
                    >
                      <Icon className="w-4 h-4 mt-0.5 shrink-0" style={{ color: isActive ? 'var(--primary-ink)' : 'var(--text-secondary)' }} aria-hidden="true" />
                      <div className="min-w-0 flex-1">
                        <p className="text-[14px] font-semibold truncate" style={{ color: 'var(--text-main)' }}>{highlight(r.title, query)}</p>
                        {'subtitle' in r && <p className="text-[12px] truncate" style={{ color: 'var(--text-secondary)' }}>{r.subtitle}</p>}
                        {r.kind === 'document' && r.snippet && (
                          <p className="text-[12.5px] mt-1 line-clamp-2" style={{ color: 'var(--text-secondary)' }}>{highlight(r.snippet, query)}</p>
                        )}
                      </div>
                      {isActive && <CornerDownLeft className="w-3.5 h-3.5 mt-1 shrink-0" style={{ color: 'var(--text-secondary)' }} aria-hidden="true" />}
                    </li>
                  </React.Fragment>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
};
