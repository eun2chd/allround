import { getSupabase, getSupabaseAnonKey, getSupabaseUrl } from './supabaseClient'
import { computeLevelFromExpRows, type LevelConfigRow } from './levelUtils'

export type MeData = {
  user_id: string
  nickname: string
  profile_url: string
  email: string
  role: string
  user_level: number
  supabase_url: string
  supabase_anon_key: string
}

async function loadLevelRows(sb: ReturnType<typeof getSupabase>): Promise<LevelConfigRow[]> {
  const { data } = await sb.from('level_config').select('level, exp_to_next').order('level')
  return (data || []) as LevelConfigRow[]
}

export async function fetchMeFromSupabase(): Promise<MeData | null> {
  const sb = getSupabase()
  const {
    data: { session },
  } = await sb.auth.getSession()
  if (!session?.user) return null

  const uid = session.user.id
  const { data: prof, error } = await sb
    .from('profiles')
    .select('id, nickname, profile_url, role, email, total_exp')
    .eq('id', uid)
    .maybeSingle()

  if (error || !prof) return null

  const totalExp = Number(prof.total_exp || 0)
  const levelRows = await loadLevelRows(sb)
  const userLevel = computeLevelFromExpRows(totalExp, levelRows)
  const role = (prof.role as string) === 'admin' ? 'admin' : 'member'

  return {
    user_id: String(prof.id),
    nickname: (prof.nickname as string) || '',
    profile_url: (prof.profile_url as string) || '',
    email: (prof.email as string) || session.user.email || '',
    role,
    user_level: userLevel,
    supabase_url: getSupabaseUrl(),
    supabase_anon_key: getSupabaseAnonKey(),
  }
}
