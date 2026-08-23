import { useCallback, useEffect, useRef, useState } from 'react';
import type { GraphState, GraphScope, GraphEntityChange } from '../services/graph/types';
import { createEmptyHistory, undo as undoHistory, redo as redoHistory, type GraphHistory } from '../services/graph/graphHistoryService';
import { createEmptySelection, type GraphSelectionState } from '../services/graph/graphSelectionService';
import * as sync from '../services/graph/graphSyncService';
import * as persistence from '../services/graph/graphPersistenceService';

/**
 * Application-Schicht — der einzige Ort, der GraphCanvas (UI) mit
 * GraphSyncService/GraphPersistenceService (Infrastructure) verbindet.
 * GraphCanvas selbst bleibt unverändert: kennt weiterhin weder Supabase noch
 * Repository noch Sync, bekommt ausschließlich die Werte/Callbacks, die
 * dieser Hook bereitstellt (s. KNOWLEDGE_GRAPH_PHASE1_PLAN.md Abschnitt 5,
 * Layer-Diagramm).
 *
 * Bewusst KEIN GraphProvider/Context — es gibt aktuell genau einen
 * Konsumenten (GraphDevHarness), kein Prop-Drilling-Problem zu lösen. Ein
 * Context kommt erst, wenn mehrere gleichzeitig sichtbare Bereiche
 * parallelen Lesezugriff brauchen (ebenfalls in Abschnitt 5 so vorgesehen).
 *
 * Bewusst KEINE spekulative Aktions-API (kein archiveNode/purgeNode/
 * Beziehungstyp-CRUD als exponierte Funktion) — GraphCanvas löst aktuell nur
 * Node-/Kantenerstellung und Verschieben aus. undo/redo sind exponiert, weil
 * der bestehende Dev-Harness bereits Buttons dafür hat.
 *
 * Bewusst KEIN Polling/Refresh-Loop — nur initiales Laden bei Mount bzw.
 * Scope-/User-Wechsel.
 */

export interface UseKnowledgeGraphOptions {
  scope: GraphScope;
  /** undefined = kein eingeloggter Nutzer → rein lokaler Cache, kein Pull/Push. */
  userId?: string;
}

export interface UseKnowledgeGraphResult {
  state: GraphState;
  history: GraphHistory;
  selection: GraphSelectionState;
  /** true während des initialen Ladens (Cache-Read + ggf. Cloud-Pull). */
  loading: boolean;
  /** Nur für einen fehlgeschlagenen INITIALEN Pull gesetzt. Fehlgeschlagene
   *  Autosave-Pushes bleiben bewusst still — dafür sorgt bereits das
   *  Pending-Write-Tracking (Retry beim nächsten pullSince), kein
   *  zusätzliches Fehler-UI nötig. */
  error?: string;
  onChange: (next: { state: GraphState; history: GraphHistory }) => void;
  onSelectionChange: (next: GraphSelectionState) => void;
  onEntityChanged: (change: GraphEntityChange) => void;
  undo: () => void;
  redo: () => void;
}

// Session-lokaler In-Memory-Cache der Undo-History pro Scope. Ein Tab-Wechsel
// unmountet GraphSystem (und damit den Hook) — ohne Cache wäre jede Undo-
// Fähigkeit beim Zurückkehren weg, obwohl der Nutzer nur kurz woanders
// geschaut hat. Bewusst KEIN localStorage: HistoryEntry besteht aus Closures
// und ist laut graphHistoryService.ts bewusst sessionlokal/nicht serialisierbar.
const historyCacheByScope = new Map<string, GraphHistory>();

export function useKnowledgeGraph({ scope, userId }: UseKnowledgeGraphOptions): UseKnowledgeGraphResult {
  const [state, setState] = useState<GraphState>(() => sync.loadCachedState(scope, userId));
  const [history, setHistory] = useState<GraphHistory>(createEmptyHistory);
  const [selection, setSelection] = useState<GraphSelectionState>(createEmptySelection);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>(undefined);

  // Synchron mitgeführte Kopie des aktuellen State. onEntityChanged braucht
  // beim Autosave immer den frischesten Stand — aber onChange (setState) und
  // onEntityChanged sind zwei getrennte Callbacks, die GraphCanvas synchron
  // kurz hintereinander aufruft (z.B. bei Node-Erstellung). React-State-
  // Updates sind asynchron; ein Zugriff über die geschlossene `state`-
  // Variable würde in onEntityChanged noch den VORHERIGEN Stand liefern,
  // nicht den gerade erst von onChange gesetzten.
  const stateRef = useRef(state);

  const scopeIdentity = sync.scopeKey(scope);

  // Initiales Laden: sofort der lokale Cache (Local-First), danach — falls
  // eingeloggt — ein inkrementeller Pull im Hintergrund.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(undefined);

    const cached = sync.loadCachedState(scope, userId);
    stateRef.current = cached;
    setState(cached);
    setHistory(historyCacheByScope.get(scopeIdentity) ?? createEmptyHistory());
    setSelection(createEmptySelection());

    // Egal ob eingeloggt oder rein lokal: ein Scope-/User-Wechsel darf einen
    // gerade erst gedebouncten Commit nicht liegen lassen, bis sein Timer
    // irgendwann von selbst abläuft. GraphPersistenceService.commitX markiert
    // eine Änderung als pending UNABHÄNGIG von userId (nur der tatsächliche
    // Netzwerk-Push entfällt ohne userId, der lokale Cache-Write bleibt
    // gedebouncet) — beide Zweige brauchen deshalb denselben Flush-Cleanup.
    const cleanup = () => {
      cancelled = true;
      persistence.flushAllPendingCommits();
    };

    if (!userId) {
      setLoading(false);
      return cleanup;
    }

    sync.pullSince(userId, scope)
      .then(merged => {
        if (cancelled) return;
        stateRef.current = merged;
        setState(merged);
      })
      .catch(err => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return cleanup;
    // scopeIdentity ist die stabile Primitiv-Repräsentation von `scope`
    // (Objekt-Referenz wäre bei jedem Render neu und würde den Effekt
    // dauerhaft neu auslösen).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeIdentity, userId]);

  // Tab-Wechsel/-Schließen soll einen offenen Commit auch außerhalb eines
  // Scope-Wechsels auslösen (s. graphPersistenceService.ts) — bisher rief
  // das niemand auf.
  useEffect(() => persistence.initAutoFlush(), []);

  const onChange = useCallback((next: { state: GraphState; history: GraphHistory }) => {
    stateRef.current = next.state;
    setState(next.state);
    setHistory(next.history);
    historyCacheByScope.set(sync.scopeKey(scope), next.history);
  }, [sync, scope]);

  const onEntityChanged = useCallback((change: GraphEntityChange) => {
    // 'relationType' kam mit Phase 5A Punkt 5 dazu (GraphCanvas legt jetzt
    // bei Bedarf spontan einen neuen Beziehungstyp an, wenn der Nutzer eine
    // noch unbekannte Bezeichnung eingibt) — commitRelationType existierte
    // in GraphPersistenceService bereits seit Phase 2, war bis hierher aber
    // von nichts aufgerufen worden. 'nodeDocumentRef' kam mit Phase 3
    // ("Eigene Unterlagen") dazu — commitNodeDocumentRef/
    // commitRemoveNodeDocumentRef existierten ebenfalls schon seit Phase 2,
    // ebenfalls bis hierher ungenutzt.
    if (change.kind === 'node') {
      persistence.commitNode(change.entity, stateRef.current, { userId });
    } else if (change.kind === 'edge') {
      persistence.commitEdge(change.entity, stateRef.current, { userId });
    } else if (change.kind === 'relationType') {
      persistence.commitRelationType(change.entity, stateRef.current, { userId });
    } else if (change.action === 'create') {
      persistence.commitNodeDocumentRef(change.entity, stateRef.current, { userId });
    } else {
      persistence.commitRemoveNodeDocumentRef(change.entity.id, stateRef.current, { userId });
    }
  }, [userId]);

  const undo = useCallback(() => {
    const result = undoHistory(history, state);
    stateRef.current = result.state;
    setState(result.state);
    setHistory(result.history);
  }, [history, state]);

  const redo = useCallback(() => {
    const result = redoHistory(history, state);
    stateRef.current = result.state;
    setState(result.state);
    setHistory(result.history);
  }, [history, state]);

  return {
    state, history, selection, loading, error,
    onChange, onSelectionChange: setSelection, onEntityChanged, undo, redo,
  };
}
