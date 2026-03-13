"""
allforyoung 웹 테이블 뷰어
- Supabase Auth 로그인
- 크롤링 데이터를 Supabase contests 테이블에서 조회 (Realtime 구독)
"""

import logging
import traceback
import time
from datetime import datetime, timezone

from flask import Flask, flash, jsonify, redirect, render_template, request, session, url_for
import re

from config import get_supabase_client, get_supabase_admin_client, get_supabase_storage_client, get_supabase_client_with_auth
from crawler import crawl_post_detail, crawl_wevity_detail


def _validate_password(password: str) -> bool:
    """숫자 6자 이상 + 특수문자 1개 이상"""
    if not password or len(password) < 7:
        return False
    digits = len(re.findall(r"\d", password))
    has_special = bool(re.search(r'[!@#$%^&*()_+\-=[\]{}|;\':",.<>?/`~\\]', password))
    return digits >= 6 and has_special


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%H:%M:%S",
    force=True,
)
logger = logging.getLogger("allyoung")

app = Flask(__name__)
app.secret_key = "allyoung-dev-secret-change-in-production"


@app.context_processor
def inject_is_admin():
    """모든 템플릿에서 is_admin 사용 가능 (DB 기준)"""
    return {"is_admin": _is_admin()}


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
            profile = get_supabase_admin_client().table("profiles").select("id, nickname, profile_url, role").eq("id", str(user.id)).limit(1).execute()
            if profile.data and len(profile.data) > 0:
                session["user_id"] = str(profile.data[0]["id"])
                session["nickname"] = profile.data[0].get("nickname", "")
                session["profile_url"] = profile.data[0].get("profile_url") or ""
                session["role"] = (profile.data[0].get("role") or "member").lower().strip()
            else:
                session["user_id"] = str(user.id)
                session["nickname"] = user.user_metadata.get("nickname", "") if user.user_metadata else ""
                session["profile_url"] = ""
                session["role"] = "member"
            if not session.get("user_id"):
                session["user_id"] = str(user.id)
            _presence_insert(str(user.id))
            logger.info("로그인 성공: user_id=%s, nickname=%s, role=%s", session.get("user_id"), session.get("nickname"), session.get("role"))
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
    """로그인된 사용자 정보 (닉네임, 프로필 이미지, role은 profiles에서 조회)"""
    if not session.get("logged_in"):
        return jsonify({"success": False, "error": "unauthorized"}), 401
    role_from_db = "admin" if _is_admin() else "member"
    return jsonify({
        "success": True,
        "data": {
            "nickname": session.get("nickname", ""),
            "profile_url": session.get("profile_url", ""),
            "email": session.get("email", ""),
            "role": role_from_db,
        },
    })


@app.route("/home")
def home():
    if not session.get("logged_in"):
        return redirect(url_for("login_page"))
    _ensure_session_in_presence()
    from config import SUPABASE_ANON_KEY, SUPABASE_URL
    return render_template(
        "index.html",
        supabase_url=SUPABASE_URL or "",
        supabase_anon_key=SUPABASE_ANON_KEY or "",
    )


@app.route("/bookmarks")
def bookmarks_page():
    """즐겨찾기 페이지"""
    if not session.get("logged_in"):
        return redirect(url_for("login_page"))
    return render_template("bookmarks.html")


@app.route("/mypage")
def mypage():
    """내 마이페이지로 리다이렉트"""
    if not session.get("logged_in"):
        return redirect(url_for("login_page"))
    user_id = session.get("user_id")
    if not user_id:
        return redirect(url_for("login_page"))
    return redirect(url_for("mypage_user", user_id=user_id))


# 티어별 자동 헤드라인 (하드코딩)
HEADLINE_BY_TIER = {
    0: [  # BRONZE Lv.1~20
        "새로운 도전을 시작하는 크리에이터",
    ],
    1: [  # SILVER Lv.21~70
        "꾸준히 도전하며 성장 중인 크리에이터",
        "경험을 쌓아가는 실전형 도전자",
    ],
    2: [  # GOLD Lv.71~120
        "성과를 만들어내는 전략형 크리에이터",
        "경험을 실력으로 증명하는 도전자",
        "경쟁 속에서 결과를 남기는 크리에이터",
    ],
    3: [  # PLATINUM Lv.121~140
        "검증된 성과를 보유한 상위권 크리에이터",
        "전략과 실행을 겸비한 프로젝트 리더형",
        "꾸준한 수상과 결과로 증명하는 전문가",
        "경쟁을 즐기는 실전 최적화형 인재",
    ],
    4: [  # LEGEND Lv.141+
        "최고 등급의 성취를 보유한 레전드 크리에이터",
        "영향력을 만드는 최상위 성과자",
        "결과로 증명된 최고 수준의 도전자",
        "기준이 되는 퍼포먼스 크리에이터",
        "도전을 넘어 성취를 설계하는 상위 1%",
    ],
}


def _get_auto_headline(level: int, tier_level: int) -> str:
    """티어·레벨에 맞는 자동 헤드라인 1종 반환"""
    headlines = HEADLINE_BY_TIER.get(tier_level, HEADLINE_BY_TIER[0])
    idx = (level - 1) % len(headlines) if headlines else 0
    return headlines[idx] if headlines else "새로운 도전을 시작하는 크리에이터"


def _get_tier_from_level(level):
    """레벨 → tier_id (1~5), tier_name, tier_level(0~4, CSS용)"""
    if level <= 20:
        return 1, "BRONZE", 0
    if level <= 70:
        return 2, "SILVER", 1
    if level <= 120:
        return 3, "GOLD", 2
    if level <= 140:
        return 4, "PLATINUM", 3
    return 5, "LEGEND", 4


# exp_events: 행위별 경험치 (기본값)
EXP_AMOUNTS = {
    "content_check": 5,      # 내용확인
    "participate": 15,       # 참가
    "pass": 5,               # 패스
    "support_complete": 20,  # 지원완료 (참가상세 제출)
    "finalist": 300,         # 본선진출
    "award": 1000,           # 수상
}

EXP_ACTIVITY_LABELS = {
    "content_check": "내용확인",
    "participate": "참가",
    "pass": "패스",
    "support_complete": "지원완료",
    "finalist": "본선진출",
    "award": "수상",
}


def _grant_exp(supabase, user_id: str, activity_type: str, source: str, contest_id: str) -> int:
    """경험치 지급 (중복 방지). exp_events insert + profiles.total_exp 증가. 지급된 XP 반환."""
    if activity_type not in EXP_AMOUNTS:
        return 0
    exp_amount = EXP_AMOUNTS[activity_type]
    user_id = str(user_id or "").strip()
    source = str(source or "").strip()
    contest_id = str(contest_id or "").strip()
    if not user_id or not source or not contest_id:
        return 0
    try:
        r = supabase.table("exp_events").select("user_id").eq("user_id", user_id).eq("activity_type", activity_type).eq("source", source).eq("contest_id", contest_id).limit(1).execute()
        if r.data and len(r.data) > 0:
            return 0  # 이미 지급됨
        supabase.table("exp_events").insert({
            "user_id": user_id,
            "activity_type": activity_type,
            "source": source,
            "contest_id": contest_id,
            "exp_amount": exp_amount,
        }).execute()
        prof = supabase.table("profiles").select("total_exp").eq("id", user_id).limit(1).execute()
        cur = int((prof.data or [{}])[0].get("total_exp") or 0)
        supabase.table("profiles").update({"total_exp": cur + exp_amount}).eq("id", user_id).execute()
        return exp_amount
    except Exception as e:
        logger.warning("exp_events 지급 실패: %s", e)
        return 0


def _compute_level_from_exp(supabase, total_exp_val: int) -> int:
    """total_exp → 현재 레벨 산출 (level_config 기준, 조회 시 계산)"""
    if total_exp_val <= 0:
        return 1
    try:
        cfg = supabase.table("level_config").select("level, exp_to_next").order("level").execute()
        rows = cfg.data or []
        cumulative = 0
        level = 1
        for r in rows:
            lv = r.get("level", 0)
            exp_to = r.get("exp_to_next", 0)
            if total_exp_val >= cumulative:
                level = lv
            cumulative += exp_to
        return max(1, level)
    except Exception:
        return 1


def _get_tier_exp_milestones(supabase):
    """티어별 도달 누적 경험치 (level_config 기준) - 전체 레벨 구간 + 각 티어 도달 총 경험치"""
    milestones = [
        {"tier": "BRONZE", "level": 1, "exp": 0, "level_range": "Lv.1 ~ Lv.20"},
        {"tier": "SILVER", "level": 21, "exp": 0, "level_range": "Lv.21 ~ Lv.70"},
        {"tier": "GOLD", "level": 71, "exp": 0, "level_range": "Lv.71 ~ Lv.120"},
        {"tier": "PLATINUM", "level": 121, "exp": 0, "level_range": "Lv.121 ~ Lv.140"},
        {"tier": "LEGEND", "level": 141, "exp": 0, "level_range": "Lv.141 ~ Lv.200"},
    ]
    try:
        cfg = supabase.table("level_config").select("level, exp_to_next").order("level").execute()
        rows = cfg.data or []
        cumulative = 0
        exp_by_level = {}
        for r in rows:
            lv = r.get("level", 0)
            exp_to = r.get("exp_to_next", 0)
            exp_by_level[lv] = cumulative
            cumulative += exp_to
        for m in milestones:
            m["exp"] = exp_by_level.get(m["level"], m["exp"])
    except Exception:
        pass
    return milestones


def _compute_level_exp(supabase, level_val, total_exp_val):
    """level_config에서 exp_current, exp_next, exp_percent 산출"""
    exp_current = 0
    exp_next = 100
    exp_percent = 0
    try:
        cfg = supabase.table("level_config").select("level, exp_to_next").lte("level", level_val).order("level").execute()
        rows = cfg.data or []
        exp_cumulative = sum(r.get("exp_to_next", 0) for r in rows[:-1])
        exp_current = max(0, total_exp_val - exp_cumulative)
        exp_next = rows[-1].get("exp_to_next", 100) if rows else 100
        exp_percent = round((exp_current / exp_next) * 100) if exp_next else 0
    except Exception:
        pass
    return exp_current, exp_next, exp_percent


@app.route("/mypage/<user_id>")
def mypage_user(user_id):
    """사용자 프로필 페이지 (본인: 편집 가능, 타인: 읽기 전용)"""
    if not session.get("logged_in"):
        return redirect(url_for("login_page"))
    if not user_id:
        return redirect(url_for("mypage"))
    try:
        supabase = get_supabase_admin_client()
        r = supabase.table("profiles").select(
            "id, nickname, profile_url, role, email, status_message, level, total_exp"
        ).eq("id", user_id).limit(1).execute()
        if not r.data or len(r.data) == 0:
            return "사용자를 찾을 수 없습니다.", 404
        profile = r.data[0]
        profile["id"] = str(profile.get("id") or "")
        current_id = str(session.get("user_id") or "")
        is_own = profile["id"] == current_id
        role = profile.get("role", "member")
        role_label = "관리자" if role == "admin" else "팀원"

        total_exp = int(profile.get("total_exp") or 0)
        level = _compute_level_from_exp(supabase, total_exp)
        exp_current, exp_next, exp_percent = _compute_level_exp(supabase, level, total_exp)
        # 100% 초과 시 다음 레벨로 보정 (100%마다 1씩 올라가야 함)
        for _ in range(199):  # L200 최대
            if exp_next <= 0 or exp_current < exp_next:
                break
            next_level = level + 1
            ec, en, _ = _compute_level_exp(supabase, next_level, total_exp)
            if en == 0 or (ec == exp_current and en == exp_next):  # 다음 레벨 없음 또는 같은 결과 반복
                break
            level = next_level
            exp_current, exp_next, exp_percent = ec, en, round((ec / en) * 100) if en else 0
        _, tier_name, tier_level = _get_tier_from_level(level)
        tier_sprite = _get_tier_from_level(level)[0]
        auto_headlines = HEADLINE_BY_TIER.get(tier_level, HEADLINE_BY_TIER[0])

        user_hashtags = []
        hashtag_master_by_category = {}
        try:
            uh = supabase.table("user_hashtags").select("hashtag_id").eq("user_id", user_id).execute()
            tag_ids = [r["hashtag_id"] for r in (uh.data or [])]
            if tag_ids:
                hm = supabase.table("hashtag_master").select("id, tag_name, category").in_("id", tag_ids).order("sort_order").execute()
                user_hashtags = [{"id": r["id"], "tag_name": r["tag_name"], "category": r["category"]} for r in (hm.data or [])]
            all_hm = supabase.table("hashtag_master").select("id, tag_name, category, sort_order").order("sort_order").execute()
            for r in all_hm.data or []:
                cat = r.get("category", "기타")
                if cat not in hashtag_master_by_category:
                    hashtag_master_by_category[cat] = []
                hashtag_master_by_category[cat].append({"id": r["id"], "tag_name": r["tag_name"]})
        except Exception:
            pass
        representative_works = []
        try:
            rw = supabase.table("user_representative_works").select("source, contest_id, sort_order, award_status, result_announcement_method, image_path").eq("user_id", user_id).order("sort_order").execute()
            for row in (rw.data or []):
                src, cid = row.get("source") or "", row.get("contest_id") or ""
                c = supabase.table("contests").select("title, url").eq("source", src).eq("id", cid).limit(1).execute()
                contest = (c.data or [{}])[0] if c.data else {}
                representative_works.append({
                    "source": src,
                    "contest_id": cid,
                    "sort_order": int(row.get("sort_order") or 1),
                    "award_status": row.get("award_status") or "",
                    "result_announcement_method": row.get("result_announcement_method") or "",
                    "image_path": row.get("image_path") or "",
                    "title": contest.get("title", "(제목 없음)"),
                    "url": contest.get("url", "#"),
                })
        except Exception:
            pass

        participate_count = 0
        try:
            pc = supabase.table("contest_participation").select("user_id").eq("user_id", user_id).eq("status", "participate").execute()
            participate_count = len(pc.data or [])
        except Exception:
            pass

        awards_by_status = {"대상": 0, "최우수상": 0, "우수상": 0}
        prize_total = 0
        try:
            rw_all = supabase.table("user_representative_works").select("award_status").eq("user_id", user_id).execute()
            for row in (rw_all.data or []):
                s = (row.get("award_status") or "").strip()
                if s in awards_by_status:
                    awards_by_status[s] = awards_by_status.get(s, 0) + 1
        except Exception:
            pass
        try:
            pd = supabase.table("contest_participation_detail").select("prize_amount, has_prize").eq("user_id", user_id).execute()
            for row in (pd.data or []):
                if row.get("has_prize") and row.get("prize_amount") is not None:
                    try:
                        prize_total += float(row["prize_amount"])
                    except (TypeError, ValueError):
                        pass
        except Exception:
            pass
        prize_total_str = f"{int(prize_total):,}" if prize_total == int(prize_total) else f"{prize_total:,.0f}"

        tier_exp_milestones = _get_tier_exp_milestones(supabase)
        return render_template(
            "mypage.html",
            profile=profile,
            role_label=role_label,
            is_own_profile=is_own,
            level=level,
            total_exp=total_exp,
            exp_percent=min(100, exp_percent),
            exp_current=exp_current,
            exp_next=exp_next,
            user_hashtags=user_hashtags,
            selected_hashtag_ids=[h["id"] for h in user_hashtags],
            hashtag_master_by_category=hashtag_master_by_category,
            hashtag_category_order=["기술·개발력 중심", "문제해결력", "데이터 특화", "창의성", "밈"],
            hashtag_max_limit=5 if tier_level == 2 else (10 if tier_level == 3 else (15 if tier_level == 4 else 0)),
            representative_works=representative_works,
            tier_level=tier_level,
            tier_name=tier_name,
            tier_sprite=tier_sprite,
            auto_headlines=auto_headlines,
            participate_count=participate_count,
            awards_by_status=awards_by_status,
            awards_total=sum(awards_by_status.values()),
            prize_total=prize_total_str,
            tier_exp_milestones=tier_exp_milestones,
        )
    except Exception as e:
        logger.error("마이페이지 조회 실패: %s", e, exc_info=True)
        return "오류가 발생했습니다.", 500


PROFILE_BUCKET = "profile"
REP_BUCKET = "rep"  # 대표작 이미지
CONTEST_BUCKET = "contest"  # 참가 상세 제출물
TEAMPROFILE_BUCKET = "teamprofile"  # 팀 프로필 이미지
ALLOWED_IMAGE_EXT = {"jpg", "jpeg", "png", "gif", "webp"}
ALLOWED_DOC_EXT = {"pdf", "doc", "docx", "hwp", "ppt", "pptx", "xls", "xlsx", "zip", "txt"}


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


@app.route("/api/profile/status-message", methods=["POST", "PUT", "PATCH"])
def api_update_status_message():
    """상태 메시지 추가/수정/삭제 (빈 문자열 = 삭제)"""
    if not session.get("logged_in"):
        return jsonify({"success": False, "error": "unauthorized"}), 401
    data = request.get_json(silent=True) or {}
    status_message = data.get("status_message")
    if status_message is None:
        status_message = ""
    if not isinstance(status_message, str):
        return jsonify({"success": False, "error": "잘못된 형식입니다."}), 400
    status_message = status_message.strip()[:80]
    email = session.get("email")
    if not email:
        return jsonify({"success": False, "error": "사용자 정보가 없습니다."}), 401
    try:
        supabase = get_supabase_admin_client()
        nickname = session.get("nickname") or "회원"
        r = supabase.table("profiles").update({"status_message": status_message or None}).eq("email", email).execute()
        # 전체 유저에게 상태메시지 변경 알림
        try:
            notif = (
                supabase.table("notifications")
                .insert({
                    "type": "status",
                    "source": "상태메시지",
                    "count": 1,
                    "message": f"{nickname}님이 상태 메시지를 변경했습니다",
                })
                .execute()
            )
            if notif.data and len(notif.data) > 0:
                notif_id = notif.data[0].get("id")
                if notif_id:
                    members = supabase.table("profiles").select("id").eq("role", "member").execute()
                    user_id = str(session.get("user_id") or "")
                    states = [
                        {"user_id": m["id"], "notification_id": notif_id, "read": False, "deleted": False}
                        for m in (members.data or [])
                        if str(m.get("id") or "") != user_id  # 본인 제외
                    ]
                    if states:
                        supabase.table("notification_user_state").insert(states).execute()
        except Exception as notif_err:
            logger.warning("상태메시지 알림 생성 실패: %s", notif_err)
        return jsonify({"success": True, "status_message": status_message or ""})
    except Exception as e:
        logger.error("상태 메시지 업데이트 실패: %s", e)
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/profile/hashtags", methods=["POST"])
def api_profile_hashtags():
    """해시태그 저장 (골드 이상만)"""
    if not session.get("logged_in"):
        return jsonify({"success": False, "error": "unauthorized"}), 401
    user_id = str(session.get("user_id") or "")
    if not user_id:
        return jsonify({"success": False, "error": "사용자 정보가 없습니다."}), 401
    data = request.get_json() or {}
    hashtag_ids = data.get("hashtag_ids", [])
    if not isinstance(hashtag_ids, list):
        hashtag_ids = []
    hashtag_ids = [int(x) for x in hashtag_ids if isinstance(x, (int, str)) and str(x).isdigit()][:50]
    try:
        supabase = get_supabase_admin_client()
        total_exp = 0
        try:
            p = supabase.table("profiles").select("total_exp").eq("id", user_id).limit(1).execute()
            if p.data and len(p.data) > 0:
                total_exp = int(p.data[0].get("total_exp") or 0)
        except Exception:
            pass
        level = _compute_level_from_exp(supabase, total_exp)
        if level < 71:
            return jsonify({"success": False, "error": "골드 등급(Lv.71) 이상부터 해시태그를 추가할 수 있습니다."}), 403
        _, tier_name, tier_level = _get_tier_from_level(level)
        hashtag_limit = 5 if tier_level == 2 else (10 if tier_level == 3 else 15)
        if len(hashtag_ids) > hashtag_limit:
            return jsonify({"success": False, "error": f"해시태그는 {hashtag_limit}개까지 추가할 수 있습니다."}), 400
        existing = supabase.table("user_hashtags").select("hashtag_id").eq("user_id", user_id).execute()
        existing_ids = {r["hashtag_id"] for r in (existing.data or [])}
        to_add = [hid for hid in hashtag_ids if hid not in existing_ids]
        to_remove = existing_ids - set(hashtag_ids)
        for hid in to_remove:
            supabase.table("user_hashtags").delete().eq("user_id", user_id).eq("hashtag_id", hid).execute()
        for hid in to_add:
            supabase.table("user_hashtags").insert({"user_id": user_id, "hashtag_id": hid}).execute()
        return jsonify({"success": True})
    except Exception as e:
        logger.error("해시태그 저장 실패: %s", e)
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/exp/amounts")
def api_exp_amounts():
    """행위별 경험치 포인트 조회 (모달 표시용)"""
    amounts = [{"activity_type": k, "label": EXP_ACTIVITY_LABELS.get(k, k), "exp": v} for k, v in EXP_AMOUNTS.items()]
    return jsonify({"success": True, "data": amounts})


@app.route("/api/contests/by-ids")
def api_contests_by_ids():
    """ID 목록으로 공고 조회 (최근 본 공고용) - source=요즘것들 기준"""
    ids_param = request.args.get("ids", "")
    source = request.args.get("source", "요즘것들")
    if not ids_param:
        return jsonify({"success": True, "data": []})
    ids = [x.strip() for x in ids_param.split(",") if x.strip()][:10]
    if not ids:
        return jsonify({"success": True, "data": []})
    try:
        supabase = get_supabase_admin_client()
        r = supabase.table("contests").select("id, title, d_day, url").eq("source", source).in_("id", ids).execute()
        by_id = {str(row["id"]): dict(row) for row in (r.data or [])}
        ordered = [by_id[i] for i in ids if i in by_id]
        return jsonify({"success": True, "data": ordered})
    except Exception as e:
        logger.error("contests/by-ids 오류: %s", e)
        return jsonify({"success": True, "data": []})


@app.route("/api/users")
def api_users():
    """가입된 사용자 목록 (닉네임, 프로필, 접속 상태, 상태 메시지)"""
    if not session.get("logged_in"):
        return jsonify({"success": False, "error": "unauthorized"}), 401
    try:
        supabase = get_supabase_admin_client()
        r = supabase.table("profiles").select("id, email, nickname, profile_url, status_message").order("nickname").execute()
        users = [{"id": str(u["id"]), "email": u.get("email", ""), "nickname": u.get("nickname", ""), "profile_url": u.get("profile_url") or "", "status_message": u.get("status_message") or ""} for u in (r.data or [])]
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


def _is_admin():
    """profiles 테이블에서 현재 유저 role 조회 (세션 아닌 DB 기준). id, email 둘 다 시도."""
    if not session.get("logged_in"):
        return False
    supabase = get_supabase_admin_client()
    try:
        # 1) id로 조회
        user_id = session.get("user_id")
        if user_id:
            r = supabase.table("profiles").select("role").eq("id", str(user_id)).limit(1).execute()
            if r.data and r.data[0]:
                role = (r.data[0].get("role") or "").lower().strip()
                if role == "admin":
                    return True
                if r.data[0].get("role") is not None:
                    return False
        # 2) id 실패 시 email로 조회
        email = session.get("email")
        if email:
            r = supabase.table("profiles").select("role").eq("email", str(email).strip()).limit(1).execute()
            if r.data and r.data[0]:
                return (r.data[0].get("role") or "").lower().strip() == "admin"
    except Exception as ex:
        print(f"[_is_admin] 오류: {ex}")
    return False


def _get_team_year():
    """쿼리 year 파라미터 또는 현재 연도"""
    y = request.args.get("year", "").strip()
    try:
        return int(y) if y else datetime.now().year
    except ValueError:
        return datetime.now().year


def _sum_prize_achieved(supabase):
    """contest_participation_detail에서 상금 합계 (원)"""
    total = 0.0
    try:
        r = supabase.table("contest_participation_detail").select("prize_amount, has_prize").execute()
        for row in (r.data or []):
            if row.get("has_prize") and row.get("prize_amount") is not None:
                try:
                    total += float(row["prize_amount"])
                except (TypeError, ValueError):
                    pass
    except Exception as e:
        logger.warning("팀 상금 합계 조회 실패: %s", e)
    return int(total)


@app.route("/api/team/prize-progress")
def api_team_prize_progress():
    """전체 유저 상금 합계 + 해당 연도 팀 목표 대비 진행률. ?year=2025"""
    if not session.get("logged_in"):
        return jsonify({"success": True, "goal_prize": 0, "total_achieved": 0})
    try:
        year = _get_team_year()
        supabase = get_supabase_admin_client()
        goal = 0
        achieved_stored = 0
        closed = False
        try:
            r = supabase.table("site_team_settings").select("goal_prize, achieved_amount, closed").eq("year", year).limit(1).execute()
            if r.data and len(r.data) > 0:
                goal = int(r.data[0].get("goal_prize") or 0)
                achieved_stored = int(r.data[0].get("achieved_amount") or 0)
                closed = bool(r.data[0].get("closed"))
        except Exception:
            pass
        total_achieved = _sum_prize_achieved(supabase)
        if closed and achieved_stored > 0:
            total_achieved = achieved_stored
        return jsonify({
            "success": True,
            "year": year,
            "goal_prize": goal,
            "total_achieved": total_achieved,
            "closed": closed,
        })
    except Exception as e:
        logger.error("api/team/prize-progress 오류: %s", e)
        return jsonify({"success": True, "goal_prize": 0, "total_achieved": 0})


@app.route("/api/team/settings", methods=["GET", "POST", "DELETE"])
def api_team_settings():
    """GET: 팀 설정 조회. POST: 추가/수정. DELETE: 삭제 (관리자 전용)"""
    if not session.get("logged_in"):
        if request.method in ("POST", "DELETE"):
            return jsonify({"success": False, "error": "로그인이 필요합니다"}), 401
        return jsonify({"success": True, "data": None})
    try:
        supabase = get_supabase_admin_client()
        if request.method == "POST":
            if not _is_admin():
                return jsonify({"success": False, "error": "권한이 없습니다"}), 403
            data = request.get_json(silent=True) or request.form.to_dict()
            year = data.get("year")
            try:
                year = int(year) if year is not None and year != "" else datetime.now().year
            except (TypeError, ValueError):
                year = datetime.now().year
            team_name = (data.get("team_name") or "").strip() or "우리 팀"
            team_desc = (data.get("team_desc") or "").strip() or ""
            goal_prize = data.get("goal_prize")
            try:
                goal_prize = max(0, int(goal_prize)) if goal_prize is not None and goal_prize != "" else 0
            except (TypeError, ValueError):
                goal_prize = 0
            payload = {"year": year, "team_name": team_name, "team_desc": team_desc, "goal_prize": goal_prize}
            r = supabase.table("site_team_settings").select("closed").eq("year", year).limit(1).execute()
            if r.data and r.data[0].get("closed"):
                return jsonify({"success": False, "error": "마감된 연도는 수정할 수 없습니다."}), 400
            supabase.table("site_team_settings").upsert([payload], on_conflict="year").execute()
            return jsonify({"success": True})
        if request.method == "DELETE":
            if not _is_admin():
                return jsonify({"success": False, "error": "권한이 없습니다"}), 403
            year = request.args.get("year", "").strip() or str(datetime.now().year)
            try:
                year = int(year)
            except ValueError:
                return jsonify({"success": False, "error": "유효한 연도를 입력해 주세요."}), 400
            r = supabase.table("site_team_settings").select("closed").eq("year", year).limit(1).execute()
            if r.data and r.data[0].get("closed"):
                return jsonify({"success": False, "error": "마감된 연도는 삭제할 수 없습니다."}), 400
            supabase.table("site_team_settings").delete().eq("year", year).execute()
            return jsonify({"success": True})
        list_all = request.args.get("list") in ("1", "true")
        if list_all:
            cur_year = datetime.now().year
            try:
                r = supabase.table("site_team_settings").select("year, team_name, team_desc, goal_prize, image_path, achieved_amount, closed").order("year", desc=True).execute()
                rows = r.data or []
            except Exception:
                rows = []
            for row in rows:
                if row.get("year") is None:
                    row["year"] = datetime.now().year
            out = {"success": True, "data": rows, "can_edit": _is_admin()}
            if request.args.get("_debug"):
                out["_debug"] = {"can_edit": out["can_edit"], "session_email": bool(session.get("email")), "session_user_id": bool(session.get("user_id"))}
            return jsonify(out)
        year = _get_team_year()
        r = supabase.table("site_team_settings").select("year, team_name, team_desc, goal_prize, image_path, achieved_amount, closed").eq("year", year).limit(1).execute()
        row = (r.data or [{}])[0] if r.data else {}
        data = {
            "year": row.get("year", year),
            "team_name": row.get("team_name") or "우리 팀",
            "team_desc": row.get("team_desc") or "",
            "goal_prize": int(row.get("goal_prize") or 0),
            "image_path": row.get("image_path") or "",
            "achieved_amount": int(row.get("achieved_amount") or 0),
            "closed": bool(row.get("closed")),
        }
        can_edit = _is_admin()
        out = {"success": True, "data": data, "can_edit": can_edit}
        if request.args.get("_debug"):
            out["_debug"] = {"can_edit": can_edit, "session_email": bool(session.get("email")), "session_user_id": bool(session.get("user_id"))}
        return jsonify(out)
    except Exception as e:
        logger.error("api/team/settings 오류: %s", e)
        return jsonify({"success": True, "data": {"year": datetime.now().year, "team_name": "우리 팀", "team_desc": "", "goal_prize": 0}, "can_edit": _is_admin()})


@app.route("/api/team/settings/close", methods=["POST"])
def api_team_settings_close():
    """해당 연도 팀 목표 마감 (관리자 전용). achieved_amount 스냅샷 저장"""
    if not session.get("logged_in") or not _is_admin():
        return jsonify({"success": False, "error": "권한이 없습니다"}), 403
    year = request.args.get("year", "").strip() or str(datetime.now().year)
    try:
        year = int(year)
    except ValueError:
        return jsonify({"success": False, "error": "유효한 연도를 입력해 주세요."}), 400
    try:
        supabase = get_supabase_admin_client()
        r = supabase.table("site_team_settings").select("closed").eq("year", year).limit(1).execute()
        if r.data and r.data[0].get("closed"):
            return jsonify({"success": False, "error": "이미 마감된 연도입니다."}), 400
        achieved = _sum_prize_achieved(supabase)
        supabase.table("site_team_settings").upsert(
            [{"year": year, "achieved_amount": achieved, "closed": True}],
            on_conflict="year"
        ).execute()
        return jsonify({"success": True})
    except Exception as e:
        logger.error("api/team/settings/close 오류: %s", e)
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/team/settings/image", methods=["POST"])
def api_team_settings_image():
    """팀 프로필 이미지 업로드 (관리자 전용, 해당 연도, 마감 전).
    auth 클라이언트 사용 → Storage RLS 정책 통과 (대표작 이미지와 동일 방식)"""
    if not session.get("logged_in") or not _is_admin():
        return jsonify({"success": False, "error": "권한이 없습니다"}), 403
    access_token = session.get("access_token") or ""
    refresh_token = session.get("refresh_token") or ""
    if not access_token:
        return jsonify({"success": False, "error": "세션이 만료되었습니다. 다시 로그인해 주세요."}), 401
    if "file" not in request.files and "image" not in request.files:
        return jsonify({"success": False, "error": "이미지를 선택해 주세요."}), 400
    file = request.files.get("file") or request.files.get("image")
    if not file or file.filename == "":
        return jsonify({"success": False, "error": "파일이 없습니다."}), 400
    ext = (file.filename.rsplit(".", 1)[-1] or "").lower()
    if ext not in ALLOWED_IMAGE_EXT:
        return jsonify({"success": False, "error": f"허용 형식: {', '.join(ALLOWED_IMAGE_EXT)}"}), 400
    year = request.form.get("year", "").strip() or str(datetime.now().year)
    try:
        year = int(year)
    except ValueError:
        year = datetime.now().year
    try:
        supabase_admin = get_supabase_admin_client()
        r = supabase_admin.table("site_team_settings").select("closed").eq("year", year).limit(1).execute()
        if r.data and r.data[0].get("closed"):
            return jsonify({"success": False, "error": "마감된 연도는 이미지를 변경할 수 없습니다."}), 400
        path = f"private/{year}_team.{ext}"
        file_data = file.read()
        content_type = file.content_type or ("image/jpeg" if ext in ("jpg", "jpeg") else f"image/{ext}")
        supabase = get_supabase_client_with_auth(access_token, refresh_token)
        supabase.storage.from_(TEAMPROFILE_BUCKET).upload(
            file=file_data,
            path=path,
            file_options={"content-type": content_type, "upsert": "true"},
        )
        url = supabase.storage.from_(TEAMPROFILE_BUCKET).get_public_url(path)
        supabase_admin.table("site_team_settings").update({"image_path": url}).eq("year", year).execute()
        return jsonify({"success": True, "image_path": url})
    except Exception as e:
        logger.error("api/team/settings/image 오류: %s", e)
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/team/members")
def api_team_members():
    """멤버 랭킹: role='member' 프로필 조회, 참가 건수로 정렬"""
    if not session.get("logged_in"):
        return jsonify({"success": True, "data": []})
    try:
        supabase = get_supabase_admin_client()
        r = supabase.table("profiles").select("id, nickname, profile_url").eq("role", "member").order("nickname").execute()
        members = [{"id": str(u["id"]), "nickname": u.get("nickname") or "회원", "profile_url": u.get("profile_url") or ""} for u in (r.data or [])]
        if not members:
            return jsonify({"success": True, "data": []})
        user_ids = [m["id"] for m in members]
        part_r = supabase.table("contest_participation").select("user_id").eq("status", "participate").execute()
        part_counts = {}
        for p in (part_r.data or []):
            uid = str(p.get("user_id") or "")
            if uid in user_ids:
                part_counts[uid] = part_counts.get(uid, 0) + 1
        for m in members:
            m["participate_count"] = part_counts.get(m["id"], 0)
        members.sort(key=lambda x: (-x["participate_count"], x["nickname"]))
        return jsonify({"success": True, "data": members})
    except Exception as e:
        logger.error("api/team/members 오류: %s", e)
        return jsonify({"success": True, "data": []})


@app.route("/api/team/activity")
def api_team_activity():
    """참가 최근 5건: contest_participation(참가) + profiles(nickname) + contests(title, url)"""
    if not session.get("logged_in"):
        return jsonify({"success": True, "data": []})
    try:
        supabase = get_supabase_admin_client()
        r = supabase.table("contest_participation").select("user_id, source, contest_id, updated_at").eq("status", "participate").order("updated_at", desc=True).limit(5).execute()
        rows = r.data or []
        if not rows:
            return jsonify({"success": True, "data": []})
        user_ids = list({str(p.get("user_id") or "") for p in rows if p.get("user_id")})
        contest_keys = [(p.get("source") or "", p.get("contest_id") or "") for p in rows]
        profiles_map = {}
        if user_ids:
            pr = supabase.table("profiles").select("id, nickname").in_("id", user_ids).execute()
            for u in (pr.data or []):
                profiles_map[str(u.get("id") or "")] = u.get("nickname") or "회원"
        contests_map = {}
        for src, cid in contest_keys:
            if not src or not cid:
                continue
            c = supabase.table("contests").select("id, title, url").eq("source", src).eq("id", cid).limit(1).execute()
            if c.data:
                contests_map[(src, cid)] = c.data[0]
        result = []
        for p in rows:
            uid = str(p.get("user_id") or "")
            src = p.get("source") or ""
            cid = p.get("contest_id") or ""
            nickname = profiles_map.get(uid, "회원")
            contest = contests_map.get((src, cid)) or {}
            result.append({
                "user_id": uid,
                "nickname": nickname,
                "title": contest.get("title", "(제목 없음)"),
                "url": contest.get("url", "#"),
            })
        return jsonify({"success": True, "data": result})
    except Exception as e:
        logger.error("api/team/activity 오류: %s", e)
        return jsonify({"success": True, "data": []})


@app.route("/api/contests")
def api_contests():
    """Supabase contests 테이블에서 공고 목록 조회 (페이지당 10개)"""
    try:
        page = max(1, int(request.args.get("page", 1)))
        limit_arg = int(request.args.get("limit", 10))
        all_mode = request.args.get("all") in ("1", "true")
        limit = 2000 if all_mode else max(1, min(100, limit_arg))
        category = request.args.get("category", "").strip() or None
        source = request.args.get("source", "").strip() or None
        q = request.args.get("q", "").strip() or None

        supabase = get_supabase_admin_client()
        query = (
            supabase.table("contests")
            .select("id, title, d_day, host, url, category, source, created_at, updated_at", count="exact")
            .order("created_at", desc=True)
        )
        if category:
            query = query.eq("category", category)
        if source:
            query = query.eq("source", source)
        if q:
            safe_q = q.replace(",", " ").replace("%", "")  # avoid breaking or_ syntax
            pattern = f"%{safe_q}%"
            query = query.or_(f"title.ilike.{pattern},host.ilike.{pattern},category.ilike.{pattern}")

        offset = (page - 1) * limit
        r = query.range(offset, offset + limit - 1).execute()
        rows = r.data or []
        total = getattr(r, "count", None) or len(rows)
        return jsonify({
            "success": True,
            "data": rows,
            "total": total,
            "page": page,
            "limit": limit,
        })
    except Exception as e:
        logger.error("api/contests 오류: %s", e)
        return jsonify({"success": False, "error": str(e), "data": []}), 500


@app.route("/api/contests/filters")
def api_contests_filters():
    """필터용 카테고리/출처 목록 (distinct)"""
    try:
        supabase = get_supabase_admin_client()
        r = supabase.table("contests").select("category, source").limit(500).execute()
        rows = r.data or []
        categories = sorted({str(row.get("category") or "공모전") for row in rows if row.get("category")})
        sources = sorted({str(row.get("source") or "요즘것들") for row in rows if row.get("source")})
        return jsonify({"success": True, "categories": categories, "sources": sources})
    except Exception as e:
        logger.error("api/contests/filters 오류: %s", e)
        return jsonify({"success": True, "categories": [], "sources": []})


@app.route("/api/bookmarks/contests")
def api_bookmarks_contests():
    """북마크한 공고 전체 데이터 (folder_id 필터 지원, 컬럼 없으면 fallback)"""
    if not session.get("logged_in"):
        return jsonify({"success": True, "data": []})
    user_id = session.get("user_id")
    if not user_id:
        return jsonify({"success": True, "data": []})
    folder_id = request.args.get("folder_id", "").strip() or None
    if folder_id == "null" or folder_id == "unfiled":
        folder_id = "__unfiled__"
    try:
        supabase = get_supabase_admin_client()
        # folder_id 컬럼 존재 시에만 사용 (없으면 기본 select로 fallback)
        try:
            q = supabase.table("contest_bookmarks").select("source, contest_id, folder_id").eq("user_id", user_id).order("created_at", desc=True)
            if folder_id == "__unfiled__":
                q = q.is_("folder_id", "null")
            elif folder_id and folder_id not in ("all", "null", "unfiled"):
                q = q.eq("folder_id", folder_id)
            bookmarks = q.execute()
            has_folder = True
        except Exception:
            q = supabase.table("contest_bookmarks").select("source, contest_id").eq("user_id", user_id).order("created_at", desc=True)
            bookmarks = q.execute()
            has_folder = False
        if not bookmarks.data or len(bookmarks.data) == 0:
            return jsonify({"success": True, "data": []})
        result = []
        for b in bookmarks.data:
            s, cid = b.get("source"), b.get("contest_id")
            if not s or not cid:
                continue
            r = supabase.table("contests").select("id, title, d_day, host, url, category, source, created_at").eq("source", s).eq("id", cid).limit(1).execute()
            if r.data and len(r.data) > 0:
                row = r.data[0].copy()
                row["folder_id"] = b.get("folder_id") if has_folder else None
                result.append(row)
        return jsonify({"success": True, "data": result})
    except Exception as e:
        logger.error("api/bookmarks/contests 오류: %s", e)
        return jsonify({"success": True, "data": []})


@app.route("/api/bookmarks")
def api_bookmarks():
    """현재 사용자 북마크 목록 (source, contest_id)"""
    if not session.get("logged_in"):
        return jsonify({"success": True, "data": []})
    user_id = session.get("user_id")
    if not user_id:
        return jsonify({"success": True, "data": []})
    try:
        supabase = get_supabase_admin_client()
        r = supabase.table("contest_bookmarks").select("source, contest_id").eq("user_id", user_id).execute()
        rows = r.data or []
        return jsonify({"success": True, "data": [{"source": x["source"], "contest_id": x["contest_id"]} for x in rows]})
    except Exception as e:
        logger.error("api/bookmarks 오류: %s", e)
        return jsonify({"success": True, "data": []})


@app.route("/api/bookmarks/toggle", methods=["POST"])
def api_bookmarks_toggle():
    """북마크 추가/제거 토글"""
    if not session.get("logged_in"):
        return jsonify({"success": False, "error": "unauthorized"}), 401
    user_id = session.get("user_id")
    if not user_id:
        return jsonify({"success": False, "error": "unauthorized"}), 401
    data = request.get_json(silent=True) or {}
    source = (data.get("source") or "").strip()
    contest_id = (data.get("contest_id") or str(data.get("id")) or "").strip()
    if not source or not contest_id:
        return jsonify({"success": False, "error": "source, contest_id 필요"}), 400
    try:
        supabase = get_supabase_admin_client()
        existing = supabase.table("contest_bookmarks").select("user_id").eq("user_id", user_id).eq("source", source).eq("contest_id", contest_id).execute()
        if existing.data and len(existing.data) > 0:
            supabase.table("contest_bookmarks").delete().eq("user_id", user_id).eq("source", source).eq("contest_id", contest_id).execute()
            return jsonify({"success": True, "bookmarked": False})
        else:
            supabase.table("contest_bookmarks").insert({
                "user_id": user_id,
                "source": source,
                "contest_id": contest_id,
            }).execute()
            return jsonify({"success": True, "bookmarked": True})
    except Exception as e:
        logger.error("api/bookmarks/toggle 오류: %s", e)
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/bookmarks/folders")
def api_bookmarks_folders():
    """북마크 폴더 목록 (1단계 + 2단계)"""
    if not session.get("logged_in"):
        return jsonify({"success": True, "data": []})
    user_id = session.get("user_id")
    if not user_id:
        return jsonify({"success": True, "data": []})
    try:
        supabase = get_supabase_admin_client()
        r = supabase.table("bookmark_folders").select("id, parent_id, name, sort_order").eq("user_id", user_id).order("sort_order").order("created_at").execute()
        rows = r.data or []
        return jsonify({"success": True, "data": rows})
    except Exception as e:
        logger.error("api/bookmarks/folders 오류: %s", e)
        return jsonify({"success": True, "data": []})


@app.route("/api/bookmarks/folder-counts")
def api_bookmarks_folder_counts():
    """폴더별 북마크 개수 (전체, 미분류, 폴더별)"""
    if not session.get("logged_in"):
        return jsonify({"success": True, "data": {"all": 0, "unfiled": 0, "folders": {}}})
    user_id = session.get("user_id")
    if not user_id:
        return jsonify({"success": True, "data": {"all": 0, "unfiled": 0, "folders": {}}})
    try:
        supabase = get_supabase_admin_client()
        r = supabase.table("contest_bookmarks").select("folder_id").eq("user_id", user_id).execute()
        rows = r.data or []
        total = len(rows)
        unfiled = sum(1 for x in rows if x.get("folder_id") is None)
        folders = {}
        for x in rows:
            fid = x.get("folder_id")
            if fid:
                folders[fid] = folders.get(fid, 0) + 1
        return jsonify({"success": True, "data": {"all": total, "unfiled": unfiled, "folders": folders}})
    except Exception as e:
        err_msg = str(e)
        if "folder_id" in err_msg:
            try:
                supabase = get_supabase_admin_client()
                r = supabase.table("contest_bookmarks").select("source, contest_id").eq("user_id", user_id).execute()
                total = len(r.data or [])
                return jsonify({"success": True, "data": {"all": total, "unfiled": total, "folders": {}}})
            except Exception:
                pass
        logger.error("api/bookmarks/folder-counts 오류: %s", e)
        return jsonify({"success": True, "data": {"all": 0, "unfiled": 0, "folders": {}}})


@app.route("/api/bookmarks/folders", methods=["POST"])
def api_bookmarks_folders_create():
    """폴더 생성 (parent_id=null: 1단계, parent_id=uuid: 2단계)"""
    if not session.get("logged_in"):
        return jsonify({"success": False, "error": "unauthorized"}), 401
    user_id = session.get("user_id")
    if not user_id:
        return jsonify({"success": False, "error": "unauthorized"}), 401
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    parent_id = data.get("parent_id")  # null 허용
    if not name:
        return jsonify({"success": False, "error": "name 필요"}), 400
    if parent_id is not None and str(parent_id).strip() == "":
        parent_id = None
    try:
        supabase = get_supabase_admin_client()
        if parent_id:
            p = supabase.table("bookmark_folders").select("id, parent_id").eq("id", parent_id).eq("user_id", user_id).execute()
            if not p.data or len(p.data) == 0:
                return jsonify({"success": False, "error": "부모 폴더 없음"}), 400
            if p.data[0].get("parent_id") is not None:
                return jsonify({"success": False, "error": "2단계까지만 허용됩니다 (하위 폴더에는 새 폴더를 만들 수 없음)"}), 400
        max_order = 0
        q = supabase.table("bookmark_folders").select("sort_order").eq("user_id", user_id)
        if parent_id:
            q = q.eq("parent_id", parent_id)
        else:
            q = q.is_("parent_id", "null")
        r = q.order("sort_order", desc=True).limit(1).execute()
        if r.data and len(r.data) > 0:
            max_order = (r.data[0].get("sort_order") or 0) + 1
        row = supabase.table("bookmark_folders").insert({
            "user_id": user_id,
            "parent_id": parent_id,
            "name": name,
            "sort_order": max_order,
        }).execute()
        created = row.data[0] if row.data else {}
        return jsonify({"success": True, "data": created})
    except Exception as e:
        logger.error("api/bookmarks/folders POST 오류: %s", e)
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/bookmarks/folders/<folder_id>", methods=["PATCH"])
def api_bookmarks_folders_update(folder_id):
    """폴더 이름/정렬 변경"""
    if not session.get("logged_in"):
        return jsonify({"success": False, "error": "unauthorized"}), 401
    user_id = session.get("user_id")
    if not user_id:
        return jsonify({"success": False, "error": "unauthorized"}), 401
    data = request.get_json(silent=True) or {}
    updates = {}
    if "name" in data:
        name = (data.get("name") or "").strip()
        if name:
            updates["name"] = name
    if "sort_order" in data:
        updates["sort_order"] = int(data.get("sort_order", 0))
    if not updates:
        return jsonify({"success": False, "error": "수정할 항목 없음"}), 400
    try:
        supabase = get_supabase_admin_client()
        supabase.table("bookmark_folders").update(updates).eq("id", folder_id).eq("user_id", user_id).execute()
        return jsonify({"success": True})
    except Exception as e:
        logger.error("api/bookmarks/folders PATCH 오류: %s", e)
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/bookmarks/folders/<folder_id>", methods=["DELETE"])
def api_bookmarks_folders_delete(folder_id):
    """폴더 삭제 (내부 북마크는 미분류로)"""
    if not session.get("logged_in"):
        return jsonify({"success": False, "error": "unauthorized"}), 401
    user_id = session.get("user_id")
    if not user_id:
        return jsonify({"success": False, "error": "unauthorized"}), 401
    try:
        supabase = get_supabase_admin_client()
        supabase.table("bookmark_folders").delete().eq("id", folder_id).eq("user_id", user_id).execute()
        return jsonify({"success": True})
    except Exception as e:
        logger.error("api/bookmarks/folders DELETE 오류: %s", e)
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/bookmarks/assign", methods=["POST"])
def api_bookmarks_assign():
    """북마크를 폴더에 배치 (folder_id=null: 미분류)"""
    if not session.get("logged_in"):
        return jsonify({"success": False, "error": "unauthorized"}), 401
    user_id = session.get("user_id")
    if not user_id:
        return jsonify({"success": False, "error": "unauthorized"}), 401
    data = request.get_json(silent=True) or {}
    source = (data.get("source") or "").strip()
    contest_id = (data.get("contest_id") or str(data.get("id")) or "").strip()
    folder_id = data.get("folder_id")
    if not source or not contest_id:
        return jsonify({"success": False, "error": "source, contest_id 필요"}), 400
    if folder_id is not None and str(folder_id).strip() == "":
        folder_id = None
    try:
        supabase = get_supabase_admin_client()
        supabase.table("contest_bookmarks").update({"folder_id": folder_id}).eq("user_id", user_id).eq("source", source).eq("contest_id", contest_id).execute()
        return jsonify({"success": True})
    except Exception as e:
        err_msg = str(e)
        if "folder_id" in err_msg and "schema" in err_msg.lower():
            # folder_id 컬럼이 없으면 무시 (폴더 기능 미설치 시)
            return jsonify({"success": True})
        logger.error("api/bookmarks/assign 오류: %s", e)
        return jsonify({"success": False, "error": err_msg}), 500


@app.route("/api/notifications")
def api_notifications():
    """현재 사용자 알림 목록 (notification_user_state 기반, deleted 제외)"""
    if not session.get("logged_in"):
        return jsonify({"success": True, "data": [], "unread_count": 0})
    user_id = session.get("user_id")
    if not user_id:
        return jsonify({"success": True, "data": [], "unread_count": 0})
    try:
        supabase = get_supabase_admin_client()
        r = (
            supabase.table("notification_user_state")
            .select("notification_id, read, deleted")
            .eq("user_id", user_id)
            .eq("deleted", False)
            .execute()
        )
        state_rows = r.data or []
        if not state_rows:
            return jsonify({"success": True, "data": [], "unread_count": 0})
        notif_ids = [s["notification_id"] for s in state_rows]
        state_by_id = {s["notification_id"]: s for s in state_rows}
        n_r = supabase.table("notifications").select("id, type, source, count, message, created_at").in_("id", notif_ids).order("created_at", desc=True).execute()
        notifs = n_r.data or []
        result = []
        for n in notifs:
            sid = n.get("id")
            st = state_by_id.get(sid) or {}
            result.append({
                "id": sid,
                "type": n.get("type"),
                "source": n.get("source"),
                "count": n.get("count"),
                "message": n.get("message"),
                "created_at": n.get("created_at"),
                "read": st.get("read", False),
            })
        unread = sum(1 for r in result if not r.get("read"))
        return jsonify({"success": True, "data": result, "unread_count": unread})
    except Exception as e:
        logger.error("api/notifications 오류: %s", e)
        return jsonify({"success": True, "data": [], "unread_count": 0})


@app.route("/api/notifications/<notification_id>/read", methods=["POST"])
def api_notification_read(notification_id):
    """알림 읽음 처리"""
    if not session.get("logged_in"):
        return jsonify({"success": False, "error": "unauthorized"}), 401
    user_id = session.get("user_id")
    if not user_id:
        return jsonify({"success": False, "error": "unauthorized"}), 401
    try:
        supabase = get_supabase_admin_client()
        supabase.table("notification_user_state").update({"read": True}).eq("user_id", user_id).eq("notification_id", notification_id).execute()
        return jsonify({"success": True})
    except Exception as e:
        logger.error("api/notifications read 오류: %s", e)
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/notifications/<notification_id>/delete", methods=["POST"])
def api_notification_delete(notification_id):
    """알림 삭제 처리 (soft delete)"""
    if not session.get("logged_in"):
        return jsonify({"success": False, "error": "unauthorized"}), 401
    user_id = session.get("user_id")
    if not user_id:
        return jsonify({"success": False, "error": "unauthorized"}), 401
    try:
        supabase = get_supabase_admin_client()
        supabase.table("notification_user_state").update({"deleted": True}).eq("user_id", user_id).eq("notification_id", notification_id).execute()
        return jsonify({"success": True})
    except Exception as e:
        logger.error("api/notifications delete 오류: %s", e)
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/notifications/read-all", methods=["POST"])
def api_notifications_read_all():
    """전체 읽음 처리"""
    if not session.get("logged_in"):
        return jsonify({"success": False, "error": "unauthorized"}), 401
    user_id = session.get("user_id")
    if not user_id:
        return jsonify({"success": False, "error": "unauthorized"}), 401
    try:
        supabase = get_supabase_admin_client()
        supabase.table("notification_user_state").update({"read": True}).eq("user_id", user_id).eq("deleted", False).execute()
        return jsonify({"success": True})
    except Exception as e:
        logger.error("api/notifications read-all 오류: %s", e)
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/notifications/delete-all", methods=["POST"])
def api_notifications_delete_all():
    """전체 삭제 처리 (soft delete)"""
    if not session.get("logged_in"):
        return jsonify({"success": False, "error": "unauthorized"}), 401
    user_id = session.get("user_id")
    if not user_id:
        return jsonify({"success": False, "error": "unauthorized"}), 401
    try:
        supabase = get_supabase_admin_client()
        supabase.table("notification_user_state").update({"deleted": True}).eq("user_id", user_id).eq("deleted", False).execute()
        return jsonify({"success": True})
    except Exception as e:
        logger.error("api/notifications delete-all 오류: %s", e)
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/user/contest-status")
def api_user_contest_status():
    """현재 사용자의 내용확인/참가/패스 상태 + 댓글 작성한 공모전 (내용 봤음)"""
    if not session.get("logged_in"):
        return jsonify({"success": True, "data": {"content_checks": [], "participation": {}, "commented": []}})
    user_id = session.get("user_id")
    if not user_id:
        return jsonify({"success": True, "data": {"content_checks": [], "participation": {}, "commented": []}})
    try:
        supabase = get_supabase_admin_client()
        content_checks = []
        try:
            r = supabase.table("contest_content_checks").select("source, contest_id").eq("user_id", user_id).execute()
            content_checks = [(x.get("source") or "") + ":" + (x.get("contest_id") or "") for x in (r.data or [])]
        except Exception:
            pass
        participation = {}
        try:
            r = supabase.table("contest_participation").select("source, contest_id, status").eq("user_id", user_id).execute()
            for x in (r.data or []):
                k = (x.get("source") or "") + ":" + (x.get("contest_id") or "")
                participation[k] = x.get("status") or ""
        except Exception:
            pass
        commented = []
        try:
            r = supabase.table("contest_comments").select("source, contest_id").eq("user_id", user_id).execute()
            commented = list({(x.get("source") or "") + ":" + (x.get("contest_id") or "") for x in (r.data or [])})
        except Exception:
            pass
        return jsonify({"success": True, "data": {"content_checks": content_checks, "participation": participation, "commented": commented}})
    except Exception as e:
        logger.error("api/user/contest-status 오류: %s", e)
        return jsonify({"success": True, "data": {"content_checks": [], "participation": {}, "commented": []}})


@app.route("/api/user/representative-works")
def api_user_representative_works():
    """대표작품 목록 조회 (user_id 또는 현재 유저). sort_order 1~3 순"""
    if not session.get("logged_in"):
        return jsonify({"success": True, "data": []})
    user_id = request.args.get("user_id", "").strip() or session.get("user_id")
    if not user_id:
        return jsonify({"success": True, "data": []})
    try:
        supabase = get_supabase_admin_client()
        r = supabase.table("user_representative_works").select("user_id, sort_order, source, contest_id, award_status, result_announcement_method, image_path").eq("user_id", user_id).order("sort_order").execute()
        rows = r.data or []
        result = []
        for row in rows:
            src = row.get("source") or ""
            cid = row.get("contest_id") or ""
            c = supabase.table("contests").select("title, url").eq("source", src).eq("id", cid).limit(1).execute()
            contest = (c.data or [{}])[0] if c.data else {}
            result.append({
                "source": src,
                "contest_id": cid,
                "sort_order": int(row.get("sort_order") or 1),
                "award_status": row.get("award_status") or "",
                "result_announcement_method": row.get("result_announcement_method") or "",
                "image_path": row.get("image_path") or "",
                "title": contest.get("title", "(제목 없음)"),
                "url": contest.get("url", "#"),
            })
        return jsonify({"success": True, "data": result})
    except Exception as e:
        logger.error("api/user/representative-works 오류: %s", e)
        return jsonify({"success": True, "data": []})


@app.route("/api/user/representative-works", methods=["POST"])
def api_user_representative_works_add():
    """대표작품 추가 (참가한 공모전만 가능, 최대 3개). JSON 또는 multipart 지원."""
    if not session.get("logged_in"):
        return jsonify({"success": False, "error": "로그인이 필요합니다"}), 401
    user_id = str(session.get("user_id") or "")
    if not user_id:
        return jsonify({"success": False, "error": "로그인이 필요합니다"}), 401
    VALID_ANNOUNCEMENT = ("문자", "SNS", "홈페이지", "전화통보", "이메일", "기타")
    if request.content_type and "multipart/form-data" in request.content_type:
        source = (request.form.get("source") or "").strip()
        contest_id = (request.form.get("contest_id") or "").strip()
        award_status = (request.form.get("award_status") or "").strip() or None
        result_method = (request.form.get("result_announcement_method") or "").strip() or None
        file = request.files.get("file") or request.files.get("image")
    else:
        data = request.get_json(silent=True) or {}
        source = (data.get("source") or "").strip()
        contest_id = (data.get("contest_id") or "").strip()
        award_status = (data.get("award_status") or "").strip() or None
        result_method = (data.get("result_announcement_method") or "").strip() or None
        file = None
    if not source or not contest_id:
        return jsonify({"success": False, "error": "source, contest_id가 필요합니다"}), 400
    if award_status and award_status not in ("대상", "최우수상", "우수상"):
        award_status = None
    if result_method and result_method not in VALID_ANNOUNCEMENT:
        result_method = None
    try:
        access_token = session.get("access_token") or ""
        refresh_token = session.get("refresh_token") or ""
        supabase_admin = get_supabase_admin_client()
        supabase = get_supabase_client_with_auth(access_token, refresh_token) if access_token else supabase_admin
        part = supabase_admin.table("contest_participation").select("user_id").eq("user_id", user_id).eq("source", source).eq("contest_id", contest_id).limit(1).execute()
        if not part.data or len(part.data) == 0:
            return jsonify({"success": False, "error": "참가한 공모전만 대표작으로 추가할 수 있습니다"}), 400
        existing = supabase_admin.table("user_representative_works").select("sort_order").eq("user_id", user_id).order("sort_order").execute()
        if existing.data and len(existing.data) >= 3:
            return jsonify({"success": False, "error": "대표작품은 최대 3개까지 등록할 수 있습니다"}), 400
        dup = supabase_admin.table("user_representative_works").select("user_id").eq("user_id", user_id).eq("source", source).eq("contest_id", contest_id).limit(1).execute()
        if dup.data and len(dup.data) > 0:
            return jsonify({"success": False, "error": "이미 대표작품에 등록되어 있습니다"}), 400
        used_orders = {int(r.get("sort_order") or 0) for r in (existing.data or [])}
        sort_order = 1
        for i in range(1, 4):
            if i not in used_orders:
                sort_order = i
                break
        image_path = ""
        if file:
            image_path = _upload_rep_image(user_id, source, contest_id, file, access_token, refresh_token) or ""
        supabase.table("user_representative_works").insert({
            "user_id": user_id,
            "source": source,
            "contest_id": contest_id,
            "sort_order": sort_order,
            "award_status": award_status,
            "result_announcement_method": result_method,
            "image_path": image_path or None,
        }).execute()
        return jsonify({"success": True})
    except Exception as e:
        logger.error("api/user/representative-works POST 오류: %s", e)
        return jsonify({"success": False, "error": str(e)}), 500


def _upload_rep_image(user_id: str, source: str, contest_id: str, file, access_token: str = "", refresh_token: str = "") -> str:
    """대표작 이미지 업로드 → rep 버킷 private/{user_id}/____{contest_id}.png → public URL 반환.
    auth 클라이언트 사용 시 Storage RLS 통과 (본인 폴더만 업로드 가능)"""
    if not file or file.filename == "":
        return ""
    ext = (file.filename.rsplit(".", 1)[-1] or "png").lower()
    if ext not in ALLOWED_IMAGE_EXT:
        ext = "png"
    path = f"private/{user_id}/____{contest_id}.{ext}"
    file_data = file.read()
    content_type = file.content_type or ("image/jpeg" if ext in ("jpg", "jpeg") else f"image/{ext}")
    supabase = get_supabase_client_with_auth(access_token, refresh_token) if access_token else get_supabase_admin_client()
    supabase.storage.from_(REP_BUCKET).upload(
        file=file_data,
        path=path,
        file_options={"content-type": content_type, "upsert": "true"},
    )
    return supabase.storage.from_(REP_BUCKET).get_public_url(path)


def _upload_participation_document(user_id: str, source: str, contest_id: str, file, access_token: str = "", refresh_token: str = "") -> tuple:
    """참가 상세 제출물 업로드 → contest 버킷. Supabase Storage key는 ASCII만 허용."""
    if not file or file.filename == "":
        return (None, None)
    orig_filename = file.filename or "document"
    ext = (orig_filename.rsplit(".", 1)[-1] or "").lower()
    if ext not in ALLOWED_DOC_EXT:
        ext = "pdf"
    safe_src = "".join(c for c in str(source) if c.isascii() and (c.isalnum() or c in "._-")) or "src"
    safe_cid = "".join(c for c in str(contest_id) if c.isascii() and (c.isalnum() or c in "._-")) or "cid"
    ts = str(int(time.time() * 1000))
    safe_key = f"doc_{safe_src}_{safe_cid}_{ts}.{ext}"
    path = f"private/{user_id}/{safe_key}"
    try:
        supabase = get_supabase_client_with_auth(access_token, refresh_token) if access_token else get_supabase_admin_client()
        file_data = file.read()
        content_type = file.content_type or "application/octet-stream"
        supabase.storage.from_(CONTEST_BUCKET).upload(
            file=file_data,
            path=path,
            file_options={"content-type": content_type, "upsert": "true"},
        )
        url = supabase.storage.from_(CONTEST_BUCKET).get_public_url(path)
        return (url, orig_filename)
    except Exception as e:
        logger.error("참가 상세 문서 업로드 실패: %s", e)
        raise


@app.route("/api/user/representative-works", methods=["PATCH"])
def api_user_representative_works_update():
    """대표작품 수정 (award_status, image). form 또는 JSON. image는 multipart file."""
    if not session.get("logged_in"):
        return jsonify({"success": False, "error": "로그인이 필요합니다"}), 401
    user_id = str(session.get("user_id") or "")
    if not user_id:
        return jsonify({"success": False, "error": "로그인이 필요합니다"}), 401

    VALID_ANNOUNCEMENT = ("문자", "SNS", "홈페이지", "전화통보", "이메일", "기타")
    if request.content_type and "multipart/form-data" in request.content_type:
        source = (request.form.get("source") or "").strip()
        contest_id = (request.form.get("contest_id") or "").strip()
        award_status = (request.form.get("award_status") or "").strip() or None
        result_method = (request.form.get("result_announcement_method") or "").strip() or None
        file = request.files.get("file") or request.files.get("image")
    else:
        data = request.get_json(silent=True) or {}
        source = (data.get("source") or "").strip()
        contest_id = (data.get("contest_id") or "").strip()
        award_status = (data.get("award_status") or "").strip() or None
        result_method = (data.get("result_announcement_method") or "").strip() or None
        file = None

    if not source or not contest_id:
        return jsonify({"success": False, "error": "source, contest_id가 필요합니다"}), 400
    if award_status and award_status not in ("대상", "최우수상", "우수상"):
        award_status = None
    if result_method and result_method not in VALID_ANNOUNCEMENT:
        result_method = None

    try:
        access_token = session.get("access_token") or ""
        refresh_token = session.get("refresh_token") or ""
        supabase_admin = get_supabase_admin_client()
        supabase = get_supabase_client_with_auth(access_token, refresh_token) if access_token else supabase_admin
        r = supabase_admin.table("user_representative_works").select("user_id").eq("user_id", user_id).eq("source", source).eq("contest_id", contest_id).limit(1).execute()
        if not r.data or len(r.data) == 0:
            return jsonify({"success": False, "error": "대표작을 찾을 수 없습니다"}), 404

        updates = {}
        if award_status is not None:
            updates["award_status"] = award_status
        if result_method is not None:
            updates["result_announcement_method"] = result_method
        if file:
            image_url = _upload_rep_image(user_id, source, contest_id, file, access_token, refresh_token)
            if image_url:
                updates["image_path"] = image_url
        if not updates:
            return jsonify({"success": True})
        supabase.table("user_representative_works").update(updates).eq("user_id", user_id).eq("source", source).eq("contest_id", contest_id).execute()
        return jsonify({"success": True})
    except Exception as e:
        logger.error("api/user/representative-works PATCH 오류: %s", e)
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/user/representative-works/reorder", methods=["PATCH"])
def api_user_representative_works_reorder():
    """대표작품 순서 변경. body: [{source, contest_id, sort_order}, ...]"""
    if not session.get("logged_in"):
        return jsonify({"success": False, "error": "로그인이 필요합니다"}), 401
    user_id = str(session.get("user_id") or "")
    if not user_id:
        return jsonify({"success": False, "error": "로그인이 필요합니다"}), 401
    data = request.get_json(silent=True) or {}
    items = data.get("items") or []
    if not items or len(items) > 3:
        return jsonify({"success": False, "error": "items(1~3개)가 필요합니다"}), 400
    try:
        access_token = session.get("access_token") or ""
        refresh_token = session.get("refresh_token") or ""
        supabase_admin = get_supabase_admin_client()
        supabase = get_supabase_client_with_auth(access_token, refresh_token) if access_token else supabase_admin
        valid_items = [(i, (it.get("source") or "").strip(), (it.get("contest_id") or "").strip()) for i, it in enumerate(items, start=1) if (it.get("source") or "").strip() and (it.get("contest_id") or "").strip()]
        if not valid_items:
            return jsonify({"success": True})
        keys_set = {(src, cid) for _, src, cid in valid_items}
        rows = supabase_admin.table("user_representative_works").select("source, contest_id, award_status, result_announcement_method, image_path").eq("user_id", user_id).execute()
        by_key = {(r.get("source"), r.get("contest_id")): r for r in (rows.data or []) if (r.get("source"), r.get("contest_id")) in keys_set}
        for sort_order, src, cid in valid_items:
            if (src, cid) not in by_key:
                continue
            supabase.table("user_representative_works").delete().eq("user_id", user_id).eq("source", src).eq("contest_id", cid).execute()
        for sort_order, src, cid in valid_items:
            if (src, cid) not in by_key:
                continue
            r = by_key[(src, cid)]
            supabase.table("user_representative_works").insert({
                "user_id": user_id,
                "source": src,
                "contest_id": cid,
                "sort_order": sort_order,
                "award_status": r.get("award_status"),
                "result_announcement_method": r.get("result_announcement_method"),
                "image_path": r.get("image_path"),
            }).execute()
        return jsonify({"success": True})
    except Exception as e:
        logger.error("api/user/representative-works/reorder 오류: %s", e)
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/user/representative-works", methods=["DELETE"])
def api_user_representative_works_delete():
    """대표작품 삭제"""
    if not session.get("logged_in"):
        return jsonify({"success": False, "error": "로그인이 필요합니다"}), 401
    user_id = str(session.get("user_id") or "")
    if not user_id:
        return jsonify({"success": False, "error": "로그인이 필요합니다"}), 401
    source = request.args.get("source", "").strip() or (request.get_json(silent=True) or {}).get("source", "")
    contest_id = request.args.get("contest_id", "").strip() or (request.get_json(silent=True) or {}).get("contest_id", "")
    if not source or not contest_id:
        return jsonify({"success": False, "error": "source, contest_id가 필요합니다"}), 400
    try:
        access_token = session.get("access_token") or ""
        refresh_token = session.get("refresh_token") or ""
        supabase = get_supabase_client_with_auth(access_token, refresh_token) if access_token else get_supabase_admin_client()
        supabase.table("user_representative_works").delete().eq("user_id", user_id).eq("source", source).eq("contest_id", contest_id).execute()
        return jsonify({"success": True})
    except Exception as e:
        logger.error("api/user/representative-works DELETE 오류: %s", e)
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/user/participation")
def api_user_participation():
    """참가/패스한 공모전 목록 (contest 정보 포함). user_id 없으면 현재 로그인 유저"""
    if not session.get("logged_in"):
        return jsonify({"success": True, "data": []})
    user_id = request.args.get("user_id", "").strip() or session.get("user_id")
    if not user_id:
        return jsonify({"success": True, "data": []})
    try:
        supabase = get_supabase_admin_client()
        r = supabase.table("contest_participation").select("source, contest_id, status, participation_type, team_id, updated_at").eq("user_id", user_id).order("updated_at", desc=True).execute()
        rows = r.data or []
        detail_by_key = {}
        try:
            dr = supabase.table("contest_participation_detail").select(
                "source, contest_id, participation_status, award_status, has_prize, prize_amount, "
                "document_filename, submitted_at, result_announcement_date, result_announcement_method"
            ).eq("user_id", user_id).execute()
            for d in (dr.data or []):
                k = (str(d.get("source", "")), str(d.get("contest_id", "")))
                detail_by_key[k] = d
        except Exception:
            pass
        result = []
        for p in rows:
            src = p.get("source") or ""
            cid = p.get("contest_id") or ""
            status = p.get("status") or ""
            participation_type = p.get("participation_type") or "individual"
            team_id = p.get("team_id")
            
            c = supabase.table("contests").select("source, id, title, url, d_day, host, category").eq("source", src).eq("id", cid).limit(1).execute()
            contest = (c.data or [{}])[0] if c.data else {}
            
            team_info = None
            if team_id:
                try:
                    team_res = supabase.table("contest_team").select("id, team_name, leader_user_id").eq("id", team_id).single().execute()
                    if team_res.data:
                        team_data = team_res.data
                        leader_profile = supabase.table("profiles").select("nickname").eq("id", team_data["leader_user_id"]).single().execute()
                        leader_nickname = leader_profile.data.get("nickname") if leader_profile.data else "Unknown"
                        
                        team_members_res = supabase.table("contest_participation").select("user_id").eq("team_id", team_id).execute()
                        member_ids = [m["user_id"] for m in (team_members_res.data or [])]
                        member_nicknames = []
                        for mid in member_ids:
                            try:
                                member_profile = supabase.table("profiles").select("nickname").eq("id", mid).single().execute()
                                if member_profile.data:
                                    member_nicknames.append(member_profile.data.get("nickname", "Unknown"))
                            except:
                                pass
                        
                        team_info = {
                            "team_name": team_data.get("team_name"),
                            "leader_nickname": leader_nickname,
                            "members": member_nicknames
                        }
                except Exception as e:
                    logger.warning(f"팀 정보 조회 실패: {e}")
            
            det = detail_by_key.get((src, cid), {})
            result.append({
                "source": src,
                "contest_id": cid,
                "status": status,
                "participation_type": participation_type,
                "team_info": team_info,
                "updated_at": p.get("updated_at"),
                "title": contest.get("title", "(제목 없음)"),
                "url": contest.get("url", ""),
                "d_day": contest.get("d_day", "-"),
                "host": contest.get("host", "-"),
                "category": contest.get("category", "공모전"),
                "has_detail": (src, cid) in detail_by_key,
                "participation_status": det.get("participation_status") or "",
                "award_status": det.get("award_status") or "",
                "has_prize": bool(det.get("has_prize")),
                "prize_amount": det.get("prize_amount"),
                "document_filename": det.get("document_filename") or "",
                "submitted_at": det.get("submitted_at"),
                "result_announcement_date": det.get("result_announcement_date"),
                "result_announcement_method": det.get("result_announcement_method") or "",
            })
        result.sort(key=lambda x: (x.get("updated_at") or ""), reverse=True)
        result.sort(key=lambda x: 0 if x.get("status") == "participate" else 1)
        return jsonify({"success": True, "data": result})
    except Exception as e:
        logger.error("api/user/participation 오류: %s", e)
        return jsonify({"success": True, "data": []})


def _post_comment(supabase, user_id, source, contest_id, body):
    """댓글 자동 등록 (내부용)"""
    try:
        supabase.table("contest_comments").insert({
            "user_id": user_id,
            "source": source,
            "contest_id": contest_id,
            "body": body,
        }).execute()
    except Exception as ex:
        logger.warning("댓글 자동 등록 실패: %s", ex)


def _upsert_participation_comment(supabase, user_id, source, contest_id, body):
    """참가/패스 댓글: 기존 참가 또는 패스 댓글이 있으면 업데이트, 없으면 신규 등록"""
    try:
        r = supabase.table("contest_comments").select("id").eq("user_id", user_id).eq("source", source).eq("contest_id", contest_id).in_("body", ["공모전 참가", "공모전 패스"]).execute()
        if r.data and len(r.data) > 0:
            supabase.table("contest_comments").update({"body": body}).eq("id", r.data[0]["id"]).execute()
        else:
            supabase.table("contest_comments").insert({
                "user_id": user_id,
                "source": source,
                "contest_id": contest_id,
                "body": body,
            }).execute()
    except Exception as ex:
        logger.warning("참가/패스 댓글 업데이트 실패: %s", ex)


@app.route("/api/contests/<source>/<contest_id>/content-check", methods=["POST"])
def api_contest_content_check(source, contest_id):
    """내용확인 클릭: contest_content_checks 기록 + 댓글 '공모전 내용확인 완료' 작성"""
    if not session.get("logged_in"):
        return jsonify({"success": False, "error": "로그인이 필요합니다"}), 401
    user_id = session.get("user_id")
    if not user_id:
        return jsonify({"success": False, "error": "로그인이 필요합니다"}), 401
    try:
        supabase = get_supabase_admin_client()
        try:
            supabase.table("contest_content_checks").upsert(
                {"user_id": user_id, "source": source, "contest_id": contest_id},
                on_conflict="user_id,source,contest_id"
            ).execute()
        except Exception:
            supabase.table("contest_content_checks").insert({
                "user_id": user_id,
                "source": source,
                "contest_id": contest_id,
            }).execute()
        _post_comment(supabase, user_id, source, contest_id, "공모전 내용확인 완료")
        exp_gained = _grant_exp(supabase, user_id, "content_check", source, contest_id)
        return jsonify({"success": True, "exp_gained": exp_gained})
    except Exception as e:
        logger.error("api/contest/content-check 오류: %s", e)
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/contests/<source>/<contest_id>/participation", methods=["POST", "DELETE"])
def api_contest_participation(source, contest_id):
    """참가/패스: POST=업데이트+댓글, DELETE=삭제"""
    if not session.get("logged_in"):
        return jsonify({"success": False, "error": "로그인이 필요합니다"}), 401
    user_id = session.get("user_id")
    if not user_id:
        return jsonify({"success": False, "error": "로그인이 필요합니다"}), 401
    if request.method == "DELETE":
        try:
            supabase = get_supabase_admin_client()
            supabase.table("contest_participation").delete().eq("user_id", user_id).eq("source", source).eq("contest_id", contest_id).execute()
            try:
                supabase.table("contest_comments").delete().eq("user_id", user_id).eq("source", source).eq("contest_id", contest_id).in_("body", ["공모전 참가", "공모전 패스"]).execute()
            except Exception:
                pass
            return jsonify({"success": True})
        except Exception as e:
            logger.error("participation DELETE 오류: %s", e)
            return jsonify({"success": False, "error": str(e)}), 500
    data = request.get_json(silent=True) or {}
    status = (data.get("status") or "").strip()
    if status not in ("participate", "pass"):
        return jsonify({"success": False, "error": "status는 participate 또는 pass"}), 400
    participation_type = (data.get("participation_type") or "individual").strip()
    team_id = data.get("team_id")
    try:
        supabase = get_supabase_admin_client()
        try:
            chk = supabase.table("contest_content_checks").select("user_id").eq("user_id", user_id).eq("source", source).eq("contest_id", contest_id).execute()
            if not chk.data or len(chk.data) == 0:
                return jsonify({"success": False, "error": "먼저 내용확인을 해주세요"}), 400
        except Exception:
            return jsonify({"success": False, "error": "먼저 내용확인을 해주세요"}), 400
        supabase.table("contest_participation").upsert(
            {
                "user_id": user_id,
                "source": source,
                "contest_id": contest_id,
                "status": status,
                "participation_type": participation_type,
                "team_id": team_id
            },
            on_conflict="user_id,source,contest_id"
        ).execute()
        comment_body = "공모전 참가" if status == "participate" else "공모전 패스"
        _upsert_participation_comment(supabase, user_id, source, contest_id, comment_body)
        act = "participate" if status == "participate" else "pass"
        exp_gained = _grant_exp(supabase, user_id, act, source, contest_id)
        return jsonify({"success": True, "exp_gained": exp_gained})
    except Exception as e:
        logger.error("api/contest/participation 오류: %s", e)
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/contests/<source>/<contest_id>/participation/detail/document-download")
def api_participation_detail_document_download(source, contest_id):
    """제출물 다운로드 URL 반환. user_id 쿼리파라미터 있으면 해당 유저 제출물(타인 프로필 조회용), 없으면 본인 제출물"""
    if not session.get("user_id"):
        return jsonify({"success": False, "error": "로그인이 필요합니다"}), 401
    target_user_id = request.args.get("user_id", "").strip() or session.get("user_id")
    try:
        supabase = get_supabase_admin_client()
        r = supabase.table("contest_participation_detail").select("document_path, document_filename").eq("user_id", target_user_id).eq("source", source).eq("contest_id", contest_id).limit(1).execute()
        if not r.data or len(r.data) == 0:
            return jsonify({"success": False, "error": "제출물이 없습니다"}), 404
        doc = r.data[0]
        path = (doc.get("document_path") or "").strip()
        filename = doc.get("document_filename") or "document"
        if not path:
            return jsonify({"success": False, "error": "제출물이 없습니다"}), 404
        if "/storage/v1/object/public/" in path and "/" + CONTEST_BUCKET + "/" in path:
            try:
                storage_path = path.split("/" + CONTEST_BUCKET + "/", 1)[-1]
                signed = supabase.storage.from_(CONTEST_BUCKET).create_signed_url(storage_path, 60)
                if signed:
                    url = signed.get("path") or signed.get("signedURL") or (list(signed.values())[0] if signed else None)
                    if url:
                        return jsonify({"success": True, "download_url": url, "filename": filename})
            except Exception:
                pass
        return jsonify({"success": True, "download_url": path, "filename": filename})
    except Exception as e:
        logger.error("document-download 오류: %s", e)
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/contests/<source>/<contest_id>/participation/detail", methods=["GET", "POST", "DELETE"])
def api_contest_participation_detail(source, contest_id):
    """참가 상세 정보: GET=조회, POST=등록/수정(upsert), DELETE=삭제"""
    if not session.get("logged_in"):
        return jsonify({"success": False, "error": "로그인이 필요합니다"}), 401
    user_id = session.get("user_id")
    if not user_id:
        return jsonify({"success": False, "error": "로그인이 필요합니다"}), 401
    try:
        supabase = get_supabase_admin_client()
        if request.method == "GET":
            r = supabase.table("contest_participation_detail").select("*").eq("user_id", user_id).eq("source", source).eq("contest_id", contest_id).limit(1).execute()
            data = r.data[0] if r.data else None
            return jsonify({"success": True, "data": data})
        if request.method == "DELETE":
            supabase.table("contest_participation_detail").delete().eq("user_id", user_id).eq("source", source).eq("contest_id", contest_id).execute()
            return jsonify({"success": True})
        if request.method == "POST":
            is_multipart = request.content_type and "multipart/form-data" in request.content_type
            if is_multipart:
                data = request.form.to_dict()
                doc_file = request.files.get("document") or request.files.get("file")
            else:
                data = request.get_json(silent=True) or {}
                doc_file = None
            participation_status = (data.get("participation_status") or "지원완료").strip()
            valid_statuses = ("지원완료", "심사중", "본선진출", "수상", "미수상", "취소")
            if participation_status not in valid_statuses:
                return jsonify({"success": False, "error": f"participation_status는 {', '.join(valid_statuses)} 중 하나"}), 400
            award_status = (data.get("award_status") or "").strip() or None
            if participation_status == "수상" and not award_status:
                return jsonify({"success": False, "error": "수상 시 award_status를 선택해주세요"}), 400
            valid_awards = ("대상", "최우수상", "우수상", "장려상", "입선", "기타")
            if award_status and award_status not in valid_awards:
                return jsonify({"success": False, "error": f"award_status는 {', '.join(valid_awards)} 중 하나"}), 400
            has_prize = data.get("has_prize") in (True, "true", "1", "on") if isinstance(data.get("has_prize"), str) else bool(data.get("has_prize"))
            prize_amount = data.get("prize_amount")
            try:
                prize_amount = float(prize_amount) if prize_amount is not None and prize_amount != "" else None
            except (TypeError, ValueError):
                prize_amount = None
            submitted_at = data.get("submitted_at") or None
            result_announcement_date = data.get("result_announcement_date") or None
            result_announcement_method = (data.get("result_announcement_method") or "").strip() or None
            document_path = (data.get("document_path") or "").strip() or None
            document_filename = (data.get("document_filename") or "").strip() or None
            has_doc = bool(document_path and document_filename) or (doc_file and doc_file.filename)
            if not has_doc:
                return jsonify({"success": False, "error": "제출물을 등록해 주세요."}), 400
            if doc_file and doc_file.filename:
                try:
                    acc = session.get("access_token") or ""
                    ref = session.get("refresh_token") or ""
                    doc_url, doc_name = _upload_participation_document(user_id, source, contest_id, doc_file, acc, ref)
                    if doc_url:
                        document_path = doc_url
                        document_filename = doc_name
                    else:
                        return jsonify({"success": False, "error": "문서 업로드에 실패했습니다."}), 500
                except Exception as up_err:
                    logger.error("참가 상세 문서 업로드 오류: %s", up_err)
                    return jsonify({"success": False, "error": f"문서 업로드 실패: {str(up_err)}"}), 500
            old_row = None
            try:
                r = supabase.table("contest_participation_detail").select("participation_status").eq("user_id", user_id).eq("source", source).eq("contest_id", contest_id).limit(1).execute()
                old_row = r.data[0] if r.data else None
            except Exception:
                pass
            payload = {
                "user_id": user_id,
                "source": source,
                "contest_id": contest_id,
                "participation_status": participation_status,
                "award_status": award_status,
                "has_prize": has_prize,
                "prize_amount": prize_amount,
                "submitted_at": submitted_at,
                "result_announcement_date": result_announcement_date,
                "result_announcement_method": result_announcement_method,
                "document_path": document_path,
                "document_filename": document_filename,
            }
            supabase.table("contest_participation_detail").upsert(payload, on_conflict="user_id,source,contest_id").execute()
            exp_gained = 0
            if not old_row:
                exp_gained = _grant_exp(supabase, user_id, "support_complete", source, contest_id)
            else:
                old_status = (old_row.get("participation_status") or "").strip()
                if participation_status == "본선진출" and old_status != "본선진출":
                    exp_gained = _grant_exp(supabase, user_id, "finalist", source, contest_id)
                elif participation_status == "수상" and old_status != "수상":
                    exp_gained = _grant_exp(supabase, user_id, "award", source, contest_id)
            return jsonify({"success": True, "exp_gained": exp_gained})
    except Exception as e:
        logger.error("api/contest/participation/detail 오류: %s", e)
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/contests/teams", methods=["GET", "POST"])
def api_contest_teams():
    """팀 조회(GET) 및 생성(POST)"""
    if not session.get("logged_in"):
        return jsonify({"success": False, "error": "로그인이 필요합니다"}), 401
    user_id = session.get("user_id")
    if not user_id:
        return jsonify({"success": False, "error": "로그인이 필요합니다"}), 401
    
    supabase = get_supabase_admin_client()
    
    if request.method == "GET":
        source = request.args.get("source")
        contest_id = request.args.get("contest_id")
        if not source or not contest_id:
            return jsonify([])
        try:
            r = supabase.table("contest_team").select("id, team_name, leader_user_id").eq("source", source).eq("contest_id", contest_id).execute()
            teams = r.data or []
            for team in teams:
                try:
                    profile = supabase.table("profiles").select("nickname").eq("id", team["leader_user_id"]).single().execute()
                    team["leader_nickname"] = profile.data.get("nickname") if profile.data else "Unknown"
                except Exception:
                    team["leader_nickname"] = "Unknown"
            return jsonify(teams)
        except Exception as e:
            logger.error("팀 조회 오류: %s", e)
            return jsonify([])
    
    if request.method == "POST":
        data = request.get_json(silent=True) or {}
        source = data.get("source")
        contest_id = data.get("contest_id")
        team_name = (data.get("team_name") or "").strip()
        if not source or not contest_id or not team_name:
            return jsonify({"success": False, "error": "필수 정보 누락"}), 400
        try:
            r = supabase.table("contest_team").insert({
                "source": source,
                "contest_id": contest_id,
                "team_name": team_name,
                "leader_user_id": user_id
            }).execute()
            return jsonify(r.data[0])
        except Exception as e:
            logger.error("팀 생성 오류: %s", e)
            return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/contests/<source>/<contest_id>/comments")
def api_contest_comments(source, contest_id):
    """공모전 댓글 목록 조회"""
    try:
        supabase = get_supabase_admin_client()
        r = supabase.table("contest_comments").select("id, user_id, body, created_at").eq("source", source).eq("contest_id", contest_id).order("created_at").execute()
        rows = r.data or []
        # nickname, profile_url 조회 (profiles)
        user_ids = list({x["user_id"] for x in rows if x.get("user_id")})
        profiles_map = {}
        if user_ids:
            try:
                p = supabase.table("profiles").select("id, nickname, profile_url").in_("id", user_ids).execute()
                for u in (p.data or []):
                    profiles_map[u["id"]] = {"nickname": u.get("nickname") or "익명", "profile_url": u.get("profile_url") or ""}
            except Exception:
                pass
        for row in rows:
            pr = profiles_map.get(row.get("user_id")) or {}
            row["nickname"] = pr.get("nickname", "익명")
            row["profile_url"] = pr.get("profile_url", "")
        current_user_id = str(session.get("user_id") or "") if session.get("logged_in") else None
        return jsonify({"success": True, "data": rows, "current_user_id": current_user_id})
    except Exception as e:
        logger.error("api/contest_comments 오류: %s", e)
        return jsonify({"success": True, "data": [], "current_user_id": None})


@app.route("/api/comments/<comment_id>", methods=["DELETE"])
def api_comment_delete(comment_id):
    """본인 댓글 삭제"""
    if not session.get("logged_in"):
        return jsonify({"success": False, "error": "로그인이 필요합니다"}), 401
    user_id = session.get("user_id")
    if not user_id:
        return jsonify({"success": False, "error": "로그인이 필요합니다"}), 401
    try:
        supabase = get_supabase_admin_client()
        r = supabase.table("contest_comments").select("id, user_id, source, contest_id").eq("id", comment_id).execute()
        if not r.data or len(r.data) == 0:
            return jsonify({"success": False, "error": "댓글을 찾을 수 없습니다"}), 404
        row = r.data[0]
        if str(row.get("user_id") or "") != str(user_id):
            return jsonify({"success": False, "error": "본인 댓글만 삭제할 수 있습니다"}), 403
        supabase.table("contest_comments").delete().eq("id", comment_id).execute()
        return jsonify({"success": True, "source": row.get("source"), "contest_id": row.get("contest_id")})
    except Exception as e:
        logger.error("api/comment_delete 오류: %s", e)
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/contests/<source>/<contest_id>/comments", methods=["POST"])
def api_contest_comments_create(source, contest_id):
    """공모전 댓글 등록"""
    if not session.get("logged_in"):
        return jsonify({"success": False, "error": "로그인이 필요합니다"}), 401
    user_id = session.get("user_id")
    if not user_id:
        return jsonify({"success": False, "error": "로그인이 필요합니다"}), 401
    data = request.get_json(silent=True) or {}
    body = (data.get("body") or "").strip()
    if not body:
        return jsonify({"success": False, "error": "댓글 내용을 입력하세요"}), 400
    try:
        supabase = get_supabase_admin_client()
        row = supabase.table("contest_comments").insert({
            "user_id": user_id,
            "source": source,
            "contest_id": contest_id,
            "body": body,
        }).execute()
        created = row.data[0] if row.data else {}
        return jsonify({"success": True, "data": created})
    except Exception as e:
        logger.error("api/contest_comments POST 오류: %s", e)
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/post/<post_id>")
def api_post(post_id):
    """상세 페이지 내용 크롤링 (요즘것들, 하위 호환)"""
    return _api_contest_content("요즘것들", post_id)


@app.route("/api/contests/<source>/<contest_id>/content")
def api_contest_content(source, contest_id):
    """상세 페이지 내용 크롤링 (소스별 크롤러)"""
    return _api_contest_content(source, contest_id)


def _api_contest_content(source: str, contest_id: str):
    try:
        source_clean = (source or "").strip()
        if source_clean == "위비티":
            detail = crawl_wevity_detail(contest_id)
        else:
            detail = crawl_post_detail(contest_id)
        if detail:
            return jsonify({"success": True, "data": detail})
        return jsonify({"success": False, "error": "상세 내용을 가져올 수 없습니다."}), 404
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


if __name__ == "__main__":
    app.run(debug=True, port=5000)
