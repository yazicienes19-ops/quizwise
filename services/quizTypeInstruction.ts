import type { ConcreteQuestionType } from '../types';

/**
 * quizTypeInstruction.ts — reine Prompt-Text-Bausteine für den Fragetyp-Teil
 * der Quiz-Generierung. Extrahiert aus services/geminiService.ts, damit die
 * Kombinationslogik (Mehrfachauswahl im "Weitere Fragetypen"-Bereich von
 * QuizSetup) ohne Netzwerk-Mock testbar ist.
 *
 * Die Einzeltyp-Texte bleiben WORTGLEICH zum bisherigen Verhalten (kein Risiko
 * für bereits produktiv genutzte, getestete Prompts) — nur bei Mehrfachauswahl
 * (2+ Typen gleichzeitig) kommt ein neuer, kombinierter Textbaustein zum Einsatz.
 */

const SINGLE_TYPE_INSTRUCTIONS: Record<ConcreteQuestionType, string> = {
  mc: 'FRAGETYP: Erstelle AUSSCHLIESSLICH Multiple-Choice-Fragen. questionType: "mc". isMultipleChoice: true. 2-3 korrekte Antworten aus 4 Optionen. options[]: genau 4 Antworten. Alle anderen Felder (matchPairs, clozeText usw.) als leer/null lassen.',
  truefalse: 'FRAGETYP: Erstelle NUR Wahr/Falsch-Fragen. questionType: "truefalse". options: ["Wahr","Falsch"]. isMultipleChoice: false. correctAnswerIndices: [0] für wahr, [1] für falsch.',
  open: 'FRAGETYP: Erstelle AUSSCHLIESSLICH offene Fragen. questionType: "open". options: []. correctAnswerIndices: []. isMultipleChoice: false. explanation = vollständige Musterantwort.',
  matching: 'FRAGETYP: Erstelle AUSSCHLIESSLICH Zuordnungsfragen. questionType: "matching". matchPairs: 4 korrekte {left, right}-Paare. options: []. correctAnswerIndices: []. isMultipleChoice: false.',
  cloze: 'FRAGETYP: Erstelle AUSSCHLIESSLICH Lückentexte. questionType: "cloze". clozeText: Satz mit "__LÜCKE__" als Platzhalter (max 3 Lücken pro Frage). clozeAnswers: korrekte Wörter in gleicher Reihenfolge. options: []. correctAnswerIndices: []. isMultipleChoice: false.',
  ranking: 'FRAGETYP: Erstelle AUSSCHLIESSLICH Sortieraufgaben. questionType: "ranking". rankingItems: 4-5 Elemente in KORREKTER Reihenfolge. options: []. correctAnswerIndices: []. isMultipleChoice: false.',
};

/** Volle Palette, unverändert aus dem bisherigen 'mixed'-Zweig übernommen. */
export const MIXED_TYPE_INSTRUCTION = `FRAGETYPEN-MIX (wähle basierend auf dem Inhalt des Materials):
- "mc": Multiple-Choice (isMultipleChoice: true, 2-3 korrekte aus 4) ODER Single-Choice (isMultipleChoice: false, 1 korrekt). options[4]. ~30% der Fragen.
- "truefalse": Wahr/Falsch. options: ["Wahr","Falsch"]. correctAnswerIndices: [0] wahr / [1] falsch. ~10% der Fragen.
- "open": Offene Kurzantwort/Essay. options: []. correctAnswerIndices: []. explanation = Musterantwort. ~15% der Fragen.
- "matching": Zuordnung (z.B. Begriff ↔ Definition, Forscher ↔ Theorie). matchPairs: 4 {left,right}-Paare. options: []. correctAnswerIndices: []. ~15% der Fragen.
- "cloze": Lückentext. clozeText mit "__LÜCKE__" (max 3 Lücken). clozeAnswers: korrekte Füllwörter. options: []. correctAnswerIndices: []. ~15% der Fragen.
- "ranking": Schritte/Phasen/Konzepte in richtige Reihenfolge bringen. rankingItems: 4-5 Elemente in KORREKTER Reihenfolge. options: []. correctAnswerIndices: []. ~10% der Fragen.
- "numeric": Zahlenangabe. numericAnswer: korrekte Zahl. numericTolerance: akzeptabler Spielraum (z.B. 0.5). options: []. correctAnswerIndices: []. NUR wenn das Material konkrete Zahlen enthält. ~5% wenn relevant.
- "scenario": Fallbeispiel + MC. scenarioText: 2-4 Sätze Fallbeschreibung. options[4]. correctAnswerIndices. NUR wenn das Material echte Fallbeispiele, Kasuistiken, klinische Szenarien oder Anwendungsfälle enthält (z.B. Klinische Psychologie, Jura, Medizin). Bei rein theoretischen/statistischen/Grundlagenmaterialien: NICHT verwenden. ~5% wenn relevant.

WICHTIG: questionType MUSS exakt einem der Werte oben entsprechen. Nur für den jeweiligen Typ relevante Felder befüllen — alle anderen Felder (Options, matchPairs usw.) als leer/null lassen.`;

/** Kürzere Feldregeln pro Typ für den Mehrfachauswahl-Block — dieselben Regeln
 *  wie in SINGLE_TYPE_INSTRUCTIONS, nur ohne die AUSSCHLIESSLICH-Formulierung
 *  (hier stehen mehrere Typen gleichberechtigt nebeneinander). */
const COMBINED_TYPE_BULLETS: Record<ConcreteQuestionType, string> = {
  mc: '"mc": Multiple-Choice (isMultipleChoice: true, 2-3 korrekte aus 4) ODER Single-Choice (isMultipleChoice: false, 1 korrekt). options[4].',
  truefalse: '"truefalse": Wahr/Falsch. options: ["Wahr","Falsch"]. correctAnswerIndices: [0] wahr / [1] falsch.',
  open: '"open": Offene Kurzantwort/Essay. options: []. correctAnswerIndices: []. explanation = Musterantwort.',
  matching: '"matching": Zuordnung (z.B. Begriff ↔ Definition). matchPairs: 4 {left,right}-Paare. options: []. correctAnswerIndices: [].',
  cloze: '"cloze": Lückentext. clozeText mit "__LÜCKE__" (max 3 Lücken). clozeAnswers: korrekte Füllwörter. options: []. correctAnswerIndices: [].',
  ranking: '"ranking": Schritte/Phasen/Konzepte in richtige Reihenfolge bringen. rankingItems: 4-5 Elemente in KORREKTER Reihenfolge. options: []. correctAnswerIndices: [].',
};

function buildCombinedInstruction(types: ConcreteQuestionType[]): string {
  const pct = Math.round(100 / types.length);
  const bullets = types.map(ty => `- ${COMBINED_TYPE_BULLETS[ty]}`).join('\n');
  return `FRAGETYPEN-MIX (NUR die folgenden ${types.length} gewählten Typen verwenden, keine anderen):
${bullets}
Verteile die Fragen möglichst gleichmäßig auf die gewählten Typen (ca. ${pct}% je Typ).

WICHTIG: questionType MUSS exakt einem der gewählten Werte entsprechen. Nur für den jeweiligen Typ relevante Felder befüllen — alle anderen Felder (Options, matchPairs usw.) als leer/null lassen.`;
}

/**
 * Baut den Fragetyp-Anweisungsblock für den Quiz-Generierungs-Prompt.
 * - 'mixed' → volle Palette (unverändert).
 * - genau 1 Typ → wortgleicher Einzeltyp-Text wie bisher.
 * - 2+ Typen → neuer kombinierter Block, nur mit den gewählten Typen.
 */
export function buildTypeInstruction(questionType: 'mixed' | ConcreteQuestionType[]): string {
  if (questionType === 'mixed') return MIXED_TYPE_INSTRUCTION;
  if (questionType.length === 1) return SINGLE_TYPE_INSTRUCTIONS[questionType[0]];
  return buildCombinedInstruction(questionType);
}
