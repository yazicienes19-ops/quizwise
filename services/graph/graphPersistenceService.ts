import type { GraphState, GraphNode, GraphEdge, GraphRelationType, GraphNodeDocumentRef } from './types';
import * as sync from './graphSyncService';

/**
 * Verbindet GraphMutationService (In-Memory) mit GraphSyncService (Netzwerk):
 * nach jeder Mutation wird sowohl der lokale Cache als auch der Netzwerk-Push
 * geplant. Bewusst GETRENNT von GraphSyncService (s. KNOWLEDGE_GRAPH_PHASE1_PLAN.md)
 * — Sync kennt nur "wie synchronisiere ich", nicht "wann committe ich nach
 * einer UI-Aktion".
 *
 * KORREKTUR gegenüber der ursprünglichen Formulierung der Phase-1-Planung
 * ("schreibt sofort in den localStorage-Cache, nur der Push ist gedebounced"):
 * Der lokale Cache-Write UND der Push laufen im selben Debounce-Fenster.
 * Grund: ein "sofortiger" Write würde bei jeder Mutation den KOMPLETTEN
 * GraphState neu serialisieren und synchron in localStorage schreiben — bei
 * tausenden Nodes blockiert das bei jedem Tastenanschlag in einem Textfeld
 * den Main Thread. Das widerspräche der Normalisierung des GraphState, deren
 * ganzer Sinn war, genau solche Vollzustands-Schreibvorgänge zu vermeiden.
 * Ein Aufrufer, der wirklich ohne Verzögerung committen will (z.B. Drag-Ende),
 * übergibt `debounceMs: 0`.
 *
 * Debounce ist PRO ENTITÄT (nicht global) — mehrere schnell aufeinander-
 * folgende Änderungen an DEMSELBEN Node/derselben Kante werden zu einem
 * einzigen Commit zusammengefasst; Änderungen an UNTERSCHIEDLICHEN Entitäten
 * blockieren sich nicht gegenseitig.
 */

interface PendingCommit {
  timer: ReturnType<typeof setTimeout>;
  run: () => void;
}

const pending = new Map<string, PendingCommit>();

function scheduleCommit(key: string, delayMs: number, run: () => void): void {
  const existing = pending.get(key);
  if (existing) clearTimeout(existing.timer);

  if (delayMs <= 0) {
    pending.delete(key);
    run();
    return;
  }

  const timer = setTimeout(() => {
    pending.delete(key);
    run();
  }, delayMs);
  pending.set(key, { timer, run });
}

/** Führt einen noch ausstehenden, gedebounceten Commit sofort aus — z.B. beim
 *  Verlassen der Seite oder Wechsel des Fach-Scopes, damit die letzte
 *  Änderung innerhalb des Debounce-Fensters nicht verloren geht. */
export function flushPendingCommit(key: string): void {
  const existing = pending.get(key);
  if (!existing) return;
  clearTimeout(existing.timer);
  pending.delete(key);
  existing.run();
}

export function flushAllPendingCommits(): void {
  for (const key of [...pending.keys()]) flushPendingCommit(key);
}

/** Nur für Tests: true, wenn für den gegebenen Key aktuell ein Commit ansteht. */
export function hasPendingCommit(key: string): boolean {
  return pending.has(key);
}

const DEFAULT_DEBOUNCE_MS = 400;

export interface CommitOptions {
  /** undefined = kein eingeloggter Nutzer → nur lokaler Cache, kein Push. */
  userId?: string;
  /** 0 = sofort (z.B. Drag-Ende, Blur, Löschen). Default 400ms, wie das
   *  bestehende MindmapEditor-Autosave-Muster dieser App. */
  debounceMs?: number;
}

// Jede commit*-Funktion markiert SOFORT, synchron, außerhalb des Debounce
// (sync.markPending) — nicht erst im gedebouncten run(). Grund: genau die
// Zeitspanne, die der Debounce absichtlich offen lässt, ist die Zeitspanne,
// in der ein Crash/Tab-Close sonst spurlos eine Änderung verlieren würde.
// Ein Pending-Write-Eintrag ist klein und billig — anders als saveCachedState
// gibt es keinen Performance-Grund, ihn zu verzögern (s. graphSyncService.ts).
// clearPending läuft erst NACH erfolgreichem Push; schlägt der Push fehl,
// bleibt der Eintrag stehen und wird beim nächsten pullSince/retryPendingWrites
// erneut versucht statt stillschweigend verloren zu gehen.

export function commitNode(node: GraphNode, state: GraphState, options: CommitOptions = {}): void {
  sync.markPending(state.scope, options.userId, 'node', node.id, 'upsert');
  scheduleCommit(`node:${node.id}`, options.debounceMs ?? DEFAULT_DEBOUNCE_MS, () => {
    sync.saveCachedState(state, options.userId);
    if (options.userId) {
      sync.pushNode(node, options.userId)
        .then(() => sync.clearPending(state.scope, options.userId, 'node', node.id))
        .catch(() => {});
    }
  });
}

/**
 * Fix für den im Architektur-Review vom 2026-08-02 gefundenen Bug: purgeNode
 * hat zuvor NUR den In-Memory-State bereinigt — die DB-Zeile blieb
 * (archiviert) bestehen und wurde vom nächsten pullSince (includeArchived:
 * true) zurückgeholt, der "endgültig gelöschte" Node kam also wieder. Diese
 * Funktion committet den tatsächlichen Hard Delete UND markiert ihn als
 * pending, bis er bestätigt ist — schließt damit auch die Race Condition,
 * bei der ein Pull während eines noch nicht durchgekommenen Deletes den Node
 * erneut aus der (noch existierenden) Cloud-Zeile geholt hätte
 * (s. pullSince/retryPendingWrites in graphSyncService.ts).
 *
 * debounceMs default 0 (wie commitDeleteRelationType) — Löschen ist eine
 * diskrete, bereits per Zweitaktion bestätigte Aktion, kein Tipp-Strom, der
 * eine Verzögerung bräuchte.
 */
export function commitPurgeNode(nodeId: string, state: GraphState, options: CommitOptions = {}): void {
  sync.markPending(state.scope, options.userId, 'node', nodeId, 'delete');
  scheduleCommit(`node:${nodeId}`, options.debounceMs ?? 0, () => {
    sync.saveCachedState(state, options.userId);
    if (options.userId) {
      sync.pushDeleteNode(nodeId, options.userId)
        .then(() => sync.clearPending(state.scope, options.userId, 'node', nodeId))
        .catch(() => {});
    }
  });
}

export function commitEdge(edge: GraphEdge, state: GraphState, options: CommitOptions = {}): void {
  sync.markPending(state.scope, options.userId, 'edge', edge.id, 'upsert');
  scheduleCommit(`edge:${edge.id}`, options.debounceMs ?? DEFAULT_DEBOUNCE_MS, () => {
    sync.saveCachedState(state, options.userId);
    if (options.userId) {
      sync.pushEdge(edge, options.userId)
        .then(() => sync.clearPending(state.scope, options.userId, 'edge', edge.id))
        .catch(() => {});
    }
  });
}

export function commitRelationType(relationType: GraphRelationType, state: GraphState, options: CommitOptions = {}): void {
  sync.markPending(state.scope, options.userId, 'relationType', relationType.id, 'upsert');
  scheduleCommit(`relationType:${relationType.id}`, options.debounceMs ?? DEFAULT_DEBOUNCE_MS, () => {
    sync.saveCachedState(state, options.userId);
    if (options.userId) {
      sync.pushRelationType(relationType, options.userId)
        .then(() => sync.clearPending(state.scope, options.userId, 'relationType', relationType.id))
        .catch(() => {});
    }
  });
}

/** Löschen ist eine diskrete, bewusste Aktion (kein Tipp-Strom) — Aufrufer
 *  werden hier typischerweise debounceMs: 0 verwenden, die Funktion erzwingt
 *  das aber nicht (derselbe generische Mechanismus wie überall sonst). */
export function commitDeleteRelationType(relationTypeId: string, state: GraphState, options: CommitOptions = {}): void {
  sync.markPending(state.scope, options.userId, 'relationType', relationTypeId, 'delete');
  scheduleCommit(`relationType:${relationTypeId}`, options.debounceMs ?? 0, () => {
    sync.saveCachedState(state, options.userId);
    if (options.userId) {
      sync.pushDeleteRelationType(relationTypeId, options.userId)
        .then(() => sync.clearPending(state.scope, options.userId, 'relationType', relationTypeId))
        .catch(() => {});
    }
  });
}

export function commitNodeDocumentRef(ref: GraphNodeDocumentRef, state: GraphState, options: CommitOptions = {}): void {
  sync.markPending(state.scope, options.userId, 'nodeDocumentRef', ref.id, 'upsert');
  scheduleCommit(`nodeDocumentRef:${ref.id}`, options.debounceMs ?? DEFAULT_DEBOUNCE_MS, () => {
    sync.saveCachedState(state, options.userId);
    if (options.userId) {
      sync.pushNodeDocumentRef(ref, options.userId)
        .then(() => sync.clearPending(state.scope, options.userId, 'nodeDocumentRef', ref.id))
        .catch(() => {});
    }
  });
}

export function commitRemoveNodeDocumentRef(refId: string, state: GraphState, options: CommitOptions = {}): void {
  sync.markPending(state.scope, options.userId, 'nodeDocumentRef', refId, 'delete');
  scheduleCommit(`nodeDocumentRef:${refId}`, options.debounceMs ?? 0, () => {
    sync.saveCachedState(state, options.userId);
    if (options.userId) {
      sync.pushDeleteNodeDocumentRef(refId, options.userId)
        .then(() => sync.clearPending(state.scope, options.userId, 'nodeDocumentRef', refId))
        .catch(() => {});
    }
  });
}

// ─── Auto-Flush bei Tab-Wechsel/-Schließen ──────────────────────────────────
//
// Der 400ms-Debounce ist ein bewusster Performance/Datensicherheit-Kompromiss
// (s. Datei-Kommentar oben) — dieser Abschnitt verkleinert das Restrisiko
// zusätzlich: Verlässt der Nutzer den Tab, während ein Commit noch im
// Debounce-Fenster hängt, wird er sofort ausgelöst statt zu verfallen.
//
// WICHTIG, ehrlich dokumentiert: Das GARANTIERT nur den LOKALEN Cache-Write
// (saveCachedState ist synchron, läuft immer zu Ende, auch beim Unload).
// Der Netzwerk-Push (pushNode/pushEdge/…) ist ein normaler async fetch-Aufruf
// ohne `keepalive` — der Browser kann ihn beim tatsächlichen Schließen der
// Seite abbrechen, bevor die Antwort da ist. "Möglichst keine Daten
// verlieren" heißt hier konkret: die letzte Änderung landet zuverlässig im
// localStorage-Cache (und damit beim nächsten App-Start wieder im State),
// die Cloud-Synchronisation dieser letzten Änderung ist Best-Effort, kein
// Versprechen — ein echtes Zustellungs-Garantie bräuchte sendBeacon/fetch
// keepalive, was hier bewusst nicht nachgerüstet wird (Supabase-js' internem
// fetch lässt sich das nicht ohne Weiteres unterschieben).
//
// Kein automatisches Registrieren beim bloßen Import dieser Datei — das wäre
// in Tests und im späteren React-Lifecycle schwer kontrollierbar. Aufrufer
// (künftig: App-Bootstrap/useKnowledgeGraph-Hook) rufen initAutoFlush() genau
// einmal auf und verwenden die zurückgegebene Funktion zum Aufräumen.

export function initAutoFlush(): () => void {
  const handleVisibilityChange = () => {
    if (document.visibilityState === 'hidden') flushAllPendingCommits();
  };
  // pagehide ist die zuverlässigere, moderne Alternative zu 'unload' (feuert
  // u.a. auch bei bfcache-Navigationen auf Mobile/Safari, wo 'unload' oft gar
  // nicht ausgelöst wird).
  const handlePageHide = () => flushAllPendingCommits();
  // beforeunload NUR als zusätzliches Netz für Browser/Situationen, in denen
  // pagehide nicht feuert — bewusst kein Rückgabewert/Dialog, wir wollen den
  // Nutzer nicht am Verlassen hindern, nur die letzte Änderung anstoßen.
  const handleBeforeUnload = () => flushAllPendingCommits();

  document.addEventListener('visibilitychange', handleVisibilityChange);
  window.addEventListener('pagehide', handlePageHide);
  window.addEventListener('beforeunload', handleBeforeUnload);

  return () => {
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    window.removeEventListener('pagehide', handlePageHide);
    window.removeEventListener('beforeunload', handleBeforeUnload);
  };
}
