/** Zusammenfassung je Kapitel (Schritt C und Reparatur E). */
export const SUMMARY_PROMPT_VERSION = 'summary.v1';

export const SUMMARY_BLOCK_TYPES = ['heading', 'paragraph', 'bullets', 'table', 'callout', 'study', 'figure'];

export const SUMMARY_PROMPT = `Du schreibst ein Kapitel einer Lernzusammenfassung für Studierende. Zweck: WIEDERHOLEN
vor der Klausur. Du bekommst: Kapiteltitel, Abschnitte mit Einheiten (ID, Typ, Quelle, Seite, Text),
Wortbudget, optional Schwerpunkt und Klausurinfos.

Regeln:
1. Nur Inhalte aus den Einheiten. Kein Allgemeinwissen ergänzen.
2. Wortbudget ±10 % einhalten. Lieber streichen als Füllsätze. Keine Einleitungen
   wie „In diesem Abschnitt …“.
3. Stichpunkte statt Fließtext. Absätze nur für echte Zusammenhänge, max. 3 Sätze.
4. Sobald ≥ 2 Theorien/Begriffe/Studien mit gleichen Merkmalen beschrieben werden
   → table (z. B. Ort der Selektion | Umgang mit Unbeachtetem | Prinzip).
5. Studien als study-Block: authors, year, design (Aufbau in 1 Satz), result (Ergebnis mit exakten
   Zahlen), conclusion (Schlussfolgerung).
6. Genau 1 callout mit variant "merksatz" pro Kapitel. "klausurfalle", wenn Begriffe leicht verwechselt
   werden (z. B. Rosenthal- vs. Halo-Effekt) oder die Quelle selbst Fallen enthält.
7. Einheiten vom Typ source_error → callout "hinweis" („Auf Folie X steht vermutlich versehentlich …“).
   Aufgaben und Organisatorisches kommen hier nicht vor (werden separat gesammelt).
8. Zeitliche oder kausale Verknüpfungen („führte zu“, „daraufhin“, „als Reaktion auf“)
   nur, wenn die Quelle sie macht UND die Jahreszahlen passen.
9. Eigene Einordnung höchstens 1× als callout "einordnung" mit origin "ki", nie als
   Vorlesungsinhalt formuliert. Alles andere hat origin "quelle".
10. Jeder Block und jeder Stichpunkt bekommt in "units" genau die IDs der Einheiten, aus denen er stammt
    (höchstens 3). Keine Quellenangaben, Seitenzahlen oder Klammern wie [1, S. 4] im Text.
11. Deutsch, präzise. Englische Fachbegriffe beibehalten, beim ersten Mal die deutsche
    Übersetzung in Klammern.
12. Gliederung: Für jeden Abschnitt ein heading mit level 3 und dessen Titel. Kein heading für das
    Kapitel selbst (das setzt der Code).
13. Abbildungen (falls unter ABBILDUNGEN aufgeführt) nur, wenn sie Information tragen, die nicht im
    Text steht (Diagramme, Modelle): Block type "figure" mit figureRef und einer vollständigen
    Bildunterschrift in "caption" (ein ganzer Satz, nie abgekürzt).
14. Fett mit **…** ist erlaubt, sonst kein Markdown.`;
