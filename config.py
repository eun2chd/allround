"""
환경 변수 및 Supabase 설정
"""

import logging
import os
from pathlib import Path

from dotenv import load_dotenv

logger = logging.getLogger("allyoung.config")

# .env 로드 (프로젝트 루트 기준)
env_path = Path(__file__).parent / ".env"
load_dotenv(env_path)
logger.debug(".env 로드: %s (존재=%s)", env_path, env_path.exists())

SUPABASE_URL = os.getenv("VITE_NTP_SUPABASE_URL")
SUPABASE_ANON_KEY = os.getenv("VITE_NTP_SUPABASE_ANON_KEY")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")  # Storage 업로드용 (선택)
DATABASE_URL = os.getenv("VITE_NTP_DATABASE_URL")
DATABASE_DIRECT_URL = os.getenv("VITE_NTP_DATABASE_DIRECT_URL")


def get_supabase_client():
    """Supabase 클라이언트 생성"""
    if not SUPABASE_URL or not SUPABASE_ANON_KEY:
        logger.error("Supabase 미설정: URL=%s, KEY=%s", bool(SUPABASE_URL), bool(SUPABASE_ANON_KEY))
        raise ValueError("VITE_NTP_SUPABASE_URL, VITE_NTP_SUPABASE_ANON_KEY가 .env에 설정되어야 합니다.")
    logger.debug("Supabase URL: %s...", (SUPABASE_URL or "")[:40])
    from supabase import create_client
    return create_client(SUPABASE_URL, SUPABASE_ANON_KEY)


def get_supabase_admin_client():
    """서버 사이드용 Supabase 클라이언트 (RLS 우회, presence 등)"""
    if not SUPABASE_URL or not (SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY):
        raise ValueError("SUPABASE_URL과 SUPABASE_SERVICE_ROLE_KEY(또는 VITE_NTP_SUPABASE_ANON_KEY)가 .env에 필요합니다.")
    from supabase import create_client
    key = SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY
    return create_client(SUPABASE_URL, key)


def get_supabase_storage_client():
    """Storage 업로드용 Supabase 클라이언트 (service_role 권한 권장)"""
    return get_supabase_admin_client()


def get_supabase_client_with_auth(access_token: str, refresh_token: str = ""):
    """사용자 JWT로 Supabase 클라이언트 생성 (RLS 정책 auth.role()='authenticated' 만족)"""
    from supabase import create_client
    client = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)
    client.auth.set_session(access_token, refresh_token or "")
    return client


def get_supabase_for_server_storage_upload(access_token: str = "", refresh_token: str = ""):
    """Flask에서 세션으로 user_id를 검증한 뒤 Storage에 올릴 때 사용.

    service_role이 설정되어 있으면 항상 관리자 클라이언트를 쓴다. 업로드 직전에
    set_session → 토큰 refresh가 일어나며, 이미 소비된 refresh 토큰이면
    \"Invalid Refresh Token: Already Used\" 가 날 수 있어 이 경로로 회피한다.
    """
    if SUPABASE_SERVICE_ROLE_KEY:
        return get_supabase_admin_client()
    if access_token:
        return get_supabase_client_with_auth(access_token, refresh_token)
    return get_supabase_admin_client()
