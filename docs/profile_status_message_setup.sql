-- 프로필 상태메시지 컬럼 추가
-- profiles 테이블에 status_message 컬럼이 없으면 추가

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS status_message TEXT;

-- 참고: profile_url 컬럼도 함께 추가 (없는 경우)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS profile_url TEXT;
