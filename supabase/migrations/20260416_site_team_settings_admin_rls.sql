-- site_team_settings: 전역 조회 유지 + 관리자만 INSERT/UPDATE/DELETE

ALTER TABLE public.site_team_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "site_team_settings_select_anon" ON public.site_team_settings;
DROP POLICY IF EXISTS "site_team_settings_select_authenticated" ON public.site_team_settings;
DROP POLICY IF EXISTS "site_team_settings_insert_admin" ON public.site_team_settings;
DROP POLICY IF EXISTS "site_team_settings_update_admin" ON public.site_team_settings;
DROP POLICY IF EXISTS "site_team_settings_delete_admin" ON public.site_team_settings;

CREATE POLICY "site_team_settings_select_anon"
  ON public.site_team_settings FOR SELECT TO anon
  USING (true);

CREATE POLICY "site_team_settings_select_authenticated"
  ON public.site_team_settings FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "site_team_settings_insert_admin"
  ON public.site_team_settings FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

CREATE POLICY "site_team_settings_update_admin"
  ON public.site_team_settings FOR UPDATE TO authenticated
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

CREATE POLICY "site_team_settings_delete_admin"
  ON public.site_team_settings FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );
