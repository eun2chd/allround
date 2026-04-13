"""
로컬 Python 크롤 서버: 요즘것들 공모전 → K-Startup 순으로 수집·upsert 후 반복.
(위비티 전용 반복은 `crawl_wevity_only_loop.py` — `run_wevity` 등은 이 모듈에 남아 재사용.)

엣지 함수(`supabase/functions/*`)와 동일한 DB 반영·알림 규칙을 따른다.

K-Startup(공공데이터포털 API)은 **한국 달력일(KST)당 1회**만 실행한다. `kstartup_crawl_state.updated_at`이
오늘(KST)로 이미 갱신돼 있으면 같은 날 이후 사이클에서는 API를 호출하지 않는다.

K-Startup 구간은 요즘것들 공모전 구간과 별도로 `--kstartup-page-batch-size`(기본 5)와
`--kstartup-sleep-batch-odd` / `--kstartup-sleep-batch-even`(기본 1·2초)를 쓰며,
`kstartup_crawler`의 `numOfRows` 기본 100(`KSTARTUP_NUM_ROWS`)으로 페이지 수를 줄인다.

기본: 목록(및 필요 시 상세) 처리 → DB 저장 뒤 대기.  
`--page-batch-size`로 여러 목록 페이지를 모아 한 번에 upsert한 뒤 대기하면 **대기 횟수만 줄어** 같은 총 요청 수로 더 빨리 끝납니다(대상 사이트에는 목록 N페이지가 연속으로 나가므로 과도한 배치는 피하세요).

일일 GitHub Actions: `python crawl_server.py --single-cycle` — 한 번만 요즘것들·K-Startup(가능 시) 수행 후 종료.  
DB `crawl_logs`에 오늘(KST) `status=success`가 있으면 해당 작업은 스킵합니다. `--force-daily`로 스킵 무시.

실행:  python crawl_server.py
옵션:  --single-cycle  위 한 사이클만 (Actions 일일 스케줄)
       --force-daily   --single-cycle 과 함께: crawl_logs 당일 성공이 있어도 재실행
       --dday-refresh  사이클 끝에 요즘것들 목록만 돌며 D-day만 갱신 (refresh-allforyoung-dday 엣지와 유사)
       --page-batch-size, --sleep-batch-odd, --sleep-batch-even
"""

from __future__ import annotations

import argparse
import logging
import signal
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

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
    get_kstartup_num_of_rows,
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

JOB_CONTEST_CRAWL = "contest_crawl"
JOB_KSTARTUP_CRAWL = "kstartup_crawl"

_stop = threading.Event()


def _signal_handler(_signum, _frame) -> None:
    _stop.set()
    log.info("종료 시그널 수신 — 현재 단계가 끝나면 루프를 멈춥니다.")


def iso_now() -> str:
    return datetime.now(timezone.utc).isoformat()


_KST = ZoneInfo("Asia/Seoul")


def kstartup_calendar_date_kst() -> str:
    """공공 API 일일 한도 기준 달력일 (YYYY-MM-DD, Asia/Seoul)."""
    return datetime.now(_KST).date().isoformat()


def _parse_timestamptz_utc(value: object) -> datetime:
    if isinstance(value, datetime):
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc)
    s = str(value).strip()
    if s.endswith("Z"):
        s = s[:-1] + "+00:00"
    return datetime.fromisoformat(s).astimezone(timezone.utc)


def _crawl_log_has_success(client, job_name: str, run_date: str) -> bool:
    """crawl_logs 에 해당 일(KST) success 행이 있으면 True."""
    try:
        res = (
            client.table("crawl_logs")
            .select("id")
            .eq("job_name", job_name)
            .eq("run_date", run_date)
            .eq("status", "success")
            .limit(1)
            .execute()
        )
    except Exception as e:
        log.warning("crawl_logs 조회 실패(스킵 검사 생략, 수집 진행): %s", e)
        return False
    return bool(res.data)


def _crawl_log_upsert(
    client,
    job_name: str,
    run_date: str,
    status: str,
    message: str | None,
    started_iso: str,
) -> None:
    finished = iso_now()
    row = {
        "job_name": job_name,
        "run_date": run_date,
        "status": status,
        "message": (message[:8000] if message else None),
        "started_at": started_iso,
        "finished_at": finished,
    }
    client.table("crawl_logs").upsert(row, on_conflict="job_name,run_date").execute()


def kstartup_should_skip_daily_public_api(client) -> bool:
    """`kstartup_crawl_state.updated_at`이 오늘(KST)이면 이미 일일 수집된 것으로 보고 True."""
    today_kst = kstartup_calendar_date_kst()
    try:
        res = (
            client.table("kstartup_crawl_state")
            .select("updated_at")
            .eq("id", 1)
            .limit(1)
            .execute()
        )
        row = (res.data or [None])[0]
        if not row:
            return False
        raw = row.get("updated_at")
        if raw is None:
            return False
        updated_kst_date = _parse_timestamptz_utc(raw).astimezone(_KST).date().isoformat()
        return updated_kst_date == today_kst
    except Exception as e:
        log.warning("K-Startup 일일 스킵 여부 조회 실패 — 수집 진행(재시도): %s", e)
        return False


def sleep_after_batch(
    batch_index: int,
    odd_seconds: int,
    even_seconds: int,
    label: str,
    page_from: int | None = None,
    page_to: int | None = None,
) -> None:
    delay = odd_seconds if batch_index % 2 == 1 else even_seconds
    if page_from is not None and page_to is not None and page_from != page_to:
        log.info(
            "%s 배치 %s (페이지 %s~%s) 처리 완료 → %s초 대기",
            label,
            batch_index,
            page_from,
            page_to,
            delay,
        )
    else:
        p = page_from if page_from is not None else batch_index
        log.info("%s 배치 %s (페이지 %s) 처리 완료 → %s초 대기", label, batch_index, p, delay)
    time.sleep(delay)


def wait_between_cycles(total_minutes: int) -> None:
    """K-Startup·공모전 사이클이 끝난 뒤 다음 루프까지 대기. 약 1분마다 남은 시간 로그."""
    if total_minutes <= 0:
        return
    total_sec = total_minutes * 60
    log.info("%s분 대기 시작 (다음 크롤링 사이클까지)", total_minutes)
    seconds_left = total_sec
    while seconds_left > 0 and not _stop.is_set():
        mins_left = (seconds_left + 59) // 60
        log.info("대기 중 — %s분 전", mins_left)
        step = min(60, seconds_left)
        time.sleep(step)
        seconds_left -= step


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


def notify_contest_cycle_summary(
    client,
    wevity_inserted: int,
    wevity_updated: int,
    allforyoung_inserted: int,
    allforyoung_updated: int,
) -> None:
    """공모전 한 사이클 합산 알림 1건. 위비티·요즘것들 단독/병행 모두 지원 (배치마다 넣지 않음)."""
    total_ins = wevity_inserted + allforyoung_inserted
    total_upd = wevity_updated + allforyoung_updated
    if total_ins + total_upd <= 0:
        log.info("공모전 알림 생략 — 이번 사이클 반영 건수 0")
        return
    has_new = total_ins > 0
    bits: list[str] = []
    if wevity_inserted or wevity_updated:
        bits.append(f"위비티 신규 {wevity_inserted}·갱신 {wevity_updated}")
    if allforyoung_inserted or allforyoung_updated:
        bits.append(f"요즘것들 신규 {allforyoung_inserted}·갱신 {allforyoung_updated}")
    detail = f" ({', '.join(bits)})" if bits else ""
    msg = f"공모전 수집 완료 — 신규 {total_ins}건, 업데이트 {total_upd}건{detail}"
    w_any = bool(wevity_inserted or wevity_updated)
    a_any = bool(allforyoung_inserted or allforyoung_updated)
    if w_any and a_any:
        notif_source = "위비티·요즘것들"
    elif w_any:
        notif_source = "위비티"
    else:
        notif_source = "요즘것들"
    try:
        r = (
            client.table("notifications")
            .insert(
                {
                    "type": "insert" if has_new else "update",
                    "source": notif_source,
                    "count": total_ins + total_upd,
                    "message": msg,
                }
            )
            .execute()
        )
        row = (r.data or [None])[0]
        if row and row.get("id"):
            _notify_members_for_contest(client, str(row["id"]))
        log.info("알림 생성 완료 — 신규 %s건, 업데이트 %s건", total_ins, total_upd)
    except Exception as e:
        log.warning("공모전 사이클 알림 생성 실패: %s", e)


def run_wevity(
    client,
    page_batch_size: int,
    sleep_batch_odd: int,
    sleep_batch_even: int,
) -> tuple[int, int]:
    session = requests.Session()
    session.headers.update(WEVITY_HEADERS)
    page = 1
    batch_idx = 0
    sum_inserted = sum_updated = 0
    while page <= WEVITY_MAX_PAGES and not _stop.is_set():
        batch_idx += 1
        batch_pages: list[tuple[int, list[dict]]] = []
        for _ in range(page_batch_size):
            if page > WEVITY_MAX_PAGES or _stop.is_set():
                break
            try:
                rows = fetch_wevity_list_page(session, page)
            except Exception as e:
                log.exception("위비티 목록 페이지 %s 오류: %s", page, e)
                return sum_inserted, sum_updated
            if not rows:
                log.warning(
                    "위비티 페이지 %s — 파싱된 목록 0건, 여기서 중단 (사이트 구조·차단·응답 확인 필요)",
                    page,
                )
                break
            batch_pages.append((page, rows))
            page += 1

        if not batch_pages:
            break

        ordered_rows: list[dict] = []
        seen_ids: set[str] = set()
        for _, rows in batch_pages:
            for r in rows:
                rid = r["id"]
                if rid in seen_ids:
                    continue
                seen_ids.add(rid)
                ordered_rows.append(r)

        ids = [r["id"] for r in ordered_rows]
        existing_before = fetch_existing_contests(client, SOURCE_WEVITY, ids)
        now = iso_now()
        to_upsert = []
        for r in ordered_rows:
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
        inserted = sum(1 for r in ordered_rows if r["id"] not in existing_before)
        updated = len(ordered_rows) - inserted
        sum_inserted += inserted
        sum_updated += updated
        p_first, p_last = batch_pages[0][0], batch_pages[-1][0]
        log.info(
            "위비티 페이지 %s~%s: contests 테이블 %s건 반영 (신규 %s, 기존 id 갱신 %s)",
            p_first,
            p_last,
            len(ordered_rows),
            inserted,
            updated,
        )
        if not _stop.is_set():
            sleep_after_batch(
                batch_idx,
                sleep_batch_odd,
                sleep_batch_even,
                "위비티",
                p_first,
                p_last,
            )
    return sum_inserted, sum_updated


def run_allforyoung(
    client,
    page_batch_size: int,
    sleep_batch_odd: int,
    sleep_batch_even: int,
) -> tuple[int, int]:
    session = requests.Session()
    session.headers.update(
        {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                "Chrome/120.0.0.0 Safari/537.36"
            ),
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "ko-KR,ko;q=0.9",
            "Accept-Encoding": "gzip, deflate",
        }
    )
    page = 1
    batch_idx = 0
    sum_inserted = sum_updated = 0
    while page <= ALLFORYOUNG_MAX_PAGES and not _stop.is_set():
        batch_idx += 1
        batch_pages: list[tuple[int, list[dict]]] = []
        for _ in range(page_batch_size):
            if page > ALLFORYOUNG_MAX_PAGES or _stop.is_set():
                break
            try:
                rows = fetch_allforyoung_contest_page(session, page)
            except Exception as e:
                log.exception("요즘것들 목록 페이지 %s 오류: %s", page, e)
                return sum_inserted, sum_updated
            if not rows:
                log.warning(
                    "요즘것들 페이지 %s — 파싱된 목록 0건, 여기서 중단 (사이트 구조·차단·응답 확인 필요)",
                    page,
                )
                break
            batch_pages.append((page, rows))
            page += 1

        if not batch_pages:
            break

        ordered_rows: list[dict] = []
        seen_ids: set[str] = set()
        for _, rows in batch_pages:
            for r in rows:
                rid = r["id"]
                if rid in seen_ids:
                    continue
                seen_ids.add(rid)
                ordered_rows.append(r)

        ids = [r["id"] for r in ordered_rows]
        existing_before = fetch_existing_contests(client, SOURCE_ALLFORYOUNG, ids)
        now = iso_now()
        to_upsert = []
        for r in ordered_rows:
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
        inserted = sum(1 for r in ordered_rows if r["id"] not in existing_before)
        updated = len(ordered_rows) - inserted
        sum_inserted += inserted
        sum_updated += updated
        p_first, p_last = batch_pages[0][0], batch_pages[-1][0]
        log.info(
            "요즘것들 페이지 %s~%s: contests 테이블 %s건 반영 (신규 %s, 기존 id 갱신 %s)",
            p_first,
            p_last,
            len(ordered_rows),
            inserted,
            updated,
        )
        if not _stop.is_set():
            sleep_after_batch(
                batch_idx,
                sleep_batch_odd,
                sleep_batch_even,
                "요즘것들",
                p_first,
                p_last,
            )
    return sum_inserted, sum_updated


def _fetch_existing_ids(client, table: str, id_col: str, ids: list[str]) -> set[str]:
    found: set[str] = set()
    for batch in chunked(list(dict.fromkeys(ids)), ID_CHUNK):
        q = client.table(table).select(id_col).in_(id_col, batch)
        res = q.execute()
        for row in res.data or []:
            found.add(str(row[id_col]))
    return found


def run_kstartup(
    client,
    service_key: str,
    page_batch_size: int,
    sleep_batch_odd: int,
    sleep_batch_even: int,
) -> None:
    rows_per_page = get_kstartup_num_of_rows()
    biz_last, ann_last = probe_last_pages(service_key)
    biz_range = f"1~{biz_last}" if biz_last else "범위 조회 실패(스킵)"
    ann_range = f"1~{ann_last}" if ann_last else "범위 조회 실패(스킵)"
    log.info(
        "K-Startup 범위 — 통합지원 %s페이지, 공고 %s페이지 (API 페이지당 최대 %s건, 배치 크기 %s·배치 간 대기 %s/%s초)",
        biz_range,
        ann_range,
        rows_per_page,
        page_batch_size,
        sleep_batch_odd,
        sleep_batch_even,
    )
    max_p = max(biz_last, ann_last)
    biz_new_total = ann_new_total = 0
    biz_upd_total = ann_upd_total = 0

    p = 1
    batch_idx = 0
    while p <= max_p and not _stop.is_set():
        batch_idx += 1
        pages_in_batch: list[int] = []
        for _ in range(page_batch_size):
            if p > max_p or _stop.is_set():
                break
            pages_in_batch.append(p)
            p += 1
        if not pages_in_batch:
            break

        p_first, p_last = pages_in_batch[0], pages_in_batch[-1]

        batch_biz_rows = batch_ann_rows = 0
        batch_biz_new = batch_biz_upd = batch_ann_new = batch_ann_upd = 0

        for pg in pages_in_batch:
            if _stop.is_set():
                break
            biz_rows: list = []
            ann_rows: list = []
            biz_new_pg = biz_upd_pg = 0
            ann_new_pg = ann_upd_pg = 0

            if pg <= biz_last:
                try:
                    biz_rows, bmeta = fetch_business_page(service_key, pg)
                    if bmeta.get("current_count", 0) == 0:
                        biz_rows = []
                except Exception as e:
                    log.exception("K-Startup 통합지원 page %s: %s", pg, e)
            if pg <= ann_last:
                try:
                    ann_rows, ameta = fetch_announcement_page(service_key, pg)
                    if ameta.get("current_count", 0) == 0:
                        ann_rows = []
                except Exception as e:
                    log.exception("K-Startup 공고 page %s: %s", pg, e)

            if biz_rows:
                ids = [r["id"] for r in biz_rows]
                existed = _fetch_existing_ids(client, "startup_business", "id", ids)
                biz_new_pg = sum(1 for i in ids if i not in existed)
                biz_upd_pg = len(biz_rows) - biz_new_pg
                ts = iso_now()
                for r in biz_rows:
                    r["updated_at"] = ts
                client.table("startup_business").upsert(biz_rows, on_conflict="id").execute()
                biz_new_total += biz_new_pg
                biz_upd_total += biz_upd_pg
                batch_biz_rows += len(biz_rows)
                batch_biz_new += biz_new_pg
                batch_biz_upd += biz_upd_pg

            if ann_rows:
                sns = [r["pbanc_sn"] for r in ann_rows]
                existed = _fetch_existing_ids(client, "startup_announcement", "pbanc_sn", sns)
                ann_new_pg = sum(1 for s in sns if s not in existed)
                ann_upd_pg = len(ann_rows) - ann_new_pg
                ts_ann = iso_now()
                for r in ann_rows:
                    r["updated_at"] = ts_ann
                client.table("startup_announcement").upsert(ann_rows, on_conflict="pbanc_sn").execute()
                ann_new_total += ann_new_pg
                ann_upd_total += ann_upd_pg
                batch_ann_rows += len(ann_rows)
                batch_ann_new += ann_new_pg
                batch_ann_upd += ann_upd_pg

        biz_part = (
            f"통합지원 {batch_biz_rows}건 upsert (신규 {batch_biz_new}, 기존행 갱신 {batch_biz_upd})"
            if batch_biz_rows
            else "통합지원 API 0건(또는 해당 구간 스킵)"
        )
        ann_part = (
            f"공고 {batch_ann_rows}건 upsert (신규 {batch_ann_new}, 기존행 갱신 {batch_ann_upd})"
            if batch_ann_rows
            else "공고 API 0건(또는 해당 구간 스킵)"
        )
        log.info(
            "K-Startup 배치 API페이지 %s~%s / %s: %s | %s | 누적: 통합 신규 %s·갱신 %s, 공고 신규 %s·갱신 %s",
            p_first,
            p_last,
            max_p,
            biz_part,
            ann_part,
            biz_new_total,
            biz_upd_total,
            ann_new_total,
            ann_upd_total,
        )

        if not _stop.is_set():
            sleep_after_batch(
                batch_idx,
                sleep_batch_odd,
                sleep_batch_even,
                "K-Startup",
                p_first,
                p_last,
            )

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


def run_refresh_wevity_dday(
    client_factory,
    page_batch_size: int,
    sleep_batch_odd: int,
    sleep_batch_even: int,
) -> None:
    session = requests.Session()
    session.headers.update(WEVITY_HEADERS)
    all_rows: list[dict] = []
    page = 1
    batch_idx = 0
    while page <= WEVITY_MAX_PAGES and not _stop.is_set():
        batch_idx += 1
        batch_first = page
        got_any = False
        for _ in range(page_batch_size):
            if page > WEVITY_MAX_PAGES or _stop.is_set():
                break
            try:
                rows = fetch_wevity_list_page(session, page)
            except Exception as e:
                log.exception("위비티 D-day 목록 %s: %s", page, e)
                page = WEVITY_MAX_PAGES + 1
                break
            if not rows:
                page = WEVITY_MAX_PAGES + 1
                break
            all_rows.extend(rows)
            got_any = True
            page += 1
        if got_any and not _stop.is_set():
            sleep_after_batch(
                batch_idx,
                sleep_batch_odd,
                sleep_batch_even,
                "위비티 D-day",
                batch_first,
                page - 1,
            )
    log.info("위비티 D-day 갱신: 목록 %s건 병렬 업데이트", len(all_rows))
    _refresh_dday_pool(client_factory, SOURCE_WEVITY, all_rows)


def run_refresh_allforyoung_dday(
    client_factory,
    page_batch_size: int,
    sleep_batch_odd: int,
    sleep_batch_even: int,
) -> None:
    session = requests.Session()
    session.headers.update(
        {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                "Chrome/120.0.0.0 Safari/537.36"
            ),
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "ko-KR,ko;q=0.9",
            "Accept-Encoding": "gzip, deflate",
        }
    )
    all_rows: list[dict] = []
    page = 1
    batch_idx = 0
    while page <= ALLFORYOUNG_MAX_PAGES and not _stop.is_set():
        batch_idx += 1
        batch_first = page
        got_any = False
        for _ in range(page_batch_size):
            if page > ALLFORYOUNG_MAX_PAGES or _stop.is_set():
                break
            try:
                rows = fetch_allforyoung_contest_page(session, page)
            except Exception as e:
                log.exception("요즘것들 D-day 목록 %s: %s", page, e)
                page = ALLFORYOUNG_MAX_PAGES + 1
                break
            if not rows:
                page = ALLFORYOUNG_MAX_PAGES + 1
                break
            all_rows.extend(rows)
            got_any = True
            page += 1
        if got_any and not _stop.is_set():
            sleep_after_batch(
                batch_idx,
                sleep_batch_odd,
                sleep_batch_even,
                "요즘것들 D-day",
                batch_first,
                page - 1,
            )
    log.info("요즘것들 D-day 갱신: 목록 %s건 병렬 업데이트", len(all_rows))
    _refresh_dday_pool(client_factory, SOURCE_ALLFORYOUNG, all_rows)


def run_one_cycle(client, new_client, args: argparse.Namespace) -> None:
    """한 사이클: 공모전(요즘것들) → 알림 → K-Startup → (호출 측에서 선택 D-day)."""
    pb = args.page_batch_size
    so, se = args.sleep_batch_odd, args.sleep_batch_even
    kpb = args.kstartup_page_batch_size
    kso, kse = args.kstartup_sleep_batch_odd, args.kstartup_sleep_batch_even
    sk = args.single_cycle
    force = args.force_daily
    today_kst = kstartup_calendar_date_kst()

    def _contest_pipeline() -> None:
        log.info("요즘것들 공모전 크롤링 시작")
        a_ins, a_upd = run_allforyoung(client, pb, so, se)
        if _stop.is_set():
            return
        notify_contest_cycle_summary(client, 0, 0, a_ins, a_upd)

    if sk and not force and _crawl_log_has_success(client, JOB_CONTEST_CRAWL, today_kst):
        log.info(
            "contest_crawl — crawl_logs 에 오늘(KST %s) success 있음 — 스킵",
            today_kst,
        )
    elif sk:
        started = iso_now()
        try:
            _contest_pipeline()
            if not _stop.is_set():
                _crawl_log_upsert(client, JOB_CONTEST_CRAWL, today_kst, "success", None, started)
        except Exception as e:
            log.exception("공모전 수집 중 오류")
            if not _stop.is_set():
                _crawl_log_upsert(client, JOB_CONTEST_CRAWL, today_kst, "fail", str(e), started)
            raise
    else:
        _contest_pipeline()

    if _stop.is_set():
        return

    log.info("K-Startup 창업 크롤링 시작")
    if not K_START_UP_SERVICE:
        log.warning("K_START_UP_SERVICE 미설정 — 창업 단계 건너뜀 (.env에 추가)")
    elif sk and not force and _crawl_log_has_success(client, JOB_KSTARTUP_CRAWL, today_kst):
        log.info(
            "kstartup_crawl — crawl_logs 에 오늘(KST %s) success 있음 — 스킵",
            today_kst,
        )
    elif kstartup_should_skip_daily_public_api(client):
        log.info(
            "K-Startup 공공 API — kstartup_crawl_state.updated_at 이 오늘(한국 %s) — 스킵",
            kstartup_calendar_date_kst(),
        )
    elif sk:
        started_k = iso_now()
        try:
            run_kstartup(client, K_START_UP_SERVICE, kpb, kso, kse)
            if not _stop.is_set():
                _crawl_log_upsert(
                    client, JOB_KSTARTUP_CRAWL, today_kst, "success", None, started_k
                )
        except Exception as e:
            log.exception("K-Startup 수집 중 오류")
            if not _stop.is_set():
                _crawl_log_upsert(
                    client, JOB_KSTARTUP_CRAWL, today_kst, "fail", str(e), started_k
                )
            raise
    else:
        run_kstartup(client, K_START_UP_SERVICE, kpb, kso, kse)


def main() -> None:
    parser = argparse.ArgumentParser(description="로컬 크롤 서버 (요즘것들 → K-Startup 반복)")
    parser.add_argument(
        "--single-cycle",
        action="store_true",
        help="한 사이클만 수행 후 종료 (GitHub Actions 일일 스케줄, crawl_logs 로 당일 중복 방지)",
    )
    parser.add_argument(
        "--force-daily",
        action="store_true",
        help="--single-cycle 일 때 crawl_logs 당일 success 가 있어도 공모전·K-Startup 다시 실행",
    )
    parser.add_argument(
        "--dday-refresh",
        action="store_true",
        help="각 사이클 끝에 refresh-* 엣지와 같이 목록만 돌며 d_day 갱신",
    )
    parser.add_argument(
        "--page-batch-size",
        type=int,
        default=1,
        metavar="N",
        help=(
            "요즘것들 목록 페이지 N개를 묶어 처리한 뒤 대기 1회. "
            "배치당 contests upsert 1회; K-Startup은 `--kstartup-*` 옵션으로 별도"
        ),
    )
    parser.add_argument(
        "--sleep-batch-odd",
        type=int,
        default=10,
        metavar="SEC",
        help="배치 1·3·5… 처리 후 대기 초 (기존 홀수 페이지 10초와 동일)",
    )
    parser.add_argument(
        "--sleep-batch-even",
        type=int,
        default=20,
        metavar="SEC",
        help="배치 2·4·6… 처리 후 대기 초 (기존 짝수 페이지 20초와 동일)",
    )
    parser.add_argument(
        "--kstartup-page-batch-size",
        type=int,
        default=5,
        metavar="N",
        help=(
            "K-Startup 전용: 통합·공고 API 목록 페이지 N개를 연속 처리한 뒤 대기 1회 "
            "(요즘것들의 --page-batch-size와 별도; 기본 5)"
        ),
    )
    parser.add_argument(
        "--kstartup-sleep-batch-odd",
        type=int,
        default=1,
        metavar="SEC",
        help="K-Startup 배치 1·3·5… 처리 후 대기 초 (기본 1)",
    )
    parser.add_argument(
        "--kstartup-sleep-batch-even",
        type=int,
        default=2,
        metavar="SEC",
        help="K-Startup 배치 2·4·6… 처리 후 대기 초 (기본 2)",
    )
    parser.add_argument(
        "--cycle-wait-minutes",
        type=int,
        default=180,
        metavar="M",
        help="한 사이클(공모전·K-Startup·선택 D-day) 종료 후 다음 사이클까지 대기 분 (기본 180=3시간). 0이면 바로 반복",
    )
    args = parser.parse_args()
    if args.page_batch_size < 1:
        parser.error("--page-batch-size 는 1 이상이어야 합니다.")
    if args.kstartup_page_batch_size < 1:
        parser.error("--kstartup-page-batch-size 는 1 이상이어야 합니다.")
    if args.cycle_wait_minutes < 0:
        parser.error("--cycle-wait-minutes 는 0 이상이어야 합니다.")
    if args.force_daily and not args.single_cycle:
        parser.error("--force-daily 는 --single-cycle 과 함께만 사용할 수 있습니다.")

    signal.signal(signal.SIGINT, _signal_handler)
    signal.signal(signal.SIGTERM, _signal_handler)

    client = get_supabase_admin_client()

    def new_client():
        return get_supabase_admin_client()

    pb = args.page_batch_size
    so, se = args.sleep_batch_odd, args.sleep_batch_even
    if pb > 1:
        log.info(
            "페이지 배치 크기 %s — 배치마다 대기 홀수 %ss / 짝수 %ss (대상 사이트·공공 API 요청은 배치 안에서 연속)",
            pb,
            so,
            se,
        )

    if args.single_cycle:
        log.info("========== 단일 크롤링 사이클 (crawl_logs / GitHub Actions) ==========")
        run_one_cycle(client, new_client, args)
        if not _stop.is_set() and args.dday_refresh:
            log.info("========== D-day 갱신 (요즘것들) ==========")
            run_refresh_allforyoung_dday(new_client, pb, so, se)
        log.info("단일 사이클 종료")
        return

    cycle_n = 0
    while not _stop.is_set():
        cycle_n += 1
        log.info("========== %s번째 크롤링 사이클을 시작합니다 ==========", cycle_n)
        run_one_cycle(client, new_client, args)
        if _stop.is_set():
            break
        if args.dday_refresh:
            log.info("========== D-day 갱신 (요즘것들) ==========")
            run_refresh_allforyoung_dday(new_client, pb, so, se)
        log.info("크롤링 종료")
        wait_between_cycles(args.cycle_wait_minutes)


if __name__ == "__main__":
    main()
