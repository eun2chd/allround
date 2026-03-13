# 창업 K-Startup API 수집 설계

K-Startup API 2종을 수집해 `startup_business`, `startup_announcement` 테이블에 저장합니다.

---

## 1. API 응답 구조

응답에는 끝 페이지가 명시되지 않으며, 페이징은 아래 필드로 판단합니다.

### 핵심 필드

| 필드 | 설명 |
|------|------|
| `currentCount` | 현재 페이지 데이터 개수 |
| `perPage` | 페이지당 개수 |
| `totalCount` | 전체 데이터 수 |
| `page` | 현재 페이지 |
| `data` | 실제 데이터 목록 |
| `matchCount` | 검색 매칭 건수 |

### 응답 예시

```xml
<results>
    <currentCount>0</currentCount>
    <data/>
    <matchCount>1740</matchCount>
    <page>1000</page>
    <perPage>10</perPage>
    <totalCount>1740</totalCount>
</results>
```

---

## 2. 페이지 계산

### last_page 계산

```
last_page = ceil(totalCount / perPage)
```

### 예시

- `totalCount = 1740`
- `perPage = 10`
- `last_page = 174` → 1~174페이지까지만 호출

---

## 3. 전체 수집 알고리즘

```
1. page=1 요청
2. totalCount 확인
3. last_page = ceil(totalCount / perPage)
4. page=1 ~ last_page 반복 호출
5. DB upsert 저장
```

### 종료 조건 (2중 조건)

다음 중 **하나라도 만족**하면 반복 중단:

1. `page > last_page`
2. `currentCount == 0`

---

## 4. DB 저장 전략 (중복 방지)

### startup_business

- **고유키**: `id` (detl_pg_url의 `?id=` 파라미터)
- **방식**: `ON CONFLICT (id) DO UPDATE`

```sql
INSERT INTO startup_business (id, supt_biz_titl_nm, ...)
VALUES (...)
ON CONFLICT (id)
DO UPDATE SET
    supt_biz_titl_nm = EXCLUDED.supt_biz_titl_nm,
    ...
    updated_at = NOW();
```

### startup_announcement

- **고유키**: `pbanc_sn` (공고일련번호)
- **방식**: `ON CONFLICT (pbanc_sn) DO UPDATE`

```sql
INSERT INTO startup_announcement (pbanc_sn, biz_pbanc_nm, ...)
VALUES (...)
ON CONFLICT (pbanc_sn)
DO UPDATE SET
    biz_pbanc_nm = EXCLUDED.biz_pbanc_nm,
    ...
    updated_at = NOW();
```

---

## 5. 최신 데이터 유지 전략

전체 데이터를 매번 수집하면 비효율적이므로 다음 전략 사용:

| 작업 | 스케줄 | 범위 | 설명 |
|------|--------|------|------|
| **전체 동기화** | 하루 1~2회 (예: 03:00, 15:00) | page 1 ~ last_page | 전체 upsert |
| **증분 업데이트** | 10분마다 | page 1 ~ 3 | 신규 공고 빠르게 반영 |

> 공고는 최근 페이지(1~3)에 주로 추가되므로, 증분 업데이트로 신규 데이터를 빠르게 반영합니다.

---

## 6. 운영 구조

```
GitHub Actions (cron)
        ↓
Edge Function 호출
        ↓
K-Startup API 요청 (page=1 ~ last_page)
        ↓
Supabase DB UPSERT
        ↓
프론트엔드 → 내 서버(Flask) → DB 조회
```

### 프론트엔드 아키텍처

- **프론트엔드 → K-Startup API 직접 호출 금지**
- **프론트엔드 → Flask 서버 API → DB 조회** 구조 사용

```
GET /api/startup/business?page=1
GET /api/startup/announcements?page=1
```

---

## 7. Edge Function + GitHub Actions

### API 호출 URL

| API | URL |
|-----|-----|
| 통합공고 지원사업 | `https://apis.data.go.kr/B552735/kisedKstartupService01/getBusinessInformation01?ServiceKey=인증키` |
| 지원사업 공고 | `https://apis.data.go.kr/B552735/kisedKstartupService01/getAnnouncementInformation01?ServiceKey=인증키` |

### Secret (Supabase)

| 이름 | 설명 |
|------|------|
| `K_START_UP_SERVICE` | 공공데이터포털 인증키 (등록 완료) |

```bash
# 로컬 Secret 설정 (배포 시 Supabase Dashboard에서 설정)
supabase secrets set K_START_UP_SERVICE=your_encoding_key
```

### Edge Function: crawl-kstartup

- `full=1` 또는 `body { "full": true }` → 전체 페이지 수집
- 기본 호출 → page 1~3만 수집 (증분)

### GitHub Actions 스케줄 (권장)

| 워크플로우 | cron | 용도 |
|------------|------|------|
| K-Startup 전체 | `0 3,15 * * *` (03:00, 15:00) | getBusinessInformation + getAnnouncementInformation 전체 |
| K-Startup 증분 | `*/10 * * * *` (10분마다) | page 1~3만 빠르게 반영 |

---

## 8. API 대상

| API | 테이블 | 고유키 |
|-----|--------|--------|
| getBusinessInformation | startup_business | id (detl_pg_url 파싱) |
| getAnnouncementInformation | startup_announcement | pbanc_sn |

### 배포

```bash
npx supabase link --project-ref <PROJECT_REF>
npx supabase functions deploy crawl-kstartup
```

Supabase Dashboard → Edge Functions → crawl-kstartup → Settings에서 `K_START_UP_SERVICE` 시크릿 확인.

### GitHub Actions

| 파일 | 스케줄 | 용도 |
|------|--------|------|
| `.github/workflows/crawl-kstartup.yml` | 10분마다 | page 1~3 증분 수집 |
| `.github/workflows/crawl-kstartup-full.yml` | 03:00, 15:00 UTC | 전체 페이지 수집 |

**필요한 Secrets** (Repository → Settings → Secrets): `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`

---

## 9. db_schema 참고

- 테이블 정의: [db_schema.md - 창업 (K-Startup)](db_schema.md#창업-k-startup)
- startup_business: id, supt_biz_titl_nm, biz_yr, detl_pg_url 등
- startup_announcement: pbanc_sn, biz_pbanc_nm, pbanc_rcpt_end_dt 등
