-- 즐겨찾기 폴더 (Flask bookmarks.html / app.py 와 동일 스키마, docs/db_schema.md 기준)

CREATE TABLE IF NOT EXISTS public.bookmark_folders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES public.bookmark_folders(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bookmark_folders_user ON public.bookmark_folders(user_id);
CREATE INDEX IF NOT EXISTS idx_bookmark_folders_parent ON public.bookmark_folders(parent_id);

ALTER TABLE public.contest_bookmarks
  ADD COLUMN IF NOT EXISTS folder_id UUID REFERENCES public.bookmark_folders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_contest_bookmarks_folder ON public.contest_bookmarks(folder_id);

ALTER TABLE public.bookmark_folders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bookmark_folders_select_own ON public.bookmark_folders;
CREATE POLICY bookmark_folders_select_own ON public.bookmark_folders
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS bookmark_folders_insert_own ON public.bookmark_folders;
CREATE POLICY bookmark_folders_insert_own ON public.bookmark_folders
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS bookmark_folders_update_own ON public.bookmark_folders;
CREATE POLICY bookmark_folders_update_own ON public.bookmark_folders
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS bookmark_folders_delete_own ON public.bookmark_folders;
CREATE POLICY bookmark_folders_delete_own ON public.bookmark_folders
  FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) = user_id);
