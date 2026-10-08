# StudeArc KI-Benchmark

Misst, welches Modell welche **echte** KI-Funktion der App am besten erledigt: Qualität, Zuverlässigkeit, Geschwindigkeit, Kosten. Kein allgemeiner KI-Test: Jede Anfrage ist genau die, die `services/geminiService.ts` an das Backend schickt (Prompt, Schema, Temperatur, Flags).

## Was wird getestet?

| Funktion | App-Funktion | Modell heute |
|---|---|---|
| Quiz erstellen | `generateQuizFromDocument` | Lite |
| Karten erstellen | `generateFlashcardsFromDocument` | Lite |
| Tutor-Chat | `chatWithTutor` | Free Lite / Pro Flash |
| Feynman-Frage | `generateRecallChallenge` | Free Lite / Pro Flash |
| Feynman-Bewertung | `evaluateRecallResponse` | Free Lite / Pro Flash |
| Klausur erstellen | `generateFullExam` | Lite |
| Klausur-Korrektur | `evaluateWithRubric` | Flash (grading) |
| Rechenweg-Bewertung | `evaluateStepByStep` | Flash (grading) |
| Erklärung im Leser | `generateGroundedExplanation` | Lite |
| Lernstudio | `generateStudioOutput` | Free Lite / Pro Flash |
| Selbsttest | `evaluateSelfCheck` | Lite |

Nicht getestet (bewusst): Funktionen mit PDF-/Bild-/Video-Eingabe (Abbildungs-Karten, Abbildungen finden, Mathe-Abschrift, Lerndigest, YouTube-Import), weil die Eingabe nicht fair für alle Anbieter gleich ist, und Admin-Funktionen (Hausarbeit, Zitate, Scholar-Suche). Wissensnetz, Coach, Lernplan, Lernfortschritt, Bloom und Karten aus Fehlern/Lücken sind Kandidaten für Stufe 2.

## Ablauf

```bash
npm run benchmark:capture                       # 1. echte App-Anfragen aus dem Datensatz bauen (kein KI-Aufruf)
npm run benchmark -- --all --repeat 3           # 2. alle Modelle ausführen → results/<runId>/raw.jsonl
npm run benchmark:judge                         # 3. Inhaltsprüfer (blind) → judge.jsonl
npm run benchmark:report                        # 4. Punkte + Bericht → scores.jsonl, report.md/.html, *.csv
npm run benchmark -- human-export --share 0.1   # optional: blinde Bewertungsseite für Menschen
npm run benchmark -- human-import --file ~/Downloads/bewertungen_<runId>.json
```

Optionen: `--feature quiz,karten`, `--model gemini-lite,claude-haiku` (Präfix reicht), `--repeat 3`, `--resume <runId>` (abgebrochenen Lauf fortsetzen), `--run <runId>` für judge/report (Standard: neuester Lauf). Datensatz: `BENCHMARK_DATASET=v1 npm run …` (Standard in `benchmark.config.ts`).

API-Schlüssel nur aus der Umgebung: `benchmark/.env` (`ANTHROPIC_API_KEY=…`), `GEMINI_API_KEY` wird zusätzlich aus `backend/.env` gelesen.

## Ordner

```
benchmark.config.ts   Modelle, Preise, Gates, Gewichte, Lauf-Regeln (einzige Stelle für Modell-IDs/Preise)
features.ts           Funktionen + Testfall-Format
models/               Adapter: gemini.ts, anthropic.ts (API, gestreamt); nur Modelle aus ALLOWED_API_MODELS
runners/              capture.test.ts (App-Anfragen bauen), run.ts (ausführen)
evaluators/           rubrics.ts, evaluate.ts (Checks + Gold), judge.ts (Prüfer), human.ts
reports/              report.ts, stats.ts
datasets/<version>/   NUR LOKAL (Vorlesungsmaterial): sources/, <version>/cases/*.json, requests.jsonl
results/<runId>/      NUR LOKAL: meta.json, raw.jsonl, judge.jsonl, scores.jsonl, human.jsonl, Berichte
```

`datasets/`, `results/` und `human/` stehen in `.gitignore`, weil das Repo öffentlich ist.

## Testfälle

Ein Testfall (`datasets/<version>/cases/<funktion>.json`):

```json
{ "id": "tutor_005", "feature": "tutor", "difficulty": "edge", "edgeType": "not_in_source",
  "contextSize": "medium", "source": { "files": ["13._Schlaf_….txt"] },
  "input": { "message": "Welche Dosis Melatonin …?" },
  "expected": { "answerable": false, "forbiddenPatterns": ["\\d+\\s*mg"] },
  "notes": "Steht nicht in der Quelle …" }
```

`source.files` verweist auf `datasets/sources/` (optional `from`/`to` für Abschnitte, `inline` für eigene Texte). Verteilung je Funktion: 20 % leicht, 50 % normal, 20 % schwer, 10 % Grenzfälle; kurze, mittlere und lange Kontexte. Grenzfälle: Information fehlt in der Quelle, Quelle unvollständig, teilweise richtige Antwort, mehrere Fehler, ähnliche Begriffe, missverständliche Formulierung.

**Neue Testfälle:** in eine NEUE Datensatz-Version schreiben (z. B. `v2`), nie eine bestehende ändern, damit alte Ergebnisse vergleichbar bleiben. Danach `BENCHMARK_DATASET=v2 npm run benchmark:capture`.

## Modelle

Kandidaten in `benchmark.config.ts`: Gemini 3.5 Flash-Lite, Gemini 3.8 Flash, Claude Haiku 5.5 ohne Denken, Claude Haiku 5.5 mit Denken (adaptiv, effort low). **Neues Modell:** Eintrag in `MODELS` mit `id`, `provider`, `apiModel`, `reasoningMode`, `prices` (USD je 1 Mio. Tokens, mehrere Stufen möglich), `enabled`. Für einen neuen Anbieter einen Adapter in `models/` ergänzen.

**Fairness:** Alle Modelle bekommen dieselbe Anfrage. Gleiche Max-Output-Tokens (16k, Klausur 32k), gleiche Timeouts (180 s), gleiche Wiederholungen nur bei technischen Fehlern (2), feste gemischte Reihenfolge. Anbieter-Unterschiede, die sich nicht vermeiden lassen, stehen pro Aufruf in `providerNotes` und im Bericht:
- Haiku 5.5 nimmt keine Temperatur an.
- Claude bekommt Geminis Schema als JSON Schema (Structured Outputs); Arrays werden in `{items}` verpackt. Ist ein Schema zu komplex (z. B. Klausur), läuft es über einen erzwungenen Werkzeugaufruf ohne Format-Garantie. Das wird im Warm-up je Schema festgestellt.
- Gemini Lite lehnt `thinkingBudget: 0` ab und läuft mit Modell-Standard (wie im Backend).

## Kosten

Pro Aufruf: `input_cost = input_tokens / 1e6 × Eingabepreis`, `output_cost = output_tokens / 1e6 × Ausgabepreis` (Denk-Tokens zählen als Ausgabe), Listenpreise ohne Cache-Rabatt. Haiku 5.5 kostet über 100.000 Prompt-Tokens das Fünffache. Bericht: Mittel, Median, je erfolgreichem Task, je 100/1.000/10.000 Tasks, absolut und relativ.

## Latenz

Direkte, gestreamte API-Aufrufe (keine CLI). Gemessen: Start, Zeit bis zum ersten Token, Ende des Streams, Gesamtzeit inkl. Wiederholungen. Bericht: Mittel, p50, p90, p95, Min, Max. Warm-up (2 Anfragen je Modell + jedes Schema einmal) wird nicht gewertet.

## Qualität

Jede Funktion hat eine eigene 100-Punkte-Rubrik (`evaluators/rubrics.ts`). Jedes Kriterium kommt aus einer festen Quelle:
- **det**: maschinelle Prüfung (JSON gültig, Pflichtfelder je Fragetyp, Anzahl, Typ-Mix, Zitat steht in der Quelle, Fußnoten, Jahreszahlen aus der Quelle).
- **gold**: Abgleich mit dem Goldstandard (Punktbereiche, erwartete Fehler, Urteil, Pflichtbegriffe, verbotene Angaben).
- **judge**: Inhaltsprüfer mit Checkliste: zerlegt jede Antwort in Sachaussagen und prüft jede gegen die Quelle. Vorgabe: nur Gemini 3.5 Lite, Gemini 3.8 Flash und Haiku 5.5. Deshalb prüfen Haiku 5.5 und Gemini 3.8 Flash (beide mit Nachdenken) jede Antwort, blind, alle Antworten eines Falls gemischt als A, B, C, D, absolute Bewertung. Gewertet wird das Mittel. Weil die Prüfer zugleich Kandidaten sind, zeigt der Bericht, ob ein Prüfer die eigene Familie milder bewertet; die menschliche Blindbewertung ist die Kontrolle. Aus Kostengründen prüfen sie nur Runde 1 (`RUN.judgeRepeats`): **Qualität** kommt aus Runde 1, **Konsistenz** aus den det/gold-Punkten aller Runden.
- **runs**: Konsistenz über die Wiederholungen (Korrektur).

Ungültiges Format = 0 Punkte und Schemafehler. Kritische Fehler kommen aus maschinellen Befunden (zählen voll) oder von Prüfern (Anteil der Prüfer, die einen melden).

**Blindbewertung durch Menschen:** `human-export` erzeugt eine lokale Seite mit einer Stichprobe (Standard 10 % der Fälle, alle Modelle, ohne Modellnamen). Der Bericht vergleicht danach Mensch und automatische Wertung.

## Zuverlässigkeit, Konsistenz, Statistik

- Technische Fehler (API, Netz, Timeout) getrennt von Modellfehlern (Schema, kritisch, Halluzination, Grounding).
- Reliability = 100 × (1 − technisch) × (1 − Schemafehler) × (1 − kritische Fehler).
- Consistency Score = 100 − mittlere Spannweite der Qualität über die Wiederholungen eines Falls.
- Vergleiche sind **gepaart** (gleiche Testfälle), 95 %-Bootstrap-KI auf den Differenzen je Fall. Schließt das KI die 0 ein, steht im Bericht „statistisch nicht eindeutig“.

## Production Gates und Score

Produktentscheidungen, keine Naturgesetze (`GATES` in der Config): Qualität ≥ 85, kritische Fehler < 5 %, Schemafehler < 1 %, technische Fehler < 2 %. Wer ein Gate verfehlt, ist **nicht produktionsreif**, egal wie billig oder schnell.

Produkt-Score (0–100) = 50 % Qualität + 20 % Reliability + 15 % Latenz (bestes p95 / eigenes p95) + 15 % Kosten (günstigste / eigene). Drei Rankings: Qualität (+ Reliability), Kosteneffizienz, Produkt. Dazu Pareto-Analyse über Qualität, Kosten und p50.

## Kein Cherry-Picking

Jeder Aufruf wird gespeichert, auch Fehler; keine Antwort wird ausgewählt, kein Fall nachträglich entfernt. Läufe mit Fehlern im Benchmark selbst werden nicht gelöscht, sondern umbenannt (`…_UNGUELTIG-…`). Der App-Code (Prompts, Routing, Nutzerdaten, Abrechnung) wird nicht verändert.
