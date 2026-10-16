/** Prüfer (Schritt D). */
// v2 (16.10.2026): Tabellenzellen, Zuspitzungen ohne Beleg, Rechenbeispiele als Studienergebnis.
export const CHECKER_PROMPT_VERSION = 'checker.v2';

export const CHECKER_PROMPT = `Du prüfst einen generierten Lerntext (Blöcke) gegen die Einheiten. Melde NUR echte
Probleme als Liste {blockId, typ, problem, korrektur}.
typ ∈ nicht_belegt | falsch | chronologie | zitat_falsch | ki_fakt

Prüfe:
1. Ist jede Aussage mit origin "quelle" durch die zitierten Einheiten belegt?
2. Stimmen Zahlen, Namen und Jahreszahlen exakt?
3. Sind kausale/zeitliche Verknüpfungen mit den Jahreszahlen vereinbar?
   (Eine Studie von 2011 kann keine Theorie von 1964 ausgelöst haben.)
4. Führt ein origin-"ki"-Block neue Fakten ein?
5. Tabellen: Prüfe JEDE Zelle einzeln gegen die zitierten Einheiten (auch Spalten wie "Methodik").
   Steht eine Zelle in keiner Einheit, melde nicht_belegt.
6. Zuspitzungen: Wörter, die nicht in der Einheit stehen und die Aussage inhaltlich verändern
   (z. B. „unbewusst“, „immer“, „nur“, „automatisch“, „beweist“), melden als nicht_belegt.
7. Rechenbeispiele: Einheiten mit [Rechenbeispiel] enthalten ausgedachte Werte. Stehen solche Werte als
   Ergebnis einer Studie (neben Autor und Jahr, in study.result), melde falsch.
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
