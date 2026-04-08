-- 홈 공모전 필터: RPC가 클라이언트에서 호출 가능해야 하고,
-- Flask api/contests/filters 와 같이 RLS와 무관하게 전체 contests 기준 DISTINCT 를 쓰려면 SECURITY DEFINER 필요.

CREATE OR REPLACE FUNCTION public.get_contest_filter_options()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'categories', (SELECT COALESCE(jsonb_agg(c ORDER BY c), '[]'::jsonb)
      FROM (SELECT DISTINCT category AS c FROM public.contests WHERE (category IS NOT NULL AND btrim(category) <> '')) sub),
    'sources', (SELECT COALESCE(jsonb_agg(s ORDER BY s), '[]'::jsonb)
      FROM (SELECT DISTINCT source AS s FROM public.contests WHERE (source IS NOT NULL AND btrim(source) <> '')) sub)
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_contest_filter_options() TO anon, authenticated;
