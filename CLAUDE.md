# CLAUDE.md — QuizWise: Kompletter Feature-Ausbau zur Markttauglichkeit

QuizWise: AI-Lern-App (React/Vite/TypeScript, Gemini API, Supabase, Stripe, Vercel).
Zielgruppe: Studierende DACH. Dieses Dokument ist der vollständige Arbeitsplan.
Arbeite die Pakete IN REIHENFOLGE ab. Jedes Paket = 1 Commit. Nach jedem Paket
muss `npm run dev` fehlerfrei laufen.

## Design-Regeln (gelten für ALLES)
- Primärfarbe: `var(--primary)` — niemals hartkodiertes indigo/coral
- Ecken: rounded-2xl / rounded-[20px] / rounded-[28px]
- Microcopy: text-[9px]–[11px] font-black uppercase tracking-widest
- Dark Mode: jede neue UI braucht dark:-Varianten
- UI-Sprache: Deutsch, Verben statt Substantive ("Klausur üben" nicht "Klausur-Modus")
- TypeScript strict, keine neuen any-Typen

## Bereits fertige Dateien (liegen im Repo-Root unter /claude-deliverables, einbauen!)
- components/SplashScreen.tsx, components/Onboarding.tsx
- services/errorMessages.ts, hooks/usePersistentState.ts
- services/spacedRepetition.ts (SM-2, FERTIG — nur verdrahten)
- services/streakService.ts (FERTIG — nur verdrahten)
- design-tokens.css, navConfig.ts

---

## PAKET 0 — Grundlagen einbauen (falls noch nicht geschehen)
1. SplashScreen statt `return null` bei !authChecked
2. Onboarding mounten (isOnboardingDone-Flag), onStartUpload → Bibliothek
3. resolveErrorMessage() in ALLEN catch-Blöcken/handleApiError
4. Auth-Timeout 3000 → 1500ms
5. saveQuizProgress debouncen (250ms)
6. Toten Code entfernen: quizwise_current_quiz (write-only localStorage)
7. design-tokens.css einbinden, indigo-Klassen → var(--primary) migrieren
8. Layout.tsx auf NAV_GROUPS aus navConfig.ts umstellen
✓ Fertig wenn: App startet mit Splash, neue Nutzer sehen Onboarding,
  Nav zeigt 3 Gruppen, keine indigo-Hartkodierung mehr in components/

## PAKET 1 — Spaced Repetition (Retention-Kern)
1. services/spacedRepetition.ts einbauen
2. Flashcard-Typ um `srs: SrsState` erweitern, migrateLegacyCard für Bestand
3. FlashcardPlayer: nach jeder Karte 4 Buttons — Nochmal(1) / Schwer(3) /
   Gut(4) / Easy(5) → reviewCard() aufrufen, Ergebnis speichern
4. Karteikarten-Übersicht: nur fällige Karten (getDueCards) als Standard-
   Lernstapel, Rest unter "Alle Karten"
5. Dashboard + Nav-Badge: "X fällig heute" (countDueCards), Akzentfarbe
   wenn > 0
✓ Fertig wenn: Karte mit "Easy" bewertet verschwindet für >= 6 Tage aus
  dem Fällig-Stapel; Badge zählt korrekt; alte Karten ohne srs crashen nicht

## PAKET 2 — Streak & tägliche Bindung
1. services/streakService.ts einbauen
2. recordActivity() aufrufen bei: Quiz abgeschlossen, >= 5 Karten wieder-
   holt, Recall-Session beendet, Klausur abgegeben
3. Header: Flammen-Icon + Zahl (getStreak().current), gefüllt wenn
   todayDone, sonst Outline
4. Dashboard-Karte: "Streak: X Tage · Rekord: Y" + Hinweis was heute noch
   fehlt wenn !todayDone
✓ Fertig wenn: Aktivität heute erhöht Streak genau 1x; Streak bricht nach
  einem übersprungenen Tag auf 0

## PAKET 3 — Quiz-Verbesserungen
1. Tastatur: Tasten 1–4 wählen Antwort, Enter = weiter/bestätigen
2. Nach falscher Antwort: Erklärung IMMER aufgeklappt anzeigen (nicht
   versteckt), korrekte Antwort grün markiert
3. Mobile: Antwort-Buttons min-h-[52px], voller Touch-Bereich
4. Multi-Dokument-Quiz: In QuizSetup mehrere Dokumente auswählbar
   (Checkbox-Liste statt Single-Select); Gemini-Prompt erhält die Inhalte
   aller gewählten Docs mit Quellen-Label pro Frage
✓ Fertig wenn: Quiz komplett ohne Maus spielbar; Quiz aus 2+ Docs zeigt
  pro Frage aus welchem Dokument sie stammt

## PAKET 4 — Klausur üben (USP ausbauen)
1. Nach Abgabe: deutsche Notenskala anzeigen — Note = 1.0 bis 5.0 nach
   Standard-Notenschlüssel (>=95% → 1.0, >=90 → 1.3, >=85 → 1.7, >=80 → 2.0,
   >=75 → 2.3, >=70 → 2.7, >=65 → 3.0, >=60 → 3.3, >=55 → 3.7, >=50 → 4.0,
   sonst 5.0), groß und prominent
2. PDF-Export des Ergebnisses (jsPDF ist ok als neue Dependency):
   Titel, Datum, Note, Fragen mit eigener + richtiger Antwort
3. NEUES FEATURE "Altklausur-Stil": Upload-Option "Das ist eine Altklausur"
   in der Bibliothek → beim Klausur-Generieren Option "Im Stil von [Alt-
   klausur]" → Gemini-Prompt: analysiere Fragestil, Schwierigkeitsgrad,
   Aufgabentypen der Altklausur und generiere NEUE Fragen zum gewählten
   Lernstoff in exakt diesem Stil
✓ Fertig wenn: Abgabe zeigt Note; PDF lädt herunter; Klausur im Altklausur-
  Stil unterscheidet sich erkennbar von Standard-Generierung

## PAKET 5 — Erklären üben (Feynman-USP)
1. First-Visit-Intro (localStorage-Flag): 2 Sätze was die Feynman-Methode
   ist + "Erkläre es so, dass es ein Zwölfjähriger versteht"
2. Spracheingabe: Web Speech API (webkitSpeechRecognition, de-DE) als
   Mikrofon-Button neben der Texteingabe; Transkript landet im Textfeld;
   Fallback-Hinweis wenn Browser nicht unterstützt
✓ Fertig wenn: Erster Besuch zeigt Intro genau 1x; Diktat auf Deutsch
  füllt das Textfeld in Chrome/Safari

## PAKET 6 — Dashboard
1. Empty State (keine Dokumente): zentrierter Upload-CTA mit 3-Schritte-
   Hinweis, KEINE leeren Widgets
2. "Weiterlernen"-Karte: letztes offenes Quiz (PROGRESS_KEY) oder letzter
   Kartenstapel — ein Klick setzt fort
3. Oben: Fällige Karten (Paket 1) + Streak (Paket 2) + nächste Klausur
   aus examTerms mit Countdown ("noch 12 Tage")
✓ Fertig wenn: Frischer Account sieht nur Upload-CTA; mit Daten sieht man
  Weiterlernen + Fällig + Streak + Countdown auf einen Blick

## PAKET 7 — Anki/Quizlet-Import (Wechselhürde senken)
1. In Karteikarten: Button "Importieren" → Modal mit 2 Wegen:
   a) CSV/TSV-Upload (Quizlet-Export-Format: Begriff[TAB]Definition)
   b) Texteinfügen (eine Karte pro Zeile, Trenner Tab/Semikolon/Komma
      automatisch erkennen)
2. Vorschau der ersten 5 Karten vor Import, Ziel-Deck wählbar/neu
3. Importierte Karten bekommen createSrsState()
✓ Fertig wenn: Quizlet-TSV-Export mit 50 Karten importiert fehlerfrei;
  kaputte Zeilen werden übersprungen und gezählt ("47 importiert, 3 übersprungen")

## PAKET 8 — Decks teilen (viraler Loop)
1. Supabase-Tabelle `shared_decks` (id, owner_id, name, cards jsonb,
   created_at) + RLS: SELECT public, INSERT nur owner
2. "Teilen"-Button am Deck → erzeugt Link /shared/{id}, kopiert in
   Zwischenablage
3. Route /shared/{id}: Deck-Vorschau (read-only) + Button "In meine
   Karten übernehmen" (Login erforderlich, Karten bekommen frisches SRS)
✓ Fertig wenn: Geteilter Link funktioniert im Inkognito-Fenster; Über-
  nehmen kopiert Karten ohne SRS-Daten des Owners

## PAKET 9 — PWA
1. manifest.json (Name, QW-Icons 192/512, theme_color = var(--primary)-
   Hex, display: standalone)
2. Minimaler Service Worker: App-Shell cachen, network-first für API
3. vite-plugin-pwa verwenden (saubere Vite-Integration)
✓ Fertig wenn: Chrome zeigt "App installieren"; installierte App startet
  mit Splash; Lighthouse PWA-Check grün

## PAKET 10 — Aufräumen & Fokus (mit Admin-Flag)
1. Admin-Flag einführen: neue Datei config/admin.ts mit
     export const ADMIN_IDS: string[] = ['HIER_USER_ID_EINTRAGEN'];
     export const isAdmin = (userId?: string | null) =>
       !!userId && ADMIN_IDS.includes(userId);
   WICHTIG: Den Platzhalter NICHT raten — den User beim Abarbeiten
   fragen, welche Supabase-User-ID eingetragen werden soll
   (Supabase → Authentication → Users).
2. Hausarbeit-System, Scholar-Recherche und Agent-Chat NUR für Admins
   in der Navigation zeigen ({isAdmin(user?.id) && ...} um die Nav-
   Punkte, eigene Gruppe "Labor" unterhalb von Fortschritt).
   Zusätzlich die zugehörigen Tab-Renderpfade absichern: ruft ein
   Nicht-Admin den Tab direkt auf, stattdessen Dashboard rendern.
3. React.lazy + Suspense für: TermPaperSystem, ExamSystem, ScholarSearch,
   AgentChat (Suspense-Fallback: kleiner Spinner im Content-Bereich)
4. App.tsx aufteilen: Handler-Logik in hooks/useQuizState.ts,
   hooks/useDocuments.ts, hooks/useAuth.ts — App.tsx unter 300 Zeilen
✓ Fertig wenn: Normale Accounts sehen die 3 Labor-Features weder in der
  Nav noch per direktem Tab-Aufruf; der Admin-Account sieht die Gruppe
  "Labor"; initiales JS-Bundle messbar kleiner (vite build Ausgabe
  vergleichen); App.tsx < 300 Zeilen

## PAKET 11 — Adaptive Klausur: Themengewichtung & Schwierigkeitsmix (Phase 3A)
Kontext: Die Klausur wird komplett vorab in einem Gemini-Call generiert,
danach frei navigierbar und einmal abgegeben (kein Frage-für-Frage-Ablauf).
Echtes Live-CAT ("Antwort auf Frage N bestimmt Schwierigkeit von Frage N+1")
ist damit nicht sinnvoll umsetzbar — bewusste Entscheidung: stattdessen wird
die Schwierigkeits-/Themenverteilung schon bei der Generierung deterministisch
gesteuert, analog zum bestehenden `EXAM_TYPE_WEIGHTS`-Muster (services/
geminiService.ts:1572) statt wie bisher nur als weicher Text-Hinweis
("adaptiveBlock", geminiService.ts:1707-1713, gespeist vom bereits
existierenden "Adaptive Klausur"-Toggle in ExamGenerator.tsx:126-133/190-193).
1. services/examAdaptive.ts (neu), reine Funktionen:
   - computeTopicWeights(topicMastery: TopicSecurity[], totalCount: number)
     → {topic, minCount}[] — kritisch > unsicher > sicher, Summe ≈ totalCount
   - computeDifficultyMix(baseDifficulty, recentAvgScore: number | null,
     daysUntilNextExam: number | null) → {leicht, mittel, schwer} (Summe 100)
2. services/examHistoryService.ts: neue Funktion getRecentAverageScore(n=5)
   — Durchschnitt der letzten n ExamResult.score.
3. Nächster fälliger Termin: dieselbe Logik wie in Dashboard.tsx:107-117
   (daysUntilDate aus services/calendarSessions.ts) auf examTerms anwenden.
   Zuerst prüfen, ob ExamGenerator.tsx bereits Zugriff auf examTerms hat —
   falls nicht, als Prop durchreichen (App.tsx hält den State schon).
4. ExamGenerator.tsx: "Adaptive Klausur"-Toggle erweitern — zusätzlich zu
   den bisherigen weakCategories/weakTopics jetzt topicWeights/difficultyMix
   aus Schritt 1–3 berechnen und in options.adaptive mitgeben.
5. services/geminiService.ts: adaptiveBlock (Zeilen ~1707-1713) durch harte
   Bullet-Listen ersetzen, analog EXAM_TYPE_BULLETS (Zeilen 1586-1596):
   "Thema X: mind. N Fragen", "Zielverteilung Schwierigkeit: X% leicht /
   Y% mittel / Z% schwer". Bestehendes difficulty?-Feld pro Frage
   (types.ts:551-553) bleibt vom Modell befüllt, jetzt aber gegen die
   Zielverteilung instruiert statt gegen eine einzelne globale Stufe.
6. Ohne Historie (topicMastery/examHistory leer) müssen sich Distribution-
   Funktionen auf das bisherige Verhalten zurückfallen lassen (aktuelle
   globale Gewichte, keine Verzerrung).
7. Unit-Tests für computeTopicWeights/computeDifficultyMix mit Fixtures
   klar unterschiedlicher Konfidenz/Scores — kein Snapshot-Test gegen den
   vollen Gemini-Prompt nötig.
✓ Fertig wenn: Klausur mit vorhandener Historie (≥1 kritisches Thema)
  enthält bei gleicher Gesamtfragenzahl sichtbar mehr Fragen zu diesem
  Thema als zu einem "sicheren" Thema; ein Account mit niedrigem
  recentAvgScore bekommt einen spürbar leichteren Mix als einer mit
  hohem; ein Account ohne Historie sieht exakt das bisherige Verhalten.

**Bekannte Grenzen (bewusst NICHT in Paket 11 gebaut, erst nach echter Nutzung prüfen ob nötig):**
- Kein Enforcement: adaptiveBlock/difficultyMixLine sind Prompt-Anweisungen, kein Retry/Repair falls Gemini die Mindestkontingente oder die Schwierigkeitsverteilung verfehlt (dieselbe Vertrauensbasis wie das bestehende FRAGETYPEN-VERTEILUNG-Muster). Möglicher Folgeschritt: ein Exam-Validator nach der Generierung, der Ist- gegen Soll-Verteilung prüft und bei Abweichung gezielt nachgeneriert — bei Quant-Klausuren ließe sich das direkt an den bestehenden CAS-Selbstcheck (services/mathValidation.ts) andocken.
- computeDifficultyMix nutzt harte Schwellen (recentAvgScore ≥80/<50, Tage >21) statt einer stetigen Kurve — 79% vs. 80% erzeugen einen Sprung. Später ggf. auf eine graduelle Funktion umstellen.

**Danach (Phase 3B/3C, erst nach Validierung von Paket 11, noch nicht spezifiziert):**
Fehler → gezielte Karteikarten/Mini-Quiz, SRS-Priorisierung nach Klausur-
fehlern (spacedRepetition.ts direkt wiederverwendbar, generisch über
{srs?: SrsState}), Quant-Operationstraining aus DistractorErrorType
(types.ts:463, bereits vorhanden, bisher nur Erzähltext in errorPool.ts),
danach vorsichtig formulierter Bereitschaftsscore/Notenprognose
("entspricht ungefähr einer X, basiert auf den letzten N Simulationen" —
nie als Vorhersage formulieren).

---

## Nicht anfassen
- Stripe-Integration & Webhooks (wird separat getestet)
- Supabase RLS Policies bestehender Tabellen
- geminiService Kern-Prompts (außer wo Pakete es explizit verlangen)

## Workflow-Regeln
- Reihenfolge einhalten: Paket 0 → 10
- Ein Paket = ein Commit, Message: "feat(paketN): kurzbeschreibung"
- Vor jedem Commit: npm run build muss durchlaufen
- Bei Unklarheiten in bestehendem Code: erst lesen, dann fragen, nie raten
