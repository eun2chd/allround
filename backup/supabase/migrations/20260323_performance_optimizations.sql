-- 성능 최적화: contest-meta ids 제한, filters DISTINCT
-- 1) get_contest_user_status: 선택적 contest keys 필터 (리스트용 최소 데이터)
-- 2) get_contest_filter_options: DISTINCT 카테고리/출처 (limit=500 제거)

-- 1. contest-meta: p_contest_keys TEXT[] 추가 (NULL이면 전체, 있으면 해당 키만)
CREATE OR REPLACE FUNCTION get_contest_user_status(p_user_id UUID, p_contest_keys TEXT[] DEFAULT NULL)
RETURNS TABLE(
  source TEXT,
  contest_id TEXT,
  is_bookmarked BOOLEAN,
  is_content_checked BOOLEAN,
  participation_status TEXT,
  has_commented BOOLEAN
) AS $$
  WITH keys AS (
    SELECT cb.source, cb.contest_id FROM contest_bookmarks cb WHERE cb.user_id = p_user_id
    UNION
    SELECT ccc.source, ccc.contest_id FROM contest_content_checks ccc WHERE ccc.user_id = p_user_id
    UNION
    SELECT cp.source, cp.contest_id FROM contest_participation cp WHERE cp.user_id = p_user_id
    UNION
    SELECT cc.source, cc.contest_id FROM contest_comments cc WHERE cc.user_id = p_user_id
  ),
  filtered_keys AS (
    SELECT k.source, k.contest_id
    FROM keys k
    WHERE p_contest_keys IS NULL OR (k.source || ':' || k.contest_id) = ANY(p_contest_keys)
  )
  SELECT
    k.source,
    k.contest_id,
    (b.source IS NOT NULL),
    (c.source IS NOT NULL),
    p.status,
    (cm.source IS NOT NULL)
  FROM filtered_keys k
  LEFT JOIN contest_bookmarks b
    ON b.user_id = p_user_id AND k.source = b.source AND k.contest_id = b.contest_id
  LEFT JOIN contest_content_checks c
    ON c.user_id = p_user_id AND k.source = c.source AND k.contest_id = c.contest_id
  LEFT JOIN contest_participation p
    ON p.user_id = p_user_id AND k.source = p.source AND k.contest_id = p.contest_id
  LEFT JOIN contest_comments cm
    ON cm.user_id = p_user_id AND k.source = cm.source AND k.contest_id = cm.contest_id;
$$ LANGUAGE sql STABLE;

-- 2. filters: DISTINCT로 전체 카테고리/출처 조회 (데이터량 최소화)
CREATE OR REPLACE FUNCTION get_contest_filter_options()
RETURNS JSONB AS $$
  SELECT jsonb_build_object(
    'categories', (SELECT COALESCE(jsonb_agg(c ORDER BY c), '[]'::jsonb)
      FROM (SELECT DISTINCT category AS c FROM contests WHERE (category IS NOT NULL AND category != '')) sub),
    'sources', (SELECT COALESCE(jsonb_agg(s ORDER BY s), '[]'::jsonb)
      FROM (SELECT DISTINCT source AS s FROM contests WHERE (source IS NOT NULL AND source != '')) sub)
  );
$$ LANGUAGE sql STABLE;
