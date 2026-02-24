# DB 스키마 기록

Supabase PostgreSQL 및 로컬 SQLite 테이블을 여기에 기록합니다.
**테이블 생성/변경 시 이 파일을 업데이트**해 주세요.

Supabase SQL Editor에서 섹션별로 복사하여 실행합니다.

---

## Supabase (PostgreSQL)

### 1. profiles (유저 테이블)

```sql
CREATE TABLE profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    nickname TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION update_modified_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_profiles_modtime
    BEFORE UPDATE ON profiles
    FOR EACH ROW
    EXECUTE PROCEDURE update_modified_column();
```

- profile_url, status_message 등 추가 컬럼은 필요 시 ALTER

**레벨/티어 컬럼 추가 (마이페이지 성장 시스템)**:
```sql
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS level INTEGER NOT NULL DEFAULT 1;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS total_exp BIGINT NOT NULL DEFAULT 0;
```

- `level`: 현재 레벨 (1~200, level_config 기준)
- `total_exp`: 누적 획득 경험치. 레벨은 `total_exp`와 `level_config`로 산출 가능 (캐시용으로 level 저장)

---

### 2. level_tiers (티어 메타데이터)

레벨 구간별 티어 정의. tier.jpg 스프라이트와 1:1 매핑.

```sql
CREATE TABLE IF NOT EXISTS level_tiers (
    tier_id SMALLINT PRIMARY KEY CHECK (tier_id BETWEEN 1 AND 5),
    tier_name TEXT NOT NULL UNIQUE,
    level_min INTEGER NOT NULL,
    level_max INTEGER,                    -- NULL = 무제한 (LEGEND)
    exp_per_level INTEGER NOT NULL,       -- 이 구간 레벨업당 필요 EXP
    sort_order SMALLINT NOT NULL DEFAULT 0
);

INSERT INTO level_tiers (tier_id, tier_name, level_min, level_max, exp_per_level, sort_order) VALUES
(1, 'BRONZE',  1,   20,  25, 1),
(2, 'SILVER',  21,  70,  40, 2),
(3, 'GOLD',    71,  120, 60, 3),
(4, 'PLATINUM', 121, 140, 100, 4),
(5, 'LEGEND',  141, NULL, 150, 5)
ON CONFLICT (tier_id) DO UPDATE SET
    tier_name = EXCLUDED.tier_name,
    level_min = EXCLUDED.level_min,
    level_max = EXCLUDED.level_max,
    exp_per_level = EXCLUDED.exp_per_level,
    sort_order = EXCLUDED.sort_order;
```

| tier_id | tier_name | level_min | level_max | exp_per_level |
|---------|-----------|-----------|-----------|---------------|
| 1 | BRONZE | 1 | 20 | 25 |
| 2 | SILVER | 21 | 70 | 40 |
| 3 | GOLD | 71 | 120 | 60 |
| 4 | PLATINUM | 121 | 140 | 100 |
| 5 | LEGEND | 141 | NULL | 150 |

---

### 3. level_config (레벨별 필요 경험치)

각 레벨에서 다음 레벨로 올라가기 위한 EXP. `total_exp`와 비교해 현재 레벨/진행률 계산에 사용.

```sql
CREATE TABLE IF NOT EXISTS level_config (
    level INTEGER PRIMARY KEY CHECK (level >= 1),
    exp_to_next INTEGER NOT NULL,         -- 이 레벨 → 다음 레벨所需 EXP
    tier_id SMALLINT NOT NULL REFERENCES level_tiers(tier_id)
);

CREATE INDEX IF NOT EXISTS idx_level_config_tier ON level_config(tier_id);
```

**경험치 설계 (티어별 고정)**:

- **L1~20 (BRONZE)**: 레벨당 25 EXP → L1→2: 25, … L20→21: 25  
  - 1~20 구간 누적: 500 EXP
- **L21~70 (SILVER)**: 레벨당 40 EXP  
  - 21~70 구간 누적: 2,000 EXP → L71 도달 누적: 2,500
- **L71~120 (GOLD)**: 레벨당 60 EXP  
  - 누적: 3,000 → L121 도달 누적: 5,500
- **L121~140 (PLATINUM)**: 레벨당 100 EXP  
  - 누적: 2,000 → L141 도달 누적: 7,500
- **L141~** (LEGEND): 레벨당 150 EXP (최대 L200까지 정의)

**level_config 시드 데이터** (SQL로 생성):

```sql
-- Bronze L1~20 (25 exp/level)
INSERT INTO level_config (level, exp_to_next, tier_id)
SELECT n, 25, 1 FROM generate_series(1, 19) n
ON CONFLICT (level) DO NOTHING;

INSERT INTO level_config (level, exp_to_next, tier_id) VALUES (20, 25, 1)
ON CONFLICT (level) DO NOTHING;

-- Silver L21~70 (40 exp/level)
INSERT INTO level_config (level, exp_to_next, tier_id)
SELECT n, 40, 2 FROM generate_series(21, 69) n
ON CONFLICT (level) DO NOTHING;
INSERT INTO level_config (level, exp_to_next, tier_id) VALUES (70, 40, 2)
ON CONFLICT (level) DO NOTHING;

-- Gold L71~120 (60 exp/level)
INSERT INTO level_config (level, exp_to_next, tier_id)
SELECT n, 60, 3 FROM generate_series(71, 119) n
ON CONFLICT (level) DO NOTHING;
INSERT INTO level_config (level, exp_to_next, tier_id) VALUES (120, 60, 3)
ON CONFLICT (level) DO NOTHING
-- Platinum L121~140 (100 exp/level)
INSERT INTO level_config (level, exp_to_next, tier_id)
SELECT n, 100, 4 FROM generate_series(121, 139) n
ON CONFLICT (level) DO NOTHING;
INSERT INTO level_config (level, exp_to_next, tier_id) VALUES (140, 100, 4)
ON CONFLICT (level) DO NOTHING;

-- Legend L141~200 (150 exp/level)
INSERT INTO level_config (level, exp_to_next, tier_id)
SELECT n, 150, 5 FROM generate_series(141, 199) n
ON CONFLICT (level) DO NOTHING;
INSERT INTO level_config (level, exp_to_next, tier_id) VALUES (200, 150, 5)
ON CONFLICT (level) DO NOTHING;
```

**레벨/EXP 계산 로직**:

- `exp_cumulative(L)` = L레벨 도달에 필요한 누적 EXP = Σ exp_to_next(1) ~ exp_to_next(L-1)
- 사용자 `total_exp`가 주어지면: `level = MAX(L) WHERE exp_cumulative(L) <= total_exp`
- 현재 레벨 진행률:
  - `exp_current = total_exp - exp_cumulative(level)`
  - `exp_next = exp_to_next(level)` (= level_config에서 조회)
  - `exp_percent = (exp_current / exp_next) * 100`

**레벨 구간별 누적 EXP 요약**:

| 구간 | 레벨 | 티어 | 레벨당 EXP | 구간 누적 | 해당 레벨 도달 누적 |
|------|------|------|------------|-----------|---------------------|
| 1 | 1~20 | BRONZE | 25 | 500 | L21: 500 |
| 2 | 21~70 | SILVER | 40 | 2,000 | L71: 2,500 |
| 3 | 71~120 | GOLD | 60 | 3,000 | L121: 5,500 |
| 4 | 121~140 | PLATINUM | 100 | 2,000 | L141: 7,500 |
| 5 | 141~ | LEGEND | 150 | - | L200: 22,500 |

- L1 도달;
: 0 EXP (시작)
- L2 도달: 25, L3: 50, … L21: 500
- L71 도달: 2,500, L121: 5,500, L141: 7,500

**경험치 획득**: 공모전 참가·수상·댓글 등 액션별 규칙은 추후 정의. `profiles.total_exp`는 API/트리거로 증가시키고, 레벨은 `total_exp`와 `level_config`로 산출.

---

### 4. hashtag_master (해시태그 목록)

해시태그와 카테고리. 골드 이상 유저가 프로필에 추가할 수 있음.

```sql
CREATE TABLE IF NOT EXISTS hashtag_master (
    id SERIAL PRIMARY KEY,
    tag_name TEXT NOT NULL UNIQUE,
    category TEXT NOT NULL,
    sort_order INT NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_hashtag_master_category ON hashtag_master(category);
```

### 5. user_hashtags (유저별 선택 해시태그)

```sql
CREATE TABLE IF NOT EXISTS user_hashtags (
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    hashtag_id INT NOT NULL REFERENCES hashtag_master(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (user_id, hashtag_id)
);

CREATE INDEX IF NOT EXISTS idx_user_hashtags_user ON user_hashtags(user_id);
```

**해시태그 시드 데이터**:

```sql
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
```

- 골드 등급(Lv.71) 이상만 프로필에 해시태그 추가 가능
- 티어별 추가 제한: 골드 5개, 플래티넘 10개, 레전드 15개
- 자동추가 조건 없음, 유저가 목록에서 선택

---

### 6. presence (접속 상태)

```sql
CREATE TABLE IF NOT EXISTS presence (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID UNIQUE NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    online BOOLEAN DEFAULT true
);
```

---

### 7. contests (공모전 리스트)

30분마다 크롤링 → Edge Function → upsert. 리스트만 저장, 본문은 on-demand.
프론트엔드: /api/contests 조회 + Realtime 구독(변경 시 자동 갱신).

```sql
CREATE TABLE IF NOT EXISTS contests (
    source TEXT NOT NULL,           -- 출처 ('요즘것들', 'wavity' 등)
    id TEXT NOT NULL,               -- 출처별 게시글 ID
    title TEXT,
    d_day TEXT,
    host TEXT,
    url TEXT,
    category TEXT DEFAULT 'NULL',
    created_at TIMESTAMPTZ,
    first_seen_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    PRIMARY KEY (source, id)

);

CREATE INDEX IF NOT EXISTS idx_contests_created ON contests(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_contests_source ON contests(source);
```

**Realtime 구독 사용 시**: INSERT/UPDATE/DELETE 감지를 위해 `contests`가 publication에 있어야 합니다.
- 대시보드: **Database** → **Replication** → Tables에서 `contests` ON 확인
- 아직 없다면: `ALTER PUBLICATION supabase_realtime ADD TABLE contests;`
- `relation "contests" is already member of publication` 오류 시 → 이미 등록된 상태 (정상)

---

### 8. contest_comments (댓글)

공모전당 댓글 (대댓글 없음)

```sql
CREATE TABLE IF NOT EXISTS contest_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    source TEXT NOT NULL,
    contest_id TEXT NOT NULL,
    body TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    FOREIGN KEY (source, contest_id) REFERENCES contests(source, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_contest_comments_contest ON contest_comments(source, contest_id);
```

---

### 9. bookmark_folders (북마크 폴더 - 최대 2단계)

```sql
CREATE TABLE IF NOT EXISTS bookmark_folders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    parent_id UUID REFERENCES bookmark_folders(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    sort_order INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_bookmark_folders_user ON bookmark_folders(user_id);
CREATE INDEX IF NOT EXISTS idx_bookmark_folders_parent ON bookmark_folders(parent_id);
```

- parent_id = null: 1단계 폴더
- parent_id = 1단계 폴더 id: 2단계 폴더 (더 깊은 단계 금지)

---

### 10. contest_bookmarks (즐겨찾기/북마크)

```sql
CREATE TABLE IF NOT EXISTS contest_bookmarks (
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    source TEXT NOT NULL,
    contest_id TEXT NOT NULL,
    folder_id UUID REFERENCES bookmark_folders(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (user_id, source, contest_id),
    FOREIGN KEY (source, contest_id) REFERENCES contests(source, id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_contest_bookmarks_user ON contest_bookmarks(user_id);
CREATE INDEX IF NOT EXISTS idx_contest_bookmarks_folder ON contest_bookmarks(folder_id);
```

- folder_id = null: 미분류
- 기존 테이블에 컬럼 추가: `ALTER TABLE contest_bookmarks ADD COLUMN IF NOT EXISTS folder_id UUID REFERENCES bookmark_folders(id) ON DELETE SET NULL;`

---

### 11. contest_content_checks (내용확인)

내용확인 버튼 클릭 시 기록. 참가/패스 버튼은 내용확인 후에만 활성화.

```sql
CREATE TABLE IF NOT EXISTS contest_content_checks (
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    source TEXT NOT NULL,
    contest_id TEXT NOT NULL,
    checked_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (user_id, source, contest_id),
    FOREIGN KEY (source, contest_id) REFERENCES contests(source, id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_contest_content_checks_user ON contest_content_checks(user_id);
CREATE INDEX IF NOT EXISTS idx_contest_content_checks_contest ON contest_content_checks(source, contest_id);
```

---

### 12. contest_participation (참가/패스)

행 없음 = 미결정. `participate` = 참가, `pass` = 패스

```sql
CREATE TABLE IF NOT EXISTS contest_participation (
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    source TEXT NOT NULL,
    contest_id TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('participate', 'pass')),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (user_id, source, contest_id),
    FOREIGN KEY (source, contest_id) REFERENCES contests(source, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_contest_participation_user ON contest_participation(user_id);
CREATE INDEX IF NOT EXISTS idx_contest_participation_contest ON contest_participation(source, contest_id);
```

---

### 13. crawl_state (크롤 페이지 추적)

위비티 full 크롤 시 "다음에 크롤할 페이지" 저장. 1페이지만 크롤 후 순차 진행.

```sql
CREATE TABLE IF NOT EXISTS crawl_state (
  source TEXT PRIMARY KEY,
  next_page INTEGER NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

- `next_page`: 다음 크롤할 페이지 (1~100, 초과 시 1로 리셋)
- Edge Function이 SERVICE_ROLE_KEY로 읽기/쓰기 (RLS 없음)

---

### 14. notifications (알람 테이블)

공고 insert/update 시 크롤 함수에서 생성. "어떤 공모전의 N개 데이터가 새로 추가/업데이트" 메시지.
`id`는 순번(자동 증가), INSERT 시 넣지 않음.

```sql
CREATE TABLE IF NOT EXISTS notifications (
    id BIGSERIAL PRIMARY KEY,
    type TEXT NOT NULL CHECK (type IN ('insert', 'update', 'status')),
    source TEXT NOT NULL,
    count INTEGER NOT NULL,
    message TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_source ON notifications(source);
```

- `id`: BIGSERIAL 순번 (INSERT 시 생략, 자동 할당)
- `type`: 'insert' (신규 추가) | 'update' (업데이트) | 'status' (상태메시지 변경)

**기존 DB에 status 타입 추가**:
```sql
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check CHECK (type IN ('insert', 'update', 'status'));
```
- `source`: 출처 ('요즘것들', '위비티' 등)
- `count`: 해당 건수
- `message`: "요즘것들 공모전의 5개의 데이터가 새로 추가되었어요" 등

---

### 15. notification_user_state (알람 읽음/삭제 상태)

유저별 알람 읽음·삭제 상태. 삭제는 soft delete (deleted=true).
`user_id`는 `profiles.id`(PK)와 동일한 UUID로 연결. (profiles.id = auth.users.id)

```sql
CREATE TABLE IF NOT EXISTS notification_user_state (
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    notification_id BIGINT NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
    read BOOLEAN NOT NULL DEFAULT false,
    deleted BOOLEAN NOT NULL DEFAULT false,
    PRIMARY KEY (user_id, notification_id)
);

CREATE INDEX IF NOT EXISTS idx_notification_user_state_user ON notification_user_state(user_id);
CREATE INDEX IF NOT EXISTS idx_notification_user_state_read ON notification_user_state(user_id, read) WHERE deleted = false;
```

- `read`: 읽음 여부 (true = 읽음)
- `deleted`: 삭제 여부 (true = 삭제됨, 목록에서 제외)

**기존 테이블이 auth.users 참조인 경우**:
```sql
ALTER TABLE notification_user_state DROP CONSTRAINT IF EXISTS notification_user_state_user_id_fkey;
ALTER TABLE notification_user_state ADD CONSTRAINT notification_user_state_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
```

**알람 전달**: 크롤 함수가 notification 생성 시, `profiles`에서 `role='member'`인 유저의 `profiles.id`를 `user_id`로 사용하여 `notification_user_state` 행 생성

**Realtime**: 알람 목록 실시간 갱신 시 `ALTER PUBLICATION supabase_realtime ADD TABLE notifications;` 실행

---

## ER 관계

```
level_tiers (tier_id)
    └── level_config (N:1) ── level, exp_to_next, tier_id

hashtag_master (id)
    └── user_hashtags (N:M) ── user_id ──> auth.users

profiles (id = auth.users.id)
    ├── level, total_exp ── level_config와 연산으로 현재 레벨/티어 산출
    └── (profile_url, status_message 등)

contests (source, id)
    │
    ├── contest_comments (1:N)
    ├── contest_bookmarks (N:M) ── folder_id ──> bookmark_folders (1단계/2단계)
    └── contest_participation (N:M)

notifications (id)
    └── notification_user_state (N:M) ── user_id ──> auth.users
```

---

## RLS 정책 (참고)

| 테이블 | SELECT | INSERT | UPDATE | DELETE |
|--------|--------|--------|--------|--------|
| contest_comments | 모두 | 본인 | 본인 | 본인 |
| contest_content_checks | 본인만 | 본인 | - | 본인 |
| bookmark_folders | 본인만 | 본인 | 본인 | 본인 |
| contest_bookmarks | 본인만 | 본인 | 본인 | 본인 |
| contest_participation | 본인만 | 본인 | 본인 | 본인 |
| notifications | 모두 | 서비스(크롤) | - | - |
| notification_user_state | 본인만 | 본인 | 본인 | 본인 |

---

## 로컬 SQLite (제거됨)

- data/ 폴더 및 contests.db 제거됨. Supabase contests 사용.

---

## 크롤링 (GitHub Actions + Edge Function)

- 30분마다 `crawl-contests` Edge Function 호출 → contests 테이블 upsert
- 크롤 후 insert/update 건수에 따라 `notifications` 테이블에 알람 생성
- 상세: [docs/크롤링_설정.md](크롤링_설정.md)

---

## Supabase Storage

- 버킷: `profile`
- 경로: `private/{user_id}/avatar.{ext}`
- 상세: docs/프로필_이미지_Storage_설정.md
