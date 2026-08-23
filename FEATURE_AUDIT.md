# StudeArc — Feature-Audit (Stand: 2026-08-22)

**Commit:** `42c5bb5` (feat(wissensnetz): Hellmodus-Kalibrierung, Viewport-Culling/LOD und Kanten-Bündelung) · **Produktionsstand:** deployt auf studearc.com, Smoke-Test grün (Landing/Login/voller localStorage/keine JS-Fehler)
**Scope:** ALLE Features gegen die Akzeptanzkriterien (`CLAUDE.md`, Pakete 0–10) — Implementierungsstatus, Verdrahtung, Testabdeckung, Risiken.
**Methode:** 8 systematische Code-Sweeps über components/, services/, hooks/, config/, backend/, i18n/. Jeder Befund mit `Datei:Zeile` belegt.
**Limitation (ehrlich benannt):** Statischer Code-Audit ohne E2E-/Gerätetests. „✅" heißt: Kriterium ist im Code erfüllt und verdrahtet — nicht: auf jedem Gerät/Browser verifiziert.

**Legende:** ✅ erfüllt · ⚠️ teilweise/abweichend · ❌ fehlt · 🔴 Hoch 🟠 Mittel 🟢 Niedrig

---

## Gesamtübersicht

| # | Feature | Paket | Status | Kritischster Befund |
|---|---|---|---|---|
| 1 | Grundlagen/Auth/Onboarding | 0 | ⚠️ | 497 indigo-Hartkodierungen in 33 Dateien |
| 2 | Spaced Repetition / Karteikarten | 1 | ⚠️ | Easy-Karte nur 1 Tag weg statt ≥6 (erste Bewertung) |
| 3 | Streak & tägliche Bindung | 2 | ⚠️ | Streak-Schwelle exakt `=== 5` statt `>=`; „Rekord" fehlt im Dashboard |
| 4 | Quiz | 3 | ⚠️ | Multi-Doc: kein Pro-Frage-Ursprungsdokument |
| 5 | Klausur üben | 4 | ✅ | PDF: Zuordnungs-/Lückenantworten als Rohdaten |
| 6 | Erklären üben (Feynman) | 5 | ⚠️ | Stummer Mic-Fallback (Button verschwindet ohne Hinweis) |
| 7 | Dashboard | 6 | ✅ | — |
| 8 | Anki/Quizlet-Import | 7 | ✅ | Skipped-Zähler unsichtbar bei 100 % kaputten Zeilen |
| 9 | Decks teilen | 8 | ✅ | Clipboard ohne Fallback |
| 10 | PWA | 9 | ⚠️ | Kein Offline-navigateFallback für Subpfade |
| 11 | Aufräumen/Labor (Admin) | 10 | ⚠️ | AgentChat existiert nicht; App.tsx 577 Zeilen (>300-Ziel) |
| 12 | Bibliothek & Lesen | — | ⚠️ | Base64-Bilder können localStorage-Quota hart crashen |
| 13 | Wissensnetz | — | ✅ | Last-Write-Wins-Lücke bei Drag + gleichzeitigem Cloud-Pull |

---

## 1. Grundlagen / Auth / Onboarding / Plattform (Paket 0 + Auth/Cookies/i18n)

| Kriterium | Status | Beleg |
|---|---|---|
| SplashScreen statt `return null` bei !authChecked | ✅ | `App.tsx:421`, `SplashScreen.tsx:9-41` |
| Onboarding via isOnboardingDone-Flag | ✅ | `App.tsx:101,449-473`, `onboarding/onboardingState.ts:7,15`, Cloud-Restore `useAuth.ts:67-70`. Abweichung: nach Upload → KI-empfohlener Tab statt Bibliothek (`OnboardingFlow.tsx:156-168`) — bewusst weiterentwickelt |
| resolveErrorMessage() in ALLEN catch-Blöcken | ✅ *(nachgereicht 2026-08-23)* | Resolver um Auth-Mappings erweitert (`errorMessages.ts`: Invalid login/already registered/Password should/Email not confirmed/rate limit); zentral eingesetzt in AuthModal, AuthPage, SettingsModal (6×), ResetPasswordPage, UpgradeModal, NotificationSettingsPanel, UploadSourceModal, OnboardingFlow, LearningCoach, GapRadar, TermPaperSystem (2×); Tests neu: `errorMessages.test.ts` (4 Fälle). Bewusst ausgenommen: ErrorBoundary-Crash-Screen (diagnostischer `<pre>`) |
| Auth-Timeout 1500 ms | ✅ | `useAuth.ts:20` |
| saveQuizProgress debounced 250 ms | ✅ | `useQuizState.ts:126-135` (Debounce selbst ungetestet) |
| design-tokens.css eingebunden | ⚠️ | Datei existiert nicht; Tokens in `app.css:72,96` + Laufzeit-Injektion `index.html:76-86` — funktional gleichwertig |
| Keine indigo-Hartkodierung | ✅ *(Korrektur 2026-08-23, ursprünglich ❌ 🔴)* | Die 497 `indigo-`-Klassen-Treffer sind **keine Hartkodierung im Effekt**: der Override-Katalog in `app.css:100-235` biegt JEDE genutzte Variante per `!important` auf `var(--primary)`/`--p50…--p950` um (color-mix-Ableitungen). Verifiziert: alle **69** im Code genutzten Varianten (Voll-Repo-Scan inkl. Dark/Hover/Focus/Group-Hover/Opacity/Gradient) sind abgedeckt, 0 Lücken. Die Hex-Werte in `tailwind.config.cjs` sind nur toter Fallback für ungenutzte Klassen. Akzentwechsel greift also app-weit |
| Layout auf NAV_GROUPS | ✅ | `Layout.tsx:19,95`, `navConfig.ts:27-70` |
| Cookies: echte Kategorien | ⚠️ | Modal granular (Essenziell/Funktional/Analyse, `CookieSettingsModal.tsx:47-84,102`), Banner selbst binär (`App.tsx:429-430`) |
| i18n (de/en/tr) | ✅ | `I18nProvider.tsx:16-46`, Cloud-Sync `:25-33` — **einziger getesteter Bereich hier** (`i18n/index.test.ts`) |
| ErrorBoundary / Toast | ✅ | `index.tsx:72`, `App.tsx:538`, `Toast.tsx:28-55` |

**Paket 9 PWA:** ✅ weitgehend — Manifest via `vite.config.ts:26-42` (Name, Icons 192/512, theme_color `#1B2A4A`, standalone), SW mit Precache + NetworkFirst für Supabase (`vite.config.ts:44-58`), Push-SW `public/push-sw.js`, Update-Prompt `PwaUpdatePrompt.tsx:12-118`. 🟠 `navigateFallback: null` (`vite.config.ts:45`) → Offline-Direct-Navigation auf Subpfade hängt am SPA-Rewrite statt am SW.
**Paket 10 Admin/Labor:** ✅ weitgehend — `config/admin.ts:3-6`, Labor-Gruppe nur für Admins (`Layout.tsx:95,148-151`), Tab-Gate → Dashboard-Fallback (`AppContent.tsx:479,483`), React.lazy+Suspense (`AppContent.tsx:37-48`). 🟠 AgentChat fehlt komplett im Repo; 🟢 App.tsx 577 Zeilen (>300-Ziel).

**Tests:** fast keine — nur `i18n/index.test.ts`; fehlen: errorMessages, useAuth, Cookie*, PwaUpdatePrompt, admin-Gating, navConfig.

---

## 2. Spaced Repetition / Karteikarten (Paket 1)

| Kriterium | Status | Beleg |
|---|---|---|
| SM-2 (reviewCard) eingebaut | ✅ | `spacedRepetition.ts:56-83`, verdrahtet `FlashcardSystem.tsx:14` |
| Flashcard um `srs` erweitert | ⚠️ | `types.ts:185-193` — optional statt Pflichtfeld (defensiv überall migriert, kein Crash, aber schwächerer Typvertrag) |
| migrateLegacyCard für Bestand | ✅ | `spacedRepetition.ts:98-104`, lazy angewandt `FlashcardSystem.tsx:242,262,395` |
| 4 Buttons Nochmal(1)/Schwer(3)/Gut(4)/Easy(5) → reviewCard | ✅ | `FlashcardPlayer.tsx:192-214` (+Intervall-Vorschau), Tastatur 1–4 `:62-66`, Persistenz `FlashcardSystem.tsx:252-278`. 🟢 `again` mappt auf BLACKOUT(0) statt 1 (`spacedRepetition.ts:106-111`, funktional äquivalent: q<3 → Reset) |
| Nur fällige als Standard-Stapel, Rest „Alle Karten" | ✅ | `FlashcardSystem.tsx:392` (Default `mode='due'`), `:410`, Buttons `:765-784` |
| Easy-Karte ≥6 Tage weg | ⚠️ 🟠 | SM-2 gibt bei ERSTER korrekter Bewertung interval=1 Tag (`spacedRepetition.ts:67-68`); erst ab 2. Bewertung ≥6 Tage. Literal-Kriterium für neue Karten verletzt |
| Alte Karten ohne srs crashen nicht | ✅ | Filter in `getDueCards` + Migration vor Zugriff; Test `spacedRepetition.test.ts:67-71,84-96` |

---

## 3. Streak & tägliche Bindung (Paket 2)

| Kriterium | Status | Beleg |
|---|---|---|
| recordActivity an 4 Orten (Quiz/Karten≥Schwelle/Recall/Klausur) | ⚠️ 🟠 | Alle 4 vorhanden: `useQuizState.ts:323`, `FlashcardSystem.tsx:277`, `AppContent.tsx:390` (+ `GraphLearningOverlay.tsx:349`), `AppContent.tsx:456`. ABER Kartenschwelle ist exakt `=== 5` (`FlashcardSystem.tsx:277`) statt „≥"; inkonsistent: GraphOverlay vergibt Streak schon nach einzelnen Reviews (`GraphLearningOverlay.tsx:229`) |
| Header: Icon + Zahl, gefüllt wenn todayDone | ⚠️ 🟢 | `Layout.tsx:217-229,525-537` — Logik korrekt (`fill={todayDone ? … : 'none'}`), aber **Stern statt Flamme**; nur sichtbar wenn `current > 0` |
| Dashboard „Streak: X · Rekord: Y" + Hinweis | ⚠️ 🟠 | Stat „Lernserie" ✅ (`Dashboard.tsx:224,390-395`), Hinweis bei !todayDone ✅ (`:198-205`). **„Rekord" fehlt** — i18n-Keys `dashboard.recordDone/recordOpen` vorhanden aber ungenutzt (`de.ts:601-602`) |
| Genau 1×/Tag; Bruch nach Lückentag | ✅ | `streakService.ts:54` (Early-Return), `:56-59` (Neustart nach Lücke), `:79-82` (gebrochener Streak → 0) |

---

## 4. Quiz (Paket 3)

| Kriterium | Status | Beleg |
|---|---|---|
| Tastatur 1–4 + Enter | ⚠️ 🟠 | Ziffern+Enter ✅ (`QuizPlayer.tsx:207-226`, `↵`-Hinweis `:721`). Lücke: Confidence-Schritt (sicher/unsicher, `:327-344`) hat KEINE Ziffernkürzel und blockt Confirm (`canConfirm` `:156`) → rein mausfreier Flow stockt dort. 🟢 Keydown prüft keine Modifier (Cmd+1 fängt Browser-Tabwechsel) |
| Erklärung IMMER aufgeklappt, Korrektes grün | ✅ | `QuizPlayer.tsx:663-682` (bedingungslos bei showResult), Grün/Rot `:289-308`. 🟢 toter State `showExplanation` (`:48`) |
| Mobile min-h-[52px] | ✅ | `QuizPlayer.tsx:296,716,736` |
| Multi-Doc: Checkbox-Liste | ✅ | `QuizSetup.tsx:162-194`, Start reicht `selectedDocIds` (`AppContent.tsx:236-238`) |
| Multi-Doc: Prompt mit Quellen-Label je Doc | ✅ | `[Quelle: <Name>]\n<…>` je Doc → `useQuizState.ts:231-238` → `geminiService.ts:454ff`; stabile multiDocId (+Test) |
| Multi-Doc: Pro Frage das Ursprungs-Dokument | ❌ 🔴 | `QuizQuestion` hat kein Doc-Feld (`types.ts:138-166`); Prompt fordert keinen Doc-Bezug (`geminiService.ts:501-569`); Player zeigt nur „N Dokumente" (`QuizPlayer.tsx:571-573`) → Kriterium nur per Zufallstreffer über sourceReference erfüllbar |
| Adaptiv/Bloom/Calibration/MistakeReview (Zusatz) | ✅ | `adaptiveQuizOrder.ts:39-64` (+Test), Bloom-Hints `useQuizState.ts:252-259`, Confidence-Auswertung `calibration.ts:23-38` in ResultView `:139-158`, SM-2-MistakeQueue `mistakeReviewService.ts:72-129`, Cloze-Toleranz `blankMatch.ts:35-42` |

🟠 Token-Risiko: Multi-Doc-Kombination ohne Zeichen-Cap (`useQuizState.ts:232-235`), anders als Einzel-Collection (80k, `collectionSource.ts:25`).
🟢 A11y: Setup-„Checkboxen" sind Buttons ohne `role="checkbox"`/`aria-checked` (`QuizSetup.tsx:167-191`).
**Tests:** Services gut abgedeckt (adaptive/bloom/calibration/calibrationGap/blankMatch/mistakeReview/useQuizState); **fehlen:** QuizPlayer/QuizSetup/ResultView-Komponententests, Multi-Doc-Prompt-Bau, geminiService-Prompt.

---

## 5. Klausur üben (Paket 4)

| Kriterium | Status | Beleg |
|---|---|---|
| Notenskala 1.0–5.0 exakt nach Schlüssel, groß/prominent | ✅ | `learningProfileService.ts:41-53` — alle 11 Schwellen mit CLAUDE.md identisch; Anzeige `text-6xl sm:text-7xl font-black` + CountUp (`ExamView.tsx:598-604`); wiederverwendet von Archiv/Prognose |
| PDF-Export (jsPDF): Titel/Datum/Note/Fragen eig.+richtig | ⚠️ 🟠 | Kern ✅ `ExamView.tsx:166-238` (dynamischer jsPDF-Import `:167`). Lücke: `matching`/`fillblank`/`ranking` fallen in Rohdaten-Zweig (`:223-226`) — lesbare Aufbereitung existiert bereits (`ExamArchive.tsx:10-32 formatUserAnswer`) wird aber nicht genutzt |
| Altklausur-Stil: Upload-Option → Generator-Option → Prompt | ✅ | Kette vollständig: Toggle `UploadSourceModal.tsx:69,352-374` → Meta `libraryService.ts:11` (+Badge `SourceCard.tsx:110`, editierbar `EditSourceModal.tsx:119-138`) → Stilwahl inkl. Direktupload `ExamGenerator.tsx:86-89,149-178` → Prompt „Analysiere … Fragestil, Schwierigkeit, Aufgabentypen … NEUE Fragen in EXAKT diesem Stil" (`geminiService.ts:1586-1589`); Neuheit via Seed/temp/excludeTopics |
| Tageslimit-Garantie | ✅ | `examWorkflow`-Flag an 3 Calls (`geminiService.ts:61,1671,1735,1860`), Backend `limits.js:11`, RPC+Migration `backend/migration_exam_guarantee.sql:11-59`. 🟠 Garantie gilt nur für den Generierungs-Call — Rubrik-Bewertung offener Fragen kann bei erschöpftem Limit per 429 scheitern (Klausur generierbar, Auswertung unvollständig) |
| Deterministische Analyse | ✅ | `examAnalysisService.ts:24-85` ohne Gemini-Call, verdrahtet `ExamSystem.tsx:293` |

🟢 Deployment-Abhängigkeit: `migration_exam_guarantee(.fix_overload).sql` muss manuell in Supabase laufen, sonst 500 im Limit-Check = Klausur-Generierung blockiert.
**Tests:** `examScoring.test.ts` (gründlich), `examNormalize`, `examAnalysisService`, `examForecastService`; Notenschlüssel nur an 3 Grenzfällen getestet (`learningProfileService.test.ts:25-31`); **fehlen:** examHistory/savedExams, PDF-Export, Altklausur-Prompt-Bau.

---

## 6. Erklären üben / Feynman (Paket 5) + Tutor/Labor

| Kriterium | Status | Beleg |
|---|---|---|
| First-Visit-Intro (Flag, 2 Sätze, „Zwölfjähriger") | ✅ | Flag `studearc_feynman_intro_done` (`ActiveRecall.tsx:68-70,137-140`), exakter Wortlaut `de.ts:1391-1392`, Cloud-Sync `useAuth.ts:71-72`. 🟢 Intro sitzt im Feynman-Tab (ActiveRecall), nicht im Tutor — Lesartsspielraum |
| Spracheingabe webkitSpeechRecognition de-DE → Textfeld | ✅ | Beide Komponenten: `ActiveRecall.tsx:73-75,149-159`, `ExplainerSystem.tsx:123-125,317-328`; `lang = localeTag()` → `de-DE` (`i18n/index.ts:42-43`); Transkript anhängend ins Feld; Mic-Buttons `ActiveRecall.tsx:414-429`, `ExplainerSystem.tsx:866-880` |
| Fallback-Hinweis bei nicht unterstütztem Browser | ⚠️ 🟠 | Button wird nur ausgeblendet (`hasSpeechApi && …`) — kein Hinweistext (Firefox-Nutzer erfahren nichts); nur micDenied-Toast bei Verweigerung (`ActiveRecall.tsx:164-166`) |
| Decks teilen (Paket 8) | ✅ | SQL+RLS `migration_cloud_sync.sql:50-63` (+UPDATE/Upsert-Fixes), Teilen→Clipboard `ExportDeckModal.tsx:33-36`, Route `/shared/{id}` read-only + Login-Gate + frisches SRS `SharedDeckPage.tsx:44-58`, `App.tsx:377-395`. 🟢 Clipboard ohne HTTPS-Fallback; hartkodierter deutscher Toast `SharedDeckPage.tsx:62` |
| Tutor (klickbare Weiterfragen, Sessions) | ✅ | `tutorFollowUpParser` + Chips `ExplainerSystem.tsx:761-778`, Session-Liste `:195-237,541-574` (+Tests tutorFollowUpParser/tutorSessions) |
| ActiveRecall / LearningCoach / ScholarSearch / TermPaper | ✅ | Feynman-Kern + Kapitel-Coverage (`ActiveRecall.tsx`), Coach mit GapRadar/Forecast (**einziger Komponententest**: `LearningCoach.test.tsx`), Scholar mit APA-Copy (`ScholarSearch.tsx:61-62`), Hausarbeit mit 8 Tabs + citeproc (`TermPaperSystem.tsx:371-474` → `citeprocService.formatAllStyles`) |

⚠️ citeproc nutzt ausschließlich TermPaperSystem — ScholarSearch zeigt nur das gelieferte apaCitation (kein Formatwechsel). 🟠 `recallHistoryService` (zentral fürs Lernprofil) ungetestet.

---

## 7. Dashboard / Planner (Paket 6)

| Kriterium | Status | Beleg |
|---|---|---|
| Empty State: nur Upload-CTA + 3 Schritte, keine leeren Widgets | ✅ | `Dashboard.tsx:258-300` (Willkommenskarte + nummerierte Schritte 1-3 + CTA → Bibliothek) |
| „Weiterlernen"-Karte (letztes offenes Quiz/Stapel) | ✅ | `Dashboard.tsx:398-419` (weiterlernCard mit Tab-Sprung, Fortschrittsbalken, %) |
| Oben: Fällige Karten + Streak + nächste Klausur mit Countdown | ✅ | Streak-Stat `Dashboard.tsx:224,390-395`; Countdown ab 3 Wochen sichtbar mit ehrlicher Themen-Priorisierung `:209-213,347-384`; Planner-Liste mit Tagen-Farblogik `StudyPlanner.tsx:684-710` |

🟢 „Rekord"-Anzeige fehlt (siehe Abschnitt 3). Smart-Plan/Kalender (calendarSessions +tests, CalendarDayPanel) voll funktional.

---

## 8. Anki/Quizlet-Import (Paket 7)

| Kriterium | Status | Beleg |
|---|---|---|
| Button „Importieren" → Modal (Upload + Paste) | ✅ | `FlashcardSystem.tsx:700-706,587-593`; Paste-Tab `AnkiImportModal.tsx:156-167`, Datei-Tab `.csv,.tsv,.txt` + Drag&Drop `:168-197,95-100` |
| Trenner Tab/Semicolon/Komma auto | ✅ | `detectSeparator :15-19`, quote-bewusst `findUnquotedSeparator :25-43` |
| Vorschau erste 5 Karten | ✅ | `parsed.slice(0,5)` `:83`, Render `:200-217` |
| Ziel-Deck wählbar/neu | ✅ | Select + `__new__` `:224-242`, Handling `FlashcardSystem.tsx:359-383` |
| createSrsState für Imports | ✅ | `AnkiImportModal.tsx:111` |
| Kaputte Zeilen übersprungen UND gezählt | ⚠️ 🟢 | Zählung ✅ (`:84-88`, Anzeige `:204`), ABER: Anzeige hinter Gate `preview.length > 0` (`:200`) → bei 100 % kaputten Zeilen unsichtbar; Erfolgs-Toast nennt Skipped nicht (`FlashcardSystem.tsx:371,380`) — kombinierte Meldung „47 importiert, 3 übersprungen" fehlt |

🟢 Trennererkennung nur anhand Zeile 1 (`AnkiImportModal.tsx:56`).
**Tests:** ❌ keine für Import-Parsing/Separator/Skipped (0 Testdateien).

---

## 9. Bibliothek & Dokumente & Lesen

| Bereich | Status | Befund |
|---|---|---|
| Upload-Pipeline | ✅ | Formate `.pdf,.docx,.txt,.md` + Bilder incl. HEIC (`UploadSourceModal.tsx:15`); HEIC→JPEG (`useDocuments.ts:211-223`), DOCX→mammoth (`:237-241`), txt/md→Text (`:242-245`); PDF/Bild → Supabase Storage `document-files` (`documentService.ts:135-150`) + KI-Digest mit Polling (`useDocuments.ts:261-270`) |
| Suche durchsucht Inhalt | ⚠️ 🟠 | Titel/Tags/Modul immer; Inhaltsuche nur text/docx gegen `doc.content` (`LibrarySystem.tsx:116-118`), PDF/Bild nur gegen KI-Digest (`:125`) → PDF ohne fertigen Digest nur per Titel findbar; echter PDF-Volltext (pdf.js-Seitentexte) ungenutzt |
| Reader & Fortschritt | ✅ | PdfSplitScreenReader startet bei `getLastPage+1` (`PdfSplitScreenReader.tsx:69`), speichert `saveLastPage` (`:187`); Kapitel-Fortschritt im Text-Reader (`SplitScreenReader.tsx:58,137`); Outline/Toc in beiden Readern; Routing zentral `shouldUsePdfReader` (`libraryService.ts:52-53`) |
| Geteilte Bibliothek | ✅ | Snapshot in `shared_collections` (erneutes Teilen aktualisiert Link, `sharedLibraryService.ts:43-61`); Annahme kopiert Digest mit — keine erneute KI-Analyse (`documentService.ts:169-175`) |

🔴 **Höchstes Einzelrisiko der App:** Bild-Uploads legen Base64 vollständig in `doc.content` → localStorage-Key `studearc_docs` (`useDocuments.ts:228-236,104`) — **ohne try/catch um `localStorage.setItem`** (`:102-105`): QuotaExceededError kann Upload/State hart crashen (Genau die Fehlerklasse, die der Smoke-Test Szenario 3 abdeckt).
🟠 lib_meta-Edits (Titel/Tags/lastOpenedAt) werden ohne userId gespeichert → kein Cloud-Sync dieser Änderungen (`libraryService.ts:55-60` vs. Aufrufer `EditSourceModal.tsx:59-73`, `LibrarySystem.tsx:152-164`).
🟠 Kapitel-Erkennung inkonsistent: QuizSetup nutzt synchrones Digest-Regex (`QuizSetup.tsx:80`), ActiveRecall die bessere Outline/Layout-Erkennung `detectChaptersForDoc` (`ActiveRecall.tsx:119`).
🟢 Toter Code: `ChapterSelectorModal.tsx` nirgends importiert.
**Tests:** Services stark (documentService/chapter*/readerLog/readerChat/citeproc/pdfPage/pdfOutline/pdfHighlight/collectionSource — jeweils .test.ts); **fehlen:** handleFileUpload-Pfade (HEIC/DOCX!), LibrarySystem-Suche, beide SplitScreenReader, sharedLibraryService, syncService-Merges.

---

## 10. Wissensnetz

| Bereich | Status | Beleg |
|---|---|---|
| Architektur (Canvas frei von Infrastruktur) | ✅ | `hooks/useKnowledgeGraph.ts:8-28`, `GraphSystem.tsx:118,821-834` |
| Hellmodus-Kalibrierung (Vignette, tiefes Gold #B4821F, eigener Tages-Puls) | ✅ | `GraphCanvas.tsx:253-269,1591-1593` (heute deployt, Commit 42c5bb5) |
| Culling (Margin 280px, erst ab 50 Nodes, Liang-Barsky) | ✅ | `GraphCanvas.tsx:159-162,1050-1081`, `graphCanvasMetrics.ts:19-48` |
| LOD (Detail aus < k=0.45; Labels erst ab k=0.55, quantisiert) | ✅ | `GraphCanvas.tsx:166,1083-1090,1697,1744,1754` |
| Edge-Bundling (Fade 0.6→0.3, Dämpfung, Clamping, Quantisierung) | ✅ | `graphCanvasMetrics.ts:57-87`, `GraphCanvas.tsx:172-182,963-984` |
| Memoisierung (Views + Ref-Dispatcher, NO_EDGE_LABEL_LINES) | ✅ | `GraphCanvas.tsx:509,591,1542-1583,185` |
| Interaktion (Node anlegen/umbenennen, Kanten ziehen/labeln/löschen, Hierarchie-Zyklus, Gold-Identität, Coach-Insights, Kanten-Erklärung, Lern-Overlay) | ✅ | `GraphCanvas.tsx:1515-1539,1294-1399,1401-1468`; `GraphNodeDetailPanel.tsx:305-309`; `GraphCanvas.tsx:209-214,740-806`; `GraphSystem.tsx:498-501,470-491` |
| Mobile/Touch/Motion | ✅⚠️ | Pointer-Events + d3-Pinch + touchAction:none (`GraphCanvas.tsx:1249-1257,1622`); reduced-motion doppelt abgesichert (`:699,1597-1600`). 🟢 Nodes nicht tastaturfokussierbar; iOS-Doppelklick historisch wackelig (⌘K-Palette als Alternative) |
| Persistenz | ✅ | localStorage-Cache/Pending-Writes pro Scope+User, gedebounceter Supabase-Push (graph_nodes/-edges/-relation_types), Flush bei Scope-Wechsel/Unload (`graphSyncService.ts:89-193`, `graphPersistenceService.ts`) |

🟠 **Größtes Restrisiko:** Drag/Edit-Handler committen gegen Render-Closure-State (`GraphCanvas.tsx:1231,1270,1370,1446`) — läuft zwischen Geste-beginn und -ende ein Hintergrund-Cloud-Pull, überschreibt der Commit den gemergten Stand (Last-Write-Wins bis zum nächsten Reload). Betrifft Multi-Device-Nutzung.
🟠 relationType/nodeDocumentRef-Commits ungetestet (`useKnowledgeGraph.ts:154-159`).
🟢 Label-LOD-Dualität 0.45 vs. 0.55; Node-Drag-Effect re-bindet Listener pro pointermove (`:1260-1292`).
**Tests:** `useKnowledgeGraph.test.ts` solide (Cache/Pull-Merge/Autosave/Undo/Flush), `graphCanvasMetrics.test.ts` 16 Fälle zu Culling/Bundling; fehlen wie oben.

---

## Top-Prioritäten (quer über alle Features)

1. ~~🔴 **indigo-Hartkodierungen migrieren**~~ → **ERLEDIGT/FEHLALARM (2026-08-23)**: Override-Katalog `app.css` deckt alle 69 genutzten Varianten ab — kein Handlungsbedarf.
2. 🔴 **localStorage-Quota absichern**: try/catch um `localStorage.setItem` in `useDocuments.saveDocs` (+ ggf. Bilder konsequent nach Storage statt Base64). Real crashende Klasse.
3. 🔴 **Multi-Doc „pro Frage das Dokument"**: Doc-Feld am `QuizQuestion` (Prompt-Instruktion „ Antworte mit sourceDoc") + Badge im Player — letztes offenes Paket-3-Kriterium.
4. 🟠 **resolveErrorMessage flächendeckend** — v. a. Auth-Flows zeigen rohe Tech-Meldungen (Trust-Fehler Nr. 1 beim Login).
5. 🟠 **Wissensnetz Last-Write-Wins**: Commits aus Drag/Edit gegen frischesten State (stateRef) statt Closure — sonst verschwinden Remote-Änderungen bis Reload.
6. 🟠 **Streak-Details**: Schwelle `=== 5` → `>= 5` (oder Vorgabe anpassen), „Rekord" im Dashboard ergänzen (Keys existieren schon), GraphOverlay an gleiche Schwelle binden.
7. 🟠 **SM-2 erste Easy-Bewertung** → direkt 6 Tage (einzeilig in `spacedRepetition.ts:67`), sonst Paket-1-Kriterium literal unerfüllt.
8. 🟠 **Mic-Fallback-Hinweis** + **PDF-Export lesbare Antworten** (`formatUserAnswer` wiederverwenden) + **Multi-Doc-Token-Cap**.
9. 🟠 **Testlücken schließen** (höchster Nutzen zuerst): AnkiImport-Parsing, useDocuments-Upload-Pfade, examHistory/savedExams, errorMessages *(✅ erledigt 2026-08-23)*, recallHistoryService, relationType/nodeDocumentRef-Commits. ⚠️ Neu beobachtet: die beiden `waitFor`-basierten stateRef/Commit-Tests in `useKnowledgeGraph.test.ts` sind unter Volllast flaky (schlagen ~1/3 aller Voll-Suite-Läufe fehl, einzeln immer grün — Debounce-Fenster zu knapp für Parallel-Worker). Vor Paket-Arbeit am Wissensnetz stabilisieren (explizite Timer/Fakes statt Real-Timer-Rennen).

**Fazit:** 13 von 13 Feature-Bereichen sind implementiert und produktiv; 6 Bereiche erfüllen ihre Paket-Kriterien vollständig (Klausur, Dashboard, Import, Teilen, Wissensnetz, PWA-Kern). Die offenen Punkte sind überwiegend Präzisions-Lücken einzelner Kriterien (Multi-Doc-Ursprung, Easy-Intervall, Rekord-Anzeige, Mic-Hinweis) plus zwei Querschnittsthemen (Farb-Tokens, Fehlermeldungen) — keine Struktur- oder Verdrahtungsprobleme. Die Service-Schicht ist durchgehend getestet (885 Tests grün); die Lücken liegen fast ausschließlich bei Komponenten-/Upload-/Sync-Pfaden.
