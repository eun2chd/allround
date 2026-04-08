import { getSupabase } from './supabaseClient'
import { EXP_ACTIVITY_AMOUNTS } from './expRewardsConfig'

type Cache = { map: Record<string, number>; at: number }

const TTL_MS = 30_000

let cache: Cache | null = null

function baseAmounts(): Record<string, number> {
  return { ...EXP_ACTIVITY_AMOUNTS }
}

/** contest 지급 등에서 사용. DB exp_reward_config가 있으면 해당 행으로 덮어씀. */
export async function getExpAmountForActivity(activityType: string): Promise<number> {
  const now = Date.now()
  if (!cache || now - cache.at > TTL_MS) {
    await refreshExpAmountCache()
  }
  const v = cache!.map[activityType]
  return typeof v === 'number' && v >= 0 ? v : 0
}

export async function refreshExpAmountCache(): Promise<void> {
  const sb = getSupabase()
  const map = baseAmounts()
  try {
    const { data, error } = await sb.from('exp_reward_config').select('activity_type, exp_amount')
    if (error) throw error
    for (const row of data || []) {
      const k = String((row as { activity_type?: string }).activity_type || '').trim()
      if (!k) continue
      map[k] = Number((row as { exp_amount?: number | null }).exp_amount ?? 0)
    }
  } catch {
    /* 테이블 없음·RLS 등 → 코드 기본값만 사용 */
  }
  cache = { map, at: Date.now() }
}

export function invalidateExpAmountCache(): void {
  cache = null
}
