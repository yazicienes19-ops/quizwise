-- ============================================================
-- QuizWise — Migration: Bibliothek-Fach teilen (shared_collections)
-- Ausführen in: Supabase → SQL Editor → New Query → Run
-- Sicher: verwendet IF NOT EXISTS, bricht bei erneutem Ausführen nicht ab
--
-- Analog zu shared_decks (Karteikarten-Teilen): Snapshot-Kopie, kein Live-
-- Zugriff. `documents` ist ein jsonb-Array mit einer abgespeckten Kopie der
-- Dokumente eines Fachs — bei PDF/Bild NUR Name+Digest-Text (kein Storage-
-- Datei-Kopieren nötig, da geminiService/getDocumentSource bei vorhandenem
-- digestText ohnehin IMMER zuerst den Digest statt der Originaldatei nutzt,
-- s. hooks/useDocuments.ts:162 — Quiz/Feynman/Klausur funktionieren dadurch
-- auch ohne kopierte Originaldatei, nur "Original ansehen" ist dann nicht
-- möglich, s. services/libraryService.ts:53 shouldUsePdfReader-Fallback).
-- ============================================================

-- id = text, nicht uuid: collections.id ist ebenfalls text (kurze
-- Math.random().toString(36)-IDs, s. LibrarySystem.tsx handleCreateCol),
-- keine echten UUIDs.
CREATE TABLE IF NOT EXISTS public.shared_collections (
  id         text PRIMARY KEY,
  owner_id   uuid REFERENCES auth.users(id),
  name       text,
  emoji      text,
  color      text,
  documents  jsonb,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.shared_collections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Geteiltes Fach öffentlich lesbar" ON public.shared_collections
  FOR SELECT USING (true);

CREATE POLICY "Eigenes Fach teilen" ON public.shared_collections
  FOR INSERT WITH CHECK (auth.uid() = owner_id);

-- Erneutes Teilen (z.B. nach neuen Dokumenten) aktualisiert den bestehenden
-- Link statt am Unique-Constraint zu scheitern — gleiche Lehre wie bei
-- shared_decks (s. migration_shared_decks_update.sql), hier direkt mit rein.
CREATE POLICY "Eigenes geteiltes Fach aktualisieren" ON public.shared_collections
  FOR UPDATE USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
