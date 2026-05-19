# QuizWise — Session Handoff
**Stand: 19. Mai 2026 (Session 10)**

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
| Suche (Web) | Wikipedia API (kostenlos, kein Key nötig) |
| Suche (Scholar) | OpenAlex API (kostenlos, kein Key nötig) |
| Bezahlung | Stripe |

---

## Ordnerstruktur

```
/Users/enesyazici/Desktop/quizwise/
├── App.tsx
├── types.ts
├── index.html
├── .env                            ← VITE_BACKEND_URL, VITE_SUPABASE_*
├── components/
│   ├── FileUploader.tsx            ← Quiz-Startseite (Ladekreis gefixt)
│   ├── QuizPlayer.tsx              ← Quiz-Spieler (MC + Single Choice)
│   ├── ExamSystem.tsx              ← Klausur-System
│   ├── ExamGenerator.tsx           ← Klausur-Konfiguration
│   ├── ExamView.tsx                ← Klausur-Ansicht + Bewertung
│   ├── Layout.tsx
│   ├── Dashboard.tsx
│   ├── LegalModal.tsx              ← Impressum/Datenschutz (Platzhalter!)
│   └── ...
├── services/
│   ├── geminiService.ts            ← Alle KI-Funktionen
│   └── supabaseClient.ts
└── backend/
    ├── src/
    │   ├── index.js
    │   ├── routes/
    │   │   ├── gemini.js           ← Proxy zu Gemini API (gemini-2.5-flash)
    │   │   ├── search.js           ← /web (Wikipedia) + /scholar (OpenAlex)
    │   │   ├── user.js
    │   │   └── stripe.js
    │   └── middleware/
    │       ├── auth.js
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

### Aktueller Gemini API Key (funktioniert)
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
npm run build
vercel --prod --yes --scope enes-yazicis-projects

# Backend deployen — IMMER aus backend/ Verzeichnis (nicht Root!)
cd /Users/enesyazici/Desktop/quizwise/backend
railway up --service quizwise-backend
```

> ⚠️ **WICHTIG:** `railway up` niemals aus dem Root-Ordner starten.
> Sonst deployed Railway den `dist/`-Ordner via Caddy (Frontend-HTML) statt dem Express-Backend.

---

## Was in Session 5 erledigt wurde (18. Mai 2026)

| Aufgabe | Status |
|---|---|
| Gemini-Modell auf `gemini-2.5-flash` aktualisiert (1.5 + 2.0 geben 404) | ✅ |
| Neuen Gemini API Key eingetragen (alter hatte Quota 0) | ✅ |
| Ladekreis im FileUploader gefixt (CSS `!important` Override umgangen) | ✅ |
| Quiz-Prompt verbessert: Temperatur 1.0, Vielfalt-Anweisung, Zufalls-Seed | ✅ |
| Custom-Optionen (Anzahl/Schwierigkeit/Fokus) werden jetzt ans Modell übergeben | ✅ |
| Quiz: 70%+ Multiple Choice, 2-3 korrekte Antworten pro MC-Frage | ✅ |
| Rate-Limit deaktiviert (`free: Infinity`) für Entwicklung | ✅ |
| Recherche: Gemini-Halluzination ersetzt durch OpenAlex API | ✅ |
| Recherche: ~300ms statt 30s, echte DOIs, 100k Requests/Tag kostenlos | ✅ |
| Klausur: 45% MC + 35% Transfer + 20% Schreiben/Erörterung | ✅ |
| Klausur-Bewertung: strenger Hochschulmaßstab, Punktestufen 100/75/50/25/0% | ✅ |
| Railway-Deploy-Bug mehrfach gefixt (falsches Verzeichnis) | ✅ |

---

## Was in Session 6 erledigt wurde (18. Mai 2026)

| Aufgabe | Status |
|---|---|
| Recherche-Tabs "Web" / "Scholar" eingebaut (wie Google-Tabs) | ✅ |
| Web-Tab: Wikipedia API (deutsch, kostenlos, kein Key) | ✅ |
| Scholar-Tab: OpenAlex bleibt unverändert für akademische Paper | ✅ |
| Ergebnis-UI: Web zeigt Zusammenfassung, Scholar zeigt APA/DOI/Abstract | ✅ |
| Tabs wechseln Modus ohne alte Ergebnisse anzuzeigen | ✅ |
| Frontend auf Vercel deployed (https://quizwise-kappa.vercel.app) | ✅ |
| Backend-Änderungen auf GitHub gepusht → Railway deployt automatisch | ✅ |

---

## Was in Session 10 erledigt wurde (19. Mai 2026)

| Aufgabe | Status |
|---|---|
| **StudyPlanner:** MUSAB-Kalender-UI integriert — Monatsansicht (7-Spalten-Grid) | ✅ |
| Monatsansicht: Heute-Hervorhebung (Amber), Klausuren (Rose), Termine (Blau) | ✅ |
| Monatsansicht: Max. 2 Einträge pro Zelle + „+X weitere" Überlauf-Indikator | ✅ |
| Monatsansicht: Vor/Zurück-Navigation + „Heute"-Button | ✅ |
| Listenansicht: chronologisch, Countdown-Badge (Heute/Morgen/in N Tagen) | ✅ |
| Wochenplan: bestehender Drag-Drop-Zeitraster vollständig erhalten | ✅ |
| Neue `StudyEvent`-Typ (Lerntermin/Erinnerung) mit eigenem Add-Formular | ✅ |
| `study_events` in localStorage gespeichert | ✅ |
| **Demo-Account:** `plan = 'pro'` in Supabase gesetzt (unlimitiert) | ✅ |
| `limits.js`: `demo: Infinity` als eigener Plan-Typ hinzugefügt | ✅ |
| Frontend auf Vercel deployed (GitHub Auto-Deploy) | ✅ |
| Backend auf Railway deployed | ✅ |

---

## Was in Session 7 erledigt wurde (18. Mai 2026)

| Aufgabe | Status |
|---|---|
| `--primary-text` CSS-Variable eingebaut (Textlesbarkeit auf hellen Akzentfarben) | ✅ |
| Luminanz-Berechnung in `ColorPicker.tsx` → dunkel/hell Text automatisch | ✅ |
| `index.html` Startup-Script: `--primary-text` beim Laden gespeicherter Farbe berechnen | ✅ |
| CSS-Override-System in `index.html` von ~20 auf 60+ Regeln erweitert | ✅ |
| Fehlende Tailwind-Varianten ergänzt: opacity, focus, hover, ring, dark-mode | ✅ |
| `Dashboard.tsx`: hardcoded `white` → `var(--primary-text)` in Hover-Styles | ✅ |
| `Layout.tsx`: Nav-Button + QW-Logo + Avatar → `var(--primary-text)` | ✅ |
| `SettingsModal.tsx`: aktiver Tab-Button + Avatar → `var(--primary-text)` | ✅ |
| `TermPaperSystem.tsx`: alle `emerald` UI-Farben → `indigo` (via bulk replace) | ✅ |
| `ExamGenerator.tsx`: `rose` UI-Farben → `indigo` (Titel, Setup, Buttons) | ✅ |
| `ExamSystem.tsx`: Spinner + Start-Button `emerald/rose` → `indigo` | ✅ |
| `GapRadar.tsx`: Titel + Fortschrittskreis `emerald` → `indigo` | ✅ |
| `StudyPlanner.tsx`: Titel + "Due Cards" Header + Punkt-Indikator → `indigo` | ✅ |
| Strategie-Entscheidung: optische Korrekturen auf "nach Feature-Fertigstellung" verschoben | ✅ |
| Mehrfach auf Vercel deployt (`vercel --prod`) | ✅ |

### Design-System-Entscheidungen (für zukünftige Änderungen)

**Regel: `indigo-*` = Akzentfarbe (durch CSS-Vars überschrieben)**
Alle UI/dekorativen Farben (Buttons, Badges, Highlights, Fortschrittsanzeigen) verwenden `indigo-*` Tailwind-Klassen — diese werden durch das CSS-Override-System in `index.html` mit `var(--primary)` überschrieben.

**Regel: Semantische Farben bleiben unverändert**
- `rose-*` / `red-*` = Fehler, Löschen, Warnung, Klausur-Notenbewertung
- `emerald-*` / `green-*` = Erfolg, bestanden, erledigte Checkboxen
- `amber-*` = Warnings, noch nicht erledigte Fristen

**`--primary-text` Variable**
Wird automatisch berechnet wenn Nutzer eine Akzentfarbe wählt. Helle Farben (Luminanz > 0.52, z.B. Gelb) → `#1a1a2e` (dunkel). Dunkle Farben → `#ffffff`. Überall wo Text auf Akzent-Hintergrund sitzt: `style={{ color: 'var(--primary-text)' }}` statt hardcoded `text-white`.

---

## ⚠️ Offene Punkte (Pflicht vor Launch)

### 1. Rechtliches ausfüllen
Datei: `components/LegalModal.tsx`
- Alle `[Platzhalter]` mit echten Daten ersetzen (Name, Adresse, E-Mail des Betreibers)
- Neue Datenschutzerklärung auf e-recht24.de generieren

### 3. Stripe Webhook für Production
1. stripe.com/dashboard → Webhooks → Endpoint hinzufügen
2. URL: `https://quizwise-backend-production.up.railway.app/api/stripe/webhook`
3. Events: `checkout.session.completed`, `customer.subscription.deleted`
4. `whsec_...` in Railway eintragen:
   ```bash
   cd /Users/enesyazici/Desktop/quizwise/backend
   railway variables set STRIPE_WEBHOOK_SECRET="whsec_neu..."
   ```

---

## Kosten-Übersicht (laufend)

| Service | Kosten |
|---|---|
| Vercel (Frontend) | Kostenlos |
| Railway (Backend) | ~5€/Monat (Trial läuft: 30 Tage oder $4.99) |
| Supabase | Kostenlos bis 50k User |
| Gemini API | Kostenlos bis 1.500 req/Tag |
| Wikipedia (Web-Suche) | Kostenlos, kein Key nötig |
| OpenAlex (Scholar-Suche) | Kostenlos, kein Key nötig |
| Stripe | 2,9% + 0,25€ pro Transaktion |

> ⚠️ Railway Trial beachten — rechtzeitig auf bezahlten Plan upgraden.
