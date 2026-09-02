import { describe, it, expect, vi, beforeEach } from 'vitest';

// Gleiches Mock-Muster wie services/geminiService.test.ts: callBackend braucht eine
// Supabase-Session, das echte supabaseClient.ts würde ohne VITE_SUPABASE_*-Env-Vars
// beim Import crashen.
vi.mock('./supabaseClient', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: 'fake-token' } } }),
    },
  },
}));

import { generateFullExam } from './geminiService';
import { computeTopicWeights, computeDifficultyMix } from './examAdaptive';
import type { TopicSecurity } from '../types';

const mockFetchOnce = (payload: unknown) => {
  (global.fetch as any).mockResolvedValueOnce({
    ok: true,
    json: async () => ({ text: JSON.stringify(payload) }),
  });
};

const fakeQuestion = (id: string, difficulty: 'leicht' | 'mittel' | 'schwer', topic: string) => ({
  id, type: 'mc', question: `Frage zu ${topic}`, topic, category: 'verstaendnis', difficulty,
  options: ['a', 'b', 'c', 'd'], correctIndices: [0], solution: 'weil', points: 3,
});

describe('Paket 11 (Phase 3A): Adaptive-Klausur-Prompt end-to-end', () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  // Exakt das Beispiel aus der Nutzer-Konversation: 10 Fragen, Niveau "mittel",
  // Bayes-Theorem kritisch, Regression unsicher, Normalverteilung sicher,
  // letzte 5 Klausur-Scores 85/82/88/79/84 (Ø 83.6%), nächste Klausur in 10 Tagen.
  it('sendet Themen-Mindestkontingent + Schwierigkeits-Verteilung als konkrete Bullets an Gemini', async () => {
    const topicMastery: TopicSecurity[] = [
      { topic: 'Bayes-Theorem', security: 'kritisch', confidence: 20, weakCount: 4 },
      { topic: 'Regression', security: 'unsicher', confidence: 55, weakCount: 2 },
      { topic: 'Normalverteilung', security: 'sicher', confidence: 88, weakCount: 0 },
    ];
    const recentScores = [85, 82, 88, 79, 84];
    const recentAvgScore = recentScores.reduce((s, n) => s + n, 0) / recentScores.length;
    const daysUntilNextExam = 10;

    const topicWeights = computeTopicWeights(topicMastery, 10);
    const difficultyMix = computeDifficultyMix('mittel', recentAvgScore, daysUntilNextExam);

    mockFetchOnce(Array.from({ length: 10 }, (_, i) => fakeQuestion(`q${i + 1}`, 'mittel', 'Bayes-Theorem')));

    const result = await generateFullExam(
      { text: 'Lernmaterial zu Statistik: Bayes-Theorem, Regression, Normalverteilung...' },
      undefined,
      {
        count: 10,
        difficulty: 'mittel',
        adaptive: { weakCategories: [], weakTopics: [], topicWeights, difficultyMix },
      },
    );

    expect(result).toHaveLength(10);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const promptText: string = JSON.parse((global.fetch as any).mock.calls[0][1].body).parts.map((p: any) => p.text ?? '').join('\n');

    // Themen-Mindestkontingent: kritisches Thema bekommt mehr als das unsichere.
    expect(topicWeights.find(w => w.topic === 'Bayes-Theorem')?.minCount).toBeGreaterThan(
      topicWeights.find(w => w.topic === 'Regression')?.minCount ?? 0,
    );
    expect(promptText).toContain('THEMEN-MINDESTKONTINGENT');
    expect(promptText).toContain(`Thema "Bayes-Theorem": mindestens ${topicWeights.find(w => w.topic === 'Bayes-Theorem')!.minCount} Fragen`);
    expect(promptText).toContain(`Thema "Regression": mindestens ${topicWeights.find(w => w.topic === 'Regression')!.minCount} Fragen`);
    expect(promptText).not.toContain('Thema "Normalverteilung"');

    // Schwierigkeits-Verteilung: hoher Notenschnitt (83.6%) + Termin in 10 Tagen (≤21)
    // verschiebt den "mittel"-Basismix (25/50/25) klar Richtung schwerer.
    expect(promptText).toContain('SCHWIERIGKEITS-VERTEILUNG');
    expect(difficultyMix.schwer).toBeGreaterThan(25);
    expect(difficultyMix.leicht).toBeLessThan(25);
    expect(promptText).toMatch(/Fragen mit difficulty "schwer"/);

    // Alter weicher Fallback-Text darf nicht mehr auftauchen, wenn topicWeights vorliegt.
    expect(promptText).not.toContain('Bisher schwache Themen:');
  });

  it('ohne adaptive-Optionen (kein Toggle/keine Historie): Prompt bleibt wie bisher, kein Adaptiv-Block', async () => {
    mockFetchOnce(Array.from({ length: 5 }, (_, i) => fakeQuestion(`q${i + 1}`, 'mittel', 'X')));
    await generateFullExam({ text: 'Material' }, undefined, { count: 5, difficulty: 'mittel' });

    const promptText: string = JSON.parse((global.fetch as any).mock.calls[0][1].body).parts.map((p: any) => p.text ?? '').join('\n');
    expect(promptText).not.toContain('THEMEN-MINDESTKONTINGENT');
    expect(promptText).not.toContain('SCHWIERIGKEITS-VERTEILUNG');
    expect(promptText).not.toContain('ADAPTIVE GEWICHTUNG');
  });
});
