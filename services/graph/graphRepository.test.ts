import { describe, it, expect } from 'vitest';
import {
  rowToNode, nodeToRow, rowToEdge, edgeToRow,
  rowToRelationType, relationTypeToRow, rowToNodeDocumentRef, nodeDocumentRefToRow,
} from './graphRepository';
import type { GraphNode, GraphEdge, GraphRelationType, GraphNodeDocumentRef } from './types';

/**
 * Nur die reinen Mapping-Funktionen (rowToX/xToRow) werden hier getestet —
 * die eigentlichen Supabase-Aufrufe bleiben ungetestet, konsistent mit dieser
 * Codebase (mindmapService.ts & Co. haben ebenfalls keine Tests). Begründung
 * s. Kommentar in graphRepository.ts.
 */

describe('rowToNode', () => {
  it('mappt eine vollständige DB-Zeile korrekt, inkl. position_x/y → position', () => {
    const row = {
      id: 'n1', collection_id: 'col-1', type: 'begriff', title: 'Falsifikation',
      description: 'Beschreibung', notes: 'Notiz', color: '#fff', icon: 'brain',
      tags: ['popper'], position_x: 12.5, position_y: -3, pinned: true,
      archived_at: '2026-01-01T00:00:00.000Z', version: 4,
      created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-02T00:00:00.000Z',
    };
    const node = rowToNode(row);
    expect(node.position).toEqual({ x: 12.5, y: -3 });
    expect(node.collectionId).toBe('col-1');
    expect(node.archivedAt).toBe(new Date('2026-01-01T00:00:00.000Z').getTime());
    expect(node.updatedAt).toBe(new Date('2026-01-02T00:00:00.000Z').getTime());
  });

  it('übersetzt DB-NULL zu undefined statt null durchzureichen', () => {
    const row = {
      id: 'n1', collection_id: null, type: 'begriff', title: 'X', description: '', notes: '',
      color: null, icon: null, tags: null, position_x: 0, position_y: 0, pinned: false,
      archived_at: null, version: 1, created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z',
    };
    const node = rowToNode(row);
    expect(node.collectionId).toBeUndefined();
    expect(node.color).toBeUndefined();
    expect(node.icon).toBeUndefined();
    expect(node.archivedAt).toBeUndefined();
    expect(node.tags).toEqual([]); // null → leeres Array, nie null im Domain-Modell
  });
});

describe('nodeToRow', () => {
  it('mappt zurück auf DB-Spalten und sendet weder updated_at, version noch created_at mit', () => {
    const node: GraphNode = {
      id: 'n1', type: 'begriff', title: 'X', description: '', notes: '', tags: [],
      position: { x: 5, y: 9 }, pinned: false, version: 3, createdAt: 0, updatedAt: 0,
    };
    const row = nodeToRow(node, 'user-1');
    expect(row.position_x).toBe(5);
    expect(row.position_y).toBe(9);
    expect(row.user_id).toBe('user-1');
    expect(row).not.toHaveProperty('updated_at');
    expect(row).not.toHaveProperty('version');
    expect(row).not.toHaveProperty('created_at');
  });

  it('übersetzt undefined zu null (DB-Spalten sind nullable, nicht optional)', () => {
    const node: GraphNode = {
      id: 'n1', type: 'begriff', title: 'X', description: '', notes: '', tags: [],
      position: { x: 0, y: 0 }, pinned: false, version: 1, createdAt: 0, updatedAt: 0,
    };
    const row = nodeToRow(node, 'user-1');
    expect(row.collection_id).toBeNull();
    expect(row.color).toBeNull();
    expect(row.icon).toBeNull();
    expect(row.archived_at).toBeNull();
  });

  it('Rundreise rowToNode(nodeToRow(x)) erhält alle für die Domain relevanten Felder', () => {
    const original: GraphNode = {
      id: 'n1', collectionId: 'col-1', type: 'theorie', title: 'X', description: 'D', notes: 'N',
      color: '#abc', icon: 'atom', tags: ['a', 'b'], position: { x: 1, y: 2 }, pinned: true,
      archivedAt: 1700000000000, version: 1, createdAt: 0, updatedAt: 0,
    };
    const row: any = nodeToRow(original, 'user-1');
    // Simuliert, was die DB nach dem Insert/Trigger zurückgeben würde
    row.version = 7;
    row.created_at = '2026-01-01T00:00:00.000Z';
    row.updated_at = '2026-01-02T00:00:00.000Z';
    const roundTripped = rowToNode(row);

    expect(roundTripped.collectionId).toBe(original.collectionId);
    expect(roundTripped.title).toBe(original.title);
    expect(roundTripped.tags).toEqual(original.tags);
    expect(roundTripped.position).toEqual(original.position);
    expect(roundTripped.pinned).toBe(original.pinned);
    expect(roundTripped.archivedAt).toBe(original.archivedAt);
    expect(roundTripped.version).toBe(7); // autoritativer Server-Wert, nicht der lokale
  });
});

describe('rowToEdge / edgeToRow', () => {
  it('mappt Kanten-Spalten korrekt in beide Richtungen', () => {
    const edge: GraphEdge = {
      id: 'e1', sourceNodeId: 'a', targetNodeId: 'b', relationTypeId: 'rel-1',
      label: 'Sonderfall', version: 2, createdAt: 0, updatedAt: 0,
    };
    const row = edgeToRow(edge, 'user-1');
    expect(row.source_node_id).toBe('a');
    expect(row.target_node_id).toBe('b');
    expect(row).not.toHaveProperty('updated_at');

    const back = rowToEdge({ ...row, id: 'e1', version: 2, created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z' });
    expect(back.sourceNodeId).toBe('a');
    expect(back.label).toBe('Sonderfall');
  });

  it('archivedAt undefined ↔ archived_at null', () => {
    const edge: GraphEdge = { id: 'e1', sourceNodeId: 'a', targetNodeId: 'b', relationTypeId: 'rel-1', version: 1, createdAt: 0, updatedAt: 0 };
    expect(edgeToRow(edge, 'u').archived_at).toBeNull();
    expect(rowToEdge({ id: 'e1', source_node_id: 'a', target_node_id: 'b', relation_type_id: 'rel-1', label: null, archived_at: null, version: 1, created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z' }).archivedAt).toBeUndefined();
  });
});

describe('rowToRelationType / relationTypeToRow', () => {
  it('mappt user_id NULL (eingebauter Typ) zu userId undefined', () => {
    const row = {
      id: 'rel-1', user_id: null, label: 'Voraussetzung von', inverse_label: 'baut auf … auf',
      symmetric: false, color: null, icon: null, is_built_in: true, sort_order: 2,
      created_at: '2026-01-01T00:00:00.000Z',
    };
    const relationType = rowToRelationType(row);
    expect(relationType.userId).toBeUndefined();
    expect(relationType.isBuiltIn).toBe(true);
    expect(relationType.inverseLabel).toBe('baut auf … auf');
  });

  it('relationTypeToRow markiert eigene Typen immer als is_built_in: false', () => {
    const relationType: GraphRelationType = {
      id: 'rel-1', label: 'Analogie zu', symmetric: false, isBuiltIn: false, sortOrder: 0, createdAt: 0,
    };
    const row = relationTypeToRow(relationType, 'user-1');
    expect(row.is_built_in).toBe(false);
    expect(row.user_id).toBe('user-1');
  });
});

describe('rowToNodeDocumentRef / nodeDocumentRefToRow', () => {
  it('mappt Zitat-Verknüpfung inkl. optionaler Felder', () => {
    const ref: GraphNodeDocumentRef = {
      id: 'ref-1', nodeId: 'n1', documentId: 'doc-1', excerpt: 'Ein Zitat', page: 12, createdAt: 0,
    };
    const row = nodeDocumentRefToRow(ref, 'user-1');
    expect(row.excerpt).toBe('Ein Zitat');
    expect(row.page).toBe(12);

    const back = rowToNodeDocumentRef({ ...row, created_at: '2026-01-01T00:00:00.000Z' });
    expect(back.excerpt).toBe('Ein Zitat');
    expect(back.page).toBe(12);
  });

  it('fehlende optionale Felder werden zu null (Row) bzw. undefined (Domain)', () => {
    const ref: GraphNodeDocumentRef = { id: 'ref-1', nodeId: 'n1', documentId: 'doc-1', createdAt: 0 };
    const row = nodeDocumentRefToRow(ref, 'user-1');
    expect(row.excerpt).toBeNull();
    expect(row.page).toBeNull();

    const back = rowToNodeDocumentRef({ ...row, created_at: '2026-01-01T00:00:00.000Z' });
    expect(back.excerpt).toBeUndefined();
    expect(back.page).toBeUndefined();
  });
});
