-- 관리자: feedback_requests 행 삭제 (목록·상세에서 관리자만 DELETE)

DROP POLICY IF EXISTS "feedback_requests_delete_admin" ON public.feedback_requests;

CREATE POLICY "feedback_requests_delete_admin"
  ON public.feedback_requests FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );
