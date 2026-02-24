-- 해시태그 테이블 생성 (Supabase SQL Editor에서 실행)

-- 1. hashtag_master
CREATE TABLE IF NOT EXISTS hashtag_master (
    id SERIAL PRIMARY KEY,
    tag_name TEXT NOT NULL UNIQUE,
    category TEXT NOT NULL,
    sort_order INT NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_hashtag_master_category ON hashtag_master(category);

-- 2. user_hashtags
CREATE TABLE IF NOT EXISTS user_hashtags (
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    hashtag_id INT NOT NULL REFERENCES hashtag_master(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (user_id, hashtag_id)
);

CREATE INDEX IF NOT EXISTS idx_user_hashtags_user ON user_hashtags(user_id);

-- 3. 시드 데이터
INSERT INTO hashtag_master (tag_name, category, sort_order) VALUES
('개발마스터', '기술·개발력 중심', 1),
('풀스택전사', '기술·개발력 중심', 2),
('API연금술사', '기술·개발력 중심', 3),
('버그헌터', '기술·개발력 중심', 4),
('클린코드집착러', '기술·개발력 중심', 5),
('아키텍처설계자', '기술·개발력 중심', 6),
('리팩토링장인', '기술·개발력 중심', 7),
('성능최적화러', '기술·개발력 중심', 8),
('배포요정', '기술·개발력 중심', 9),
('자동화집착러', '기술·개발력 중심', 10),
('문제해결러', '문제해결력', 11),
('기획장인', '문제해결력', 12),
('서비스설계자', '문제해결력', 13),
('아이디어구조화', '문제해결력', 14),
('비즈니스모델러', '문제해결력', 15),
('시장분석러', '문제해결력', 16),
('전략형도전자', '문제해결력', 17),
('실행력갑', '문제해결력', 18),
('프로젝트주도형', '문제해결력', 19),
('데이터기반판단', '문제해결력', 20),
('AI조련사', '데이터 특화', 21),
('AI마스터', '데이터 특화', 22),
('프롬프트엔지니어', '데이터 특화', 23),
('생성형마스터', '데이터 특화', 24),
('데이터연금술', '데이터 특화', 25),
('LLM활용러', '데이터 특화', 26),
('모델튜너', '데이터 특화', 27),
('AI서비스빌더', '데이터 특화', 28),
('제미나이괴롭히기5000만번', '데이터 특화', 29),
('GPT풀가동', '데이터 특화', 30),
('아이디어폭격기', '창의성', 31),
('창의력장착', '창의성', 32),
('혁신빌더', '창의성', 33),
('트렌드캐처', '창의성', 34),
('상상력실행가', '창의성', 35),
('MVP제조기', '창의성', 36),
('프로토타입러', '창의성', 37),
('기획부터출시까지', '창의성', 38),
('밤샘코딩러', '밈', 39),
('마감전투사', '밈', 40),
('해커톤생존자', '밈', 41),
('버그와의전쟁', '밈', 42),
('기술로말함', '밈', 43),
('결과로증명', '밈', 44),
('AI랑친함', '밈', 45),
('코드가취미', '밈', 46)
ON CONFLICT (tag_name) DO NOTHING;
