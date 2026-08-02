import { describe, it, expect } from 'vitest';
import {
  createEmptySelection, selectNode, selectEdge, clearSelection, hoverNode,
  setFocus, clearFocus, isSelected, isEdgeSelected, isHovered,
} from './graphSelectionService';

describe('createEmptySelection', () => {
  it('hat keine Auswahl, keinen Hover, keinen Fokus', () => {
    const selection = createEmptySelection();
    expect(selection.selectedNodeId).toBeUndefined();
    expect(selection.hoveredNodeId).toBeUndefined();
    expect(selection.focus).toBeUndefined();
  });
});

describe('selectNode / clearSelection / isSelected', () => {
  it('wählt einen Node aus und erkennt ihn als ausgewählt', () => {
    const selection = selectNode(createEmptySelection(), 'n1');
    expect(isSelected(selection, 'n1')).toBe(true);
    expect(isSelected(selection, 'n2')).toBe(false);
  });

  it('ersetzt eine bestehende Auswahl durch eine neue (immer nur ein selektierter Node)', () => {
    const selection = selectNode(selectNode(createEmptySelection(), 'n1'), 'n2');
    expect(selection.selectedNodeId).toBe('n2');
  });

  it('clearSelection hebt die Auswahl auf, ohne Hover/Fokus zu berühren', () => {
    let selection = selectNode(createEmptySelection(), 'n1');
    selection = hoverNode(selection, 'n2');
    selection = clearSelection(selection);
    expect(selection.selectedNodeId).toBeUndefined();
    expect(selection.hoveredNodeId).toBe('n2');
  });

  it('verändert den ursprünglichen State nicht (Immutabilität)', () => {
    const before = createEmptySelection();
    selectNode(before, 'n1');
    expect(before.selectedNodeId).toBeUndefined();
  });
});

describe('selectEdge / isEdgeSelected', () => {
  it('wählt eine Kante aus und erkennt sie als ausgewählt', () => {
    const selection = selectEdge(createEmptySelection(), 'e1');
    expect(isEdgeSelected(selection, 'e1')).toBe(true);
    expect(isEdgeSelected(selection, 'e2')).toBe(false);
  });

  it('selectNode und selectEdge schließen sich gegenseitig aus (nie beides gleichzeitig)', () => {
    const nodeThenEdge = selectEdge(selectNode(createEmptySelection(), 'n1'), 'e1');
    expect(nodeThenEdge.selectedNodeId).toBeUndefined();
    expect(nodeThenEdge.selectedEdgeId).toBe('e1');

    const edgeThenNode = selectNode(selectEdge(createEmptySelection(), 'e1'), 'n1');
    expect(edgeThenNode.selectedEdgeId).toBeUndefined();
    expect(edgeThenNode.selectedNodeId).toBe('n1');
  });

  it('clearSelection hebt auch eine Kanten-Auswahl auf', () => {
    const selection = clearSelection(selectEdge(createEmptySelection(), 'e1'));
    expect(selection.selectedEdgeId).toBeUndefined();
  });
});

describe('hoverNode / isHovered', () => {
  it('setzt und löscht den Hover-Zustand (undefined = kein Hover)', () => {
    let selection = hoverNode(createEmptySelection(), 'n1');
    expect(isHovered(selection, 'n1')).toBe(true);
    selection = hoverNode(selection, undefined);
    expect(isHovered(selection, 'n1')).toBe(false);
  });
});

describe('setFocus / clearFocus', () => {
  it('setzt einen Fokus-Node mit Hop-Distanz und kann ihn wieder löschen', () => {
    let selection = setFocus(createEmptySelection(), 'n1', 2);
    expect(selection.focus).toEqual({ nodeId: 'n1', hops: 2 });
    selection = clearFocus(selection);
    expect(selection.focus).toBeUndefined();
  });
});
