-- crawl_state: 위비티 1페이지씩 순차 크롤 시 사용
CREATE TABLE IF NOT EXISTS crawl_state (
  source TEXT PRIMARY KEY,
  next_page INTEGER NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
