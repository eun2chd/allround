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

---

### 2. presence (접속 상태)

```sql
CREATE TABLE IF NOT EXISTS presence (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID UNIQUE NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    online BOOLEAN DEFAULT true
);
```

---

### 3. contests (공모전 리스트)

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

### 4. contest_comments (댓글)

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

### 5. bookmark_folders (북마크 폴더 - 최대 2단계)

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

### 6. contest_bookmarks (즐겨찾기/북마크)

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

### 7. contest_content_checks (내용확인)

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

### 8. contest_participation (참가/패스)

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

### 9. crawl_state (크롤 페이지 추적)

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

## ER 관계

```
contests (source, id)
    │
    ├── contest_comments (1:N)
    ├── contest_bookmarks (N:M) ── folder_id ──> bookmark_folders (1단계/2단계)
    └── contest_participation (N:M)
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

---

## 로컬 SQLite (제거됨)

- data/ 폴더 및 contests.db 제거됨. Supabase contests 사용.

---

## 크롤링 (GitHub Actions + Edge Function)

- 30분마다 `crawl-contests` Edge Function 호출 → contests 테이블 upsert
- 상세: [docs/크롤링_설정.md](크롤링_설정.md)

---

## Supabase Storage

- 버킷: `profile`
- 경로: `private/{user_id}/avatar.{ext}`
- 상세: docs/프로필_이미지_Storage_설정.md
