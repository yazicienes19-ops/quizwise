import type { ProcessedDocument, QuizQuestion } from '../types';
import { documentDisplayName } from './libraryService';

// ── Multi-Dokument-Quizzes: nummerierte Quellen ──────────────────────────────
// Paket-3-Kriterium "pro Frage aus welchem Dokument sie stammt" (Feature-Audit
// 2026-08-22): Bei Quizzen über mehrere Dokumente gleichzeitig bekommt jeder
// Quellblock im Prompt eine stabile Nummer, die KI muss je Frage die Nummer
// ihres Ursprungs-Dokuments liefern (sourceNumber), und der Client übersetzt
// diese Nummer zurück in Dokument-ID + Anzeigename.
//
// Bewusst NICHT über den Dokument-Namen gelöst: Namen können sich doppeln,
// abgeschnitten werden oder Trennzeichen enthalten — eine Ganzzahl ist die
// robusteste Brücke zwischen Prompt und Client. Die alten "[Quelle: …]"-
// Marker anderer Prompts (collectionSource, graphMissingConceptSource) bleiben
// unangetastet — dort wird keine pro-Frage-Zuordnung benötigt.

/** Grobe Obergrenze je Kombination — gleiche Schwelle wie collectionSource
 *  (Einzel-Ordner), damit Multi-Doc den Kontext nicht sprengen kann. */
const MAX_TOTAL_CHARS = 80_000;
/** Pauschaler Framing-Reserveanteil je Block ([DOKUMENT n: Name]-Kopf,
 *  Kürzungsmarker, Trenner) — damit das Gesamtergebnis inklusive Rahmen
 *  unter dem Cap bleibt, ohne die Namen vorab messen zu müssen. */
const PER_DOC_FRAMING_CHARS = 160;
/** Unter diese Kürzung kürzt es nicht mehr — lieber ein knappes, aber
 *  repräsentatives Excerpt pro Dokument als leere Blöcke. */
const MIN_DOC_BUDGET = 1_000;

/**
 * Nummerierte Quellblöcke für den Generierungs-Prompt (1-basiert).
 *
 * Token-Cap (Feature-Audit 2026-08-22): übersteigt die Summe der Texte das
 * Budget, wird JEDES Dokument auf seinen Anteil gekürzt statt ganze Dokumente
 * wegzulassen — die Block-Nummerierung muss stabil bleiben, weil
 * attachMultiDocSources sourceNumber gegen den Index in `docs` mappt.
 */
export function buildCombinedMultiDocText(docs: ProcessedDocument[]): string {
  const texts = docs.map(d => (d.digestText || (d.type === 'text' ? d.content : '')).trim());
  const totalChars = texts.reduce((sum, t) => sum + t.length, 0);
  const overBudget = totalChars > MAX_TOTAL_CHARS && docs.length > 0;
  // Gleichmäßiges Anteils-Budget abzüglich Framing-Reserve; mindestens
  // MIN_DOC_BUDGET, damit ein einzelnes riesiges Dokument neben kleinen
  // nicht alle anderen auf null kürzt.
  const budget = Math.max(MIN_DOC_BUDGET, Math.floor((MAX_TOTAL_CHARS - PER_DOC_FRAMING_CHARS * docs.length) / Math.max(1, docs.length)));

  return docs
    .map((d, i) => {
      let text = texts[i];
      if (overBudget && text.length > budget) text = `${text.slice(0, budget)}\n[…gekürzt]`;
      return `[DOKUMENT ${i + 1}: ${documentDisplayName(d)}]\n${text}`;
    })
    .join('\n\n---\n\n');
}

/**
 * Prompt-Ergänzung für Multi-Doc-Sessions — als Pflichtfeld formuliert und im
 * responseSchema (geminiService) tatsächlich required gesetzt, damit das Modell
 * sourceNumber nicht einfach weglässt.
 */
export function multiDocPromptRules(count: number): string {
  return `\nMEHRDOKUMENTEN-QUELLE: Das Material besteht aus nummerierten Blöcken "[DOKUMENT n: Name]". Weise JEDER Frage im Feld sourceNumber die Nummer des Dokuments zu, aus dem sie überwiegend stammt (Ganzzahl 1 bis ${count}). Eine einzelne Frage darf niemals Inhalte mehrerer Dokumente mischen.\n`;
}

/**
 * Übersetzt die KI-Angabe sourceNumber (1-basiert) zurück in Dokument-ID und
 * Anzeigename. Defensiv: fehlende/außerhalb-des-Bereichs-liegende Angaben
 * (ältere Sessions, Modell-Ausreißer) lassen die Felder weg statt zu crashen —
 * das Badge im Player erscheint dann schlicht nicht.
 */
export function attachMultiDocSources(
  questions: QuizQuestion[],
  docs: ProcessedDocument[],
): QuizQuestion[] {
  if (docs.length === 0) return questions;
  return questions.map(q => {
    const n = q.sourceNumber;
    if (typeof n !== 'number' || !Number.isInteger(n) || n < 1 || n > docs.length) return q;
    const doc = docs[n - 1];
    return { ...q, sourceDocId: doc.id, sourceDocName: documentDisplayName(doc) };
  });
}
