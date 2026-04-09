-- 공모전별 팀(리더 1인 기준) + 참가 방식(개인/팀)
CREATE TABLE IF NOT EXISTS public.contest_team (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL,
  contest_id TEXT NOT NULL,
  team_name TEXT NOT NULL,
  leader_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT contest_team_contest_fk FOREIGN KEY (source, contest_id)
    REFERENCES public.contests (source, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_contest_team_contest ON public.contest_team (source, contest_id);
CREATE INDEX IF NOT EXISTS idx_contest_team_leader ON public.contest_team (leader_user_id);

ALTER TABLE public.contest_participation ADD COLUMN IF NOT EXISTS participation_type TEXT;
ALTER TABLE public.contest_participation ADD COLUMN IF NOT EXISTS team_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'contest_participation_team_id_fkey'
  ) THEN
    ALTER TABLE public.contest_participation
      ADD CONSTRAINT contest_participation_team_id_fkey
      FOREIGN KEY (team_id) REFERENCES public.contest_team (id) ON DELETE SET NULL;
  END IF;
END $$;

UPDATE public.contest_participation SET participation_type = 'individual' WHERE participation_type IS NULL;

ALTER TABLE public.contest_participation ALTER COLUMN participation_type SET DEFAULT 'individual';

ALTER TABLE public.contest_participation
  DROP CONSTRAINT IF EXISTS contest_participation_participation_type_check;

ALTER TABLE public.contest_participation
  ADD CONSTRAINT contest_participation_participation_type_check
  CHECK (participation_type IN ('individual', 'team'));

ALTER TABLE public.contest_participation ALTER COLUMN participation_type SET NOT NULL;

ALTER TABLE public.contest_team ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS contest_team_select_authenticated ON public.contest_team;
CREATE POLICY contest_team_select_authenticated ON public.contest_team
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS contest_team_insert_own ON public.contest_team;
CREATE POLICY contest_team_insert_own ON public.contest_team
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = leader_user_id);

DROP POLICY IF EXISTS contest_team_update_own ON public.contest_team;
CREATE POLICY contest_team_update_own ON public.contest_team
  FOR UPDATE TO authenticated USING (auth.uid() = leader_user_id) WITH CHECK (auth.uid() = leader_user_id);

DROP POLICY IF EXISTS contest_team_delete_own ON public.contest_team;
CREATE POLICY contest_team_delete_own ON public.contest_team
  FOR DELETE TO authenticated USING (auth.uid() = leader_user_id);
