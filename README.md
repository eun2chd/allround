# 요즘것들 공고 모음

[allforyoung.com](https://www.allforyoung.com) 공모전/대외활동 정보를 크롤링해 웹 테이블로 보여주는 대시보드입니다.

## 설치

```bash
cd allyoung
pip install -r requirements.txt
```

## 실행

```bash
python app.py
```

브라우저에서 http://127.0.0.1:5000 접속

## 기능

- **테이블 뷰**: 수집된 공고를 D-day, 제목, 주최/주관, 카테고리로 표시
- **새로고침**: 버튼 클릭 시 크롤링 실행, 최신 데이터 반영
- **페이지 선택**: 1~10페이지 크롤링 범위 설정
- **데이터 저장**: SQLite에 저장되어 새로고침 시 신규 공고만 추가

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
