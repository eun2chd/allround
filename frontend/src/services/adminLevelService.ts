import { getSupabase } from './supabaseClient'

export type LevelTierRow = {
  tier_id: number
  tier_name: string
  level_min: number
  level_max: number | null
  exp_per_level: number
  sort_order: number
}

export type LevelConfigAdminRow = {
  level: number
  exp_to_next: number
  tier_id: number
}

export async function fetchLevelTiersForAdmin(): Promise<
  { ok: true; rows: LevelTierRow[] } | { ok: false; error: string }
> {
  const sb = getSupabase()
  const { data, error } = await sb
    .from('level_tiers')
    .select('tier_id, tier_name, level_min, level_max, exp_per_level, sort_order')
    .order('sort_order', { ascending: true })
  if (error) return { ok: false, error: error.message || '티어를 불러오지 못했습니다.' }
  const rows = (data || []).map((r) => ({
    tier_id: Number((r as { tier_id: number }).tier_id),
    tier_name: String((r as { tier_name?: string }).tier_name || ''),
    level_min: Number((r as { level_min?: number }).level_min ?? 0),
    level_max:
      (r as { level_max?: number | null }).level_max == null
        ? null
        : Number((r as { level_max?: number | null }).level_max),
    exp_per_level: Number((r as { exp_per_level?: number }).exp_per_level ?? 0),
    sort_order: Number((r as { sort_order?: number }).sort_order ?? 0),
  }))
  return { ok: true, rows }
}

export async function fetchLevelConfigForAdmin(): Promise<
  { ok: true; rows: LevelConfigAdminRow[] } | { ok: false; error: string }
> {
  const sb = getSupabase()
  const { data, error } = await sb
    .from('level_config')
    .select('level, exp_to_next, tier_id')
    .order('level', { ascending: true })
  if (error) return { ok: false, error: error.message || '레벨 구성을 불러오지 못했습니다.' }
  const rows = (data || []).map((r) => ({
    level: Number((r as { level: number }).level),
    exp_to_next: Number((r as { exp_to_next?: number }).exp_to_next ?? 0),
    tier_id: Number((r as { tier_id?: number }).tier_id ?? 1),
  }))
  return { ok: true, rows }
}

export async function updateLevelTier(
  tierId: number,
  payload: {
    tier_name: string
    level_min: number
    level_max: number | null
    exp_per_level: number
    sort_order: number
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const sb = getSupabase()
  const { error } = await sb
    .from('level_tiers')
    .update({
      tier_name: payload.tier_name.trim(),
      level_min: Math.trunc(payload.level_min),
      level_max: payload.level_max == null ? null : Math.trunc(payload.level_max),
      exp_per_level: Math.trunc(payload.exp_per_level),
      sort_order: Math.trunc(payload.sort_order),
    })
    .eq('tier_id', tierId)
  if (error) return { ok: false, error: error.message || '저장에 실패했습니다.' }
  return { ok: true }
}

export async function updateLevelConfigRow(
  level: number,
  expToNext: number,
  tierId: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const lv = Math.trunc(level)
  const exp = Math.trunc(expToNext)
  const tid = Math.trunc(tierId)
  if (lv < 1) return { ok: false, error: '레벨은 1 이상이어야 합니다.' }
  if (exp < 1 || exp > 1_000_000) return { ok: false, error: 'exp_to_next는 1~1,000,000 범위여야 합니다.' }
  if (tid < 1 || tid > 5) return { ok: false, error: 'tier_id는 1~5여야 합니다.' }
  const sb = getSupabase()
  const { error } = await sb.from('level_config').update({ exp_to_next: exp, tier_id: tid }).eq('level', lv)
  if (error) return { ok: false, error: error.message || '저장에 실패했습니다.' }
  return { ok: true }
}

export async function insertLevelConfigRow(
  level: number,
  expToNext: number,
  tierId: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const lv = Math.trunc(level)
  const exp = Math.trunc(expToNext)
  const tid = Math.trunc(tierId)
  if (lv < 1) return { ok: false, error: '레벨은 1 이상이어야 합니다.' }
  if (exp < 1 || exp > 1_000_000) return { ok: false, error: 'exp_to_next는 1~1,000,000 범위여야 합니다.' }
  if (tid < 1 || tid > 5) return { ok: false, error: 'tier_id는 1~5여야 합니다.' }
  const sb = getSupabase()
  const { error } = await sb.from('level_config').insert({ level: lv, exp_to_next: exp, tier_id: tid })
  if (error) return { ok: false, error: error.message || '추가에 실패했습니다.' }
  return { ok: true }
}

export async function deleteLevelConfigRow(level: number): Promise<{ ok: true } | { ok: false; error: string }> {
  const lv = Math.trunc(level)
  if (lv < 1) return { ok: false, error: '유효하지 않은 레벨입니다.' }
  const sb = getSupabase()
  const { error } = await sb.from('level_config').delete().eq('level', lv)
  if (error) return { ok: false, error: error.message || '삭제에 실패했습니다.' }
  return { ok: true }
}
