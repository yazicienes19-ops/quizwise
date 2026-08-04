import { describe, it, expect } from 'vitest';
import { createEmptyGraphState, type GraphEdge, type GraphNode, type GraphRelationType } from './types';
import { buildGraphIndex } from './graphIndex';
import {
  validateTitle, validateNotSelfLoop, validateEdgeEndpointsExist,
  validateNoDuplicateEdge, validateRelationTypeLabelUnique, validateRelationTypeDeletable,
  validateCreateEdge, validateRetypeEdge, validateCreateRelationType,
} from './graphValidationService';

const makeNode = (id: string, overrides: Partial<GraphNode> = {}): GraphNode => ({
  id, type: 'begriff', title: id, description: '', notes: '', tags: [],
  position: { x: 0, y: 0 }, pinned: false, version: 1, createdAt: 0, updatedAt: 0,
  ...overrides,
});

const makeEdge = (id: string, sourceNodeId: string, targetNodeId: string, overrides: Partial<GraphEdge> = {}): GraphEdge => ({
  id, sourceNodeId, targetNodeId, relationTypeId: 'rel-1', version: 1, createdAt: 0, updatedAt: 0,
  ...overrides,
});

const makeRelationType = (id: string, overrides: Partial<GraphRelationType> = {}): GraphRelationType => ({
  id, label: id, symmetric: false, isBuiltIn: false, sortOrder: 0, createdAt: 0,
  ...overrides,
});

describe('validateTitle', () => {
  it('lehnt leeren und nur-Leerzeichen-Titel ab', () => {
    expect(validateTitle('').valid).toBe(false);
    expect(validateTitle('   ').valid).toBe(false);
  });
  it('akzeptiert einen echten Titel', () => {
    expect(validateTitle('Falsifikationsprinzip').valid).toBe(true);
  });
});

describe('validateNotSelfLoop', () => {
  it('lehnt identische Quelle/Ziel ab', () => {
    const result = validateNotSelfLoop('a', 'a');
    expect(result.valid).toBe(false);
  });
  it('akzeptiert unterschiedliche Nodes', () => {
    expect(validateNotSelfLoop('a', 'b').valid).toBe(true);
  });
});

describe('validateEdgeEndpointsExist', () => {
  it('lehnt ab, wenn ein Node nicht existiert', () => {
    const state = createEmptyGraphState({ kind: 'all' });
    state.nodesById.set('a', makeNode('a'));
    expect(validateEdgeEndpointsExist(state, 'a', 'ghost').valid).toBe(false);
  });
  it('lehnt ab, wenn ein Node archiviert ist', () => {
    const state = createEmptyGraphState({ kind: 'all' });
    state.nodesById.set('a', makeNode('a'));
    state.nodesById.set('b', makeNode('b', { archivedAt: 1 }));
    expect(validateEdgeEndpointsExist(state, 'a', 'b').valid).toBe(false);
  });
  it('akzeptiert zwei aktive, existierende Nodes', () => {
    const state = createEmptyGraphState({ kind: 'all' });
    state.nodesById.set('a', makeNode('a'));
    state.nodesById.set('b', makeNode('b'));
    expect(validateEdgeEndpointsExist(state, 'a', 'b').valid).toBe(true);
  });
});

describe('validateNoDuplicateEdge', () => {
  it('lehnt eine exakt identische aktive Kante (gleiche Richtung, gleicher Typ) ab', () => {
    const state = createEmptyGraphState({ kind: 'all' });
    state.nodesById.set('a', makeNode('a'));
    state.nodesById.set('b', makeNode('b'));
    state.edgesById.set('e1', makeEdge('e1', 'a', 'b', { relationTypeId: 'rel-1' }));
    const index = buildGraphIndex(state);
    const relType = makeRelationType('rel-1');

    expect(validateNoDuplicateEdge(index, 'a', 'b', relType).valid).toBe(false);
  });

  it('erlaubt denselben Knotenpaar mit einem ANDEREN Beziehungstyp (Multigraph)', () => {
    const state = createEmptyGraphState({ kind: 'all' });
    state.nodesById.set('a', makeNode('a'));
    state.nodesById.set('b', makeNode('b'));
    state.edgesById.set('e1', makeEdge('e1', 'a', 'b', { relationTypeId: 'rel-teil-von' }));
    const index = buildGraphIndex(state);
    const relTypeAnders = makeRelationType('rel-beispiel-fuer');

    expect(validateNoDuplicateEdge(index, 'a', 'b', relTypeAnders).valid).toBe(true);
  });

  it('erlaubt dieselbe Kante in umgekehrter Richtung bei NICHT-symmetrischem Typ', () => {
    const state = createEmptyGraphState({ kind: 'all' });
    state.nodesById.set('a', makeNode('a'));
    state.nodesById.set('b', makeNode('b'));
    state.edgesById.set('e1', makeEdge('e1', 'a', 'b', { relationTypeId: 'rel-1' }));
    const index = buildGraphIndex(state);
    const relType = makeRelationType('rel-1', { symmetric: false });

    expect(validateNoDuplicateEdge(index, 'b', 'a', relType).valid).toBe(true);
  });

  it('lehnt die umgekehrte Richtung bei SYMMETRISCHEM Typ ab (dieselbe Aussage)', () => {
    const state = createEmptyGraphState({ kind: 'all' });
    state.nodesById.set('a', makeNode('a'));
    state.nodesById.set('b', makeNode('b'));
    state.edgesById.set('e1', makeEdge('e1', 'a', 'b', { relationTypeId: 'rel-gegensatz' }));
    const index = buildGraphIndex(state);
    const relType = makeRelationType('rel-gegensatz', { symmetric: true, label: 'Gegensatz zu' });

    const result = validateNoDuplicateEdge(index, 'b', 'a', relType);
    expect(result.valid).toBe(false);
  });

  it('lässt ein archiviertes Duplikat wiederbeleben (nur AKTIVE Kanten zählen)', () => {
    const state = createEmptyGraphState({ kind: 'all' });
    state.nodesById.set('a', makeNode('a'));
    state.nodesById.set('b', makeNode('b'));
    state.edgesById.set('e1', makeEdge('e1', 'a', 'b', { relationTypeId: 'rel-1', archivedAt: 1 }));
    const index = buildGraphIndex(state);
    const relType = makeRelationType('rel-1');

    expect(validateNoDuplicateEdge(index, 'a', 'b', relType).valid).toBe(true);
  });

  it('excludeEdgeId: eine Kante darf sich selbst nicht als Duplikat erkennen (Retype-Fall)', () => {
    const state = createEmptyGraphState({ kind: 'all' });
    state.nodesById.set('a', makeNode('a'));
    state.nodesById.set('b', makeNode('b'));
    state.edgesById.set('e1', makeEdge('e1', 'a', 'b', { relationTypeId: 'rel-1' }));
    const index = buildGraphIndex(state);
    const relType = makeRelationType('rel-1');

    expect(validateNoDuplicateEdge(index, 'a', 'b', relType, 'e1').valid).toBe(true);
    // Ohne excludeEdgeId wäre dieselbe Prüfung eine Ablehnung:
    expect(validateNoDuplicateEdge(index, 'a', 'b', relType).valid).toBe(false);
  });

  it('excludeEdgeId schützt eine ANDERE, echte Duplikat-Kante nicht', () => {
    const state = createEmptyGraphState({ kind: 'all' });
    state.nodesById.set('a', makeNode('a'));
    state.nodesById.set('b', makeNode('b'));
    state.edgesById.set('e1', makeEdge('e1', 'a', 'b', { relationTypeId: 'rel-1' }));
    state.edgesById.set('e2', makeEdge('e2', 'a', 'b', { relationTypeId: 'rel-1' }));
    const index = buildGraphIndex(state);
    const relType = makeRelationType('rel-1');

    // e1 ausschließen, aber e2 existiert weiterhin als echtes Duplikat
    expect(validateNoDuplicateEdge(index, 'a', 'b', relType, 'e1').valid).toBe(false);
  });
});

describe('validateCreateEdge (Orchestrierung)', () => {
  const buildState = () => {
    const state = createEmptyGraphState({ kind: 'all' });
    state.nodesById.set('a', makeNode('a'));
    state.nodesById.set('b', makeNode('b'));
    state.relationTypesById.set('rel-1', makeRelationType('rel-1'));
    return state;
  };

  it('lehnt Selbstschleifen vor jeder anderen Prüfung ab', () => {
    const state = buildState();
    const index = buildGraphIndex(state);
    const result = validateCreateEdge(state, index, { sourceNodeId: 'a', targetNodeId: 'a', relationTypeId: 'rel-1' });
    expect(result.valid).toBe(false);
  });

  it('lehnt unbekannten Beziehungstyp ab', () => {
    const state = buildState();
    const index = buildGraphIndex(state);
    const result = validateCreateEdge(state, index, { sourceNodeId: 'a', targetNodeId: 'b', relationTypeId: 'unbekannt' });
    expect(result.valid).toBe(false);
  });

  it('akzeptiert eine gültige, neue Kante', () => {
    const state = buildState();
    const index = buildGraphIndex(state);
    const result = validateCreateEdge(state, index, { sourceNodeId: 'a', targetNodeId: 'b', relationTypeId: 'rel-1' });
    expect(result.valid).toBe(true);
  });

  it('akzeptiert eine neue Kante ohne Beziehungstyp', () => {
    const state = buildState();
    const index = buildGraphIndex(state);
    const result = validateCreateEdge(state, index, { sourceNodeId: 'a', targetNodeId: 'b', relationTypeId: undefined });
    expect(result.valid).toBe(true);
  });

  it('lehnt eine zweite unbenannte Kante zwischen denselben Nodes ab', () => {
    const state = buildState();
    state.edgesById.set('e1', makeEdge('e1', 'a', 'b', { relationTypeId: undefined }));
    const index = buildGraphIndex(state);
    const result = validateCreateEdge(state, index, { sourceNodeId: 'a', targetNodeId: 'b', relationTypeId: undefined });
    expect(result.valid).toBe(false);
  });

  it('erlaubt eine unbenannte Kante trotz bestehender benannter Kante zwischen denselben Nodes', () => {
    const state = buildState();
    state.edgesById.set('e1', makeEdge('e1', 'a', 'b', { relationTypeId: 'rel-1' }));
    const index = buildGraphIndex(state);
    const result = validateCreateEdge(state, index, { sourceNodeId: 'a', targetNodeId: 'b', relationTypeId: undefined });
    expect(result.valid).toBe(true);
  });
});

describe('validateRetypeEdge', () => {
  it('erlaubt das Umtypen, wenn der neue Typ noch keine Duplikat-Kante erzeugt', () => {
    const state = createEmptyGraphState({ kind: 'all' });
    state.nodesById.set('a', makeNode('a'));
    state.nodesById.set('b', makeNode('b'));
    state.relationTypesById.set('rel-neu', makeRelationType('rel-neu'));
    state.edgesById.set('e1', makeEdge('e1', 'a', 'b', { relationTypeId: 'rel-alt' }));
    const index = buildGraphIndex(state);

    const result = validateRetypeEdge(state, index, 'e1', 'a', 'b', 'rel-neu');
    expect(result.valid).toBe(true);
  });

  it('lehnt das Umtypen ab, wenn danach ein echtes Duplikat zu einer ANDEREN Kante entstünde', () => {
    const state = createEmptyGraphState({ kind: 'all' });
    state.nodesById.set('a', makeNode('a'));
    state.nodesById.set('b', makeNode('b'));
    state.relationTypesById.set('rel-ziel', makeRelationType('rel-ziel'));
    state.edgesById.set('e1', makeEdge('e1', 'a', 'b', { relationTypeId: 'rel-alt' }));
    state.edgesById.set('e2', makeEdge('e2', 'a', 'b', { relationTypeId: 'rel-ziel' }));
    const index = buildGraphIndex(state);

    const result = validateRetypeEdge(state, index, 'e1', 'a', 'b', 'rel-ziel');
    expect(result.valid).toBe(false);
  });
});

describe('validateRelationTypeLabelUnique', () => {
  it('lehnt ein Label ab, das bereits als EIGENER Typ existiert', () => {
    const state = createEmptyGraphState({ kind: 'all' });
    state.relationTypesById.set('rel-1', makeRelationType('rel-1', { label: 'Analogie zu', isBuiltIn: false }));
    expect(validateRelationTypeLabelUnique(state, 'Analogie zu').valid).toBe(false);
    expect(validateRelationTypeLabelUnique(state, 'analogie zu ').valid).toBe(false); // Groß-/Kleinschreibung + Whitespace
  });

  it('erlaubt denselben Wortlaut wie ein EINGEBAUTER (globaler) Typ', () => {
    const state = createEmptyGraphState({ kind: 'all' });
    state.relationTypesById.set('rel-built-in', makeRelationType('rel-built-in', { label: 'Ursache von', isBuiltIn: true }));
    expect(validateRelationTypeLabelUnique(state, 'Ursache von').valid).toBe(true);
  });

  it('erlaubt das Umbenennen eines Typs auf sein eigenes, unverändertes Label (excludeRelationTypeId)', () => {
    const state = createEmptyGraphState({ kind: 'all' });
    state.relationTypesById.set('rel-1', makeRelationType('rel-1', { label: 'Analogie zu', isBuiltIn: false }));
    expect(validateRelationTypeLabelUnique(state, 'Analogie zu', 'rel-1').valid).toBe(true);
  });
});

describe('validateRelationTypeDeletable', () => {
  it('lehnt das Löschen eingebauter Typen kategorisch ab', () => {
    const state = createEmptyGraphState({ kind: 'all' });
    state.relationTypesById.set('rel-1', makeRelationType('rel-1', { isBuiltIn: true }));
    const index = buildGraphIndex(state);
    expect(validateRelationTypeDeletable(state, index, 'rel-1').valid).toBe(false);
  });

  it('lehnt das Löschen ab, solange aktive Kanten den Typ verwenden', () => {
    const state = createEmptyGraphState({ kind: 'all' });
    state.nodesById.set('a', makeNode('a'));
    state.nodesById.set('b', makeNode('b'));
    state.relationTypesById.set('rel-1', makeRelationType('rel-1', { isBuiltIn: false }));
    state.edgesById.set('e1', makeEdge('e1', 'a', 'b', { relationTypeId: 'rel-1' }));
    const index = buildGraphIndex(state);
    expect(validateRelationTypeDeletable(state, index, 'rel-1').valid).toBe(false);
  });

  it('erlaubt das Löschen eines unbenutzten, eigenen Typs', () => {
    const state = createEmptyGraphState({ kind: 'all' });
    state.relationTypesById.set('rel-1', makeRelationType('rel-1', { isBuiltIn: false }));
    const index = buildGraphIndex(state);
    expect(validateRelationTypeDeletable(state, index, 'rel-1').valid).toBe(true);
  });
});

describe('validateCreateRelationType', () => {
  it('delegiert an die Label-Eindeutigkeitsprüfung', () => {
    const state = createEmptyGraphState({ kind: 'all' });
    state.relationTypesById.set('rel-1', makeRelationType('rel-1', { label: 'Analogie zu', isBuiltIn: false }));
    expect(validateCreateRelationType(state, { label: 'Analogie zu' }).valid).toBe(false);
    expect(validateCreateRelationType(state, { label: 'Neuer Typ' }).valid).toBe(true);
  });
});
