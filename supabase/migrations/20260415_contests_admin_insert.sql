-- 관리자 UI: contests 수동 등록(INSERT)

DROP POLICY IF EXISTS "contests_insert_admin" ON public.contests;

CREATE POLICY "contests_insert_admin"
  ON public.contests FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );
