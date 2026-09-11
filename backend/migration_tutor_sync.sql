-- ============================================================
-- StudeArc — Migration: Tutor-Gespräche und Reader-Chats in die Cloud
-- Ausführen in: Supabase → SQL Editor → New Query → Run
-- Sicher: IF NOT EXISTS, bricht bei erneutem Ausführen nicht ab
--
-- Bisher lagen Tutor-Sitzungen (studearc_tutor_sessions_v1) und die Chats
-- im Splitscreen-Reader (studearc_reader_chat_v1) nur im Browser. Auf einem
-- zweiten Gerät oder nach gelöschten Browserdaten waren sie weg.
-- Die App funktioniert auch ohne diese Spalten (bleibt dann lokal).
-- Bestehende RLS-Policies der Tabelle gelten zeilenweise, also auch hierfür.
-- ============================================================

ALTER TABLE public.user_saved_content
  ADD COLUMN IF NOT EXISTS tutor_sessions jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS reader_chat jsonb NOT NULL DEFAULT '{}'::jsonb;
