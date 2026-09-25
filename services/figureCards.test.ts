import { describe, it, expect } from 'vitest';
import { validateFigure, cropRect, dedupeFigures } from './figureCards';

describe('figureCards', () => {
  const ok = { front: 'Was zeigt die Abbildung?', back: 'Den Hippocampus', page: 3, box: [200, 100, 600, 500] };

  it('rechnet Gemini-Boxen [ymin,xmin,ymax,xmax] in Seitenanteile mit Rand um', () => {
    const f = validateFigure(ok, 10)!;
    expect(f.page).toBe(3);
    expect(f.box.x).toBeCloseTo(0.08); expect(f.box.y).toBeCloseTo(0.18);
    expect(f.box.w).toBeCloseTo(0.44); expect(f.box.h).toBeCloseTo(0.44);
  });

  it('verwirft ungültige Seiten, winzige Bereiche, ganze Seiten und fehlende Texte', () => {
    expect(validateFigure({ ...ok, page: 11 }, 10)).toBeNull();
    expect(validateFigure({ ...ok, page: 0 }, 10)).toBeNull();
    expect(validateFigure({ ...ok, box: [100, 100, 120, 500] }, 10)).toBeNull();
    expect(validateFigure({ ...ok, box: [0, 0, 1000, 1000] }, 10)).toBeNull();
    expect(validateFigure({ ...ok, box: [1, 2, 3] }, 10)).toBeNull();
    expect(validateFigure({ ...ok, front: ' ' }, 10)).toBeNull();
  });

  it('bleibt am Seitenrand innerhalb der Seite', () => {
    const f = validateFigure({ ...ok, box: [0, 0, 400, 1000] }, 10)!;
    expect(f.box.x).toBe(0); expect(f.box.y).toBe(0); expect(f.box.x + f.box.w).toBeLessThanOrEqual(1);
  });

  it('berechnet den Pixel-Ausschnitt', () => {
    expect(cropRect({ x: 0.1, y: 0.2, w: 0.5, h: 0.25 }, 1000, 1400)).toEqual({ sx: 100, sy: 280, sw: 500, sh: 350 });
  });

  it('entfernt stark überlappende Doppelte auf derselben Seite', () => {
    const a = validateFigure(ok, 10)!;
    const b = validateFigure({ ...ok, box: [210, 110, 610, 510] }, 10)!;
    const c = validateFigure({ ...ok, page: 4 }, 10)!;
    expect(dedupeFigures([a, b, c])).toEqual([a, c]);
  });
});

describe('figureCards Bildseite', () => {
  const base = { front: 'Frage', back: 'Antwort', page: 1, box: [100, 100, 500, 500] };
  it('übernimmt vorne nur ausdrücklich, sonst hinten (verrät nie die Antwort)', () => {
    expect(validateFigure({ ...base, side: 'front' }, 3)!.side).toBe('front');
    expect(validateFigure({ ...base, side: 'back' }, 3)!.side).toBe('back');
    expect(validateFigure({ ...base }, 3)!.side).toBe('back');
    expect(validateFigure({ ...base, side: 'oben' }, 3)!.side).toBe('back');
  });
});
