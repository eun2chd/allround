-- EXP 금액 컬럼을 bigint(int8)로 통일.
-- PostgreSQL의 integer = int4(최대 ~21억). 1111111111111111 같은 값은 int4 범위를 벗어납니다.
-- bigint = int8(약 ±9e18)까지 저장 가능합니다.

ALTER TABLE public.exp_events
  ALTER COLUMN exp_amount TYPE bigint USING exp_amount::bigint;

ALTER TABLE public.exp_reward_config
  ALTER COLUMN exp_amount TYPE bigint USING exp_amount::bigint;

ALTER TABLE public.level_config
  ALTER COLUMN exp_to_next TYPE bigint USING exp_to_next::bigint;
