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
  /** contest_participation.updated_at */
  participation_registered_at?: string | null
  participation_status?: string | null
  award_status?: string | null
  has_prize?: boolean | null
  prize_amount?: number | null
  submitted_at?: string | null
  result_announcement_date?: string | null
  result_announcement_method?: string | null
  document_path?: string | null
  document_filename?: string | null
  /** 상금 정산 (상금 수령 건만) */
  prize_settlement_status?: string | null
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
      .select(
        'user_id, source, contest_id, participation_status, award_status, has_prize, prize_amount, prize_settlement_status, submitted_at, result_announcement_date, result_announcement_method, document_path, document_filename',
      )
      .in('user_id', userIds)
    const detailByKey = new Map<
      string,
      {
        participation_status?: string | null
        award_status?: string | null
        has_prize?: boolean | null
        prize_amount?: number | null
        submitted_at?: string | null
        result_announcement_date?: string | null
        result_announcement_method?: string | null
        document_path?: string | null
        document_filename?: string | null
        prize_settlement_status?: string | null
      }
    >()
    for (const d of detailRows || []) {
      const dr = d as {
        user_id?: string
        source?: string
        contest_id?: string
        participation_status?: string | null
        award_status?: string | null
        has_prize?: boolean | null
        prize_amount?: number | string | null
        submitted_at?: string | null
        result_announcement_date?: string | null
        result_announcement_method?: string | null
        document_path?: string | null
        document_filename?: string | null
        prize_settlement_status?: string | null
      }
      const uid = String(dr.user_id || '')
      const src = String(dr.source || '')
      const cid = String(dr.contest_id || '')
      if (!uid || !src || !cid) continue
      detailByKey.set(`${uid}:${src}:${cid}`, {
        participation_status: dr.participation_status ?? null,
        award_status: dr.award_status ?? null,
        has_prize: dr.has_prize ?? null,
        prize_amount:
          dr.prize_amount != null && dr.prize_amount !== ''
            ? Number(dr.prize_amount)
            : null,
        submitted_at: dr.submitted_at ?? null,
        result_announcement_date: dr.result_announcement_date ?? null,
        result_announcement_method: dr.result_announcement_method ?? null,
        document_path: dr.document_path ?? null,
        document_filename: dr.document_filename ?? null,
        prize_settlement_status: dr.prize_settlement_status ?? null,
      })
    }

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
      const dk = `${uid}:${srcNorm}:${cid}`
      const det = detailByKey.get(dk)
      const partU = p as { updated_at?: string | null }
      list.push({
        ...c,
        source: srcNorm,
        has_detail: !!det,
        participation_registered_at: partU.updated_at ?? null,
        participation_status: det?.participation_status ?? undefined,
        award_status: det?.award_status ?? undefined,
        has_prize: det?.has_prize ?? undefined,
        prize_amount: det?.prize_amount ?? undefined,
        submitted_at: det?.submitted_at ?? undefined,
        result_announcement_date: det?.result_announcement_date ?? undefined,
        result_announcement_method: det?.result_announcement_method ?? undefined,
        document_path: det?.document_path ?? undefined,
        document_filename: det?.document_filename ?? undefined,
        prize_settlement_status: det?.prize_settlement_status ?? undefined,
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
