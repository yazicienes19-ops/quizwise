/** Häufige Fragen je Kapitel (Phase A, Schritt C und Reparatur E). Zweck: die Fragen beantworten, die man beim Lernen wirklich hat. */
// v1 (17.10.2026): je Abschnitt mindestens eine Frage, vom Grundlegenden zum Fortgeschrittenen, belegte Antworten.
export const FAQ_PROMPT_VERSION = 'faq.v1';

export const FAQ_BLOCK_TYPES = ['check'];

export const FAQ_PROMPT = `Du schreibst die häufigen Fragen (FAQ) zu einem Kapitel. Zweck: die Fragen beantworten, die Studierende beim
Lernen wirklich stellen. Du bekommst: Kapiteltitel, Abschnitte mit Einheiten (ID, Typ, Quelle, Seite, Text),
Wortbudget.

Ausgabe: nur check-Blöcke (origin "quelle"), je Frage einer: question = die Frage, answer = die Antwort,
"units" = die IDs der Einheiten, aus denen die Antwort stammt (höchstens 3).

Welche Fragen:
- Je Abschnitt des Kapitels mindestens eine Frage, insgesamt etwa eine Frage je 4 bis 5 inhaltliche Einheiten;
  wichtige Abschnitte und Einheiten mit [prüfungsrelevant] mehr.
- So, wie Studierende fragen: „Was ist der Unterschied zwischen A und B?“, „Warum …?“, „Wie hängt A mit B
  zusammen?“, „Was zeigt die Studie von …?“, „Woran erkenne ich …?“, „Was bedeutet … genau?“.
- Reihenfolge vom Grundlegenden zum Fortgeschrittenen.
- Keine Fragen zu Organisatorischem, zur Klausur oder zu den Folien selbst; keine Fragen, die sich ohne den Stoff
  beantworten lassen.
- Jede Frage nur einmal; zwei Fragen nie mit derselben Antwort.

Antworten:
- 2 bis 4 Sätze, höchstens 80 Wörter, nur aus den Einheiten, beantworten die Frage direkt im ersten Satz.
- Wiederholen nie die Frage. Kein bloßes „Ja“ oder „Nein“.
- Zahlen, Namen und Jahre exakt wie in den Einheiten; Studien als „Autor (Jahr)“.
- Rechenbeispiele ([Rechenbeispiel, ausgedachte Werte]) nur als Beispiel, ihre Werte nie als Ergebnis einer Studie.
- Folientitel (das Feld vor dem Doppelpunkt einer Einheit) sind keine Inhalte.
- Verschiedene Beispiele der Folien nie in einer Antwort verbinden („analog“, „ebenso“); je Beispiel eine eigene Frage.
- Keine Zuspitzungen („immer“, „nur“, „automatisch“), keine eigenen Beispiele, kein Allgemeinwissen.
- Keine Quellenangaben, Seitenzahlen oder Klammern wie [1, S. 4] im Text. Fett mit **…** erlaubt, sonst kein Markdown.
- Bewerte die Folien nie und weise nicht auf Fehler der Folien hin.
- Format: type "check", nur das Unterobjekt check (check.question, check.answer, check.units).`;
