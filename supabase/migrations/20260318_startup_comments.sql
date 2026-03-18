-- 창업(통합지원사업/지원사업 공고) 댓글 테이블
-- 내용확인 시 "내용 확인 완료" 자동 댓글 저장용
CREATE TABLE IF NOT EXISTS startup_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    item_type TEXT NOT NULL CHECK (item_type IN ('business', 'announcement')),
    item_id TEXT NOT NULL,
    body TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_startup_comments_item ON startup_comments(item_type, item_id);
CREATE INDEX IF NOT EXISTS idx_startup_comments_user ON startup_comments(user_id);
