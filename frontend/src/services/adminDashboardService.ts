import { getSupabase } from './supabaseClient'
import { getTierFromLevel } from './levelUtils'

const PAGE = 1000
const MAX_EXP_ROWS_FOR_CHART = 12_000

/** d_day 텍스트에서 D-n 일수 추출. 마감=-1, D-day/오늘=0 */
function parseDdayDays(d: string | null | undefined): number | null {
  if (d == null) return null
  const s = String(d).trim()
  if (!s) return null
  if (s.includes('마감')) return -1
  if (s === 'D-day' || s.includes('오늘')) return 0
  const m = /^D-(\d+)$/i.exec(s)
  if (m) return parseInt(m[1], 10)
  return null
}

function isContestActive(d: string | null | undefined): boolean {
  const n = parseDdayDays(d)
  if (n === -1) return false
  if (n !== null) return n >= 0
  return !String(d || '').includes('마감')
}

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

const TIER_LABEL: Record<string, string> = {
  BRONZE: '브론즈',
  SILVER: '실버',
  GOLD: '골드',
  PLATINUM: '플래티넘',
  LEGEND: '레전드',
  SINGULARITY: '싱귤래러티',
}

const FEEDBACK_STATUS_LABEL: Record<string, string> = {
  pending: '대기',
  processing: '처리 중',
  done: '완료',
}

export type AdminDashboardSummary = {
  totalUsers: number
  newUsersToday: number
  newUsersYesterday: number
  expEventsToday: number
  expEventsYesterday: number
  feedbackPending: number
  contestsActive: number
  contestsTotal: number
}

export type AdminTierSlice = { name: string; value: number }
export type AdminDailyExpPoint = { date: string; count: number }
export type AdminCategoryBar = { category: string; count: number }
export type AdminFeedbackSlice = { status: string; label: string; count: number }

export type AdminDashboardBundle = {
  summary: AdminDashboardSummary
  tierDistribution: AdminTierSlice[]
  expEventsByDay: AdminDailyExpPoint[]
  contestsByCategory: AdminCategoryBar[]
  feedbackByStatus: AdminFeedbackSlice[]
  expEventsChartTruncated: boolean
}

async function countProfiles(): Promise<number> {
  const { count, error } = await getSupabase().from('profiles').select('*', { count: 'exact', head: true })
  if (error) return 0
  return count ?? 0
}

async function countProfilesCreatedBetween(gteIso: string, ltIso?: string): Promise<number> {
  let q = getSupabase().from('profiles').select('*', { count: 'exact', head: true }).gte('created_at', gteIso)
  if (ltIso) q = q.lt('created_at', ltIso)
  const { count, error } = await q
  if (error) return 0
  return count ?? 0
}

async function countExpEventsBetween(gteIso: string, ltIso?: string): Promise<number> {
  let q = getSupabase().from('exp_events').select('*', { count: 'exact', head: true }).gte('created_at', gteIso)
  if (ltIso) q = q.lt('created_at', ltIso)
  const { count, error } = await q
  if (error) return 0
  return count ?? 0
}

async function countFeedbackStatus(status: string): Promise<number> {
  const { count, error } = await getSupabase()
    .from('feedback_requests')
    .select('*', { count: 'exact', head: true })
    .eq('status', status)
  if (error) return 0
  return count ?? 0
}

async function fetchAllLevels(): Promise<number[]> {
  const sb = getSupabase()
  const levels: number[] = []
  let from = 0
  while (true) {
    const { data, error } = await sb.from('profiles').select('level').range(from, from + PAGE - 1)
    if (error || !data?.length) break
    for (const r of data) levels.push(Number((r as { level?: number }).level ?? 1))
    if (data.length < PAGE) break
    from += PAGE
  }
  return levels
}

async function fetchAllContestCategoriesAndDday(): Promise<{ categories: string[]; dDays: (string | null)[] }> {
  const sb = getSupabase()
  const categories: string[] = []
  const dDays: (string | null)[] = []
  let from = 0
  while (true) {
    const { data, error } = await sb.from('contests').select('category, d_day').range(from, from + PAGE - 1)
    if (error || !data?.length) break
    for (const r of data) {
      const raw = String((r as { category?: string | null }).category || '').trim()
      const c =
        !raw || raw.toUpperCase() === 'NULL' ? '(미분류)' : raw
      categories.push(c)
      dDays.push((r as { d_day?: string | null }).d_day ?? null)
    }
    if (data.length < PAGE) break
    from += PAGE
  }
  return { categories, dDays }
}

async function fetchExpEventTimestampsSince(iso: string): Promise<{ timestamps: string[]; truncated: boolean }> {
  const sb = getSupabase()
  const timestamps: string[] = []
  let from = 0
  let truncated = false
  while (timestamps.length < MAX_EXP_ROWS_FOR_CHART) {
    const { data, error } = await sb
      .from('exp_events')
      .select('created_at')
      .gte('created_at', iso)
      .order('created_at', { ascending: true })
      .range(from, from + PAGE - 1)
    if (error || !data?.length) break
    for (const r of data) {
      if (timestamps.length >= MAX_EXP_ROWS_FOR_CHART) {
        truncated = true
        break
      }
      const t = (r as { created_at?: string }).created_at
      if (t) timestamps.push(t)
    }
    if (truncated) break
    if (data.length < PAGE) break
    from += PAGE
  }
  return { timestamps, truncated }
}

function buildDailyCounts(timestamps: string[], days: number): AdminDailyExpPoint[] {
  const today = startOfLocalDay(new Date())
  const keys: string[] = []
  for (let i = days - 1; i >= 0; i--) {
    const d = addDays(today, -i)
    keys.push(d.toISOString().slice(0, 10))
  }
  const map = new Map<string, number>()
  for (const k of keys) map.set(k, 0)
  for (const iso of timestamps) {
    const day = iso.slice(0, 10)
    if (map.has(day)) map.set(day, (map.get(day) || 0) + 1)
  }
  return keys.map((date) => ({ date, count: map.get(date) || 0 }))
}

export async function fetchAdminDashboardBundle(): Promise<{
  ok: true
  data: AdminDashboardBundle
} | { ok: false; error: string }> {
  const now = new Date()
  const todayStart = startOfLocalDay(now)
  const todayIso = todayStart.toISOString()
  const yesterdayStart = addDays(todayStart, -1)
  const yesterdayIso = yesterdayStart.toISOString()
  const expChartSince = addDays(todayStart, -29).toISOString()

  try {
    const [
      totalUsers,
      newUsersToday,
      newUsersYesterday,
      expEventsToday,
      expEventsYesterday,
      feedbackPending,
      feedbackProcessing,
      feedbackDone,
      levels,
      contestData,
      expTs,
    ] = await Promise.all([
      countProfiles(),
      countProfilesCreatedBetween(todayIso),
      countProfilesCreatedBetween(yesterdayIso, todayIso),
      countExpEventsBetween(todayIso),
      countExpEventsBetween(yesterdayIso, todayIso),
      countFeedbackStatus('pending'),
      countFeedbackStatus('processing'),
      countFeedbackStatus('done'),
      fetchAllLevels(),
      fetchAllContestCategoriesAndDday(),
      fetchExpEventTimestampsSince(expChartSince),
    ])

    const contestsTotal = contestData.dDays.length
    const contestsActive = contestData.dDays.filter((d) => isContestActive(d)).length

    const tierBuckets: Record<string, number> = {}
    for (const lv of levels) {
      const { tierName } = getTierFromLevel(Math.max(1, lv))
      const label = TIER_LABEL[tierName] || tierName
      tierBuckets[label] = (tierBuckets[label] || 0) + 1
    }
    const tierDistribution: AdminTierSlice[] = ['브론즈', '실버', '골드', '플래티넘', '레전드']
      .map((name) => ({ name, value: tierBuckets[name] || 0 }))
      .filter((x) => x.value > 0)

    const catMap = new Map<string, number>()
    for (const c of contestData.categories) {
      catMap.set(c, (catMap.get(c) || 0) + 1)
    }
    const contestsByCategory: AdminCategoryBar[] = [...catMap.entries()]
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 12)

    const feedbackByStatus: AdminFeedbackSlice[] = [
      { status: 'pending', label: FEEDBACK_STATUS_LABEL.pending, count: feedbackPending },
      { status: 'processing', label: FEEDBACK_STATUS_LABEL.processing, count: feedbackProcessing },
      { status: 'done', label: FEEDBACK_STATUS_LABEL.done, count: feedbackDone },
    ]

    const expEventsByDay = buildDailyCounts(expTs.timestamps, 30)

    return {
      ok: true,
      data: {
        summary: {
          totalUsers,
          newUsersToday,
          newUsersYesterday,
          expEventsToday,
          expEventsYesterday,
          feedbackPending,
          contestsActive,
          contestsTotal,
        },
        tierDistribution,
        expEventsByDay,
        contestsByCategory,
        feedbackByStatus,
        expEventsChartTruncated: expTs.truncated,
      },
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : '대시보드 데이터를 불러오지 못했습니다.'
    return { ok: false, error: msg }
  }
}
