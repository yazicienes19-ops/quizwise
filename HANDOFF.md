# QuizWise — Session Handoff
**Stand: 17. Mai 2026**

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
└── quizwise/                  ← Frontend + Backend (zusammen im selben Repo)
    ├── App.tsx
    ├── types.ts
    ├── index.html
    ├── .env                   ← VITE_BACKEND_URL, VITE_SUPABASE_*  (nicht im Git!)
    ├── .gitignore             ← .env ist ausgeschlossen ✅
    ├── components/
    │   ├── Dashboard.tsx      ← Adaptives Raster (nach Nutzung sortiert)
    │   ├── Layout.tsx
    │   ├── SettingsModal.tsx
    │   ├── AuthModal.tsx
    │   ├── UpgradeModal.tsx
    │   └── ... (alle anderen Feature-Komponenten)
    ├── services/
    │   ├── geminiService.ts   ← Alle KI-Funktionen → rufen Backend auf
    │   ├── supabaseClient.ts
    │   ├── stripeService.ts
    │   └── userService.ts
    └── backend/               ← Node.js Server
        ├── src/
        │   ├── index.js
        │   ├── routes/
        │   │   ├── gemini.js
        │   │   ├── user.js
        │   │   └── stripe.js
        │   └── middleware/
        │       ├── auth.js
        │       └── limits.js
        ├── .env               ← Alle geheimen Keys (NIEMALS ins Git!)
        └── supabase_schema.sql
```

---

## Credentials & Keys

### Frontend `.env` (`/Desktop/quizwise/.env`)
```
VITE_BACKEND_URL=http://localhost:4000
VITE_SUPABASE_URL=https://qijxpizcceqyuvozawua.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGci... (anon key)
```

### Backend `.env` (`/Desktop/quizwise/backend/.env`)
```
GEMINI_API_KEY=AIzaSyBdEEFfH1pOaMsY0sHbZ_cGrZxtif0ZIgc   ← Hat Quota 0! Neuen Key nötig
PORT=4000
FRONTEND_URL=http://localhost:3001
SUPABASE_URL=https://qijxpizcceqyuvozawua.supabase.co
SUPABASE_ANON_KEY=eyJhbGci...
SUPABASE_SERVICE_KEY=eyJhbGci... (service role key — geheim!)
STRIPE_SECRET_KEY=sk_test_51TXTT...
STRIPE_WEBHOOK_SECRET=whsec_fcaf24d6f100939b97210e24f6456dc0d2b6f4afe19814731d77d6b3ffc11ecc  ← Lokal gültig
STRIPE_PRO_PRICE_ID=price_1TXTYl3PCOgu8W2oftRimgHe
```

> ⚠️ Der Stripe Webhook Secret `whsec_...` ist nur für lokale Tests gültig (Stripe CLI).
> Nach dem Railway-Deployment muss ein neuer Webhook in stripe.com/dashboard eingerichtet und der neue Secret eingetragen werden.

### Supabase
- **Projekt-URL:** https://qijxpizcceqyuvozawua.supabase.co
- **Dashboard:** supabase.com → Projekt "quizwise"

### Stripe
- **Produkt:** QuizWise Pro (prod_UWWbO9dHMRWHKs)
- **Preis:** price_1TXTYl3PCOgu8W2oftRimgHe (4,99€/Monat)
- **Modus:** Test-Modus (sk_test_...)
- **Testkarte:** 4242 4242 4242 4242 (beliebiges Datum + CVC)

### GitHub
- **Repo:** https://github.com/yazicienes19-ops/quizwise
- **Branch:** main (aktuell, Stand 17.05.2026)

---

## Server starten (lokal)

```bash
# Terminal 1 — Frontend
cd /Users/enesyazici/Desktop/quizwise
npm run dev -- --port 3001
# → http://localhost:3001 (oder 3002 falls 3001 belegt)

# Terminal 2 — Backend
cd /Users/enesyazici/Desktop/quizwise/backend
node src/index.js
# → http://localhost:4000

# Terminal 3 — Stripe Webhook (nur für lokale Stripe-Tests)
stripe listen --forward-to localhost:4000/api/stripe/webhook

# Health-Check
curl http://localhost:4000/health
# → {"status":"ok","geminiKey":true,"supabase":true}
```

---

## Was diese Session erledigt wurde (17. Mai 2026)

| Aufgabe | Status |
|---|---|
| Gemini API Key eingetragen | ✅ (Key hat aber Quota 0 — siehe unten) |
| Adaptives Dashboard implementiert | ✅ |
| Stripe Webhook lokal getestet | ✅ |
| .gitignore für .env gesichert | ✅ |
| Alles auf GitHub gepusht | ✅ |

---

## Adaptives Dashboard — wie es funktioniert

`components/Dashboard.tsx` — Die 6 Kacheln sortieren sich automatisch nach Nutzungshäufigkeit:
- Klicks werden in `localStorage` unter dem Key `quizwise_feature_usage` gespeichert
- Beim nächsten Dashboard-Besuch: meist genutzte Funktion landet oben links
- Kein Backend nötig, funktioniert sofort

---

## Was noch fehlt (nächste Session)

### Priorität 1 — Gemini API Key reparieren (BLOCKIERT alles)
- [ ] **Google Cloud Billing aktivieren:** console.cloud.google.com → Abrechnung → Kreditkarte hinterlegen
- [ ] **Danach neuen Key** in aistudio.google.com erstellen → in `backend/.env` eintragen
- [ ] **Problem:** Alle bisherigen Keys (3 Stück, 2 Accounts) haben `limit: 0` wegen fehlendem Billing
- [ ] Ohne funktionierenden Key kann kein Feature der App getestet werden

### Priorität 2 — Deployment (nächster großer Schritt)
- [ ] **Frontend auf Vercel deployen** (GitHub Repo ist bereit, ein Klick)
  - Umgebungsvariablen in Vercel eintragen: `VITE_BACKEND_URL`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
  - `VITE_BACKEND_URL` vorerst auf `http://localhost:4000` — später Railway-URL eintragen
- [ ] **Backend auf Railway deployen** (~5€/Monat)
  - Alle Backend `.env` Variablen in Railway eintragen
  - Nach Deployment: `VITE_BACKEND_URL` in Vercel auf die Railway-URL aktualisieren
- [ ] **Neuen Stripe Webhook** für Produktions-URL einrichten (stripe.com/dashboard → Webhooks)
  - Neuen `STRIPE_WEBHOOK_SECRET` in Railway eintragen

### Priorität 3 — Rechtlich (vor Launch Pflicht!)
- [ ] **Impressum** (Name, Adresse, E-Mail — Pflicht in DE)
- [ ] **Datenschutzerklärung** (DSGVO — e-recht24.de empfohlen)
- [ ] **AGB** (für Abo-Modell mit Stripe erforderlich)

### Priorität 4 — Nice to have
- [ ] Google / Apple Login (Supabase OAuth)
- [ ] Supabase E-Mail SMTP konfigurieren (Bestätigungs-E-Mails)
- [ ] Dashboard MindMap-Kachel fehlt noch

---

## Nächster konkreter Schritt

**Gemini API Key reparieren:**
1. console.cloud.google.com → Billing → Kreditkarte hinterlegen
2. aistudio.google.com → neuen Key erstellen
3. Key in `backend/.env` eintragen, Backend neu starten
4. Testen: `curl` direkt gegen Gemini API

**Danach sofort: Vercel Deployment** (GitHub Repo ist push-bereit).

---

## Kosten-Übersicht (nach Launch)

| Service | Kosten |
|---|---|
| Vercel (Frontend) | Kostenlos |
| Railway (Backend) | ~5€/Monat |
| Supabase | Kostenlos bis 50k User |
| Gemini API | Kostenlos bis 1.500 req/Tag |
| Stripe | 2,9% + 0,25€ pro Transaktion |
| Domain | ~10-15€/Jahr |

**Gesamtkosten beim Start: ~5€/Monat**
