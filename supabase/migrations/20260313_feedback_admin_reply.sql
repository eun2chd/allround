-- 관리자 답변 컬럼 추가
ALTER TABLE feedback_requests ADD COLUMN IF NOT EXISTS admin_reply TEXT;
ALTER TABLE feedback_requests ADD COLUMN IF NOT EXISTS admin_replied_at TIMESTAMPTZ;

COMMENT ON COLUMN feedback_requests.admin_reply IS '관리자 답변 내용';
COMMENT ON COLUMN feedback_requests.admin_replied_at IS '관리자 답변 일시';
