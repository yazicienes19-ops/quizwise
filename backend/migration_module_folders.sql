-- Ordner innerhalb eines Fachs (z.B. je Dozent), eine Ebene.
-- Die Ordner stehen als Liste am Fach: [{ "id": "f_ab12", "name": "Prof. Müller", "excluded": true }]
-- excluded = dauerhaft abgewählt, zählt dann nicht zur Wissensbasis des Fachs.
-- Dokumente verweisen über folder_id auf einen Ordner ihres Fachs.
-- Bestehende RLS-Policies gelten unverändert (nur neue Spalten).

ALTER TABLE public.collections
  ADD COLUMN IF NOT EXISTS folders jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS folder_id text;

CREATE INDEX IF NOT EXISTS documents_folder_id_idx
  ON public.documents (folder_id)
  WHERE folder_id IS NOT NULL;
