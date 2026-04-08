import { getSupabase } from './supabaseClient'
import { resolveLevelProgress, type LevelConfigRow } from './levelUtils'

export type AdminProfileRow = {
  id: string
  nickname: string
  email: string
  role: 'admin' | 'member'
  profile_url: string
  total_exp: number
}

export async function fetchAdminProfilesList(): Promise<{ success: true; data: AdminProfileRow[] } | { success: false; error: string }> {
  const sb = getSupabase()
  const { data, error } = await sb
    .from('profiles')
    .select('id, nickname, email, role, profile_url, total_exp')
    .order('nickname', { ascending: true })

  if (error) {
    return { success: false, error: error.message || '목록을 불러오지 못했습니다.' }
  }

  const rows: AdminProfileRow[] = (data || []).map((r) => {
    const roleRaw = String((r as { role?: string }).role || 'member').toLowerCase()
    return {
      id: String((r as { id: string }).id),
      nickname: String((r as { nickname?: string }).nickname || ''),
      email: String((r as { email?: string }).email || ''),
      role: roleRaw === 'admin' ? 'admin' : 'member',
      profile_url: String((r as { profile_url?: string | null }).profile_url || ''),
      total_exp: Number((r as { total_exp?: number | null }).total_exp || 0),
    }
  })

  return { success: true, data: rows }
}

export async function updateProfileRole(
  userId: string,
  role: 'admin' | 'member',
): Promise<{ success: true } | { success: false; error: string }> {
  const sb = getSupabase()
  const { error } = await sb.from('profiles').update({ role }).eq('id', userId)
  if (error) {
    return { success: false, error: error.message || '역할 변경에 실패했습니다.' }
  }
  return { success: true }
}

/** `level`은 `profiles.level`이 아니라 `total_exp` + `level_config`로 산출 (마이페이지와 동일). */
export type AdminProfileDetail = {
  id: string
  nickname: string
  email: string
  role: 'admin' | 'member'
  profile_url: string
  status_message: string
  level: number
  total_exp: number
  created_at: string | null
  updated_at: string | null
}

export async function fetchAdminProfileDetail(
  userId: string,
): Promise<{ success: true; data: AdminProfileDetail } | { success: false; error: string }> {
  if (!userId.trim()) {
    return { success: false, error: '잘못된 사용자입니다.' }
  }
  const sb = getSupabase()
  const [profRes, levelCfgRes] = await Promise.all([
    sb
      .from('profiles')
      .select('id, nickname, email, role, profile_url, status_message, total_exp, created_at, updated_at')
      .eq('id', userId)
      .maybeSingle(),
    sb.from('level_config').select('level, exp_to_next').order('level'),
  ])

  const { data, error } = profRes
  if (error) {
    return { success: false, error: error.message || '프로필을 불러오지 못했습니다.' }
  }
  if (!data) {
    return { success: false, error: '사용자를 찾을 수 없습니다.' }
  }

  const { data: levelData, error: levelCfgError } = levelCfgRes
  if (levelCfgError) {
    return {
      success: false,
      error: levelCfgError.message || '레벨 설정(level_config)을 불러오지 못했습니다.',
    }
  }

  const levelRows = (levelData || []) as LevelConfigRow[]
  const totalExp = Number((data as { total_exp?: number | null }).total_exp || 0)
  const computedLevel = resolveLevelProgress(totalExp, levelRows).level

  const roleRaw = String((data as { role?: string }).role || 'member').toLowerCase()
  const row: AdminProfileDetail = {
    id: String((data as { id: string }).id),
    nickname: String((data as { nickname?: string }).nickname || ''),
    email: String((data as { email?: string }).email || ''),
    role: roleRaw === 'admin' ? 'admin' : 'member',
    profile_url: String((data as { profile_url?: string | null }).profile_url || ''),
    status_message: String((data as { status_message?: string | null }).status_message || ''),
    level: computedLevel,
    total_exp: totalExp,
    created_at: (data as { created_at?: string | null }).created_at ?? null,
    updated_at: (data as { updated_at?: string | null }).updated_at ?? null,
  }

  return { success: true, data: row }
}
