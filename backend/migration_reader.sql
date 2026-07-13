-- QuizWise Split-Screen-Reader Migration
-- Ausführen in: Supabase → SQL Editor → New Query → Run
-- Erweitert user_saved_content um Lese-Fortschritt + Reader-Frage-Log

ALTER TABLE public.user_saved_content
  ADD COLUMN IF NOT EXISTS reading_progress jsonb NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS reader_log        jsonb NOT NULL DEFAULT '[]';
