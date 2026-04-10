-- 상금 정산 상태 (미수령 / 수령 완료 / 팀 회식비 전환)
ALTER TABLE public.contest_participation_detail
ADD COLUMN IF NOT EXISTS prize_settlement_status TEXT NULL;

ALTER TABLE public.contest_participation_detail DROP CONSTRAINT IF EXISTS contest_participation_detail_prize_settlement_check;

ALTER TABLE public.contest_participation_detail
ADD CONSTRAINT contest_participation_detail_prize_settlement_check
CHECK (
  prize_settlement_status IS NULL
  OR prize_settlement_status IN ('미수령', '수령 완료', '팀 회식비 전환')
);

COMMENT ON COLUMN public.contest_participation_detail.prize_settlement_status IS
  '상금이 있는 참가 건의 정산 상태';
