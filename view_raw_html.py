"""
가져온 HTML 문자열을 파일로 저장해서 볼 수 있게 하는 스크립트
실행: python view_raw_html.py
"""

import requests

URLS = {
    "목록": "https://www.allforyoung.com/posts/contest?page=1",
    "상세": "https://www.allforyoung.com/posts/78105",
}

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0",
}

for name, url in URLS.items():
    print(f"{name} 페이지만 가져오는 중...")
    r = requests.get(url, headers=HEADERS, timeout=15)
    r.raise_for_status()
    filename = f"raw_{name}.html".replace(" ", "_")
    with open(filename, "w", encoding="utf-8") as f:
        f.write(r.text)
    print(f"  -> {filename} 저장됨 ({len(r.text):,} 글자)")
    print()

print("완료! 메모장이나 VS Code로 열어서 구조를 확인해보세요.")
