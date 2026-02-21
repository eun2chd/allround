# 요즘것들 공고 모음

[allforyoung.com](https://www.allforyoung.com) 공모전/대외활동 정보를 크롤링해 웹 테이블로 보여주는 대시보드입니다.

## 설치

```bash
cd allyoung
pip install -r requirements.txt
```
❌ 이전

pip 동작:

requirements.txt 읽기
→ OS 기본 인코딩 사용
→ Windows 기본 = cp949
→ 파일 실제 = UTF-8
→ 디코딩 실패 → UnicodeDecodeError
✅ 이번
export PYTHONUTF8=1

이게 하는 일:

Python 프로세스 전체를 UTF-8 모드로 강제 실행

그러면 pip 내부 동작이 이렇게 바뀜:

requirements.txt 읽기
→ 기본 인코딩 = UTF-8
→ 파일 실제 = UTF-8
→ 정상 파싱
→ 설치 진행

그래서 성공.

export PYTHONUTF8=1
pip install -r requirements.txt

## 실행

```bash
python app.py
```

브라우저에서 http://127.0.0.1:5000 접속

## 기능

- **테이블 뷰**: 수집된 공고를 D-day, 제목, 주최/주관, 카테고리로 표시
- **접속 유저**: 오른쪽 사이드바에 가입된 사용자 목록 + 접속 중/오프라인 표시 (자세한 설명: [docs/접속상태_설명.md](docs/접속상태_설명.md))
- **새로고침**: 버튼 클릭 시 크롤링 실행, 최신 데이터 반영
- **페이지 선택**: 1~10페이지 크롤링 범위 설정
- **데이터 저장**: SQLite에 저장되어 새로고침 시 신규 공고만 추가

발생했던 문제와 해결 과정
1. 왜 안 됐나요? (원인)
원인: app.py 코드 내에서 .env 파일을 읽어오기 위한 **python-dotenv**라는 라이브러리를 사용하도록 설정되어 있었는데, 정작 PC(파이썬 환경)에는 이 라이브러리가 설치되어 있지 않았습니다.

증상: ModuleNotFoundError: No module named 'dotenv'라는 에러 메시지와 함께 실행이 중단되었습니다.

2. 어떻게 해결했나요? (조치)
python -m pip install python-dotenv 명령어를 통해 부족했던 부품(라이브러리)을 설치했습니다.

설치 과정에서 나온 WARNING은 "명령어 실행 파일 경로가 등록되지 않았다"는 뜻이지만, 라이브러리를 코드에서 사용하는 데는 지장이 없으니 지금은 무시하셔도 됩니다.

## 구조

```
allyoung/
├── app.py          # Flask 웹 서버
├── crawler.py      # 크롤러 (HTML 파싱)
├── requirements.txt
├── templates/
│   └── index.html  # 테이블 UI
└── data/           # SQLite DB (자동 생성)
```
# allround
