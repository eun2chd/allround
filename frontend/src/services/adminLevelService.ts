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

/** 목록 + 총건수 + 전체 최대 레벨(새 행 기본값용). */
export async function fetchLevelConfigPageForAdmin(params: {
  page: number
  pageSize: number
}): Promise<
  | { ok: true; rows: LevelConfigAdminRow[]; total: number; maxLevel: number }
  | { ok: false; error: string }
> {
  const sb = getSupabase()
  const page = Math.max(1, params.page)
  const pageSize = Math.min(200, Math.max(1, params.pageSize))
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  const [listRes, maxRes] = await Promise.all([
    sb
      .from('level_config')
      .select('level, exp_to_next, tier_id', { count: 'exact' })
      .order('level', { ascending: true })
      .range(from, to),
    sb.from('level_config').select('level').order('level', { ascending: false }).limit(1).maybeSingle(),
  ])

  if (listRes.error) {
    return { ok: false, error: listRes.error.message || '레벨 구성을 불러오지 못했습니다.' }
  }

  const rows: LevelConfigAdminRow[] = (listRes.data || []).map((r) => ({
    level: Number((r as { level: number }).level),
    exp_to_next: Number((r as { exp_to_next?: number }).exp_to_next ?? 0),
    tier_id: Number((r as { tier_id?: number }).tier_id ?? 1),
  }))
  const total = listRes.count ?? 0
  const maxLevel =
    maxRes.data != null && (maxRes.data as { level?: number }).level != null
      ? Number((maxRes.data as { level: number }).level)
      : 0

  return { ok: true, rows, total, maxLevel }
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

function humanizeLevelTierInsertError(raw: string): string {
  if (/level_tiers_tier_id_check/i.test(raw)) {
    return (
      'tier_id 제약(1~6)과 맞지 않습니다. DB 마이그레이션(supabase/migrations/20260428_level_tiers_tier_id_check.sql 등)을 적용해 ' +
      'level_tiers의 tier_id 허용 범위가 1~6인지 확인하세요. tier_id 6을 넣는데 실패하면 예전 DB는 1~5만 허용하는 경우가 많습니다.'
    )
  }
  return raw || '등록에 실패했습니다.'
}

export async function insertLevelTier(payload: {
  tier_id: number
  tier_name: string
  level_min: number
  level_max: number | null
  exp_per_level: number
  sort_order: number
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const tidRaw = Number(payload.tier_id)
  const tid = Number.isFinite(tidRaw) ? Math.trunc(tidRaw) : NaN
  if (!Number.isFinite(tid) || tid < 1 || tid > 6) {
    return { ok: false, error: 'tier_id는 1~6 사이만 사용할 수 있습니다.' }
  }
  const name = payload.tier_name.trim()
  if (!name) return { ok: false, error: '티어 이름을 입력하세요.' }
  const sb = getSupabase()
  const { error } = await sb.from('level_tiers').insert({
    tier_id: tid,
    tier_name: name,
    level_min: Math.trunc(payload.level_min),
    level_max: payload.level_max == null ? null : Math.trunc(payload.level_max),
    exp_per_level: Math.trunc(payload.exp_per_level),
    sort_order: Math.trunc(payload.sort_order),
  })
  if (error) return { ok: false, error: humanizeLevelTierInsertError(error.message || '') }
  return { ok: true }
}

export async function deleteLevelTiers(
  tierIds: number[],
): Promise<{ ok: true; deleted: number } | { ok: false; error: string }> {
  const uniq = [
    ...new Set(tierIds.map((x) => Math.trunc(x)).filter((x) => Number.isFinite(x) && x >= 1 && x <= 6)),
  ]
  if (!uniq.length) return { ok: false, error: '삭제할 티어를 선택하세요.' }
  const sb = getSupabase()
  const { error } = await sb.from('level_tiers').delete().in('tier_id', uniq)
  if (error) {
    const raw = error.message || '삭제에 실패했습니다.'
    if (/23503|foreign key|violates|참조/i.test(raw)) {
      return {
        ok: false,
        error:
          '레벨 설정(level_config)에서 사용 중인 tier_id는 삭제할 수 없습니다. 해당 레벨 행의 tier_id를 바꾼 뒤 다시 시도하세요.',
      }
    }
    return { ok: false, error: raw }
  }
  return { ok: true, deleted: uniq.length }
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
  if (exp < 1) return { ok: false, error: 'exp_to_next는 1 이상이어야 합니다.' }
  if (tid < 1 || tid > 6) return { ok: false, error: 'tier_id는 1~6이어야 합니다.' }
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
  if (exp < 1) return { ok: false, error: 'exp_to_next는 1 이상이어야 합니다.' }
  if (tid < 1 || tid > 6) return { ok: false, error: 'tier_id는 1~6이어야 합니다.' }
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

export async function deleteLevelConfigRows(
  levels: number[],
): Promise<{ ok: true; deleted: number } | { ok: false; error: string }> {
  const uniq = [...new Set(levels.map((x) => Math.trunc(x)).filter((x) => Number.isFinite(x) && x >= 1))]
  if (!uniq.length) return { ok: false, error: '삭제할 레벨을 선택하세요.' }
  const sb = getSupabase()
  const { error } = await sb.from('level_config').delete().in('level', uniq)
  if (error) return { ok: false, error: error.message || '삭제에 실패했습니다.' }
  return { ok: true, deleted: uniq.length }
}
