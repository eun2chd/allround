-- 공모전 목록 1회 조회: 내 참가/내용확인/즐겨찾기/댓글여부 (auth.uid() 기준)
-- PostgREST에서 contests_list_with_user_state 와 동일 필터·페이지네이션 적용 가능

CREATE INDEX IF NOT EXISTS idx_contest_comments_user_contest
  ON public.contest_comments(user_id, source, contest_id);

CREATE OR REPLACE VIEW public.contests_list_with_user_state AS
SELECT
  c.source,
  c.id,
  c.title,
  c.d_day,
  c.host,
  c.url,
  c.category,
  c.created_at,
  c.updated_at,
  cp.status AS my_participation_status,
  (cc.user_id IS NOT NULL) AS my_content_checked,
  (bm.user_id IS NOT NULL) AS my_bookmarked,
  EXISTS (
    SELECT 1
    FROM public.contest_comments cm
    WHERE cm.user_id = auth.uid()
      AND cm.source = c.source
      AND cm.contest_id = c.id
  ) AS my_has_commented
FROM public.contests c
LEFT JOIN public.contest_participation cp
  ON cp.user_id = auth.uid()
  AND cp.source = c.source
  AND cp.contest_id = c.id
LEFT JOIN public.contest_content_checks cc
  ON cc.user_id = auth.uid()
  AND cc.source = c.source
  AND cc.contest_id = c.id
LEFT JOIN public.contest_bookmarks bm
  ON bm.user_id = auth.uid()
  AND bm.source = c.source
  AND bm.contest_id = c.id;

GRANT SELECT ON public.contests_list_with_user_state TO anon, authenticated;

COMMENT ON VIEW public.contests_list_with_user_state IS
  '공모전 목록 + 현재 세션(auth.uid) 기준 메타; 로그인 시 fetchContestsPage 1번으로 상세 전 fetch 생략';
