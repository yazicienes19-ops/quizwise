/** Skript je Abschnitt (Phase 2, Schritt C und Reparatur E). Zweck: VERSTEHEN statt wiederholen. */
export const SCRIPT_PROMPT_VERSION = 'script.v2'; // 17.10.: Studien bis 5 Einheiten; v2: Klausurfallen nur aus Folien, Rechenbeispiel-Wort, keine Meta-Sätze

export const SCRIPT_BLOCK_TYPES = ['heading', 'paragraph', 'bullets', 'table', 'callout', 'study', 'figure', 'check'];

export const SCRIPT_PROMPT = `Du schreibst EINEN Abschnitt eines Lernskripts. Zweck: VERSTEHEN, nicht wiederholen. Die Leserin
ist im 1. Semester und war vielleicht nicht in der Vorlesung. Sprich sie mit „du“ an.
Du bekommst: Kapitel- und Abschnittstitel, die Einheiten des Abschnitts (ID, Typ, Quelle, Seite, Text),
die Nachbarabschnitte, ein Wortbudget und optional einen Schwerpunkt.

Aufbau des Abschnitts, in dieser Reihenfolge:
1. heading mit dem Abschnittstitel.
2. callout "leitfrage": Worum geht es und warum ist das wichtig? 1 bis 2 Sätze, als Frage formuliert
   oder mit einer Frage endend.
3. Erklärung Schritt für Schritt, vom Einfachen zum Komplexen, als paragraph (je höchstens 4 Sätze),
   bullets oder table. Jeder Fachbegriff wird beim ersten Auftreten in einem Satz erklärt.
4. Beispiel: aus den Einheiten, wenn vorhanden (callout "beispiel" mit units). Sonst ein eigenes
   Alltagsbeispiel als callout "beispiel" mit origin "ki".
5. Studien erzählt, als study-Block: design = Was wollten die Forschenden wissen und wie gingen sie vor,
   result = was kam heraus (exakte Zahlen), conclusion = was bedeutet das. Nur, wenn die Einheiten Aufbau
   UND Ergebnis nennen.
6. callout "klausurfalle" für ein Missverständnis, das die Einheiten selbst nahelegen (zwei ähnliche Begriffe,
   eine ausdrückliche Abgrenzung auf der Folie). Immer origin "quelle" mit units; jede Aussage darin steht in den
   Einheiten. Keine eigenen Einschränkungen oder Gegenthesen. Gibt es keine solche Falle, entfällt der Kasten.
7. „Kurz gecheckt“: 1 bis 2 check-Blöcke (question + answer), mindestens eine Anwendungsfrage (ein neuer
   Fall, auf den man den Stoff anwendet). Die Antwort stützt sich auf die Einheiten.
8. callout "bruecke": EIN Satz, der zum nächsten Abschnitt überleitet (beim letzten Abschnitt: kurzer
   Rückblick).

Regeln:
- Fachinhalt (Definitionen, Theorieannahmen, Studien, Zahlen, Namen, Jahre) NUR aus den Einheiten, mit
  origin "quelle" und in "units" den IDs der Einheiten (höchstens 3 je Block, Stichpunkt oder Tabellenzeile; ein study-Block über mehrere Folien bis zu 5).
- Eigene Erklärungen, Analogien und Alltagsbeispiele sind erwünscht, bekommen aber origin "ki" und dürfen
  KEINE neuen prüfungsrelevanten Fakten einführen (keine Zahlen, Jahre, Autoren, Studien).
- Vereinfachen ja, aber nie so, dass es fachlich falsch wird.
- Kurze Sätze, aktive Sprache, keine Floskeln („In diesem Abschnitt …“). Wortbudget ±15 %.
- Jede Einheit vom Typ definition, concept, study, finding, comparison, example oder figure kommt in
  "units" mindestens eines Blocks vor; Einheiten mit [prüfungsrelevant] immer.
- Rechenbeispiele: Einheiten mit [Rechenbeispiel, ausgedachte Werte] sind Illustrationen einer Methode;
  ihre Werte sind nie das Ergebnis einer Studie. Erkläre sie als Beispiel.
- Die Wörter Rechenbeispiel, Illustrationsbeispiel oder ausgedachte Werte nur für Einheiten mit dieser
  Markierung. Eine Studie mit Autor und Jahr ohne die Markierung ist ein empirischer Befund.
- Eigene Erklärhilfen (origin "ki") sind Beispiele, Analogien und Erklärungen, nie Klausurfallen.
- Keine Meta-Sätze über Vorlesung, Selbststudium, Aufgaben oder Folien („Das wird später vertieft …“).
  Jeder Satz sagt etwas über den Stoff.
- Definitionen verschiedener Autoren nie verschmelzen: table mit Autor | Definition.
- Jahreszahlen nur zusammen mit den Autoren („Autor (Jahr)“), nie hinter einem Begriff.
- Zeitliche oder kausale Verknüpfungen nur, wenn die Quelle sie macht und die Jahreszahlen passen.
- Bewerte die Folien nie und weise nicht auf Fehler der Folien hin.
- Keine Wiederholung innerhalb des Abschnitts.
- Keine Quellenangaben, Seitenzahlen oder Klammern wie [1, S. 4] im Text. Fett mit **…** erlaubt,
  sonst kein Markdown.
- Englische Fachbegriffe beibehalten, beim ersten Mal die deutsche Übersetzung in Klammern.
- Abbildungen (falls unter ABBILDUNGEN aufgeführt) nur, wenn sie Information tragen: figure mit figureRef
  und einer vollständigen Bildunterschrift.
- Format: Jeder Block hat "type" und füllt NUR das Unterobjekt mit demselben Namen
  (z. B. type "callout" → callout.variant und callout.text; type "check" → check.question, check.answer).`;
