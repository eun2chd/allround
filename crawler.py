"""
allforyoung.com 공모전/대외활동 크롤러
HTML 파싱 방식 (API 미지원 사이트)
"""

import re
import time
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup


BASE_URL = "https://www.allforyoung.com"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
}


def crawl_contest_page(page: int = 1, max_pages: int = 1) -> list[dict]:
    """
    공모전 목록 페이지 크롤링
    /posts/contest?page=N
    """
    results = []
    session = requests.Session()
    session.headers.update(HEADERS)

    for p in range(1, max_pages + 1):
        url = f"{BASE_URL}/posts/contest?page={p}"
        try:
            resp = session.get(url, timeout=15)
            resp.raise_for_status()
            soup = BeautifulSoup(resp.text, "html.parser")

            # li > a[href="/posts/ID"] 구조 (nav 링크 제외)
            seen_ids = set()
            for a in soup.select('a[href*="/posts/"]'):
                href = a.get("href", "")
                m = re.search(r"/posts/(\d+)(?:\?|$)", href)
                if not m:
                    continue
                post_id = m.group(1)
                if post_id in seen_ids:
                    continue

                li = a.find_parent("li")
                if not li:
                    continue  # nav 등
                seen_ids.add(post_id)

                # 카드 구조 파싱
                img = li.find("img", alt=True)
                title = img["alt"].strip() if img else ""

                badge_span = li.find(attrs={"data-slot": "badge"})
                d_day = badge_span.get_text(strip=True) if badge_span else ""

                card_footer = li.find(attrs={"data-slot": "card-footer"})
                host = card_footer.get_text(strip=True) if card_footer else ""

                card_content = li.find(attrs={"data-slot": "card-content"})
                category = "공모전"
                if card_content:
                    cat_badge = card_content.find(attrs={"data-slot": "badge"})
                    if cat_badge:
                        category = cat_badge.get_text(strip=True)

                full_url = urljoin(BASE_URL, href)
                results.append({
                    "id": post_id,
                    "title": title or "(제목 없음)",
                    "d_day": d_day,
                    "host": host,
                    "url": full_url,
                    "category": category,
                    "source": "요즘것들",
                })

            time.sleep(1)

        except requests.RequestException as e:
            results.append({"error": str(e), "page": p})

    return results


def crawl_post_detail(post_id: str) -> dict | None:
    """
    상세 페이지 크롤링
    /posts/{post_id}
    """
    url = f"{BASE_URL}/posts/{post_id}"
    try:
        session = requests.Session()
        session.headers.update(HEADERS)
        resp = session.get(url, timeout=15)
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, "html.parser")

        result = {
            "id": post_id,
            "url": url,
            "title": "",
            "host": "",
            "category": "",
            "apply_period": "",
            "body": "",
            "apply_url": "",
            "images": [],
        }

        # 제목 (h1)
        h1 = soup.find("h1")
        if h1:
            result["title"] = h1.get_text(strip=True)

        # 이미지 추출
        seen = set()
        for link in soup.select('link[rel="preload"][as="image"]'):
            href = link.get("href", "").strip()
            if href and href not in seen and ("cdn.allforyoung" in href or href.startswith("https://")):
                seen.add(href)
                result["images"].append(href)
        for img in soup.select("img[src]"):
            src = img.get("src", "").strip()
            if not src:
                continue
            full = urljoin(BASE_URL, src) if src.startswith("/") else src
            if full not in seen and ("cdn.allforyoung" in full or full.startswith("https://")):
                seen.add(full)
                result["images"].append(full)

        article = soup.find("article") or soup.find("main") or soup.body
        if not article:
            article = soup

        # 주최/주관, 접수기간
        for elem in article.find_all(["div", "span", "p"]):
            txt = elem.get_text(strip=True)
            if "주최" in txt and "주관" in txt and len(txt) < 80:
                result["host"] = re.sub(r"주최[/\s]*주관\s*", "", txt).strip() or txt
            if "접수기간" in txt and len(txt) < 100:
                p = txt.split("접수기간", 1)
                if len(p) > 1:
                    result["apply_period"] = p[1].strip()

        # 지원하기 링크
        for a in article.select('a[href]'):
            href = a.get("href", "")
            if "지원" in a.get_text():
                result["apply_url"] = urljoin(BASE_URL, href) if href.startswith("/") else href
                break

        # 본문 - prose 등
        prose = article.find(class_=re.compile(r"prose|markdown|content", re.I))
        if prose:
            blocks = [e.get_text(strip=True) for e in prose.find_all(["p", "h2", "h3", "h4", "li"]) if e.get_text(strip=True)]
            result["body"] = "\n\n".join(blocks[:80])
        else:
            blocks = []
            for tag in article.find_all(["p", "h2", "h3", "h4", "li", "div"]):
                t = tag.get_text(strip=True)
                if t and 20 < len(t) < 1200 and "AD" not in t and "©" not in t:
                    blocks.append(t)
            result["body"] = "\n\n".join(blocks[:60]) if blocks else ""

        return result

    except requests.RequestException:
        return None
