/**
 * 좌·우 사이드바 데이터 — Supabase만 사용 (Flask /api 미사용).
 * RLS 정책에 따라 일부 조회·수정이 막히면 빈 목록/에러가 날 수 있음.
 */
import { normalizePrizeSettlement } from '../features/participation/prizeSettlement'
import { getSupabase } from './supabaseClient'

const TEAM_PROFILE_BUCKET = 'teamprofile'

export type TeamSettingRow = {
  year?: number
  team_name?: string
  team_desc?: string
  goal_prize?: number
  image_path?: string
  achieved_amount?: number
  closed?: boolean
  updated_at?: string | null
}

export type SidebarMemberRow = {
  id: string
  nickname: string
  participate_count?: number
  profile_url?: string | null
}

/** 팀 대시보드 상금 랭킹 — `prize_received_won`은 상세 기준 수령 완료 합(원) */
export type SidebarMemberPrizeRow = SidebarMemberRow & {
  prize_received_won: number
}
export type SidebarActivityRow = {
  nickname: string
  title: string
  url: string
  updated_at?: string | null
}
export type SidebarUserRow = {
  id: string
  nickname?: string
  profile_url?: string
  status_message?: string
  last_seen?: string | null
}

async function sumPrizeAchieved(): Promise<number> {
  const sb = getSupabase()
  const { data, error } = await sb.from('contest_participation_detail').select('prize_amount, has_prize')
  if (error || !data?.length) return 0
  let total = 0
  for (const row of data) {
    if (row.has_prize && row.prize_amount != null) {
      const n = Number(row.prize_amount)
      if (!Number.isNaN(n)) total += n
    }
  }
  return Math.floor(total)
}

/** Flask api_team_prize_progress 와 동일한 의미 */
export async function fetchTeamPrizeProgress(year: number): Promise<{
  goal_prize: number
  total_achieved: number
  closed: boolean
  achieved_frozen: number
}> {
  const sb = getSupabase()
  const { data: setting } = await sb
    .from('site_team_settings')
    .select('goal_prize, achieved_amount, closed')
    .eq('year', year)
    .maybeSingle()

  let goal = 0
  let closed = false
  let achievedStored = 0
  if (setting) {
    goal = Math.max(0, Number(setting.goal_prize) || 0)
    closed = Boolean(setting.closed)
    achievedStored = Math.max(0, Number(setting.achieved_amount) || 0)
  }

  const totalRaw = await sumPrizeAchieved()
  let totalAchieved = totalRaw
  if (closed && achievedStored > 0) totalAchieved = achievedStored

  return {
    goal_prize: goal,
    total_achieved: totalAchieved,
    closed,
    /** 마감 시 고정 표시용 저장 달성액(원). 0이면 라이브 합계 의미 */
    achieved_frozen: achievedStored,
  }
}

export async function fetchSiteTeamSettingsList(): Promise<{ rows: TeamSettingRow[] }> {
  const sb = getSupabase()
  const res = await sb
    .from('site_team_settings')
    .select('year, team_name, team_desc, goal_prize, image_path, achieved_amount, closed')
    .order('year', { ascending: false })
  if (res.error) return { rows: [] }
  const rows = (res.data || []) as TeamSettingRow[]
  return { rows }
}

export async function fetchTeamSettingByYear(year: number): Promise<TeamSettingRow | null> {
  const sb = getSupabase()
  const { data, error } = await sb
    .from('site_team_settings')
    .select('year, team_name, team_desc, goal_prize, image_path, achieved_amount, closed')
    .eq('year', year)
    .maybeSingle()
  if (error || !data) return null
  return data as TeamSettingRow
}

/** 참가 건수 랭킹 + 수령 완료 상금 합 랭킹을 한 번에 로드 */
export async function fetchTeamDashboardMemberRankings(): Promise<{
  byParticipation: SidebarMemberRow[]
  byPrize: SidebarMemberPrizeRow[]
}> {
  const sb = getSupabase()
  const { data: members, error } = await sb
    .from('profiles')
    .select('id, nickname, profile_url')
    .eq('role', 'member')
    .order('nickname')
  if (error || !members?.length) return { byParticipation: [], byPrize: [] }

  const ids = members.map((m) => String(m.id))
  const [{ data: parts }, { data: details }] = await Promise.all([
    sb.from('contest_participation').select('user_id').eq('status', 'participate').in('user_id', ids),
    sb
      .from('contest_participation_detail')
      .select('user_id, has_prize, prize_amount, prize_settlement_status')
      .in('user_id', ids),
  ])

  const counts: Record<string, number> = {}
  for (const p of parts || []) {
    const uid = String(p.user_id || '')
    if (uid) counts[uid] = (counts[uid] || 0) + 1
  }

  const prizeByUser: Record<string, number> = {}
  for (const row of details || []) {
    const r = row as {
      user_id?: string
      has_prize?: boolean | null
      prize_amount?: number | string | null
      prize_settlement_status?: string | null
    }
    if (!r.has_prize || r.prize_amount == null || r.prize_amount === '') continue
    const n = Number(r.prize_amount)
    if (Number.isNaN(n) || n <= 0) continue
    if (normalizePrizeSettlement(r.prize_settlement_status) !== '수령 완료') continue
    const uid = String(r.user_id || '')
    if (!uid) continue
    prizeByUser[uid] = (prizeByUser[uid] || 0) + n
  }

  const base = members.map((m) => {
    const id = String(m.id)
    return {
      id,
      nickname: (m.nickname as string) || '회원',
      participate_count: counts[id] || 0,
      profile_url: (m as { profile_url?: string | null }).profile_url ?? null,
      prize_received_won: Math.floor(prizeByUser[id] || 0),
    }
  })

  const byParticipation: SidebarMemberRow[] = [...base]
    .map(({ prize_received_won: _p, ...rest }) => rest)
    .sort(
      (a, b) =>
        (b.participate_count || 0) - (a.participate_count || 0) ||
        (a.nickname || '').localeCompare(b.nickname || '', 'ko'),
    )

  const byPrize: SidebarMemberPrizeRow[] = [...base].sort(
    (a, b) =>
      b.prize_received_won - a.prize_received_won ||
      (b.participate_count || 0) - (a.participate_count || 0) ||
      (a.nickname || '').localeCompare(b.nickname || '', 'ko'),
  )

  return { byParticipation, byPrize }
}

export async function fetchMemberRanking(): Promise<SidebarMemberRow[]> {
  const { byParticipation } = await fetchTeamDashboardMemberRankings()
  return byParticipation
}

async function enrichParticipationActivityRows(
  sb: ReturnType<typeof getSupabase>,
  rows: { user_id?: string; source?: string; contest_id?: string; updated_at?: string | null }[],
): Promise<SidebarActivityRow[]> {
  if (!rows.length) return []

  const userIds = [...new Set(rows.map((r) => String(r.user_id || '')).filter(Boolean))]
  const { data: profs } = await sb.from('profiles').select('id, nickname').in('id', userIds)
  const nickById: Record<string, string> = {}
  for (const p of profs || []) {
    nickById[String(p.id)] = (p.nickname as string) || '회원'
  }

  const contestCache = new Map<string, { title: string; url: string }>()
  const result: SidebarActivityRow[] = []

  for (const r of rows) {
    const src = String(r.source || '')
    const cid = String(r.contest_id || '')
    const key = `${src}\0${cid}`
    let meta = contestCache.get(key)
    if (!meta && src && cid) {
      const { data: c } = await sb.from('contests').select('title, url').eq('source', src).eq('id', cid).maybeSingle()
      meta = {
        title: (c?.title as string) || '(제목 없음)',
        url: (c?.url as string) || '#',
      }
      contestCache.set(key, meta)
    }
    if (!meta) meta = { title: '(제목 없음)', url: '#' }
    result.push({
      nickname: nickById[String(r.user_id)] || '회원',
      title: meta.title,
      url: meta.url,
      updated_at: (r.updated_at as string | null | undefined) ?? null,
    })
  }
  return result
}

export async function fetchTeamActivityLast5(): Promise<SidebarActivityRow[]> {
  const sb = getSupabase()
  const { data: rows, error } = await sb
    .from('contest_participation')
    .select('user_id, source, contest_id, updated_at')
    .eq('status', 'participate')
    .order('updated_at', { ascending: false })
    .limit(5)
  if (error || !rows?.length) return []
  return enrichParticipationActivityRows(sb, rows || [])
}

/** `updated_at` 연도가 `year`인 참가 기록만 최대 `limit`건 */
export async function fetchTeamActivityForYear(year: number, limit = 5): Promise<SidebarActivityRow[]> {
  const sb = getSupabase()
  const { data: rows, error } = await sb
    .from('contest_participation')
    .select('user_id, source, contest_id, updated_at')
    .eq('status', 'participate')
    .order('updated_at', { ascending: false })
    .limit(160)
  if (error || !rows?.length) return []
  const filtered = (rows || []).filter((r) => {
    const u = r.updated_at
    if (u == null || u === '') return false
    const t = new Date(String(u)).getTime()
    if (Number.isNaN(t)) return false
    return new Date(t).getFullYear() === year
  })
  return enrichParticipationActivityRows(sb, filtered.slice(0, limit))
}

export async function fetchSidebarUsers(): Promise<SidebarUserRow[]> {
  const sb = getSupabase()
  const { data: profiles, error: pErr } = await sb
    .from('profiles')
    .select('id, nickname, profile_url, status_message')
    .order('nickname')
  if (pErr || !profiles) return []

  const { data: pres } = await sb.from('presence').select('user_id, last_seen, online')
  const presById: Record<string, { last_seen?: string | null }> = {}
  for (const p of pres || []) {
    const id = String(p.user_id || '').toLowerCase()
    if (id) presById[id] = { last_seen: p.last_seen as string | null }
  }

  return profiles.map((u) => {
    const id = String(u.id)
    const info = presById[id.toLowerCase()]
    return {
      id,
      nickname: u.nickname as string | undefined,
      profile_url: u.profile_url as string | undefined,
      status_message: u.status_message as string | undefined,
      last_seen: info?.last_seen ?? null,
    }
  })
}

export async function upsertTeamSettings(payload: {
  year: number
  team_name: string
  team_desc: string
  goal_prize: number
  /** 관리자 화면에서만 전달 (일반 팀 설정 모달에서는 생략) */
  achieved_amount?: number
  closed?: boolean
}): Promise<{ ok: boolean; error?: string }> {
  const sb = getSupabase()
  const row: Record<string, unknown> = {
    year: payload.year,
    team_name: payload.team_name,
    team_desc: payload.team_desc,
    goal_prize: payload.goal_prize,
  }
  if (payload.achieved_amount !== undefined) row.achieved_amount = Math.max(0, Math.floor(Number(payload.achieved_amount)))
  if (payload.closed !== undefined) row.closed = Boolean(payload.closed)
  const { error } = await sb.from('site_team_settings').upsert(row, { onConflict: 'year' })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

/** 수상 인정 금액 합계(원) — 팀 목표 달성 계산과 동일 기준 */
export async function fetchSumPrizeAchieved(): Promise<number> {
  return sumPrizeAchieved()
}

export async function uploadTeamProfileImage(year: number, file: File): Promise<{ ok: boolean; error?: string }> {
  const sb = getSupabase()
  const ext = (file.name.split('.').pop() || 'png').toLowerCase()
  if (!/^jpg|jpeg|png|gif|webp$/.test(ext)) {
    return { ok: false, error: '허용 형식: jpg, png, gif, webp' }
  }
  const path = `private/${year}_team.${ext}`
  const { error: upErr } = await sb.storage.from(TEAM_PROFILE_BUCKET).upload(path, file, {
    upsert: true,
    contentType: file.type || undefined,
  })
  if (upErr) return { ok: false, error: upErr.message }

  const {
    data: { publicUrl },
  } = sb.storage.from(TEAM_PROFILE_BUCKET).getPublicUrl(path)
  const { error: upRow } = await sb.from('site_team_settings').update({ image_path: publicUrl }).eq('year', year)
  if (upRow) return { ok: false, error: upRow.message }
  return { ok: true }
}

export async function closeTeamSettingYear(year: number): Promise<{ ok: boolean; error?: string }> {
  const sb = getSupabase()
  const achieved = await sumPrizeAchieved()
  const { error } = await sb
    .from('site_team_settings')
    .update({ achieved_amount: achieved, closed: true })
    .eq('year', year)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function deleteTeamSettingYear(year: number): Promise<{ ok: boolean; error?: string }> {
  const sb = getSupabase()
  const { error } = await sb.from('site_team_settings').delete().eq('year', year)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
