"""
allforyoung 웹 테이블 뷰어
- 크롤링 데이터를 테이블로 표시
- 새로고침 시 최신 정보 반영
"""

import json
import sqlite3
from datetime import datetime
from pathlib import Path

from flask import Flask, jsonify, render_template, request

from crawler import crawl_contest_page, crawl_post_detail

app = Flask(__name__)
DB_PATH = Path(__file__).parent / "data" / "contests.db"


def get_db():
    """DB 연결 및 테이블 초기화"""
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db(conn):
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS contests (
            id TEXT PRIMARY KEY,
            title TEXT,
            d_day TEXT,
            host TEXT,
            url TEXT,
            category TEXT,
            created_at TEXT,
            first_seen_at TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_created ON contests(created_at DESC);
    """)
    conn.commit()


def save_contests(conn, contests: list[dict]) -> tuple[int, int]:
    """크롤링 결과 저장, (전체 수, 새로 추가된 수) 반환"""
    now = datetime.now().isoformat()
    new_count = 0
    for c in contests:
        if "error" in c:
            continue
        cur = conn.execute("SELECT 1 FROM contests WHERE id = ?", (c["id"],))
        is_new = cur.fetchone() is None
        if is_new:
            new_count += 1
        conn.execute(
            """INSERT INTO contests (id, title, d_day, host, url, category, created_at, first_seen_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(id) DO UPDATE SET
                 title=excluded.title, d_day=excluded.d_day, host=excluded.host,
                 url=excluded.url, category=excluded.category, created_at=excluded.created_at
            """,
            (
                c["id"],
                c.get("title", ""),
                c.get("d_day", ""),
                c.get("host", ""),
                c.get("url", ""),
                c.get("category", "공모전"),
                now,
                now if is_new else None,
            ),
        )
    # ON CONFLICT 시 first_seen_at 유지 (기존값 사용)
    conn.execute(
        "UPDATE contests SET first_seen_at = COALESCE(first_seen_at, created_at) WHERE first_seen_at IS NULL"
    )
    conn.commit()
    return len([x for x in contests if "error" not in x]), new_count


def get_all_contests(conn) -> tuple[list[dict], str | None]:
    """저장된 공고 목록 조회 (최신순), 마지막 업데이트 시간"""
    rows = conn.execute(
        "SELECT id, title, d_day, host, url, category, created_at FROM contests "
        "ORDER BY created_at DESC"
    ).fetchall()
    last = conn.execute("SELECT MAX(created_at) FROM contests").fetchone()[0]
    return [dict(r) for r in rows], last


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/contests")
def api_contests():
    """저장된 공고 목록 API"""
    conn = get_db()
    init_db(conn)
    try:
        contests, last_updated = get_all_contests(conn)
        return jsonify({"success": True, "data": contests, "last_updated": last_updated})
    finally:
        conn.close()


@app.route("/api/post/<post_id>")
def api_post(post_id):
    """상세 페이지 내용 크롤링"""
    try:
        detail = crawl_post_detail(post_id)
        if detail:
            return jsonify({"success": True, "data": detail})
        return jsonify({"success": False, "error": "상세 내용을 가져올 수 없습니다."}), 404
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/refresh", methods=["POST"])
def api_refresh():
    """크롤링 실행 및 DB 갱신"""
    pages = request.json.get("pages", 3) if request.is_json else 3
    try:
        contests = crawl_contest_page(page=1, max_pages=min(int(pages), 10))
        conn = get_db()
        init_db(conn)
        total, new_count = save_contests(conn, contests)
        conn.close()
        return jsonify({
            "success": True,
            "total": total,
            "new": new_count,
            "message": f"총 {total}건 수집 (신규 {new_count}건)",
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


if __name__ == "__main__":
    app.run(debug=True, port=5000)
