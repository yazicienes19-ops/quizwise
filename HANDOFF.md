# StudeArc (vormals QuizWise) — Übergabe

**Stand: 07.10.2026.** Die ausführliche, laufend gepflegte Übergabe (was gemacht ist, Deploys, Migrationen, Kosten, offene Punkte) liegt auf der privaten Übergabe-Seite: https://claude.ai/artifact/UX8xgdnckSwj12PnbVBvUR. Diese Datei hält nur das Dauerhafte fest. Frühere Sitzungsprotokolle (bis 07.08.2026) stehen in der Git-Historie dieser Datei.

## Projekt

KI-Lern-App für Studierende im DACH-Raum: Bibliothek (PDFs, Notizen), Quiz, Karteikarten (FSRS, Anki-Import), Feynman-Methode, Klausur-Simulator (inkl. Quantitativ-Modus), Tutor, Wissensnetz, Lernfortschritt, Kalender. Oberfläche in Deutsch, Englisch und Türkisch.

## Technik

| Teil | Was | Wo |
|---|---|---|
| Frontend | React, Vite, TypeScript, Tailwind, KaTeX, pdf.js, d3 | Cloudflare Workers (`wrangler.jsonc`, Domains studearc.com und www) |
| Backend | Node/Express, Gemini über `@google/genai` | Railway, Service `quizwise-backend` (`backend/`) |
| Daten | Supabase (Auth, Postgres mit RLS, Storage) | Migrationen in `backend/migration_*.sql` |
| Zahlungen | Stripe | noch im Testmodus |
| App | Capacitor iOS | noch nicht veröffentlicht |

## Arbeitsregeln

1. Erst auf localhost prüfen lassen, deployt wird nur auf ausdrückliches Okay.
2. Frontend nur per `git push origin main`; Cloudflare baut in etwa 1 bis 2 Minuten. Nie manuell mit wrangler deployen (die Produktionswerte stehen nur in den Cloudflare-Build-Einstellungen). Hängt der Build: leeren Commit pushen. Rückweg: `npx wrangler rollback <version>`.
3. Hat sich das Backend geändert, zuerst `railway up --service quizwise-backend --ci` aus `backend/`. Railway und Cloudflare deployen nicht automatisch zusammen.
4. Nach jedem Deploy: Das neue Bundle enthält die Supabase- und Railway-Adresse, aber kein `localhost:4000`; danach `npm run smoke`.
5. Oft arbeitet eine zweite Sitzung im selben Verzeichnis: vor jedem Commit `git status` und den Diff prüfen, nur eigene Änderungen committen.
6. Committen nur, wenn `npx vitest run` grün ist (die i18n-Tests prüfen, dass alle drei Sprachen dieselben Schlüssel haben) und `npm run build` durchläuft.
7. Oberflächentexte: kein „KI“ als Etikett, keine Gedankenstriche, Deutsch mit Verben. Design-Regeln stehen in `CLAUDE.md`.
8. Migrationen führt der Nutzer im Supabase SQL Editor aus; danach von außen lesend prüfen. Testdaten und Wegwerf-Konten nach Tests wieder löschen.

## Lokal starten

```bash
npm install && npm run dev                      # Frontend auf :3000
cd backend && npm install && PORT=4000 npm start  # Backend auf :4000 (braucht backend/.env)
npx vitest run                                  # Tests
npm run smoke                                   # Rauchtest gegen die Live-Seite (.env.test.local)
```

`.env`, `backend/.env` und `.env.test.local` sind nicht im Repo.

## Wichtige Orte im Code

- Karteikarten: `services/spacedRepetition.ts` (FSRS), `services/deckMerge.ts` und `services/deckCloudSync.ts` (Abgleich mit Löschvermerken), `services/moduleDeck.ts` und `services/pdfFullText.ts` („Ganzes Fach“, Abschrift von Mathe-PDFs)
- Fächer und Unterordner: `services/collectionSource.ts` (`collectionDocs` = Wissensbasis ohne abgewählte Unterordner), `services/moduleFolders.ts`, `components/ModuleFolderSections.tsx`, `components/FolderScopeBar.tsx`
- Lernstudio (Zusammenfassung wie NotebookLM): `components/SubjectStudio.tsx`, Logik in `services/subjectStudio.ts` (Quellen, Prompts, Fußnoten, Kapitel), Speicher `services/studioStore.ts` (Tabelle `studio_items`), Grafiken `services/studioDiagrams.ts` + `components/StudioDiagram.tsx`, Abbildungen `services/studioFigures.ts`, Kapitel `services/studioChapters.ts`, Selbsttest `components/StudioSelfCheck.tsx`, Notizen `services/studioNotes.ts`
- Wissensnetz: `components/GraphCanvas.tsx`, `components/GraphSystem.tsx`, `services/graph/` (Schreibgrenze für KI über `graphAiWriteBoundary.test.ts`)
- KI-Aufrufe: `services/geminiService.ts` (Frontend), `backend/src/routes/gemini.js`, Budget in `backend/src/budget/aiBudget.js`
- Übersetzungen: `i18n/locales/{de,en,tr}.ts`
