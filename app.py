"""
allforyoung 웹 테이블 뷰어
- Supabase Auth 로그인
- 크롤링 데이터를 테이블로 표시
"""

import logging
import sqlite3
import traceback
from datetime import datetime, timezone
from pathlib import Path

from flask import Flask, flash, jsonify, redirect, render_template, request, session, url_for

import re

from config import get_supabase_client, get_supabase_admin_client, get_supabase_storage_client, get_supabase_client_with_auth
from crawler import crawl_contest_page, crawl_post_detail


def _validate_password(password: str) -> bool:
    """숫자 6자 이상 + 특수문자 1개 이상"""
    if not password or len(password) < 7:
        return False
    digits = len(re.findall(r"\d", password))
    has_special = bool(re.search(r'[!@#$%^&*()_+\-=[\]{}|;\':",.<>?/`~\\]', password))
    return digits >= 6 and has_special


logging.basicConfig(
    level=logging.DEBUG,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("allyoung")

app = Flask(__name__)
app.secret_key = "allyoung-dev-secret-change-in-production"
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


def _presence_insert(user_id: str):
    """로그인 시 presence에 추가 (online=true)"""
    if not user_id:
        return
    try:
        supabase = get_supabase_admin_client()
        now = datetime.now(timezone.utc).isoformat()
        supabase.table("presence").upsert(
            {"user_id": user_id, "last_seen": now, "online": True},
            on_conflict="user_id",
        ).execute()
    except Exception as e:
        logger.error("[presence] insert 실패: %s", e)


def _presence_logout(user_id: str):
    """로그아웃 시 presence에서 online=false, last_seen 갱신"""
    if not user_id:
        return
    try:
        supabase = get_supabase_admin_client()
        now = datetime.now(timezone.utc).isoformat()
        supabase.table("presence").upsert(
            {"user_id": user_id, "last_seen": now, "online": False},
            on_conflict="user_id",
        ).execute()
    except Exception as e:
        logger.error("[presence] logout 실패: %s", e)


def _ensure_session_in_presence():
    """현재 세션 사용자를 presence에 넣음 (로그인 폼 안 탄 경우 대비)"""
    if not session.get("logged_in"):
        return
    user_id = str(session.get("user_id") or "").strip()
    if not user_id or user_id.lower() == "none":
        email = session.get("email")
        if email:
            try:
                supabase = get_supabase_client()
                r = supabase.table("profiles").select("id").eq("email", email).limit(1).execute()
                if r.data and r.data[0]:
                    user_id = str(r.data[0]["id"])
                    session["user_id"] = user_id
            except Exception:
                pass
    if user_id:
        _presence_insert(user_id)


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
    if session.get("logged_in"):
        return redirect(url_for("home"))
    return redirect(url_for("login_page"))


@app.route("/login", methods=["GET", "POST"])
def login_page():
    if request.method == "POST":
        email = request.form.get("email", "").strip()
        password = request.form.get("password", "")
        if not email or "@" not in email:
            flash("이메일 형식이 올바르지 않습니다.")
            return render_template("login.html")
        if not password:
            flash("비밀번호를 입력해 주세요.")
            return render_template("login.html")
        try:
            logger.info("로그인 시도: email=%s", email[:3] + "***" if len(email) > 3 else email)
            supabase = get_supabase_client()
            response = supabase.auth.sign_in_with_password({"email": email, "password": password})
            user = response.user
            session["logged_in"] = True
            session["email"] = user.email or email
            session["access_token"] = response.session.access_token
            session["refresh_token"] = response.session.refresh_token
            profile = supabase.table("profiles").select("id, nickname, profile_url, role").eq("email", user.email or email).limit(1).execute()
            if profile.data and len(profile.data) > 0:
                session["user_id"] = str(profile.data[0]["id"])
                session["nickname"] = profile.data[0].get("nickname", "")
                session["profile_url"] = profile.data[0].get("profile_url") or ""
                session["role"] = profile.data[0].get("role", "member")
            else:
                session["user_id"] = str(user.id)
                session["nickname"] = user.user_metadata.get("nickname", "") if user.user_metadata else ""
                session["profile_url"] = ""
                session["role"] = "member"
            if not session.get("user_id"):
                session["user_id"] = str(user.id)
            _presence_insert(str(user.id))
            logger.info("로그인 성공: user_id=%s, nickname=%s", session.get("user_id"), session.get("nickname"))
            return redirect(url_for("home"))
        except Exception as e:
            err_msg = str(e)
            err_type = type(e).__name__
            logger.error("로그인 실패: %s - %s", err_type, err_msg)
            logger.debug("트레이스백:\n%s", traceback.format_exc())
            err_lower = err_msg.lower()
            if "email not confirmed" in err_lower:
                flash("이메일 인증이 완료되지 않았습니다. 인증 메일을 확인해 주세요.")
            elif "invalid login" in err_lower or "invalid_credentials" in err_lower or "invalid grant" in err_lower:
                flash("이메일 또는 비밀번호가 올바르지 않습니다.")
            elif "user not found" in err_lower:
                flash("등록되지 않은 이메일입니다.")
            elif "too many requests" in err_lower or "rate limit" in err_lower:
                flash("요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.")
            elif "email not validated" in err_lower:
                flash("이메일 인증이 필요합니다. 인증 메일을 확인해 주세요.")
            else:
                flash("로그인에 실패했습니다. 다시 시도해 주세요.")
            return render_template("login.html")
    return render_template("login.html")


@app.route("/logout")
def logout():
    user_id = str(session.get("user_id") or "")
    session.clear()
    _presence_logout(user_id)
    return redirect(url_for("login_page"))


@app.route("/mypage/password", methods=["GET", "POST"])
def mypage_password():
    """비밀번호 변경"""
    if not session.get("logged_in"):
        return redirect(url_for("login_page"))
    if request.method == "POST":
        password = request.form.get("password", "")
        password_confirm = request.form.get("password_confirm", "")
        if not _validate_password(password):
            flash("비밀번호는 숫자 6자 이상 + 특수문자 1개 이상을 포함해야 합니다.", "error")
            return render_template("mypage_password.html")
        if password != password_confirm:
            flash("비밀번호가 일치하지 않습니다.", "error")
            return render_template("mypage_password.html")
        try:
            supabase = get_supabase_client()
            access_token = session.get("access_token")
            refresh_token = session.get("refresh_token")
            if access_token and refresh_token:
                supabase.auth.set_session(access_token, refresh_token)
            supabase.auth.update_user({"password": password})
            flash("비밀번호가 변경되었습니다.")
            return redirect(url_for("mypage_user", user_id=session.get("user_id", "")))
        except Exception as e:
            logger.error("비밀번호 변경 실패: %s", e)
            flash("비밀번호 변경에 실패했습니다. 다시 시도해 주세요.", "error")
            return render_template("mypage_password.html")
    return render_template("mypage_password.html")


@app.route("/signup", methods=["GET", "POST"])
def signup():
    if request.method == "POST":
        email = request.form.get("email", "").strip()
        password = request.form.get("password", "")
        password_confirm = request.form.get("password_confirm", "")
        nickname = request.form.get("nickname", "").strip()
        if not email or "@" not in email:
            flash("이메일 형식이 올바르지 않습니다.", "error")
            return render_template("signup.html")
        if not _validate_password(password):
            flash("비밀번호는 숫자 6자 이상 + 특수문자 1개 이상을 포함해야 합니다.", "error")
            return render_template("signup.html")
        if password != password_confirm:
            flash("비밀번호가 일치하지 않습니다.", "error")
            return render_template("signup.html")
        if not nickname:
            flash("닉네임을 입력해 주세요.", "error")
            return render_template("signup.html")
        try:
            supabase = get_supabase_client()
            email_r = supabase.table("profiles").select("id").eq("email", email).limit(1).execute()
            if email_r.data:
                flash("이미 사용 중인 이메일입니다.", "error")
                return render_template("signup.html")
            nick_r = supabase.table("profiles").select("id").eq("nickname", nickname).limit(1).execute()
            if nick_r.data:
                flash("이미 사용 중인 닉네임입니다.", "error")
                return render_template("signup.html")
            resp = supabase.auth.sign_up({
                "email": email,
                "password": password,
                "options": {"data": {"nickname": nickname}},
            })
            auth_user_id = str(resp.user.id)
            supabase.table("profiles").upsert(
                {"id": auth_user_id, "email": email, "nickname": nickname, "role": "member"},
                on_conflict="id",
            ).execute()
            return redirect(url_for("signup_complete"))
        except Exception as e:
            err_msg = str(e)
            logger.error("회원가입 실패: %s", err_msg)
            if "already registered" in err_msg.lower() or "already exists" in err_msg.lower():
                flash("이미 등록된 이메일입니다.", "error")
            else:
                flash("회원가입에 실패했습니다. 다시 시도해 주세요.", "error")
            return render_template("signup.html")
    return render_template("signup.html")


@app.route("/signup/complete")
def signup_complete():
    return render_template("signup_complete.html")


@app.route("/api/check-email")
def api_check_email():
    """이메일 중복 체크"""
    email = request.args.get("email", "").strip()
    if not email or "@" not in email:
        return jsonify({"exists": False})
    try:
        supabase = get_supabase_client()
        r = supabase.table("profiles").select("id").eq("email", email).limit(1).execute()
        return jsonify({"exists": len(r.data) > 0})
    except Exception as e:
        logger.error("이메일 체크 실패: %s", e)
        return jsonify({"exists": False, "error": str(e)}), 500


@app.route("/api/check-nickname")
def api_check_nickname():
    """닉네임 중복 체크"""
    nickname = request.args.get("nickname", "").strip()
    if not nickname:
        return jsonify({"exists": False})
    try:
        supabase = get_supabase_client()
        r = supabase.table("profiles").select("id").eq("nickname", nickname).limit(1).execute()
        return jsonify({"exists": len(r.data) > 0})
    except Exception as e:
        logger.error("닉네임 체크 실패: %s", e)
        return jsonify({"exists": False, "error": str(e)}), 500


@app.route("/api/debug/presence")
def api_debug_presence():
    """presence 디버그 (개발용) - 테이블 조회 + 지금 유저로 INSERT 시도"""
    try:
        r = get_supabase_admin_client().table("presence").select("user_id, last_seen").execute()
        rows = [{"user_id": p.get("user_id"), "last_seen": p.get("last_seen")} for p in (r.data or [])]
    except Exception as e:
        rows = [{"error": str(e)}]
    test_insert = None
    if session.get("logged_in"):
        uid = str(session.get("user_id") or "")
        try:
            get_supabase_admin_client().table("presence").upsert(
                {"user_id": uid, "last_seen": datetime.now(timezone.utc).isoformat()},
                on_conflict="user_id",
            ).execute()
            test_insert = {"success": True, "user_id": uid}
        except Exception as e:
            test_insert = {"success": False, "user_id": uid, "error": str(e)}
    return jsonify({
        "session": {
            "logged_in": session.get("logged_in"),
            "user_id": str(session.get("user_id")) if session.get("user_id") else None,
            "email": session.get("email"),
        },
        "test_insert": test_insert,
        "presence_table": rows,
    })


@app.route("/api/me")
def api_me():
    """로그인된 사용자 정보 (닉네임, 프로필 이미지)"""
    if not session.get("logged_in"):
        return jsonify({"success": False, "error": "unauthorized"}), 401
    return jsonify({
        "success": True,
        "data": {
            "nickname": session.get("nickname", ""),
            "profile_url": session.get("profile_url", ""),
            "email": session.get("email", ""),
        },
    })


@app.route("/home")
def home():
    if not session.get("logged_in"):
        return redirect(url_for("login_page"))
    _ensure_session_in_presence()
    return render_template("index.html")


@app.route("/mypage")
def mypage():
    """내 마이페이지로 리다이렉트"""
    if not session.get("logged_in"):
        return redirect(url_for("login_page"))
    user_id = session.get("user_id")
    if not user_id:
        return redirect(url_for("login_page"))
    return redirect(url_for("mypage_user", user_id=user_id))


@app.route("/mypage/<user_id>")
def mypage_user(user_id):
    """사용자 프로필 페이지 (본인: 편집 가능, 타인: 읽기 전용)"""
    if not session.get("logged_in"):
        return redirect(url_for("login_page"))
    if not user_id:
        return redirect(url_for("mypage"))
    try:
        supabase = get_supabase_admin_client()
        r = supabase.table("profiles").select("id, nickname, profile_url, role, email").eq("id", user_id).limit(1).execute()
        if not r.data or len(r.data) == 0:
            return "사용자를 찾을 수 없습니다.", 404
        profile = r.data[0]
        profile["id"] = str(profile.get("id") or "")
        current_id = str(session.get("user_id") or "")
        is_own = profile["id"] == current_id
        role = profile.get("role", "member")
        role_label = "관리자" if role == "admin" else "팀원"
        return render_template(
            "mypage.html",
            profile=profile,
            role_label=role_label,
            is_own_profile=is_own,
        )
    except Exception as e:
        logger.error("마이페이지 조회 실패: %s", e, exc_info=True)
        return "오류가 발생했습니다.", 500


PROFILE_BUCKET = "profile"
ALLOWED_IMAGE_EXT = {"jpg", "jpeg", "png", "gif", "webp"}


@app.route("/api/profile/update-image", methods=["POST"])
def api_update_profile_image():
    """프로필 이미지 업로드 → profile 버킷 저장 → profiles.profile_url 업데이트"""
    if not session.get("logged_in"):
        return jsonify({"success": False, "error": "unauthorized"}), 401
    if "file" not in request.files and "image" not in request.files:
        return jsonify({"success": False, "error": "이미지 파일을 선택해 주세요."}), 400
    file = request.files.get("file") or request.files.get("image")
    if not file or file.filename == "":
        return jsonify({"success": False, "error": "파일이 없습니다."}), 400
    ext = (file.filename.rsplit(".", 1)[-1] or "").lower()
    if ext not in ALLOWED_IMAGE_EXT:
        return jsonify({"success": False, "error": f"허용된 형식: {', '.join(ALLOWED_IMAGE_EXT)}"}), 400
    user_id = session.get("user_id", "")
    access_token = session.get("access_token")
    refresh_token = session.get("refresh_token", "")
    if not user_id or not access_token:
        return jsonify({"success": False, "error": "사용자 정보가 없습니다."}), 401
    try:
        supabase = get_supabase_client_with_auth(access_token, refresh_token)
        file_path = f"private/{user_id}/avatar.{ext}"
        file_data = file.read()
        content_type = file.content_type or ("image/jpeg" if ext in ("jpg", "jpeg") else f"image/{ext}")
        supabase.storage.from_(PROFILE_BUCKET).upload(
            file=file_data,
            path=file_path,
            file_options={"content-type": content_type, "upsert": "true"},
        )
        url_result = supabase.storage.from_(PROFILE_BUCKET).get_public_url(file_path)
        profile_url = url_result
        email = session.get("email")
        r = supabase.table("profiles").update({"profile_url": profile_url}).eq("email", email).execute()
        if r.data or True:
            session["profile_url"] = profile_url
            return jsonify({"success": True, "profile_url": profile_url})
        return jsonify({"success": False, "error": "프로필 업데이트 실패"}), 400
    except Exception as e:
        logger.error("프로필 이미지 업로드 실패: %s", e)
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/contests/by-ids")
def api_contests_by_ids():
    """ID 목록으로 공고 조회 (최근 본 공고용)"""
    ids_param = request.args.get("ids", "")
    if not ids_param:
        return jsonify({"success": True, "data": []})
    ids = [x.strip() for x in ids_param.split(",") if x.strip()][:10]
    if not ids:
        return jsonify({"success": True, "data": []})
    conn = get_db()
    init_db(conn)
    try:
        placeholders = ",".join("?" * len(ids))
        rows = conn.execute(
            f"SELECT id, title, d_day, url FROM contests WHERE id IN ({placeholders})",
            ids,
        ).fetchall()
        by_id = {r["id"]: dict(r) for r in rows}
        ordered = [by_id[i] for i in ids if i in by_id]
        return jsonify({"success": True, "data": ordered})
    finally:
        conn.close()


@app.route("/api/users")
def api_users():
    """가입된 사용자 목록 (닉네임, 프로필, 접속 상태)"""
    if not session.get("logged_in"):
        return jsonify({"success": False, "error": "unauthorized"}), 401
    try:
        supabase = get_supabase_client()
        r = supabase.table("profiles").select("id, email, nickname, profile_url").order("nickname").execute()
        users = [{"id": str(u["id"]), "email": u.get("email", ""), "nickname": u.get("nickname", ""), "profile_url": u.get("profile_url") or ""} for u in (r.data or [])]
        current_id = str(session.get("user_id") or "")

        for u in users:
            u.pop("email", None)

        _ensure_session_in_presence()

        def _norm_id(x):
            return str(x or "").lower().strip()

        try:
            pres_r = get_supabase_admin_client().table("presence").select("user_id, last_seen, online").execute()
            pres_by_id = {}
            for p in (pres_r.data or []):
                pid = _norm_id(p.get("user_id"))
                if pid:
                    pres_by_id[pid] = {
                        "online": p.get("online", True),
                        "last_seen": p.get("last_seen"),
                    }
            for u in users:
                uid = _norm_id(u["id"])
                info = pres_by_id.get(uid)
                u["online"] = info["online"] if info else False
                u["last_seen"] = info["last_seen"] if info else None
        except Exception as ex:
            logger.warning("presence 조회 실패(RLS 확인): %s", ex)
            for u in users:
                u["online"] = False
        return jsonify({"success": True, "data": users, "current_user_id": current_id})
    except Exception as e:
        logger.error("사용자 목록 조회 실패: %s", e)
        return jsonify({"success": False, "error": str(e)}), 500


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
