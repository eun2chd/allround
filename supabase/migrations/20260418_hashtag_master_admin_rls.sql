-- hashtag_master: 로그인 사용자는 목록 조회, 관리자만 등록·수정·삭제

CREATE TABLE IF NOT EXISTS public.hashtag_master (
  id SERIAL PRIMARY KEY,
  tag_name TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_hashtag_master_category ON public.hashtag_master(category);

ALTER TABLE public.hashtag_master ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hashtag_master_select_authenticated" ON public.hashtag_master;
DROP POLICY IF EXISTS "hashtag_master_insert_admin" ON public.hashtag_master;
DROP POLICY IF EXISTS "hashtag_master_update_admin" ON public.hashtag_master;
DROP POLICY IF EXISTS "hashtag_master_delete_admin" ON public.hashtag_master;

CREATE POLICY "hashtag_master_select_authenticated"
  ON public.hashtag_master
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "hashtag_master_insert_admin"
  ON public.hashtag_master
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

CREATE POLICY "hashtag_master_update_admin"
  ON public.hashtag_master
  FOR UPDATE
  TO authenticated
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

CREATE POLICY "hashtag_master_delete_admin"
  ON public.hashtag_master
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );
