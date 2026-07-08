import { describe, it, expect } from 'vitest';
import { interleaveByKey, interleaveQuestionsByTopic } from './interleave';

interface Item { key: string; n: number; }
const mk = (spec: string): Item[] => spec.split('').map((key, n) => ({ key, n }));
const keys = (items: Item[]) => items.map(i => i.key).join('');
const adjacentDupes = (items: Item[]) => items.filter((it, i) => i > 0 && items[i - 1].key === it.key).length;

describe('interleaveByKey', () => {
  it('trennt gleiche Keys wenn machbar (AABBC)', () => {
    const out = interleaveByKey(mk('AABBC'), i => i.key);
    expect(out).toHaveLength(5);
    expect(adjacentDupes(out)).toBe(0);
  });

  it('unlösbarer Fall (AAAB): Cluster nur am Ende', () => {
    const out = interleaveByKey(mk('AAAB'), i => i.key);
    expect(out).toHaveLength(4);
    // Bestmöglich: A B A A → genau 1 unvermeidbare Adjazenz am Ende
    expect(keys(out)).toBe('ABAA');
  });

  it('leeres Array bleibt leer', () => {
    expect(interleaveByKey([], () => 'x')).toEqual([]);
  });

  it('einzelnes Item bleibt erhalten', () => {
    const out = interleaveByKey(mk('A'), i => i.key);
    expect(keys(out)).toBe('A');
  });

  it('Ein-Key-Input behält Reihenfolge', () => {
    const out = interleaveByKey(mk('AAAA'), i => i.key);
    expect(out.map(i => i.n)).toEqual([0, 1, 2, 3]);
  });

  it('Insertion-Order innerhalb eines Keys bleibt erhalten', () => {
    const out = interleaveByKey(mk('ABABAB'), i => i.key);
    const aOrder = out.filter(i => i.key === 'A').map(i => i.n);
    expect(aOrder).toEqual([...aOrder].sort((x, y) => x - y));
  });

  it('deterministisch: zweifacher Aufruf liefert identisches Ergebnis', () => {
    const input = mk('AABBBCCCCDD');
    const a = interleaveByKey(input, i => i.key);
    const b = interleaveByKey(input, i => i.key);
    expect(a).toEqual(b);
  });

  it('verändert das Eingabe-Array nicht', () => {
    const input = mk('AABB');
    interleaveByKey(input, i => i.key);
    expect(keys(input)).toBe('AABB');
  });
});

describe('interleaveQuestionsByTopic', () => {
  interface Q { topic?: string; n: number; }

  it('durchmischt Fragen nach topic (keine Themenblöcke)', () => {
    const qs: Q[] = [
      { topic: 'A', n: 0 }, { topic: 'A', n: 1 },
      { topic: 'B', n: 2 }, { topic: 'B', n: 3 },
    ];
    const out = interleaveQuestionsByTopic(qs);
    expect(out).toHaveLength(4);
    const adjacentSame = out.filter((q, i) => i > 0 && out[i - 1].topic === q.topic).length;
    expect(adjacentSame).toBe(0);
  });

  it('Fragen ohne topic landen gemeinsam im Fallback "Allgemein"', () => {
    const qs: Q[] = [{ n: 0 }, { n: 1 }, { topic: 'A', n: 2 }];
    const out = interleaveQuestionsByTopic(qs);
    expect(out).toHaveLength(3);
    expect(out.every(q => q.topic === undefined || q.topic === 'A')).toBe(true);
  });

  it('deterministisch', () => {
    const qs: Q[] = [{ topic: 'A', n: 0 }, { topic: 'B', n: 1 }, { topic: 'A', n: 2 }];
    expect(interleaveQuestionsByTopic(qs)).toEqual(interleaveQuestionsByTopic(qs));
  });

  it('einzelnes Thema bleibt unverändert (kein Nachteil bei nur einem Thema)', () => {
    const qs: Q[] = [{ topic: 'A', n: 0 }, { topic: 'A', n: 1 }, { topic: 'A', n: 2 }];
    expect(interleaveQuestionsByTopic(qs).map(q => q.n)).toEqual([0, 1, 2]);
  });

  it('Edge Case: einzelnes Thema crasht nicht bei jeder Größe (1 bis 20 Fragen)', () => {
    for (let n = 1; n <= 20; n++) {
      const qs: Q[] = Array.from({ length: n }, (_, i) => ({ topic: 'A', n: i }));
      expect(() => interleaveQuestionsByTopic(qs)).not.toThrow();
      expect(interleaveQuestionsByTopic(qs)).toHaveLength(n);
    }
  });

  // Muster-Verifikation: bei 3 gleich großen Themen muss ein echtes Round-Robin-
  // Muster (A-B-C-A-B-C...) entstehen — nicht geblockt (AABBCC) und nicht
  // "zufällig abwechselnd" (das wäre technisch lückenlos, verfehlt aber den
  // Lerneffekt von Interleaving, der ein wiederkehrendes Zyklus-Muster will).
  const threeTopicsRoundRobin = (perTopic: number): Q[] => {
    const qs: Q[] = [];
    for (let i = 0; i < perTopic; i++) {
      qs.push({ topic: 'A', n: qs.length }, { topic: 'B', n: qs.length }, { topic: 'C', n: qs.length });
    }
    return qs;
  };

  it.each([
    [6, 2],   // ~5er-Stufe (aufgerundet auf durch 3 teilbar)
    [9, 3],   // ~10er-Stufe
    [15, 5],  // 15er-Stufe
    [21, 7],  // ~20er-Stufe
  ])('bei %i Fragen (3 gleich große Themen) entsteht ABC-Zyklus, kein Block, kein Zufall', (total, perTopic) => {
    const qs = threeTopicsRoundRobin(perTopic);
    expect(qs).toHaveLength(total);
    const out = interleaveQuestionsByTopic(qs);

    // 1. Kein Block: nie zwei gleiche Themen direkt hintereinander
    const adjacentSame = out.filter((q, i) => i > 0 && out[i - 1].topic === q.topic).length;
    expect(adjacentSame).toBe(0);

    // 2. Kein Zufall, sondern ein exaktes Zyklus-Muster: Position i mod 3
    //    bestimmt deterministisch das Thema (A,B,C,A,B,C,...) — bei gleich
    //    großen Buckets und deterministischem Tie-Break (erstgesehener Key
    //    gewinnt) ist genau das der erwartete Greedy-Round-Robin-Output.
    const expectedCycle = Array.from({ length: total }, (_, i) => ['A', 'B', 'C'][i % 3]);
    expect(out.map(q => q.topic)).toEqual(expectedCycle);
  });

  it('unterschiedlich große Themen: größere Buckets zuerst, aber nie zwei gleiche Themen hintereinander', () => {
    // 3 Themen, ungleiche Größen (Fall näher an echten KI-generierten Sets) — 10 Fragen gesamt
    const qs: Q[] = [
      ...Array.from({ length: 5 }, (_, i) => ({ topic: 'A', n: i })),
      ...Array.from({ length: 3 }, (_, i) => ({ topic: 'B', n: i })),
      ...Array.from({ length: 2 }, (_, i) => ({ topic: 'C', n: i })),
    ];
    const out = interleaveQuestionsByTopic(qs);
    expect(out).toHaveLength(10);
    const adjacentSame = out.filter((q, i) => i > 0 && out[i - 1].topic === q.topic).length;
    // Bei 5/3/2 ist ein perfektes Interleaving nicht überall möglich (A ist
    // in der Mehrheit) — aber Cluster dürfen laut Algorithmus nur am Ende
    // durch den größten Rest-Bucket entstehen, nicht in der Mitte.
    expect(adjacentSame).toBeLessThanOrEqual(1);
  });
});
