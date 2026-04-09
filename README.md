# Ntpercent 공모전 대시보드

요즘것들(allforyoung.com), 위비티(wevity.com), K-Startup 등의 공고·창업 정보를 모아 Supabase에 두고, **React 웹 앱**에서 조회·관리하는 프로젝트입니다.

## 구성

| 구분 | 역할 |
|------|------|
| **프론트엔드** | `frontend/` — React, TypeScript, Vite. UI·인증·실시간 기능은 **Supabase**와 통신합니다. |
| **백엔드** | 별도 서버 앱 없음. **Supabase** (PostgreSQL, Auth, Storage, Realtime)가 데이터·권한의 중심입니다. |
| **Python** | **로컬에서만** 돌리는 **크롤·적재 도구**입니다. HTTP API를 제공하지 않으며, 수집한 내용을 DB에 `upsert`합니다. |

과거 Flask + Jinja 템플릿 구조는 제거되었고, 화면은 전부 React 앱입니다.

---

## Python — 무엇을 위해 쓰는지

웹 사용자에게 보이는 서버가 아니라, **공고 DB를 채우는 배치(반복 작업)용 스크립트**입니다.

### 파일별 역할

| 파일 | 역할 |
|------|------|
| `crawl_server.py` | **진입점.** 위비티 → 요즘것들 → K-Startup 순으로 목록·상세(필요 시)를 수집하고, 페이지마다 Supabase에 반영한 뒤 **10초/20초 간격**으로 다음 페이지로 진행합니다. 종료 시까지 같은 사이클을 반복합니다. |
| `crawler.py` | 위비티·요즘것들 **HTML 파싱** (목록·상세 본문 HTML). BeautifulSoup + requests. |
| `kstartup_crawler.py` | **K-Startup 공공 API** XML 파싱 및 행 매핑 (`startup_business`, `startup_announcement`용). |
| `config.py` | `.env` 로드, Supabase 클라이언트 생성 헬퍼, `K_START_UP_SERVICE` 등 환경 변수 읽기. |
| `view_raw_html.py` | 수집 대상 HTML 확인용 **디버그 유틸** (선택). |

### 실행 방법

1. Python 3.11+ 가상 환경 권장  
2. 프로젝트 루트에서:

```bash
pip install -r requirements.txt
```

3. 루트 `.env`에 최소 다음이 있어야 합니다 (크롤 서버는 **서비스 롤**로 쓰는 것이 안전합니다).

```env
VITE_NTP_SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...   # 또는 문서화된 호환 키 변수
K_START_UP_SERVICE=...          # K-Startup API 인증키 (창업 단계용)
```

`crawl_server.py`는 `SUPABASE_URL` / `SUPABASE_ANON_KEY` 표준 이름도 보조로 읽습니다.  
자세한 키 이름은 `config.py`를 참고하면 됩니다.

4. 크롤 서버 기동:

```bash
python crawl_server.py
# 또는 Windows에서
py -3 crawl_server.py
```

- **Ctrl+C**로 중지하면, 진행 중인 단계가 끝난 뒤 루프를 멈추도록 되어 있습니다.
- 사이클 끝에 **D-day만 다시 도는 옵션**이 필요하면:

```bash
python crawl_server.py --dday-refresh
```

(기본 크롤만으로도 목록에서 가져온 D-day는 upsert에 포함됩니다.)

### 페이지 배치·대기 간격 (속도 조절)

기본값(`--page-batch-size 1`)은 예전과 같습니다: **목록 1페이지 → 상세·DB 반영 → 10초 또는 20초 대기**를 반복합니다.

`--page-batch-size`를 3~4 등으로 올리면, **위비티·요즘것들**은 목록 N페이지 분량을 한꺼번에 모은 뒤 **DB upsert 1번**, 그다음 **대기 1번**만 합니다.

- **총 HTTP 요청 수**(목록 + 상세)는 동일합니다. 줄어드는 것은 **대기(sleep) 횟수**와 **Supabase upsert 횟수**뿐이라, 한 사이클 전체 시간은 보통 짧아집니다.
- 배치 안에서는 목록 요청이 **연속**으로 나가므로, N이 너무 크면 사이트·방화벽에서 부담으로 보일 수 있습니다. **3~4 정도**부터 쓰고 상황을 보는 것을 권장합니다.
- **K-Startup**은 공공 API라 상대적으로 여유가 있지만, 구현상 **페이지마다 upsert는 그대로**이고 **대기만** 배치 단위로 묶입니다.

```bash
# 예: 목록 4페이지마다 DB 반영·배치 대기 1회 (홀수 10초·짝수 20초).
# 공모전 알림은 배치마다가 아니라 사이클(위비티+요즘것들) 끝에 합산 1회.
# 한 사이클이 끝나면 기본 30분 후 다시 시작 — 바로 반복하려면 --cycle-wait-minutes 0
python crawl_server.py --page-batch-size 4 --sleep-batch-odd 10 --sleep-batch-even 20

# python crawl_server.py --page-batch-size 4 --sleep-batch-odd 10 --sleep-batch-even 20 --cycle-wait-minutes 0
# python crawl_server.py --page-batch-size 4 --sleep-batch-odd 10 --sleep-batch-even 20 --cycle-wait-minutes 45
```

---

## 프론트엔드 (React)

```bash
cd frontend
npm install
npm run dev
```

Vite 개발 서버 주소(보통 `http://localhost:5173`)에서 앱을 띄웁니다.  
Supabase URL·anon 키는 프론트에서 `VITE_*` 환경 변수로 읽습니다 (`frontend/.env` 또는 루트 `.env` 정책에 맞게 설정).

---

## Supabase · 문서

- DB 스키마·Storage: `docs/db_schema.md` 및 `docs/` 하위 가이드  
- 크롤링: `docs/크롤링_설정.md` (Python `crawl_server.py`)  
- 창업 API: `docs/창업_K-Startup_수집_설계.md`

---

## 프로젝트 구조 (요약)

```text
allround/
├── frontend/           # React + Vite 앱 (실제 웹 UI)
├── crawl_server.py     # 로컬 크롤 반복 서버
├── crawler.py
├── kstartup_crawler.py
├── config.py
├── requirements.txt    # Python 크롤·도구용만
├── supabase/           # 마이그레이션 등 (Edge Function 없음)
└── docs/
```

---

## 트러블슈팅 (요약)

- **`pip install` 인코딩 오류 (Windows)**  
  PowerShell: `$env:PYTHONUTF8=1` 후 다시 설치.

- **Supabase upsert 오류**  
  `.env`의 URL·서비스 롤 키 확인. `on_conflict` 컬럼이 DB 제약과 일치하는지 확인.

- **K-Startup 단계 건너뜀**  
  로그에 `K_START_UP_SERVICE 미설정`이면 `.env`에 공공데이터포털 키 추가.

- **위비티 목록이 0건**  
  `Accept-Encoding`에 `br`만 오는 환경에서 디코딩이 깨지면 HTML 파싱이 비어 나올 수 있습니다. 현재 `crawler.py`는 `gzip, deflate`만 요청합니다.

- **요즘것들 목록이 0건**  
  웹 페이지 초기 HTML에는 공모 카드가 없고, 목록은 **`https://api.allforyoung.com/api/v2/posts?category=공모전`** JSON으로 내려옵니다. 최신 코드는 이 API를 사용합니다.

---

## 라이선스

이 프로젝트의 라이선스 정보를 여기에 추가하세요.  
외부 사이트를 크롤링할 때는 각 사이트 이용약관을 준수해 주세요.
