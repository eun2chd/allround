import { DEFAULT_CONTEST_SOURCE } from '../features/contests/contestTypes'
import { getSupabase } from './supabaseClient'

export type TeamMemberContest = {
  id: string
  title?: string
  url?: string
  d_day?: string
  host?: string
  category?: string
  source?: string
  /** contest_participation_detail 존재 여부 */
  has_detail?: boolean
}

export type TeamMemberOverview = {
  id: string
  nickname: string
  profile_url: string
  contests: TeamMemberContest[]
}

const LIST_COL = 'id, title, url, d_day, host, category, source' as const
const BATCH = 120

async function loadContestsMap(
  pairs: { source: string; contest_id: string }[],
): Promise<Map<string, TeamMemberContest>> {
  const sb = getSupabase()
  const bySource = new Map<string, Set<string>>()
  for (const p of pairs) {
    const s = String(p.source || '').trim()
    const id = String(p.contest_id || '').trim()
    if (!s || !id) continue
    if (!bySource.has(s)) bySource.set(s, new Set())
    bySource.get(s)!.add(id)
  }
  const map = new Map<string, TeamMemberContest>()
  for (const [source, idSet] of bySource) {
    const ids = [...idSet]
    for (let i = 0; i < ids.length; i += BATCH) {
      const chunk = ids.slice(i, i + BATCH)
      const { data, error } = await sb.from('contests').select(LIST_COL).eq('source', source).in('id', chunk)
      if (error) throw error
      for (const c of data || []) {
        const row = c as TeamMemberContest
        const src = String(row.source ?? source)
        const cid = String(row.id ?? '')
        map.set(`${src}:${cid}`, { ...row, source: src })
      }
    }
  }
  return map
}

/** 팀원(role=member)별 참가(participate) 공모전 — Flask `/api/team/participation-overview` 와 동일 목적 */
export async function fetchTeamParticipationOverview(): Promise<{
  success: boolean
  data?: TeamMemberOverview[]
  error?: string
}> {
  const sb = getSupabase()
  try {
    const { data: membersRaw, error: memErr } = await sb
      .from('profiles')
      .select('id, nickname, profile_url')
      .eq('role', 'member')
      .order('nickname')
    if (memErr) return { success: false, error: memErr.message }
    const members: TeamMemberOverview[] = (membersRaw || []).map((u) => ({
      id: String((u as { id: string }).id),
      nickname: String((u as { nickname?: string }).nickname || '회원'),
      profile_url: String((u as { profile_url?: string }).profile_url || ''),
      contests: [],
    }))
    if (!members.length) return { success: true, data: members }

    const userIds = members.map((m) => m.id)
    const { data: partsRaw, error: pErr } = await sb
      .from('contest_participation')
      .select('user_id, source, contest_id, updated_at')
      .eq('status', 'participate')
      .in('user_id', userIds)
      .order('updated_at', { ascending: false })
    if (pErr) return { success: false, error: pErr.message }
    const parts = partsRaw || []
    if (!parts.length) return { success: true, data: members }

    const { data: detailRows } = await sb
      .from('contest_participation_detail')
      .select('user_id, source, contest_id')
      .in('user_id', userIds)
    const detailSet = new Set(
      (detailRows || []).map((d) => {
        const dr = d as { user_id?: string; source?: string; contest_id?: string }
        return `${String(dr.user_id || '')}:${String(dr.source || '')}:${String(dr.contest_id || '')}`
      }),
    )

    const pairList = parts.map((p: { source?: string; contest_id?: string }) => ({
      source: String(p.source || ''),
      contest_id: String(p.contest_id || ''),
    }))
    let contestMap: Map<string, TeamMemberContest>
    try {
      contestMap = await loadContestsMap(pairList)
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : 'contests_load_failed' }
    }

    const partByUser = new Map<string, TeamMemberContest[]>()
    for (const p of parts) {
      const uid = String((p as { user_id: string }).user_id)
      const src = String((p as { source?: string }).source || '')
      const cid = String((p as { contest_id?: string }).contest_id || '')
      const c = contestMap.get(`${src}:${cid}`)
      if (!c) continue
      const list = partByUser.get(uid) || []
      const srcNorm = c.source || src || DEFAULT_CONTEST_SOURCE
      list.push({
        ...c,
        source: srcNorm,
        has_detail: detailSet.has(`${uid}:${srcNorm}:${cid}`),
      })
      partByUser.set(uid, list)
    }

    for (const m of members) {
      m.contests = partByUser.get(m.id) || []
    }
    return { success: true, data: members }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'unknown' }
  }
}
