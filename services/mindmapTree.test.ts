import { describe, it, expect } from 'vitest';
import {
  markdownToTree, addChild, deleteNode, updateNodeText, moveNode, isDescendant, findNode,
  addSiblingAfter, indentNode, outdentNode, findParent,
  serializeMindmap, deserializeMindmap, updateNodeColor, toggleCollapsed, pruneCollapsed,
} from './mindmapTree';

const LIVE_EXAMPLE = '# Wahrnehmung\n\n## eee 1\n## eeee';

describe('markdownToTree (Rückwärtskompatibilität mit altem Heading-Format)', () => {
  it('parst das echte Live-Beispiel korrekt', () => {
    const tree = markdownToTree(LIVE_EXAMPLE);
    expect(tree.text).toBe('Wahrnehmung');
    expect(tree.children.map(c => c.text)).toEqual(['eee 1', 'eeee']);
    expect(tree.children[0].children).toEqual([]);
  });

  it('parst mehrstufige Verschachtelung (### unter ##)', () => {
    const md = '# Thema\n## A\n### A1\n### A2\n## B';
    const tree = markdownToTree(md);
    expect(tree.children.map(c => c.text)).toEqual(['A', 'B']);
    expect(tree.children[0].children.map(c => c.text)).toEqual(['A1', 'A2']);
  });

  it('gibt einen leeren Root zurück bei leerem String', () => {
    const tree = markdownToTree('');
    expect(tree.text).toBe('');
    expect(tree.children).toEqual([]);
  });
});

describe('serializeMindmap / deserializeMindmap', () => {
  it('Rundreise über JSON erhält Text, Farbe und Einklapp-Status', () => {
    const tree = markdownToTree('# Thema\n## A\n## B');
    const withExtras = toggleCollapsed(updateNodeColor(tree, tree.children[0].id, '#f97316'), tree.children[1].id);
    const roundTripped = deserializeMindmap(serializeMindmap(withExtras));
    expect(roundTripped).toEqual(withExtras);
  });

  it('liest bestehende Bestandsmindmaps (reines Heading-Markdown von vor dieser Funktion) weiterhin korrekt', () => {
    const tree = deserializeMindmap(LIVE_EXAMPLE);
    expect(tree.text).toBe('Wahrnehmung');
    expect(tree.children.map(c => c.text)).toEqual(['eee 1', 'eeee']);
  });

  it('fällt bei kaputtem JSON auf das Markdown-Parsing zurück statt zu crashen', () => {
    const tree = deserializeMindmap('{nicht valides json');
    expect(tree.text).toBe('');
  });
});

describe('updateNodeColor / toggleCollapsed / pruneCollapsed', () => {
  it('updateNodeColor ändert nur den Ziel-Knoten', () => {
    const tree = markdownToTree('# Thema\n## A\n## B');
    const next = updateNodeColor(tree, tree.children[0].id, '#f97316');
    expect(next.children[0].color).toBe('#f97316');
    expect(next.children[1].color).toBeUndefined();
  });

  it('updateNodeColor mit undefined setzt die Farbe zurück', () => {
    const tree = updateNodeColor(markdownToTree('# Thema\n## A'), markdownToTree('# Thema\n## A').children[0].id, '#f97316');
    const nodeA = tree.children[0];
    const reset = updateNodeColor(tree, nodeA.id, undefined);
    expect(reset.children[0].color).toBeUndefined();
  });

  it('toggleCollapsed kippt den Status bei jedem Aufruf', () => {
    const tree = markdownToTree('# Thema\n## A');
    const collapsed = toggleCollapsed(tree, tree.id);
    expect(collapsed.collapsed).toBe(true);
    const expanded = toggleCollapsed(collapsed, tree.id);
    expect(expanded.collapsed).toBe(false);
  });

  it('pruneCollapsed blendet Kinder eines eingeklappten Knotens aus, ändert aber nicht den Originalbaum', () => {
    const tree = markdownToTree('# Thema\n## A\n### A1\n## B');
    const nodeA = tree.children[0];
    const collapsed = toggleCollapsed(tree, nodeA.id);
    const pruned = pruneCollapsed(collapsed);
    expect(pruned.children.find(c => c.id === nodeA.id)?.children).toEqual([]);
    // Originalbaum (vor pruneCollapsed) bleibt unangetastet
    expect(collapsed.children.find(c => c.id === nodeA.id)?.children).toHaveLength(1);
  });
});

describe('Baum-Mutationen', () => {
  it('addChild fügt einen leeren Kind-Knoten hinzu und liefert dessen ID', () => {
    const tree = markdownToTree('# Thema\n## A');
    const { tree: next, newNodeId } = addChild(tree, tree.id);
    expect(next.children).toHaveLength(2);
    expect(next.children[1].id).toBe(newNodeId);
    expect(next.children[1].text).toBe('');
  });

  it('updateNodeText ändert nur den Ziel-Knoten', () => {
    const tree = markdownToTree('# Thema\n## A\n## B');
    const nodeA = tree.children[0];
    const next = updateNodeText(tree, nodeA.id, 'A geändert');
    expect(next.children[0].text).toBe('A geändert');
    expect(next.children[1].text).toBe('B');
  });

  it('deleteNode entfernt den Knoten samt Subtree', () => {
    const tree = markdownToTree('# Thema\n## A\n### A1\n## B');
    const nodeA = tree.children[0];
    const next = deleteNode(tree, nodeA.id);
    expect(next.children.map(c => c.text)).toEqual(['B']);
  });

  it('deleteNode löscht den Root-Knoten NICHT', () => {
    const tree = markdownToTree('# Thema\n## A');
    const next = deleteNode(tree, tree.id);
    expect(next).toEqual(tree);
  });

  it('moveNode hängt einen Knoten unter einen anderen Elternknoten um', () => {
    const tree = markdownToTree('# Thema\n## A\n## B');
    const [nodeA, nodeB] = tree.children;
    const next = moveNode(tree, nodeA.id, nodeB.id);
    expect(next.children.map(c => c.text)).toEqual(['B']);
    expect(next.children[0].children.map(c => c.text)).toEqual(['A']);
  });

  it('moveNode verhindert einen Zyklus (Ziel ist eigener Nachfahre)', () => {
    const tree = markdownToTree('# Thema\n## A\n### A1');
    const nodeA = tree.children[0];
    const nodeA1 = nodeA.children[0];
    const next = moveNode(tree, nodeA.id, nodeA1.id);
    expect(next).toEqual(tree);
  });

  it('moveNode verschiebt den Root-Knoten NICHT', () => {
    const tree = markdownToTree('# Thema\n## A');
    const next = moveNode(tree, tree.id, tree.children[0].id);
    expect(next).toEqual(tree);
  });

  it('moveNode ist ein No-Op wenn Knoten und Ziel identisch sind', () => {
    const tree = markdownToTree('# Thema\n## A\n## B');
    const nodeA = tree.children[0];
    const next = moveNode(tree, nodeA.id, nodeA.id);
    expect(next).toEqual(tree);
  });
});

describe('isDescendant / findNode', () => {
  it('erkennt echte Nachfahren korrekt', () => {
    const tree = markdownToTree('# Thema\n## A\n### A1');
    const nodeA = tree.children[0];
    const nodeA1 = nodeA.children[0];
    expect(isDescendant(tree, nodeA.id, nodeA1.id)).toBe(true);
    expect(isDescendant(tree, nodeA1.id, nodeA.id)).toBe(false);
  });

  it('findNode findet verschachtelte Knoten per ID', () => {
    const tree = markdownToTree('# Thema\n## A\n### A1');
    const nodeA1 = tree.children[0].children[0];
    expect(findNode(tree, nodeA1.id)?.text).toBe('A1');
    expect(findNode(tree, 'nicht-vorhanden')).toBeUndefined();
  });
});

describe('addSiblingAfter / indentNode / outdentNode (Gliederungs-Editor)', () => {
  it('addSiblingAfter fügt einen leeren Knoten direkt nach dem Ziel ein', () => {
    const tree = markdownToTree('# Thema\n## A\n## B');
    const nodeA = tree.children[0];
    const { tree: next, newNodeId } = addSiblingAfter(tree, nodeA.id);
    expect(next.children.map(c => c.id)).toEqual([nodeA.id, newNodeId, tree.children[1].id]);
  });

  it('addSiblingAfter fügt beim Root ein erstes Kind ein', () => {
    const tree = markdownToTree('# Thema\n## A');
    const { tree: next, newNodeId } = addSiblingAfter(tree, tree.id);
    expect(next.children[0].id).toBe(newNodeId);
    expect(next.children[1].text).toBe('A');
  });

  it('indentNode macht den Knoten zum Kind des vorherigen Geschwisters', () => {
    const tree = markdownToTree('# Thema\n## A\n## B');
    const [nodeA, nodeB] = tree.children;
    const next = indentNode(tree, nodeB.id);
    expect(next.children.map(c => c.text)).toEqual(['A']);
    expect(next.children[0].children.map(c => c.text)).toEqual(['B']);
    // ID-Stabilität: nodeA behält seine ID
    expect(next.children[0].id).toBe(nodeA.id);
  });

  it('indentNode ist ein No-Op wenn direkt davor nur der eigene Elternteil steht', () => {
    const tree = markdownToTree('# Thema\n## A\n## B');
    const nodeA = tree.children[0];
    const next = indentNode(tree, nodeA.id);
    expect(next).toEqual(tree);
  });

  it('indentNode nutzt die tatsächlich vorherige (auch tiefere) Zeile als neuen Elternteil, nicht nur das direkte Geschwister — sonst lassen sich Äste nicht über eine Ebene hinaus vertiefen', () => {
    const tree = markdownToTree('# Thema\n## A\n### A1\n#### A2\n## B');
    const nodeA2 = tree.children[0].children[0].children[0];
    const nodeB = tree.children[1];
    const next = indentNode(tree, nodeB.id);
    // B hängt jetzt unter A2 (Tiefe 4), nicht nur unter A (seinem direkten Geschwister, Tiefe 1)
    expect(next.children).toHaveLength(1);
    expect(next.children[0].children[0].children[0].children.map(c => c.text)).toEqual(['B']);
    expect(next.children[0].children[0].children[0].id).toBe(nodeA2.id);
  });

  it('outdentNode hebt den Knoten eine Ebene, direkt nach seinem alten Elternteil', () => {
    const tree = markdownToTree('# Thema\n## A\n### A1\n## B');
    const nodeA = tree.children[0];
    const nodeA1 = nodeA.children[0];
    const next = outdentNode(tree, nodeA1.id);
    expect(next.children.map(c => c.text)).toEqual(['A', 'A1', 'B']);
    expect(next.children[0].children).toEqual([]);
  });

  it('outdentNode ist ein No-Op wenn der Elternteil bereits der Root ist', () => {
    const tree = markdownToTree('# Thema\n## A');
    const nodeA = tree.children[0];
    const next = outdentNode(tree, nodeA.id);
    expect(next).toEqual(tree);
  });

  it('indentNode gefolgt von outdentNode ergibt wieder den Ausgangszustand (Reihenfolge)', () => {
    const tree = markdownToTree('# Thema\n## A\n## B');
    const nodeB = tree.children[1];
    const indented = indentNode(tree, nodeB.id);
    const restored = outdentNode(indented, nodeB.id);
    expect(restored.children.map(c => c.text)).toEqual(['A', 'B']);
  });

  it('findParent liefert undefined für den Root selbst', () => {
    const tree = markdownToTree('# Thema\n## A');
    expect(findParent(tree, tree.id)).toBeUndefined();
    expect(findParent(tree, tree.children[0].id)).toEqual({ parentId: tree.id, index: 0 });
  });
});
