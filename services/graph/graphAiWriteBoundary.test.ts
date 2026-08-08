import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * "KI schreibt nie in den Graphen" (s. Memory project_quizwise_wissensnetz_coach.md)
 * war bisher nur ein Datei-Kommentar in graphMutationService.ts, keine
 * erzwungene Prüfung. Dieser Test macht daraus eine echte Schranke: keine
 * KI-Datei darf graphMutationService (oder graphHistoryService, das es
 * kapselt und denselben Schreibzugriff böte) importieren.
 *
 * Bei jedem neuen KI-Feature im Wissensnetz die betroffene Datei hier zu
 * AI_FILES ergänzen — sonst prüft dieser Test sie nicht mit.
 */
const AI_FILES = [
  'services/geminiService.ts',
  'services/graph/graphEdgeExplanationSource.ts',
  'services/graph/graphRelationSuggestionSource.ts',
  'services/graph/graphDuplicateSuggestionSource.ts',
  'services/graph/graphMissingConceptSource.ts',
];

const FORBIDDEN = [/graphMutationService/, /graphHistoryService/];

describe('KI-Code darf den Graphen nie schreibend anfassen', () => {
  it.each(AI_FILES)('%s importiert keine Schreibfunktionen des Graphen', file => {
    const content = readFileSync(resolve(process.cwd(), file), 'utf-8');
    for (const pattern of FORBIDDEN) {
      expect(content).not.toMatch(pattern);
    }
  });
});
