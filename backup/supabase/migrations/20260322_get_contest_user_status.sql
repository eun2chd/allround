-- 메인 최적화: 북마크·내용확인·참가패스·댓글 여부를 1회 RPC로 조회
-- 4개 테이블 각각 조회 → 1회 호출로 축소

CREATE INDEX IF NOT EXISTS idx_contest_comments_user ON contest_comments(user_id);

CREATE OR REPLACE FUNCTION get_contest_user_status(p_user_id UUID)
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
  )
  SELECT
    k.source,
    k.contest_id,
    (b.source IS NOT NULL),
    (c.source IS NOT NULL),
    p.status,
    (cm.source IS NOT NULL)
  FROM keys k
  LEFT JOIN contest_bookmarks b
    ON b.user_id = p_user_id AND k.source = b.source AND k.contest_id = b.contest_id
  LEFT JOIN contest_content_checks c
    ON c.user_id = p_user_id AND k.source = c.source AND k.contest_id = c.contest_id
  LEFT JOIN contest_participation p
    ON p.user_id = p_user_id AND k.source = p.source AND k.contest_id = p.contest_id
  LEFT JOIN contest_comments cm
    ON cm.user_id = p_user_id AND k.source = cm.source AND k.contest_id = cm.contest_id;
$$ LANGUAGE sql STABLE;
