import { getSupabase, isSupabaseConfigured } from './supabaseClient'

/** 개발 시 콘솔에 연결 상태 출력. contests 읽기는 RLS에 따라 실패할 수 있음. */
export async function logSupabaseConnectionDev(): Promise<void> {
  if (!import.meta.env.DEV) return

  if (!isSupabaseConfigured()) {
    console.warn('[allround] Supabase 미설정: VITE_NTP_SUPABASE_URL / VITE_NTP_SUPABASE_ANON_KEY 확인')
    return
  }

  try {
    const sb = getSupabase()
    const { error } = await sb.from('contests').select('id').limit(1)
    if (error) {
      console.warn('[allround] Supabase 클라이언트 OK · 샘플 쿼리 실패 (RLS/테이블):', error.message)
      console.info('[allround] DB 엔드포인트 연결 완료 (인증·RLS 정책은 프로젝트 설정을 확인하세요)')
      return
    }
    console.info('[allround] DB(Supabase) 연결 완료 · contests 샘플 조회 OK')
  } catch (e) {
    console.error('[allround] Supabase 초기화 오류:', e)
  }
}
