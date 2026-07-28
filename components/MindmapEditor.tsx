import React, { useRef, useState, useEffect } from 'react';
import { Collection, MindmapItem, ProcessedDocument } from '../types';
import { documentDisplayName } from '../services/libraryService';
import { exportMindmapAsPng } from '../services/mindmapExport';
import { MindmapNode, deserializeMindmap, serializeMindmap, toggleCollapsed, updateNodeColor } from '../services/mindmapTree';
import { MindmapCanvas } from './MindmapCanvas';
import { MindmapOutlineEditor } from './MindmapOutlineEditor';
import { useTranslation } from '../i18n/I18nProvider';

const STARTER_MARKDOWN = '# Thema\n\n## Unterpunkt 1\n## Unterpunkt 2';

interface MindmapEditorProps {
  item: MindmapItem;
  documents: ProcessedDocument[];
  collections: Collection[];
  onUpdate: (patch: Partial<Pick<MindmapItem, 'title' | 'markdown' | 'sourceDocumentId' | 'collectionId'>>) => void;
  onDelete: () => void;
  onBack: () => void;
}

export const MindmapEditor: React.FC<MindmapEditorProps> = ({ item, documents, collections, onUpdate, onDelete, onBack }) => {
  const { t } = useTranslation();
  const [tree, setTree] = useState<MindmapNode>(() => deserializeMindmap(item.markdown || STARTER_MARKDOWN));
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameTitle, setRenameTitle] = useState(item.title);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleTreeChange = (next: MindmapNode) => {
    setTree(next);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      onUpdate({ markdown: serializeMindmap(next) });
    }, 400);
  };

  const handleToggleCollapse = (nodeId: string) => {
    handleTreeChange(toggleCollapsed(tree, nodeId));
  };

  const handleColorChange = (nodeId: string, color: string | undefined) => {
    handleTreeChange(updateNodeColor(tree, nodeId, color));
  };

  useEffect(() => {
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, []);

  const handleRename = (e: React.FormEvent) => {
    e.preventDefault();
    if (!renameTitle.trim()) return;
    onUpdate({ title: renameTitle.trim() });
    setIsRenaming(false);
  };

  const handleExport = async () => {
    try {
      await exportMindmapAsPng(tree, item.title, t('mm.untitledNode'));
    } catch {
      // Export-Fehler sind selten (fehlender Canvas-Kontext) — still fehlschlagen reicht hier
    }
  };

  const handleDelete = () => {
    if (!window.confirm(t('mm.deleteConfirm', { title: item.title }))) return;
    onDelete();
  };

  return (
    <div className="max-w-7xl mx-auto py-6 lg:py-10 px-2 sm:px-4 space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div className="space-y-2 flex-1 min-w-0">
          {isRenaming ? (
            <form onSubmit={handleRename} className="flex gap-2 items-center animate-in zoom-in-95 duration-200">
              <input
                autoFocus
                value={renameTitle}
                onChange={e => setRenameTitle(e.target.value)}
                className="flex-1 text-2xl font-black bg-transparent border-b-2 outline-none dark:text-white pb-1"
                style={{ borderColor: 'var(--primary)' }}
                onKeyDown={e => e.key === 'Escape' && setIsRenaming(false)}
              />
              <button type="submit" className="px-4 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest shrink-0" style={{ background: 'var(--primary)', color: 'var(--primary-text, #fff)' }}>
                {t('mm.save')}
              </button>
              <button type="button" onClick={() => setIsRenaming(false)} className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 text-slate-400 rounded-xl text-[10px] font-black uppercase shrink-0">✕</button>
            </form>
          ) : (
            <div className="flex items-center gap-3">
              <h2 className="text-2xl lg:text-3xl font-black dark:text-white break-words">{item.title}</h2>
              <button
                onClick={() => { setRenameTitle(item.title); setIsRenaming(true); }}
                className="p-2 rounded-xl text-slate-300 hover:text-slate-500 transition-all shrink-0"
                title={t('mm.rename')}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              </button>
            </div>
          )}

          <div className="flex items-center gap-2">
            <span className="text-[9px] font-black uppercase text-slate-400 tracking-widest">{t('mm.linkDocument')}</span>
            <select
              value={item.sourceDocumentId ?? ''}
              onChange={e => onUpdate({ sourceDocumentId: e.target.value || undefined })}
              className="text-[10px] font-bold bg-slate-50 dark:bg-slate-800 dark:text-white rounded-lg px-2 py-1 outline-none border border-slate-200 dark:border-slate-700 max-w-[180px]"
            >
              <option value="">{t('mm.noDocument')}</option>
              {documents.map(doc => (
                <option key={doc.id} value={doc.id}>{documentDisplayName(doc)}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[9px] font-black uppercase text-slate-400 tracking-widest">{t('mm.assignCollection')}</span>
            <select
              value={item.collectionId ?? ''}
              onChange={e => onUpdate({ collectionId: e.target.value || undefined })}
              className="text-[10px] font-bold bg-slate-50 dark:bg-slate-800 dark:text-white rounded-lg px-2 py-1 outline-none border border-slate-200 dark:border-slate-700 max-w-[180px]"
            >
              <option value="">{t('mm.noCollection')}</option>
              {collections.map(col => (
                <option key={col.id} value={col.id}>{col.emoji} {col.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleExport}
            className="flex items-center gap-2 px-4 py-2.5 bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-slate-700 dark:hover:text-white rounded-xl text-[9px] font-black uppercase tracking-widest transition-colors"
            title={t('mm.exportPng')}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            {t('mm.exportPng')}
          </button>
          <button
            onClick={handleDelete}
            className="p-2.5 bg-slate-100 dark:bg-slate-800 text-slate-400 hover:text-rose-500 rounded-xl transition-all"
            title={t('mm.delete')}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
          <button
            onClick={onBack}
            className="px-5 py-2.5 bg-slate-100 dark:bg-slate-800 text-slate-500 rounded-xl text-[10px] font-black uppercase tracking-widest hover:text-slate-700 dark:hover:text-white transition-colors"
          >
            {t('mm.back')}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-10 gap-4 lg:gap-6">
        <div
          className="lg:col-span-4 overflow-y-auto rounded-[24px] h-[50vh] lg:h-[70vh]"
          style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border-color)' }}
        >
          <MindmapOutlineEditor tree={tree} onChange={handleTreeChange} />
        </div>
        <div
          className="lg:col-span-6 relative rounded-[24px] overflow-hidden h-[50vh] lg:h-[70vh]"
          style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border-color)' }}
        >
          <MindmapCanvas tree={tree} onToggleCollapse={handleToggleCollapse} onColorChange={handleColorChange} />
        </div>
      </div>
    </div>
  );
};
