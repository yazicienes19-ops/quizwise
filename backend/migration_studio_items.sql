-- ============================================================
-- StudeArc — Migration: Lernstudio (Zusammenfassung wie NotebookLM)
-- Ausführen in: Supabase → SQL Editor → New Query → Run
-- Sicher: IF NOT EXISTS, bricht bei erneutem Ausführen nicht ab
--
-- Gespeicherte Ergebnisse (Zusammenfassung, Lernleitfaden, FAQ, Glossar,
-- Zeitleiste) und eigene Notizen je Fach. sources = Fußnotenliste
-- [{ "n": 1, "docId": "...", "name": "..." }], damit Fußnoten auch nach dem
-- Löschen einer Quelle noch ihren Namen zeigen.
-- Ohne diese Tabelle bleiben die Ergebnisse nur im Browser.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.studio_items (
  id            text        PRIMARY KEY,
  user_id       uuid        NOT NULL REFERENCES public.profiles ON DELETE CASCADE,
  collection_id text        NOT NULL REFERENCES public.collections(id) ON DELETE CASCADE,
  kind          text        NOT NULL CHECK (kind IN ('summary', 'guide', 'faq', 'glossary', 'timeline', 'note')),
  title         text        NOT NULL,
  markdown      text        NOT NULL DEFAULT '',
  sources       jsonb       NOT NULL DEFAULT '[]'::jsonb,
  focus         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS studio_items_user_collection_idx
  ON public.studio_items (user_id, collection_id);

ALTER TABLE public.studio_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Eigene Studio-Einträge lesen" ON public.studio_items;
CREATE POLICY "Eigene Studio-Einträge lesen"
  ON public.studio_items FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Eigene Studio-Einträge anlegen" ON public.studio_items;
CREATE POLICY "Eigene Studio-Einträge anlegen"
  ON public.studio_items FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Eigene Studio-Einträge ändern" ON public.studio_items;
CREATE POLICY "Eigene Studio-Einträge ändern"
  ON public.studio_items FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Eigene Studio-Einträge löschen" ON public.studio_items;
CREATE POLICY "Eigene Studio-Einträge löschen"
  ON public.studio_items FOR DELETE USING (auth.uid() = user_id);
