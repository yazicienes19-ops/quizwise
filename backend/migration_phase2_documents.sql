-- ============================================================
-- QuizWise — Phase 2 Migration: Dokumente & Sammlungen
-- Ausführen in: Supabase → SQL Editor → New Query → Run
-- Sicher: verwendet IF NOT EXISTS, bricht bei Konflikt nicht ab
-- ============================================================


-- ── 1. Supabase Storage Bucket ────────────────────────────────────────────────
-- Privater Bucket: nur der eigene Nutzer kann lesen/schreiben
-- Limit: 50 MB pro Datei, nur erlaubte Dateitypen
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'document-files',
  'document-files',
  false,
  52428800,
  ARRAY[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
    'text/markdown'
  ]
) ON CONFLICT (id) DO NOTHING;

-- Storage RLS: Dateipfad-Konvention ist {user_id}/{doc_id}/{dateiname}
-- Damit kann auth.uid() mit dem ersten Pfad-Segment verglichen werden.

CREATE POLICY "Eigene Dateien hochladen"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'document-files'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Eigene Dateien lesen"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'document-files'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Eigene Dateien aktualisieren"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'document-files'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Eigene Dateien löschen"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'document-files'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );


-- ── 2. Tabelle: collections ───────────────────────────────────────────────────
-- Kompatibel mit dem bestehenden Collection-Interface (id: string)
CREATE TABLE IF NOT EXISTS public.collections (
  id          text        PRIMARY KEY,
  user_id     uuid        NOT NULL REFERENCES public.profiles ON DELETE CASCADE,
  name        text        NOT NULL,
  emoji       text        NOT NULL DEFAULT '📁',
  color       text        NOT NULL DEFAULT 'bg-indigo-500',
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.collections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Eigene Sammlungen lesen"
  ON public.collections FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Eigene Sammlungen erstellen"
  ON public.collections FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Eigene Sammlungen bearbeiten"
  ON public.collections FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Eigene Sammlungen löschen"
  ON public.collections FOR DELETE
  USING (auth.uid() = user_id);


-- ── 3. Tabelle: documents ─────────────────────────────────────────────────────
-- Kompatibel mit dem bestehenden ProcessedDocument-Interface:
--   id, name, type → file_type, uploadDate → upload_date, collectionId → collection_id
--
-- Inhalt-Strategie:
--   PDF  → Datei liegt in Storage (storage_path), content_text optional (Preview)
--   DOCX → Extrahierter Text in content_text, kein Storage-Eintrag nötig
--   TXT  → Plaintext in content_text
CREATE TABLE IF NOT EXISTS public.documents (
  id            text        PRIMARY KEY,
  user_id       uuid        NOT NULL REFERENCES public.profiles ON DELETE CASCADE,
  name          text        NOT NULL,
  file_type     text        NOT NULL CHECK (file_type IN ('pdf', 'docx', 'text')),
  collection_id text        REFERENCES public.collections(id) ON DELETE SET NULL,
  storage_path  text,                          -- nur bei PDFs: '{user_id}/{doc_id}/{dateiname}'
  content_text  text,                          -- extrahierter Text (docx/txt) oder Preview
  upload_date   bigint      NOT NULL,           -- ms-Timestamp, deckungsgleich mit ProcessedDocument.uploadDate
  status        text        NOT NULL DEFAULT 'ready'
                            CHECK (status IN ('ready', 'processing', 'error')),
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Eigene Dokumente lesen"
  ON public.documents FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Eigene Dokumente erstellen"
  ON public.documents FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Eigene Dokumente bearbeiten"
  ON public.documents FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Eigene Dokumente löschen"
  ON public.documents FOR DELETE
  USING (auth.uid() = user_id);


-- ── 4. Index für Performance ──────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS documents_user_id_idx
  ON public.documents (user_id);

CREATE INDEX IF NOT EXISTS documents_collection_id_idx
  ON public.documents (collection_id);

CREATE INDEX IF NOT EXISTS collections_user_id_idx
  ON public.collections (user_id);
