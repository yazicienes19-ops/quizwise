-- ============================================================
-- QuizWise — Migration: Spalten für den Kalender-Tages-Editor
-- Ausführen in: Supabase → SQL Editor → New Query → Run
-- Sicher: IF NOT EXISTS, bricht bei erneutem Ausführen nicht ab
--
-- Neue Spalten auf user_saved_content für:
-- - recurring_sessions: feste, wöchentlich wiederkehrende Lernsessions
--   (z.B. "jeden Montag Statistik"), inkl. punktueller Ausnahmen (skipDates)
-- - calendar_sessions: einmalige, an ein echtes Datum gebundene Lernsessions
--   (frei angelegt, oder als Überschreibung eines einzelnen wiederkehrenden
--   Vorkommens)
-- Ohne diese Migration läuft die App weiter (lokaler Fallback), nur der
-- Multi-Device-Sync dieser beiden Felder fehlt.
-- ============================================================

alter table public.user_saved_content
  add column if not exists recurring_sessions jsonb not null default '[]'::jsonb;

alter table public.user_saved_content
  add column if not exists calendar_sessions jsonb not null default '[]'::jsonb;
