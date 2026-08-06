# QuizWise (StudeArc) — Session Handoff
**Stand: 7. August 2026 (Claude-Code-Session — Wissensnetz-Node-Dialog + Benachrichtigungssystem, Studienplaner-Redesign verworfen)**

⚠️ Diese Datei wurde zwischen Session 18 (22.06.2026) und dem 28.07.2026 nicht gepflegt — die Memory-Datei des Assistenten (`~/.claude/projects/-Users-enesyazici/memory/project_quizwise.md`) enthält den vollständigen Verlauf der dazwischenliegenden Sessions (Rebrand zu StudeArc, Klausursimulator 2.0, Fehleranalyse-Überarbeitung, Tutor-Fixes u.v.m.). Die Tabelle unten unter "Ordnerstruktur"/"Tech Stack" ist entsprechend veraltet (kein Tailwind CDN mehr Thema, viele neue Features fehlen) — bei Bedarf dort nachschlagen statt hier zu vertrauen.

---

## Was heute (07.08.2026) erledigt wurde

### Wissensnetz-Node-Dialog gebaut + deployed, Studienplaner-Redesign verworfen, Benachrichtigungssystem übernommen

Eine vorherige Session (05.08.2026) hatte parallel zwei große Dinge im Working Tree liegen, beide weder committed noch deployed: einen sechsteiligen Umbau des Kalender-Tabs zum "Studienplaner" (Lernblock-Karten, Drag & Drop, neue Datenfelder `durationMinutes`/`priority`/`learnMethod`) UND ein komplettes, modulares Benachrichtigungssystem, das auf diesem neuen Studienplaner-Datenmodell aufbaute. **Der Nutzer entschied sich explizit gegen das Studienplaner-Redesign** ("die jetzige [Kalenderfunktion] reicht völlig aus") — dieser komplette Teil wurde verworfen. Das Benachrichtigungssystem wollte er dagegen behalten ("Benachrichtigung wäre natürlich dennoch gut").

**Trennung war nötig, weil beides in denselben Dateien vermischt war** (App.tsx, types.ts, i18n-Locales, syncService.ts u.a.). Durchgeführt per Datei-/Hunk-Analyse: Kalender-Dateien komplett verworfen (`components/StudyPlanner.tsx`, `components/CalendarDayPanel.tsx`, `services/calendarSessions.ts`, `types.ts`-Feldänderungen, `package.json`-Abhängigkeit `@dnd-kit/core`, sowie die neuen Dateien `CalendarLibraryPanel.tsx`/`ProgressRing.tsx`/`services/dayBlocks.ts` gelöscht), Benachrichtigung behalten. i18n-Keys wurden manuell entflochten (Studienplaner-Keys `sp2b.*`/`sp2c.*`/`sp2d.*` raus, Benachrichtigungs-Keys `sp2e.*` behalten).

**Wichtige technische Konsequenz:** Das Backend-Benachrichtigungssystem (`backend/src/notifications/`) wurde ursprünglich FÜR das neue Studienplaner-Datenmodell gebaut, funktioniert aber auch mit dem alten Kalender weiter — `dayBlocks.js` (Backend) hat einen eingebauten Fallback, der die Blockdauer aus dem alten `startTime`/`endTime`-Paar berechnet, wenn `durationMinutes` fehlt. Nur der Motivation-Baustein **"Tagesziel/Wochenziel erreicht"** bleibt dauerhaft inaktiv (kein Crash, einfach kein Feuern) — er braucht `block_status` (Erledigt-Markierung einzelner Lernblöcke), ein Konzept, das nur im verworfenen Studienplaner existierte. Die entsprechende Sync-Plumbing (`block_status` in `syncService.ts`/`App.tsx`) wurde beim Verwerfen konsequent mit entfernt.

**Ebenfalls verworfen:** `components/NotificationBellPopover.tsx` (Glocke mit Quick-Toggles) — ihr einziger Einbauort war der Studienplaner-Header, der nicht mehr existiert. Benachrichtigungseinstellungen sind aktuell ausschließlich über den normalen Settings-Dialog (neuer Tab "🔔 Benachrichtigungen") erreichbar. Falls ein globaler Schnellzugriff (z. B. in `Layout.tsx`s Header, neben Theme-Toggle/Streak) gewünscht ist: bewusst noch nicht gebaut, da das eine neue, nicht angefragte UI-Platzierungsentscheidung gewesen wäre.

**Backend — Modul `backend/src/notifications/`** (ersetzt das alte `backend/src/push/reminderCron.js`, gelöscht):
- **Registry-Muster:** jeder Notification-Typ ein eigenständiges Modul unter `types/` — `dailyReminder.js`, `blockLeadTime.js`, `spacedRepetition.js`, `examCountdown.js`, `motivation.js` (5 Untertypen, s.o. — einer davon aktuell inaktiv).
- **`scheduler.js`:** `node-cron`-Tick alle 5 Minuten (Europe/Berlin), lädt Push-Subscriptions + Datenkontext (`dataLoader.js`), ruft alle Typen auf, sendet über bestehende `web-push`-Anbindung.
- **Dedup:** neue Tabelle `notification_log (user_id, dedup_key, sent_at)`, `INSERT ... ON CONFLICT DO NOTHING`.
- Nachrichtentexte datengetrieben, keine Platzhalter.

**Frontend:**
- Neuer Einstellungs-Tab **"🔔 Benachrichtigungen"** (`components/NotificationSettingsPanel.tsx`) — 6 Karten-Sektionen: Browser-Push-Status, Lernerinnerungen (Uhrzeit), Lernblöcke (Vorlauf), Spaced Repetition, Klausuren, Motivation.
- `services/notificationSettings.ts` (Einstellungs-Datenmodell, localStorage + Cloud-Sync über `profiles.preferences.notification_settings`).

**⚠️ MANUELL ZU ERLEDIGEN — Migration:** `backend/migration_notification_system.sql` muss in Supabase laufen, BEVOR das Backend neu deployed wird (erstellt `notification_log`-Tabelle, dokumentiert `push_subscriptions` nach). Die `block_status`-Spalte aus der ursprünglichen Migration ist nicht mehr nötig (Studienplaner verworfen) — falls die Migrationsdatei das noch enthält, diesen Teil beim Ausführen weglassen/ignorieren.

**Verifiziert:** `tsc --noEmit`, `vitest run` (707 Tests grün), `npm run build` sauber — nach der Trennung erneut komplett durchlaufen. Bundle-Grep bestätigt: keine Studienplaner-Reste (`sp2b.`/`sp2c.`/`sp2d.`/`dnd-kit`), Benachrichtigung (`sp2e.`) und Wissensnetz-Node-Dialog (s.u.) vorhanden.

**Committed:** ja, auf `main` (Node-Dialog per Fast-Forward-Merge von `feature/graph-node-dialog`, Benachrichtigung als eigener Commit obendrauf). **Deployed:** nur der Wissensnetz-Node-Dialog (s. Abschnitt unten) — das Benachrichtigungssystem ist committed, aber noch NICHT deployed (Migration steht noch aus, User-Freigabe zum Deployen noch nicht eingeholt).

### Wissensnetz: Node-Erklärer zum Dialog ausgebaut — DEPLOYED

Nach der bestehenden einmaligen KI-Erklärung zu einem Wissensnetz-Node kann der Nutzer jetzt Rückfragen stellen (5 Schnellaktionen + Freitextfeld), streng gebunden an den Node-Kontext (Titel/Beschreibung/Notizen/Beziehungen zu anderen Nodes) — kein allgemeiner Chat. Details in der Assistenten-Memory (`project_quizwise_knowledge_graph.md`, Abschnitt "Node-Erklärer zum Dialog ausgebaut"). Live auf studearc.com/www.studearc.com/quizwise-kappa.vercel.app, `npm run smoke` grün.

---

## Was heute (29.07.2026) erledigt wurde

### Dashboard-Redesign "Persönlicher Lerncoach statt Funktionsliste" — DEPLOYED, aber Nutzer noch unzufrieden
Ausgangspunkt: Figma-artiges HTML-Mockup (drei Breakpoints iPhone/iPad/Desktop) vom User freigegeben, dann 1:1 in `components/Dashboard.tsx` nachgebaut (React/Tailwind, keine neuen Farb-Tokens — Mockup nutzte zufällig exakt dieselben Hex-Werte wie die bestehenden `app.css`-Variablen `--bg-main/--bg-sidebar/--text-main/--primary` etc.).

**Neue Struktur:** Begrüßungs-Hero (mit lebendem Uhrzeit-Update, alle 60s) + Klausur-Countdown-Zeile (falls Termin eingetragen) + "Heute solltest du"-Tagesliste (rot/gelb/grün-Priorität, aus echten Signalen: fällige Karten, Fehlerfragen, Klausur ≤7 Tage, Streak) → 3 Stat-Karten (Karten fällig / Lernserie / Tage bis Klausur ODER Fortschritt) → "Weiterlernen"-Karte (Primary-gefüllt, animierte Fortschritts-Leiste, nur sichtbar wenn ein Quiz offen ist ODER mind. 1 Karteikarten-Deck existiert) → "Lernfortschritt"-Karte (`buildLearningScore().overall`, ausgeblendet wenn `null`) → bestehende KI-"Nächste Schritte" (`flowResult`) neu eingefärbt statt entfernt → fixes Prioritäts-Grid (Quiz/Tutor/Karteikarten/Simulator/Feynman/**Mindmap**/Bibliothek, 7 Karten, letzte spannt volle Zeilenbreite). Alles Modul-gefiltert nach `activeModuleId` (`useModuleScopedActivity`, eigener Deck-Scoping-Helper über `sourceDocumentId`). Eigener Onboarding-Screen (`documents.length === 0`) bleibt, nur neu gestylt.

**Dateien:** `components/Dashboard.tsx` (komplett neu), `components/AppContent.tsx` (neue Props `decks/metrics/collections/activeModuleId` an allen 5 Dashboard-Stellen durchgereicht), `i18n/locales/{de,en,tr}.ts` (13 neue Keys, alle drei Sprachen — Typecheck verlangt identische Keys in allen dreien).

**Iterative Live-Fixes nach User-Feedback** (jeweils commit+push+`vercel --prod`, kein Preview-Zwischenschritt gewünscht):
1. Hand-Emoji raus, letzte Grid-Karte (damals Mindmap) spannt volle Breite statt verwaist allein zu stehen.
2. Bibliothek statt Mindmap ans Ende verschoben (soll die größte/unterste Karte sein).
3. Begrüßung reagiert jetzt live auf Tageszeit-Wechsel (60s-Timer), nicht nur beim Neuladen.
4. Klausur-Countdown zusätzlich als Zeile direkt unter der Begrüßung (nicht nur in der Stat-Karte).
5. **Bug gefunden + gefixt:** `Layout.tsx` wickelt jeden Tab schon in `max-w-6xl mx-auto` — meine eigene zusätzliche `max-w-3xl mx-auto` im Dashboard erzeugte eine doppelt-zentrierte, zu schmale Spalte mit viel Leerraum auf breiten Screens. Entfernt.
6. Alle 7 Grid-Icons hatten dieselbe Gold-Farbe (Copy-Paste-Fehler beim Übertragen aus dem Mockup, das eigentlich gold/navy alternierte) → Alternierung wiederhergestellt; "Alles erledigt"-Box von grauer Notiz auf grün-getönten Erfolgs-Zustand geändert.

### ⚠️ Offener Punkt — vom User bewusst vertagt, nächstes Mal weitermachen
**User ist mit dem Dashboard-Redesign insgesamt weiterhin unzufrieden** ("gefällt mir nicht"), trotz der obigen Fixes. Auf Rückfrage, wie wir weitermachen sollen (zurück zum alten Dashboard? anderer visueller Stil? gezielt durchgehen was stört?) kam noch keine Antwort — der User ist stattdessen zur "Weiterlernen fehlt"-Frage und dann zum Handoff gesprungen. **Nächstes Mal zuerst klären:**
1. Ist es eher die Grundstruktur/das Konzept, das nicht gefällt, oder Details (Farben/Abstände/Dichte)?
2. Hat der Account `yazicienes19@gmail.com` echte Karteikarten-Decks? Falls ja: "Weiterlernen"-Karte erscheint trotzdem nicht → das wäre ein echter Bug in der `decks`-Prop-Weiterleitung (`AppContent.tsx`→`Dashboard.tsx`), noch nicht verifiziert. Falls nein: Account ist einfach noch leer, Verhalten ist korrekt aber unbefriedigend für einen Test-Account — evtl. lohnt sich ein reichhaltigerer Empty/Low-Data-Zustand statt der aktuellen kargen "0/0/X"-Stat-Reihe.
3. Alternative ernsthaft in Betracht ziehen: kompletter Rollback auf das alte, vor dem Redesign bestehende Dashboard (git-Historie hat den alten Stand, Commit vor `8e4acd3`), Mindmaps dort einfach nur als zusätzliche Karte ergänzen — falls der Nutzer das Redesign grundsätzlich nicht will, statt weiter an Details zu schrauben.

**Deploy-Historie dieser Session** (alle auf `studearc.com`, Vercel-Projekt `quizwise`): `8e4acd3` (Redesign) → `9fa1536` (Breiten-Fix) → `163d221` (Farb-Abwechslung). `HANDOFF.md`s "Live URLs"-Tabelle unten ist veraltet (`quizwise-kappa.vercel.app` existiert evtl. nicht mehr) — aktuelle Produktions-URL ist **studearc.com**, verlinktes Vercel-Projekt laut `.vercel/project.json`: `quizwise` (orgId `team_rsOK3jlRYNjsq4m56GICiqOt`).

---

## Was heute (28.07.2026) erledigt wurde

### 1. Echte Zitier-Engine (citeproc-rs) statt Gemini-Formatierung — DEPLOYED
`components/TermPaperSystem.tsx`s Zitierfunktion (APA/MLA/Harvard/Chicago) ließ bisher Gemini die Formatierung frei erledigen (fehleranfällig bei Interpunktion/et-al-Regeln). Neu: **`services/citeprocService.ts`** nutzt `@citeproc-rs/wasm` (dieselbe Engine wie die echte Zotero-App) mit den Original-Zotero-Stildateien (`public/csl/styles/`, auf eine mit der Engine-Version kompatible Revision gepinnt — aktuelle Zotero-Dateien nutzen neuere CSL-Features, die diese Engine-Version nicht versteht) + deutscher Locale (`public/csl/locales/`, ebenfalls gepinnt). `services/geminiService.ts`s `formatCitationFull` läuft jetzt OHNE Gemini-Call (Felder sind schon strukturiert genug); `magicFormatCitation` extrahiert nur noch Rohdaten per Gemini und formatiert dann ebenfalls über citeproc. `markmap-lib/-view/-toolbar` durch `d3` ersetzt (für ein zwischenzeitliches Canvas-Experiment, s.u.) — Bundle-Chunk dadurch von ~915 KB auf ~53 KB geschrumpft. `vite-plugin-wasm` + `vite-plugin-top-level-await` neu für den Produktions-Build. Live getestet (Autor-Format "Nachname, Initiale & Nachname2, Initiale2" korrekt geparst, deutsche Begriffe "und"/"S." korrekt) — **User hat deployed**.

### 2. Mindmap-Feature fertiggestellt + Fach-Zuordnung — DEPLOYED
Das Mindmap-Feature war bei Sessionbeginn unfertig: `MindmapEditor`/`MindmapSystem`/`mindmapService.ts` existierten uncommitted, aber `AppContent.tsx` hatte keinen `case ActiveTab.MINDMAP` (Klick auf "Mindmap" landete auf dem Dashboard). Fehlenden Case ergänzt, dann mehrere Nutzer-Feedback-Runden live:
- **V1 (verworfen):** Direktes Klick-Bearbeiten auf der Mindmap-Karte selbst (SVG + foreignObject + d3-zoom + Drag&Drop) — live getestet, zu fragil (Klicks/Bearbeiten funktionierten nicht zuverlässig).
- **V2 (aktuell, live):** **`components/MindmapOutlineEditor.tsx`** — saubere Gliederungsliste links (ein Textfeld pro Punkt, keine sichtbaren `#`-Hashtags), Enter=neue Zeile, Tab/Shift+Tab=ein-/ausrücken (rückt unter die tatsächlich vorherige — auch tiefer verschachtelte — Zeile ein, nicht nur unter das direkte Geschwister, sonst lassen sich Äste nicht beliebig tief fortsetzen), „+" pro Zeile verlängert genau diesen Ast direkt. **`components/MindmapCanvas.tsx`** rechts — reine, nicht editierbare Vorschau (d3-hierarchy-Layout, Zoom/Pan, PNG-Export unverändert wiederverwendbar weil alles ein einziges SVG bleibt), aber mit zwei Interaktionen: Äste einzeln ein-/ausklappen (▾/▸-Button pro Knoten) und **jeder einzelne Knoten frei färbbar** (natives Farbrad direkt am Knoten in der Vorschau, nicht in der Liste — Farbe vererbt sich standardmäßig an Unterpunkte, bis ein Nachfahre selbst überschrieben wird).
- **Datenmodell:** `services/mindmapTree.ts` — `MindmapNode {id, text, children, color?, collapsed?}`, reine Baum-Mutationen (`addChild`/`deleteNode`/`moveNode`/`indentNode`/`outdentNode`/`addSiblingAfter`/`updateNodeColor`/`toggleCollapsed`/`pruneCollapsed`), 29 Tests. **Persistenzformat gewechselt**: `MindmapItem.markdown` ist trotz Feldname jetzt JSON (`serializeMindmap`/`deserializeMindmap`) statt rohem Heading-Markdown — mit Rückwärtskompatibilität (alte Bestandsmindmaps im Heading-Format werden weiterhin korrekt geparst, bekommen erst beim nächsten Speichern das neue JSON-Format).
- **Fach-Zuordnung (User-Wunsch):** `MindmapItem.collectionId?: string` (neue Spalte `mindmaps.collection_id`, Migration `backend/migration_mindmaps_collection_id.sql` — **User hat sie ausgeführt**). Beim Anlegen vorausgewählt mit dem aktuell aktiven Fach (gleiches "Variante C"-Muster wie `SourceSelector.tsx`), nachträglich änderbar im Editor, Liste filtert automatisch nach aktivem Fach (`key={mindmap-${activeModuleId}}`-Remount-Muster wie bei Quiz/Exam/Explainer in `AppContent.tsx`). Migration `backend/migration_mindmaps_table.sql` (Basis-Tabelle) wurde bereits in einer früheren Session-Runde heute ausgeführt.

### ⚠️ Offener Punkt — vom User bewusst vertagt, nächstes Mal weitermachen
**Admin-Gating von Mindmap ungeklärt.** `components/navConfig.ts` hat `ActiveTab.MINDMAP` aktuell in der allgemeinen "Lernen"-Gruppe (**für ALLE Nutzer sichtbar**), nicht in `LABOR_GROUP` (admin-only, wie Hausarbeit/Recherche). Ich hatte das explizit als Frage gestellt ("soll Mindmap für alle sichtbar bleiben oder erstmal admin-only wie die anderen Labor-Features?") — der User ist direkt ins Feedback zur Bedienung gesprungen, ohne das zu beantworten. Vor einem "richtigen" Rollout an alle Nutzer nochmal aufgreifen: Ist das Feature schon reif genug für alle, oder soll es erstmal (wie Hausarbeit/Recherche) nur der Admin-Account sehen?

**Sonstiges, das noch nicht ausprobiert/verifiziert wurde:**
- Drag & Drop zum freien Umhängen von Ästen (über Tab/Shift+Tab hinaus) wurde zwar geplant, aber nach dem gescheiterten Klick-Editor-Versuch nicht in die finale Gliederungslisten-Version übernommen — aktuell nur Tab/Shift+Tab zum Umstrukturieren.
- PNG-Export der Mindmap mit Farben/eingeklappten Ästen wurde noch nicht live getestet (nur die Grundfunktion vor den Farb-/Einklapp-Änderungen).
- Mehrere Mindmaps mit unterschiedlichen Fächern im Alltag noch nicht über einen längeren Zeitraum getestet.

---

## Projekt-Übersicht

QuizWise ist eine KI-gestützte Lern-App für Schüler und Studenten. Ziel: Veröffentlichung als kommerzielle SaaS-App mit Freemium-Modell (Free: 20 KI-Anfragen/Tag, Pro: 6,99€/Monat unlimitiert).

---

## Tech Stack

| Teil | Technologie |
|---|---|
| Frontend | React 19 + TypeScript + Vite + Tailwind CSS v3 (Build-Time) |
| Backend | Node.js + Express + Helmet + express-rate-limit |
| Auth + Datenbank | Supabase (RLS, JSONB Cloud-Sync) |
| KI | Google Gemini API (Tiered: flash-lite / flash) |
| Chart | Recharts (`^3.8.1`) |
| Suche (Web) | Wikipedia API (kostenlos) |
| Suche (Scholar) | OpenAlex API (kostenlos) |
| Bezahlung | Stripe |
| Tests | Vitest + @testing-library (28 Tests) |
| PWA | vite-plugin-pwa + Service Worker |

---

## Ordnerstruktur

```
/Users/enesyazici/Desktop/quizwise/
├── App.tsx                         ← 220 Zeilen, Cloud-Load bei Login
├── app.css                         ← Tailwind + Custom Styles (NEU Session 17)
├── tailwind.config.cjs             ← Build-Time Tailwind Config (NEU)
├── postcss.config.cjs              ← PostCSS Config (NEU)
├── types.ts
├── index.html                      ← FOUC-Prevention JS, Fonts (kein CDN mehr)
├── index.tsx                       ← CSS-Import, SW-Recovery
├── vite.config.ts                  ← PWA, manualChunks, Vitest
├── .env                            ← VITE_BACKEND_URL, VITE_SUPABASE_*
├── components/
│   ├── ErrorBoundary.tsx           ← React Error Boundary (Session 17)
│   ├── PwaUpdatePrompt.tsx         ← "Neue Version verfügbar" Banner (NEU Session 18)
│   ├── AppContent.tsx              ← Tab-Routing
│   ├── (AgentChat.tsx)             ← ❌ ENTFERNT Session 18 (Bot raus)
│   ├── Layout.tsx                  ← Sidebar, Topbar, Admin-Nav
│   ├── Dashboard.tsx
│   ├── LandingPage.tsx
│   ├── FlashcardSystem.tsx         ← Karteikarten + Supabase-Sync
│   ├── ExamSystem.tsx / ExamView.tsx / ExamGenerator.tsx
│   ├── ExplainerSystem.tsx         ← Feynman-Methode + Spracheingabe
│   ├── ActiveRecall.tsx
│   ├── QuizPlayer.tsx / QuizSetup.tsx / ResultView.tsx
│   ├── StudyPlanner.tsx
│   ├── GapRadar.tsx
│   ├── ScholarSearch.tsx / TermPaperSystem.tsx
│   ├── SettingsModal.tsx           ← Design-Preferences synchen zu Cloud
│   ├── LegalModal.tsx              ← ⚠️ Platzhalter-Texte!
│   └── ...
├── services/
│   ├── syncService.ts              ← Zentraler Cloud-Sync (Session 17)
│   ├── geminiService.ts            ← Alle KI-Funktionen (nutzt quizNormalize)
│   ├── quizNormalize.ts            ← KI-Quiz-Normalisierung (NEU Session 18)
│   ├── quizNormalize.test.ts       ← 8 Tests (NEU Session 18)
│   ├── (agentService.ts)           ← ❌ ENTFERNT Session 18 (Bot raus)
│   ├── flashcardService.ts         ← Deck-Sync zu Supabase
│   ├── streakService.ts            ← + Cloud-Sync
│   ├── quizHistoryService.ts       ← + Cloud-Sync
│   ├── examHistoryService.ts       ← + Cloud-Sync
│   ├── recallHistoryService.ts     ← + Cloud-Sync
│   ├── savedQuizzesService.ts      ← + Cloud-Sync
│   ├── savedExamsService.ts        ← + Cloud-Sync
│   ├── libraryService.ts           ← + Cloud-Sync
│   ├── supabaseClient.ts
│   ├── spacedRepetition.ts         ← SM-2 Algorithmus
│   ├── spacedRepetition.test.ts    ← 13 Tests
│   └── streakService.test.ts       ← 7 Tests
├── hooks/
│   ├── useAuth.ts                  ← + Preferences-Load aus Cloud
│   ├── useDocuments.ts
│   └── useQuizState.ts             ← + userId für Sync
├── config/
│   └── admin.ts                    ← ADMIN_IDS + isAdmin()
└── backend/
    ├── src/
    │   ├── index.js                ← Helmet, Rate-Limiting (3 Stufen)
    │   ├── routes/
    │   │   ├── gemini.js           ← Input-Validation, Parts-Check
    │   │   ├── documents.js        ← UUID-Validation
    │   │   ├── agents.js           ← Message-Längenprüfung
    │   │   ├── search.js
    │   │   ├── user.js             ← + preferences im Profil
    │   │   └── stripe.js           ← Customer-Metadata für robuste Webhooks
    │   └── middleware/
    │       ├── auth.js             ← supabaseAdmin + createUserClient (NEU)
    │       ├── limits.js           ← req.supabase (User-scoped)
    │       └── agentLimits.js      ← Fail-Close bei DB-Fehler
    ├── migration_cloud_sync.sql    ← ⚠️ MUSS IN SUPABASE AUSGEFÜHRT WERDEN
    ├── supabase_schema.sql
    └── .env
```

---

## Live URLs

| Service | URL | Status |
|---|---|---|
| Frontend | https://quizwise-kappa.vercel.app | ✅ Live |
| Backend | https://quizwise-backend-production.up.railway.app | ✅ Live |

---

## Deployment-Befehle

```bash
# Frontend — aus Root-Verzeichnis
cd /Users/enesyazici/Desktop/quizwise
vercel --prod

# Backend — aus backend/ Verzeichnis (NICHT Root!)
cd /Users/enesyazici/Desktop/quizwise/backend
railway up --service quizwise-backend
```

---

## Was in Session 18 erledigt wurde (21.–22. Juni 2026)

### Stabilität & Analyse-Umsetzung
- **Quiz-Crash behoben** (`undefined.correctAnswerIndices.includes`): Gemini ließ trotz `responseSchema` Felder weg. Neues Modul **`services/quizNormalize.ts`** (`normalizeQuizQuestions` + `parseQuizQuestions`) füllt fehlende Felder, entfernt unspielbare Fragen, validiert Antwort-Indizes. Eingehängt in alle Quiz-Pfade (`generateQuizFromDocument`, `generateQuizFromFlashcards`) + Null-Fragen-Guards in den Handlern. **8 neue Tests**.
- **Backend-Error-Leak behoben**: globaler Handler (`backend/src/index.js`) zeigt nur noch `err.expose===true` oder 4xx-Meldungen, sonst generisch; voller Stacktrace nur ins Log. `gemini.js`-catch klassifiziert KI-Fehler (quota→503, SAFETY→400, timeout→504; **kein 429** — das ist Frontend-Tageslimit). `limits.js` loggt RPC-Fehler statt zu leaken.
- **PWA Update-Banner**: `registerType` 'autoUpdate' → **'prompt'** + `injectRegister:false`; `components/PwaUpdatePrompt.tsx` zeigt „Neue Version verfügbar – Neu laden". Löst das Stale-Cache-Problem in Safari (greift ab dem nächsten Deploy).
- **`documentDisplayName(doc)`** in `libraryService.ts`: zeigt gespeicherten `displayTitle` statt rohem Dateinamen. Verwendet in SourceSelector, ExamGenerator, QuizSetup, ActiveRecall, useQuizState.

### UI-Fixes
- **„Zertifikat-Status: Akkreditiert" entfernt** aus ExamGenerator (irreführend).
- **SourceSelector / FlashcardSystem Layout**: Tabs schrumpfbar, Metadaten-Zeile truncate, Generator-Spalte col-span-4→5 (war in schmaler Spalte zerquetscht).

### Bot entfernt
- **AgentChat komplett raus** (Onboarding-Tutorials reichen): 4 Renderstellen + State/Buttons; `AgentChat.tsx` und `agentService.ts` gelöscht. Backend-Route `/api/agents` bleibt ungenutzt liegen.

### Code-Audit-Fixes (Quiz/Karteikarten/Hausarbeit/Recall)
- **Fisher-Yates-Shuffle** in QuizPlayer (vorher verzerrtes `sort(()=>Math.random()-0.5)`).
- **Speech-Cleanup beim Unmount** in ActiveRecall (Mikrofon lief weiter).
- SM-2 (`spacedRepetition.ts`) geprüft: korrekt + getestet. Keine kritischen Bugs gefunden.

### Mobile-Überarbeitung (Quiz, Karteikarten, Klausur, Dashboard, Bibliothek)
- **Wichtigste echte Bugs:** Fixe Aktionsleisten lagen hinter der unteren Tab-Navi → **QuizPlayer-CTA** und **ExamView-Submit** jetzt `bottom-[calc(...+safe-area)] md:bottom-0`. **Dashboard-Hero** `tracking-[1em]` und `text-7xl` sprengten schmale Handys. **FlashcardPlayer** `min-w-[350px]`-Button-Overflow.
- Plus durchgängig responsive Schrift/Paddings (`text-Xxl`→kleinere Mobile-Basis, `p-8/p-10`→`p-5 sm:`).

---

## Was in Session 17 erledigt wurde (17. Juni 2026)

### Audit — 5 Commits

| Commit | Inhalt |
|---|---|
| `9006507` | Helmet + Rate-Limiting (60/30/5 req/min), Body 50→10MB, 5 TS-Fehler gefixt, Tailwind CDN → Build-Time, Bundle -12% |
| `916af1c` | ErrorBoundary, Agent-Limit Fail-Close, Stripe Webhook Customer-Metadata |
| `debb0e8` | Supabase Service-Key Trennung (supabaseAdmin + req.supabase), Input-Validation |
| `9c5e06c` | Dead Code entfernt (getApiKey/hasApiKey), jsPDF lazy import, Vitest + 20 Tests |
| `5675ed8` | localStorage → Supabase Cloud-Sync (alle Nutzerdaten) |

### Audit-Scores (vorher → nachher)

| Kategorie | Vorher | Nachher |
|---|---|---|
| Sicherheit | 5/10 | 9/10 |
| Code-Qualität | 6/10 | 8/10 |
| Performance | 4/10 | 7/10 |
| Architektur | 7/10 | 7/10 |
| Produktionsreife | 4/10 | 7/10 |

### Cloud-Sync — was jetzt gesyncht wird

| Daten | Cloud-Tabelle |
|---|---|
| Streak, Exam-Termine, Quiz/Exam/Recall-History | `user_learning_data` (JSONB) |
| Gespeicherte Quizze/Klausuren, Bibliotheks-Meta | `user_saved_content` (JSONB) |
| Theme, Akzentfarbe, Font, Zeilenabstand | `profiles.preferences` (JSONB) |
| Lern-Metriken | `metrics` (bestehende Tabelle) |

**Sync-Pattern:** Login → Cloud laden → localStorage als Cache. Schreiben → localStorage sofort + Supabase async. Offline → nur localStorage. Migration: Cloud leer + localStorage hat Daten → einmalig hochladen.

---

## ⚠️ MANUELL ZU ERLEDIGEN

### 0. ⚠️ OFFEN (07.08.2026): `backend/migration_notification_system.sql` ausführen, dann Backend deployen
Supabase → SQL Editor → `backend/migration_notification_system.sql` ausführen (den `block_status`-Teil ggf. weglassen, s. Abschnitt "Was heute (07.08.2026) erledigt wurde" — das Studienplaner-Redesign, das dieses Feld gebraucht hätte, wurde verworfen). Erstellt: `notification_log`-Tabelle (Dedup für Benachrichtigungen), dokumentiert nachträglich die bereits live existierende `push_subscriptions`-Tabelle. **Ohne diese Migration läuft der neue Notification-Scheduler nicht** — Backend darf erst danach neu deployed werden. Frontend+Backend-Deploy für das Benachrichtigungssystem steht noch aus (User-Freigabe noch nicht eingeholt, s.o.).

### 1. SQL-Migration ausführen (Cloud-Sync aktivieren)
Supabase → SQL Editor → `backend/migration_cloud_sync.sql` ausführen.
Erstellt: `user_learning_data`, `user_saved_content`, `profiles.preferences`-Spalte.

### 2. ✅ ERLEDIGT (Session 18): `shared_decks`-Tabelle
Tabelle wurde angelegt und technisch verifiziert. **Wichtig:** `id` ist **`text`** (Deck-IDs sind `Math.random().toString(36)`, KEINE uuid) — die alte HANDOFF-SQL mit `id uuid` war falsch und hätte beim Insert gecrasht. Korrekte Version (falls je neu nötig):
```sql
create table if not exists public.shared_decks (
  id text primary key, owner_id uuid references auth.users(id),
  name text, cards jsonb, created_at timestamptz default now()
);
alter table public.shared_decks enable row level security;
create policy "Public read"  on public.shared_decks for select using (true);
create policy "Owner insert" on public.shared_decks for insert with check (auth.uid() = owner_id);
```

### 2b. ✅ ERLEDIGT: Admin-ID
`config/admin.ts` enthält bereits eine echte User-ID (`efb1b348-…`). Labor-Features (KI-Erklärer, Recherche, Hausarbeit) sind für diesen Account sichtbar.

### 3. Stripe Live-Aktivierung (vor öffentlichem Launch)
- Stripe-Konto aktivieren → Live Keys
- Railway Env Vars: `STRIPE_SECRET_KEY`, `STRIPE_PRO_PRICE_ID`, `STRIPE_WEBHOOK_SECRET`
- Webhook-Endpoint: `https://quizwise-backend-production.up.railway.app/api/stripe/webhook`
- Events: `checkout.session.completed`, `customer.subscription.deleted`

### 4. DSGVO / Legal (vor Launch — in DE Pflicht) — LETZTER ECHTER LAUNCH-BLOCKER
- `LegalModal.tsx`: Impressum (§5 TMG), Datenschutz, AGB sind **ausformuliert**; es fehlt **nur noch die Anschrift** — überall stehen Platzhalter `[Straße Hausnummer]` / `[PLZ Ort]` (Impressum, „Verantwortlich", Datenschutz, AGB). Name (Enes Yazici) + E-Mail (yazicienes19@gmail.com) sind drin. Ladungsfähige Anschrift ist in DE Pflicht.
- `CookieBanner.tsx` existiert bereits.

---

## Backend-Sicherheit (aktueller Stand)

| Maßnahme | Details |
|---|---|
| **Helmet** | Security-Headers (HSTS, X-Content-Type, X-Frame etc.) |
| **Rate-Limiting** | Global 60/min, Gemini/Agents 30/min, Stripe 5/min |
| **Body-Limit** | 10 MB (vorher 50 MB) |
| **Supabase-Trennung** | `supabaseAdmin` nur für Auth + Webhooks, `req.supabase` (User-JWT) für Datenzugriffe |
| **Input-Validation** | UUID-Check (documents), Parts-Struktur (gemini), Message-Länge (agents) |
| **Agent-Limit** | Fail-Close bei DB-Fehler (503 statt Durchlassen) |
| **Stripe** | Customer-Metadata für robuste subscription.deleted Webhooks |
| **ErrorBoundary** | React-Crashes zeigen Fehlermeldung statt weiße Seite |
| **Kein Error-Leak** (Session 18) | Globaler Handler: nur `err.expose`/4xx zeigen Meldung, sonst generisch; Stacktrace nur ins Log. KI-Fehler klassifiziert (quota→503, SAFETY→400, timeout→504) |

---

## Bekannte offene Bugs (aus altem HANDOFF — teils noch relevant)

| Bug | Status |
|---|---|
| Quiz-Crash bei fehlendem `correctAnswerIndices` | ✅ Gefixt (Session 18 — zentrale KI-Normalisierung) |
| Backend leakt interne Fehlermeldungen an Client | ✅ Gefixt (Session 18) |
| Stale-Cache / „funktioniert nicht trotz Deploy" (Safari PWA) | ✅ Update-Banner (Session 18) |
| Verzerrtes Mischen im Quiz (`sort(Math.random)`) | ✅ Fisher-Yates (Session 18) |
| Mobile: fixe Buttons hinter Tab-Navi (Quiz/Klausur) | ✅ Gefixt (Session 18) |
| LegalModal: nur noch Anschrift fehlt | ⚠️ Noch offen (siehe MANUELL #4) |
| `as any` (8×), mehr Tests für UI-Komponenten | 🟡 Niedrige Prio, offen |
| TypeScript-Fehler | ✅ Alle gefixt (Session 17) |
| Kein Error Boundary | ✅ Gefixt (Session 17) |
| Bundle 3 MB | ✅ Reduziert auf 2.8 MB + Chunks (Session 17) |
| Tailwind CDN in Produktion | ✅ Build-Time Tailwind (Session 17) |
| localStorage-Datenverlust | ✅ Cloud-Sync implementiert (Session 17) |

---

## Design-System-Regeln

```
localStorage.font_choice   → --font-app       → body font-family
localStorage.line_height   → --line-height-app → body line-height
localStorage.accent_color  → --primary         → Akzentfarbe
localStorage.theme         → html.dark class   → Dark/Light Mode
```

Alle 4 Werte werden in `index.html` beim Start synchron gesetzt (FOUC-Prevention) und bei Login aus Cloud geladen.

- Akzentfarbe: `style={{ background: 'var(--primary)' }}` — niemals hardcoded indigo
- Text auf Akzent: `style={{ color: 'var(--primary-text)' }}`
- Karten: `var(--bg-sidebar)`, `var(--border-color)`
- Semantisch: `rose-*` = Fehler, `emerald-*` = Erfolg, `amber-*` = Warning

---

## Session-Verlauf

| Session | Datum | Schwerpunkte |
|---|---|---|
| **18** | **21.–22.06.2026** | **Quiz-Crash-Fix (KI-Normalisierung + Tests), Backend-Error-Leak behoben, PWA Update-Banner, `shared_decks` eingerichtet, AKKREDITIERT raus, Formatierungs-Fixes, Bot (AgentChat) entfernt, Code-Audit-Fixes (Fisher-Yates, Speech-Cleanup), kompletter Mobile-Durchgang** |
| 17 | 17.06.2026 | Full Audit: Security (Helmet, Rate-Limit, Supabase-Trennung, Input-Validation), TS-Fehler, Tailwind Build-Time, ErrorBoundary, Cloud-Sync (localStorage → Supabase), Vitest, Dead Code Cleanup |
| 16 | 22.05.2026 | Schriftart-Auswahl, Zeilenabstand, line-height Default |
| 15 | 21.05.2026 | storagePath-Architektur, Recall, Erklärer, Bild-Support |
| 14 | 20.05.2026 | Railway Hobby-Plan, Backend deploy |
| 13 | 20.05.2026 | Klausur 5 Fragetypen, GapRadar → Quiz-Navigation |
| 12 | 20.05.2026 | Lern-Analyse (GapRadar) |
| 11 | 20.05.2026 | Mobile/Tablet Layout |
| 10 | 19.05.2026 | StudyPlanner Kalender-UI |
| 9 | 19.05.2026 | Quiz-Flow, QuizSetup, ResultView |
| 8 | 19.05.2026 | Bibliothek als Lern-Schaltzentrale |
| 7 | 18.05.2026 | --primary-text, CSS-Override-System |
| 6 | 18.05.2026 | Recherche Web/Scholar |
| 4-5 | 17.-18.05.2026 | Editorial Design, Navigation |
| 1-3 | 17.05.2026 | Grundarchitektur, alle 11 Module, Deployment |
