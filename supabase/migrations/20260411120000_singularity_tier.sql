-- SINGULARITY 티어 (Lv.201~): LEGEND 구간을 L141~L200으로 한정하고 상위 티어 추가

ALTER TABLE public.level_tiers DROP CONSTRAINT IF EXISTS level_tiers_tier_id_check;
ALTER TABLE public.level_tiers ADD CONSTRAINT level_tiers_tier_id_check CHECK (tier_id >= 1 AND tier_id <= 6);

UPDATE public.level_tiers
SET level_max = 200
WHERE tier_id = 5 AND tier_name = 'LEGEND';

INSERT INTO public.level_tiers (tier_id, tier_name, level_min, level_max, exp_per_level, sort_order)
VALUES (6, 'SINGULARITY', 201, NULL, 200, 6)
ON CONFLICT (tier_id) DO UPDATE SET
  tier_name = EXCLUDED.tier_name,
  level_min = EXCLUDED.level_min,
  level_max = EXCLUDED.level_max,
  exp_per_level = EXCLUDED.exp_per_level,
  sort_order = EXCLUDED.sort_order;

-- L201~L220: SINGULARITY (레벨당 200 EXP), L221: 최대 레벨 캡 (다음 EXP 없음)
INSERT INTO public.level_config (level, exp_to_next, tier_id)
SELECT n, 200, 6 FROM generate_series(201, 220) AS n
ON CONFLICT (level) DO UPDATE SET exp_to_next = EXCLUDED.exp_to_next, tier_id = EXCLUDED.tier_id;

INSERT INTO public.level_config (level, exp_to_next, tier_id)
VALUES (221, 0, 6)
ON CONFLICT (level) DO UPDATE SET exp_to_next = EXCLUDED.exp_to_next, tier_id = EXCLUDED.tier_id;
