import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/** 개발 서버 기동 시 터미널에 Supabase 연결 상태 출력 (브라우저 콘솔과 동일 메시지). */
function supabaseDevTerminalLog(env: Record<string, string>): Plugin {
  return {
    name: 'allround-supabase-dev-terminal-log',
    configureServer(server) {
      const http = server.httpServer
      if (!http) return
      http.once('listening', () => {
        void logSupabaseToTerminal(env)
      })
    },
  }
}

async function logSupabaseToTerminal(env: Record<string, string>) {
  const url = env.VITE_NTP_SUPABASE_URL?.trim()
  const key = env.VITE_NTP_SUPABASE_ANON_KEY?.trim()
  if (!url || !key) {
    console.warn(
      '[allround] Supabase 미설정: VITE_NTP_SUPABASE_URL / VITE_NTP_SUPABASE_ANON_KEY 확인',
    )
    return
  }
  try {
    const { createClient } = await import('@supabase/supabase-js')
    const sb = createClient(url, key)
    const { error } = await sb.from('contests').select('id').limit(1)
    if (error) {
      console.warn('[allround] Supabase 클라이언트 OK · 샘플 쿼리 실패 (RLS/테이블):', error.message)
      console.info(
        '[allround] DB 엔드포인트 연결 완료 (인증·RLS 정책은 프로젝트 설정을 확인하세요)',
      )
      return
    }
    console.info('[allround] DB(Supabase) 연결 완료 · contests 샘플 조회 OK')
  } catch (e) {
    console.error('[allround] Supabase 초기화 오류:', e)
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    /* Tailwind는 번들 파이프라인 앞쪽에서 두는 편이 안전 (CSS 후처리·스캔) */
    plugins: [tailwindcss(), react(), supabaseDevTerminalLog(env)],
  }
})
