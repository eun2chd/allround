import { getSupabase } from './supabaseClient'
import { invalidateExpAmountCache } from './expRewardRuntime'
import { listExpActivitiesForUi } from './expRewardsConfig'
import { resolveLevelProgress, type LevelConfigRow } from './levelUtils'

const EVENT_PAGE = 1000

export type ExpEventPrimaryKey = {
  user_id: string
  activity_type: string
  source: string
  contest_id: string
}

export type ExpRewardConfigRow = {
  activity_type: string
  label: string
  defaultExp: number
  /** DB에 없으면 null */
  dbExp: number | null
}

async function loadLevelConfigRows(sb: ReturnType<typeof getSupabase>): Promise<LevelConfigRow[]> {
  const { data } = await sb.from('level_config').select('level, exp_to_next').order('level')
  return (data || []) as LevelConfigRow[]
}

async function syncProfileLevel(sb: ReturnType<typeof getSupabase>, userId: string): Promise<void> {
  const { data: prof } = await sb.from('profiles').select('total_exp').eq('id', userId).maybeSingle()
  const total = Math.max(0, Number(prof?.total_exp ?? 0))
  const rows = await loadLevelConfigRows(sb)
  const { level } = resolveLevelProgress(total, rows)
  await sb.from('profiles').update({ level }).eq('id', userId)
}

export async function fetchExpRewardConfigForAdmin(): Promise<
  { ok: true; rows: ExpRewardConfigRow[] } | { ok: false; error: string }
> {
  const sb = getSupabase()
  const defaults = listExpActivitiesForUi()
  let dbMap = new Map<string, number>()
  try {
    const { data, error } = await sb.from('exp_reward_config').select('activity_type, exp_amount')
    if (error) throw error
    for (const r of data || []) {
      const k = String((r as { activity_type?: string }).activity_type || '').trim()
      if (k) dbMap.set(k, Number((r as { exp_amount?: number | null }).exp_amount ?? 0))
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, error: msg || 'exp_reward_config를 불러오지 못했습니다. 마이그레이션 적용 여부를 확인하세요.' }
  }

  const rows: ExpRewardConfigRow[] = defaults.map((d) => ({
    activity_type: d.activity_type,
    label: d.label,
    defaultExp: d.exp,
    dbExp: dbMap.has(d.activity_type) ? dbMap.get(d.activity_type)! : null,
  }))
  return { ok: true, rows }
}

export async function upsertExpRewardConfig(
  activityType: string,
  expAmount: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const t = activityType.trim()
  if (!t) return { ok: false, error: 'activity_type이 비었습니다.' }
  if (!Number.isFinite(expAmount) || expAmount < 0) {
    return { ok: false, error: 'EXP는 0 이상의 숫자여야 합니다.' }
  }
  const amt = Math.floor(expAmount)
  if (Math.abs(amt) > Number.MAX_SAFE_INTEGER) {
    return { ok: false, error: 'EXP 숫자가 너무 큽니다. (JS 안전 정수 한도)' }
  }
  const sb = getSupabase()
  const { error } = await sb.from('exp_reward_config').upsert(
    { activity_type: t, exp_amount: amt, updated_at: new Date().toISOString() },
    { onConflict: 'activity_type' },
  )
  if (error) return { ok: false, error: error.message || '저장에 실패했습니다.' }
  invalidateExpAmountCache()
  return { ok: true }
}

export async function deleteExpRewardOverride(activityType: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const sb = getSupabase()
  const { error } = await sb.from('exp_reward_config').delete().eq('activity_type', activityType.trim())
  if (error) return { ok: false, error: error.message || '삭제에 실패했습니다.' }
  invalidateExpAmountCache()
  return { ok: true }
}

export async function deleteExpEventAndAdjustProfile(
  key: ExpEventPrimaryKey,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const sb = getSupabase()
  const { data: row, error: selErr } = await sb
    .from('exp_events')
    .select('exp_amount')
    .eq('user_id', key.user_id)
    .eq('activity_type', key.activity_type)
    .eq('source', key.source)
    .eq('contest_id', key.contest_id)
    .maybeSingle()

  if (selErr) return { ok: false, error: selErr.message || '행을 찾지 못했습니다.' }
  if (!row) return { ok: false, error: '이미 삭제되었거나 없는 기록입니다.' }

  const delta = -Number((row as { exp_amount?: number }).exp_amount || 0)

  const { error: delErr } = await sb
    .from('exp_events')
    .delete()
    .eq('user_id', key.user_id)
    .eq('activity_type', key.activity_type)
    .eq('source', key.source)
    .eq('contest_id', key.contest_id)

  if (delErr) return { ok: false, error: delErr.message || '삭제에 실패했습니다.' }

  const { data: prof } = await sb.from('profiles').select('total_exp').eq('id', key.user_id).maybeSingle()
  const cur = Math.max(0, Number(prof?.total_exp ?? 0))
  const next = Math.max(0, cur + delta)
  const { error: upErr } = await sb.from('profiles').update({ total_exp: next }).eq('id', key.user_id)
  if (upErr) return { ok: false, error: upErr.message || '프로필 EXP 조정에 실패했습니다.' }

  await syncProfileLevel(sb, key.user_id)
  return { ok: true }
}

function makeAdminContestId(note?: string): string {
  const slug = (note || '')
    .trim()
    .slice(0, 48)
    .replace(/[^\w\-가-힣.]/g, '_')
    .replace(/_+/g, '_')
  const tail = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  return slug ? `admin_${slug}_${tail}` : `admin_${tail}`
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/** 닉네임 또는 UUID 형식의 profiles.id → 내부용 user id */
async function resolveProfileIdForAdminInput(raw: string): Promise<
  { ok: true; userId: string } | { ok: false; error: string }
> {
  const t = raw.trim()
  if (!t) return { ok: false, error: '닉네임을 입력하세요.' }

  const sb = getSupabase()
  if (UUID_RE.test(t)) {
    const { data, error } = await sb.from('profiles').select('id').eq('id', t).maybeSingle()
    if (error) return { ok: false, error: error.message || '프로필 조회에 실패했습니다.' }
    if (!data) return { ok: false, error: '해당 프로필이 없습니다.' }
    return { ok: true, userId: t }
  }

  const { data: rows, error: nErr } = await sb.from('profiles').select('id').eq('nickname', t).limit(2)
  if (nErr) return { ok: false, error: nErr.message || '프로필 조회에 실패했습니다.' }
  if (!rows?.length) return { ok: false, error: '일치하는 닉네임의 회원이 없습니다.' }
  if (rows.length > 1) return { ok: false, error: '같은 닉네임이 여러 계정에 있습니다. 구분 후 다시 시도해 주세요.' }
  return { ok: true, userId: String((rows[0] as { id: string }).id) }
}

/** 관리자 수동 지급·차감. activity_type = admin_grant, exp_amount는 양수/음수 허용. userId는 닉네임 또는 UUID.profiles.id */
export async function adminApplyExpDelta(params: {
  userId: string
  deltaExp: number
  note?: string
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const delta = Math.trunc(params.deltaExp)
  if (!Number.isFinite(delta) || delta === 0) return { ok: false, error: '0이 아닌 정수 EXP를 입력하세요.' }
  if (Math.abs(delta) > Number.MAX_SAFE_INTEGER) {
    return { ok: false, error: 'EXP 변화 숫자가 너무 큽니다. (표현 한도)' }
  }

  const resolved = await resolveProfileIdForAdminInput(params.userId)
  if (!resolved.ok) return resolved
  const userId = resolved.userId

  const sb = getSupabase()

  const { data: prof } = await sb.from('profiles').select('total_exp').eq('id', userId).maybeSingle()
  const cur = Math.max(0, Number(prof?.total_exp ?? 0))
  const next = cur + delta
  if (next < 0) return { ok: false, error: `차감 후 EXP가 음수입니다. (현재 ${cur})` }

  const source = 'admin'
  const contest_id = makeAdminContestId(params.note)

  const { error: insErr } = await sb.from('exp_events').insert({
    user_id: userId,
    activity_type: 'admin_grant',
    source,
    contest_id,
    exp_amount: delta,
  })
  if (insErr) {
    if (insErr.code === '23505' || String(insErr.message).includes('duplicate')) {
      return { ok: false, error: '동일 키 충돌(재시도하거나 메모를 바꿔 주세요).' }
    }
    return { ok: false, error: insErr.message || '이벤트 기록 추가에 실패했습니다.' }
  }

  const { error: upErr } = await sb.from('profiles').update({ total_exp: next }).eq('id', userId)
  if (upErr) {
    await sb.from('exp_events').delete().eq('user_id', userId).eq('activity_type', 'admin_grant').eq('source', source).eq('contest_id', contest_id)
    return { ok: false, error: upErr.message || '프로필 갱신에 실패했습니다.' }
  }

  await syncProfileLevel(sb, userId)
  return { ok: true }
}

/** exp_events 합계로 profiles.total_exp를 맞춤 (정리·복구용). userId는 닉네임 또는 UUID.profiles.id */
export async function reconcileProfileTotalExpFromEvents(
  userId: string,
): Promise<{ ok: true; sum: number } | { ok: false; error: string }> {
  const resolved = await resolveProfileIdForAdminInput(userId)
  if (!resolved.ok) return resolved
  const uid = resolved.userId

  const sb = getSupabase()

  let sum = 0
  let from = 0
  while (true) {
    const { data, error } = await sb
      .from('exp_events')
      .select('exp_amount')
      .eq('user_id', uid)
      .range(from, from + EVENT_PAGE - 1)
    if (error) return { ok: false, error: error.message || '이벤트 합산에 실패했습니다.' }
    if (!data?.length) break
    for (const r of data) sum += Number((r as { exp_amount?: number }).exp_amount || 0)
    if (data.length < EVENT_PAGE) break
    from += EVENT_PAGE
  }

  const { error: upErr } = await sb.from('profiles').update({ total_exp: Math.max(0, sum) }).eq('id', uid)
  if (upErr) return { ok: false, error: upErr.message || '프로필 갱신에 실패했습니다.' }
  await syncProfileLevel(sb, uid)
  return { ok: true, sum: Math.max(0, sum) }
}
