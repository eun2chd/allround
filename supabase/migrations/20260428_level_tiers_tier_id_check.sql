-- 일부 환경에서는 level_tiers가 tier_id 1~5만 허용하는 CHECK로 남아 있어 6번(SINGULARITY) 등록이 실패합니다.
-- 1~6으로 통일합니다 (20260411120000_singularity_tier.sql과 동일).

ALTER TABLE public.level_tiers DROP CONSTRAINT IF EXISTS level_tiers_tier_id_check;
ALTER TABLE public.level_tiers
  ADD CONSTRAINT level_tiers_tier_id_check CHECK (tier_id >= 1 AND tier_id <= 6);
