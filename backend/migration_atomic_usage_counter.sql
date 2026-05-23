-- Atomischer Usage-Counter: verhindert Race Condition bei parallelen Requests.
-- Ausführen in: Supabase Dashboard → SQL Editor
--
-- Statt Read → Check → Write (3 separate DB-Operationen, race-anfällig)
-- macht diese Funktion alles in einer Transaktion mit Row-Lock (FOR UPDATE).

CREATE OR REPLACE FUNCTION check_and_increment_api_calls(
  p_user_id uuid,
  p_today    text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_plan     text;
  v_limit    integer;
  v_calls    integer;
  v_reset_at date;
BEGIN
  SELECT plan, api_calls_today, api_calls_reset_at
  INTO   v_plan, v_calls, v_reset_at
  FROM   profiles
  WHERE  id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Profil nicht gefunden');
  END IF;

  -- Zähler zurücksetzen wenn neuer Tag
  IF v_reset_at IS DISTINCT FROM p_today::date THEN
    v_calls := 0;
    UPDATE profiles
    SET    api_calls_today = 0, api_calls_reset_at = p_today::date
    WHERE  id = p_user_id;
  END IF;

  -- Limit bestimmen (NULL = unbegrenzt)
  v_limit := CASE v_plan WHEN 'free' THEN 20 ELSE NULL END;

  -- Limit erreicht?
  IF v_limit IS NOT NULL AND v_calls >= v_limit THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'used',    v_calls,
      'limit',   v_limit,
      'plan',    v_plan
    );
  END IF;

  -- Atomar incrementieren
  UPDATE profiles
  SET    api_calls_today = v_calls + 1
  WHERE  id = p_user_id;

  RETURN jsonb_build_object(
    'allowed', true,
    'used',    v_calls + 1,
    'limit',   v_limit,
    'plan',    v_plan
  );
END;
$$;
