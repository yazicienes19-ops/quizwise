import { describe, it, expect } from 'vitest';
import {
  computeForceLayout, computeBounds, findOverlapClusters, resolveOverlaps, type LayoutNodeInput,
} from './graphLayoutEngine';

const node = (id: string, x: number, y: number, pinned = false): LayoutNodeInput => ({
  id, position: { x, y }, pinned,
});

describe('computeForceLayout', () => {
  it('liefert eine leere Map für einen leeren Graphen', () => {
    expect(computeForceLayout([], []).size).toBe(0);
  });

  it('hält einen gepinnten Node exakt an seiner Ausgangsposition', () => {
    const nodes = [node('a', 0, 0, true), node('b', 500, 500)];
    const result = computeForceLayout(nodes, [{ sourceNodeId: 'a', targetNodeId: 'b' }]);
    expect(result.get('a')).toEqual({ x: 0, y: 0 });
  });

  it('hält einen in fixedIds übergebenen Node exakt an seiner Ausgangsposition, auch wenn er nicht pinned ist', () => {
    const nodes = [node('a', 10, 20), node('b', 500, 500)];
    const result = computeForceLayout(nodes, [], new Set(['a']));
    expect(result.get('a')).toEqual({ x: 10, y: 20 });
  });

  it('bewegt zwei anfangs überlappende, unverbundene Nodes auseinander (Abstoßung)', () => {
    const nodes = [node('a', 0, 0), node('b', 0.001, 0.001)];
    const result = computeForceLayout(nodes, []);
    const a = result.get('a')!;
    const b = result.get('b')!;
    const distance = Math.hypot(a.x - b.x, a.y - b.y);
    expect(distance).toBeGreaterThan(10);
  });

  it('zieht durch eine Kante verbundene Nodes in eine plausible Nähe zueinander (nicht beliebig weit auseinander)', () => {
    const nodes = [node('a', -1000, 0), node('b', 1000, 0)];
    const result = computeForceLayout(nodes, [{ sourceNodeId: 'a', targetNodeId: 'b' }]);
    const a = result.get('a')!;
    const b = result.get('b')!;
    const distance = Math.hypot(a.x - b.x, a.y - b.y);
    expect(distance).toBeLessThan(500); // deutlich näher als die Startdistanz von 2000
  });
});

describe('computeBounds', () => {
  it('liefert undefined für eine leere Positions-Map', () => {
    expect(computeBounds(new Map())).toBeUndefined();
  });

  it('berechnet die Bounding Box inkl. Padding', () => {
    const positions = new Map([['a', { x: 0, y: 0 }], ['b', { x: 100, y: 50 }]]);
    const bounds = computeBounds(positions, 10);
    expect(bounds).toEqual({ minX: -10, minY: -10, maxX: 110, maxY: 60 });
  });
});

describe('findOverlapClusters', () => {
  it('findet keine Cluster, wenn alle Nodes unterscheidbare Positionen haben', () => {
    const nodes = [node('a', 0, 0), node('b', 100, 100)];
    expect(findOverlapClusters(nodes)).toEqual([]);
  });

  it('gruppiert exakt überlappende Nodes', () => {
    const nodes = [node('a', 0, 0), node('b', 0, 0), node('c', 500, 500)];
    const clusters = findOverlapClusters(nodes);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].sort()).toEqual(['a', 'b']);
  });

  it('ignoriert gepinnte Nodes auch bei exakter Überlappung', () => {
    const nodes = [node('a', 0, 0, true), node('b', 0, 0, true)];
    expect(findOverlapClusters(nodes)).toEqual([]);
  });

  it('behandelt eine gemischte Gruppe: gepinnter Overlap-Partner bildet mit dem Rest kein Cluster', () => {
    const nodes = [node('a', 0, 0), node('b', 0, 0, true)];
    expect(findOverlapClusters(nodes)).toEqual([]); // 'a' allein ist kein Cluster (Größe 1)
  });
});

describe('resolveOverlaps', () => {
  it('lässt bereits unterscheidbare, nicht gepinnte Positionen komplett unverändert', () => {
    const nodes = [node('a', 0, 0), node('b', 300, 300)];
    const result = resolveOverlaps(nodes, []);
    expect(result.get('a')).toEqual({ x: 0, y: 0 });
    expect(result.get('b')).toEqual({ x: 300, y: 300 });
  });

  it('lässt einen gepinnten Node auch dann unverändert, wenn er mit anderen überlappt', () => {
    const nodes = [node('a', 0, 0, true), node('b', 0, 0, true)];
    const result = resolveOverlaps(nodes, []);
    expect(result.get('a')).toEqual({ x: 0, y: 0 });
    expect(result.get('b')).toEqual({ x: 0, y: 0 });
  });

  it('entzerrt exakt überlappende Nodes, ohne einen unbeteiligten, entfernten Node zu verschieben', () => {
    const nodes = [node('a', 0, 0), node('b', 0, 0), node('anchor', 900, 900)];
    const result = resolveOverlaps(nodes, []);

    expect(result.get('anchor')).toEqual({ x: 900, y: 900 }); // unbeteiligt, exakt unverändert

    const a = result.get('a')!;
    const b = result.get('b')!;
    const distance = Math.hypot(a.x - b.x, a.y - b.y);
    expect(distance).toBeGreaterThan(5); // nicht mehr überlappend
  });
});
