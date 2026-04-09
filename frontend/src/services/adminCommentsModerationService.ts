import { getSupabase } from './supabaseClient'

export type ContestCommentModRow = {
  id: string
  user_id: string
  source: string
  contest_id: string
  body: string
  created_at: string
  nickname?: string
}

export type StartupCommentModRow = {
  id: string
  user_id: string
  item_type: string
  item_id: string
  body: string
  created_at: string
  nickname?: string
}

const PAGE_MAX = 50

export async function fetchContestCommentsModerationPage(params: {
  page: number
  pageSize: number
}): Promise<{ ok: true; rows: ContestCommentModRow[]; total: number } | { ok: false; error: string }> {
  const sb = getSupabase()
  const p = Math.max(1, params.page)
  const lim = Math.max(1, Math.min(PAGE_MAX, params.pageSize))
  const from = (p - 1) * lim
  const { data, count, error } = await sb
    .from('contest_comments')
    .select('id, user_id, source, contest_id, body, created_at', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, from + lim - 1)
  if (error) return { ok: false, error: error.message || '댓글을 불러오지 못했습니다.' }
  const raw = (data || []) as ContestCommentModRow[]
  const ids = [...new Set(raw.map((r) => r.user_id).filter(Boolean))]
  const nick: Record<string, string> = {}
  if (ids.length) {
    const { data: profs } = await sb.from('profiles').select('id, nickname').in('id', ids)
    for (const u of profs || []) nick[String((u as { id: string }).id)] = String((u as { nickname?: string }).nickname || '')
  }
  for (const r of raw) {
    r.nickname = nick[r.user_id] || '—'
  }
  return { ok: true, rows: raw, total: count ?? 0 }
}

export async function fetchStartupCommentsModerationPage(params: {
  page: number
  pageSize: number
}): Promise<{ ok: true; rows: StartupCommentModRow[]; total: number } | { ok: false; error: string }> {
  const sb = getSupabase()
  const p = Math.max(1, params.page)
  const lim = Math.max(1, Math.min(PAGE_MAX, params.pageSize))
  const from = (p - 1) * lim
  const { data, count, error } = await sb
    .from('startup_comments')
    .select('id, user_id, item_type, item_id, body, created_at', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, from + lim - 1)
  if (error) return { ok: false, error: error.message || '댓글을 불러오지 못했습니다.' }
  const raw = (data || []) as StartupCommentModRow[]
  const ids = [...new Set(raw.map((r) => r.user_id).filter(Boolean))]
  const nick: Record<string, string> = {}
  if (ids.length) {
    const { data: profs } = await sb.from('profiles').select('id, nickname').in('id', ids)
    for (const u of profs || []) nick[String((u as { id: string }).id)] = String((u as { nickname?: string }).nickname || '')
  }
  for (const r of raw) {
    r.nickname = nick[r.user_id] || '—'
  }
  return { ok: true, rows: raw, total: count ?? 0 }
}

export async function adminDeleteContestComment(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const sb = getSupabase()
  const { error } = await sb.from('contest_comments').delete().eq('id', id)
  if (error) return { ok: false, error: error.message || '삭제에 실패했습니다.' }
  return { ok: true }
}

export async function adminDeleteStartupComment(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const sb = getSupabase()
  const { error } = await sb.from('startup_comments').delete().eq('id', id)
  if (error) return { ok: false, error: error.message || '삭제에 실패했습니다.' }
  return { ok: true }
}
