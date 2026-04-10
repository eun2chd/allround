-- 관리자 등록 여부는 contests.manual_entry 한 컬럼으로만 구분 (true면 prune 제외)
-- 크롤 upsert 시 manual_entry 키를 넣지 않으면 기존 값이 유지되는 것을 전제로 함

ALTER TABLE public.contests
  ADD COLUMN IF NOT EXISTS manual_entry boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.contests.manual_entry IS
  'true: 관리자 UI 등록. prune_stale_contests에서 삭제하지 않음.';

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
    RETURNING 1
  )
  SELECT count(*)::bigint INTO deleted_count FROM del;

  RETURN COALESCE(deleted_count, 0);
END;
$$;

COMMENT ON FUNCTION public.prune_stale_contests(integer) IS
  'manual_entry가 아닌 행만, updated_at 기준으로 오래된 contests 삭제. Edge cron 전용.';
