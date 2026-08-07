-- ============================================================
-- QuizWise/StudeArc — Migration: fehlende Spalte updated_at
-- Ausführen in: Supabase → SQL Editor → New Query → Run
-- Sicher: IF NOT EXISTS, bricht bei erneutem Ausführen nicht ab
--
-- Fund vom 07.08.2026, direkt nach migration_flashcard_source_document.sql:
-- Derselbe Ursache-Mechanismus wie dort (CREATE TABLE IF NOT EXISTS griff
-- nicht mehr, weil die Tabelle schon existierte) betraf ZWEI Spalten aus der
-- ursprünglichen CREATE TABLE-Anweisung, nicht nur eine — updated_at fehlte
-- ebenfalls. Live-Symptom (bestätigt per direktem Supabase-Aufruf als echter
-- eingeloggter Nutzer): jeder saveDeckToSupabase()-Upsert schlägt mit
-- PGRST204 "Could not find the 'updated_at' column of 'flashcard_decks'"
-- fehl — dadurch landete bislang KEIN einziges Karteikarten-Deck in der
-- Cloud, auch nach der ersten Migration nicht. loadDecksFromSupabase()
-- sortiert außerdem nach genau dieser Spalte (.order('updated_at', ...)),
-- betrifft also auch das Laden, sobald die Spalte fehlt.
-- ============================================================

alter table public.flashcard_decks
  add column if not exists updated_at timestamptz not null default now();
