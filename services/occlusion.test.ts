import { describe, it, expect } from 'vitest';
import { rectFromPoints, maskStates, buildOcclusionCards, cardImagePaths } from './occlusion';

describe('occlusion', () => {
  it('baut Rechtecke aus zwei Punkten in jeder Richtung, auf das Bild begrenzt', () => {
    expect(rectFromPoints({ x: 0.5, y: 0.6 }, { x: 0.2, y: 0.1 })).toEqual({ x: 0.2, y: 0.1, w: 0.3, h: 0.5 });
    expect(rectFromPoints({ x: -0.2, y: 0.5 }, { x: 0.3, y: 1.4 })).toEqual({ x: 0, y: 0.5, w: 0.3, h: 0.5 });
    expect(rectFromPoints({ x: 0.5, y: 0.5 }, { x: 0.505, y: 0.6 })).toBeNull();
  });

  it('zeigt je nach Modus die richtigen Masken', () => {
    const masks = [{ x: 0, y: 0, w: 0.1, h: 0.1 }, { x: 0.5, y: 0.5, w: 0.1, h: 0.1 }];
    expect(maskStates({ image: 'p', masks, index: 1, mode: 'hideAll' }, false).map(s => s.state)).toEqual(['hidden', 'target']);
    expect(maskStates({ image: 'p', masks, index: 1, mode: 'hideAll' }, true).map(s => s.state)).toEqual(['hidden', 'revealed']);
    expect(maskStates({ image: 'p', masks, index: 0, mode: 'hideOne' }, false).map(s => s.state)).toEqual(['target', 'none']);
  });

  it('erzeugt eine Karte je Rechteck mit gemeinsamem Bild', () => {
    let n = 0;
    const masks = [{ x: 0, y: 0, w: 0.1, h: 0.1 }, { x: 0.5, y: 0.5, w: 0.1, h: 0.1 }, { x: 0.2, y: 0.7, w: 0.1, h: 0.1 }];
    const cards = buildOcclusionCards('u/bild.webp', masks, 'hideAll', 'Was ist verdeckt?', '', () => `c${n++}`, 1);
    expect(cards.map(c => c.occlusion!.index)).toEqual([0, 1, 2]);
    expect(new Set(cards.map(c => c.occlusion!.image)).size).toBe(1);
    expect(cardImagePaths(cards[0] as any)).toEqual(['u/bild.webp']);
  });
});
