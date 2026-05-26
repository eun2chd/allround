-- 참가 상세: 수상작 첨부 (제출물과 별도)
ALTER TABLE public.contest_participation_detail
ADD COLUMN IF NOT EXISTS award_work_path TEXT NULL;

ALTER TABLE public.contest_participation_detail
ADD COLUMN IF NOT EXISTS award_work_filename TEXT NULL;

COMMENT ON COLUMN public.contest_participation_detail.award_work_path IS '수상작 파일 저장 경로(URL 또는 storage path)';
COMMENT ON COLUMN public.contest_participation_detail.award_work_filename IS '수상작 원본 파일명';
