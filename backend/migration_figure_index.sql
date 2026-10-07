-- Abbildungsverzeichnis je PDF fürs Lernstudio (services/studioFigures.ts):
-- {"v":1,"scannedAt":...,"figures":[{"id":"f1","page":34,"box":{...},"title":"...","description":"...","image":"<card-images-Pfad>"}]}
-- Wird einmal pro PDF erstellt, damit weitere Zusammenfassungen nicht neu suchen.
-- Ohne die Spalte bleibt das Verzeichnis nur im Browser. Bestehende RLS-Policies gelten unverändert.

ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS figure_index jsonb;
