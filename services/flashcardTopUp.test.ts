import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./supabaseClient', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: 'fake-token' } } }),
    },
  },
}));

import { generateFlashcardsFromDocument } from './geminiService';

const respond = (cards: unknown) => ({ ok: true, json: async () => ({ text: JSON.stringify(cards) }) });
const promptOf = (call: number): string =>
  JSON.parse((global.fetch as any).mock.calls[call][1].body).parts.map((p: any) => p.text ?? '').join('\n');

describe('generateFlashcardsFromDocument: Bereinigung und Nachlieferung', () => {
  beforeEach(() => { global.fetch = vi.fn(); });

  it('filtert leere und doppelte Karten und liefert den Rest in einem Zusatz-Call nach', async () => {
    (global.fetch as any)
      .mockResolvedValueOnce(respond([
        { front: 'Was ist der Halo-Effekt?', back: 'Ein Urteilsfehler.' },
        { front: 'Wer prägte den Begriff?', back: 'Thorndike.' },
        { front: '', back: 'ohne Vorderseite' },
        { front: 'was ist der HALO Effekt', back: 'Doppelt, nur anders geschrieben.' },
      ]))
      .mockResolvedValueOnce(respond([
        { front: 'Wer prägte den Begriff?', back: 'Doppelt aus dem ersten Call.' },
        { front: 'Nenne ein Beispiel.', back: 'Attraktive Menschen gelten als klüger.' },
        { front: 'Wie vermeidet man ihn?', back: 'Kriterien einzeln bewerten.' },
        { front: 'In welchem Jahr?', back: '1920.' },
      ]));

    const cards = await generateFlashcardsFromDocument({ text: 'Material' }, 5);

    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(cards.map(c => c.front)).toEqual([
      'Was ist der Halo-Effekt?',
      'Wer prägte den Begriff?',
      'Nenne ein Beispiel.',
      'Wie vermeidet man ihn?',
      'In welchem Jahr?',
    ]);
    const topUp = promptOf(1);
    expect(topUp).toContain('Erstelle 3 hochwertige Karteikarten');
    expect(topUp).toContain('Was ist der Halo-Effekt?');
  });

  it('versucht keine Nachlieferung, wenn der erste Call gar nichts liefert', async () => {
    (global.fetch as any).mockResolvedValueOnce(respond([]));
    const cards = await generateFlashcardsFromDocument({ text: 'Material' }, 5);
    expect(cards).toEqual([]);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('kappt auf die angeforderte Anzahl, wenn das Modell mehr liefert', async () => {
    (global.fetch as any).mockResolvedValueOnce(respond(
      Array.from({ length: 8 }, (_, i) => ({ front: `Frage ${i}`, back: `Antwort ${i}` })),
    ));
    const cards = await generateFlashcardsFromDocument({ text: 'Material' }, 5);
    expect(cards).toHaveLength(5);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('behält die ersten Karten, wenn die Nachlieferung scheitert', async () => {
    (global.fetch as any)
      .mockResolvedValueOnce(respond([{ front: 'A?', back: 'a' }, { front: 'B?', back: 'b' }]))
      .mockRejectedValueOnce(new Error('Netz weg'));
    const cards = await generateFlashcardsFromDocument({ text: 'Material' }, 5);
    expect(cards.map(c => c.front)).toEqual(['A?', 'B?']);
  });
});
