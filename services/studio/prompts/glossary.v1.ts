/** Glossar je Kapitel (Phase A, Schritt C und Reparatur E); der Code führt alle Kapitel alphabetisch zusammen. */
// v1 (17.10.2026): eine Tabelle Begriff | Erklärung, Definitionen je Autor, Phänomene aus Studien, Synonyme in Klammern;
// Grundbegriffe aus den Erklärungen als eigene Einträge, keine Sammel- oder erfundenen Begriffe, Folienbeispiele erlaubt.
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
- Jeder Fachbegriff, den du in einer Erklärung verwendest und den eine Einheit erklärt, bekommt eine eigene
  Zeile, auch wenn er nur innerhalb einer größeren Einheit erklärt wird (z. B. die Bausteine eines Verfahrens,
  Fachwörter einer Theorie, Gegenbegriffe). Abkürzungen als eigene Zeile: „Langform (Abkürzung)“, wenn die Folie die Langform nennt, sonst nur die Abkürzung.
- Grundbegriffe vor Randbegriffen: keine Sammeleinträge wie „Eigenschaften von X“ oder „Merkmale von Y“;
  stattdessen je Begriff eine Zeile.
- Keine Personen, keine Studien als eigene Einträge (eine Studie darf in der Erklärung als Beleg stehen:
  „… (Autor, Jahr)“), keine Rechenbeispiele, keine Fragen, nichts Organisatorisches.
- Theorien und Modelle, zu denen die Folie Autor und Jahr nennt: „Theorie (Autor, Jahr)“. Personen sonst nie
  in den Begriff.

Wie:
- Begriff genau so, wie er auf der Folie steht; bilde keine neuen Begriffsnamen (keine Kombinationen aus
  Begriff und Person, die so nicht auf der Folie stehen). Im Singular, außer die Folie nennt nur die Mehrzahl.
  Englischer Fachbegriff: deutscher Begriff in Klammern dahinter
  („Inattentional Blindness (Unaufmerksamkeitsblindheit)“). Synonyme der Folie ebenfalls in Klammern.
- Definitionen verschiedener Autoren: je Autor eine eigene Zeile, Begriff mit Autor und Jahr
  („Psychologie (Autor, Jahr)“). Nie zu einer verschmelzen. Herkunft eines Wortes als „Begriff (Begriffsursprung)“.
- Erklärung in 1 bis 2 Sätzen, höchstens 40 Wörter, nur aus den Einheiten; konkrete Zahlen nur, wenn sie den
  Begriff ausmachen. Keine Zuspitzungen, keine eigenen Beispiele. Nennt die Folie ein Beispiel, das den Begriff
  zeigt, gehört es kurz in die Erklärung („Beispiel: „…““), vor allem bei abstrakten Begriffen.
- Folientitel (das Feld vor dem Doppelpunkt einer Einheit) sind keine Inhalte: Erklärungen nur aus dem Text.
- Jeder Begriff genau einmal; erklären zwei Einheiten denselben Begriff, eine Zeile mit beiden in "units".
- Keine Quellenangaben, Seitenzahlen oder Klammern wie [1, S. 4] im Text. Fett mit **…** erlaubt, sonst kein Markdown.
- Bewerte die Folien nie und weise nicht auf Fehler der Folien hin.
- Format: type "table", nur das Unterobjekt table (table.headers, table.rows mit cells und units).`;

/** Begriffsliste je Kapitel (vor dem Schreiben): Pflichtbegriffe des Glossars. */
export const GLOSSARY_TERMS_PROMPT = `Liste alle Fachbegriffe, die die Einheiten dieses Kapitels erklären oder definieren. Zweck: Pflichtliste
für ein Glossar zum Nachschlagen.

Regeln:
- Auch Begriffe, die nur innerhalb einer größeren Einheit erklärt werden: Bausteine eines Verfahrens, Variablen,
  Hypothesenarten, Gütekriterien und ihre Unterarten, Fachwörter einer Theorie oder eines Paradigmas,
  Gegenbegriffe (wird ein Begriff einem anderen gegenübergestellt, beide), Methoden, Abkürzungen.
- Auch Fachbegriffe, die ein Beispiel oder Rechenbeispiel einführt oder benennt (nur die ausgedachten Werte nicht).
- Auch Schlagwörter, Prinzipien und Metaphern, mit denen die Folie eine Theorie kennzeichnet (oft in
  Anführungszeichen oder als Zusatz zum Theorienamen).
- Begriff genau in der Schreibweise der Einheit; Abkürzungen mit Langform, wenn die Einheit sie nennt
  („Langform (Abkürzung)“).
- Keine Sammelbegriffe („Eigenschaften von …“, „Merkmale von …“, „Arten von …“), keine Personen, keine Studien,
  keine Beispiele, keine Rechenbeispiele, nichts Organisatorisches.
- Definieren mehrere Autoren denselben Begriff: je Autor ein Eintrag „Begriff (Autor, Jahr)“.
- Je Begriff die IDs der Einheiten, die ihn erklären.`;

export const glossaryTermsSchema = {
  type: 'OBJECT',
  properties: {
    terms: { type: 'ARRAY', items: { type: 'OBJECT', properties: { term: { type: 'STRING' }, units: { type: 'ARRAY', items: { type: 'STRING' } } }, required: ['term', 'units'] } },
  },
  required: ['terms'],
};
