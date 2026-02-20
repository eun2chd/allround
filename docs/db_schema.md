# DB 스키마 기록

Supabase PostgreSQL 및 로컬 SQLite 테이블을 여기에 기록합니다.
**테이블 생성/변경 시 이 파일을 업데이트**해 주세요.
## Supabase (PostgreSQL)

<!-- 아래에 Supabase에서 생성한 테이블을 추가 -->

-- 1. 유저 테이블 생성 (비밀번호 제거, 권한 및 닉네임 중심)
CREATE TABLE profiles (
    -- Supabase Auth의 ID와 연결 (비밀번호 대신 이 ID로 매칭)
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- 이메일 (데이터 조회 편의상 추가)
    email TEXT UNIQUE NOT NULL,
    
    -- 닉네임
    nickname TEXT NOT NULL,

    -- 권한 (기본값 'member')
    role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
    
    -- 가입일
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- 수정일
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. 수정일 자동 업데이트 함수
CREATE OR REPLACE FUNCTION update_modified_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- 3. 트리거 적용
CREATE TRIGGER update_profiles_modtime
    BEFORE UPDATE ON profiles
    FOR EACH ROW
    EXECUTE PROCEDURE update_modified_column();

-- 4. RLS 정책 (profiles 테이블)
-- 이메일/닉네임 중복체크 API 및 회원가입 시 insert를 위해 필요
-- Supabase Dashboard > Table Editor > profiles > RLS 에서 설정
-- 예: FOR SELECT USING (true);  -- 중복체크용
-- 예: FOR INSERT WITH CHECK (true);  -- 회원가입 시 저장용 (또는 서비스 역할 사용)

-- 참고: password 컬럼 삭제됨 (Supabase Auth에서 비밀번호 관리)
-- profile_url: 프로필 이미지 URL 컬럼 추가됨

-- 5. presence 테이블 (접속 중 상태, 배포 환경 공유용)
CREATE TABLE IF NOT EXISTS presence (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID UNIQUE NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

## 로컬 SQLite (contests.db)
-- contests만 사용. presence는 Supabase에 저장

## Supabase Storage
-- 버킷명: profile (Dashboard > Storage에서 생성, public 권한 권장)
-- 경로: private/{user_id}/avatar.{ext} (정책: foldername[1]='private' 필요)
-- 업로드 시 사용자 JWT 사용 (get_supabase_client_with_auth) - RLS 정책 auth.role()='authenticated' 만족
-- 상세: docs/프로필_이미지_Storage_설정.md
