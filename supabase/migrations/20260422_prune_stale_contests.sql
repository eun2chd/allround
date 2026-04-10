-- 일일 정리: 크롤에서 더 이상 갱신되지 않는 contests 행 삭제 (Edge Function prune-stale-contests)
-- 기준: updated_at < now() - p_days

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
    WHERE c.updated_at < (now() - (d || ' days')::interval)
    RETURNING 1
  )
  SELECT count(*)::bigint INTO deleted_count FROM del;

  RETURN COALESCE(deleted_count, 0);
END;
$$;

COMMENT ON FUNCTION public.prune_stale_contests(integer) IS
  'contests 중 updated_at이 지정 일수보다 오래된 행을 삭제하고 삭제 건수를 반환합니다. Edge cron 전용.';

REVOKE ALL ON FUNCTION public.prune_stale_contests(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.prune_stale_contests(integer) TO service_role;
