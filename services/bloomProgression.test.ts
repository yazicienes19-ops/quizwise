import { describe, it, expect } from 'vitest';
import { computeBloomStage, stageForLiveStreak, BLOOM_STAGE_ORDER } from './bloomProgression';

describe('computeBloomStage', () => {
  it('bleibt bei "erinnern" ohne Historie', () => {
    expect(computeBloomStage([])).toBe('erinnern');
  });

  it('steigt NICHT nach nur einer richtigen Antwort', () => {
    expect(computeBloomStage([true])).toBe('erinnern');
    expect(computeBloomStage([true, true])).toBe('erinnern');
  });

  it('steigt nach 3 aufeinanderfolgenden richtigen Antworten eine Stufe', () => {
    expect(computeBloomStage([true, true, true])).toBe('verstehen');
  });

  it('steigt über mehrere 3er-Serien weiter bis zur Obergrenze', () => {
    const nineCorrect = Array(9).fill(true);
    expect(computeBloomStage(nineCorrect)).toBe('analysieren');
  });

  it('eskaliert nie über die letzte definierte Stufe hinaus', () => {
    const twentyCorrect = Array(20).fill(true);
    expect(computeBloomStage(twentyCorrect)).toBe(BLOOM_STAGE_ORDER[BLOOM_STAGE_ORDER.length - 1]);
  });

  it('sinkt nach 2 aufeinanderfolgenden falschen Antworten genau eine Stufe (graduell, kein Sprung auf Anfang)', () => {
    // 3 richtig -> verstehen, dann 2 falsch -> zurück auf erinnern (nur 1 Stufe tiefer, da Obergrenze bereits Stufe 1 war)
    expect(computeBloomStage([true, true, true, false, false])).toBe('erinnern');
  });

  it('sinkt von einer höheren Stufe nur um eine Stufe, nicht auf null', () => {
    // 6 richtig -> anwenden (Stufe 2), dann 2 falsch -> verstehen (Stufe 1), nicht erinnern
    const seq = [true, true, true, true, true, true, false, false];
    expect(computeBloomStage(seq)).toBe('verstehen');
  });

  it('eine einzelne falsche Antwort senkt die Stufe nicht', () => {
    const seq = [true, true, true, false];
    expect(computeBloomStage(seq)).toBe('verstehen');
  });

  it('Streak wird durch eine falsche Antwort unterbrochen (kein Übertrag)', () => {
    // 2 richtig, 1 falsch, 2 richtig -> nie 3 in Folge -> bleibt erinnern
    const seq = [true, true, false, true, true];
    expect(computeBloomStage(seq)).toBe('erinnern');
  });

  it('bleibt auf Stufe 0, wenn direkt am Anfang 2 falsche Antworten kommen', () => {
    expect(computeBloomStage([false, false])).toBe('erinnern');
  });
});

describe('stageForLiveStreak', () => {
  it('mappt 0-1 auf erinnern', () => {
    expect(stageForLiveStreak(0)).toBe('erinnern');
    expect(stageForLiveStreak(1)).toBe('erinnern');
  });
  it('mappt 2 auf verstehen', () => {
    expect(stageForLiveStreak(2)).toBe('verstehen');
  });
  it('mappt 3-4 auf anwenden', () => {
    expect(stageForLiveStreak(3)).toBe('anwenden');
    expect(stageForLiveStreak(4)).toBe('anwenden');
  });
  it('mappt 5+ auf analysieren', () => {
    expect(stageForLiveStreak(5)).toBe('analysieren');
    expect(stageForLiveStreak(20)).toBe('analysieren');
  });
});
