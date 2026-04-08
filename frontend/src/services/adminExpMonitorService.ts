import { getSupabase } from './supabaseClient'
import { EXP_ACTIVITY_LABELS, listExpActivitiesForUi } from './expRewardsConfig'

const PAGE = 800
/** 집계 시 한 번에 스캔하는 최대 행 수 (초과 시 truncated) */
export const ADMIN_EXP_SUMMARY_MAX_ROWS = 12_000

export type AdminExpActivitySummary = {
  activity_type: string
  label: string
  count: number
  totalExp: number
}

export type AdminExpEventRow = {
  user_id: string
  nickname: string
  activity_type: string
  activity_label: string
  source: string
  contest_id: string
  exp_amount: number
  created_at: string
}

export type AdminExpMonitorSummaryResult =
  | {
      ok: true
      sinceIso: string | null
      summaries: AdminExpActivitySummary[]
      totalCount: number
      totalExp: number
      truncated: boolean
      scannedRows: number
    }
  | { ok: false; error: string }

export type AdminExpMonitorListResult =
  | {
      ok: true
      rows: AdminExpEventRow[]
      totalCount: number
      page: number
      pageSize: number
    }
  | { ok: false; error: string }

function startOfLocalDay(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

/** 기간 프리셋 → exp_events.created_at 하한 (null이면 기간 제한 없음) */
export function adminExpPeriodToSinceIso(period: '1d' | '7d' | '30d' | 'all'): string | null {
  if (period === 'all') return null
  const now = new Date()
  const today = startOfLocalDay(now)
  if (period === '1d') return today.toISOString()
  if (period === '7d') return addDays(today, -7).toISOString()
  return addDays(today, -30).toISOString()
}

async function fetchNicknamesForUserIds(sb: ReturnType<typeof getSupabase>, userIds: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  const unique = [...new Set(userIds)].filter(Boolean)
  const CHUNK = 120
  for (let i = 0; i < unique.length; i += CHUNK) {
    const slice = unique.slice(i, i + CHUNK)
    const { data, error } = await sb.from('profiles').select('id, nickname').in('id', slice)
    if (error) continue
    for (const r of data || []) {
      map.set(String((r as { id: string }).id), String((r as { nickname?: string | null }).nickname || ''))
    }
  }
  return map
}

export async function fetchAdminExpMonitorSummary(params: {
  sinceIso: string | null
  activityType: string | null
}): Promise<AdminExpMonitorSummaryResult> {
  const sb = getSupabase()
  const { sinceIso, activityType } = params

  const agg = new Map<string, { count: number; totalExp: number }>()
  for (const { activity_type } of listExpActivitiesForUi()) {
    agg.set(activity_type, { count: 0, totalExp: 0 })
  }

  let from = 0
  let scanned = 0
  let truncated = false

  while (scanned < ADMIN_EXP_SUMMARY_MAX_ROWS) {
    let q = sb
      .from('exp_events')
      .select('activity_type, exp_amount')
      .order('created_at', { ascending: false })
      .range(from, from + PAGE - 1)
    if (sinceIso) q = q.gte('created_at', sinceIso)
    if (activityType) q = q.eq('activity_type', activityType)

    const { data, error } = await q
    if (error) {
      return { ok: false, error: error.message || '경험치 집계를 불러오지 못했습니다.' }
    }
    if (!data?.length) break

    for (const r of data) {
      if (scanned >= ADMIN_EXP_SUMMARY_MAX_ROWS) {
        truncated = true
        break
      }
      const at = String((r as { activity_type?: string }).activity_type || '')
      const exp = Number((r as { exp_amount?: number | null }).exp_amount || 0)
      const cur = agg.get(at) || { count: 0, totalExp: 0 }
      cur.count += 1
      cur.totalExp += exp
      agg.set(at, cur)
      scanned += 1
    }

    if (truncated || data.length < PAGE) break
    from += PAGE
  }

  const order = listExpActivitiesForUi().map((x) => x.activity_type)
  const orderSet = new Set(order)
  const summaries: AdminExpActivitySummary[] = []

  if (activityType) {
    const a = agg.get(activityType) ?? { count: 0, totalExp: 0 }
    summaries.push({
      activity_type: activityType,
      label: EXP_ACTIVITY_LABELS[activityType] ?? activityType,
      count: a.count,
      totalExp: a.totalExp,
    })
  } else {
    for (const activity_type of order) {
      const a = agg.get(activity_type)
      if (!a || a.count === 0) continue
      summaries.push({
        activity_type,
        label: EXP_ACTIVITY_LABELS[activity_type] ?? activity_type,
        count: a.count,
        totalExp: a.totalExp,
      })
    }
    for (const [at, a] of agg) {
      if (orderSet.has(at) || a.count === 0) continue
      summaries.push({
        activity_type: at,
        label: EXP_ACTIVITY_LABELS[at] ?? at,
        count: a.count,
        totalExp: a.totalExp,
      })
    }
  }

  let totalCount = 0
  let totalExp = 0
  for (const s of summaries) {
    totalCount += s.count
    totalExp += s.totalExp
  }

  return {
    ok: true,
    sinceIso,
    summaries,
    totalCount,
    totalExp,
    truncated,
    scannedRows: scanned,
  }
}

export async function fetchAdminExpEventList(params: {
  page: number
  pageSize: number
  sinceIso: string | null
  activityType: string | null
}): Promise<AdminExpMonitorListResult> {
  const sb = getSupabase()
  const { page, pageSize, sinceIso, activityType } = params
  const safeSize = Math.min(100, Math.max(10, pageSize))
  const safePage = Math.max(1, page)
  const from = (safePage - 1) * safeSize

  let countQ = sb.from('exp_events').select('*', { count: 'exact', head: true })
  if (sinceIso) countQ = countQ.gte('created_at', sinceIso)
  if (activityType) countQ = countQ.eq('activity_type', activityType)
  const { count: totalCount, error: countErr } = await countQ
  if (countErr) {
    return { ok: false, error: countErr.message || '건수를 불러오지 못했습니다.' }
  }

  let listQ = sb
    .from('exp_events')
    .select('user_id, activity_type, source, contest_id, exp_amount, created_at')
    .order('created_at', { ascending: false })
    .range(from, from + safeSize - 1)
  if (sinceIso) listQ = listQ.gte('created_at', sinceIso)
  if (activityType) listQ = listQ.eq('activity_type', activityType)

  const { data, error } = await listQ
  if (error) {
    return { ok: false, error: error.message || '목록을 불러오지 못했습니다.' }
  }

  const raw = (data || []) as {
    user_id: string
    activity_type: string
    source: string
    contest_id: string
    exp_amount: number
    created_at: string
  }[]

  const nickMap = await fetchNicknamesForUserIds(
    sb,
    raw.map((r) => r.user_id),
  )

  const rows: AdminExpEventRow[] = raw.map((r) => {
    const activity_type = String(r.activity_type || '')
    return {
      user_id: r.user_id,
      nickname: nickMap.get(r.user_id) || '—',
      activity_type,
      activity_label: EXP_ACTIVITY_LABELS[activity_type] ?? activity_type,
      source: String(r.source || ''),
      contest_id: String(r.contest_id || ''),
      exp_amount: Number(r.exp_amount ?? 0),
      created_at: r.created_at,
    }
  })

  return {
    ok: true,
    rows,
    totalCount: totalCount ?? 0,
    page: safePage,
    pageSize: safeSize,
  }
}
