"""
로컬 Python 크롤 서버: 위비티 → 요즘것들 → K-Startup 순으로 끝까지 수집·upsert 후 반복.
엣지 함수(`supabase/functions/*`)와 동일한 DB 반영·알림 규칙을 따른다.

페이지 단위: 목록(및 필요 시 상세) 처리 → DB 저장 → 홀수 페이지 뒤 10초, 짝수 페이지 뒤 20초 대기.

실행:  python crawl_server.py
옵션:  --dday-refresh  사이클 끝에 목록만 돌며 D-day만 갱신 (refresh-* 엣지와 유사)
"""

from __future__ import annotations

import argparse
import logging
import signal
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone

import requests

from config import K_START_UP_SERVICE, get_supabase_admin_client
from crawler import (
    SOURCE_ALLFORYOUNG,
    SOURCE_WEVITY,
    WEVITY_HEADERS,
    crawl_post_detail_html,
    crawl_wevity_detail_html,
    fetch_allforyoung_contest_page,
    fetch_wevity_list_page,
)
from kstartup_crawler import (
    SOURCE_KSTARTUP,
    fetch_announcement_page,
    fetch_business_page,
    probe_last_pages,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
log = logging.getLogger("crawl_server")

# Supabase 내부 httpx가 매 요청마다 INFO로 URL을 찍어 가독성이 떨어져 WARNING 이상만 표시
for _logger_name in ("httpx", "httpcore", "hpack"):
    logging.getLogger(_logger_name).setLevel(logging.WARNING)

ID_CHUNK = 100
WEVITY_MAX_PAGES = 100
ALLFORYOUNG_MAX_PAGES = 50
DDAY_REFRESH_WORKERS = 15

_stop = threading.Event()


def _signal_handler(_signum, _frame) -> None:
    _stop.set()
    log.info("종료 시그널 수신 — 현재 단계가 끝나면 루프를 멈춥니다.")


def iso_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def sleep_after_page(page: int) -> None:
    delay = 10 if page % 2 == 1 else 20
    log.info("페이지 %s 처리 완료 → %s초 대기", page, delay)
    time.sleep(delay)


def chunked(xs: list[str], n: int):
    for i in range(0, len(xs), n):
        yield xs[i : i + n]


def fetch_existing_contests(client, source: str, ids: list[str]) -> dict:
    out: dict = {}
    uniq = list(dict.fromkeys(ids))
    for batch in chunked(uniq, ID_CHUNK):
        res = (
            client.table("contests")
            .select("id, created_at, first_seen_at, content")
            .eq("source", source)
            .in_("id", batch)
            .execute()
        )
        for row in res.data or []:
            out[row["id"]] = row
    return out


def _notify_members_for_contest(client, notification_id: str) -> None:
    res = client.table("profiles").select("id").eq("role", "member").execute()
    members = res.data or []
    if not members:
        return
    rows = [
        {"user_id": m["id"], "notification_id": notification_id, "read": False, "deleted": False}
        for m in members
    ]
    client.table("notification_user_state").insert(rows).execute()


def _notify_members_all_profiles(client, notification_id: str) -> None:
    res = client.table("profiles").select("id").execute()
    members = res.data or []
    if not members:
        return
    rows = [
        {"user_id": m["id"], "notification_id": notification_id, "read": False, "deleted": False}
        for m in members
    ]
    client.table("notification_user_state").insert(rows).execute()


def notify_contest_changes(client, source: str, inserted: int, updated: int) -> None:
    if inserted > 0:
        r = (
            client.table("notifications")
            .insert(
                {
                    "type": "insert",
                    "source": source,
                    "count": inserted,
                    "message": f"{source} 공모전의 {inserted}개의 데이터가 새로 추가되었어요",
                }
            )
            .select("id")
            .execute()
        )
        row = (r.data or [None])[0]
        if row and row.get("id"):
            _notify_members_for_contest(client, str(row["id"]))
    if updated > 0:
        r = (
            client.table("notifications")
            .insert(
                {
                    "type": "update",
                    "source": source,
                    "count": updated,
                    "message": f"{source} 공모전의 {updated}개의 데이터가 새로 업데이트 했어요",
                }
            )
            .select("id")
            .execute()
        )
        row = (r.data or [None])[0]
        if row and row.get("id"):
            _notify_members_for_contest(client, str(row["id"]))


def run_wevity(client) -> None:
    session = requests.Session()
    session.headers.update(WEVITY_HEADERS)
    for page in range(1, WEVITY_MAX_PAGES + 1):
        if _stop.is_set():
            break
        try:
            rows = fetch_wevity_list_page(session, page)
        except Exception as e:
            log.exception("위비티 목록 페이지 %s 오류: %s", page, e)
            break
        if not rows:
            log.warning(
                "위비티 페이지 %s — 파싱된 목록 0건, 여기서 중단 (사이트 구조·차단·응답 확인 필요)",
                page,
            )
            break
        ids = [r["id"] for r in rows]
        existing_before = fetch_existing_contests(client, SOURCE_WEVITY, ids)
        now = iso_now()
        to_upsert = []
        for r in rows:
            ex = existing_before.get(r["id"])
            if not ex or not str(ex.get("content") or "").strip():
                html = crawl_wevity_detail_html(r["id"])
                content_val = html if html else ""
                time.sleep(0.3)
            else:
                content_val = ex["content"]
            to_upsert.append(
                {
                    "source": SOURCE_WEVITY,
                    "id": r["id"],
                    "title": r["title"],
                    "d_day": r["d_day"],
                    "host": r["host"],
                    "url": r["url"],
                    "category": r["category"],
                    "content": content_val,
                    "created_at": ex.get("created_at") if ex else now,
                    "first_seen_at": ex.get("first_seen_at") if ex else now,
                    "updated_at": now,
                }
            )
        client.table("contests").upsert(to_upsert, on_conflict="source,id").execute()
        inserted = sum(1 for r in rows if r["id"] not in existing_before)
        updated = len(rows) - inserted
        notify_contest_changes(client, SOURCE_WEVITY, inserted, updated)
        log.info(
            "위비티 페이지 %s: contests 테이블 %s건 반영 (신규 %s, 기존 id 갱신 %s)",
            page,
            len(rows),
            inserted,
            updated,
        )
        sleep_after_page(page)


def run_allforyoung(client) -> None:
    session = requests.Session()
    session.headers.update(
        {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                "Chrome/120.0.0.0 Safari/537.36"
            ),
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "ko-KR,ko;q=0.9",
        }
    )
    for page in range(1, ALLFORYOUNG_MAX_PAGES + 1):
        if _stop.is_set():
            break
        try:
            rows = fetch_allforyoung_contest_page(session, page)
        except Exception as e:
            log.exception("요즘것들 목록 페이지 %s 오류: %s", page, e)
            break
        if not rows:
            log.warning(
                "요즘것들 페이지 %s — 파싱된 목록 0건, 여기서 중단 (사이트 구조·차단·응답 확인 필요)",
                page,
            )
            break
        ids = [r["id"] for r in rows]
        existing_before = fetch_existing_contests(client, SOURCE_ALLFORYOUNG, ids)
        now = iso_now()
        to_upsert = []
        for r in rows:
            ex = existing_before.get(r["id"])
            if not ex or not str(ex.get("content") or "").strip():
                html = crawl_post_detail_html(r["id"])
                content_val = html if html else ""
                time.sleep(0.3)
            else:
                content_val = ex["content"]
            to_upsert.append(
                {
                    "source": SOURCE_ALLFORYOUNG,
                    "id": r["id"],
                    "title": r["title"],
                    "d_day": r["d_day"],
                    "host": r["host"],
                    "url": r["url"],
                    "category": r["category"],
                    "content": content_val,
                    "created_at": ex.get("created_at") if ex else now,
                    "first_seen_at": ex.get("first_seen_at") if ex else now,
                    "updated_at": now,
                }
            )
        client.table("contests").upsert(to_upsert, on_conflict="source,id").execute()
        inserted = sum(1 for r in rows if r["id"] not in existing_before)
        updated = len(rows) - inserted
        notify_contest_changes(client, SOURCE_ALLFORYOUNG, inserted, updated)
        log.info(
            "요즘것들 페이지 %s: contests 테이블 %s건 반영 (신규 %s, 기존 id 갱신 %s)",
            page,
            len(rows),
            inserted,
            updated,
        )
        sleep_after_page(page)


def _fetch_existing_ids(client, table: str, id_col: str, ids: list[str]) -> set[str]:
    found: set[str] = set()
    for batch in chunked(list(dict.fromkeys(ids)), ID_CHUNK):
        q = client.table(table).select(id_col).in_(id_col, batch)
        res = q.execute()
        for row in res.data or []:
            found.add(str(row[id_col]))
    return found


def run_kstartup(client, service_key: str) -> None:
    biz_last, ann_last = probe_last_pages(service_key)
    log.info(
        "K-Startup 범위 — 통합지원 1~%s페이지, 공고 1~%s페이지 (한 페이지에 각각 최대 10건)",
        biz_last,
        ann_last,
    )
    max_p = max(biz_last, ann_last)
    biz_new_total = ann_new_total = 0
    biz_upd_total = ann_upd_total = 0

    for p in range(1, max_p + 1):
        if _stop.is_set():
            break
        biz_rows: list = []
        ann_rows: list = []
        biz_new_pg = biz_upd_pg = 0
        ann_new_pg = ann_upd_pg = 0

        if p <= biz_last:
            try:
                biz_rows, bmeta = fetch_business_page(service_key, p)
                if bmeta.get("current_count", 0) == 0:
                    biz_rows = []
            except Exception as e:
                log.exception("K-Startup 통합지원 page %s: %s", p, e)
        if p <= ann_last:
            try:
                ann_rows, ameta = fetch_announcement_page(service_key, p)
                if ameta.get("current_count", 0) == 0:
                    ann_rows = []
            except Exception as e:
                log.exception("K-Startup 공고 page %s: %s", p, e)

        if biz_rows:
            ids = [r["id"] for r in biz_rows]
            existed = _fetch_existing_ids(client, "startup_business", "id", ids)
            biz_new_pg = sum(1 for i in ids if i not in existed)
            biz_upd_pg = len(biz_rows) - biz_new_pg
            client.table("startup_business").upsert(biz_rows, on_conflict="id").execute()
            biz_new_total += biz_new_pg
            biz_upd_total += biz_upd_pg

        if ann_rows:
            sns = [r["pbanc_sn"] for r in ann_rows]
            existed = _fetch_existing_ids(client, "startup_announcement", "pbanc_sn", sns)
            ann_new_pg = sum(1 for s in sns if s not in existed)
            ann_upd_pg = len(ann_rows) - ann_new_pg
            client.table("startup_announcement").upsert(ann_rows, on_conflict="pbanc_sn").execute()
            ann_new_total += ann_new_pg
            ann_upd_total += ann_upd_pg

        biz_part = (
            f"통합지원 {len(biz_rows)}건 upsert (신규 {biz_new_pg}, 기존행 갱신 {biz_upd_pg})"
            if biz_rows
            else (
                f"통합지원 스킵 (수집 끝, {biz_last}페이지까지)"
                if p > biz_last
                else "통합지원 API 0건"
            )
        )
        ann_part = (
            f"공고 {len(ann_rows)}건 upsert (신규 {ann_new_pg}, 기존행 갱신 {ann_upd_pg})"
            if ann_rows
            else (
                f"공고 스킵 (수집 끝, {ann_last}페이지까지)"
                if p > ann_last
                else "공고 API 0건"
            )
        )
        log.info(
            "K-Startup [%s/%s] %s | %s | 누적: 통합 신규 %s·갱신 %s, 공고 신규 %s·갱신 %s",
            p,
            max_p,
            biz_part,
            ann_part,
            biz_new_total,
            biz_upd_total,
            ann_new_total,
            ann_upd_total,
        )
        sleep_after_page(p)

    client.table("kstartup_crawl_state").upsert(
        {
            "id": 1,
            "business_next_page": 1,
            "announcement_next_page": 1,
            "updated_at": iso_now(),
        },
        on_conflict="id",
    ).execute()

    log.info(
        "K-Startup 이번 구간 합계: 통합지원 신규 %s·갱신 %s (총 %s건), 공고 신규 %s·갱신 %s (총 %s건)",
        biz_new_total,
        biz_upd_total,
        biz_new_total + biz_upd_total,
        ann_new_total,
        ann_upd_total,
        ann_new_total + ann_upd_total,
    )

    total_new = biz_new_total + ann_new_total
    total_upsert = biz_new_total + biz_upd_total + ann_new_total + ann_upd_total
    if total_upsert <= 0:
        return
    try:
        has_new = total_new > 0
        if has_new:
            if biz_new_total > 0 and ann_new_total > 0:
                msg = f"{SOURCE_KSTARTUP} 창업 정보 {total_new}건이 추가되었어요 (지원사업 {biz_new_total}건, 공고 {ann_new_total}건)"
            elif biz_new_total > 0:
                msg = f"{SOURCE_KSTARTUP} 통합공고 지원사업 {biz_new_total}건이 추가되었어요"
            else:
                msg = f"{SOURCE_KSTARTUP} 지원사업 공고 {ann_new_total}건이 추가되었어요"
        else:
            b_count = biz_new_total + biz_upd_total
            a_count = ann_new_total + ann_upd_total
            if b_count > 0 and a_count > 0:
                msg = f"{SOURCE_KSTARTUP} 창업 정보 {total_upsert}건이 업데이트되었어요 (지원사업 {b_count}건, 공고 {a_count}건)"
            elif b_count > 0:
                msg = f"{SOURCE_KSTARTUP} 통합공고 지원사업 {b_count}건이 업데이트되었어요"
            else:
                msg = f"{SOURCE_KSTARTUP} 지원사업 공고 {a_count}건이 업데이트되었어요"

        r = (
            client.table("notifications")
            .insert(
                {
                    "type": "insert" if has_new else "update",
                    "source": SOURCE_KSTARTUP,
                    "count": total_new if has_new else total_upsert,
                    "message": msg,
                }
            )
            .select("id")
            .execute()
        )
        row = (r.data or [None])[0]
        if row and row.get("id"):
            _notify_members_all_profiles(client, str(row["id"]))
    except Exception as e:
        log.warning("K-Startup 알림 생성 실패: %s", e)


def _refresh_dday_pool(client_factory, source: str, all_rows: list[dict]) -> None:
    if not all_rows:
        return
    n = DDAY_REFRESH_WORKERS
    chunks = [all_rows[i::n] for i in range(n)]
    now = iso_now()

    def worker(chunk: list[dict]) -> None:
        if not chunk:
            return
        c = client_factory()
        for r in chunk:
            c.table("contests").update({"d_day": r["d_day"], "updated_at": now}).eq("source", source).eq(
                "id", r["id"]
            ).execute()

    with ThreadPoolExecutor(max_workers=n) as ex:
        list(ex.map(worker, chunks))


def run_refresh_wevity_dday(client_factory) -> None:
    session = requests.Session()
    session.headers.update(WEVITY_HEADERS)
    all_rows: list[dict] = []
    for page in range(1, WEVITY_MAX_PAGES + 1):
        if _stop.is_set():
            break
        try:
            rows = fetch_wevity_list_page(session, page)
        except Exception as e:
            log.exception("위비티 D-day 목록 %s: %s", page, e)
            break
        if not rows:
            break
        all_rows.extend(rows)
        sleep_after_page(page)
    log.info("위비티 D-day 갱신: 목록 %s건 병렬 업데이트", len(all_rows))
    _refresh_dday_pool(client_factory, SOURCE_WEVITY, all_rows)


def run_refresh_allforyoung_dday(client_factory) -> None:
    session = requests.Session()
    session.headers.update(
        {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                "Chrome/120.0.0.0 Safari/537.36"
            ),
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "ko-KR,ko;q=0.9",
        }
    )
    all_rows: list[dict] = []
    for page in range(1, ALLFORYOUNG_MAX_PAGES + 1):
        if _stop.is_set():
            break
        try:
            rows = fetch_allforyoung_contest_page(session, page)
        except Exception as e:
            log.exception("요즘것들 D-day 목록 %s: %s", page, e)
            break
        if not rows:
            break
        all_rows.extend(rows)
        sleep_after_page(page)
    log.info("요즘것들 D-day 갱신: 목록 %s건 병렬 업데이트", len(all_rows))
    _refresh_dday_pool(client_factory, SOURCE_ALLFORYOUNG, all_rows)


def main() -> None:
    parser = argparse.ArgumentParser(description="로컬 크롤 서버 (위비티 → 요즘것들 → K-Startup 반복)")
    parser.add_argument(
        "--dday-refresh",
        action="store_true",
        help="각 사이클 끝에 refresh-* 엣지와 같이 목록만 돌며 d_day 갱신",
    )
    args = parser.parse_args()

    signal.signal(signal.SIGINT, _signal_handler)
    signal.signal(signal.SIGTERM, _signal_handler)

    client = get_supabase_admin_client()

    def new_client():
        return get_supabase_admin_client()

    while not _stop.is_set():
        log.info("========== 사이클 시작: 위비티 ==========")
        run_wevity(client)
        if _stop.is_set():
            break
        log.info("========== 요즘것들 ==========")
        run_allforyoung(client)
        if _stop.is_set():
            break
        log.info("========== K-Startup ==========")
        if K_START_UP_SERVICE:
            run_kstartup(client, K_START_UP_SERVICE)
        else:
            log.warning("K_START_UP_SERVICE 미설정 — 창업 단계 건너뜀 (.env에 추가)")
        if _stop.is_set():
            break
        if args.dday_refresh:
            log.info("========== D-day 갱신 (위비티) ==========")
            run_refresh_wevity_dday(new_client)
            if _stop.is_set():
                break
            log.info("========== D-day 갱신 (요즘것들) ==========")
            run_refresh_allforyoung_dday(new_client)
        log.info("========== 사이클 완료 — 처음부터 다시 ==========")


if __name__ == "__main__":
    main()
