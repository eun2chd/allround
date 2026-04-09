-- 공모전 contests: 전역 조회 유지 + 관리자만 UPDATE/DELETE (관리자 UI).
-- 크롤러·서비스 롤은 RLS 우회 가능.

ALTER TABLE public.contests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "contests_select_anon" ON public.contests;
DROP POLICY IF EXISTS "contests_select_authenticated" ON public.contests;
DROP POLICY IF EXISTS "contests_select_all" ON public.contests;
DROP POLICY IF EXISTS "contests_update_admin" ON public.contests;
DROP POLICY IF EXISTS "contests_delete_admin" ON public.contests;

-- 목록/상세: 기존과 같이 앱에서 읽기 허용
CREATE POLICY "contests_select_anon"
  ON public.contests FOR SELECT TO anon
  USING (true);

CREATE POLICY "contests_select_authenticated"
  ON public.contests FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "contests_update_admin"
  ON public.contests FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

CREATE POLICY "contests_delete_admin"
  ON public.contests FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );
