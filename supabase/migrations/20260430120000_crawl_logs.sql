-- 하루 1회 크롤 작업 실행 여부·성공/실패 (GitHub Actions 등)
-- job_name + run_date 로 당일 중복 성공 방지, 실패 시 같은 날 재시도 시 upsert 로 갱신

CREATE TABLE IF NOT EXISTS public.crawl_logs (
  id BIGSERIAL PRIMARY KEY,
  job_name TEXT NOT NULL,
  run_date DATE NOT NULL,
  status TEXT NOT NULL,
  message TEXT,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  UNIQUE (job_name, run_date)
);

COMMENT ON TABLE public.crawl_logs IS
  '크롤 작업 일별 로그 (contest_crawl, kstartup_crawl 등). (job_name, run_date) 유일.';

ALTER TABLE public.crawl_logs DISABLE ROW LEVEL SECURITY;
