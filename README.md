#Ntpercent 공모전 대시보드

allforyoung.com과 wevity.com의 공모전 및 대외활동 정보를 크롤링하여 한눈에 확인하고 관리할 수 있는 웹 기반 대시보드입니다.

## 주요 기능

### 공고 관리
- 공고 테이블 뷰: 수집된 공고를 D-day, 제목, 주최/주관, 카테고리별로 정렬하여 표시
- 실시간 크롤링: Supabase Edge Function을 통한 자동 크롤링 (30분마다)
- 중복 방지 저장: Supabase 데이터베이스를 사용하여 기존 데이터는 유지하고 신규 공고만 추가
- 다중 소스 지원: 요즘것들(allforyoung.com), 위비티(wevity.com) 크롤링

### 사용자 기능
- Supabase 인증: 이메일/비밀번호 기반 회원가입 및 로그인
- 프로필 관리: 닉네임, 프로필 이미지, 상태 메시지, 해시태그 설정
- 즐겨찾기: 공고를 폴더별로 분류하여 저장 및 관리
- 참가 관리: 공모전 참가 신청 및 상세 정보 관리
- 대표작 관리: 포트폴리오 이미지 업로드 및 순서 조정

### 협업 기능
- 팀 관리: 팀 생성, 멤버 초대, 팀 프로필 설정
- 실시간 접속 상태: 오른쪽 사이드바를 통해 가입된 사용자의 실시간 접속/오프라인 상태 확인
- 알림 시스템: 공고 업데이트, 팀 활동 등 실시간 알림

### 기타 기능
- 피드백/오류 신고: 사용자 피드백 및 오류 신고 기능
- 공지사항: 관리자 공지사항 작성 및 관리
- 창업 정보: K-Startup 공고 및 창업 정보 수집

## 기술 스택

Backend
- Language: Python 3.11 ~ 3.12 (권장)
- Framework: Flask (Web Server)
- Database: Supabase (PostgreSQL, Auth, Storage, Realtime)
- Library: 
  - BeautifulSoup4 (Crawling)
  - python-dotenv (환경 변수 관리)
  - supabase-py (Supabase 클라이언트)
  - pandas (데이터 처리)
  - Pillow (이미지 처리)

Frontend
- Template Engine: Jinja2 (Flask 기본)
- CSS: 커스텀 CSS (Pretendard 폰트 사용)
- JavaScript: Vanilla JS (Realtime 구독, 동적 UI)

Infrastructure
- 크롤링: Supabase Edge Functions (TypeScript)
- 스케줄링: GitHub Actions (30분마다 자동 크롤링)
- 배포: Render, Railway, Fly.io 등 지원 (Procfile 포함)

설치 및 실행 방법

### 1. 사전 요구사항
이 프로젝트는 다음 도구가 설치되어 있어야 합니다:

- Python 3.11+
- Supabase 프로젝트 (Auth, Database, Storage 사용)
- Git (프로젝트 클론용)

### 2. 프로젝트 복제 및 이동
bash
git clone <repository-url>
cd allround

3. 가상 환경 생성 및 활성화

bash
# Windows
python -m venv venv
venv\Scripts\activate

macOS/Linux
python3 -m venv venv
source venv/bin/activate

4. 패키지 설치

Windows 환경에서 인코딩 오류(UnicodeDecodeError)를 방지하기 위해 UTF-8 모드를 활성화한 후 설치합니다.

bash
# Windows (PowerShell)
$env:PYTHONUTF8=1
pip install -r requirements.txt

# Windows (CMD)
set PYTHONUTF8=1
pip install -r requirements.txt

# macOS/Linux
pip install -r requirements.txt

# 만약 dotenv 에러가 발생한다면 별도 설치
python -m pip install python-dotenv


### 5. 환경 변수 설정

프로젝트 루트에 .env 파일을 생성하고 다음 변수들을 설정합니다:

env
# Supabase 설정 (필수)
VITE_NTP_SUPABASE_URL=https://your-project.supabase.co
VITE_NTP_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Flask 설정 (필수)
FLASK_SECRET_KEY=your-secret-key-32-chars-minimum

# 데이터베이스 (선택)
VITE_NTP_DATABASE_URL=your-database-url
VITE_NTP_DATABASE_DIRECT_URL=your-direct-database-url


SECRET_KEY 생성 예시:
```bash
python -c "import secrets; print(secrets.token_hex(32))"
```

6. Supabase 데이터베이스 설정

1. Supabase Dashboard → SQL Editor에서 `docs/db_schema.md` 참고하여 테이블 생성
2. Storage 버킷 설정:
   - `docs/프로필_이미지_Storage_설정.md`
   - `docs/대표작_이미지_Storage_설정.md`
   - `docs/참가_상세_문서_Storage_설정.md`
   - `docs/팀_프로필_이미지_Storage_설정.md`

7. 크롤링 설정 (선택)

자동 크롤링을 사용하려면:

1. Edge Function 배포: `docs/크롤링_설정.md` 참고
2. GitHub Actions 설정: Repository Secrets에 Supabase 관련 키 추가

### 8. 실행

```bash
python app.py
```

브라우저에서 `http://127.0.0.1:5000` 접속

### 9. 배포 전 테스트 (Gunicorn)

배포 플랫폼(Render / Railway / Fly.io)에서는 Flask를 직접 실행하지 않고 WSGI 서버로 실행합니다. 배포 환경과 동일하게 로컬에서 먼저 실행 테스트를 진행합니다.

#### 9.1 Gunicorn 설치

`requirements.txt`에 이미 포함되어 있지만, 혹시 모르니 확인:

```bash
pip install gunicorn
```

#### 9.2 서버 실행

프로젝트 루트에서 실행:

```bash
gunicorn -w 4 -b 0.0.0.0:5000 app:app
```

**명령어 옵션 설명:**

| 옵션 | 설명 |
|------|------|
| `-w 4` | worker 4개 (동시 처리 프로세스 수) |
| `-b 0.0.0.0:5000` | bind address (모든 네트워크 인터페이스에서 접속 가능) |
| `app:app` | `app.py` 파일 안의 `app` 객체 |

**예시 구조:**
```
project/
 ├── app.py          # app = Flask(__name__)
 ├── requirements.txt
 └── templates/
```

#### 9.3 브라우저 접속

`http://localhost:5000` 접속하여 다음을 확인:

- ✅ 메인 페이지 로드
- ✅ Supabase 연결
- ✅ 로그인 페이지 정상 표시

#### 9.4 정상 실행 로그 예시

```
[INFO] Starting gunicorn
[INFO] Listening at: http://0.0.0.0:5000
[INFO] Using worker: sync
[INFO] Booting worker
```

#### ✅ 완료 조건

다음 3개를 모두 확인해야 합니다:

1. ✅ gunicorn 실행 성공
2. ✅ localhost:5000 접속 가능
3. ✅ 서버 에러 없음

**참고**: 배포 플랫폼에서는 `Procfile`의 설정에 따라 자동으로 gunicorn이 실행됩니다. 로컬 테스트를 통해 배포 전에 문제를 미리 확인할 수 있습니다.

## 프로젝트 구조

allround/
├── app.py                    # Flask 웹 서버 및 라우팅 로직
├── config.py                 # 환경 변수 및 Supabase 설정
├── crawler.py                # BeautifulSoup 기반 HTML 파싱 및 수집기
├── view_raw_html.py          # HTML 디버깅용 유틸리티
├── requirements.txt          # 프로젝트 의존성 라이브러리 목록
├── Procfile                  # 배포 플랫폼용 프로세스 설정
├── templates/                # Jinja2 템플릿 파일
│   ├── index.html            # 메인 대시보드 UI
│   ├── login.html            # 로그인 페이지
│   ├── signup.html           # 회원가입 페이지
│   ├── mypage.html           # 마이페이지
│   ├── bookmarks.html        # 즐겨찾기 페이지
│   ├── feedback.html         # 피드백 페이지
│   └── partials/             # 공통 컴포넌트
│       ├── _navbar.html      # 네비게이션 바
│       ├── _sidebar_users.html # 사용자 사이드바
│       ├── _sidebar_team.html # 팀 사이드바
│       └── ...
├── static/                   # 정적 파일
│   ├── css/                  # 스타일시트
│   ├── js/                   # JavaScript 파일
│   ├── images/               # 이미지 파일
│   └── font/                 # 폰트 파일
├── supabase/                 # Supabase 관련 파일
│   ├── functions/            # Edge Functions
│   │   ├── crawl-contests/   # 요즘것들 크롤링 함수
│   │   ├── crawl-wevity/     # 위비티 크롤링 함수
│   │   └── crawl-kstartup/   # K-Startup 크롤링 함수
│   └── migrations/           # 데이터베이스 마이그레이션
└── docs/                     # 문서
    ├── db_schema.md          # 데이터베이스 스키마
    ├── 크롤링_설정.md        # 크롤링 설정 가이드
    ├── 배포가이드.md         # 배포 가이드
    ├── 접속상태_설명.md      # 실시간 유저 상태 시스템 설명
    └── ...
```

주요 API 엔드포인트

### 인증
- `POST /login` - 로그인
- `POST /signup` - 회원가입
- `POST /logout` - 로그아웃
- `POST /reset-password` - 비밀번호 재설정

공고
- `GET /api/contests` - 공고 목록 조회
- `GET /api/contests/<source>/<contest_id>/content` - 공고 상세 내용
- `POST /api/contests/<source>/<contest_id>/participation` - 참가 신청

### 즐겨찾기
- `GET /api/bookmarks` - 즐겨찾기 목록
- `POST /api/bookmarks/toggle` - 즐겨찾기 추가/제거
- `GET /api/bookmarks/folders` - 폴더 목록
- `POST /api/bookmarks/folders` - 폴더 생성

### 사용자
- `GET /api/me` - 현재 사용자 정보
- `GET /api/users` - 사용자 목록 (접속 상태 포함)
- `POST /api/profile/update-image` - 프로필 이미지 업데이트

### 팀
- `GET /api/team/settings` - 팀 설정 조회
- `POST /api/team/settings` - 팀 생성/수정
- `GET /api/team/members` - 팀 멤버 목록

# 트러블슈팅 (Troubleshooting)

### 1. pip install 중 UnicodeDecodeError 발생 시

원인: Windows 기본 인코딩(CP949)과 파일 인코딩 불일치

해결: 
```bash
# PowerShell
$env:PYTHONUTF8=1
pip install -r requirements.txt

# CMD
set PYTHONUTF8=1
pip install -r requirements.txt
```

### 2. ModuleNotFoundError: No module named 'dotenv'

원인: 일부 환경에서 의존성 누락

해결: 
```bash
pip install python-dotenv
```

### 3. Supabase 연결 오류

원인: 환경 변수 미설정 또는 잘못된 키

해결: 
- `.env` 파일이 프로젝트 루트에 있는지 확인
- `VITE_NTP_SUPABASE_URL`, `VITE_NTP_SUPABASE_ANON_KEY` 값 확인
- Supabase Dashboard → Settings → API에서 키 복사

### 4. 로그인 후 접속 상태가 표시되지 않음

원인: `presence` 테이블 미생성 또는 `SUPABASE_SERVICE_ROLE_KEY` 미설정

해결: 
- `docs/db_schema.md` 참고하여 `presence` 테이블 생성
- `.env`에 `SUPABASE_SERVICE_ROLE_KEY` 설정

### 5. 크롤링이 동작하지 않음

원인: Edge Function 미배포 또는 GitHub Actions 미설정

해결: 
- `docs/크롤링_설정.md` 참고하여 Edge Function 배포
- GitHub Actions Secrets 설정 확인

### 6. Gunicorn 실행 오류

원인: gunicorn 미설치 또는 포트 충돌

해결: 
```bash
# gunicorn 설치 확인
pip install gunicorn

# 포트가 이미 사용 중인 경우 다른 포트 사용
gunicorn -w 4 -b 0.0.0.0:8000 app:app

# 또는 Windows에서 gunicorn이 동작하지 않는 경우
# Windows는 gunicorn을 지원하지 않으므로 배포 환경에서만 사용
# 로컬 개발은 python app.py 사용
```

**참고**: Windows에서는 gunicorn이 제대로 동작하지 않을 수 있습니다. 로컬 개발은 `python app.py`를 사용하고, 배포 전 테스트는 Linux/macOS 환경 또는 Docker를 사용하는 것을 권장합니다.

추가 문서

- [데이터베이스 스키마](docs/db_schema.md)
- [크롤링 설정 가이드](docs/크롤링_설정.md)
- [배포 가이드](docs/배포가이드.md)
- [리다이렉트 URL 설정](docs/리다이렉트_URL_설정.md) - Supabase 리다이렉트 URL 전체 목록
- [접속 상태 시스템 설명](docs/접속상태_설명.md)
- [창업/K-Startup 수집 설계](docs/창업_K-Startup_수집_설계.md)

라이선스

이 프로젝트의 라이선스 정보를 여기에 추가하세요.
참고: 이 프로젝트는 allforyoung.com과 wevity.com의 공모전 정보를 수집하여 제공합니다. 크롤링 시 해당 사이트의 이용약관을 준수해주세요.
