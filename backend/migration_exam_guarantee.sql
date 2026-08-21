-- B+ Free-Tier-Regel: 1 vollständige Klausur-Simulation pro Tag ist garantiert,
-- auch wenn das Tageslimit an KI-Calls erschöpft ist (Monetarisierung-Audit
-- 2026-08: Grenzkosten ~0,5 ct/Nutzer/Tag, Aha-Moment = Conversion-Treiber).
-- Ausführen in: Supabase Dashboard → SQL Editor.
--
-- Genutzte Calls: generateFullExam, classifyBloomLevels, evaluateWithRubric
-- senden examWorkflow:true (services/geminiService.ts). Der ERSTE garantierte
-- Call verbraucht das Tages-Garantie-Flag; danach greift bei erschöpftem Limit
-- wieder die normale 429-Antwort.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS exam_guarantee_used_today boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION check_and_increment_api_calls(
  p_user_id       uuid,
  p_today         text,
  p_exam_workflow boolean DEFAULT false
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
  v_exam_ok  boolean;
BEGIN
  SELECT plan, api_calls_today, api_calls_reset_at, exam_guarantee_used_today
  INTO   v_plan, v_calls, v_reset_at, v_exam_ok
  FROM   profiles
  WHERE  id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Profil nicht gefunden');
  END IF;

  -- Zähler + Klausur-Garantie zurücksetzen wenn neuer Tag
  IF v_reset_at IS DISTINCT FROM p_today::date THEN
    v_calls := 0;
    v_exam_ok := false;
    UPDATE profiles
    SET    api_calls_today = 0, api_calls_reset_at = p_today::date, exam_guarantee_used_today = false
    WHERE  id = p_user_id;
  END IF;

  v_limit := CASE v_plan WHEN 'free' THEN 20 ELSE NULL END;

  IF v_limit IS NOT NULL AND v_calls >= v_limit THEN
    -- Klausur-Garantie: einmal pro Tag zusätzlich zum Limit
    IF p_exam_workflow AND COALESCE(v_exam_ok, false) = false THEN
      UPDATE profiles
      SET   exam_guarantee_used_today = true
      WHERE id = p_user_id;
      RETURN jsonb_build_object('allowed', true, 'plan', v_plan, 'limit', v_limit,
                                'used', v_calls, 'exam_guarantee', true);
    END IF;
    RETURN jsonb_build_object(
      'allowed', false,
      'plan', v_plan,
      'limit', v_limit,
      'used', v_calls,
      'upgradeRequired', v_plan = 'free'
    );
  END IF;

  UPDATE profiles
  SET    api_calls_today = v_calls + 1
  WHERE  id = p_user_id;

  RETURN jsonb_build_object('allowed', true, 'plan', v_plan, 'limit', v_limit,
                            'used', v_calls + 1);
END;
$$;
