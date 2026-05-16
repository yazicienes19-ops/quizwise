# QuizWise — Session Handoff
**Stand: 16. Mai 2026**

---

## Projekt-Übersicht

QuizWise ist eine KI-gestützte Lern-App für Studenten. Ziel: Veröffentlichung als kommerzielle SaaS-App mit Freemium-Modell (Free: 20 KI-Anfragen/Tag, Pro: 4,99€/Monat unlimitiert).

---

## Tech Stack

| Teil | Technologie |
|---|---|
| Frontend | React 19 + TypeScript + Vite + Tailwind CSS |
| Backend | Node.js + Express |
| Auth + Datenbank | Supabase |
| KI | Google Gemini API (gemini-2.0-flash) |
| Bezahlung | Stripe |
| Icons | Lucide React |

---

## Ordnerstruktur

```
/Users/enesyazici/Desktop/
├── quizwise/                  ← Frontend (React App)
│   ├── App.tsx                ← Haupt-App, Routing, Auth-State
│   ├── types.ts               ← TypeScript-Typen + ActiveTab Enum
│   ├── index.html             ← Tailwind Config, CSS-Variablen, Dark Mode
│   ├── .env                   ← VITE_BACKEND_URL, VITE_SUPABASE_*
│   ├── components/
│   │   ├── Layout.tsx         ← Sidebar, Navigation, User-Bereich
│   │   ├── SettingsModal.tsx  ← Einstellungen (5 Tabs)
│   │   ├── AuthModal.tsx      ← Login / Registrierung
│   │   ├── UpgradeModal.tsx   ← Stripe Checkout CTA
│   │   ├── ColorPicker.tsx    ← Akzentfarbe (applyAccentColor exportiert)
│   │   ├── ApiKeySettings.tsx ← API Key Modal (Legacy, in Settings integriert)
│   │   ├── Dashboard.tsx      ← Startseite mit Flow-Cards
│   │   ├── Toast.tsx          ← Toast-Benachrichtigungen
│   │   └── ... (alle anderen Feature-Komponenten)
│   └── services/
│       ├── geminiService.ts   ← Alle KI-Funktionen → rufen Backend auf
│       ├── supabaseClient.ts  ← Supabase-Client (anon key)
│       ├── stripeService.ts   ← startCheckout() Funktion
│       ├── userService.ts     ← changePassword, deleteAccount, exportData, getInvoices, cancelSubscription
│       └── toast.ts           ← Globales Toast-System
│
└── quizwise-backend/          ← Backend (Node.js Server)
    ├── src/
    │   ├── index.js           ← Express Server, CORS, Routen
    │   ├── routes/
    │   │   ├── gemini.js      ← POST /api/gemini/generate (Proxy zu Gemini)
    │   │   ├── user.js        ← GET /profile, GET /export, DELETE /account
    │   │   └── stripe.js      ← Checkout, Invoices, Cancel, Webhook
    │   └── middleware/
    │       ├── auth.js        ← requireAuth (Supabase Token prüfen)
    │       └── limits.js      ← checkUsageLimit (Free: 20/Tag, Pro: ∞)
    ├── .env                   ← Alle geheimen Keys (NIEMALS ins Git!)
    ├── .gitignore             ← node_modules + .env ignoriert
    └── supabase_schema.sql    ← Datenbank-Schema (bereits ausgeführt)
```

---

## Credentials & Keys

### Frontend `.env` (`/Desktop/quizwise/.env`)
```
VITE_BACKEND_URL=http://localhost:4000
VITE_SUPABASE_URL=https://qijxpizcceqyuvozawua.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGci... (anon key)
```

### Backend `.env` (`/Desktop/quizwise-backend/.env`)
```
GEMINI_API_KEY=         ← Noch einzutragen (aistudio.google.com)
PORT=4000
FRONTEND_URL=http://localhost:3001
SUPABASE_URL=https://qijxpizcceqyuvozawua.supabase.co
SUPABASE_ANON_KEY=eyJhbGci... (anon key)
SUPABASE_SERVICE_KEY=eyJhbGci... (service role key — geheim!)
STRIPE_SECRET_KEY=sk_test_51TXTТ... (Test-Key)
STRIPE_WEBHOOK_SECRET=whsec_... ← Noch nicht gesetzt (kommt beim Deployen)
STRIPE_PRO_PRICE_ID=price_1TXTYl3PCOgu8W2oftRimgHe
```

### Supabase
- **Projekt-URL:** https://qijxpizcceqyuvozawua.supabase.co
- **Dashboard:** supabase.com → Projekt "quizwise"

### Stripe
- **Produkt:** QuizWise Pro (prod_UWWbO9dHMRWHKs)
- **Preis:** price_1TXTYl3PCOgu8W2oftRimgHe (4,99€/Monat)
- **Modus:** Test-Modus (sk_test_...)
- **Testkarte:** 4242 4242 4242 4242 (beliebiges Datum + CVC)

---

## Supabase Datenbank-Tabellen

Alle bereits erstellt und mit Row Level Security (RLS) gesichert:

| Tabelle | Inhalt |
|---|---|
| `profiles` | User-Profil, Plan (free/pro), API-Nutzungszähler |
| `metrics` | Lernfortschritt pro Thema |
| `flashcard_decks` | Karteikarten-Decks mit Karten als JSON |
| `study_plan` | Studienplan-Einträge + Prüfungstermine |

**Trigger:** `on_auth_user_created` → erstellt automatisch ein Profil bei Registrierung.

---

## Server starten (lokal)

```bash
# Terminal 1 — Frontend
cd /Users/enesyazici/Desktop/quizwise
npm run dev -- --port 3001
# → http://localhost:3001

# Terminal 2 — Backend
cd /Users/enesyazici/Desktop/quizwise-backend
node src/index.js
# → http://localhost:4000

# Health-Check
curl http://localhost:4000/health
# → {"status":"ok","geminiKey":true,"supabase":true}
```

---

## Architektur: Request-Fluss

```
Browser (React App)
  │
  ├─ Supabase Auth → Login/Registrierung
  │   └─ Token wird in jeder API-Anfrage mitgeschickt
  │
  └─ fetch() → http://localhost:4000
       │
       ├─ requireAuth    → Token prüfen (Supabase)
       ├─ checkUsageLimit → Zähler in DB (Free: 20/Tag)
       └─ gemini.js      → Gemini API (Key sicher auf Server)
```

---

## Freemium-Modell

| Plan | Preis | Limit |
|---|---|---|
| Free | kostenlos | 20 KI-Anfragen/Tag |
| Pro | 4,99€/Monat | Unlimitiert |

Limit-Logik: `src/middleware/limits.js` — Zähler in `profiles.api_calls_today`, Reset täglich.

Plan auf Pro setzen (manuell für Tests):
```sql
-- In Supabase SQL Editor ausführen:
UPDATE public.profiles SET plan = 'pro'
WHERE id = (SELECT id FROM auth.users WHERE email = 'deine@email.de');
```

---

## Features im Frontend

| Feature | Status | Komponente |
|---|---|---|
| Quiz-Generator | ✅ | QuizPlayer, FileUploader |
| Karteikarten (SRS) | ✅ | FlashcardSystem |
| Klausur-Simulator | ✅ | ExamSystem |
| Active Recall | ✅ | ActiveRecall |
| Lernplan (KI) | ✅ | StudyPlanner |
| Mind Maps | ✅ | MindMapSystem |
| Gap-Radar | ✅ | GapRadar |
| KI-Erklärer | ✅ | ExplainerSystem |
| Hausarbeit-Assistent | ✅ | TermPaperSystem |
| Scholar-Suche | ✅ | ScholarSearch |
| Bibliothek | ✅ | LibrarySystem |
| Dashboard + Flow | ✅ | Dashboard |
| Login / Registrierung | ✅ | AuthModal |
| Einstellungen (5 Tabs) | ✅ | SettingsModal |
| Upgrade zu Pro | ✅ | UpgradeModal |

---

## Design-System

- **Theme:** Hell (weiß) / Dunkel (Mitternachtsblau #0B1525)
- **Akzentfarbe:** CSS Variable `--primary` (Standard: Claude Coral #D97757)
- **Farbwechsel:** `applyAccentColor()` in ColorPicker.tsx
- **Schriften:** System-Font, sehr fett (font-black), UPPERCASE
- **Icons:** Ausschließlich Lucide React (keine Emojis, keine KI-Bilder)

---

## Was noch fehlt (nächste Session)

### Priorität 1 — Technisch (1-2 Sessions)
- [ ] **Stripe Webhook lokal testen** mit Stripe CLI (`stripe listen --forward-to localhost:4000/api/stripe/webhook`)
- [ ] **Frontend deployen** auf Vercel (kostenlos, ein Klick)
- [ ] **Backend deployen** auf Railway (~5€/Monat)
- [ ] **Stripe Webhook Secret** nach Deployment eintragen
- [ ] **GEMINI_API_KEY** in Backend `.env` eintragen (fehlt noch!)
- [ ] **Supabase E-Mail SMTP** konfigurieren (Bestätigungs-E-Mails)

### Priorität 2 — Rechtlich (vor Launch Pflicht!)
- [ ] **Impressum** (Name, Adresse, E-Mail — Pflicht in DE)
- [ ] **Datenschutzerklärung** (DSGVO — e-recht24.de empfohlen, ~100€)
- [ ] **AGB** (für Abo-Modell mit Stripe erforderlich)
- [ ] **Cookie-Banner** (falls Tracking eingebaut wird)

### Priorität 3 — Nice to have
- [ ] Google / Apple Login (Supabase OAuth)
- [ ] Profilbild hochladen
- [ ] Push-Benachrichtigungen für Lernplan
- [ ] Mobile App (React Native / Capacitor)
- [ ] Dashboard MindMap-Kachel fehlt noch

---

## Nächster konkreter Schritt

**Stripe Webhook testen:**
```bash
# Stripe CLI installieren: stripe.com/docs/stripe-cli
stripe login
stripe listen --forward-to localhost:4000/api/stripe/webhook
# → gibt STRIPE_WEBHOOK_SECRET aus → in .env eintragen
```

Danach: **Vercel + Railway Deployment.**

---

## Kosten-Übersicht (nach Launch)

| Service | Kosten |
|---|---|
| Vercel (Frontend) | Kostenlos |
| Railway (Backend) | ~5€/Monat |
| Supabase | Kostenlos bis 50k User |
| Gemini API | Kostenlos bis 1.500 req/Tag, dann ~$0,075/1M Token |
| Stripe | 2,9% + 0,25€ pro Transaktion |
| Domain | ~10-15€/Jahr |

**Gesamtkosten beim Start: ~5€/Monat**
