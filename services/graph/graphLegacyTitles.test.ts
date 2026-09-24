import { describe, it, expect } from 'vitest';
import { createEmptyGraphState } from './types';
import { createNode, archiveNode } from './graphMutationService';
import { isLegacyDefaultTitle, renameLegacyDefaultTitles } from './graphLegacyTitles';

const build = (titles: string[]) => {
  let state = createEmptyGraphState({ kind: 'all' });
  const ids: string[] = [];
  for (const title of titles) {
    const r = createNode(state, { title, position: { x: 0, y: 0 } });
    state = r.state;
    ids.push(r.entity!.id);
  }
  return { state, ids };
};

describe('isLegacyDefaultTitle', () => {
  it('erkennt alte Standardtitel unabhängig von Groß-/Kleinschreibung', () => {
    expect(isLegacyDefaultTitle('Neuer Node')).toBe(true);
    expect(isLegacyDefaultTitle(' new node ')).toBe(true);
    expect(isLegacyDefaultTitle('Neues Konzept')).toBe(false);
    expect(isLegacyDefaultTitle('Neuer Node über Lernen')).toBe(false);
  });
});

describe('renameLegacyDefaultTitles', () => {
  it('benennt nur Konzepte mit altem Standardtitel um und zählt die Version hoch', () => {
    const { state, ids } = build(['Neuer Node', 'Konditionierung', 'New node']);
    const { state: next, renamed } = renameLegacyDefaultTitles(state, 'Neues Konzept');
    expect(renamed.map(n => n.id).sort()).toEqual([ids[0], ids[2]].sort());
    expect(next.nodesById.get(ids[0])!.title).toBe('Neues Konzept');
    expect(next.nodesById.get(ids[0])!.version).toBe(state.nodesById.get(ids[0])!.version + 1);
    expect(next.nodesById.get(ids[1])!.title).toBe('Konditionierung');
  });

  it('lässt archivierte Konzepte in Ruhe und ist beim zweiten Lauf wirkungslos', () => {
    const { state, ids } = build(['Neuer Node', 'Neuer Node']);
    const archived = archiveNode(state, ids[1]).state;
    const first = renameLegacyDefaultTitles(archived, 'Neues Konzept');
    expect(first.renamed).toHaveLength(1);
    expect(first.state.nodesById.get(ids[1])!.title).toBe('Neuer Node');
    const second = renameLegacyDefaultTitles(first.state, 'Neues Konzept');
    expect(second.renamed).toHaveLength(0);
    expect(second.state).toBe(first.state);
  });
});
