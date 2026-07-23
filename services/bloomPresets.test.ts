import { describe, it, expect } from 'vitest';
import { EXAM_TYPE_BLOOM_TARGETS, BLOOM_LEVELS, buildBloomTargetLine, mergeBloomLevels } from './bloomPresets';
import type { ExamQuestion } from '../types';

describe('EXAM_TYPE_BLOOM_TARGETS', () => {
  it('jedes Preset summiert auf 100%', () => {
    for (const preset of Object.keys(EXAM_TYPE_BLOOM_TARGETS) as (keyof typeof EXAM_TYPE_BLOOM_TARGETS)[]) {
      const sum = BLOOM_LEVELS.reduce((s, level) => s + EXAM_TYPE_BLOOM_TARGETS[preset][level], 0);
      expect(sum).toBe(100);
    }
  });

  it('erschaffen ist in allen Presets 0', () => {
    for (const preset of Object.keys(EXAM_TYPE_BLOOM_TARGETS) as (keyof typeof EXAM_TYPE_BLOOM_TARGETS)[]) {
      expect(EXAM_TYPE_BLOOM_TARGETS[preset].erschaffen).toBe(0);
    }
  });

  it('universitaetsklausur betont anwenden/analysieren stärker als wissensabfrage', () => {
    const uni = EXAM_TYPE_BLOOM_TARGETS.universitaetsklausur;
    const wissen = EXAM_TYPE_BLOOM_TARGETS.wissensabfrage;
    expect(uni.anwenden + uni.analysieren).toBeGreaterThan(wissen.anwenden + wissen.analysieren);
    expect(wissen.erinnern).toBeGreaterThan(uni.erinnern);
  });
});

describe('buildBloomTargetLine', () => {
  it('enthält alle Level mit Prozentwert > 0, aber keine mit 0%', () => {
    const line = buildBloomTargetLine('universitaetsklausur');
    expect(line).toContain('35% Anwenden');
    expect(line).toContain('25% Analysieren');
    expect(line).toContain('10% Bewerten');
    expect(line).not.toContain('Erschaffen');
  });

  it('markiert die Verteilung explizit als Näherungswert, keine exakte Quote', () => {
    const line = buildBloomTargetLine('gemischt');
    expect(line).toMatch(/Näherungswert/);
    expect(line).toMatch(/KEINE exakte Quote/);
  });
});

describe('mergeBloomLevels', () => {
  const baseQ = (id: string): ExamQuestion => ({ id, question: `Frage ${id}`, type: 'mc', solution: 'x', points: 1 });

  it('übernimmt bloomLevel für Fragen mit Treffer', () => {
    const questions = [baseQ('q1'), baseQ('q2')];
    const merged = mergeBloomLevels(questions, [{ id: 'q1', bloomLevel: 'analysieren' }, { id: 'q2', bloomLevel: 'erinnern' }]);
    expect(merged.find(q => q.id === 'q1')?.bloomLevel).toBe('analysieren');
    expect(merged.find(q => q.id === 'q2')?.bloomLevel).toBe('erinnern');
  });

  it('lässt bloomLevel undefined statt einen Default zu erzwingen, wenn keine Klassifikation vorliegt', () => {
    const questions = [baseQ('q1'), baseQ('q2')];
    const merged = mergeBloomLevels(questions, [{ id: 'q1', bloomLevel: 'verstehen' }]);
    expect(merged.find(q => q.id === 'q2')?.bloomLevel).toBeUndefined();
  });

  it('ignoriert Labels ohne bloomLevel (leere KI-Antwort für eine ID)', () => {
    const questions = [baseQ('q1')];
    const merged = mergeBloomLevels(questions, [{ id: 'q1' }]);
    expect(merged[0].bloomLevel).toBeUndefined();
  });

  it('verändert die Original-Fragen nicht (keine Mutation)', () => {
    const questions = [baseQ('q1')];
    mergeBloomLevels(questions, [{ id: 'q1', bloomLevel: 'bewerten' }]);
    expect(questions[0].bloomLevel).toBeUndefined();
  });
});
