import { describe, it, expect } from 'vitest';
import type { Block, Unit } from './types';
import type { StudioLlm, StudioLlmRequest } from './llm';
import { answerRepeatsQuestion, buildExtraBlocks, buildPracticeQuestions, practiceProblems } from './extras';
import { normalizeBlocks } from './blocks';
import { checkIllustrative, checkIllustrativeLabel, checkMeta } from './validate';
import { resultToMarkdown } from './toMarkdown';

/**
 * Skript-Feinschliff 17.10.2026: Übungsfragen aufbereitet, Klausurfallen nur
 * aus Folien, „Rechenbeispiel“ nur bei markierten Einheiten, keine Meta-Sätze.
 * Synthetische Daten, keine echten Folien.
 */

const u = (id: string, page: number, type: Unit['type'], text: string, extra: Partial<Unit> = {}): Unit =>
  ({ id, sourceId: 's', page, type, text, ...extra });

const UNITS: Unit[] = [
  u('u1', 10, 'practice_question', 'Was gibt es zum Frühstück?'),
  u('u2', 11, 'practice_question', 'Welche Rolle spielt Gewohnheit beim Zuspätkommen?', { answer: 'Welche Rolle spielt Gewohnheit?' }),
  u('u3', 11, 'practice_question', 'Welche Rolle spielt Belohnung beim Zuspätkommen?', { answer: 'Welche Rolle spielt Belohnung?' }),
  u('u4', 12, 'practice_question', 'Ergänze Theorie, Hypothese und Prüfung für: Macht Lärm müde?'),
  u('u5', 13, 'concept', 'Hypothese: Wer bei Lärm arbeitet, ist danach müder als wer in Ruhe arbeitet.'),
  u('u6', 12, 'source_error', 'Auf Folie 12 steht versehentlich der Satz „Kaffee hilft immer“ aus einem anderen Beispiel.'),
];

describe('Übungsfragen aufbereiten', () => {
  it('Antwort, die nur die Frage wiederholt, oder bloßes Ja/Nein zählt nicht', () => {
    expect(answerRepeatsQuestion('Welche Rolle spielt Gewohnheit beim Zuspätkommen?', 'Welche Rolle spielt Gewohnheit?')).toBe(true);
    expect(answerRepeatsQuestion('Welche Rolle spielt Gewohnheit?', 'Gewohnte Abläufe verschieben den Aufbruch.')).toBe(false);
    expect(practiceProblems([{ question: 'Gilt das?', answer: 'JA NEIN', answerFromSlide: true, unitIds: ['u1'] }])).toHaveLength(1);
    expect(practiceProblems([{ question: 'Gilt das?', answer: 'Nein, denn Korrelation ist keine Kausalität.', answerFromSlide: true, unitIds: ['u1'] }])).toEqual([]);
  });

  it('Prompt mit Fragen, Stoff der Folien danach und bestätigten Folienfehlern; eine Überarbeitung bei Wiederholung', async () => {
    const reqs: StudioLlmRequest[] = [];
    const llm: StudioLlm = async req => {
      reqs.push(req);
      const second = req.prompt.includes('=== ÜBERARBEITUNG ===');
      return { items: [
        { units: ['u2', 'u3'], question: 'Wie erklären Gewohnheit und Belohnung das Zuspätkommen?', answerFromSlide: false,
          answer: second ? 'Gewohnheit: feste Abläufe.\nBelohnung: was das Zuspätkommen angenehm macht.' : 'Wie erklären Gewohnheit und Belohnung das Zuspätkommen?' },
        { units: ['u4'], question: 'Ergänze Theorie, Hypothese und Prüfung für: Macht Lärm müde?', answerFromSlide: true,
          answer: 'Theorie: Lärm belastet.\nHypothese: Wer bei Lärm arbeitet, ist danach müder als wer in Ruhe arbeitet.\nPrüfung: zwei Gruppen vergleichen.' },
        { units: ['zz'], question: 'Erfunden', answer: 'x', answerFromSlide: true },
      ] };
    };
    const items = await buildPracticeQuestions(UNITS, llm);
    expect(reqs).toHaveLength(2);
    expect(reqs[0].step).toBe('practice');
    expect(reqs[0].prompt).toContain('u1 | S. 10 | Was gibt es zum Frühstück?');
    expect(reqs[0].prompt).toContain('S. 13 | concept | Hypothese: Wer bei Lärm arbeitet');
    expect(reqs[0].prompt).toContain('„Kaffee hilft immer“');
    expect(reqs[1].prompt).toContain('Eintrag 1: die Antwort wiederholt nur die Frage.');
    expect(items?.map(i => i.unitIds)).toEqual([['u2', 'u3'], ['u4']]);
  });

  it('Ergebnis als Fragen mit Antwort; vom Modell geschriebene Antwort ist als Erklärhilfe markiert', () => {
    const blocks = buildExtraBlocks(UNITS, [], [
      { question: 'Wie erklären Gewohnheit und Belohnung das Zuspätkommen?', answer: 'Gewohnheit: feste Abläufe.', answerFromSlide: false, unitIds: ['u2', 'u3'] },
      { question: 'Macht Lärm müde?', answer: 'Hypothese: Wer bei Lärm arbeitet, ist müder.', answerFromSlide: true, unitIds: ['u4'] },
    ]);
    const checks = blocks.filter((b): b is Extract<Block, { type: 'check' }> => b.type === 'check');
    expect(checks.map(c => [c.question, c.answerOrigin ?? 'quelle', c.cites.map(x => x.page)])).toEqual([
      ['Wie erklären Gewohnheit und Belohnung das Zuspätkommen?', 'ki', [11]],
      ['Macht Lärm müde?', 'quelle', [12]],
    ]);
    const md = resultToMarkdown({ formatVersion: 2, format: 'skript', omittedSources: [], warnings: [], stats: { sourceWords: 1, outputWords: 1 }, blocks }, () => 1);
    expect(md).toContain('Gewohnheit: feste Abläufe. *(Erklärhilfe)*');
    expect(md).not.toContain('müder. *(Erklärhilfe)*');
  });

  it('ohne Modell: Antworten, die nur die Frage wiederholen, fallen weg', async () => {
    const items = await buildPracticeQuestions(UNITS, async () => { throw new Error('offline'); });
    expect(items).toBeNull();
    const blocks = buildExtraBlocks(UNITS, [], items);
    expect(blocks.some(b => b.type === 'check' && b.answer === 'Welche Rolle spielt Gewohnheit?')).toBe(false);
  });
});

describe('Klausurfallen nur aus Folien', () => {
  const byId = new Map([['u5', UNITS[4]]]);
  it('Klausurfalle als Erklärhilfe oder ohne Beleg wird verworfen, mit Beleg bleibt sie', () => {
    const { blocks } = normalizeBlocks([
      { type: 'callout', origin: 'ki', callout: { variant: 'klausurfalle', text: 'Eigene Falle.' } },
      { type: 'callout', origin: 'quelle', callout: { variant: 'klausurfalle', text: 'Ohne Beleg.' } },
      { type: 'callout', origin: 'quelle', callout: { variant: 'klausurfalle', text: 'Mit Beleg.', units: ['u5'] } },
      { type: 'callout', origin: 'ki', callout: { variant: 'beispiel', text: 'Ein Alltagsbeispiel.' } },
    ], byId as Parameters<typeof normalizeBlocks>[1], 'c1-');
    expect(blocks.map(b => b.type === 'callout' ? `${b.variant}:${b.origin}` : b.type)).toEqual(['klausurfalle:quelle', 'beispiel:ki']);
  });
});

describe('Rechenbeispiel und Meta-Sätze', () => {
  const units = [u('a', 1, 'study', 'Studie (Muster & Beispiel, 2010): wer X tut, erinnert weniger.'), u('b', 2, 'example', 'Angenommen M = 5 und M = 9.', { illustrative: true })];
  const p = (id: string, text: string, unitIds: string[]): Block => ({ id, origin: 'quelle', cites: [{ sourceId: 's', page: 1 }], unitIds, type: 'paragraph', text });
  it('„Illustrationsbeispiel“ bei einer echten Studie wird gemeldet, beim markierten Rechenbeispiel nicht', () => {
    expect(checkIllustrativeLabel([p('c1-1', 'In einem Illustrationsbeispiel nach Muster & Beispiel (2010) …', ['a'])], units).map(i => i.rule)).toEqual(['illustrative_label']);
    expect(checkIllustrativeLabel([p('c1-2', 'Ein Rechenbeispiel mit ausgedachten Werten: M = 5 und M = 9.', ['b'])], units)).toEqual([]);
  });
  it('Satz über Selbststudium oder Vorlesung im Haupttext wird gemeldet, Hinweise und Anhang nicht', () => {
    expect(checkMeta([p('c1-1', 'Gedächtnis speichert Inhalte. Das angeleitete Selbststudium vertieft das Thema.', ['a'])]).map(i => i.message))
      .toEqual(['Satz ohne fachlichen Inhalt: „Das angeleitete Selbststudium vertieft das Thema.“. Streichen oder durch den Stoff selbst ersetzen.']);
    expect(checkMeta([{ id: 'c1-se4', origin: 'quelle', cites: [], type: 'callout', variant: 'hinweis', text: 'Auf der Folie steht vermutlich …' }])).toEqual([]);
    expect(checkMeta([{ id: 'x-tasks', origin: 'quelle', cites: [], type: 'tasks', items: [{ text: 'Im Selbststudium: Kreislauf zeichnen.', cites: [] }] }])).toEqual([]);
  });
});

describe('Rechenbeispiel nur mit Werten', () => {
  it('Studie mit Autor, Jahr und Beispielnummer, aber ohne Werte, ist kein Rechenbeispiel', async () => {
    const { hasScenarioValues } = await import('./extract');
    expect(hasScenarioValues('Muster & Beispiel (2010): Beispiel 1: Lernen mit Licht? Hypothese H1: Wer bei Licht lernt, erinnert mehr.')).toBe(false);
    expect(hasScenarioValues('Eine Person schiebt das Lernen immer wieder auf.')).toBe(false);
    expect(hasScenarioValues('Gruppe 1: M = 40, Gruppe 2: M = 55.')).toBe(true);
    expect(hasScenarioValues('Wird vorher die Zahl 70 genannt, schätzen alle höher.')).toBe(true);
  });
});

describe('Rechenbeispiel als solches ausgewiesen', () => {
  it('Werte mit Autor und Jahr: Warnung nur, wenn der Text sie nicht als Rechenbeispiel ausweist', () => {
    const units = [u('a', 1, 'example', 'Angenommen: N = 60, je Gruppe n = 30 (Muster et al., 2021).', { illustrative: true })];
    const p = (text: string): Block => ({ id: 'c1-1', origin: 'quelle', cites: [{ sourceId: 's', page: 1 }], unitIds: ['a'], type: 'paragraph', text });
    expect(checkIllustrative([p('Muster et al. (2021) untersuchten N = 60, je Gruppe n = 30.')], units)).toHaveLength(1);
    expect(checkIllustrative([p('Ein Rechenbeispiel mit ausgedachten Werten nach Muster et al. (2021): N = 60, je Gruppe n = 30.')], units)).toEqual([]);
  });
});
