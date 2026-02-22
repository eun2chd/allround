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


WEVITY_BASE = "https://www.wevity.com"
WEVITY_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
}


def crawl_wevity_detail(contest_id: str) -> dict | None:
    """
    위비티 상세 페이지 크롤링
    ?c=find&s=1&gbn=view&ix={contest_id}
    """
    url = f"{WEVITY_BASE}/?c=find&s=1&gbn=view&ix={contest_id}"
    try:
        session = requests.Session()
        session.headers.update(WEVITY_HEADERS)
        resp = session.get(url, timeout=15)
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, "html.parser")

        result = {
            "id": contest_id,
            "url": url,
            "title": "",
            "host": "",
            "category": "",
            "apply_period": "",
            "body": "",
            "apply_url": "",
            "images": [],
        }

        # 제목 (div.tit 또는 h2)
        tit = soup.select_one("div.tit, div.view-tit h2, h2.tit")
        if tit:
            result["title"] = re.sub(r"\s+SPECIAL\s*$", "", tit.get_text(strip=True), flags=re.I)
            result["title"] = re.sub(r"\s+IDEA\s*$", "", result["title"], flags=re.I)

        # 테이블 기반 메타 (주최, 분야, 접수기간 등)
        for row in soup.select("table td, div.view-info div, dl dd"):
            txt = row.get_text(strip=True)
            prev = row.find_previous(["th", "dt", "div"])
            label = (prev.get_text(strip=True) if prev else "").lower()
            if "주최" in label or "주관" in label:
                result["host"] = txt[:200] if txt else ""
            elif "분야" in label or "카테고리" in label:
                result["category"] = txt[:200] if txt else ""
            elif "접수" in label or "일정" in label:
                result["apply_period"] = txt[:300] if txt else ""

        # sub-tit 등에서 분야 추출
        if not result["category"]:
            sub = soup.select_one("div.sub-tit, .view-cate")
            if sub:
                m = re.search(r"분야\s*:\s*(.+)", sub.get_text())
                result["category"] = m.group(1).strip()[:200] if m else sub.get_text(strip=True)[:200]

        # 본문 - div.ct, div.view-cont, #viewContents 등
        body_el = (
            soup.select_one("div.ct, div.view-cont, #viewContents, div.detail-cont, .board-cont")
            or soup.find("div", class_=re.compile(r"view|content|body", re.I))
        )
        if body_el:
            # 스크립트/스타일 제거
            for tag in body_el.select("script, style"):
                tag.decompose()
            body_text = body_el.get_text(separator="\n\n", strip=True)
            result["body"] = re.sub(r"\n{3,}", "\n\n", body_text)[:8000]
        else:
            blocks = []
            for tag in soup.find_all(["p", "div"], class_=re.compile(r"ct|cont|body|text", re.I)):
                t = tag.get_text(strip=True)
                if t and 30 < len(t) < 3000 and "AD" not in t and "©" not in t:
                    blocks.append(t)
            result["body"] = "\n\n".join(blocks[:40]) if blocks else ""

        # 이미지
        seen = set()
        for img in soup.select("div.ct img, div.view-cont img, #viewContents img, .board-cont img"):
            src = img.get("src", "").strip()
            if not src:
                continue
            full = urljoin(WEVITY_BASE, src) if src.startswith("/") else src
            if full not in seen and ("wevity" in full or full.startswith("https://")):
                seen.add(full)
                result["images"].append(full)

        # 지원/신청 링크
        for a in soup.select('a[href]'):
            t = a.get_text(strip=True)
            if "지원" in t or "신청" in t or "참가" in t:
                href = a.get("href", "")
                result["apply_url"] = urljoin(WEVITY_BASE, href) if href.startswith("/") or href.startswith("?") else href
                break

        return result

    except requests.RequestException:
        return None
