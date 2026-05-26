-- 참가 상세: 진행중 / 종료 (지원·심사 단계와 별도)
ALTER TABLE public.contest_participation_detail
ADD COLUMN IF NOT EXISTS lifecycle_status TEXT NOT NULL DEFAULT '진행중';

ALTER TABLE public.contest_participation_detail
DROP CONSTRAINT IF EXISTS contest_participation_detail_lifecycle_check;

ALTER TABLE public.contest_participation_detail
ADD CONSTRAINT contest_participation_detail_lifecycle_check
CHECK (lifecycle_status IN ('진행중', '종료'));

COMMENT ON COLUMN public.contest_participation_detail.lifecycle_status IS
  '공모전 참가 진행 여부: 진행중 | 종료 (지원·심사 participation_status 와 별도)';

-- 기존 데이터: 종료로 볼 수 있는 건 백필
UPDATE public.contest_participation_detail
SET lifecycle_status = '종료'
WHERE lifecycle_status = '진행중'
  AND (
    participation_status IN ('수상', '미수상', '취소')
    OR (
      result_announcement_date IS NOT NULL
      AND result_announcement_date < CURRENT_DATE
    )
  );
