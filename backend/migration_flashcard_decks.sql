-- Karteikarten-Decks in Supabase speichern
CREATE TABLE IF NOT EXISTS flashcard_decks (
  id TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  cards JSONB NOT NULL DEFAULT '[]',
  source_document_id TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (id, user_id)
);

ALTER TABLE flashcard_decks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own decks" ON flashcard_decks
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
