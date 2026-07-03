import { describe, it, expect } from 'vitest';
import { interleaveByKey } from './interleave';

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
