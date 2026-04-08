-- 행위별 경험치 보상을 DB에서 덮어쓸 수 있게 함 (미적용 시 코드 기본값 사용).
-- 관리자 화면에서 수정 → exp_reward_config 반영 후 클라이언트 캐시 무효화.

CREATE TABLE IF NOT EXISTS public.exp_reward_config (
  activity_type text PRIMARY KEY,
  exp_amount integer NOT NULL CHECK (exp_amount >= 0 AND exp_amount <= 1000000),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.exp_reward_config IS '행위별 EXP 지급량 오버라이드. 없으면 앱 코드(expRewardsConfig) 기본값.';

ALTER TABLE public.exp_reward_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "exp_reward_config_select_authenticated"
  ON public.exp_reward_config
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "exp_reward_config_insert_admin"
  ON public.exp_reward_config
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

CREATE POLICY "exp_reward_config_update_admin"
  ON public.exp_reward_config
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

CREATE POLICY "exp_reward_config_delete_admin"
  ON public.exp_reward_config
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

-- 관리자 수동 지급/차감(감사 추적용). 음수 exp_amount로 차감 기록 가능.
ALTER TABLE public.exp_events DROP CONSTRAINT IF EXISTS exp_events_activity_type_check;
ALTER TABLE public.exp_events ADD CONSTRAINT exp_events_activity_type_check CHECK (
  activity_type = ANY (
    ARRAY[
      'content_check',
      'participate',
      'pass',
      'support_complete',
      'finalist',
      'award',
      'admin_grant'
    ]::text[]
  )
);
