-- get_contest_user_status: p_contest_keys 비교 시 source NULL/빈 문자열을 프론트·contestKey 기본 출처와 동일하게 취급
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
    WHERE p_contest_keys IS NULL OR (
      COALESCE(NULLIF(TRIM(COALESCE(k.source, '')), ''), '요즘것들') || ':' || TRIM(COALESCE(k.contest_id::text, ''))
    ) = ANY(p_contest_keys)
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
    ON b.user_id = p_user_id AND k.source IS NOT DISTINCT FROM b.source AND k.contest_id IS NOT DISTINCT FROM b.contest_id
  LEFT JOIN contest_content_checks c
    ON c.user_id = p_user_id AND k.source IS NOT DISTINCT FROM c.source AND k.contest_id IS NOT DISTINCT FROM c.contest_id
  LEFT JOIN contest_participation p
    ON p.user_id = p_user_id AND k.source IS NOT DISTINCT FROM p.source AND k.contest_id IS NOT DISTINCT FROM p.contest_id
  LEFT JOIN contest_comments cm
    ON cm.user_id = p_user_id AND k.source IS NOT DISTINCT FROM cm.source AND k.contest_id IS NOT DISTINCT FROM cm.contest_id;
$$ LANGUAGE sql STABLE;
