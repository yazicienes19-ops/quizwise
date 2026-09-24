import { describe, it, expect } from 'vitest';
import { createDoubleTapDetector, isTapGesture } from './doubleTap';

describe('createDoubleTapDetector', () => {
  it('erkennt zwei schnelle, nahe Tipps auf dasselbe Ziel', () => {
    const tap = createDoubleTapDetector();
    expect(tap({ x: 100, y: 100, time: 0, key: 'bg' })).toBe(false);
    expect(tap({ x: 108, y: 104, time: 250, key: 'bg' })).toBe(true);
  });

  it('zählt nicht bei zu langer Pause, zu großem Abstand oder anderem Ziel', () => {
    const tap = createDoubleTapDetector();
    tap({ x: 0, y: 0, time: 0, key: 'bg' });
    expect(tap({ x: 0, y: 0, time: 500, key: 'bg' })).toBe(false);
    expect(tap({ x: 80, y: 0, time: 600, key: 'bg' })).toBe(false);
    expect(tap({ x: 80, y: 0, time: 700, key: 'node:a' })).toBe(false);
  });

  it('ein dritter Tipp startet neu statt erneut auszulösen', () => {
    const tap = createDoubleTapDetector();
    tap({ x: 0, y: 0, time: 0, key: 'bg' });
    expect(tap({ x: 0, y: 0, time: 100, key: 'bg' })).toBe(true);
    expect(tap({ x: 0, y: 0, time: 200, key: 'bg' })).toBe(false);
  });
});

describe('isTapGesture', () => {
  it('unterscheidet Tippen von Wischen', () => {
    expect(isTapGesture({ x: 0, y: 0 }, { x: 4, y: 3 })).toBe(true);
    expect(isTapGesture({ x: 0, y: 0 }, { x: 40, y: 0 })).toBe(false);
    expect(isTapGesture(null, { x: 0, y: 0 })).toBe(false);
  });
});
