import { describe, it, expect } from 'vitest';
import {
  segmentIntersectsRect, bundleStrength, quadControlPoint, quadPointAt, quadMidpoint,
} from './graphCanvasMetrics';

const rect = { x: 100, y: 100, w: 200, h: 200 };

describe('segmentIntersectsRect', () => {
  it('erkennt ein Segment mitten im Rechteck', () => {
    expect(segmentIntersectsRect(0, 200, 400, 200, rect)).toBe(true);
  });

  it('erkennt eine Kante, deren BEIDE Endpunkte außerhalb liegen, deren Verlauf aber durchs Rechteck läuft', () => {
    expect(segmentIntersectsRect(0, 150, 500, 250, rect)).toBe(true);
  });

  it('lehnt ein Segment ab, das komplett links vorbeiführt', () => {
    expect(segmentIntersectsRect(0, 200, 50, 200, rect)).toBe(false);
  });

  it('lehnt ein Segment ab, das knapp oberhalb parallel vorbeiführt', () => {
    expect(segmentIntersectsRect(0, 90, 400, 90, rect)).toBe(false);
  });

  it('erkennt ein Segment, das genau eine Ecke berührt', () => {
    expect(segmentIntersectsRect(0, 0, 120, 120, rect)).toBe(true);
  });

  it('erkennt ein vollständig im Rechteck liegendes Segment', () => {
    expect(segmentIntersectsRect(120, 120, 180, 180, rect)).toBe(true);
  });

  it('behandelt horizontale/vertikale Spezialfälle (dx=dy=0 bzw. Achsen-parallel) ohne Division durch null', () => {
    // Punkt innerhalb
    expect(segmentIntersectsRect(150, 150, 150, 150, rect)).toBe(true);
    // Punkt außerhalb
    expect(segmentIntersectsRect(50, 50, 50, 50, rect)).toBe(false);
    // Vertikale Linie schneidet
    expect(segmentIntersectsRect(200, 0, 200, 400, rect)).toBe(true);
    // Horizontale Linie knapp unterhalb
    expect(segmentIntersectsRect(0, 301, 400, 301, rect)).toBe(false);
  });
});

describe('bundleStrength', () => {
  const MIN_NODES = 40;
  const FADE_START_K = 0.6;
  const FADE_END_K = 0.3;

  it('ist 0 für kleine Netze — Bündelung greift erst ab minNodes', () => {
    expect(bundleStrength(0.2, 27, MIN_NODES, FADE_START_K, FADE_END_K)).toBe(0);
  });

  it('ist 0, solange nah genug hineingezoomt', () => {
    expect(bundleStrength(0.8, 120, MIN_NODES, FADE_START_K, FADE_END_K)).toBe(0);
    expect(bundleStrength(FADE_START_K, 120, MIN_NODES, FADE_START_K, FADE_END_K)).toBe(0);
  });

  it('fadet weich zwischen fadeStartK und fadeEndK', () => {
    const half = bundleStrength(0.45, 120, MIN_NODES, FADE_START_K, FADE_END_K);
    expect(half).toBeGreaterThan(0);
    expect(half).toBeLessThan(1);
    expect(half).toBeCloseTo(0.5, 5);
  });

  it('ist bei fadeEndK und darüber hinaus voll gebündelt (auf 1 geklemmt)', () => {
    expect(bundleStrength(FADE_END_K, 120, MIN_NODES, FADE_START_K, FADE_END_K)).toBe(1);
    expect(bundleStrength(0.1, 120, MIN_NODES, FADE_START_K, FADE_END_K)).toBe(1);
  });
});

describe('quadControlPoint', () => {
  it('verschiebt den Sehnen-Mittelpunkt um bend Richtung Attraktor', () => {
    const { cx, cy } = quadControlPoint(-500, 0, 500, 0, 0, -800, 0.5, 10_000);
    // Mitte der Sehne ist (0,0), Attraktor (0,-800) → halber Weg = (0,-400)
    expect(cx).toBeCloseTo(0, 5);
    expect(cy).toBeCloseTo(-400, 5);
  });

  it('ist identisch mit der Sehnenmitte bei bend=0 (keine Bündelung)', () => {
    const { cx, cy } = quadControlPoint(0, 0, 100, 40, 999, 999, 0, 10_000);
    expect(cx).toBeCloseTo(50, 5);
    expect(cy).toBeCloseTo(20, 5);
  });

  it('begrenzt die Auslenkung auf maxOffset, statt absurde Schlaufen zu ziehen', () => {
    const maxOffset = 60;
    const { cx, cy } = quadControlPoint(-2000, 0, 2000, 0, 0, -5000, 1, maxOffset);
    const midX = 0, midY = 0;
    const dist = Math.hypot(cx - midX, cy - midY);
    expect(dist).toBeCloseTo(maxOffset, 5);
  });
});

describe('quadPointAt / quadMidpoint', () => {
  it('liefert bei t=0 und t=1 exakt Start- und Endpunkt', () => {
    expect(quadPointAt(10, 20, 50, -30, 90, 40, 0)).toEqual({ x: 10, y: 20 });
    expect(quadPointAt(10, 20, 50, -30, 90, 40, 1)).toEqual({ x: 90, y: 40 });
  });

  it('liegt beim t=0.5 näher am Kontrollpunkt als die Sehnenmitte', () => {
    const mid = quadMidpoint(0, 0, 100, 100, 100, 0);
    expect(mid.x).toBeCloseTo(75, 5);
    expect(mid.y).toBeCloseTo(50, 5);
  });
});
