/** Prüfer (Schritt D). */
// v2 (16.10.2026): Tabellenzellen, Zuspitzungen ohne Beleg, Rechenbeispiele als Studienergebnis.
// v3 (17.10.2026): unmarkierte Aussagen ohne Beleg, auch Einschränkungen und Klausurfallen; Weglassungen sind kein Problem;
// erfundene Zuordnungen von Gruppen und Bedingungen.
export const CHECKER_PROMPT_VERSION = 'checker.v3';

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
8. Unmarkierte Aussagen ohne Beleg: Ein Block mit origin "quelle" (auch Klausurfallen und Beispiele) enthält
   eine Aussage, Einschränkung oder Gegenthese, die in keiner zitierten Einheit steht (z. B. „nicht zwingend“,
   „nicht unbedingt“, „entgegen der verbreiteten Annahme“): melde nicht_belegt und zitiere die Aussage.
9. Studienaufbau: Verknüpft ein Block Gruppen mit Bedingungen („die Gruppe X bekam Y“, „passend zu …“), die die
   Einheit nur nebeneinander nennt, melde nicht_belegt.
Nicht melden: ein Jahr, das in einer der zitierten Einheiten für dieselben Autoren steht (Folien nennen manchmal
zwei Jahre für dieselbe Arbeit). Weglassungen: Nennt der Text einen Autor, ein Jahr oder ein Detail nicht, das in der Einheit steht,
ist das kein Problem (nur falsche, unbelegte oder zugespitzte Aussagen sind Probleme).
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
