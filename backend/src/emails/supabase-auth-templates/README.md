# Supabase-Auth-E-Mail-Vorlagen (StudeArc-Design)

Diese drei HTML-Dateien werden NICHT vom Backend versendet — Supabase Auth
verschickt Bestätigungs-/Reset-/Änderungs-Mails direkt selbst, ohne
Umweg über `backend/src/utils/mailer.js`. Es gibt keine API, um diese
Vorlagen automatisch zu setzen (nur ein Supabase-Management-API-Token
könnte das, das dieses Projekt nicht hat) — deshalb müssen sie einmalig
manuell im Supabase-Dashboard eingefügt werden.

## Einfügen

1. Supabase-Dashboard → **Authentication** → **Emails** → **Templates**
2. Pro Vorlage: Template auswählen, den kompletten Inhalt der jeweiligen
   `.html`-Datei hier in das "Message body"-Feld einfügen, speichern.

| Datei | Supabase-Template |
|---|---|
| `confirm-signup.html` | Confirm signup |
| `reset-password.html` | Reset Password |
| `change-email.html` | Change Email Address |

Die `{{ .ConfirmationURL }}`/`{{ .NewEmail }}`-Platzhalter sind
Supabase-eigene Go-Template-Variablen — unverändert übernehmen, die
werden beim Versand automatisch ersetzt.

**Wichtig:** Die Dateien enthalten bewusst KEIN `<!DOCTYPE html>`,
`<html>`, `<head>` oder `<body>` — nur den inneren Inhalt (Fragment).
Ein erster Versuch mit vollständigem HTML-Dokument führte zu einer
komplett leeren Mail (bestätigt sowohl im Supabase-eigenen "Preview"-
Tab als auch im tatsächlichen Empfang) — Supabase erwartet für das
"Body"-Feld ein Fragment (die eigenen Standardvorlagen sind ebenfalls
nur `<h2>...</h2><p>...</p>`, ohne Dokumentgerüst) und rendert bei
verschachteltem `<html>`/`<body>` offenbar nichts.

Design 1:1 aus `backend/src/emails/kuendigung.js` übernommen (gleiche
Farbtokens/Struktur/Wordmark), nur Inhalt pro Anlass angepasst.
