import { describe, it, expect } from 'vitest';
import { buildFigureCatalog, figurePromptBlock } from './studioFigureCatalog';
import { validateStudioFigure, dedupeStudioFigures } from './studioFigureCatalog';

describe('Abbildungsverzeichnis', () => {
  it('prüft Seite, Bereich und Titel', () => {
    const f = validateStudioFigure({ page: 34, box: [100, 100, 600, 800], title: 'Querschnitt des Auges', description: 'Hornhaut, Linse' }, 40, 0);
    expect(f).toMatchObject({ id: 'f1', page: 34, title: 'Querschnitt des Auges' });
    expect(validateStudioFigure({ page: 41, box: [100, 100, 600, 800], title: 'x' }, 40, 0)).toBeNull();
    expect(validateStudioFigure({ page: 3, box: [0, 0, 1000, 1000], title: 'ganze Seite' }, 40, 0)).toBeNull();
    expect(validateStudioFigure({ page: 3, box: [100, 100, 600, 800], title: '' }, 40, 0)).toBeNull();
  });

  it('entfernt Doppelte und nummeriert neu', () => {
    const a = validateStudioFigure({ page: 2, box: [100, 100, 600, 800], title: 'A' }, 9, 0)!;
    const b = validateStudioFigure({ page: 2, box: [110, 110, 610, 790], title: 'A doppelt' }, 9, 1)!;
    const c = validateStudioFigure({ page: 5, box: [100, 100, 600, 800], title: 'C' }, 9, 2)!;
    expect(dedupeStudioFigures([a, b, c]).map(f => [f.id, f.title])).toEqual([['f1', 'A'], ['f2', 'C']]);
  });

  it('Verzeichnis über mehrere Quellen mit fortlaufenden Verweisen', () => {
    const fig = (page: number, title: string) => ({ id: 'f', page, box: { x: 0, y: 0, w: 0.5, h: 0.5 }, title, description: 'Teile' });
    const { text, entries } = buildFigureCatalog([
      { docId: 'a', n: 1, figures: [fig(34, 'Auge')] },
      { docId: 'b', n: 2, figures: [fig(3, 'Ohr'), fig(5, 'Gehirn')] },
    ]);
    expect(entries.map(e => [e.ref, e.docId, e.n])).toEqual([['A1', 'a', 1], ['A2', 'b', 2], ['A3', 'b', 2]]);
    expect(text).toContain('A1 · Quelle 1, Seite 34: Auge. Teile');
    expect(figurePromptBlock(text)).toContain('"type":"figure","ref":"A1"');
    expect(figurePromptBlock('')).toBe('');
  });
});
