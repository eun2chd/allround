"""
위비티(wevity.com) 공모전만 수집하는 로컬 워커.
한 사이클(전체 목록·배치 처리)이 끝난 뒤 지정 시간(기본 8시간) 대기 후 반복합니다.

기존 crawl_server.py(요즘것들·K-Startup 포함)는 수정하지 않으며, 이 파일만 별도로 실행합니다.

  python crawl_wevity_only_loop.py
  python crawl_wevity_only_loop.py --single-cycle          # 1회만 하고 종료
  python crawl_wevity_only_loop.py --sleep-hours 12      # 사이클 간 12시간 대기
  python crawl_wevity_only_loop.py --page-batch-size 2   # crawl_server 와 동일 옵션
"""

from __future__ import annotations

import argparse
import logging
import signal

from config import get_supabase_admin_client
from crawl_server import (
    _signal_handler,
    _stop,
    notify_contest_cycle_summary,
    run_wevity,
    wait_between_cycles,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
log = logging.getLogger("crawl_wevity_only")

for _logger_name in ("httpx", "httpcore", "hpack"):
    logging.getLogger(_logger_name).setLevel(logging.WARNING)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="위비티만 반복 크롤링 (사이클 간 기본 8시간 대기)",
    )
    parser.add_argument(
        "--sleep-hours",
        type=float,
        default=8.0,
        metavar="H",
        help="한 사이클 종료 후 다음 사이클까지 대기 시간(시간). 기본 8. 0이면 바로 반복",
    )
    parser.add_argument(
        "--single-cycle",
        action="store_true",
        help="위비티 1사이클만 실행 후 종료",
    )
    parser.add_argument(
        "--page-batch-size",
        type=int,
        default=1,
        metavar="N",
        help="목록 페이지 N개를 묶은 뒤 대기 1회 (crawl_server 와 동일)",
    )
    parser.add_argument(
        "--sleep-batch-odd",
        type=int,
        default=10,
        metavar="SEC",
        help="배치 1·3·5… 처리 후 대기 초",
    )
    parser.add_argument(
        "--sleep-batch-even",
        type=int,
        default=20,
        metavar="SEC",
        help="배치 2·4·6… 처리 후 대기 초",
    )
    args = parser.parse_args()
    if args.page_batch_size < 1:
        parser.error("--page-batch-size 는 1 이상이어야 합니다.")
    if args.sleep_hours < 0:
        parser.error("--sleep-hours 는 0 이상이어야 합니다.")

    signal.signal(signal.SIGINT, _signal_handler)
    signal.signal(signal.SIGTERM, _signal_handler)

    client = get_supabase_admin_client()
    pb, so, se = args.page_batch_size, args.sleep_batch_odd, args.sleep_batch_even
    wait_minutes = max(0, int(round(args.sleep_hours * 60)))

    cycle_n = 0
    while not _stop.is_set():
        cycle_n += 1
        log.info("========== 위비티 전용 크롤링 사이클 %s 시작 ==========", cycle_n)
        w_ins, w_upd = run_wevity(client, pb, so, se)
        if _stop.is_set():
            break
        # 요즘것들·K-Startup 은 건너뛰고, 알림만 위비티 건수로 합산(기존 함수 재사용)
        notify_contest_cycle_summary(client, w_ins, w_upd, 0, 0)
        if args.single_cycle:
            log.info("단일 사이클 종료")
            break
        log.info("위비티 사이클 완료 — 다음 사이클까지 약 %s시간(%s분) 대기", args.sleep_hours, wait_minutes)
        wait_between_cycles(wait_minutes)

    log.info("위비티 전용 워커 종료")


if __name__ == "__main__":
    main()
