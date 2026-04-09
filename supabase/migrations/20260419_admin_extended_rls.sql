-- 레벨/티어, 창업 허브, 댓글 모더레이션, 대표작품(관리자 삭제), K-Startup 크롤 상태 관리자용 RLS 보강

-- ── level_tiers / level_config ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.level_tiers (
  tier_id SMALLINT PRIMARY KEY CHECK (tier_id BETWEEN 1 AND 5),
  tier_name TEXT NOT NULL UNIQUE,
  level_min INTEGER NOT NULL,
  level_max INTEGER,
  exp_per_level INTEGER NOT NULL,
  sort_order SMALLINT NOT NULL DEFAULT 0
);

INSERT INTO public.level_tiers (tier_id, tier_name, level_min, level_max, exp_per_level, sort_order) VALUES
(1, 'BRONZE', 1, 20, 25, 1),
(2, 'SILVER', 21, 70, 40, 2),
(3, 'GOLD', 71, 120, 60, 3),
(4, 'PLATINUM', 121, 140, 100, 4),
(5, 'LEGEND', 141, NULL, 150, 5)
ON CONFLICT (tier_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.level_config (
  level INTEGER PRIMARY KEY CHECK (level >= 1),
  exp_to_next INTEGER NOT NULL,
  tier_id SMALLINT NOT NULL REFERENCES public.level_tiers(tier_id)
);

CREATE INDEX IF NOT EXISTS idx_level_config_tier ON public.level_config(tier_id);

ALTER TABLE public.level_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.level_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "level_tiers_select_all" ON public.level_tiers;
DROP POLICY IF EXISTS "level_tiers_insert_admin" ON public.level_tiers;
DROP POLICY IF EXISTS "level_tiers_update_admin" ON public.level_tiers;
DROP POLICY IF EXISTS "level_tiers_delete_admin" ON public.level_tiers;

CREATE POLICY "level_tiers_select_all" ON public.level_tiers FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "level_tiers_insert_admin" ON public.level_tiers FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));
CREATE POLICY "level_tiers_update_admin" ON public.level_tiers FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));
CREATE POLICY "level_tiers_delete_admin" ON public.level_tiers FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

DROP POLICY IF EXISTS "level_config_select_all" ON public.level_config;
DROP POLICY IF EXISTS "level_config_insert_admin" ON public.level_config;
DROP POLICY IF EXISTS "level_config_update_admin" ON public.level_config;
DROP POLICY IF EXISTS "level_config_delete_admin" ON public.level_config;

CREATE POLICY "level_config_select_all" ON public.level_config FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "level_config_insert_admin" ON public.level_config FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));
CREATE POLICY "level_config_update_admin" ON public.level_config FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));
CREATE POLICY "level_config_delete_admin" ON public.level_config FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- ── contest_comments (공모전 댓글) ────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'contest_comments'
  ) THEN
    ALTER TABLE public.contest_comments ENABLE ROW LEVEL SECURITY;
    EXECUTE 'DROP POLICY IF EXISTS "contest_comments_select_all" ON public.contest_comments';
    EXECUTE 'DROP POLICY IF EXISTS "contest_comments_insert_own" ON public.contest_comments';
    EXECUTE 'DROP POLICY IF EXISTS "contest_comments_update_own" ON public.contest_comments';
    EXECUTE 'DROP POLICY IF EXISTS "contest_comments_delete_own" ON public.contest_comments';
    EXECUTE 'DROP POLICY IF EXISTS "contest_comments_delete_admin" ON public.contest_comments';
    EXECUTE 'CREATE POLICY "contest_comments_select_all" ON public.contest_comments FOR SELECT TO anon, authenticated USING (true)';
    EXECUTE 'CREATE POLICY "contest_comments_insert_own" ON public.contest_comments FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id)';
    EXECUTE 'CREATE POLICY "contest_comments_update_own" ON public.contest_comments FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)';
    EXECUTE 'CREATE POLICY "contest_comments_delete_own" ON public.contest_comments FOR DELETE TO authenticated USING (auth.uid() = user_id)';
    EXECUTE 'CREATE POLICY "contest_comments_delete_admin" ON public.contest_comments FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = ''admin''))';
  END IF;
END $$;

-- ── startup_comments (창업 댓글) ─────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'startup_comments'
  ) THEN
    ALTER TABLE public.startup_comments ENABLE ROW LEVEL SECURITY;
    EXECUTE 'DROP POLICY IF EXISTS "startup_comments_select_all" ON public.startup_comments';
    EXECUTE 'DROP POLICY IF EXISTS "startup_comments_insert_own" ON public.startup_comments';
    EXECUTE 'DROP POLICY IF EXISTS "startup_comments_delete_own" ON public.startup_comments';
    EXECUTE 'DROP POLICY IF EXISTS "startup_comments_delete_admin" ON public.startup_comments';
    EXECUTE 'CREATE POLICY "startup_comments_select_all" ON public.startup_comments FOR SELECT TO anon, authenticated USING (true)';
    EXECUTE 'CREATE POLICY "startup_comments_insert_own" ON public.startup_comments FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id)';
    EXECUTE 'CREATE POLICY "startup_comments_delete_own" ON public.startup_comments FOR DELETE TO authenticated USING (auth.uid() = user_id)';
    EXECUTE 'CREATE POLICY "startup_comments_delete_admin" ON public.startup_comments FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = ''admin''))';
  END IF;
END $$;

-- ── startup_business / startup_announcement (창업 허브) ──────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'startup_business'
  ) THEN
    ALTER TABLE public.startup_business ENABLE ROW LEVEL SECURITY;
    EXECUTE 'DROP POLICY IF EXISTS "startup_business_select_auth" ON public.startup_business';
    EXECUTE 'DROP POLICY IF EXISTS "startup_business_insert_admin" ON public.startup_business';
    EXECUTE 'DROP POLICY IF EXISTS "startup_business_update_admin" ON public.startup_business';
    EXECUTE 'DROP POLICY IF EXISTS "startup_business_delete_admin" ON public.startup_business';
    EXECUTE 'CREATE POLICY "startup_business_select_auth" ON public.startup_business FOR SELECT TO authenticated USING (true)';
    EXECUTE 'CREATE POLICY "startup_business_insert_admin" ON public.startup_business FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = ''admin''))';
    EXECUTE 'CREATE POLICY "startup_business_update_admin" ON public.startup_business FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = ''admin'')) WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = ''admin''))';
    EXECUTE 'CREATE POLICY "startup_business_delete_admin" ON public.startup_business FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = ''admin''))';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'startup_announcement'
  ) THEN
    ALTER TABLE public.startup_announcement ENABLE ROW LEVEL SECURITY;
    EXECUTE 'DROP POLICY IF EXISTS "startup_announcement_select_auth" ON public.startup_announcement';
    EXECUTE 'DROP POLICY IF EXISTS "startup_announcement_insert_admin" ON public.startup_announcement';
    EXECUTE 'DROP POLICY IF EXISTS "startup_announcement_update_admin" ON public.startup_announcement';
    EXECUTE 'DROP POLICY IF EXISTS "startup_announcement_delete_admin" ON public.startup_announcement';
    EXECUTE 'CREATE POLICY "startup_announcement_select_auth" ON public.startup_announcement FOR SELECT TO authenticated USING (true)';
    EXECUTE 'CREATE POLICY "startup_announcement_insert_admin" ON public.startup_announcement FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = ''admin''))';
    EXECUTE 'CREATE POLICY "startup_announcement_update_admin" ON public.startup_announcement FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = ''admin'')) WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = ''admin''))';
    EXECUTE 'CREATE POLICY "startup_announcement_delete_admin" ON public.startup_announcement FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = ''admin''))';
  END IF;
END $$;

-- ── user_representative_works (기존 정책 + 관리자 삭제) ─────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'user_representative_works'
  ) THEN
    ALTER TABLE public.user_representative_works ENABLE ROW LEVEL SECURITY;
    EXECUTE 'DROP POLICY IF EXISTS "user_representative_works_insert" ON public.user_representative_works';
    EXECUTE 'DROP POLICY IF EXISTS "user_representative_works_select" ON public.user_representative_works';
    EXECUTE 'DROP POLICY IF EXISTS "user_representative_works_update" ON public.user_representative_works';
    EXECUTE 'DROP POLICY IF EXISTS "user_representative_works_delete" ON public.user_representative_works';
    EXECUTE 'DROP POLICY IF EXISTS "user_representative_works_delete_admin" ON public.user_representative_works';
    EXECUTE 'CREATE POLICY "user_representative_works_insert" ON public.user_representative_works FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id)';
    EXECUTE 'CREATE POLICY "user_representative_works_select" ON public.user_representative_works FOR SELECT TO anon, authenticated USING (true)';
    EXECUTE 'CREATE POLICY "user_representative_works_update" ON public.user_representative_works FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)';
    EXECUTE 'CREATE POLICY "user_representative_works_delete" ON public.user_representative_works FOR DELETE TO authenticated USING (auth.uid() = user_id)';
    EXECUTE 'CREATE POLICY "user_representative_works_delete_admin" ON public.user_representative_works FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = ''admin''))';
  END IF;
END $$;

-- ── kstartup_crawl_state (관리자만 읽기/쓰기; 서비스 롤은 RLS 우회) ─────────
CREATE TABLE IF NOT EXISTS public.kstartup_crawl_state (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  business_next_page INTEGER NOT NULL DEFAULT 1,
  announcement_next_page INTEGER NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.kstartup_crawl_state (id, business_next_page, announcement_next_page)
VALUES (1, 1, 1)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.kstartup_crawl_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "kstartup_crawl_state_select_admin" ON public.kstartup_crawl_state;
DROP POLICY IF EXISTS "kstartup_crawl_state_insert_admin" ON public.kstartup_crawl_state;
DROP POLICY IF EXISTS "kstartup_crawl_state_update_admin" ON public.kstartup_crawl_state;

CREATE POLICY "kstartup_crawl_state_select_admin" ON public.kstartup_crawl_state
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

CREATE POLICY "kstartup_crawl_state_insert_admin" ON public.kstartup_crawl_state
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
    AND id = 1
  );

CREATE POLICY "kstartup_crawl_state_update_admin" ON public.kstartup_crawl_state
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));
