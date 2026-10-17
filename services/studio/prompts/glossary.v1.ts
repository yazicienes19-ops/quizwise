/** Glossar je Kapitel (Phase A, Schritt C und Reparatur E); der Code führt alle Kapitel alphabetisch zusammen. */
// v1 (17.10.2026): eine Tabelle Begriff | Erklärung, Definitionen je Autor, Phänomene aus Studien, Synonyme in Klammern.
export const GLOSSARY_PROMPT_VERSION = 'glossary.v1';

export const GLOSSARY_BLOCK_TYPES = ['table'];

export const GLOSSARY_PROMPT = `Du schreibst die Einträge eines Glossars zu einem Kapitel. Zweck: Fachbegriffe schnell nachschlagen.
Du bekommst: Kapiteltitel, Abschnitte mit Einheiten (ID, Typ, Quelle, Seite, Text), Wortbudget.

Ausgabe: GENAU EINE table mit origin "quelle" und den Spalten Begriff | Erklärung. Je Fachbegriff eine Zeile,
in "units" je Zeile die IDs der Einheiten, aus denen die Erklärung stammt (höchstens 3).

Welche Begriffe:
- Jede Einheit vom Typ definition und concept ergibt mindestens eine Zeile.
- Dazu jedes Phänomen, jeder Effekt, jedes Paradigma, Modell oder jede Theorie, die eine Einheit benennt und
  erklärt, auch wenn sie nur im Titel einer Studie steht.
- Keine Personen, keine Studien als eigene Einträge (eine Studie darf in der Erklärung als Beleg stehen:
  „… (Autor, Jahr)“), keine Beispiele, keine Rechenbeispiele, keine Fragen, nichts Organisatorisches.

Wie:
- Begriff wie auf der Folie geschrieben. Englischer Fachbegriff: deutscher Begriff in Klammern dahinter
  („Inattentional Blindness (Unaufmerksamkeitsblindheit)“). Synonyme der Folie ebenfalls in Klammern.
- Definitionen verschiedener Autoren: je Autor eine eigene Zeile, Begriff mit Autor und Jahr
  („Psychologie (Autor, Jahr)“). Nie zu einer verschmelzen.
- Erklärung in 1 bis 2 Sätzen, höchstens 40 Wörter, nur aus den Einheiten; konkrete Zahlen nur, wenn sie den
  Begriff ausmachen. Keine Zuspitzungen, keine eigenen Beispiele.
- Folientitel (das Feld vor dem Doppelpunkt einer Einheit) sind keine Inhalte: Erklärungen nur aus dem Text.
- Jeder Begriff genau einmal; erklären zwei Einheiten denselben Begriff, eine Zeile mit beiden in "units".
- Keine Quellenangaben, Seitenzahlen oder Klammern wie [1, S. 4] im Text. Fett mit **…** erlaubt, sonst kein Markdown.
- Bewerte die Folien nie und weise nicht auf Fehler der Folien hin.
- Format: type "table", nur das Unterobjekt table (table.headers, table.rows mit cells und units).`;
