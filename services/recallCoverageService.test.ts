import { describe, it, expect, beforeEach } from 'vitest';
import { getCoverage, markTopicCovered } from './recallCoverageService';

const TITLES = ['1. Behaviorismus', '2. Klassische Konditionierung', '3. Operante Konditionierung'];

describe('recallCoverageService', () => {
  beforeEach(() => localStorage.clear());

  it('frisches Dokument: alles offen', () => {
    const c = getCoverage('doc1', TITLES);
    expect(c.uncovered).toEqual(TITLES);
    expect(c.coveredCount).toBe(0);
    expect(c.total).toBe(3);
  });

  it('markTopicCovered hakt case-insensitiv ab, Dokumentreihenfolge bleibt', () => {
    markTopicCovered('doc1', '2. klassische konditionierung');
    const c = getCoverage('doc1', TITLES);
    expect(c.uncovered).toEqual(['1. Behaviorismus', '3. Operante Konditionierung']);
    expect(c.coveredCount).toBe(1);
  });

  it('Themen außerhalb der Kapitel-Liste stören die Abdeckung nicht', () => {
    markTopicCovered('doc1', 'Rescorla-Wagner-Modell');
    const c = getCoverage('doc1', TITLES);
    expect(c.coveredCount).toBe(0);
    expect(c.uncovered).toHaveLength(3);
  });

  it('Abdeckung ist pro Dokument getrennt', () => {
    markTopicCovered('doc1', TITLES[0]);
    expect(getCoverage('doc2', TITLES).coveredCount).toBe(0);
  });

  it('doppeltes Abhaken bleibt idempotent, leere Eingaben werden ignoriert', () => {
    markTopicCovered('doc1', TITLES[0]);
    markTopicCovered('doc1', ` ${TITLES[0].toUpperCase()} `);
    markTopicCovered('doc1', '   ');
    markTopicCovered('', TITLES[1]);
    const c = getCoverage('doc1', TITLES);
    expect(c.coveredCount).toBe(1);
    expect(getCoverage('doc1', TITLES).uncovered).not.toContain(TITLES[0]);
  });

  it('Markdown-Präfix ist für den Abgleich egal (KI strippt "## ")', () => {
    markTopicCovered('doc1', 'Ursprung und Forschung');
    const c = getCoverage('doc1', ['## Der Halo-Effekt', '## Ursprung und Forschung']);
    expect(c.coveredCount).toBe(1);
    expect(c.uncovered).toEqual(['## Der Halo-Effekt']);
  });

  it('alles abgefragt: uncovered leer', () => {
    TITLES.forEach(t => markTopicCovered('doc1', t));
    const c = getCoverage('doc1', TITLES);
    expect(c.uncovered).toEqual([]);
    expect(c.coveredCount).toBe(3);
  });
});
