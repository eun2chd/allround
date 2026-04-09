import type { SupabaseClient } from '@supabase/supabase-js'
import { contestSourceQueryCandidates } from '../features/contests/contestTypes'
import { getSupabase } from './supabaseClient'

/** getUser() 네트워크 실패 등으로 비어도 로컬 세션에는 uid가 있는 경우가 있음 */
async function getAuthUserId(sb: SupabaseClient): Promise<string | undefined> {
  const { data: auth } = await sb.auth.getUser()
  const fromUser = auth?.user?.id
  if (fromUser) return fromUser
  const { data: sess } = await sb.auth.getSession()
  const fromSession = sess?.session?.user?.id
  if (fromSession) return fromSession
  return undefined
}

/** 팀 INSERT 시 contests(source,id) FK와 동일한 source 사용 */
async function resolveContestSourceForInsert(
  sb: SupabaseClient,
  sourceHint: string,
  contestId: string,
): Promise<string | null> {
  const cid = String(contestId || '').trim()
  if (!cid) return null
  for (const s of contestSourceQueryCandidates(sourceHint)) {
    const { data } = await sb.from('contests').select('source').eq('source', s).eq('id', cid).maybeSingle()
    if (data?.source !== undefined && data.source !== null) return String(data.source)
  }
  const { data: rows } = await sb.from('contests').select('source').eq('id', cid).limit(2)
  if (rows?.length === 1 && rows[0].source !== undefined && rows[0].source !== null) {
    return String(rows[0].source)
  }
  return null
}

export type ContestTeamRow = {
  id: string
  team_name: string
  created_at?: string
  leader_user_id?: string
  leader_nickname?: string
  /** 현재 로그인 사용자가 이 팀의 리더인지 */
  i_am_leader?: boolean
}

type TeamRowRaw = {
  id: string
  team_name: string
  created_at?: string
  leader_user_id?: string
}

/**
 * 이 공고에 등록된 팀 전체 (다른 사용자가 만든 팀 포함).
 * 참가 시 동일 team_id로 저장하면 됨.
 */
export async function fetchContestTeamsForParticipation(source: string, contestId: string): Promise<ContestTeamRow[]> {
  const sb = getSupabase()
  const uid = await getAuthUserId(sb)
  const cid = String(contestId || '').trim()
  const candidates = contestSourceQueryCandidates(source)

  if (!cid) return []

  const seen = new Set<string>()
  const merged: TeamRowRaw[] = []
  const pushRows = (rows: TeamRowRaw[] | null | undefined) => {
    for (const r of rows || []) {
      if (r?.id && !seen.has(r.id)) {
        seen.add(r.id)
        merged.push(r)
      }
    }
  }

  for (const src of candidates) {
    const { data, error } = await sb
      .from('contest_team')
      .select('id, team_name, created_at, leader_user_id')
      .eq('source', src)
      .eq('contest_id', cid)
    if (error) continue
    pushRows(data as TeamRowRaw[])
  }

  if (merged.length === 0) {
    const { data: loose, error: err2 } = await sb
      .from('contest_team')
      .select('id, team_name, created_at, leader_user_id')
      .eq('contest_id', cid)
      .order('created_at', { ascending: false })
    if (!err2) pushRows(loose as TeamRowRaw[])
  }

  merged.sort((a, b) => {
    const ta = a.created_at ? new Date(a.created_at).getTime() : 0
    const tb = b.created_at ? new Date(b.created_at).getTime() : 0
    return tb - ta
  })

  const leaderIds = [...new Set(merged.map((t) => t.leader_user_id).filter(Boolean) as string[])]
  const nickById: Record<string, string> = {}
  if (leaderIds.length) {
    const { data: profs } = await sb.from('profiles').select('id, nickname').in('id', leaderIds)
    for (const p of profs || []) nickById[String(p.id)] = String(p.nickname || '').trim() || '—'
  }

  return merged.map((t) => ({
    id: t.id,
    team_name: t.team_name,
    created_at: t.created_at,
    leader_user_id: t.leader_user_id,
    leader_nickname: t.leader_user_id ? nickById[String(t.leader_user_id)] : undefined,
    i_am_leader: Boolean(uid && t.leader_user_id && uid === t.leader_user_id),
  }))
}

export async function createContestTeam(
  source: string,
  contestId: string,
  teamName: string,
): Promise<{ success: true; id: string; team_name: string } | { success: false; error: string }> {
  const sb = getSupabase()
  const uid = await getAuthUserId(sb)
  if (!uid) return { success: false, error: '로그인이 필요합니다.' }
  const cid = String(contestId || '').trim()
  const name = String(teamName || '').trim() || '팀'
  if (!cid) return { success: false, error: '공고 정보가 올바르지 않습니다.' }
  // INSERT는 contests FK와 동일한 source여야 함. 앱 기본 출처·빈 출처 혼용 시 contests 행에 맞춤
  const srcForInsert = await resolveContestSourceForInsert(sb, String(source ?? ''), cid)
  if (!srcForInsert) {
    return { success: false, error: '해당 공고를 찾을 수 없어 팀을 만들 수 없습니다.' }
  }
  const { data, error } = await sb
    .from('contest_team')
    .insert({
      source: srcForInsert,
      contest_id: cid,
      team_name: name,
      leader_user_id: uid,
    })
    .select('id, team_name')
    .single()
  if (error || !data?.id) return { success: false, error: error?.message || '팀 생성에 실패했습니다.' }
  return { success: true, id: String(data.id), team_name: String(data.team_name || name) }
}
