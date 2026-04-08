import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_NTP_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_NTP_SUPABASE_ANON_KEY as string | undefined

let client: SupabaseClient | null = null

export function getSupabaseUrl(): string {
  if (!url) throw new Error('VITE_NTP_SUPABASE_URL이 .env에 없습니다.')
  return url
}

export function getSupabaseAnonKey(): string {
  if (!anonKey) throw new Error('VITE_NTP_SUPABASE_ANON_KEY가 .env에 없습니다.')
  return anonKey
}

/** 브라우저용 단일 Supabase 클라이언트 (anon + 사용자 세션). */
export function getSupabase(): SupabaseClient {
  if (!url || !anonKey) {
    throw new Error(
      'frontend/.env에 VITE_NTP_SUPABASE_URL, VITE_NTP_SUPABASE_ANON_KEY를 설정하세요. (루트 .env와 동일 이름)',
    )
  }
  if (!client) {
    client = createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  }
  return client
}

export function isSupabaseConfigured(): boolean {
  return Boolean(url?.trim() && anonKey?.trim())
}
