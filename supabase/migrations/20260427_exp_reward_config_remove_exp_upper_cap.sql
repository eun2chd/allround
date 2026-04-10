-- 보상 밸런스(exp_reward_config.exp_amount) 상한(1,000,000) 제거. 0 이상만 유지.
-- PostgreSQL integer 상한(~21억)은 그대로 적용됩니다.

ALTER TABLE public.exp_reward_config DROP CONSTRAINT IF EXISTS exp_reward_config_exp_amount_check;

ALTER TABLE public.exp_reward_config
  ADD CONSTRAINT exp_reward_config_exp_amount_check CHECK (exp_amount >= 0);
