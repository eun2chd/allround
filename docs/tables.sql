-- ============================================================
-- Ntpercent 프로젝트 테이블 생성 스크립트
-- 필요한 부분만 복사해서 실행하세요.
-- ============================================================

-- ============================================================
-- 1. Supabase (PostgreSQL) - Dashboard > SQL Editor에서 실행
-- ============================================================

-- 1-1. profiles 테이블 (처음 설치 시)
CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    nickname TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
    profile_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 1-2. profiles에 profile_url 없으면 추가 (이미 테이블 있는 경우)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS profile_url TEXT;

-- 1-3. 수정일 자동 업데이트
CREATE OR REPLACE FUNCTION update_modified_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_profiles_modtime ON profiles;
CREATE TRIGGER update_profiles_modtime
    BEFORE UPDATE ON profiles
    FOR EACH ROW
    EXECUTE PROCEDURE update_modified_column();

-- 1-4. presence (접속 유저 상태, 배포 시 공유)
CREATE TABLE IF NOT EXISTS presence (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID UNIQUE NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    online BOOLEAN NOT NULL DEFAULT true
);
-- 기존 테이블에 online 컬럼 추가 (마이그레이션)
ALTER TABLE presence ADD COLUMN IF NOT EXISTS online BOOLEAN NOT NULL DEFAULT true;
-- RLS: Dashboard > Table Editor > presence > RLS Policies
-- 반드시 추가할 정책 (anon 키로 서버가 접근):
-- 1. SELECT: Policy "Allow select" USING (true)
-- 2. INSERT: Policy "Allow insert" WITH CHECK (true)
-- 3. UPDATE: Policy "Allow update" USING (true) WITH CHECK (true)
-- (없으면 presence는 insert 되지만 select가 막혀서 전부 오프라인으로 보임)

-- ============================================================
-- 2. Supabase Storage - Dashboard > Storage에서 수동 생성
-- ============================================================
-- 버킷명: profile
-- Public bucket: 체크 (이미지 공개 접근)


-- ============================================================
-- 3. 로컬 SQLite (data/contests.db) - contests만, presence는 Supabase
-- ============================================================

CREATE TABLE IF NOT EXISTS contests (
    id TEXT PRIMARY KEY,
    title TEXT,
    d_day TEXT,
    host TEXT,
    url TEXT,
    category TEXT,
    created_at TEXT,
    first_seen_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_created ON contests(created_at DESC);
