-- 실행 시점 기준 한국(KST) 달력 날짜에 갱신된 행은 prune 대상에서 제외
-- (N일 계산·시각 이슈와 무관하게 '오늘 갱신'은 삭제하지 않음)

CREATE OR REPLACE FUNCTION public.prune_stale_contests(p_days integer DEFAULT 3)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count bigint;
  d integer := GREATEST(1, LEAST(COALESCE(p_days, 3), 90));
BEGIN
  WITH del AS (
    DELETE FROM public.contests c
    WHERE c.manual_entry IS NOT TRUE
      AND c.updated_at < (now() - (d || ' days')::interval)
      AND (timezone('Asia/Seoul', c.updated_at))::date < (timezone('Asia/Seoul', now()))::date
    RETURNING 1
  )
  SELECT count(*)::bigint INTO deleted_count FROM del;

  RETURN COALESCE(deleted_count, 0);
END;
$$;

COMMENT ON FUNCTION public.prune_stale_contests(integer) IS
  'manual_entry 아님, updated_at이 N일보다 오래됨, 한국 날짜 기준 실행일 당일 갱신이 아닌 행만 삭제.';
