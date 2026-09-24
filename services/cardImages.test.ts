import { describe, it, expect, vi } from 'vitest';

const createSignedUrl = vi.fn(async (path: string) => ({ data: { signedUrl: `https://signed/${path}` }, error: null }));
vi.mock('./supabaseClient', () => ({
  supabase: { storage: { from: () => ({ createSignedUrl, upload: vi.fn(), remove: vi.fn(async () => ({})) }) } },
}));

import { fitWithin, getCardImageUrl, isOwnImage, compressImage, CardImageError } from './cardImages';

describe('cardImages', () => {
  it('verkleinert nur, wenn die längste Kante zu groß ist', () => {
    expect(fitWithin(4000, 3000)).toEqual({ w: 1280, h: 960 });
    expect(fitWithin(900, 1600)).toEqual({ w: 720, h: 1280 });
    expect(fitWithin(800, 600)).toEqual({ w: 800, h: 600 });
  });

  it('holt signierte Links einmal und nutzt danach den Zwischenspeicher', async () => {
    createSignedUrl.mockClear();
    const [a, b] = await Promise.all([getCardImageUrl('u1/c1.webp', 1000), getCardImageUrl('u1/c1.webp', 1000)]);
    expect(a).toBe('https://signed/u1/c1.webp');
    expect(b).toBe(a);
    await getCardImageUrl('u1/c1.webp', 2000);
    expect(createSignedUrl).toHaveBeenCalledTimes(1);
  });

  it('erkennt eigene Bilder am Pfad', () => {
    expect(isOwnImage('u1/c1.webp', 'u1')).toBe(true);
    expect(isOwnImage('u2/c1.webp', 'u1')).toBe(false);
    expect(isOwnImage(undefined, 'u1')).toBe(false);
  });

  it('lehnt Nicht-Bilder ab', async () => {
    const f = new File(['x'], 'a.pdf', { type: 'application/pdf' });
    await expect(compressImage(f)).rejects.toBeInstanceOf(CardImageError);
  });
});
