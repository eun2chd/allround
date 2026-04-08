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

호출당 1~2페이지만 수집 후 DB 저장. `crawl_state` 테이블에 다음 페이지 저장, 반복 호출로 끝까지 순회.

| 작업 | 스케줄 | 범위 | 설명 |
|------|--------|------|------|
| **분할 수집** | 10분마다 (또는 하루 3회 등) | 호출당 page N~N+1 (2장) | crawl_state 다음 페이지부터 2장 수집·저장 후 다음 페이지로 진행. 끝 페이지 넘으면 1로 리셋 |

> 한 번에 전체 수집 시 타임아웃/부하가 있어, 호출당 1~2페이지만 처리. 10분마다 호출 시 며칠에 걸쳐 전체 페이지 순회 완료.

---

## 6. 운영 구조

```
서버 PC 등에서 crawl_server.py (무한 루프)
        ↓
K-Startup API 요청 (page=1 ~ last_page)
        ↓
Supabase DB UPSERT (startup_business, startup_announcement)
        ↓
React 프론트엔드 → Supabase 클라이언트 → DB 조회
```

### 프론트엔드

- **브라우저에서 K-Startup 공공 API 직접 호출 금지** (인증키 노출 방지)
- **Supabase에 적재된 테이블**을 프론트에서 조회

---

## 7. 환경 변수 (Python)

| 이름 | 설명 |
|------|------|
| `K_START_UP_SERVICE` | 공공데이터포털 인증키 (프로젝트 루트 `.env`) |

Edge Function / GitHub Actions 크롤 워크플로는 사용하지 않습니다. `kstartup_crawler.py` + `crawl_server.py`가 동일 API를 호출합니다.

### API 호출 URL (참고)

| API | URL |
|-----|-----|
| 통합공고 지원사업 | `https://apis.data.go.kr/B552735/kisedKstartupService01/getBusinessInformation01?ServiceKey=인증키` |
| 지원사업 공고 | `https://apis.data.go.kr/B552735/kisedKstartupService01/getAnnouncementInformation01?ServiceKey=인증키` |

---

## 8. API 대상

| API | 테이블 | 고유키 |
|-----|--------|--------|
| getBusinessInformation | startup_business | id (detl_pg_url 파싱) |
| getAnnouncementInformation | startup_announcement | pbanc_sn |

---

## 9. db_schema 참고

- 테이블 정의: [db_schema.md - 창업 (K-Startup)](db_schema.md#창업-k-startup)
- startup_business: id, supt_biz_titl_nm, biz_yr, detl_pg_url 등
- startup_announcement: pbanc_sn, biz_pbanc_nm, pbanc_rcpt_end_dt 등
