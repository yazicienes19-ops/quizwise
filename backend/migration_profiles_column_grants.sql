-- ============================================================
-- QuizWise — Migration: Spalten-Rechte auf profiles einschränken
-- Ausführen in: Supabase → SQL Editor → New Query → Run
-- Sicher: reine GRANT/REVOKE-Anweisungen, keine Datenänderung,
-- kein DROP, bricht bei erneutem Ausführen nicht ab.
--
-- GEFUNDENER FEHLER (verifiziert mit einem echten Auth-Test am
-- 2026-09-07, nicht nur anhand des SQL): Die RLS-Policy
-- "Nutzer können ihr Profil bearbeiten" auf public.profiles
-- (for update using (auth.uid() = id)) beschränkt nur, WELCHE
-- ZEILE ein Nutzer ändern darf — nicht, WELCHE SPALTEN. Da Supabase
-- der Rolle "authenticated" beim Anlegen der Tabelle automatisch
-- volle Tabellen-Rechte gibt, konnte ein ganz normal eingeloggter
-- Nutzer sein EIGENES plan-Feld per Client-SDK/Browser-Konsole
-- direkt auf 'pro' setzen — komplett an Stripe vorbei:
--
--   supabase.from('profiles').update({ plan: 'pro' }).eq('id', <eigene id>)
--
-- Bestätigt: HTTP 200, kein Fehler, Plan tatsächlich auf 'pro'
-- geändert. Nach dem Test sofort wieder auf 'free' zurückgesetzt.
--
-- FIX: Row Level Security (WELCHE ZEILE) und Spalten-Rechte (WELCHE
-- SPALTE) sind in Postgres zwei unabhängige Ebenen — die bestehende
-- RLS-Policy bleibt unverändert (sie ist korrekt), zusätzlich wird
-- jetzt die Spalten-Ebene abgesichert. Client-seitig wird laut
-- Code-Analyse ausschließlich die Spalte "preferences" beschrieben
-- (services/syncService.ts:227, syncPreferences — Theme/Akzentfarbe/
-- Font/Onboarding-Flags). full_name liegt in Supabase Auth
-- (user_metadata), nicht in profiles.full_name; plan wird
-- ausschließlich serverseitig über supabaseAdmin gesetzt
-- (backend/src/routes/stripe.js:128/141, Stripe-Webhook); api_calls_*
-- wird ausschließlich vom Backend (Service-Key) hochgezählt.
-- Alle anderen Spalten bleiben absichtlich NICHT client-beschreibbar.

REVOKE UPDATE ON public.profiles FROM authenticated;
GRANT UPDATE (preferences) ON public.profiles TO authenticated;

-- Zur Kontrolle nach dem Ausführen (sollte NUR "preferences" zeigen):
--   SELECT column_name FROM information_schema.column_privileges
--   WHERE table_name = 'profiles' AND grantee = 'authenticated' AND privilege_type = 'UPDATE';
