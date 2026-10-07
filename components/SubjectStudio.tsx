import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  BookText, ListChecks, HelpCircle, BookA, History, Layers, NotebookPen, Copy, Download, Trash2,
  RefreshCw, FilePlus2, Check, X, FileText, Loader2, BookmarkPlus, ChevronDown,
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
  splitGuide, groupRefs, truncationNotes, type StudioChapter,
  type StudioFormat, type StudioSourceInput,
} from '../services/subjectStudio';
import { StudioSelfCheck, type SelfCheckState } from './StudioSelfCheck';
import { StudioDiagram } from './StudioDiagram';
import { splitDiagrams, hideDiagramsWhileStreaming, diagramToBlock } from '../services/studioDiagrams';
import {
  loadStudioItems, cachedStudioItems, saveStudioItem, deleteStudioItem, newStudioId,
  type StudioItem, type StudioKind, type StudioSourceRef,
} from '../services/studioStore';
import { buildSubjectSummary, summaryFileName } from '../services/subjectSummary';
import { getHighlights } from '../services/userHighlights';
import { requestReaderJump } from '../services/readerJump';
import { loadStudioChapters } from '../services/studioChapters';
import { ensureFigureIndex, buildFigureCatalog, resolveFigureBlocks, type DocFigure } from '../services/studioFigures';
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
  // Kapitel langer PDFs (services/studioChapters.ts): geladen beim Aufklappen; chapterSel fehlt = ganzes Dokument.
  const [chapters, setChapters] = useState<Record<string, StudioChapter[] | null | 'loading'>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [chapterSel, setChapterSel] = useState<Record<string, number[]>>({});
  const [batch, setBatch] = useState<{ done: number; total: number; title: string } | null>(null);
  const [items, setItems] = useState<StudioItem[]>(() => cachedStudioItems(userId, collection.id));
  const [view, setView] = useState<View>({ kind: 'home' });
  const [mobileTab, setMobileTab] = useState<MobileTab>('content');
  const [format, setFormat] = useState<StudioFormat>('summary');
  const [focus, setFocus] = useState('');
  // Abbildungen aus dem Skript: dauert beim ersten Mal spürbar länger, daher nur auf Wunsch (Feedback 07.10.2026).
  const figuresKey = 'studearc_studio_figures';
  const [figuresOn, setFiguresOn] = useState(() => { try { return localStorage.getItem(figuresKey) === '1'; } catch { return false; } });
  const toggleFigures = (on: boolean) => {
    setFiguresOn(on);
    try { localStorage.setItem(figuresKey, on ? '1' : '0'); } catch { /* nur für diese Sitzung */ }
  };
  const [streamText, setStreamText] = useState('');
  /** Vorarbeit vor und nach dem Schreiben: PDFs lesen, Abbildungen suchen, Abbildungen ausschneiden. */
  const [progress, setProgress] = useState<{ phase: 'pdf' | 'figures' | 'crop'; done: number; total: number; name?: string } | null>(null);
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

  const toggleDoc = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
    setChapterSel(prev => { const { [id]: _drop, ...rest } = prev; return rest; });
  };

  const chapterLabel = (c: StudioChapter) => c.title || t('stu.ch.pages', { from: c.start, to: c.end });
  const docChapters = (id: string): StudioChapter[] | null => {
    const c = chapters[id];
    return Array.isArray(c) ? c : null;
  };
  /** Gewählte Kapitel eines Dokuments (Indizes); alle, wenn das Dokument ganz gewählt ist. */
  const selectedChapterIdx = (id: string): number[] => {
    const list = docChapters(id);
    if (!list || !selected.has(id)) return [];
    return chapterSel[id] ?? list.map((_, i) => i);
  };

  const toggleExpand = async (doc: ProcessedDocument) => {
    setExpanded(prev => { const next = new Set(prev); if (next.has(doc.id)) next.delete(doc.id); else next.add(doc.id); return next; });
    if (chapters[doc.id] !== undefined) return;
    setChapters(prev => ({ ...prev, [doc.id]: 'loading' }));
    const list = await loadStudioChapters(doc).catch(() => null);
    setChapters(prev => ({ ...prev, [doc.id]: list }));
  };

  const toggleChapter = (id: string, idx: number) => {
    const list = docChapters(id);
    if (!list) return;
    const current = new Set(selectedChapterIdx(id));
    if (current.has(idx)) current.delete(idx); else current.add(idx);
    const next = [...current].sort((a, b) => a - b);
    setSelected(prev => {
      const s2 = new Set(prev);
      if (next.length) s2.add(id); else s2.delete(id);
      return s2;
    });
    setChapterSel(prev => {
      const { [id]: _drop, ...rest } = prev;
      return next.length && next.length < list.length ? { ...rest, [id]: next } : rest;
    });
  };

  /** Seitenbereiche und Anzeigename je Dokument aus der Kapitelwahl. */
  const scopeFor = (id: string): { ranges?: [number, number][]; label?: string } => {
    const list = docChapters(id);
    const sel = chapterSel[id];
    if (!list || !sel) return {};
    const doc = docs.find(d => d.id === id);
    const name = doc ? documentDisplayName(doc) : '';
    const ranges = sel.map(i => [list[i].start, list[i].end] as [number, number]);
    return { ranges, label: sel.length === 1 ? `${name} · ${chapterLabel(list[sel[0]])}` : `${name} · ${tp('stu.ch.nChapters', sel.length)}` };
  };

  /** "Je Kapitel einzeln": jedes gewählte Kapitel aufgeklappter PDFs wird ein eigener Durchgang. */
  const batchUnits = docs.flatMap(d => (expanded.has(d.id) ? selectedChapterIdx(d.id).map(i => ({ doc: d, chapter: docChapters(d.id)![i] })) : []));
  const MAX_BATCH = 12;

  const persist = async (item: StudioItem) => {
    setItems(prev => [item, ...prev.filter(i => i.id !== item.id)]);
    await saveStudioItem(userId, item).catch(() => toast.error(t('stu.saveFailed')));
  };

  // ── Erzeugen ──

  /**
   * Ein Durchgang: PDFs lesen, Quellen bauen, (optional) Abbildungen, schreiben,
   * prüfen, speichern. null bei Abbruch; Fehler werden geworfen.
   */
  const runOnce = async (opts: {
    fmt: StudioFormat;
    focusText: string;
    chosen: ProcessedDocument[];
    scope: (id: string) => { ranges?: [number, number][]; label?: string };
    titleExtra?: string;
  }): Promise<StudioItem | null> => {
    const { fmt, focusText, chosen, scope, titleExtra } = opts;
    setStreamText('');
    // PDFs mit Textebene seitenweise lesen, damit Fußnoten auf Seiten zeigen.
    const pdfs = chosen.filter(canReadFullText);
    const pagesById = new Map<string, string[] | null>();
    setProgress(pdfs.length ? { phase: 'pdf', done: 0, total: pdfs.length } : null);
    for (const [idx, d] of pdfs.entries()) {
      if (cancelRef.current) return null;
      try { pagesById.set(d.id, await readPdfPages(d, () => cancelRef.current)); } catch { pagesById.set(d.id, null); }
      setProgress({ phase: 'pdf', done: idx + 1, total: pdfs.length });
    }
    setProgress(null);
    const inputs: StudioSourceInput[] = chosen.map(doc => ({ doc, pages: pagesById.get(doc.id) ?? null, ...scope(doc.id) }));
    const { sources, skipped } = buildStudioSources(inputs);
    if (!sources.length) throw new Error(t('stu.noReadable'));
    if (skipped.length) toast.info(tp('stu.skippedN', skipped.length));
    // Zu viel Material: nicht still abschneiden, sondern sagen, was fehlt.
    const cut = truncationNotes(sources);
    if (cut.length) toast.info(t('stu.ch.truncated', { name: cut[0].name, from: cut[0].from, until: cut[0].until, end: cut[0].end }));

    // Abbildungen aus den PDFs (nur auf Wunsch, nur Zusammenfassung und Leitfaden, nur mit Login).
    const withFigures = (fmt === 'summary' || fmt === 'guide') && !!userId && figuresOn;
    const figureDocs: { docId: string; n: number; figures: DocFigure[] }[] = [];
    if (withFigures) {
      for (const src of sources) {
        const doc = chosen.find(d => d.id === src.docId);
        if (!doc || !canReadFullText(doc) || cancelRef.current) continue;
        setProgress({ phase: 'figures', done: 0, total: 0, name: src.name });
        try {
          const index = await ensureFigureIndex(doc, userId, (done, total) => setProgress({ phase: 'figures', done, total, name: src.name }), () => cancelRef.current);
          // Bei gewählten Kapiteln nur Abbildungen aus deren Seiten.
          const ranges = scope(doc.id).ranges;
          const figs = (index?.figures ?? []).filter(f => !ranges || ranges.some(([a, b]) => f.page >= a && f.page <= b));
          if (figs.length) figureDocs.push({ docId: doc.id, n: src.n, figures: figs });
        } catch { /* ohne Abbildungen weiter, der Text hängt nicht daran */ }
      }
      setProgress(null);
    }
    if (cancelRef.current) return null;
    const catalog = buildFigureCatalog(figureDocs);

    const raw = await generateStudioOutput(
      buildStudioPrompt(fmt, collection.name, sources, focusText, catalog.text),
      text => { if (!cancelRef.current) setStreamText(text); },
    );
    if (cancelRef.current) return null;
    let { markdown } = checkCitations(raw.trim(), sources);
    if (!markdown) throw new Error(t('stu.empty'));
    if (catalog.entries.length && userId) {
      setProgress({ phase: 'crop', done: 0, total: 0 });
      ({ markdown } = await resolveFigureBlocks(markdown, catalog.entries, documents, userId, (done, total) => setProgress({ phase: 'crop', done, total })));
      setProgress(null);
    }
    if (cut.length) {
      markdown = `*${cut.map(c => t('stu.ch.truncatedNote', { name: c.name, from: c.from, until: c.until, end: c.end })).join(' ')}*\n\n${markdown}`;
    }
    const now = Date.now();
    const title = titleExtra
      ? `${formatLabel(fmt)}: ${titleExtra}`
      : focusText.trim() ? `${formatLabel(fmt)}: ${focusText.trim().slice(0, 60)}` : formatLabel(fmt);
    const item: StudioItem = {
      id: newStudioId(), collectionId: collection.id, kind: fmt, title: title.slice(0, 120),
      markdown, sources: sources.map(s => ({ n: s.n, docId: s.docId, name: s.name })),
      ...(focusText.trim() ? { focus: focusText.trim() } : {}),
      createdAt: now, updatedAt: now,
    };
    await persist(item);
    return item;
  };

  const generate = async (fmt: StudioFormat, focusText = focus) => {
    const chosen = docs.filter(d => selected.has(d.id));
    if (!chosen.length) { toast.info(t('stu.pickSources')); setMobileTab('sources'); return; }
    cancelRef.current = false;
    setView({ kind: 'generating', format: fmt });
    setMobileTab('content');
    try {
      const item = await runOnce({ fmt, focusText, chosen, scope: scopeFor });
      if (item) setView({ kind: 'item', id: item.id });
    } catch (e) {
      if (!cancelRef.current) { toast.error(resolveErrorMessage(e)); setView({ kind: 'home' }); }
    } finally {
      setProgress(null);
    }
  };

  /** Je Kapitel ein eigenes Ergebnis, nacheinander. */
  const generateBatch = async (fmt: StudioFormat) => {
    const units = batchUnits.slice(0, MAX_BATCH);
    if (units.length < 2) return;
    cancelRef.current = false;
    setView({ kind: 'generating', format: fmt });
    setMobileTab('content');
    let first: StudioItem | null = null;
    let made = 0;
    try {
      for (const [i, u] of units.entries()) {
        if (cancelRef.current) break;
        const label = chapterLabel(u.chapter);
        setBatch({ done: i, total: units.length, title: label });
        try {
          const item = await runOnce({
            fmt, focusText: focus, chosen: [u.doc], titleExtra: label,
            scope: () => ({ ranges: [[u.chapter.start, u.chapter.end]], label: `${documentDisplayName(u.doc)} · ${label}` }),
          });
          if (item) { made += 1; first = first ?? item; }
        } catch (e) {
          // Ein Kapitel scheitert (z. B. Budget): melden, aber das Budget-Ende beendet die Reihe.
          toast.error(`${label}: ${resolveErrorMessage(e)}`);
          if (/BUDGET|LIMIT/.test(String((e as Error)?.message))) break;
        }
      }
      if (made) toast.success(tp('stu.ch.batchDone', made));
      setView(first ? { kind: 'item', id: first.id } : { kind: 'home' });
    } finally {
      setBatch(null);
      setProgress(null);
    }
  };

  const cancelGenerate = () => { cancelRef.current = true; setView({ kind: 'home' }); setProgress(null); setBatch(null); };

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

  /** Abbildung (erkennbar an ihrem Bildpfad) aus einem gespeicherten Ergebnis entfernen. */
  const removeFigure = (item: StudioItem, image: string) => {
    const markdown = splitDiagrams(item.markdown)
      .filter(seg => !(seg.type === 'diagram' && seg.diagram.type === 'figure' && seg.diagram.image === image))
      .map(seg => (seg.type === 'md' ? seg.text : diagramToBlock(seg.diagram)))
      .join('\n\n');
    void persist({ ...item, markdown, updatedAt: Date.now() });
  };

  /** Markdown mit Fußnoten und Grafiken (```diagram, services/studioDiagrams.ts). */
  const richBody = (markdown: string, sources: StudioSourceRef[], item?: StudioItem) => {
    const cite = renderCitation(sources);
    return (
      <div className="space-y-5">
        {splitDiagrams(markdown).map((seg, i) => {
          if (seg.type === 'md') return <div key={i}>{renderMarkdown(seg.text, { renderCitation: cite })}</div>;
          const d = seg.diagram;
          const onRemove = item && d.type === 'figure' && d.image ? () => removeFigure(item, d.image!) : undefined;
          return <StudioDiagram key={i} diagram={d} renderCite={cite} onRemove={onRemove} />;
        })}
      </div>
    );
  };

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
            const list = chapters[d.id];
            const open = expanded.has(d.id);
            const partial = on && !!chapterSel[d.id];
            return (
              <div key={d.id}>
                <div className="flex items-start gap-1">
                  <label className={`flex-1 min-w-0 flex items-start gap-2.5 px-2 py-2 rounded-xl transition-colors ${readable ? 'cursor-pointer hover:bg-[var(--bg-main)]' : 'opacity-50'}`}>
                    <input
                      type="checkbox"
                      checked={on}
                      ref={el => { if (el) el.indeterminate = partial; }}
                      disabled={!readable}
                      onChange={() => toggleDoc(d.id)}
                      className="mt-0.5 w-4 h-4 shrink-0 accent-[var(--primary)]"
                    />
                    <span className="min-w-0">
                      <span className="block text-[13px] font-semibold break-words" style={{ color: 'var(--text-main)' }}>{documentDisplayName(d)}</span>
                      {!readable && <span className="block text-[11.5px]" style={{ color: 'var(--text-secondary)' }}>{t('stu.notReady')}</span>}
                      {partial && <span className="block text-[11.5px]" style={{ color: 'var(--primary-ink)' }}>{tp('stu.ch.nChapters', chapterSel[d.id].length)}</span>}
                    </span>
                  </label>
                  {canReadFullText(d) && (
                    <button
                      type="button"
                      onClick={() => toggleExpand(d)}
                      aria-expanded={open}
                      className="shrink-0 mt-1 px-2 py-1 rounded-lg text-[11.5px] font-semibold flex items-center gap-0.5 transition-colors hover:bg-[var(--bg-main)]"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      {t('stu.ch.toggle')} <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
                    </button>
                  )}
                </div>
                {open && (
                  <div className="ml-7 mb-1 pl-2 space-y-0.5" style={{ borderLeft: '2px solid var(--border-color)' }}>
                    {list === 'loading' || list === undefined
                      ? <p className="flex items-center gap-2 text-[12px] px-2 py-1.5" style={{ color: 'var(--text-secondary)' }}><Loader2 className="w-3.5 h-3.5 animate-spin" />{t('stu.ch.loading')}</p>
                      : list === null
                        ? <p className="text-[12px] px-2 py-1.5" style={{ color: 'var(--text-secondary)' }}>{t('stu.ch.none')}</p>
                        : list.map((c, i) => (
                          <label key={i} className="flex items-start gap-2 px-2 py-1.5 rounded-lg cursor-pointer hover:bg-[var(--bg-main)]">
                            <input type="checkbox" checked={selectedChapterIdx(d.id).includes(i)} onChange={() => toggleChapter(d.id, i)} className="mt-0.5 w-3.5 h-3.5 shrink-0 accent-[var(--primary)]" />
                            <span className="min-w-0 text-[12.5px] leading-snug" style={{ color: 'var(--text-main)' }}>
                              <span className="break-words">{chapterLabel(c)}</span>
                              <span className="block text-[11px]" style={{ color: 'var(--text-secondary)' }}>{t('stu.ch.pages', { from: c.start, to: c.end })}</span>
                            </span>
                          </label>
                        ))}
                  </div>
                )}
              </div>
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
                  {formatLabel(item.kind)} · {formatDate(item.createdAt, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
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
      {(format === 'summary' || format === 'guide') && userId && docs.some(d => selected.has(d.id) && canReadFullText(d)) && (
        <label className="flex items-start gap-2.5 cursor-pointer select-none">
          <input type="checkbox" checked={figuresOn} onChange={e => toggleFigures(e.target.checked)} className="mt-0.5 w-4 h-4 shrink-0 accent-[var(--primary)]" />
          <span>
            <span className="block text-[13.5px] font-semibold" style={{ color: 'var(--text-main)' }}>{t('stu.figuresToggle')}</span>
            <span className="block text-[12px]" style={{ color: 'var(--text-secondary)' }}>{t('stu.figuresToggleHint')}</span>
          </span>
        </label>
      )}
      <div className="flex flex-wrap gap-2">
        <button onClick={() => generate(format)} disabled={selected.size === 0} className={`${btn} flex-1 sm:flex-none`} style={primary}>
          {t('stu.create', { format: formatLabel(format) })}
        </button>
        {batchUnits.length >= 2 && (
          <button onClick={() => generateBatch(format)} disabled={batchUnits.length > MAX_BATCH} className={btn} style={ghost}>
            <Layers className="w-3.5 h-3.5" strokeWidth={2.5} /> {tp('stu.ch.batch', batchUnits.length)}
          </button>
        )}
        <button onClick={() => setView({ kind: 'digests' })} disabled={selected.size === 0} className={btn} style={ghost}>
          <Layers className="w-3.5 h-3.5" strokeWidth={2.5} /> {t('stu.digests')}
        </button>
      </div>
      {batchUnits.length > MAX_BATCH && <p className="text-[12px]" style={{ color: 'var(--text-secondary)' }}>{t('stu.ch.batchMax', { n: MAX_BATCH })}</p>}
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
      {batch && (
        <p className="text-[12.5px] font-semibold rounded-xl px-3.5 py-2" style={{ background: 'var(--primary-soft)', color: 'var(--primary-ink)' }}>
          {t('stu.ch.batchProgress', { n: batch.done + 1, total: batch.total, title: batch.title })}
        </p>
      )}
      <div className="flex items-center gap-3">
        <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--primary-ink)' }} />
        <p className="text-[13.5px] font-semibold flex-1" style={{ color: 'var(--text-main)' }}>
          {!progress ? t('stu.writing', { format: formatLabel(view.format) })
            : progress.phase === 'pdf' ? t('stu.readingPdfs', { done: progress.done, total: progress.total })
            : progress.phase === 'figures' ? (progress.total ? t('stu.findingFiguresN', { name: progress.name ?? '', done: progress.done, total: progress.total }) : t('stu.findingFigures', { name: progress.name ?? '' }))
            : t('stu.croppingFigures', { done: progress.done, total: progress.total })}
        </p>
        <button onClick={cancelGenerate} className={btn} style={ghost}><X className="w-3.5 h-3.5" strokeWidth={2.5} /> {t('common.cancel')}</button>
      </div>
      {streamText && (
        <div className="text-[15px] leading-relaxed opacity-90">{renderMarkdown(hideDiagramsWhileStreaming(streamText).replace(/\[\d+(?::\d+)?\]/g, ''))}</div>
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
    const rich = (md: string) => richBody(md, item.sources, item);
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
          {richBody(openItem.markdown, openItem.sources, openItem)}
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
