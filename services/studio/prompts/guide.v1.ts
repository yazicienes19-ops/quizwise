/** Lernleitfaden je Kapitel (Phase A, Schritt C und Reparatur E). Zweck: gezielt auf die Klausur vorbereiten. */
// v1 (17.10.2026): Kernbegriffe als Tabelle, Modelle und Abläufe, Studien kompakt, Verständnis- und Klausurfragen mit Antwort, Verwechslungen nur aus den Folien.
export const GUIDE_PROMPT_VERSION = 'guide.v1';

export const GUIDE_BLOCK_TYPES = ['heading', 'table', 'study', 'check', 'callout', 'bullets'];

/** Feste Teile je Kapitel, in dieser Reihenfolge; „Wichtige Studien“ und „Häufige Verwechslungen“ nur, wenn es Stoff dafür gibt. */
export const GUIDE_PARTS = {
  terms: 'Kernbegriffe',
  models: 'Modelle und Abläufe',
  studies: 'Wichtige Studien',
  questions: 'Verständnisfragen',
  exam: 'Typische Klausurfragen',
  confusions: 'Häufige Verwechslungen',
} as const;

export const GUIDE_PROMPT = `Du schreibst ein Kapitel eines Lernleitfadens zur Klausurvorbereitung. Zweck: gezielt prüfen, ob man
den Stoff kann. Du bekommst: Kapiteltitel, Abschnitte mit Einheiten (ID, Typ, Quelle, Seite, Text), Wortbudget,
optional Schwerpunkt und Klausurinfos.

Aufbau des Kapitels, genau diese Überschriften (heading), in dieser Reihenfolge:
1. heading "${GUIDE_PARTS.terms}": EINE table mit den Spalten Begriff | Erklärung. Je wichtiger Begriff eine Zeile,
   Erklärung in 1 bis 2 Sätzen aus den Einheiten, "units" je Zeile. Definitionen verschiedener Autoren je eine
   eigene Zeile, Begriff mit Autor und Jahr („Psychologie (Autor, Jahr)“). Jede Einheit vom Typ definition und
   concept kommt in einer Zeile vor. Auch jedes Phänomen und jeder Fachbegriff, der nur in einer Studie oder einem
   Befund erklärt wird (oft im Studientitel genannt), bekommt eine Zeile mit der Erklärung aus dieser Einheit.
2. heading "${GUIDE_PARTS.models}" (nur wenn es Einheiten vom Typ figure, list, comparison oder example gibt):
   Schemata, Abläufe, Kreisläufe, Aufzählungen und Beispiele. Je Modell oder Ablauf ein bullets-Block, dessen
   Stichpunkte die Schritte oder Teile in der Reihenfolge der Folie nennen (ein Kreislauf: alle Schritte bis
   zurück zum Anfang, als „Kreislauf“ bezeichnet, wenn die Folie ihn so zeigt). Beispiele als
   Stichpunkt „Beispiel: …“ mit dem, was es zeigt; „Rechenbeispiel: …“ NUR für Einheiten mit [Rechenbeispiel,
   ausgedachte Werte]. Jede dieser Einheiten kommt vor. Bei Abbildungen den Inhalt des Modells wiedergeben (was
   passiert, was folgt worauf), nie ihr Aussehen (Linien, Pfeile, Kästen).
3. heading "${GUIDE_PARTS.studies}" (nur wenn es Einheiten vom Typ study oder finding gibt): je Studie ein study-Block
   (authors, year, design in 1 Satz, result mit exakten Zahlen, conclusion). Nur wenn die Einheiten Aufbau UND
   Ergebnis nennen; sonst die Studie als Zeile in einer table Studie | Befund.
4. heading "${GUIDE_PARTS.questions}": je Abschnitt des Kapitels 1 bis 2 check-Blöcke, insgesamt mindestens 3.
   question: eine Frage, die Verständnis prüft (Warum, Wie hängt … zusammen, Was unterscheidet …), nicht nur
   Auswendiggelerntes. answer: Musterantwort in 1 bis 3 Sätzen, nur aus den Einheiten, "units" mit deren IDs.
5. heading "${GUIDE_PARTS.exam}": 2 bis 4 check-Blöcke wie in einer Klausur: Anwendung auf einen neuen Fall,
   Vergleich zweier Theorien, Transfer. answer: Lösungsskizze mit den Punkten, die eine gute Antwort enthält,
   nur aus den Einheiten, "units" mit deren IDs. Prüfungsrelevante Einheiten ([prüfungsrelevant]) zuerst.
6. heading "${GUIDE_PARTS.confusions}" (nur wenn die Einheiten selbst zwei ähnliche Begriffe abgrenzen oder
   gegenüberstellen): je Paar ein callout "klausurfalle", der Text beginnt mit „A vs. B:“ und nennt danach direkt
   den Unterschied, origin "quelle" mit units. Keine eigenen Einschätzungen, keine Gegenthesen.

Regeln:
- Nur Inhalte aus den Einheiten, origin "quelle", in "units" die IDs (höchstens 3 je Zeile oder Frage; ein
  study-Block über mehrere Folien bis zu 5, und zwar ALLE Einheiten, aus denen Aufbau und Ergebnis stammen). Kein Allgemeinwissen.
- Konkrete Ergebnisse echter Studien (Prozentwerte, „x von y“, Mittelwerte) bleiben vollständig und exakt
  erhalten, jeder Wert einzeln; nie zusammenfassen zu „bis zu …“ oder „die meisten“.
- Jede Einheit vom Typ definition, concept, study, finding, comparison, example oder figure kommt in "units"
  mindestens eines Blocks vor; Einheiten mit [prüfungsrelevant] immer.
- Die Antwort wiederholt nie die Frage, sie beantwortet sie. Kein bloßes „Ja“ oder „Nein“.
- Folientitel (das Feld vor dem Doppelpunkt einer Einheit, Überschriften einer Video- oder Bildfolie) sind
  keine Inhalte: Definitionen und Erklärungen nur aus dem Text der Einheit.
- Studienaufbau genau wie in der Einheit: Nennt die Folie Gruppen und Bedingungen nur nebeneinander, verknüpfe
  sie nicht (keine erfundene Zuordnung, welche Gruppe welche Bedingung bekam). Schluss einer Studie nur aus den
  Einheiten DIESER Studie, nie aus einer späteren Theorie desselben Autors.
- Keine Stichpunkte ohne Inhalt: ein Beispiel, das nur angekündigt wird, mit seinem Inhalt füllen oder weglassen.
- Rechenbeispiele: Einheiten mit [Rechenbeispiel, ausgedachte Werte] sind Illustrationen einer Methode, ihre
  Werte nie das Ergebnis einer Studie. Die Wörter Rechenbeispiel oder ausgedachte Werte nur für diese Einheiten.
- Jahreszahlen nur zusammen mit den Autoren („Autor (Jahr)“).
- Zeitliche oder kausale Verknüpfungen nur, wenn die Quelle sie macht und die Jahreszahlen passen.
- Bewerte die Folien nie und weise nicht auf Fehler der Folien hin.
- Keine Meta-Sätze über Vorlesung, Selbststudium oder Folien. Keine Wiederholung im Kapitel.
- Keine Quellenangaben, Seitenzahlen oder Klammern wie [1, S. 4] im Text. Fett mit **…** erlaubt, sonst kein Markdown.
- Englische Fachbegriffe beibehalten, beim ersten Mal die deutsche Übersetzung in Klammern.
- Wortbudget ±10 %, lieber knapper. Kein heading für das Kapitel selbst (das setzt der Code).
- Format: Jeder Block hat "type" und füllt NUR das Unterobjekt mit demselben Namen
  (z. B. type "check" → check.question, check.answer, check.units; type "table" → table.headers, table.rows).`;
