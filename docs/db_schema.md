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

**프로필 이미지 및 상태메시지 컬럼 추가**:
```sql
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS profile_url TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS status_message TEXT;
```

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

**경험치 획득**: `exp_events` 테이블에 액션별 기록, `profiles.total_exp` 갱신. 액션별 XP는 `/api/exp/amounts` 참고.

---

### 3-1. exp_events (경험치 이벤트)

각 행위별 경험치 지급 기록. 중복 지급 방지용 (user_id, activity_type, source, contest_id PK).

```sql
CREATE TABLE public.exp_events (
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    activity_type text NOT NULL,
    source text NOT NULL,
    contest_id text NOT NULL,
    exp_amount int4 NOT NULL,
    created_at timestamptz DEFAULT now(),
    CONSTRAINT exp_events_activity_type_check CHECK (activity_type = ANY (ARRAY['content_check','participate','pass','support_complete','finalist','award'])),
    CONSTRAINT exp_events_pkey PRIMARY KEY (user_id, activity_type, source, contest_id)
);
CREATE INDEX idx_exp_events_created ON exp_events (created_at DESC);
CREATE INDEX idx_exp_events_user ON exp_events (user_id);
```

| activity_type | 설명 | 기본 XP |
|---------------|------|--------|
| content_check | 내용확인 완료 | 5 |
| participate | 참가 | 15 |
| pass | 패스 | 5 |
| support_complete | 지원완료 (참가상세 제출) | 20 |
| finalist | 본선진출 | 300 |
| award | 수상 | 1000 |

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

### 12. contest_hides (공모전 숨김 처리)

각 사용자가 개인적으로 공모전을 숨김 처리할 수 있는 기능.

```sql
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
```

---

### 13. contest_participation (참가/패스)

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

ALTER TABLE contest_participation
ADD COLUMN participation_type TEXT 
CHECK (participation_type IN ('individual', 'team'))
NOT NULL DEFAULT 'individual';

ALTER TABLE contest_participation
ADD COLUMN team_id UUID REFERENCES contest_team(id) ON DELETE SET NULL;


CREATE INDEX IF NOT EXISTS idx_contest_participation_user ON contest_participation(user_id);
CREATE INDEX IF NOT EXISTS idx_contest_participation_contest ON contest_participation(source, contest_id);
```
```sql 
CREATE TABLE contest_team (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    source TEXT NOT NULL,
    contest_id TEXT NOT NULL,
    
    team_name TEXT NOT NULL,
    leader_user_id UUID NOT NULL REFERENCES auth.users(id),
    
    created_at TIMESTAMPTZ DEFAULT NOW(),

    FOREIGN KEY (source, contest_id)
        REFERENCES contests(source, id)
        ON DELETE CASCADE
);
```
CREATE INDEX idx_contest_team_contest
ON contest_team (source, contest_id);

---

### 12-1. contest_participation_detail (참가 상세)

참가/패스한 공모전의 상세 정보 (지원 상태, 수상 등급, 상금, 제출일 등). `contest_participation`과 1:1 (동일 PK).

```sql
CREATE TABLE public.contest_participation_detail (
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    source TEXT NOT NULL,
    contest_id TEXT NOT NULL,
    participation_status TEXT NOT NULL DEFAULT '지원완료'
        CHECK (participation_status IN ('지원완료', '심사중', '본선진출', '수상', '미수상', '취소')),
    award_status TEXT NULL
        CHECK (award_status IN ('대상', '최우수상', '우수상', '장려상', '입선', '기타')),
    has_prize BOOLEAN DEFAULT false,
    prize_amount NUMERIC(12, 2) NULL,
    submitted_at TIMESTAMPTZ NULL,
    result_announcement_date DATE NULL,
    result_announcement_method TEXT NULL,
    document_path TEXT NULL,
    document_filename TEXT NULL,
    updated_at TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (user_id, source, contest_id),
    FOREIGN KEY (source, contest_id) REFERENCES contests(source, id) ON DELETE CASCADE,
    CONSTRAINT award_status_required_when_수상 CHECK (
        (participation_status = '수상' AND award_status IS NOT NULL) OR
        (participation_status <> '수상')
    )
);

CREATE INDEX idx_contest_participation_detail_user ON contest_participation_detail(user_id);
```

**기존 테이블에 `result_announcement_method` 컬럼 추가**:
```sql
ALTER TABLE contest_participation_detail
ADD COLUMN IF NOT EXISTS result_announcement_method TEXT;
```
- 이전에 CHECK 제약이 적용된 경우 자유 입력 허용: `ALTER TABLE contest_participation_detail DROP CONSTRAINT IF EXISTS contest_participation_detail_result_announcement_method_check;`

---

### 13. crawl_state (크롤 페이지 추적)

위비티/K-Startup 크롤 시 "다음에 크롤할 페이지" 저장. 호출당 1~2페이지만 수집 후 순차 진행.

```sql
CREATE TABLE IF NOT EXISTS crawl_state (
  source TEXT PRIMARY KEY,
  next_page INTEGER NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

- `source`: 'wevity' | 'kstartup_business' | 'kstartup_announcement'
- `next_page`: 다음 크롤할 페이지 (초과 시 1로 리셋)
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

**기존 DB에 status, notice, tier 타입 추가**:
```sql
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check CHECK (type IN ('insert', 'update', 'status', 'notice', 'tier'));
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

### 15-1. notices (공지사항)

관리자(admin)가 작성하는 공지사항. 모든 로그인 유저가 조회 가능.

```sql
CREATE TABLE IF NOT EXISTS notices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    body TEXT,
    author_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    is_pinned BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notices_created ON notices(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notices_pinned ON notices(is_pinned) WHERE is_pinned = true;
```

- `title`: 제목
- `body`: 본문 (HTML 또는 Markdown 지원 가능)
- `author_id`: 작성자(관리자) user_id
- `is_pinned`: 상단 고정 여부 (true면 목록 상단 표시)

---

### 15-2. feedback_requests (오류 신고·기능 제안)

사용자가 오류 신고 또는 기능 제안을 등록. 본인 작성건만 조회(관리자는 전체).

```sql
CREATE TABLE IF NOT EXISTS feedback_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    category TEXT NOT NULL CHECK (category IN ('error', 'feature')),
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    reason TEXT,
    image_url TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'done')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_feedback_requests_created ON feedback_requests(created_at DESC);
```

- `category`: error=오류 신고, feature=기능 제안
- `description`: 오류 신고 시 어떤 오류인지, 기능 제안 시 어떤 기능인지
- `reason`: 기능 제안 시 해당 기능이 필요한 이유
- `image_url`: 오류 사진 URL
- `admin_reply`: 관리자 답변 내용
- `admin_replied_at`: 관리자 답변 일시

**이미지 업로드**: rep 버킷 `private/{user_id}/feedback_{uuid}.{ext}` 경로에 저장 (auth 클라이언트 사용, 대표작 이미지와 동일 RLS)

**관리자 답변 컬럼 추가**:
```sql
ALTER TABLE feedback_requests ADD COLUMN IF NOT EXISTS admin_reply TEXT;
ALTER TABLE feedback_requests ADD COLUMN IF NOT EXISTS admin_replied_at TIMESTAMPTZ;
```

---

### 16. user_representative_works (대표작품)

마이페이지 대표작품. 참가한 공모전 중 최대 3개를 선택해 표시. sort_order 1~3으로 순서 지정.

```sql
CREATE TABLE public.user_representative_works (
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    sort_order SMALLINT NOT NULL CHECK (sort_order >= 1 AND sort_order <= 3),
    source TEXT NOT NULL,
    contest_id TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    award_status TEXT CHECK (award_status IN ('대상', '최우수상', '우수상')),
    result_announcement_method TEXT,
    image_path TEXT,
    PRIMARY KEY (user_id, sort_order),
    UNIQUE (user_id, source, contest_id),
    FOREIGN KEY (source, contest_id) REFERENCES contests(source, id) ON DELETE CASCADE
);
CREATE INDEX idx_user_representative_works_user ON user_representative_works(user_id);
```

- `sort_order`: 1~3 (표시 순서)
- `award_status`: 수상 등급 (대상/최우수상/우수상, 선택)
- `result_announcement_method`: 결과 발표 경로 (자유 입력)

**기존 테이블에 컬럼 추가**:
```sql
ALTER TABLE user_representative_works
ADD COLUMN IF NOT EXISTS result_announcement_method TEXT;
```
- `image_path`: 대표 이미지 전체 URL (선택). 예: Supabase Storage public `rep` 버킷 `private/{user_id}/____{contest_id}.png` → `https://{project}.supabase.co/storage/v1/object/public/rep/private/{user_id}/____{contest_id}.png`
- image_path 없으면 "대표이미지가 없습니다" 안내 표시

**RLS 정책** (403 Unauthorized 시 Supabase SQL Editor에서 실행):
```sql
ALTER TABLE user_representative_works ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_representative_works_insert" ON user_representative_works
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user_representative_works_select" ON user_representative_works
  FOR SELECT USING (true);

CREATE POLICY "user_representative_works_update" ON user_representative_works
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "user_representative_works_delete" ON user_representative_works
  FOR DELETE USING (auth.uid() = user_id);
```

**rep 버킷 Storage 정책** (403 시 Supabase Storage → rep 버킷 → Policies에서 추가):
- 경로: `rep` 버킷 > `private/{user_id}/` 폴더
- 정책: 본인 폴더에만 업로드 허용
  - **Policy name**: `rep_insert_own_folder`
  - **Allowed operation**: INSERT (Upload)
  - **Target roles**: authenticated
  - **Policy definition** (USING): `(bucket_id = 'rep') AND ((storage.foldername(name))[2] = auth.uid()::text)`  
    → 경로 `private/{user_id}/파일`에서 두 번째 폴더가 본인 user_id일 때만 허용
  - **WITH CHECK**: 동일

(Supabase 대시보드 Storage > rep > Policies > New Policy에서 위 조건으로 추가)

---

### 17. site_team_settings (팀 설정 - 년도별)

왼쪽 사이드바 "팀 목표" 섹션. 년도별로 한 행씩 (year = PK).

```sql
CREATE TABLE public.site_team_settings (
	year int4 NOT NULL,
	team_name text NOT NULL DEFAULT '우리 팀',
	team_desc text,
	goal_prize int4 NOT NULL DEFAULT 0,
	image_path text,
	achieved_amount bigint DEFAULT 0,
	closed boolean NOT NULL DEFAULT false,
	updated_at timestamptz DEFAULT now(),
	CONSTRAINT site_team_settings_pkey PRIMARY KEY (year)
);
```

- `year`: 연도 (PK)
- `team_name`: 팀 이름
- `team_desc`: 팀 설명
- `goal_prize`: 목표 상금 (만원 단위)
- `image_path`: 팀 프로필 이미지 URL (teamprofile 버킷)
- `achieved_amount`: 달성 금액 (원 단위, 마감 시 스냅샷)
- `closed`: 마감 여부. true면 수정 불가

**기존 테이블 마이그레이션** (id 기반 → year 기반):
```sql
-- 1) 새 테이블 생성
CREATE TABLE IF NOT EXISTS site_team_settings_new (
	year int4 NOT NULL,
	team_name text NOT NULL DEFAULT '우리 팀',
	team_desc text,
	goal_prize int4 NOT NULL DEFAULT 0,
	image_path text,
	achieved_amount bigint DEFAULT 0,
	closed boolean NOT NULL DEFAULT false,
	updated_at timestamptz DEFAULT now(),
	PRIMARY KEY (year)
);

-- 2) 기존 데이터 이전 (id=1 행이 있으면)
INSERT INTO site_team_settings_new (year, team_name, team_desc, goal_prize)
SELECT 2025, COALESCE(team_name,'우리 팀'), team_desc, COALESCE(goal_prize,0)
FROM site_team_settings WHERE id = 1
ON CONFLICT (year) DO NOTHING;

-- 3) 기존 테이블 백업 후 교체
ALTER TABLE site_team_settings RENAME TO site_team_settings_old;
ALTER TABLE site_team_settings_new RENAME TO site_team_settings;

-- 4) 2025년이 없으면 기본 행 삽입
INSERT INTO site_team_settings (year, team_name, team_desc, goal_prize)
VALUES (2025, '우리 팀', '공모전 수상 목표 달성 팀', 2000)
ON CONFLICT (year) DO NOTHING;
```

**신규 설치** (기존 테이블 없음):
```sql
CREATE TABLE public.site_team_settings (
	year int4 NOT NULL PRIMARY KEY,
	team_name text NOT NULL DEFAULT '우리 팀',
	team_desc text,
	goal_prize int4 NOT NULL DEFAULT 0,
	image_path text,
	achieved_amount bigint DEFAULT 0,
	closed boolean NOT NULL DEFAULT false,
	updated_at timestamptz DEFAULT now()
);
INSERT INTO site_team_settings (year, team_name, team_desc, goal_prize)
VALUES (2025, '우리 팀', '공모전 수상 목표 달성 팀', 2000);
```

---

## 창업 (K-Startup)

창업진흥원 K-Startup API 2종 조회 후 저장.
- **getBusinessInformation**: 통합공고 지원사업 정보 → `startup_business`
- **getAnnouncementInformation**: 지원사업 공고 정보 → `startup_announcement`

---

### 18. startup_business (통합공고 지원사업 정보)

getBusinessInformation API. detl_pg_url 내 `id` 파라미터로 중복 판단.

```sql
CREATE TABLE IF NOT EXISTS startup_business (
    id TEXT PRIMARY KEY,                        -- detl_pg_url의 id 파라미터 (예: 171421)
    supt_biz_titl_nm TEXT,                     -- 지원사업명
    biz_category_cd TEXT,                      -- 카테고리코드 (예: cmrczn_Tab1)
    biz_yr TEXT,                               -- 사업연도 (예: 2026)
    biz_supt_trgt_info TEXT,                   -- 지원대상
    biz_supt_ctnt TEXT,                        -- 지원내용
    biz_supt_bdgt_info TEXT,                   -- 예산/지원규모
    supt_biz_chrct TEXT,                       -- 지원사업특징
    supt_biz_intrd_info TEXT,                  -- 지원사업소개
    detl_pg_url TEXT,                          -- 상세페이지 URL
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_startup_business_yr ON startup_business(biz_yr);
CREATE INDEX IF NOT EXISTS idx_startup_business_category ON startup_business(biz_category_cd);
```

- **id**: URL `?id=171421` 에서 추출한 값. 동일 id면 upsert(업데이트) 처리
- **source**: 고정 `kstartup` (단일 API 출처)

---

### 19. startup_announcement (지원사업 공고 정보)

getAnnouncementInformation API. pbanc_sn(공고일련번호)로 중복 판단.

```sql
CREATE TABLE IF NOT EXISTS startup_announcement (
    pbanc_sn TEXT PRIMARY KEY,                 -- 공고일련번호 (예: 176686)
    biz_pbanc_nm TEXT,                         -- 공고명
    intg_pbanc_biz_nm TEXT,                    -- 통합공고명
    pbanc_ntrp_nm TEXT,                        -- 공고기관명
    biz_prch_dprt_nm TEXT,                     -- 담당부서명
    prch_cnpl_no TEXT,                         -- 담당연락처
    supt_regin TEXT,                           -- 지원지역 (예: 서울, 전남)
    supt_biz_clsfc TEXT,                       -- 지원사업분류 (예: 시설ㆍ공간ㆍ보육, 사업화)
    sprv_inst TEXT,                            -- 주관기관 (예: 공공기관, 민간)
    pbanc_rcpt_bgng_dt TEXT,                   -- 접수시작일 (YYYYMMDD)
    pbanc_rcpt_end_dt TEXT,                    -- 접수마감일 (YYYYMMDD)
    rcrt_prgs_yn TEXT,                         -- 모집진행여부 (Y/N)
    intg_pbanc_yn TEXT,                        -- 통합공고여부 (Y/N)
    pbanc_ctnt TEXT,                           -- 공고내용
    aply_trgt TEXT,                            -- 신청대상 (예: 대학생, 일반기업)
    aply_trgt_ctnt TEXT,                       -- 신청대상내용
    aply_excl_trgt_ctnt TEXT,                  -- 신청제외대상
    biz_enyy TEXT,                             -- 창업기간 (예: 1년미만, 3년미만)
    biz_trgt_age TEXT,                         -- 대상연령 (예: 만 20세 이상 ~ 만 39세 이하)
    detl_pg_url TEXT,                          -- 상세페이지 URL
    biz_aply_url TEXT,                         -- 신청 URL
    biz_gdnc_url TEXT,                         -- 가이드 URL
    aply_mthd_onli_rcpt_istc TEXT,             -- 온라인접수 안내
    aply_mthd_eml_rcpt_istc TEXT,              -- 이메일접수 안내
    aply_mthd_fax_rcpt_istc TEXT,              -- 팩스접수 안내
    aply_mthd_vst_rcpt_istc TEXT,              -- 방문접수 안내
    aply_mthd_pssr_rcpt_istc TEXT,             -- 우편접수 안내
    aply_mthd_etc_istc TEXT,                   -- 기타접수 안내
    prfn_matr TEXT,                            -- 참고사항
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_startup_announcement_rcpt_end ON startup_announcement(pbanc_rcpt_end_dt);
CREATE INDEX IF NOT EXISTS idx_startup_announcement_regin ON startup_announcement(supt_regin);
CREATE INDEX IF NOT EXISTS idx_startup_announcement_clsfc ON startup_announcement(supt_biz_clsfc);
```

- **pbanc_sn**: 공고 일련번호. 동일하면 upsert(업데이트) 처리

**kstartup_crawl_state (테이블 21)** 에 진행 페이지 저장: `business_next_page`, `announcement_next_page`

**데이터 수집 규칙**:
- startup_business: detl_pg_url에서 `id` 파라미터 추출 → id가 PK. 동일 id면 update
- startup_announcement: pbanc_sn이 PK. 동일 pbanc_sn이면 update

---

### 21. kstartup_crawl_state (K-Startup 크롤링 진행 페이지 추적)

K-Startup 크롤링 전용 진행 페이지 추적 테이블. `crawl_state`와 독립적으로 관리.

```sql
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
```

- **id**: 항상 1 (단일 row만 유지)
- **business_next_page**: 통합지원사업 다음 크롤할 페이지
- **announcement_next_page**: 지원사업 공고 다음 크롤할 페이지
- **updated_at**: 마지막 업데이트 시각
- Edge Function이 SERVICE_ROLE_KEY로 읽기/쓰기 (RLS 없음)

---

### 20. startup_content_checks (창업 내용확인)

창업 지원사업/공고 내용확인 버튼 클릭 시 기록. 참가/패스는 내용확인 후에만 활성화.
경험치/티어 미반영.

```sql
CREATE TABLE IF NOT EXISTS startup_content_checks (
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    item_type TEXT NOT NULL CHECK (item_type IN ('business', 'announcement')),
    item_id TEXT NOT NULL,
    checked_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (user_id, item_type, item_id)
);

CREATE INDEX IF NOT EXISTS idx_startup_content_checks_user ON startup_content_checks(user_id);
CREATE INDEX IF NOT EXISTS idx_startup_content_checks_item ON startup_content_checks(item_type, item_id);
```

- `item_type`: 'business' = startup_business, 'announcement' = startup_announcement
- `item_id`: startup_business.id 또는 startup_announcement.pbanc_sn

---

### 20-1. startup_comments (창업 댓글)

통합지원사업/지원사업 공고 항목당 댓글. 내용확인 시 "내용 확인 완료" 자동 댓글 저장.

```sql
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
```

- `item_type`: 'business' | 'announcement'
- `item_id`: startup_business.id 또는 startup_announcement.pbanc_sn

---

### 21. startup_participation (창업 참가/패스)

행 없음 = 미결정. `participate` = 참가, `pass` = 패스. 경험치/티어 미반영.

```sql
CREATE TABLE IF NOT EXISTS startup_participation (
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    item_type TEXT NOT NULL CHECK (item_type IN ('business', 'announcement')),
    item_id TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('participate', 'pass')),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (user_id, item_type, item_id)
);

CREATE INDEX IF NOT EXISTS idx_startup_participation_user ON startup_participation(user_id);
CREATE INDEX IF NOT EXISTS idx_startup_participation_item ON startup_participation(item_type, item_id);
```

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

startup_business (id)
startup_announcement (pbanc_sn)
    │
    ├── startup_content_checks (N:M) ── user_id ──> auth.users
    └── startup_participation (N:M) ── user_id ──> auth.users
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

| 버킷 | 경로 | 용도 | 상세 |
|------|------|------|------|
| profile | `private/{user_id}/avatar.{ext}` | 프로필 이미지 | docs/프로필_이미지_Storage_설정.md |
| rep | `private/{user_id}/____{contest_id}.{ext}` | 대표작 이미지 | docs/대표작_이미지_Storage_설정.md |
| contest | `private/{user_id}/doc_{source}_{contest_id}_{filename}` | 참가 상세 제출물 | docs/참가_상세_문서_Storage_설정.md |
| teamprofile | `private/{year}_team.{ext}` | 팀 프로필 이미지 | docs/팀_프로필_이미지_Storage_설정.md |
