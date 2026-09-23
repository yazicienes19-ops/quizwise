-- Kontolöschung darf nicht an geteilten Inhalten scheitern (Audit 23.09.2026).
--
-- shared_decks.owner_id und shared_collections.owner_id verweisen auf
-- auth.users ohne ON DELETE (migration_cloud_sync.sql, migration_shared_collections.sql).
-- Hat jemand einen Stapel oder ein Fach geteilt, blockiert der Fremdschlüssel
-- das Löschen des Nutzers, und DELETE /api/user/account endet mit einem Fehler.
--
-- CASCADE: Mit dem Konto verschwinden auch seine Teilen-Links. Wer den Inhalt
-- schon übernommen hat, behält seine eigene Kopie (die liegt in eigenen Tabellen).
--
-- Idempotent: Der alte Fremdschlüssel wird über seinen tatsächlichen Namen
-- gesucht und entfernt, danach mit CASCADE neu angelegt.

DO $$
DECLARE
  t   text;
  con text;
BEGIN
  FOREACH t IN ARRAY ARRAY['shared_decks', 'shared_collections'] LOOP
    FOR con IN
      SELECT c.conname
      FROM pg_constraint c
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
      WHERE c.conrelid = format('public.%I', t)::regclass
        AND c.contype = 'f'
        AND a.attname = 'owner_id'
    LOOP
      EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I', t, con);
    END LOOP;

    EXECUTE format(
      'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE',
      t, t || '_owner_id_fkey'
    );
  END LOOP;
END $$;

-- Kontrolle: beide Zeilen müssen confdeltype = 'c' (cascade) zeigen.
SELECT conrelid::regclass AS tabelle, conname, confdeltype
FROM pg_constraint
WHERE conname IN ('shared_decks_owner_id_fkey', 'shared_collections_owner_id_fkey');
