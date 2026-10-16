/** Prüfer (Schritt D). */
export const CHECKER_PROMPT_VERSION = 'checker.v1';

export const CHECKER_PROMPT = `Du prüfst einen generierten Lerntext (Blöcke) gegen die Einheiten. Melde NUR echte
Probleme als Liste {blockId, typ, problem, korrektur}.
typ ∈ nicht_belegt | falsch | chronologie | zitat_falsch | ki_fakt

Prüfe:
1. Ist jede Aussage mit origin "quelle" durch die zitierten Einheiten belegt?
2. Stimmen Zahlen, Namen und Jahreszahlen exakt?
3. Sind kausale/zeitliche Verknüpfungen mit den Jahreszahlen vereinbar?
   (Eine Studie von 2011 kann keine Theorie von 1964 ausgelöst haben.)
4. Führt ein origin-"ki"-Block neue Fakten ein?
Keine Stilkritik. Leere Liste, wenn alles stimmt.`;

export const checkerSchema = {
  type: 'OBJECT',
  properties: {
    issues: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          blockId: { type: 'STRING' },
          typ: { type: 'STRING', enum: ['nicht_belegt', 'falsch', 'chronologie', 'zitat_falsch', 'ki_fakt'] },
          problem: { type: 'STRING' },
          korrektur: { type: 'STRING' },
        },
        required: ['blockId', 'typ', 'problem'],
      },
    },
  },
  required: ['issues'],
};
