-- Mindmaps in Supabase speichern
CREATE TABLE IF NOT EXISTS mindmaps (
  id TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  markdown TEXT NOT NULL DEFAULT '',
  source_document_id TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (id, user_id)
);

ALTER TABLE mindmaps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own mindmaps" ON mindmaps
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
