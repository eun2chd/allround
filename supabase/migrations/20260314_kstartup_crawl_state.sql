-- K-Startup 크롤링 진행 페이지 추적 전용 테이블
-- crawl_state 대신 사용하여 독립적으로 관리

CREATE TABLE IF NOT EXISTS kstartup_crawl_state (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),  -- 항상 1개 row만 유지
  business_next_page INTEGER NOT NULL DEFAULT 1,     -- 통합지원사업 다음 페이지
  announcement_next_page INTEGER NOT NULL DEFAULT 1, -- 지원사업 공고 다음 페이지
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 초기 데이터 삽입 (없을 경우만)
INSERT INTO kstartup_crawl_state (id, business_next_page, announcement_next_page)
VALUES (1, 1, 1)
ON CONFLICT (id) DO NOTHING;

-- RLS 비활성화 (Edge Function이 SERVICE_ROLE_KEY로 접근해야 함)
ALTER TABLE kstartup_crawl_state DISABLE ROW LEVEL SECURITY;
