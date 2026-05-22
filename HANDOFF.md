# QuizWise — Session Handoff
**Stand: 22. Mai 2026 (Session 16)**

---

## Projekt-Übersicht

QuizWise ist eine KI-gestützte Lern-App für Schüler und Studenten. Ziel: Veröffentlichung als kommerzielle SaaS-App mit Freemium-Modell (Free: 20 KI-Anfragen/Tag, Pro: 4,99€/Monat unlimitiert).

---

## Tech Stack

| Teil | Technologie |
|---|---|
| Frontend | React 19 + TypeScript + Vite + Tailwind CSS (CDN) |
| Backend | Node.js + Express |
| Auth + Datenbank | Supabase |
| KI | Google Gemini API (`gemini-2.5-flash`) |
| Chart | Recharts (`^3.8.1`) |
| Suche (Web) | Wikipedia API (kostenlos, kein Key nötig) |
| Suche (Scholar) | OpenAlex API (kostenlos, kein Key nötig) |
| Bezahlung | Stripe |

---

## Ordnerstruktur

```
/Users/enesyazici/Desktop/quizwise/
├── App.tsx
├── types.ts
├── index.html                      ← CSS-Vars, Fonts, Theme/Accent/Font/Spacing-JS
├── .env                            ← VITE_BACKEND_URL, VITE_SUPABASE_*
├── components/
│   ├── ActiveRecall.tsx            ← Feynman/Recall — fertig ✅
│   ├── ExplainerSystem.tsx         ← KI-Erklärer — fertig ✅
│   ├── ExamSystem.tsx              ← Klausur-Orchestrierung
│   ├── ExamGenerator.tsx           ← Klausur-Konfiguration
│   ├── ExamView.tsx                ← Klausur-Ansicht (5 Typen + Timer)
│   ├── GapRadar.tsx                ← Lern-Analyse
│   ├── QuizSetup.tsx               ← Quiz-Setup (initialFocus-Prop)
│   ├── FlashcardSystem.tsx         ← Karteikarten (Anki-Stil)
│   ├── StudyPlanner.tsx            ← Lernplaner (Monat/Woche/Liste)
│   ├── ScholarSearch.tsx           ← Recherche (Web + Scholar)
│   ├── TermPaperSystem.tsx         ← Hausarbeit (⚠️ unfertig, Bugs vorhanden)
│   ├── SettingsModal.tsx           ← Tabs: Profil, Abo, Design, Datenschutz, API
│   ├── ColorPicker.tsx             ← Akzentfarbe (auch in Mobile-Menü)
│   ├── Layout.tsx
│   ├── Dashboard.tsx
│   ├── LegalModal.tsx              ← Impressum/Datenschutz (⚠️ Platzhalter!)
│   └── ...
├── services/
│   ├── geminiService.ts            ← Alle KI-Funktionen, sourceTopart()-Architektur
│   ├── quizHistoryService.ts       ← Quiz-Verlauf
│   ├── recallHistoryService.ts     ← Feynman/Recall-Verlauf
│   ├── examHistoryService.ts       ← Klausur-Verlauf
│   └── supabaseClient.ts
└── backend/
    ├── src/
    │   ├── index.js
    │   ├── routes/
    │   │   ├── gemini.js           ← Proxy + storageRef-Auflösung
    │   │   ├── search.js           ← /web (Wikipedia) + /scholar (OpenAlex)
    │   │   ├── user.js
    │   │   └── stripe.js
    │   └── middleware/
    │       ├── auth.js             ← Supabase-Client (SERVICE_KEY oder ANON_KEY)
    │       └── limits.js           ← free: 20 | demo: Infinity | pro: Infinity
    └── .env
```

---

## Live URLs

| Service | URL | Status |
|---|---|---|
| Frontend | https://quizwise-kappa.vercel.app | ✅ Live |
| Backend | https://quizwise-backend-production.up.railway.app | ✅ Live |
| Backend Health | `/health` → `{"status":"ok","geminiKey":true,"supabase":true}` | ✅ |

---

## Credentials & Keys

### Aktueller Gemini API Key
```
AIzaSyBmEkpeh-WxWGGG0WQoWaqJN1xLz0wvWS4
```
Liegt in `backend/.env` und Railway Env Vars.

### Demo-Account
```
E-Mail:    demo@quizwise.app
Passwort:  QuizWise2026!
Plan:      pro (unlimitiert)
```

### Supabase
```
URL:          https://hkqfstjzfwxmdcubnfrj.supabase.co
Service Key:  eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhrcWZzdGp6Znd4bWRjdWJuZnJqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NzQ3MDY3OCwiZXhwIjoyMDYzMDQ2Njc4fQ.3rmnNv0dvyG7jq7M2EpTtWtfVhGJNHnkzj5Z_9iAMlo
```

### Rate-Limit zurücksetzen (wenn 429-Fehler auftaucht)
```bash
curl -s -X PATCH "https://hkqfstjzfwxmdcubnfrj.supabase.co/rest/v1/profiles?id=neq.00000000-0000-0000-0000-000000000000" \
  -H "apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhrcWZzdGp6Znd4bWRjdWJuZnJqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NzQ3MDY3OCwiZXhwIjoyMDYzMDQ2Njc4fQ.3rmnNv0dvyG7jq7M2EpTtWtfVhGJNHnkzj5Z_9iAMlo" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhrcWZzdGp6Znd4bWRjdWJuZnJqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NzQ3MDY3OCwiZXhwIjoyMDYzMDQ2Njc4fQ.3rmnNv0dvyG7jq7M2EpTtWtfVhGJNHnkzj5Z_9iAMlo" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=minimal" \
  -d '{"api_calls_today": 0, "plan": "pro"}'
```

---

## Deployment-Befehle

```bash
# Frontend deployen — IMMER aus Root-Verzeichnis
cd /Users/enesyazici/Desktop/quizwise
vercel --prod --yes

# Backend deployen — IMMER aus backend/ Verzeichnis (nicht Root!)
cd /Users/enesyazici/Desktop/quizwise/backend
railway up --service quizwise-backend
```

> ⚠️ **WICHTIG:** `railway up` niemals aus dem Root-Ordner starten.
> Sonst deployed Railway den `dist/`-Ordner via Caddy (Frontend-HTML) statt dem Express-Backend.

---

## Was in Session 16 erledigt wurde (22. Mai 2026)

| Aufgabe | Status |
|---|---|
| **Schriftart-Auswahl** im Design-Tab der Einstellungen: 6 Fonts auswählbar (Inter, EB Garamond, DM Sans, Lato, Nunito, Merriweather) | ✅ |
| **Zeilenabstand-Control**: Kompakt (1.4) / Normal (1.6) / Weit (1.9) — toggle in Design-Tab | ✅ |
| **`line-height: 1.6` als App-Default** gesetzt (vorher kein line-height → Browser-Default ~1.2) | ✅ |
| **CSS-Variablen** `--font-app` + `--line-height-app` in `index.html` — werden beim Start sofort aus localStorage geladen (kein Flicker) | ✅ |
| **Google Fonts** aktualisiert: 6 Fonts mit `display=swap` geladen | ✅ |
| `body` nutzt jetzt `font-family: var(--font-app)` + `line-height: var(--line-height-app)` | ✅ |
| Auf Produktion deployed: `quizwise-kappa.vercel.app` | ✅ |

### Typografie-System — wie es funktioniert

```
localStorage.font_choice   → --font-app       → body font-family
localStorage.line_height   → --line-height-app → body line-height
localStorage.accent_color  → --primary         → Akzentfarbe
localStorage.theme         → html.dark class   → Tagmodus / Nachtmodus
```

Alle 4 Werte werden in `index.html` beim Seitenstart synchron gesetzt — kein Flicker, kein FOUC.

Schrift-Optionen:
| ID | Schrift | Stil |
|---|---|---|
| `inter` | Inter | Modern, sans-serif (Default) |
| `garamond` | EB Garamond | Klassisch, serif |
| `dm-sans` | DM Sans | Klar, geometrisch |
| `lato` | Lato | Freundlich, humanistisch |
| `nunito` | Nunito | Rund, weich |
| `merriweather` | Merriweather | Lesetauglich, serif |

---

## ⚠️ OFFENE PUNKTE FÜR SESSION 17

### 🔴 KRITISCHE BUGS (brechen Funktionen)

#### Bug 1: Dashboard-Navigation für KI-Empfehlungen kaputt
**Datei:** `components/Dashboard.tsx:107`
```tsx
onClick={() => onTabChange(action.module.toUpperCase() as ActiveTab)}
```
Der Orchestrator gibt folgende `module`-Werte zurück: `'analyse' | 'explain' | 'calendar' | 'quiz' | 'cards' | 'exam'`

Nach `.toUpperCase()` stimmen 3 davon nicht mit dem ActiveTab-Enum überein:
- `'analyse'` → `'ANALYSE'` ❌ heißt `ActiveTab.RADAR`
- `'explain'` → `'EXPLAIN'` ❌ heißt `ActiveTab.EXPLAINER`
- `'calendar'` → `'CALENDAR'` ❌ heißt `ActiveTab.PLANNER`

**Fix:** Eine Map bauen:
```tsx
const MODULE_TO_TAB: Record<string, ActiveTab> = {
  analyse: ActiveTab.RADAR,
  explain: ActiveTab.EXPLAINER,
  calendar: ActiveTab.PLANNER,
  quiz: ActiveTab.QUIZ,
  cards: ActiveTab.CARDS,
  exam: ActiveTab.EXAM,
};
onClick={() => onTabChange(MODULE_TO_TAB[action.module] ?? ActiveTab.DASHBOARD)}
```

---

#### Bug 2: TermPaperSystem bricht mit storagePath-Architektur
**Datei:** `components/TermPaperSystem.tsx:68`
```tsx
const genSources = selectedDocs.map(d =>
  d.type === 'pdf' ? { file: { data: d.content, mimeType: 'application/pdf' } } : { text: d.content }
);
```
`d.content` ist für PDFs aus Supabase **leer**. Die Gliederungs-Funktion sendet leere Daten an Gemini.

**Fix:** `TermPaperSystem` braucht eine `getDocumentSource`-Prop (wie die anderen Module):
```tsx
const genSources: GenerationSource[] = selectedDocs.map(d => getDocumentSource(d));
```

---

#### Bug 3: Railway — SUPABASE_SERVICE_KEY muss gesetzt sein
**Datei:** `backend/src/middleware/auth.js:5`
```javascript
process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY
```
Der Anon-Key kann private Supabase-Storage-Buckets **nicht lesen** → 403-Fehler bei PDF-Uploads.

**Prüfen:** Railway Dashboard → Variables → `SUPABASE_SERVICE_KEY` vorhanden?
```bash
railway variables set SUPABASE_SERVICE_KEY="eyJhbGciOiJI..."
```

---

#### Bug 4: Quiz-Abbrechen macht nichts wenn Dokument ausgewählt war
**Datei:** `App.tsx:522-528`
```tsx
if (pendingActionDoc) {
  // Go back to setup    ← leerer Kommentar, kein Code!
}
```
User drückt Abbrechen → landet auf leerem FileUploader.

**Fix:** `setQuestions([]); setAnswers([]);` reicht — `renderContent` zeigt automatisch QuizSetup wenn `pendingActionDoc` gesetzt ist.

---

#### Bug 5: Recall `missingPoints` werden nie gespeichert
**Datei:** `App.tsx:570-573`
```tsx
onComplete={(score, topic) => {
  saveRecallResult({ ..., missingPoints: [] }); // IMMER LEER
```
**Fix:** `onComplete`-Signatur in `ActiveRecall.tsx` auf `(score: number, topic: string, missingPoints: string[]) => void` erweitern.

---

### 🟠 WICHTIGE UX-FEHLER

#### UX 1: `alert()` statt `toast` in TermPaperSystem + FlashcardSystem
Native Browser-Dialoge blockieren den Thread und wirken unprofessionell:
- `TermPaperSystem.tsx:63,75,88,95,123` — 5× `alert()`
- `FlashcardSystem.tsx:134` — `alert('Fehler bei der Generierung.')`

**Fix:** Alle durch `toast.error(...)` / `toast.success(...)` aus `../services/toast` ersetzen.

---

#### UX 2: Library → Klausur: ExamSystem bekommt kein `initialDoc`
Wenn man in der Bibliothek auf "Klausur" klickt, muss der User das Dokument nochmal auswählen.

**Datei:** `App.tsx:576-586` — `ExamSystem` fehlt `initialDoc={pendingActionDoc ?? undefined}`
**Datei:** `components/ExamGenerator.tsx` — braucht `initialDoc`-Prop + `useEffect` wie bei ActiveRecall

---

#### UX 3: ScholarSearch hat eigenen lokalen Toast-State statt globalem Service
**Datei:** `components/ScholarSearch.tsx:31`
```tsx
const [toast, setToast] = useState<string | null>(null);
```
**Fix:** Lokalen State entfernen, `import { toast } from '../services/toast';` hinzufügen.

---

### 🟡 DESIGN-INKONSISTENZEN

#### Design 1: Hardcoded `bg-indigo-600` in mehreren Screens
Wenn User Accent-Color wechselt, bleiben diese Elemente indigo:
- `ActiveRecall.tsx` — Frage-Karte, Bewerten-Button, Nächster-Drill-Button
- `ExplainerSystem.tsx` — Erklären-Button
- `Dashboard.tsx` — Hover-Hintergrund der Feature-Karten
- `StudyPlanner.tsx` — COLORS-Array mit hardcoded Tailwind-Klassen
- `GapRadar.tsx` — Schwachstellen-Badges, Chart-Farben

**Fix:** `bg-indigo-600` → `style={{ background: 'var(--primary)' }}`

---

#### Design 2: Mehrere Module ohne Editorial Design
- **Recherche** (`ScholarSearch.tsx`) — kein `var(--bg-sidebar)`, kein `var(--border-color)`
- **Hausarbeit** (`TermPaperSystem.tsx`) — komplett altes Design
- **Lernplaner** (`StudyPlanner.tsx`) — Kalender-Farben hardcoded

---

### 🔵 PFLICHTAUFGABEN VOR LAUNCH

#### Launch 1: LegalModal — echte DSGVO-Daten eintragen
**Datei:** `components/LegalModal.tsx`
Alle `[Platzhalter]` mit echten Betreiberdaten füllen (Name, Adresse, E-Mail).
Neue Datenschutzerklärung auf **e-recht24.de** generieren und eintragen.

---

#### Launch 2: Stripe Webhook konfigurieren
Ohne das bekommen User nach Bezahlung keinen Pro-Status.
1. stripe.com/dashboard → Developers → Webhooks → Endpoint hinzufügen
2. URL: `https://quizwise-backend-production.up.railway.app/api/stripe/webhook`
3. Events: `checkout.session.completed`, `customer.subscription.deleted`
4. Secret in Railway:
```bash
cd /Users/enesyazici/Desktop/quizwise/backend
railway variables set STRIPE_WEBHOOK_SECRET="whsec_neu..."
```

---

### 🔧 TECHNISCHE SCHULDEN

#### Tech 1: Toter Import in App.tsx
```tsx
import { ..., downloadPdfAsBase64 } from './services/documentService';
```
Seit `getDocumentSource` synchron ist, wird das nie aufgerufen. Import löschen.

#### Tech 2: `fileToBase64` ist 3-fach dupliziert
In `App.tsx:440`, `ExamGenerator.tsx:31`, `SourceSelector.tsx:50` — gehört in `services/fileUtils.ts`.

#### Tech 3: Kein Error Boundary
Wenn Gemini malformed JSON zurückgibt → `JSON.parse` fail → gesamte React-App crasht.
**Fix:** `React.ErrorBoundary` um die Haupt-Module wrappen.

#### Tech 4: TypeScript-Fehler noch offen
```
App.tsx(344,9): error TS2322: Type 'unknown[]' is not assignable to type 'string[]'
LibrarySystem.tsx(74): Property 'module' does not exist on type 'unknown'
```

#### Tech 5: Bundle-Größe 3 MB (kein Lazy Loading)
`dist/assets/index.js: ~3.041 kB unkomprimiert`. Keine Code-Splitting.
**Fix:** `React.lazy()` + `Suspense` für alle Tab-Komponenten (GapRadar, TermPaperSystem, FlashcardSystem).

---

## Prioritätsliste für Session 17

| Priorität | Aufgabe | Datei |
|---|---|---|
| 🔴 P0 | `SUPABASE_SERVICE_KEY` in Railway prüfen/setzen | Railway Dashboard |
| 🔴 P1 | Dashboard-Navigation-Map fixen | `Dashboard.tsx:107` |
| 🔴 P1 | TermPaperSystem: `getDocumentSource` integrieren | `TermPaperSystem.tsx:68` + `App.tsx` |
| 🟠 P2 | `alert()` → `toast` in TermPaperSystem + FlashcardSystem | 6 Stellen |
| 🟠 P2 | Quiz-Abbrechen-Logik reparieren | `App.tsx:522` |
| 🟠 P2 | ExamSystem `initialDoc` von Library übergeben | `App.tsx:576` + `ExamGenerator.tsx` |
| 🟠 P2 | Recall `missingPoints` im Callback übergeben | `ActiveRecall.tsx` + `App.tsx` |
| 🟡 P3 | ScholarSearch: lokalen Toast-State entfernen | `ScholarSearch.tsx:31` |
| 🟡 P3 | Toter Import `downloadPdfAsBase64` entfernen | `App.tsx:39` |
| 🔵 P4 | LegalModal: echte DSGVO-Daten | `LegalModal.tsx` |
| 🔵 P4 | Stripe Webhook konfigurieren | stripe.com/dashboard + Railway |
| ⚪ P5 | Editorial Design: ScholarSearch, TermPaperSystem | CSS-Variablen |
| ⚪ P5 | Hardcoded `bg-indigo-600` ersetzen | ActiveRecall, ExplainerSystem |
| ⚪ P5 | TypeScript-Fehler fixen | App.tsx, LibrarySystem.tsx |
| ⚪ P6 | Lazy Loading für Bundle-Größe | Alle Tab-Komponenten |

---

## Design-System-Regeln (dauerhaft gültig)

**Typografie-Variablen:**
- `--font-app` — aktive Schriftart (aus localStorage `font_choice`)
- `--line-height-app` — aktiver Zeilenabstand (aus localStorage `line_height`, Default: 1.6)
- `--primary` — Akzentfarbe (aus localStorage `accent_color`)
- `--primary-text` — auto-berechnet: dunkel auf hellen Akzenten, weiß auf dunklen

**Regel: `indigo-*` = Akzentfarbe (durch CSS-Vars überschrieben)**
- Hintergründe: `style={{ background: 'var(--primary)' }}`
- Text auf Akzent: `style={{ color: 'var(--primary-text)' }}`
- Karten: `style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border-color)' }}`

**Semantische Farben bleiben hardcoded:**
- `rose-*` / `red-*` = Fehler, Löschen, Warnung
- `emerald-*` / `green-*` = Erfolg, bestanden
- `amber-*` = Warnings, Fristen

---

## Kosten-Übersicht (laufend)

| Service | Kosten |
|---|---|
| Vercel (Frontend) | Kostenlos |
| Railway (Backend) | $5/Monat (Hobby-Plan) |
| Supabase | Kostenlos bis 50k User |
| Gemini API | Kostenlos bis 1.500 req/Tag |
| Wikipedia (Web-Suche) | Kostenlos, kein Key nötig |
| OpenAlex (Scholar-Suche) | Kostenlos, kein Key nötig |
| Stripe | 2,9% + 0,25€ pro Transaktion |

---

## Session-Verlauf

| Session | Datum | Schwerpunkte |
|---|---|---|
| 16 | 22.05.2026 | Schriftart-Auswahl (6 Fonts), Zeilenabstand-Control, line-height 1.6 als Default, Produktion deployed |
| 15 | 21.05.2026 | storagePath-Architektur, Recall Studio, KI-Erklärer, Bild-Support, Schwachstellen-Analyse |
| 14 | 20.05.2026 | Railway Hobby-Plan upgrade, Backend deploy |
| 13 | 20.05.2026 | Klausur 5 Fragetypen, GapRadar → Quiz-Navigation |
| 12 | 20.05.2026 | Lern-Analyse (GapRadar) neu gebaut |
| 11 | 20.05.2026 | Mobile/Tablet Layout |
| 10 | 19.05.2026 | StudyPlanner Kalender-UI |
| 9 | 19.05.2026 | Quiz-Flow, QuizSetup, ResultView |
| 8 | 19.05.2026 | Bibliothek als Lern-Schaltzentrale |
| 7 | 18.05.2026 | `--primary-text` Variable, CSS-Override-System |
| 6 | 18.05.2026 | Recherche Web/Scholar-Tabs |
| 4+5 | 17.-18.05.2026 | Editorial Design, Papiermuster, Navigation |
| 1-3 | 17.05.2026 | Grundarchitektur, alle 11 Module, Deployment |
