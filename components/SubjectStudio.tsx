import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  BookText, ListChecks, HelpCircle, BookA, History, Layers, NotebookPen, Copy, Download, Trash2,
  RefreshCw, FilePlus2, Check, X, FileText, Loader2, BookmarkPlus,
} from 'lucide-react';
import type { Collection, ProcessedDocument } from '../types';
import { useModalA11y } from '../hooks/useModalA11y';
import { ModalCloseButton } from './ModalCloseButton';
import { renderMarkdown } from './markdownRenderer';
import { useTranslation } from '../i18n/I18nProvider';
import { formatDate } from '../i18n/dates';
import { toast } from '../services/toast';
import { resolveErrorMessage } from '../services/errorMessages';
import { documentDisplayName } from '../services/libraryService';
import { allCollectionDocs } from '../services/collectionSource';
import { isDocInScope, groupDocsByFolder } from '../services/moduleFolders';
import { isDocumentReadable } from '../services/collectionSource';
import { canReadFullText, readPdfPages } from '../services/pdfFullText';
import { generateStudioOutput } from '../services/geminiService';
import {
  STUDIO_FORMATS, buildStudioSources, buildStudioPrompt, checkCitations, toPlainExport,
  splitGuide, groupRefs,
  type StudioFormat, type StudioSourceInput,
} from '../services/subjectStudio';
import { StudioSelfCheck, type SelfCheckState } from './StudioSelfCheck';
import {
  loadStudioItems, cachedStudioItems, saveStudioItem, deleteStudioItem, newStudioId,
  type StudioItem, type StudioKind, type StudioSourceRef,
} from '../services/studioStore';
import { buildSubjectSummary, summaryFileName } from '../services/subjectSummary';
import { getHighlights } from '../services/userHighlights';
import { requestReaderJump } from '../services/readerJump';
import type { CitationRef } from '../services/citations';

interface Props {
  collection: Collection;
  documents: ProcessedDocument[];
  userId?: string;
  onClose: () => void;
  /** Quelle im Reader öffnen (Fußnote angeklickt). */
  onOpenDoc: (doc: ProcessedDocument) => void;
  /** Notiz als Text-Quelle ins Fach legen (läuft über den normalen Upload). */
  onAddAsSource: (file: File, collectionId: string) => Promise<string | null>;
}

const KIND_ICON: Record<StudioKind | 'digests', React.ComponentType<{ className?: string; strokeWidth?: number }>> = {
  summary: BookText, guide: ListChecks, faq: HelpCircle, glossary: BookA, timeline: History, note: NotebookPen, digests: Layers,
};

type View =
  | { kind: 'home' }
  | { kind: 'item'; id: string }
  | { kind: 'digests' }
  | { kind: 'generating'; format: StudioFormat };

type MobileTab = 'sources' | 'content' | 'saved';

/**
 * Lernstudio eines Fachs (nach dem Vorbild NotebookLM): Quellen anhaken,
 * Format wählen, Text mit Fußnoten erzeugen, Ergebnisse und Notizen speichern.
 * Logik: services/subjectStudio.ts, Speicherung: services/studioStore.ts.
 */
export const SubjectStudio: React.FC<Props> = ({ collection, documents, userId, onClose, onOpenDoc, onAddAsSource }) => {
  const { t, tp } = useTranslation();
  const { titleId, dialogProps } = useModalA11y(onClose);

  const docs = useMemo(() => allCollectionDocs(collection, documents), [collection, documents]);
  const groups = useMemo(() => groupDocsByFolder(collection, docs), [collection, docs]);
  // Start: alles, was auch die anderen Funktionen nutzen (abgewählte Unterordner bleiben aus).
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(docs.filter(d => isDocInScope(collection, d) && isDocumentReadable(d)).map(d => d.id)),
  );
  const [items, setItems] = useState<StudioItem[]>(() => cachedStudioItems(userId, collection.id));
  const [view, setView] = useState<View>({ kind: 'home' });
  const [mobileTab, setMobileTab] = useState<MobileTab>('content');
  const [format, setFormat] = useState<StudioFormat>('summary');
  const [focus, setFocus] = useState('');
  const [streamText, setStreamText] = useState('');
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [activeCitation, setActiveCitation] = useState<{ pages: number[]; source: StudioSourceRef } | null>(null);
  // Selbsttest-Antworten je Leitfaden und Frage, nur auf diesem Gerät (Schlüssel "<itemId>:<index>").
  const selfCheckKey = `studearc_studio_selfcheck_${userId ?? 'local'}`;
  const [selfChecks, setSelfChecks] = useState<Record<string, SelfCheckState>>(() => {
    try { return JSON.parse(localStorage.getItem(selfCheckKey) ?? '{}') as Record<string, SelfCheckState>; } catch { return {}; }
  });
  const updateSelfCheck = (key: string, next: SelfCheckState) => setSelfChecks(prev => {
    const all = { ...prev, [key]: next };
    try { localStorage.setItem(selfCheckKey, JSON.stringify(all)); } catch { /* voll: nur für diese Sitzung */ }
    return all;
  });
  const [noteDraft, setNoteDraft] = useState<{ title: string; markdown: string } | null>(null);
  const [selectionText, setSelectionText] = useState('');
  const cancelRef = useRef(false);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    loadStudioItems(userId, collection.id).then(list => { if (alive) setItems(list); }).catch(() => {});
    return () => { alive = false; cancelRef.current = true; };
  }, [userId, collection.id]);

  // Markierter Text im Inhalt: als Notiz speicherbar.
  useEffect(() => {
    const onSelect = () => {
      const sel = window.getSelection();
      const text = sel?.toString().trim() ?? '';
      const inside = !!sel && sel.rangeCount > 0 && !!contentRef.current?.contains(sel.getRangeAt(0).commonAncestorContainer);
      setSelectionText(inside && text.length > 3 ? text.slice(0, 4000) : '');
    };
    document.addEventListener('selectionchange', onSelect);
    return () => document.removeEventListener('selectionchange', onSelect);
  }, []);

  const formatLabel = (k: StudioKind) => t(`stu.fmt.${k}`);
  const openItem = items.find(i => view.kind === 'item' && i.id === view.id) ?? null;
  const generating = view.kind === 'generating';

  const toggleDoc = (id: string) => setSelected(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const persist = async (item: StudioItem) => {
    setItems(prev => [item, ...prev.filter(i => i.id !== item.id)]);
    await saveStudioItem(userId, item).catch(() => toast.error(t('stu.saveFailed')));
  };

  // ── Erzeugen ──
  const generate = async (fmt: StudioFormat, focusText = focus) => {
    const chosen = docs.filter(d => selected.has(d.id));
    if (!chosen.length) { toast.info(t('stu.pickSources')); setMobileTab('sources'); return; }
    cancelRef.current = false;
    setView({ kind: 'generating', format: fmt });
    setMobileTab('content');
    setStreamText('');
    try {
      // PDFs mit Textebene seitenweise lesen, damit Fußnoten auf Seiten zeigen.
      const pdfs = chosen.filter(canReadFullText);
      const pagesById = new Map<string, string[] | null>();
      setProgress(pdfs.length ? { done: 0, total: pdfs.length } : null);
      for (const [idx, d] of pdfs.entries()) {
        if (cancelRef.current) return;
        try { pagesById.set(d.id, await readPdfPages(d, () => cancelRef.current)); } catch { pagesById.set(d.id, null); }
        setProgress({ done: idx + 1, total: pdfs.length });
      }
      setProgress(null);
      const inputs: StudioSourceInput[] = chosen.map(doc => ({ doc, pages: pagesById.get(doc.id) ?? null }));
      const { sources, skipped } = buildStudioSources(inputs);
      if (!sources.length) { toast.error(t('stu.noReadable')); setView({ kind: 'home' }); return; }
      if (skipped.length) toast.info(tp('stu.skippedN', skipped.length));

      const raw = await generateStudioOutput(
        buildStudioPrompt(fmt, collection.name, sources, focusText),
        text => { if (!cancelRef.current) setStreamText(text); },
      );
      if (cancelRef.current) return;
      const { markdown } = checkCitations(raw.trim(), sources);
      if (!markdown) throw new Error(t('stu.empty'));
      const now = Date.now();
      const item: StudioItem = {
        id: newStudioId(), collectionId: collection.id, kind: fmt,
        title: focusText.trim() ? `${formatLabel(fmt)}: ${focusText.trim().slice(0, 60)}` : formatLabel(fmt),
        markdown, sources: sources.map(s => ({ n: s.n, docId: s.docId, name: s.name })),
        ...(focusText.trim() ? { focus: focusText.trim() } : {}),
        createdAt: now, updatedAt: now,
      };
      await persist(item);
      setView({ kind: 'item', id: item.id });
    } catch (e) {
      if (!cancelRef.current) { toast.error(resolveErrorMessage(e)); setView({ kind: 'home' }); }
    } finally {
      setProgress(null);
    }
  };

  const cancelGenerate = () => { cancelRef.current = true; setView({ kind: 'home' }); setProgress(null); };

  // ── Fußnoten ──
  const renderCitation = (sources: StudioSourceRef[]) => (refs: CitationRef[], key: string) => (
    <span key={key} className="inline-flex gap-0.5 align-super">
      {groupRefs(refs).map(({ n, pages }) => {
        const source = sources.find(s => s.n === n);
        if (!source) return null;
        const label = pages.length ? `${n} · ${t('stu.pagesShort', { pages: pages.join(', ') })}` : String(n);
        return (
          <button
            key={n}
            type="button"
            onClick={() => setActiveCitation({ pages, source })}
            title={source.name}
            className="px-1.5 rounded-md text-[11px] font-semibold leading-[1.6] transition-colors hover:opacity-80 whitespace-nowrap"
            style={{ background: 'var(--primary-soft)', color: 'var(--primary-ink)' }}
          >
            {label}
          </button>
        );
      })}
    </span>
  );

  const openCitation = (page?: number) => {
    if (!activeCitation) return;
    const doc = documents.find(d => d.id === activeCitation.source.docId);
    if (!doc) { toast.info(t('stu.sourceGone')); return; }
    if (page) requestReaderJump(doc.id, page);
    onOpenDoc(doc);
  };

  // ── Export ──
  const download = (name: string, text: string) => {
    const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name; a.click();
    URL.revokeObjectURL(url);
  };
  const copy = (text: string) => {
    if (!navigator.clipboard?.writeText) { toast.error(t('share.copyFailed')); return; }
    navigator.clipboard.writeText(text).then(() => toast.success(t('sum.copied'))).catch(() => toast.error(t('share.copyFailed')));
  };
  const itemExport = (item: StudioItem) => toPlainExport(item.title, item.markdown, item.sources);
  const itemFileName = (item: StudioItem) =>
    summaryFileName(`${collection.name} ${item.title}`).replace('_Zusammenfassung.md', '.md');

  // ── Notizen ──
  const startNote = (markdown = '') => {
    setNoteDraft({ title: '', markdown });
    setView({ kind: 'home' });
    setMobileTab('content');
  };
  const saveNote = async () => {
    if (!noteDraft || !noteDraft.markdown.trim()) return;
    const now = Date.now();
    const item: StudioItem = {
      id: newStudioId(), collectionId: collection.id, kind: 'note',
      title: noteDraft.title.trim() || t('stu.noteUntitled'),
      markdown: noteDraft.markdown.trim(), sources: openItem?.sources ?? [], createdAt: now, updatedAt: now,
    };
    await persist(item);
    setNoteDraft(null);
    setView({ kind: 'item', id: item.id });
  };
  const saveSelectionAsNote = async () => {
    if (!selectionText) return;
    const now = Date.now();
    const item: StudioItem = {
      id: newStudioId(), collectionId: collection.id, kind: 'note',
      title: openItem ? t('stu.noteFrom', { title: openItem.title }) : t('stu.noteUntitled'),
      markdown: selectionText, sources: openItem?.sources ?? [], createdAt: now, updatedAt: now,
    };
    await persist(item);
    window.getSelection()?.removeAllRanges();
    toast.success(t('stu.noteSaved'));
  };
  const addAsSource = async (item: StudioItem) => {
    const file = new File([itemExport(item)], `${item.title.replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'Notiz'}.md`, { type: 'text/markdown' });
    const id = await onAddAsSource(file, collection.id);
    if (id) toast.success(t('stu.addedAsSource'));
  };
  const remove = async (item: StudioItem) => {
    setItems(prev => prev.filter(i => i.id !== item.id));
    setView({ kind: 'home' });
    await deleteStudioItem(userId, item.id).catch(() => {});
  };

  // ── Bausteine ──
  const btn = 'flex items-center justify-center gap-2 px-4 py-2.5 rounded-2xl text-[13px] font-semibold transition-all hover:opacity-90 disabled:opacity-40';
  const ghost = { background: 'var(--bg-main)', color: 'var(--text-main)', border: '1px solid var(--border-color)' };
  const primary = { background: 'var(--primary)', color: 'var(--primary-text)' };
  const eyebrow = 'text-[11px] font-semibold uppercase tracking-[0.08em]';

  const sourcesPanel = (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className={eyebrow} style={{ color: 'var(--text-secondary)' }}>{tp('stu.sourcesN', selected.size)}</p>
        <div className="flex gap-1">
          <button onClick={() => setSelected(new Set(docs.filter(isDocumentReadable).map(d => d.id)))} className="px-2 py-1 rounded-lg text-[12px] font-semibold" style={{ color: 'var(--primary-ink)' }}>{t('stu.all')}</button>
          <button onClick={() => setSelected(new Set())} className="px-2 py-1 rounded-lg text-[12px] font-semibold" style={{ color: 'var(--text-secondary)' }}>{t('stu.none')}</button>
        </div>
      </div>
      {groups.map(({ folder, docs: groupDocs }) => groupDocs.length > 0 && (
        <div key={folder?.id ?? 'loose'} className="space-y-1">
          {folder && <p className="text-[12px] font-semibold px-1 pt-1" style={{ color: 'var(--text-secondary)' }}>{folder.name}</p>}
          {groupDocs.map(d => {
            const readable = isDocumentReadable(d) || canReadFullText(d);
            const on = selected.has(d.id);
            return (
              <label
                key={d.id}
                className={`flex items-start gap-2.5 px-2 py-2 rounded-xl transition-colors ${readable ? 'cursor-pointer hover:bg-[var(--bg-main)]' : 'opacity-50'}`}
              >
                <input type="checkbox" checked={on} disabled={!readable} onChange={() => toggleDoc(d.id)} className="mt-0.5 w-4 h-4 shrink-0 accent-[var(--primary)]" />
                <span className="min-w-0">
                  <span className="block text-[13px] font-semibold break-words" style={{ color: 'var(--text-main)' }}>{documentDisplayName(d)}</span>
                  {!readable && <span className="block text-[11.5px]" style={{ color: 'var(--text-secondary)' }}>{t('stu.notReady')}</span>}
                </span>
              </label>
            );
          })}
        </div>
      ))}
      {docs.length === 0 && <p className="text-[13px]" style={{ color: 'var(--text-secondary)' }}>{t('stu.noDocs')}</p>}
    </div>
  );

  const savedPanel = (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className={eyebrow} style={{ color: 'var(--text-secondary)' }}>{t('stu.saved')}</p>
        <button onClick={() => startNote()} className="flex items-center gap-1 px-2 py-1 rounded-lg text-[12px] font-semibold" style={{ color: 'var(--primary-ink)' }}>
          <NotebookPen className="w-3.5 h-3.5" strokeWidth={2.25} /> {t('stu.newNote')}
        </button>
      </div>
      {items.length === 0 && <p className="text-[13px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{t('stu.savedEmpty')}</p>}
      <div className="space-y-1">
        {items.map(item => {
          const Icon = KIND_ICON[item.kind];
          const active = view.kind === 'item' && view.id === item.id;
          return (
            <button
              key={item.id}
              onClick={() => { setView({ kind: 'item', id: item.id }); setNoteDraft(null); setActiveCitation(null); setMobileTab('content'); }}
              className="w-full flex items-start gap-2.5 px-3 py-2.5 rounded-xl text-left transition-colors"
              style={active ? { background: 'var(--primary-soft)' } : {}}
            >
              <Icon className="w-4 h-4 mt-0.5 shrink-0" strokeWidth={2} />
              <span className="min-w-0">
                <span className="block text-[13px] font-semibold break-words" style={{ color: 'var(--text-main)' }}>{item.title}</span>
                <span className="block text-[11.5px]" style={{ color: 'var(--text-secondary)' }}>
                  {formatLabel(item.kind)} · {formatDate(item.createdAt, { day: '2-digit', month: 'short' })}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );

  const home = (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold" style={{ color: 'var(--text-main)' }}>{t('stu.homeTitle')}</h3>
        <p className="text-[13.5px] mt-1 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{t('stu.homeDesc')}</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {STUDIO_FORMATS.map(f => {
          const Icon = KIND_ICON[f];
          const on = format === f;
          return (
            <button
              key={f}
              onClick={() => setFormat(f)}
              aria-pressed={on}
              className="flex items-start gap-3 p-4 rounded-2xl text-left transition-all"
              style={on
                ? { background: 'var(--primary-soft)', border: '2px solid var(--primary)' }
                : { background: 'var(--bg-main)', border: '2px solid var(--border-color)' }}
            >
              <Icon className="w-5 h-5 mt-0.5 shrink-0" strokeWidth={2} />
              <span>
                <span className="block text-[14px] font-semibold" style={{ color: 'var(--text-main)' }}>{formatLabel(f)}</span>
                <span className="block text-[12.5px] mt-0.5 leading-snug" style={{ color: 'var(--text-secondary)' }}>{t(`stu.fmtDesc.${f}`)}</span>
              </span>
            </button>
          );
        })}
      </div>
      <div className="space-y-2">
        <label className={eyebrow} style={{ color: 'var(--text-secondary)' }} htmlFor="stu-focus">{t('stu.focusLabel')}</label>
        <input
          id="stu-focus"
          value={focus}
          onChange={e => setFocus(e.target.value)}
          placeholder={t('stu.focusPlaceholder')}
          maxLength={300}
          className="w-full px-4 py-3 rounded-2xl text-[14px] outline-none"
          style={{ background: 'var(--bg-main)', color: 'var(--text-main)', border: '1px solid var(--border-color)' }}
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <button onClick={() => generate(format)} disabled={selected.size === 0} className={`${btn} flex-1 sm:flex-none`} style={primary}>
          {t('stu.create', { format: formatLabel(format) })}
        </button>
        <button onClick={() => setView({ kind: 'digests' })} disabled={selected.size === 0} className={btn} style={ghost}>
          <Layers className="w-3.5 h-3.5" strokeWidth={2.5} /> {t('stu.digests')}
        </button>
      </div>
      <p className="text-[12px]" style={{ color: 'var(--text-secondary)' }}>{t('stu.costHint')}</p>
    </div>
  );

  const noteEditor = noteDraft && (
    <div className="space-y-3">
      <input
        value={noteDraft.title}
        onChange={e => setNoteDraft({ ...noteDraft, title: e.target.value })}
        placeholder={t('stu.noteTitle')}
        className="w-full px-4 py-3 rounded-2xl text-[15px] font-semibold outline-none"
        style={{ background: 'var(--bg-main)', color: 'var(--text-main)', border: '1px solid var(--border-color)' }}
      />
      <textarea
        autoFocus
        value={noteDraft.markdown}
        onChange={e => setNoteDraft({ ...noteDraft, markdown: e.target.value })}
        placeholder={t('stu.notePlaceholder')}
        rows={12}
        className="w-full px-4 py-3 rounded-2xl text-[14.5px] leading-relaxed outline-none resize-y"
        style={{ background: 'var(--bg-main)', color: 'var(--text-main)', border: '1px solid var(--border-color)' }}
      />
      <div className="flex gap-2">
        <button onClick={saveNote} disabled={!noteDraft.markdown.trim()} className={btn} style={primary}><Check className="w-3.5 h-3.5" strokeWidth={2.5} /> {t('lib.save')}</button>
        <button onClick={() => setNoteDraft(null)} className={btn} style={ghost}>{t('common.cancel')}</button>
      </div>
    </div>
  );

  const generatingView = view.kind === 'generating' && (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--primary-ink)' }} />
        <p className="text-[13.5px] font-semibold flex-1" style={{ color: 'var(--text-main)' }}>
          {progress ? t('stu.readingPdfs', { done: progress.done, total: progress.total }) : t('stu.writing', { format: formatLabel(view.format) })}
        </p>
        <button onClick={cancelGenerate} className={btn} style={ghost}><X className="w-3.5 h-3.5" strokeWidth={2.5} /> {t('common.cancel')}</button>
      </div>
      {streamText && (
        <div className="text-[15px] leading-relaxed opacity-90">{renderMarkdown(streamText.replace(/\[\d+(?::\d+)?\]/g, ''))}</div>
      )}
    </div>
  );

  const digestView = view.kind === 'digests' && (() => {
    const chosen = docs.filter(d => selected.has(d.id));
    const summary = buildSubjectSummary(
      collection.name, chosen,
      { missing: t('sum.missing'), truncated: t('sum.truncated'), highlights: t('sum.myHighlights'), page: n => t('hl.page', { n }) },
      getHighlights,
    );
    return (
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[13px] flex-1 min-w-[160px]" style={{ color: 'var(--text-secondary)' }}>{t('stu.digestsDesc')}</p>
          <button onClick={() => copy(summary.markdown)} className={btn} style={ghost}><Copy className="w-3.5 h-3.5" strokeWidth={2.5} /> {t('sum.copy')}</button>
          <button onClick={() => download(summaryFileName(collection.name), summary.markdown)} className={btn} style={ghost}><Download className="w-3.5 h-3.5" strokeWidth={2.5} /> {t('sum.download')}</button>
        </div>
        <div className="text-[15px] leading-relaxed">{renderMarkdown(summary.markdown.replace(/^# .*\n+/, ''))}</div>
      </div>
    );
  })();

  const guideBody = (item: StudioItem) => {
    const rich = (md: string) => renderMarkdown(md, { renderCitation: renderCitation(item.sources) });
    const segments = splitGuide(item.markdown);
    const questions = segments.filter(s => s.type === 'question').length;
    const states = Array.from({ length: questions }, (_, i) => selfChecks[`${item.id}:${i}`]);
    const answered = states.filter(s => s?.result).length;
    const correct = states.filter(s => s?.result?.verdict === 'correct').length;
    return (
      <div className="space-y-5 text-[15px] leading-relaxed">
        {questions > 0 && (
          <p className="text-[13px] font-semibold rounded-xl px-3.5 py-2.5" style={{ background: 'var(--primary-soft)', color: 'var(--primary-ink)' }}>
            {answered === 0 ? tp('stu.sc.intro', questions) : t('stu.sc.progress', { answered, total: questions, correct })}
          </p>
        )}
        {segments.map((seg, i) => seg.type === 'md'
          ? <div key={i}>{rich(seg.text)}</div>
          : (
            <StudioSelfCheck
              key={i}
              question={seg.question}
              reference={seg.answer}
              sources={item.sources}
              documents={documents}
              state={selfChecks[`${item.id}:${seg.index}`]}
              onChange={next => updateSelfCheck(`${item.id}:${seg.index}`, next)}
              renderRich={rich}
            />
          ))}
      </div>
    );
  };

  const itemView = openItem && (
    <div className="space-y-5">
      <div className="space-y-3">
        <p className={eyebrow} style={{ color: 'var(--primary-ink)' }}>{formatLabel(openItem.kind)} · {formatDate(openItem.createdAt, { day: '2-digit', month: 'short', year: 'numeric' })}</p>
        <h3 className="text-xl font-semibold break-words" style={{ color: 'var(--text-main)' }}>{openItem.title}</h3>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => copy(itemExport(openItem))} className={btn} style={ghost}><Copy className="w-3.5 h-3.5" strokeWidth={2.5} /> {t('sum.copy')}</button>
          <button onClick={() => download(itemFileName(openItem), itemExport(openItem))} className={btn} style={ghost}><Download className="w-3.5 h-3.5" strokeWidth={2.5} /> {t('sum.download')}</button>
          {openItem.kind === 'note'
            ? <button onClick={() => addAsSource(openItem)} className={btn} style={ghost}><FilePlus2 className="w-3.5 h-3.5" strokeWidth={2.5} /> {t('stu.addAsSource')}</button>
            : <button onClick={() => { setFormat(openItem.kind as StudioFormat); setFocus(openItem.focus ?? ''); generate(openItem.kind as StudioFormat, openItem.focus ?? ''); }} className={btn} style={ghost}><RefreshCw className="w-3.5 h-3.5" strokeWidth={2.5} /> {t('stu.regenerate')}</button>}
          <button onClick={() => remove(openItem)} className={btn} style={{ ...ghost, color: '#e11d48' }} aria-label={t('lib.delete')}><Trash2 className="w-3.5 h-3.5" strokeWidth={2.5} /></button>
        </div>
      </div>
      {openItem.kind === 'guide' ? guideBody(openItem) : (
        <div className="text-[15px] leading-relaxed">
          {renderMarkdown(openItem.markdown, { renderCitation: renderCitation(openItem.sources) })}
        </div>
      )}
      {openItem.kind !== 'note' && openItem.sources.length > 0 && (
        <div className="pt-4 space-y-1.5" style={{ borderTop: '1px solid var(--border-color)' }}>
          <p className={eyebrow} style={{ color: 'var(--text-secondary)' }}>{t('stu.sourceList')}</p>
          {openItem.sources.map(s => (
            <p key={s.n} className="text-[13px] flex gap-2" style={{ color: 'var(--text-secondary)' }}>
              <span className="font-semibold w-5 text-right shrink-0" style={{ color: 'var(--primary-ink)' }}>{s.n}</span>
              <span className="break-words">{s.name}</span>
            </p>
          ))}
        </div>
      )}
    </div>
  );

  const content = noteDraft ? noteEditor
    : view.kind === 'generating' ? generatingView
    : view.kind === 'digests' ? digestView
    : openItem ? itemView
    : home;

  const tabBtn = (tab: MobileTab, label: string) => (
    <button
      onClick={() => setMobileTab(tab)}
      className="flex-1 py-2 rounded-xl text-[13px] font-semibold transition-all"
      style={mobileTab === tab ? { background: 'var(--card)', color: 'var(--text-main)', boxShadow: '0 1px 3px rgba(0,0,0,.08)' } : { color: 'var(--text-secondary)' }}
    >
      {label}
    </button>
  );

  return createPortal(
    <div className="fixed inset-0 bg-black/60 z-[60] flex items-stretch sm:items-center justify-center sm:p-4 animate-in fade-in duration-200">
      <div
        {...dialogProps}
        className="w-full max-w-7xl h-full sm:h-[92vh] flex flex-col sm:rounded-[24px] shadow-3d-deep overflow-hidden"
        style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border-color)' }}
      >
        <div className="flex justify-between items-start gap-4 px-5 sm:px-8 pt-[max(1.25rem,env(safe-area-inset-top))] pb-4" style={{ borderBottom: '1px solid var(--border-color)' }}>
          <div className="min-w-0 flex-1">
            <p className={`${eyebrow} mb-1`} style={{ color: 'var(--primary-ink)' }}>{t('stu.eyebrow')}</p>
            <h2 id={titleId} className="text-xl font-semibold break-words" style={{ color: 'var(--text-main)' }}>{collection.name}</h2>
          </div>
          {(view.kind !== 'home' || noteDraft) && !generating && (
            <button onClick={() => { setView({ kind: 'home' }); setNoteDraft(null); setActiveCitation(null); }} className={btn} style={ghost}>{t('stu.newOutput')}</button>
          )}
          <ModalCloseButton onClick={onClose} label={t('common.close')} />
        </div>

        <div className="lg:hidden px-4 pt-3">
          <div className="flex gap-1 p-1 rounded-2xl" style={{ background: 'var(--bg-main)' }}>
            {tabBtn('sources', tp('stu.sourcesN', selected.size))}
            {tabBtn('content', t('stu.tabContent'))}
            {tabBtn('saved', t('stu.saved'))}
          </div>
        </div>

        <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[270px_minmax(0,1fr)_280px]">
          <aside className={`${mobileTab === 'sources' ? 'block' : 'hidden'} lg:block overflow-y-auto px-5 py-5 lg:border-r`} style={{ borderColor: 'var(--border-color)' }}>
            {sourcesPanel}
          </aside>
          <main ref={contentRef} className={`${mobileTab === 'content' ? 'block' : 'hidden'} lg:block overflow-y-auto px-5 sm:px-8 py-6 relative`} style={{ color: 'var(--text-main)' }}>
            {content}
          </main>
          <aside className={`${mobileTab === 'saved' ? 'block' : 'hidden'} lg:block overflow-y-auto px-4 py-5 lg:border-l`} style={{ borderColor: 'var(--border-color)' }}>
            {savedPanel}
          </aside>
        </div>

        {(activeCitation || selectionText) && (
          <div className="px-5 sm:px-8 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] flex flex-wrap items-center gap-3" style={{ borderTop: '1px solid var(--border-color)', background: 'var(--card)' }}>
            {activeCitation ? (
              <>
                <FileText className="w-4 h-4 shrink-0" style={{ color: 'var(--primary-ink)' }} strokeWidth={2} />
                <p className="text-[13px] flex-1 min-w-[160px] break-words" style={{ color: 'var(--text-main)' }}>
                  <span className="font-semibold">{activeCitation.source.name}</span>
                </p>
                {activeCitation.pages.length
                  ? activeCitation.pages.slice(0, 8).map(p => (
                      <button key={p} onClick={() => openCitation(p)} className={btn} style={primary}>{t('hl.page', { n: p })}</button>
                    ))
                  : <button onClick={() => openCitation()} className={btn} style={primary}>{t('stu.openSource')}</button>}
                <button onClick={() => setActiveCitation(null)} className="p-2" style={{ color: 'var(--text-secondary)' }} aria-label={t('common.close')}><X className="w-4 h-4" /></button>
              </>
            ) : (
              <>
                <p className="text-[13px] flex-1 min-w-[160px]" style={{ color: 'var(--text-secondary)' }}>{t('stu.selectionHint')}</p>
                <button onMouseDown={e => e.preventDefault()} onClick={saveSelectionAsNote} className={btn} style={primary}>
                  <BookmarkPlus className="w-3.5 h-3.5" strokeWidth={2.5} /> {t('stu.saveSelection')}
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
};
