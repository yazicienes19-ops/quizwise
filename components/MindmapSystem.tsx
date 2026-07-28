import React, { useEffect, useMemo, useState } from 'react';
import { Collection, MindmapItem, ProcessedDocument } from '../types';
import { documentDisplayName } from '../services/libraryService';
import { loadMindmapsFromSupabase, saveMindmapToSupabase, deleteMindmapFromSupabase, uploadAllMindmapsToSupabase } from '../services/mindmapService';
import { useTranslation } from '../i18n/I18nProvider';
import { formatDate } from '../i18n/dates';
import { MindmapEditor } from './MindmapEditor';

const STORAGE_KEY = 'studearc_mindmaps';

const loadLocal = (): MindmapItem[] => {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; }
};

// Einfaches Last-Write-Wins per id — anders als bei Karteikarten gibt es hier
// keinen parallel fortschreitenden Lernstand, der pro Feld gemergt werden müsste.
const mergeMindmaps = (local: MindmapItem[], cloud: MindmapItem[]): MindmapItem[] => {
  const byId = new Map<string, MindmapItem>();
  local.forEach(item => byId.set(item.id, item));
  cloud.forEach(item => {
    const existing = byId.get(item.id);
    if (!existing || item.updatedAt >= existing.updatedAt) byId.set(item.id, item);
  });
  return Array.from(byId.values()).sort((a, b) => b.updatedAt - a.updatedAt);
};

interface MindmapSystemProps {
  availableDocuments: ProcessedDocument[];
  collections: Collection[];
  userId?: string;
  initialDoc?: ProcessedDocument;
}

export const MindmapSystem: React.FC<MindmapSystemProps> = ({ availableDocuments, collections, userId, initialDoc }) => {
  const { t } = useTranslation();
  const [items, setItems] = useState<MindmapItem[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDocId, setNewDocId] = useState('');
  // Variante C: aktives Fach (app-weiter Kontext), gleiches Muster wie
  // SourceSelector.tsx — Vorauswahl beim Anlegen UND Filter der Liste.
  const activeModuleId = useMemo(() => {
    const active = localStorage.getItem('studearc_active_module');
    return active && collections.some(c => c.id === active) ? active : null;
  }, [collections]);
  const [newCollectionId, setNewCollectionId] = useState<string>(activeModuleId ?? '');
  const visibleItems = useMemo(
    () => activeModuleId ? items.filter(i => i.collectionId === activeModuleId) : items,
    [items, activeModuleId],
  );

  useEffect(() => {
    const load = async () => {
      if (userId) {
        try {
          const cloud = await loadMindmapsFromSupabase(userId);
          if (cloud.length > 0) {
            const merged = mergeMindmaps(loadLocal(), cloud);
            setItems(merged);
            localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
            return;
          }
          const local = loadLocal();
          if (local.length > 0) {
            await uploadAllMindmapsToSupabase(local, userId);
          }
          setItems(local);
        } catch {
          setItems(loadLocal());
        }
      } else {
        setItems(loadLocal());
      }
    };
    load();
  }, [userId]);

  const saveItems = (next: MindmapItem[], changed?: MindmapItem) => {
    setItems(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    if (userId && changed) saveMindmapToSupabase(changed, userId).catch(() => {});
  };

  const createMindmap = (title: string, sourceDocumentId?: string, collectionId?: string) => {
    const item: MindmapItem = {
      id: Math.random().toString(36).substr(2, 9),
      title,
      markdown: '',
      sourceDocumentId,
      collectionId,
      updatedAt: Date.now(),
    };
    saveItems([item, ...items], item);
    setActiveId(item.id);
    return item;
  };

  // Direktstart von der Dokument-Detailseite — legt sofort eine verknüpfte
  // Mindmap an statt erst den Anlage-Dialog zu zeigen (wie bei den anderen
  // Methoden mit directStart:true).
  useEffect(() => {
    if (!initialDoc) return;
    createMindmap(documentDisplayName(initialDoc), initialDoc.id, initialDoc.collectionId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    createMindmap(newTitle.trim(), newDocId || undefined, newCollectionId || undefined);
    setNewTitle('');
    setNewDocId('');
    setShowNewDialog(false);
  };

  const handleUpdate = (id: string, patch: Partial<Pick<MindmapItem, 'title' | 'markdown' | 'sourceDocumentId' | 'collectionId'>>) => {
    const next = items.map(item => item.id === id ? { ...item, ...patch, updatedAt: Date.now() } : item);
    const changed = next.find(item => item.id === id);
    saveItems(next, changed);
  };

  const handleDelete = (id: string) => {
    saveItems(items.filter(item => item.id !== id));
    if (userId) deleteMindmapFromSupabase(id, userId).catch(() => {});
    setActiveId(null);
  };

  const activeItem = items.find(item => item.id === activeId);
  if (activeItem) {
    return (
      <MindmapEditor
        item={activeItem}
        documents={availableDocuments}
        collections={collections}
        onUpdate={patch => handleUpdate(activeItem.id, patch)}
        onDelete={() => handleDelete(activeItem.id)}
        onBack={() => setActiveId(null)}
      />
    );
  }

  return (
    <div className="max-w-5xl mx-auto py-6 lg:py-10 px-2 sm:px-4 space-y-8 animate-in fade-in duration-700">
      <div className="text-center space-y-3">
        <h1 className="text-4xl lg:text-6xl font-black text-slate-900 dark:text-white tracking-tighter">
          {t('nav.mindmap')}
        </h1>
        <p className="text-base text-slate-500 dark:text-slate-400 font-medium opacity-80">{t('mm.subtitle')}</p>
      </div>

      {!showNewDialog ? (
        <button
          onClick={() => setShowNewDialog(true)}
          className="w-full p-5 rounded-2xl font-black uppercase text-[10px] tracking-widest border-2 border-dashed transition-all"
          style={{ color: 'var(--primary)', borderColor: 'color-mix(in srgb, var(--primary) 40%, transparent)' }}
        >
          + {t('mm.newMindmap')}
        </button>
      ) : (
        <form onSubmit={handleCreateSubmit} className="space-y-3 p-5 rounded-2xl animate-in zoom-in-95 duration-200" style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border-color)' }}>
          <input
            autoFocus
            placeholder={t('mm.titlePlaceholder')}
            value={newTitle}
            onChange={e => setNewTitle(e.target.value)}
            className="w-full p-4 bg-slate-50 dark:bg-slate-800 rounded-xl text-xs font-bold outline-none border-2 dark:text-white"
            style={{ borderColor: 'var(--primary)' }}
          />
          <div className="flex items-center gap-2">
            <span className="text-[9px] font-black uppercase text-slate-400 tracking-widest">{t('mm.linkDocument')}</span>
            <select
              value={newDocId}
              onChange={e => setNewDocId(e.target.value)}
              className="text-[10px] font-bold bg-slate-50 dark:bg-slate-800 dark:text-white rounded-lg px-2 py-1.5 outline-none border border-slate-200 dark:border-slate-700"
            >
              <option value="">{t('mm.noDocument')}</option>
              {availableDocuments.map(doc => (
                <option key={doc.id} value={doc.id}>{documentDisplayName(doc)}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[9px] font-black uppercase text-slate-400 tracking-widest">{t('mm.assignCollection')}</span>
            <select
              value={newCollectionId}
              onChange={e => setNewCollectionId(e.target.value)}
              className="text-[10px] font-bold bg-slate-50 dark:bg-slate-800 dark:text-white rounded-lg px-2 py-1.5 outline-none border border-slate-200 dark:border-slate-700"
            >
              <option value="">{t('mm.noCollection')}</option>
              {collections.map(col => (
                <option key={col.id} value={col.id}>{col.emoji} {col.name}</option>
              ))}
            </select>
          </div>
          <div className="flex gap-2">
            <button type="submit" className="flex-1 py-3 rounded-xl text-[9px] font-black uppercase tracking-widest" style={{ background: 'var(--primary)', color: 'var(--primary-text, #fff)' }}>{t('mm.create')}</button>
            <button type="button" onClick={() => setShowNewDialog(false)} className="px-4 bg-slate-100 dark:bg-slate-800 text-slate-400 py-3 rounded-xl text-[9px] font-black uppercase">✕</button>
          </div>
        </form>
      )}

      <div className="rounded-[28px] border border-slate-200 dark:border-slate-800 overflow-hidden">
        {visibleItems.length === 0 ? (
          <div className="py-20 text-center space-y-3 opacity-30 px-6">
            <p className="text-[10px] font-black uppercase tracking-widest">{t('mm.emptyState')}</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-50 dark:divide-slate-800">
            {visibleItems.map(item => {
              const linkedDoc = item.sourceDocumentId
                ? availableDocuments.find(d => d.id === item.sourceDocumentId)
                : undefined;
              const linkedCollection = item.collectionId
                ? collections.find(c => c.id === item.collectionId)
                : undefined;
              return (
                <div
                  key={item.id}
                  className="flex items-center justify-between p-5 lg:p-6 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-all group gap-4 cursor-pointer"
                  onClick={() => setActiveId(item.id)}
                >
                  <div className="min-w-0">
                    <h4 className="text-base lg:text-lg font-black text-slate-900 dark:text-white break-words group-hover:opacity-80 transition-opacity">
                      {item.title}
                    </h4>
                    <p className="text-[9px] font-bold text-slate-400 uppercase mt-1">
                      {linkedCollection ? `${linkedCollection.emoji} ${linkedCollection.name} · ` : ''}
                      {linkedDoc ? documentDisplayName(linkedDoc) + ' · ' : ''}{t('mm.lastEdited', { date: formatDate(new Date(item.updatedAt)) })}
                    </p>
                  </div>
                  <button
                    onClick={e => { e.stopPropagation(); handleDelete(item.id); }}
                    className="p-2.5 bg-slate-50 dark:bg-slate-800 text-slate-400 hover:text-rose-500 rounded-xl transition-all shrink-0"
                    title={t('mm.delete')}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
