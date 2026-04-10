import { getSupabase } from './supabaseClient'

export type ContestDashboardSummary = {
  newToday: number
  updatedLastHour: number
  deadlineSoon: number
}

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

/** D-3 이내(0~3) 또는 마감/D-day/오늘 — 대시보드 요약·목록 필터 공통 */
export function isContestDeadlineWithin3Days(d: string | null | undefined): boolean {
  const n = parseDdayDays(d)
  return n !== null && n <= 3
}

/** 요약 카드 `newToday`와 동일: 로컬 달력 기준 오늘 0시 이후 등록 */
export function isContestCreatedToday(createdAt: string | null | undefined): boolean {
  if (createdAt == null || String(createdAt).trim() === '') return false
  const t = new Date(String(createdAt).replace('Z', '+00:00')).getTime()
  if (Number.isNaN(t)) return false
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  return t >= start.getTime()
}

export async function fetchContestDashboardSummary(): Promise<ContestDashboardSummary | null> {
  const sb = getSupabase()
  const {
    data: { session },
  } = await sb.auth.getSession()
  if (!session) return null

  const start = new Date()
  start.setHours(0, 0, 0, 0)
  const startIso = start.toISOString()
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()

  const [{ count: newToday }, { count: updatedLastHour }, { data: ddayRows, error }] = await Promise.all([
    sb.from('contests').select('*', { count: 'exact', head: true }).gte('created_at', startIso),
    sb.from('contests').select('*', { count: 'exact', head: true }).gte('updated_at', hourAgo),
    sb.from('contests').select('d_day'),
  ])

  if (error) return null

  const deadlineSoon = (ddayRows || []).filter((r) =>
    isContestDeadlineWithin3Days((r as { d_day?: string }).d_day),
  ).length

  return {
    newToday: newToday ?? 0,
    updatedLastHour: updatedLastHour ?? 0,
    deadlineSoon,
  }
}
