-- ============================================================
-- StudeArc — Migration: Lernstudio v2 (strukturierte Zusammenfassung)
-- Ausführen in: Supabase → SQL Editor → New Query → Run
-- Sicher: IF NOT EXISTS, bricht bei erneutem Ausführen nicht ab
--
-- 1. studio_items: Ergebnis als Blöcke (content, format_version 2) und ein
--    Idempotenz-Schlüssel (Quellen + Format + Optionen). Gleicher Schlüssel =
--    ein Eintrag; Neu-Erstellen ersetzt das alte Ergebnis, ein Doppelklick
--    kann keinen zweiten Eintrag mehr anlegen.
-- 2. studio_extractions: Zwischenspeicher der Extraktion je Seitenfenster
--    (Hash über Text + Prompt-Version), nur für den eigenen Nutzer.
-- ============================================================

ALTER TABLE public.studio_items ADD COLUMN IF NOT EXISTS content jsonb;
ALTER TABLE public.studio_items ADD COLUMN IF NOT EXISTS format_version smallint NOT NULL DEFAULT 1;
ALTER TABLE public.studio_items ADD COLUMN IF NOT EXISTS idempotency_key text;

-- NULL zählt in Postgres nicht als Duplikat: alte Einträge und Notizen bleiben frei.
CREATE UNIQUE INDEX IF NOT EXISTS studio_items_user_idem_key
  ON public.studio_items (user_id, idempotency_key);

CREATE TABLE IF NOT EXISTS public.studio_extractions (
  user_id        uuid        NOT NULL REFERENCES public.profiles ON DELETE CASCADE,
  content_hash   text        NOT NULL,
  prompt_version text        NOT NULL,
  doc_id         text,
  page_count     integer     NOT NULL DEFAULT 0,
  units          jsonb       NOT NULL DEFAULT '[]'::jsonb,
  created_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, content_hash, prompt_version)
);

ALTER TABLE public.studio_extractions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Eigene Extraktionen lesen" ON public.studio_extractions;
CREATE POLICY "Eigene Extraktionen lesen"
  ON public.studio_extractions FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Eigene Extraktionen anlegen" ON public.studio_extractions;
CREATE POLICY "Eigene Extraktionen anlegen"
  ON public.studio_extractions FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Eigene Extraktionen ändern" ON public.studio_extractions;
CREATE POLICY "Eigene Extraktionen ändern"
  ON public.studio_extractions FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Eigene Extraktionen löschen" ON public.studio_extractions;
CREATE POLICY "Eigene Extraktionen löschen"
  ON public.studio_extractions FOR DELETE USING (auth.uid() = user_id);

-- Kontrolle: muss 3 Spalten und die Tabelle zeigen.
SELECT column_name FROM information_schema.columns
WHERE table_name = 'studio_items' AND column_name IN ('content', 'format_version', 'idempotency_key');
SELECT to_regclass('public.studio_extractions');
