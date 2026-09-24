-- ============================================================
-- StudeArc: Bildkarten (24.09.2026)
-- Ausführen in: Supabase → SQL Editor → New Query → Run
-- Wiederholbar: Bucket per ON CONFLICT, Policies werden vorher entfernt.
-- ============================================================
-- Eigener privater Bucket für Bilder auf Karteikarten. Der Dokument-Bucket
-- erlaubt nur PDF/Word/Text; Bilder bleiben dadurch getrennt und klein.
-- Pfad-Konvention: {user_id}/{karten_id}-{zufall}.{webp|jpg|png}
-- Beim Konto-Löschen räumt backend/src/utils/userStorage.js den Ordner ab.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'card-images',
  'card-images',
  false,
  2097152, -- 2 MB; der Browser verkleinert vorher auf max. 1280 px
  ARRAY['image/webp', 'image/jpeg', 'image/png', 'image/gif']
) ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Eigene Kartenbilder hochladen" ON storage.objects;
DROP POLICY IF EXISTS "Eigene Kartenbilder lesen" ON storage.objects;
DROP POLICY IF EXISTS "Eigene Kartenbilder aktualisieren" ON storage.objects;
DROP POLICY IF EXISTS "Eigene Kartenbilder löschen" ON storage.objects;

CREATE POLICY "Eigene Kartenbilder hochladen"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'card-images'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Eigene Kartenbilder lesen"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'card-images'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Eigene Kartenbilder aktualisieren"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'card-images'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Eigene Kartenbilder löschen"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'card-images'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Kontrolle: sollte 1 Zeile mit public = false liefern
SELECT id, public, file_size_limit, allowed_mime_types FROM storage.buckets WHERE id = 'card-images';
