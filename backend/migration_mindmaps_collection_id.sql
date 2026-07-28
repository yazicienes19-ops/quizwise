-- Mindmaps einem Fach (Collection) zuordnen können
ALTER TABLE mindmaps ADD COLUMN IF NOT EXISTS collection_id TEXT;
