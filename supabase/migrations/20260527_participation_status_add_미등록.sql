-- 지원·심사 단계에 '미등록' 추가
ALTER TABLE public.contest_participation_detail
DROP CONSTRAINT IF EXISTS contest_participation_detail_participation_status_check;

ALTER TABLE public.contest_participation_detail
ADD CONSTRAINT contest_participation_detail_participation_status_check
CHECK (participation_status IN ('미등록', '지원완료', '심사중', '본선진출', '수상', '미수상', '취소'));
