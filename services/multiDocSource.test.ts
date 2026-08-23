import { describe, it, expect } from 'vitest';
import { buildCombinedMultiDocText, multiDocPromptRules, attachMultiDocSources } from './multiDocSource';
import type { ProcessedDocument, QuizQuestion } from '../types';

// Regressionstests zum Feature-Audit 2026-08-22 (Paket-3-Kriterium):
// Multi-Doc-Quizzes müssen pro Frage das Ursprungs-Dokument zuordnen können.

const mkDoc = (over: Partial<ProcessedDocument>): ProcessedDocument => ({
  id: Math.random().toString(36).slice(2, 9), name: 'doc.pdf', content: '', type: 'pdf',
  uploadDate: 0, ...over,
});

const mkQ = (over: Partial<QuizQuestion>): QuizQuestion => ({
  question: 'Frage?', options: ['A', 'B'], correctAnswerIndices: [0], isMultipleChoice: true,
  explanation: 'Weil.', distractorExplanations: [], sourceReference: 'Kapitel 1', ...over,
});

describe('buildCombinedMultiDocText', () => {
  it('nummeriert die Quellblöcke 1-basiert und nutzt Digest bevorzugt', () => {
    const docs = [
      mkDoc({ id: 'd1', name: 'Folien.pdf', digestText: 'Digest der Folien' }),
      mkDoc({ id: 'd2', name: 'Notizen.txt', type: 'text', content: 'Meine Mitschrift' }),
      mkDoc({ id: 'd3', name: 'Buch.pdf', digestText: 'Digest vom Buch' }),
    ];
    const text = buildCombinedMultiDocText(docs);
    expect(text).toContain('[DOKUMENT 1: Folien]\nDigest der Folien');
    expect(text).toContain('[DOKUMENT 2: Notizen]\nMeine Mitschrift');
    expect(text).toContain('[DOKUMENT 3: Buch]');
    expect(text.split('\n\n---\n\n')).toHaveLength(3);
    // PDFs ohne Digest dürfen nicht versehentlich leer einfließen → dann eben ''
    expect(text).not.toContain('undefined');
  });

  it('leeres Array ergibt leeren Text', () => {
    expect(buildCombinedMultiDocText([])).toBe('');
  });
});

describe('multiDocPromptRules', () => {
  it('nennt die Anzahl der Quellen als Obergrenze', () => {
    expect(multiDocPromptRules(3)).toContain('1 bis 3');
    expect(multiDocPromptRules(3)).toContain('sourceNumber');
  });
});

describe('attachMultiDocSources', () => {
  const docs = [
    mkDoc({ id: 'd1', name: 'Folien.pdf' }),
    mkDoc({ id: 'd2', name: 'Notizen.txt', type: 'text' }),
  ];

  it('übersetzt sourceNumber in Dokument-ID und Anzeigename', () => {
    const qs = [mkQ({ sourceNumber: 2 }), mkQ({ sourceNumber: 1 })];
    const res = attachMultiDocSources(qs, docs);
    expect(res[0].sourceDocId).toBe('d2');
    expect(res[0].sourceDocName).toBe('Notizen');
    expect(res[1].sourceDocId).toBe('d1');
    expect(res[1].sourceDocName).toBe('Folien');
    // übrige Feld bleiben erhalten
    expect(res[0].question).toBe('Frage?');
    expect(res[0].correctAnswerIndices).toEqual([0]);
  });

  it('lässt Fragen ohne/mit invalider sourceNumber unangetastet (Altsessions, Modell-Ausreißer)', () => {
    const qs = [
      mkQ({}),
      mkQ({ sourceNumber: 0 }),
      mkQ({ sourceNumber: 3 }),
      mkQ({ sourceNumber: 1.5 }),
    ];
    for (const q of attachMultiDocSources(qs, docs)) {
      expect(q.sourceDocId).toBeUndefined();
      expect(q.sourceDocName).toBeUndefined();
    }
  });

  it('mutiert die Eingabe-Fragen nicht', () => {
    const original = mkQ({ sourceNumber: 1 });
    attachMultiDocSources([original], docs);
    expect(original.sourceDocId).toBeUndefined();
  });
});
