-- ============================================================
-- QuizWise/StudeArc — Migration: fehlende Spalte source_document_id
-- Ausführen in: Supabase → SQL Editor → New Query → Run
-- Sicher: IF NOT EXISTS, bricht bei erneutem Ausführen nicht ab
--
-- Fund vom 26.07.2026: migration_flashcard_decks.sql enthält
-- source_document_id in der CREATE TABLE-Anweisung, aber die Tabelle
-- existierte zu diesem Zeitpunkt bereits (CREATE TABLE IF NOT EXISTS
-- greift dann nicht mehr) — die Spalte wurde nie tatsächlich angelegt.
-- Live-Symptom: jeder Ladeversuch von Karteikarten-Decks aus der Cloud
-- schlägt mit HTTP 400 "column flashcard_decks.source_document_id
-- does not exist" fehl (services/flashcardService.ts). Der App-seitige
-- Fallback auf localStorage fängt das ab, dadurch fällt es im Alltag
-- kaum auf — aber jeder Cloud-Sync/Upload eines Decks (saveDeckToSupabase,
-- uploadAllDecksToSupabase) scheitert seitdem still (.catch(() => {})),
-- d.h. Decks landen nie wirklich in der Cloud (kein Multi-Device-Sync,
-- Verlustrisiko bei localStorage-Löschung).
-- ============================================================

alter table public.flashcard_decks
  add column if not exists source_document_id text;
