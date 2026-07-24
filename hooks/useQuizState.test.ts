import { describe, it, expect, beforeEach } from 'vitest';
import { multiDocId, getUsedTopics, saveUsedTopics } from './useQuizState';

describe('multiDocId', () => {
  it('ist unabhängig von der Auswahlreihenfolge', () => {
    expect(multiDocId(['docB', 'docA'])).toBe(multiDocId(['docA', 'docB']));
  });

  it('zwei verschiedene Kombinationen mit überschneidenden Einzeldokumenten bekommen unterschiedliche IDs', () => {
    const ab = multiDocId(['docA', 'docB']);
    const ac = multiDocId(['docA', 'docC']);
    expect(ab).not.toBe(ac);
  });

  it('eine einzelne ID bleibt für sich stabil (Edge Case: nur 1 Dokument)', () => {
    expect(multiDocId(['docA'])).toBe('docA');
  });
});

describe('excludeTopics-Tracking über multiDocId (verhindert Vermischung mit dem Primärdokument)', () => {
  beforeEach(() => localStorage.clear());

  it('Themen einer Multi-Doc-Kombination landen unter deren eigener ID, nicht unter der ID eines Einzeldokuments', () => {
    const comboId = multiDocId(['docA', 'docB']);
    saveUsedTopics(comboId, [{ topic: 'Fremdes Thema aus docB' }]);
    expect(getUsedTopics('docA')).toEqual([]);
    expect(getUsedTopics(comboId)).toEqual(['Fremdes Thema aus docB']);
  });

  it('zwei verschiedene Kombinationen mit gemeinsamem Einzeldokument teilen sich keine excludeTopics', () => {
    const comboAB = multiDocId(['docA', 'docB']);
    const comboAC = multiDocId(['docA', 'docC']);
    saveUsedTopics(comboAB, [{ topic: 'Thema aus AB' }]);
    saveUsedTopics(comboAC, [{ topic: 'Thema aus AC' }]);
    expect(getUsedTopics(comboAB)).toEqual(['Thema aus AB']);
    expect(getUsedTopics(comboAC)).toEqual(['Thema aus AC']);
  });
});
