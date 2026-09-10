-- ============================================================
-- StudeArc — Migration: Bild-Dokumente (Tafelfotos, Notizen) erlauben
-- Ausführen in: Supabase → SQL Editor → New Query → Run
-- Sicher: bricht bei erneutem Ausführen nicht ab
--
-- Der CHECK aus migration_phase2_documents.sql kannte nur pdf/docx/text.
-- Der Bild-Upload (hooks/useDocuments.ts, file_type 'image') scheiterte
-- deshalb bei jedem Versuch mit Fehler 23514 — kein einziges Bild-Dokument
-- konnte je gespeichert werden.
-- ============================================================

ALTER TABLE public.documents DROP CONSTRAINT IF EXISTS documents_file_type_check;
ALTER TABLE public.documents
  ADD CONSTRAINT documents_file_type_check
  CHECK (file_type IN ('pdf', 'docx', 'text', 'image'));
