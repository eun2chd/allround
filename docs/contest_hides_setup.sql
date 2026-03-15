-- 공모전 숨김 처리 테이블 생성
-- 각 사용자가 개인적으로 공모전을 숨김 처리할 수 있는 기능

CREATE TABLE IF NOT EXISTS contest_hides (
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    source TEXT NOT NULL,
    contest_id TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (user_id, source, contest_id),
    FOREIGN KEY (source, contest_id) REFERENCES contests(source, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_contest_hides_user ON contest_hides(user_id);
CREATE INDEX IF NOT EXISTS idx_contest_hides_contest ON contest_hides(source, contest_id);

-- RLS (Row Level Security) 정책 설정
ALTER TABLE contest_hides ENABLE ROW LEVEL SECURITY;

-- 사용자는 자신의 숨김 처리만 조회/수정 가능
CREATE POLICY "Users can view their own hides"
    ON contest_hides FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own hides"
    ON contest_hides FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own hides"
    ON contest_hides FOR DELETE
    USING (auth.uid() = user_id);
