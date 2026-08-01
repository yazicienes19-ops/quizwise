/**
 * Domain-Modelle des Knowledge Graph (Phase 2 — reine TypeScript-Domain,
 * kein React, kein Supabase-Import). Feldbegründungen: KNOWLEDGE_GRAPH_PHASE1_PLAN.md
 * Abschnitt 2. DB-Spalten ↔ Domain-Feld-Mapping (null↔undefined,
 * position_x/position_y↔position) passiert ausschließlich in GraphRepository —
 * hier gelten durchgehend die App-üblichen `undefined`-Optionals, keine `null`s.
 */

// ─── Kern-Entitäten ──────────────────────────────────────────────────────────

/** Offener String statt Enum — bewusst flexibel, s. Konzeptdokument. Nur eine
 *  Vorschlagsliste für die künftige UI, keine Durchsetzung im Domain-Modell. */
export type GraphNodeType = string;

export const SUGGESTED_NODE_TYPES: readonly GraphNodeType[] = [
  'begriff', 'theorie', 'definition', 'formel', 'prozess', 'person', 'beispiel', 'ereignis',
];

export interface GraphNodePosition {
  x: number;
  y: number;
}

export interface GraphNode {
  id: string;
  collectionId?: string;
  type: GraphNodeType;
  title: string;
  description: string;
  notes: string;
  color?: string;
  icon?: string;
  tags: string[];
  position: GraphNodePosition;
  /** Reserviert für Phase 2 (Auto-Layout) — in dieser Phase von keinem Code gelesen,
   *  s. Begründung in KNOWLEDGE_GRAPH_PHASE1_PLAN.md (Spalte jetzt anlegen ist
   *  kostenlos, eine spätere Migration wäre es nicht). */
  pinned: boolean;
  /** undefined = aktiv. Gesetzt = archiviert UND Sync-Tombstone in einem Feld
   *  (ms-Timestamp, konsistent mit createdAt/updatedAt). */
  archivedAt?: number;
  /** Wird ausschließlich von der Datenbank (Trigger) vergeben, nie vom Client
   *  geschrieben. In Phase 2 nur zu Diagnosezwecken gelesen. */
  version: number;
  createdAt: number;
  updatedAt: number;
}

export interface GraphEdge {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  relationTypeId: string;
  /** Freitext-Override zum Anzeigenamen des Beziehungstyps. */
  label?: string;
  archivedAt?: number;
  version: number;
  createdAt: number;
  updatedAt: number;
}

export interface GraphRelationType {
  id: string;
  /** undefined = global/eingebaut (sichtbar für alle, nicht editierbar/löschbar
   *  außer per Migration). Gesetzt = eigener, nutzerdefinierter Typ. */
  userId?: string;
  label: string;
  /** Anzeige in Gegenrichtung bei gerichteten Typen (z.B. "baut auf … auf" zu
   *  "Voraussetzung von"). Phase-2-Feld ohne Konsumenten vor der UI-Phase. */
  inverseLabel?: string;
  symmetric: boolean;
  color?: string;
  icon?: string;
  isBuiltIn: boolean;
  sortOrder: number;
  createdAt: number;
}

export interface GraphNodeDocumentRef {
  id: string;
  nodeId: string;
  documentId: string;
  excerpt?: string;
  page?: number;
  createdAt: number;
}

// ─── Lesemodelle (Projektionen, keine eigene Speicherform) ──────────────────
//
// GraphState (unten) hält vollständige GraphNode-Objekte — es gibt in der
// reinen Domain-Schicht (noch keine UI, noch kein Rendering) keinen Grund,
// Speicherformen aufzuspalten. GraphNodeSummary/-ComputedMetadata sind
// Projektionen für eine künftige Query-/Selector-Schicht (z.B. den späteren
// React-Hook, der beim Rendern tausender Nodes nur die schlanke Form braucht)
// — eine bewusste Präzisierung gegenüber dem Wortlaut der Phase-1-Planung,
// die das noch als zwei getrennte Speicherformen beschrieb. Die eigentliche
// Trennung (schlank fürs Kanvas, voll nur fürs geöffnete Panel) entsteht erst
// dort, wo sie einen echten Effekt hat: in GraphRepository (unterschiedliche
// SELECT-Spaltenlisten) und in der späteren UI-Schicht.

export interface GraphNodeSummary {
  id: string;
  title: string;
  type: GraphNodeType;
  color?: string;
  icon?: string;
  position: GraphNodePosition;
  tags: string[];
}

export const toGraphNodeSummary = (node: GraphNode): GraphNodeSummary => ({
  id: node.id,
  title: node.title,
  type: node.type,
  color: node.color,
  icon: node.icon,
  position: node.position,
  tags: node.tags,
});

/** Abgeleitete, nie persistierte Werte — werden aus dem bereits geladenen
 *  GraphState (Kanten) sowie aus linkedNodeIds-Feldern anderer Lernartefakte
 *  berechnet, nicht am Node gespeichert (vermeidet Schreib-Amplifikation und
 *  eine zweite Wahrheitsquelle, s. Konzeptdokument Abschnitt 5/14). */
export interface GraphNodeComputedMetadata {
  nodeId: string;
  incomingEdgeCount: number;
  outgoingEdgeCount: number;
  linkedDocumentCount: number;
}

// ─── Normalisiertes In-Memory-Aggregat ──────────────────────────────────────
//
// Kein `graphs`-Tabelle/-Entität — ein "Graph" ist die Menge aller aktiven
// Nodes/Edges eines Scopes, also eine Query, keine eigene Zeile (Begründung:
// KNOWLEDGE_GRAPH_PHASE1_PLAN.md Abschnitt 2). GraphState ist rein clientseitig.

/** 'all' ist bewusst vom Fall "Node hat kein Fach" (GraphNode.collectionId
 *  === undefined) unterschieden — ein nullable String für beides hätte diese
 *  zwei unterschiedlichen Dinge (kein Fach zugewiesen vs. Gesamtansicht über
 *  alle Fächer) vermischt. */
export type GraphScope =
  | { kind: 'collection'; collectionId: string }
  | { kind: 'all' };

export interface GraphState {
  scope: GraphScope;
  nodesById: Map<string, GraphNode>;
  edgesById: Map<string, GraphEdge>;
  relationTypesById: Map<string, GraphRelationType>;
}

export const createEmptyGraphState = (scope: GraphScope): GraphState => ({
  scope,
  nodesById: new Map(),
  edgesById: new Map(),
  relationTypesById: new Map(),
});

// ─── Command-Input-Typen (Mutation-Aufrufe) ─────────────────────────────────

export interface CreateNodeInput {
  collectionId?: string;
  type?: GraphNodeType;
  title: string;
  description?: string;
  notes?: string;
  color?: string;
  icon?: string;
  tags?: string[];
  position: GraphNodePosition;
}

export type UpdateNodeInput = Partial<
  Pick<GraphNode, 'collectionId' | 'type' | 'title' | 'description' | 'notes' | 'color' | 'icon' | 'tags' | 'position' | 'pinned'>
>;

export interface CreateEdgeInput {
  sourceNodeId: string;
  targetNodeId: string;
  relationTypeId: string;
  label?: string;
}

export type UpdateEdgeInput = Partial<Pick<GraphEdge, 'relationTypeId' | 'label'>>;

export interface CreateRelationTypeInput {
  label: string;
  inverseLabel?: string;
  symmetric?: boolean;
  color?: string;
  icon?: string;
  sortOrder?: number;
}

export type UpdateRelationTypeInput = Partial<Pick<GraphRelationType, 'label' | 'inverseLabel' | 'symmetric' | 'color' | 'icon' | 'sortOrder'>>;

// ─── Ergebnis-Konventionen ───────────────────────────────────────────────────
//
// Diese Codebase hat kein etabliertes Result<T,E>-Muster (Validierung anderswo
// normalisiert/verwirft still, z.B. quizNormalize.ts — passend für KI-Output,
// aber ungeeignet für nutzerausgelöste Graph-Aktionen, die einen verständlichen
// Ablehnungsgrund brauchen). ValidationResult ist deshalb eine bewusste, neue,
// aber minimale Konvention nur für diesen Feature-Bereich.

export type ValidationResult =
  | { valid: true }
  | { valid: false; reason: string };

/**
 * Rückgabeform jeder GraphMutationService-Funktion. Bei Ablehnung ist `state`
 * IMMER der unveränderte Eingabe-State (Konvention wie mindmapTree.ts'
 * moveNode: niemals eine Exception für eine erwartbare, normale Ablehnung wie
 * "doppelte Kante"), `entity` bleibt undefined, `error` trägt den Grund.
 * Bei Erfolg ist `entity` die konkret erzeugte/geänderte Entität — praktisch für
 * GraphHistoryService (Vorher/Nachher für die inverse Operation) und
 * GraphPersistenceService (weiß ohne Diff, was genau zu persistieren ist).
 */
export interface MutationResult<TEntity> {
  state: GraphState;
  entity?: TEntity;
  error?: string;
}
