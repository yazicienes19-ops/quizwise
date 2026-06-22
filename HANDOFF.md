# QuizWise — Session Handoff
**Stand: 22. Juni 2026 (Session 18 — Stabilität, Analyse-Umsetzung, Bot-Entfernung, Mobile-Überarbeitung)**

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
