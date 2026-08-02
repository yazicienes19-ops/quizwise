import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Collection, ProcessedDocument } from '../types';
import type { GraphScope } from '../services/graph/types';
import { canUndo, canRedo } from '../services/graph/graphHistoryService';
import { clearSelection, selectNode } from '../services/graph/graphSelectionService';
import { shouldUsePdfReader } from '../services/libraryService';
import { useKnowledgeGraph } from '../hooks/useKnowledgeGraph';
import { GraphCanvas } from './GraphCanvas';
import { GraphNodeDetailPanel } from './GraphNodeDetailPanel';
import { useTranslation } from '../i18n/I18nProvider';
import type { GenerationSource } from '../services/geminiService';

const SplitScreenReader = React.lazy(() => import('./SplitScreenReader').then(m => ({ default: m.SplitScreenReader })));
const PdfSplitScreenReader = React.lazy(() => import('./PdfSplitScreenReader').then(m => ({ default: m.PdfSplitScreenReader })));

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
 *
 * Phase 3 ("Eigene Unterlagen") — Architekturentscheidung "Variante A": der
 * bestehende Reader (SplitScreenReader/PdfSplitScreenReader, unverändert,
 * keine Kopie) wird HIER als Vollbild-Overlay geöffnet, NICHT über den
 * globalen ActiveTab-Wechsel in AppContent.tsx. Grund: jeder bestehende
 * Reader-Aufruf hardcoded `onBack` auf ActiveTab.LIBRARY, und ein Tab-Wechsel
 * würde diese Komponente (und damit useKnowledgeGraph) komplett unmounten —
 * Auswahl/History sind bereits heute nicht über einen Mount hinweg persistent,
 * und Zoom/Pan (GraphCanvas-lokaler State) werden NIRGENDS persistiert. Ein
 * Tab-Wechsel hätte "gleicher Zoom, gleiche Position" strukturell unmöglich
 * gemacht. Mit dem Overlay-Ansatz unmountet nichts — der gesamte Wissensnetz-
 * Zustand bleibt exakt erhalten, es gibt nichts wiederherzustellen.
 * `createPortal` nach `document.body`, weil der Karten-Container weiter unten
 * bewusst `overflow-hidden` hat (rundet die Ecken) — ein normales absolutes
 * Overlay würde daran geclippt, ein Portal umgeht das sauber.
 *
 * Phase 4 ("Verwandte Konzepte") — `onSelectNode` ruft nur `selectNode()`
 * auf, denselben Selektionswechsel, den ein Klick auf den Node im Canvas
 * ohnehin auslöst. Kein Sondercode nötig, damit Zoom/Pan dabei unverändert
 * bleiben — GraphCanvas unmountet nicht, und Auswahländerungen bewegen die
 * Kamera schon heute nirgends.
 */

interface GraphSystemProps {
  userId?: string;
  collections: Collection[];
  activeModuleId?: string | null;
  documents: ProcessedDocument[];
  getDocumentSource: (doc: ProcessedDocument) => GenerationSource;
  /** Identisch zur Reader-Verdrahtung in AppContent.tsx — der Reader bleibt
   *  der Reader, sein "Erklären"-Sprung zu Feynman verlässt bewusst das
   *  Wissensnetz (fachweite Aktion, kein Sonderverhalten hier). */
  onStartFeynman: (topic: string | null) => void;
  /** Direktstart von einer Dokument-Aktionskarte (SourceDetailPage) — springt
   *  zum Wissensnetz DIESES Fachs, legt aber bewusst nichts automatisch an
   *  (KI/Automatik schreibt nie in den Graphen, s. services/graph/graphMutationService.ts). */
  initialDoc?: ProcessedDocument;
}

export const GraphSystem: React.FC<GraphSystemProps> = ({
  userId, collections, activeModuleId, documents, getDocumentSource, onStartFeynman, initialDoc,
}) => {
  const { t } = useTranslation();

  const effectiveCollectionId = initialDoc?.collectionId ?? activeModuleId ?? undefined;
  const scope: GraphScope = effectiveCollectionId
    ? { kind: 'collection', collectionId: effectiveCollectionId }
    : { kind: 'all' };
  const activeCollection = effectiveCollectionId
    ? collections.find(c => c.id === effectiveCollectionId)
    : undefined;

  const graph = useKnowledgeGraph({ scope, userId });

  // Welches Dokument gerade im Reader-Overlay offen ist — nur eine ID, damit
  // sich das offene Dokument beim Umbenennen/Neuladen der documents-Liste
  // automatisch mit aktualisiert (kein veralteter, eingefrorener Snapshot).
  const [openDocumentId, setOpenDocumentId] = useState<string | null>(null);
  const openDocument = documents.find(d => d.id === openDocumentId);

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
                documents={documents}
                onChange={graph.onChange}
                onEntityChanged={graph.onEntityChanged}
                onClose={() => graph.onSelectionChange(clearSelection(graph.selection))}
                onOpenDocument={setOpenDocumentId}
                onSelectNode={id => graph.onSelectionChange(selectNode(graph.selection, id))}
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

      {openDocument && createPortal(
        <div className="fixed inset-0 z-50 bg-white dark:bg-slate-900">
          <React.Suspense fallback={null}>
            {shouldUsePdfReader(openDocument) ? (
              <PdfSplitScreenReader
                key={`graph-pdf-reader-${openDocument.id}`}
                doc={openDocument}
                userId={userId}
                onBack={() => setOpenDocumentId(null)}
                onStartFeynman={onStartFeynman}
                getDocumentSource={getDocumentSource}
              />
            ) : (
              <SplitScreenReader
                key={`graph-reader-${openDocument.id}`}
                doc={openDocument}
                userId={userId}
                onBack={() => setOpenDocumentId(null)}
                onStartFeynman={onStartFeynman}
              />
            )}
          </React.Suspense>
        </div>,
        document.body,
      )}
    </div>
  );
};
