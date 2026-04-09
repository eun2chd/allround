-- 타인 마이페이지에서 참가/패스 목록·상세를 볼 수 있도록
-- 기존 본인 전용 SELECT 정책과 OR로 동작하는 읽기 정책 추가.
-- (INSERT/UPDATE/DELETE는 기존 본인 정책 유지)

DROP POLICY IF EXISTS "contest_participation_select_authenticated_profile" ON public.contest_participation;
CREATE POLICY "contest_participation_select_authenticated_profile"
ON public.contest_participation
FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "contest_participation_detail_select_authenticated_profile" ON public.contest_participation_detail;
CREATE POLICY "contest_participation_detail_select_authenticated_profile"
ON public.contest_participation_detail
FOR SELECT
TO authenticated
USING (true);
