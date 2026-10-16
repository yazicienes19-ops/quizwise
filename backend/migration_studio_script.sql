-- ============================================================
-- StudeArc — Migration: Lernstudio-Format „Skript“ (Phase 2)
-- Ausführen in: Supabase → SQL Editor → New Query → Run
-- Sicher: kann mehrfach laufen.
--
-- studio_items.kind erlaubt zusätzlich 'script'. Ohne diese Migration
-- lässt sich ein Skript erstellen, aber nicht speichern.
-- ============================================================

-- Bestehende CHECK-Bedingung(en) auf kind entfernen, egal unter welchem Namen.
DO $$
DECLARE c text;
BEGIN
  FOR c IN SELECT conname FROM pg_constraint
           WHERE conrelid = 'public.studio_items'::regclass AND contype = 'c'
             AND pg_get_constraintdef(oid) LIKE '%kind%'
  LOOP
    EXECUTE format('ALTER TABLE public.studio_items DROP CONSTRAINT %I', c);
  END LOOP;
END $$;
ALTER TABLE public.studio_items ADD CONSTRAINT studio_items_kind_check
  CHECK (kind IN ('summary', 'guide', 'faq', 'glossary', 'timeline', 'script', 'note'));

-- Kontrolle: muss 'script' in der Bedingung zeigen.
SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'studio_items_kind_check';
