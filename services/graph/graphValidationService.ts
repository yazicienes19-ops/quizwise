import type {
  GraphState, GraphRelationType, ValidationResult,
  CreateNodeInput, UpdateNodeInput, CreateEdgeInput, CreateRelationTypeInput,
} from './types';
import { type GraphIndex, outgoingEdges } from './graphIndex';

/**
 * Reine, synchrone Prüf-Funktionen — kein I/O. Deckt insbesondere die Regeln
 * ab, die die Datenbank NICHT prüfen kann (s. KNOWLEDGE_GRAPH_PHASE1_PLAN.md
 * Abschnitt 1): symmetrische Beziehungstypen nicht in Gegenrichtung doppelt
 * (bräuchte eine Subquery in einem CHECK-Constraint, geht in SQL nicht),
 * plus sofortiges Feedback ohne Server-Round-Trip für Prüfungen, die die DB
 * zwar auch absichert (Titel nicht leer, keine Selbstschleife), aber erst
 * nach einem Insert/Update meldet.
 *
 * Wird von GraphMutationService aufgerufen, bevor eine Mutation angewendet
 * wird — genau das ist die technische Grenze, an der eine künftige KI-
 * Vorschlagsfunktion (Phase 4) vorbeimuss wie jede manuelle Aktion auch.
 */

// ─── Einzel-Prüfungen (atomar, auch für eine spätere Live-UI-Validierung nutzbar) ──

export function validateTitle(title: string): ValidationResult {
  if (title.trim().length === 0) return { valid: false, reason: 'Titel darf nicht leer sein.' };
  return { valid: true };
}

export function validateNotSelfLoop(sourceNodeId: string, targetNodeId: string): ValidationResult {
  if (sourceNodeId === targetNodeId) {
    return { valid: false, reason: 'Ein Node kann nicht mit sich selbst verbunden werden.' };
  }
  return { valid: true };
}

export function validateEdgeEndpointsExist(state: GraphState, sourceNodeId: string, targetNodeId: string): ValidationResult {
  const source = state.nodesById.get(sourceNodeId);
  const target = state.nodesById.get(targetNodeId);
  if (!source || source.archivedAt !== undefined) {
    return { valid: false, reason: 'Der Ausgangsknoten existiert nicht oder ist archiviert.' };
  }
  if (!target || target.archivedAt !== undefined) {
    return { valid: false, reason: 'Der Zielknoten existiert nicht oder ist archiviert.' };
  }
  return { valid: true };
}

export function validateRelationTypeExists(state: GraphState, relationTypeId: string): ValidationResult {
  if (!state.relationTypesById.has(relationTypeId)) {
    return { valid: false, reason: 'Dieser Beziehungstyp existiert nicht.' };
  }
  return { valid: true };
}

const activeEdgesBetween = (
  index: GraphIndex, sourceNodeId: string, targetNodeId: string, relationTypeId: string, excludeEdgeId?: string,
) => outgoingEdges(index, sourceNodeId).filter(
  e => e.targetNodeId === targetNodeId && e.relationTypeId === relationTypeId && e.id !== excludeEdgeId,
);

/** Verhindert eine inhaltlich doppelte aktive Kante — bei symmetrischen Typen
 *  zählt die Gegenrichtung als dieselbe Aussage (s. graphIndex.ts). `excludeEdgeId`
 *  wird beim Umbenennen/Retypen einer bestehenden Kante gebraucht, damit sie
 *  nicht sich selbst als Duplikat erkennt. */
export function validateNoDuplicateEdge(
  index: GraphIndex,
  sourceNodeId: string,
  targetNodeId: string,
  relationType: GraphRelationType,
  excludeEdgeId?: string,
): ValidationResult {
  const forward = activeEdgesBetween(index, sourceNodeId, targetNodeId, relationType.id, excludeEdgeId);
  const reverse = relationType.symmetric
    ? activeEdgesBetween(index, targetNodeId, sourceNodeId, relationType.id, excludeEdgeId)
    : [];

  if (forward.length === 0 && reverse.length === 0) return { valid: true };

  return {
    valid: false,
    reason: relationType.symmetric
      ? `Diese Beziehung ("${relationType.label}") besteht zwischen diesen beiden Nodes bereits.`
      : `Eine Kante mit dem Beziehungstyp "${relationType.label}" zwischen diesen beiden Nodes in dieser Richtung existiert bereits.`,
  };
}

export function validateRelationTypeLabelUnique(state: GraphState, label: string, excludeRelationTypeId?: string): ValidationResult {
  const trimmed = label.trim();
  if (trimmed.length === 0) return { valid: false, reason: 'Beziehungstyp braucht eine Bezeichnung.' };
  // Eindeutigkeit gilt nur unter den EIGENEN Typen (DB-Constraint ist
  // UNIQUE(user_id, label)) — eingebaute (globale) Typen dürfen denselben
  // Wortlaut tragen, ohne dass das hier als Konflikt zählt.
  const collides = [...state.relationTypesById.values()].some(
    rt => !rt.isBuiltIn && rt.id !== excludeRelationTypeId && rt.label.trim().toLowerCase() === trimmed.toLowerCase(),
  );
  if (collides) return { valid: false, reason: `Ein eigener Beziehungstyp namens "${trimmed}" existiert bereits.` };
  return { valid: true };
}

export function validateRelationTypeDeletable(state: GraphState, index: GraphIndex, relationTypeId: string): ValidationResult {
  const relationType = state.relationTypesById.get(relationTypeId);
  if (!relationType) return { valid: false, reason: 'Dieser Beziehungstyp existiert nicht.' };
  if (relationType.isBuiltIn) {
    return { valid: false, reason: 'Eingebaute Beziehungstypen können nicht gelöscht werden.' };
  }
  const usedByCount = [...state.edgesById.values()].filter(
    e => e.archivedAt === undefined && e.relationTypeId === relationTypeId,
  ).length;
  if (usedByCount > 0) {
    return {
      valid: false,
      reason: `Wird noch von ${usedByCount} Kante${usedByCount === 1 ? '' : 'n'} verwendet — erst diese entfernen oder umhängen.`,
    };
  }
  return { valid: true };
}

// ─── Zusammengesetzte Validierungen (von GraphMutationService verwendet) ─────

export function validateCreateNode(input: CreateNodeInput): ValidationResult {
  return validateTitle(input.title);
}

export function validateUpdateNode(patch: UpdateNodeInput): ValidationResult {
  if (patch.title !== undefined) return validateTitle(patch.title);
  return { valid: true };
}

export function validateCreateEdge(state: GraphState, index: GraphIndex, input: CreateEdgeInput): ValidationResult {
  const selfLoop = validateNotSelfLoop(input.sourceNodeId, input.targetNodeId);
  if (!selfLoop.valid) return selfLoop;

  const endpoints = validateEdgeEndpointsExist(state, input.sourceNodeId, input.targetNodeId);
  if (!endpoints.valid) return endpoints;

  const typeExists = validateRelationTypeExists(state, input.relationTypeId);
  if (!typeExists.valid) return typeExists;

  const relationType = state.relationTypesById.get(input.relationTypeId)!;
  return validateNoDuplicateEdge(index, input.sourceNodeId, input.targetNodeId, relationType);
}

/** Beim Ändern des Beziehungstyps einer bestehenden Kante — Endpunkte bleiben
 *  gleich, nur die Duplikat-Prüfung gegen den NEUEN Typ ist relevant. */
export function validateRetypeEdge(
  state: GraphState,
  index: GraphIndex,
  edgeId: string,
  sourceNodeId: string,
  targetNodeId: string,
  newRelationTypeId: string,
): ValidationResult {
  const typeExists = validateRelationTypeExists(state, newRelationTypeId);
  if (!typeExists.valid) return typeExists;

  const relationType = state.relationTypesById.get(newRelationTypeId)!;
  return validateNoDuplicateEdge(index, sourceNodeId, targetNodeId, relationType, edgeId);
}

export function validateCreateRelationType(state: GraphState, input: CreateRelationTypeInput): ValidationResult {
  return validateRelationTypeLabelUnique(state, input.label);
}
