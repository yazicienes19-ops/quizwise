# QuizWise — Session Handoff
**Stand: 17. Mai 2026 (Session 2)**

---

## Projekt-Übersicht

QuizWise ist eine KI-gestützte Lern-App für Studenten. Ziel: Veröffentlichung als kommerzielle SaaS-App mit Freemium-Modell (Free: 20 KI-Anfragen/Tag, Pro: 4,99€/Monat unlimitiert).

---

## Tech Stack

| Teil | Technologie |
|---|---|
| Frontend | React 19 + TypeScript + Vite + Tailwind CSS (CDN) |
| Backend | Node.js + Express |
| Auth + Datenbank | Supabase |
| KI | Google Gemini API (gemini-2.0-flash) |
| Bezahlung | Stripe |
| Icons | Lucide React |

---

## Ordnerstruktur

```
/Users/enesyazici/Desktop/
└── quizwise/
    ├── App.tsx
    ├── types.ts
    ├── index.html
    ├── vercel.json                ← Deployment-Config für Vercel ✅
    ├── .env                       ← VITE_BACKEND_URL, VITE_SUPABASE_*
    ├── components/
    │   ├── Dashboard.tsx
    │   ├── Layout.tsx
    │   ├── LegalModal.tsx         ← NEU: Impressum, Datenschutz, AGB
    │   ├── ScholarSearch.tsx      ← ÜBERARBEITET: kompakte Listenansicht
    │   ├── SettingsModal.tsx
    │   ├── AuthModal.tsx
    │   ├── UpgradeModal.tsx
    │   └── ... (alle anderen Feature-Komponenten)
    ├── services/
    │   ├── geminiService.ts
    │   ├── supabaseClient.ts
    │   ├── stripeService.ts
    │   └── userService.ts
    └── backend/
        ├── src/
        │   ├── index.js
        │   ├── routes/
        │   │   ├── gemini.js
        │   │   ├── user.js
        │   │   └── stripe.js
        │   └── middleware/
        │       ├── auth.js
        │       └── limits.js
        ├── .env
        └── supabase_schema.sql
```

---

## Live URLs

| Service | URL | Status |
|---|---|---|
| Frontend | https://quizwise-kappa.vercel.app | ✅ Live |
| Backend | https://quizwise-backend-production.up.railway.app | ✅ Live |
| Backend Health | /health → `{"status":"ok","geminiKey":true,"supabase":true}` | ✅ |

---

## Server starten (lokal)

```bash
# Terminal 1 — Frontend
cd /Users/enesyazici/Desktop/quizwise
npm run dev -- --port 3001

# Terminal 2 — Backend
cd /Users/enesyazici/Desktop/quizwise/backend
node src/index.js

# Terminal 3 — Stripe Webhook (nur für lokale Stripe-Tests)
stripe listen --forward-to localhost:4000/api/stripe/webhook
```

---

## Credentials & Keys

### Frontend `.env`
```
VITE_BACKEND_URL=https://quizwise-backend-production.up.railway.app
VITE_SUPABASE_URL=https://qijxpizcceqyuvozawua.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGci... (anon key)
```

### Backend `.env`
```
GEMINI_API_KEY=AIzaSyBdEEFfH1pOaMsY0sHbZ_cGrZxtif0ZIgc   ← Quota 0! Neuen Key nötig
PORT=4000
FRONTEND_URL=https://quizwise-kappa.vercel.app
SUPABASE_URL=https://qijxpizcceqyuvozawua.supabase.co
SUPABASE_ANON_KEY=eyJhbGci...
SUPABASE_SERVICE_KEY=eyJhbGci... (service role key)
STRIPE_SECRET_KEY=sk_test_51TXTT...
STRIPE_WEBHOOK_SECRET=whsec_fcaf24...   ← Nur lokal gültig! Neu einrichten nach Prod-Stripe-Webhook
STRIPE_PRO_PRICE_ID=price_1TXTYl3PCOgu8W2oftRimgHe
```

### Vercel (Env Vars bereits eingetragen)
- `VITE_BACKEND_URL` → Railway-URL ✅
- `VITE_SUPABASE_URL` ✅
- `VITE_SUPABASE_ANON_KEY` ✅

### Railway (Env Vars bereits eingetragen)
Alle Backend-Vars sind gesetzt. Bei neuem Gemini Key:
```bash
railway variables set GEMINI_API_KEY="neuer-key"
```

### Deployment-Befehle
```bash
# Frontend neu deployen
cd /Users/enesyazici/Desktop/quizwise
vercel --prod --yes --scope enes-yazicis-projects

# Backend neu deployen
cd /Users/enesyazici/Desktop/quizwise/backend
railway up --detach
```

---

## Was diese Session erledigt wurde (17. Mai 2026)

| Aufgabe | Status |
|---|---|
| MindMap-Feature entfernt (zu komplex, kein Mehrwert) | ✅ |
| index.html bereinigt (fehlende CSS, redundante Import Map) | ✅ |
| vercel.json erstellt | ✅ |
| LegalModal gebaut (Impressum, Datenschutz, AGB) | ✅ |
| Recherche-Ansicht überarbeitet (kompakte Liste statt Riesenkarten) | ✅ |
| Frontend auf Vercel deployt | ✅ |
| Backend auf Railway deployt | ✅ |
| FRONTEND_URL in Railway auf Vercel-URL gesetzt | ✅ |
| Tailwind CDN blocking-Bug behoben (defer) | ✅ |
| Supabase Auth Timeout-Fallback eingebaut | ✅ |

---

## Was noch fehlt (nächste Session)

### Priorität 1 — Gemini API Key reparieren (BLOCKIERT ALLES)
- [ ] **Google Cloud Billing aktivieren:** console.cloud.google.com → Abrechnung → Kreditkarte
- [ ] **Neuen Key erstellen:** aistudio.google.com → API Key → kopieren
- [ ] **In Railway eintragen:**
  ```bash
  cd /Users/enesyazici/Desktop/quizwise/backend
  railway variables set GEMINI_API_KEY="neuer-key"
  ```
- [ ] **Testen:** https://quizwise-kappa.vercel.app → einloggen → Recherche oder Quiz probieren

### Priorität 2 — Rechtliches ausfüllen (vor Launch Pflicht!)
- [ ] **LegalModal.tsx öffnen** und alle `[Platzhalter]` mit echten Daten füllen:
  - `[Vorname Nachname]`, `[Straße]`, `[PLZ Ort]`, `[deine@email.de]`
- [ ] **Datenschutzerklärung** neu generieren auf e-recht24.de und eintragen

### Priorität 3 — Stripe Webhook für Production
- [ ] stripe.com/dashboard → Webhooks → neuen Webhook anlegen
  - URL: `https://quizwise-backend-production.up.railway.app/api/stripe/webhook`
  - Events: `checkout.session.completed`, `customer.subscription.deleted`
- [ ] Neuen `whsec_...` in Railway eintragen:
  ```bash
  railway variables set STRIPE_WEBHOOK_SECRET="whsec_neu..."
  ```

### Priorität 4 — GitHub Auto-Deploy in Vercel verknüpfen
- [ ] vercel.com → Projekt quizwise → Settings → Git → GitHub Repo verbinden
- [ ] Danach: jeder `git push main` deployed automatisch

### Priorität 5 — Weitere App-Verbesserungen
- [ ] Weitere Features prüfen und verbessern (Nutzer hat noch offene Punkte)
- [ ] Google / Apple Login (Supabase OAuth)
- [ ] Supabase E-Mail SMTP konfigurieren

---

## Nächster konkreter Schritt

**Gemini API Key reparieren** — ohne das kann kein einziges Feature getestet werden:
1. console.cloud.google.com → Billing → Kreditkarte
2. aistudio.google.com → neuen Key erstellen
3. `railway variables set GEMINI_API_KEY="..."` im Terminal
4. App testen

---

## Kosten-Übersicht (laufend)

| Service | Kosten |
|---|---|
| Vercel (Frontend) | Kostenlos |
| Railway (Backend) | ~5€/Monat |
| Supabase | Kostenlos bis 50k User |
| Gemini API | Kostenlos bis 1.500 req/Tag (nach Billing-Aktivierung) |
| Stripe | 2,9% + 0,25€ pro Transaktion |
| Domain | ~10–15€/Jahr (noch nicht eingerichtet) |
