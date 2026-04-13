#!/usr/bin/env python3
"""Edge 함수와 동일한 '수집 원천'이 파이썬에서 동작하는지 DB 없이 검증."""
from __future__ import annotations

import sys
from pathlib import Path

_ROOT = Path(__file__).resolve().parent.parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

import requests

from crawler import (
    ALLFORYOUNG_LIST_CATEGORY,
    ALLFORYOUNG_LIST_PAGE_SIZE,
    WEVITY_HEADERS,
    fetch_allforyoung_contest_page,
    fetch_wevity_list_page,
)

try:
    from config import K_START_UP_SERVICE
except ImportError:
    K_START_UP_SERVICE = None


def main() -> int:
    ok = True
    s = requests.Session()
    s.headers.update(WEVITY_HEADERS)
    w = fetch_wevity_list_page(s, 1)
    print(f"[crawl-wevity / refresh-wevity-dday 목록] 1페이지: {len(w)}건", end="")
    if len(w) < 1:
        print(" FAIL")
        ok = False
    else:
        print(f" OK (샘플 id={w[0].get('id')})")

    s2 = requests.Session()
    s2.headers.update({"User-Agent": WEVITY_HEADERS["User-Agent"]})
    a = fetch_allforyoung_contest_page(s2, 1)
    print(
        f"[crawl-contests / refresh-allforyoung-dday 목록] "
        f"category={ALLFORYOUNG_LIST_CATEGORY!r} size={ALLFORYOUNG_LIST_PAGE_SIZE} 1페이지: {len(a)}건",
        end="",
    )
    if len(a) < 1:
        print(" FAIL")
        ok = False
    else:
        print(f" OK (샘플 id={a[0].get('id')}, d_day={a[0].get('d_day')!r})")

    if K_START_UP_SERVICE:
        from kstartup_crawler import (
            fetch_announcement_page,
            fetch_business_page,
            get_kstartup_num_of_rows,
        )

        n = get_kstartup_num_of_rows()
        biz, bm = fetch_business_page(K_START_UP_SERVICE, 1)
        ann, am = fetch_announcement_page(K_START_UP_SERVICE, 1)
        print(
            f"[crawl-kstartup XML] numOfRows={n} 통합지원 p1: {len(biz)}건 (currentCount={bm.get('current_count')}), "
            f"공고 p1: {len(ann)}건 (currentCount={am.get('current_count')}) OK"
        )
    else:
        print("[crawl-kstartup] K_START_UP_SERVICE 없음 — 스킵")

    print()
    print("참고: 스케줄/DB는 Edge와 다름 — crawl_server는 위비티 최대 100p·요즘것들 50p 한 사이클 전체,")
    print("        Edge crawl-wevity full은 crawl_state로 2p씩 등. 수집·파싱 로직은 위와 동일 계열.")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
