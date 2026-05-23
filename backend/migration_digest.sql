-- Lerndigest-Spalten zur documents-Tabelle hinzufügen
-- Ausführen in: Supabase Dashboard → SQL Editor

ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS digest_text   text,
  ADD COLUMN IF NOT EXISTS digest_status text;
