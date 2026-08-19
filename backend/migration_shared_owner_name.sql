-- ============================================================
-- QuizWise — Migration: Absendername für geteilte Decks/Fächer
-- Ausführen in: Supabase → SQL Editor → New Query → Run
-- Sicher: ADD COLUMN IF NOT EXISTS, bricht bei erneutem Ausführen nicht ab
--
-- Neue Vorschau-Seiten-Optik (Design-Handoff "Email Geteiltes Deck") zeigt
-- "{Name} hat ein Deck/Fach mit dir geteilt" — der Name wird beim Teilen
-- clientseitig aus user_metadata.full_name abgeleitet (gleiches Muster wie
-- Dashboard.tsx/Layout.tsx) und hier mitgespeichert, damit die öffentliche
-- Vorschau-Seite ihn zeigen kann, ohne fremde profiles-Zeilen lesen zu
-- müssen (dafür bräuchte es eine neue, riskantere RLS-Policy).
-- ============================================================

ALTER TABLE public.shared_decks ADD COLUMN IF NOT EXISTS owner_name text;
ALTER TABLE public.shared_collections ADD COLUMN IF NOT EXISTS owner_name text;
