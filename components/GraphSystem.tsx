import React from 'react';
import { Collection, ProcessedDocument } from '../types';
import type { GraphScope } from '../services/graph/types';
import { canUndo, canRedo } from '../services/graph/graphHistoryService';
import { clearSelection } from '../services/graph/graphSelectionService';
import { useKnowledgeGraph } from '../hooks/useKnowledgeGraph';
import { GraphCanvas } from './GraphCanvas';
import { GraphNodeDetailPanel } from './GraphNodeDetailPanel';
import { useTranslation } from '../i18n/I18nProvider';

/**
 * Produktseite "Wissensnetz" — erste reale Integration des Knowledge-Graph-
 * Features (bisher nur über den Dev-Harness erreichbar, s.
 * KNOWLEDGE_GRAPH_PHASE1_PLAN.md). Verbindet GraphCanvas mit dem bereits
 * bestehenden App-weiten Fach-Kontext ("aktives Modul", Sidebar-Auswahl in
 * Layout.tsx) statt einer eigenen Fach-Auswahl — ein Graph pro Fach ist die
 * in Phase 1 getroffene Architekturentscheidung, kein neues UI-Konzept nötig.
 *
 * Kein eigener "Neu anlegen"-Dialog wie bei der alten Mindmap (die durfte
 * beliebig viele benannte Items pro Fach haben) — es gibt genau einen Graphen
 * pro Fach bzw. einen fachübergreifenden ({kind:'all'}), useKnowledgeGraph
 * erzeugt ihn beim ersten Öffnen automatisch leer.
 */

interface GraphSystemProps {
  userId?: string;
  collections: Collection[];
  activeModuleId?: string | null;
  /** Direktstart von einer Dokument-Aktionskarte (SourceDetailPage) — springt
   *  zum Wissensnetz DIESES Fachs, legt aber bewusst nichts automatisch an
   *  (KI/Automatik schreibt nie in den Graphen, s. services/graph/graphMutationService.ts). */
  initialDoc?: ProcessedDocument;
}

export const GraphSystem: React.FC<GraphSystemProps> = ({ userId, collections, activeModuleId, initialDoc }) => {
  const { t } = useTranslation();

  const effectiveCollectionId = initialDoc?.collectionId ?? activeModuleId ?? undefined;
  const scope: GraphScope = effectiveCollectionId
    ? { kind: 'collection', collectionId: effectiveCollectionId }
    : { kind: 'all' };
  const activeCollection = effectiveCollectionId
    ? collections.find(c => c.id === effectiveCollectionId)
    : undefined;

  const graph = useKnowledgeGraph({ scope, userId });

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 flex-wrap px-1">
        <div className="min-w-0">
          <h1 className="text-lg font-black text-slate-900 dark:text-white tracking-tight truncate">
            {activeCollection ? `${activeCollection.emoji} ${activeCollection.name}` : t('kg.allSubjects')}
          </h1>
          <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">{t('nav.knowledgeGraph.hint')}</p>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <button
            onClick={graph.undo}
            disabled={!canUndo(graph.history)}
            title={t('kg.undo')}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-500 dark:text-slate-300 disabled:opacity-30 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            ↶
          </button>
          <button
            onClick={graph.redo}
            disabled={!canRedo(graph.history)}
            title={t('kg.redo')}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-500 dark:text-slate-300 disabled:opacity-30 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            ↷
          </button>
        </div>
      </div>

      <div
        className="relative rounded-[24px] overflow-hidden h-[80vh] lg:h-[calc(100vh-11rem)]"
        style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border-color)' }}
      >
        {graph.loading ? (
          <div className="absolute inset-0 flex items-center justify-center text-[10px] font-black uppercase tracking-widest text-slate-400">
            {t('kg.loading')}
          </div>
        ) : (
          <>
            <GraphCanvas
              state={graph.state}
              history={graph.history}
              selection={graph.selection}
              onChange={graph.onChange}
              onSelectionChange={graph.onSelectionChange}
              onEntityChanged={graph.onEntityChanged}
            />
            {/* Absolutes Overlay, kein Resize der Kanvasfläche — s.
                GraphNodeDetailPanel.tsx für die Begründung (Performance +
                räumliche Orientierung). */}
            {graph.selection.selectedNodeId && (
              <GraphNodeDetailPanel
                state={graph.state}
                history={graph.history}
                nodeId={graph.selection.selectedNodeId}
                onChange={graph.onChange}
                onEntityChanged={graph.onEntityChanged}
                onClose={() => graph.onSelectionChange(clearSelection(graph.selection))}
              />
            )}
          </>
        )}
        {graph.error && (
          <div
            className="absolute bottom-4 left-1/2 -translate-x-1/2 text-[10px] font-bold text-rose-500 rounded-lg px-3 py-2 shadow-sm border border-rose-200 dark:border-rose-900 bg-white dark:bg-slate-800"
          >
            {t('kg.errorPull')}
          </div>
        )}
      </div>
    </div>
  );
};
