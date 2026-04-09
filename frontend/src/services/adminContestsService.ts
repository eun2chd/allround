import { DEFAULT_CONTEST_SOURCE } from '../features/contests/contestTypes'
import { getSupabase } from './supabaseClient'
import { fetchContestFilters } from './contestService'

export type AdminContestRow = {
  source: string
  id: string
  title: string | null
  d_day: string | null
  host: string | null
  url: string | null
  category: string | null
  content: string | null
  created_at: string | null
  first_seen_at: string | null
  updated_at: string | null
}

export type AdminContestsListResult =
  | { success: true; rows: AdminContestRow[]; total: number }
  | { success: false; error: string }

function sanitizeIlike(q: string): string {
  return q.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_')
}

export async function fetchAdminContestsPage(params: {
  page: number
  pageSize: number
  searchQ?: string
  sourceFilter?: string
}): Promise<AdminContestsListResult> {
  const sb = getSupabase()
  const page = Math.max(1, params.page)
  const pageSize = Math.min(100, Math.max(1, params.pageSize))
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  let qb = sb.from('contests').select('*', { count: 'exact' })

  const src = params.sourceFilter?.trim()
  if (src) {
    if (src === DEFAULT_CONTEST_SOURCE) {
      qb = qb.or(`source.eq.${DEFAULT_CONTEST_SOURCE},source.is.null,source.eq.`)
    } else {
      qb = qb.eq('source', src)
    }
  }

  const rawQ = params.searchQ?.trim()
  if (rawQ) {
    const s = sanitizeIlike(rawQ)
    qb = qb.or(`title.ilike.%${s}%,host.ilike.%${s}%,id.ilike.%${s}%`)
  }

  const { data, error, count } = await qb
    .order('updated_at', { ascending: false, nullsFirst: false })
    .range(from, to)

  if (error) {
    return { success: false, error: error.message || '목록을 불러오지 못했습니다.' }
  }

  const rows: AdminContestRow[] = (data || []).map((r) => ({
    source: String((r as { source: string }).source ?? ''),
    id: String((r as { id: string }).id ?? ''),
    title: (r as { title?: string | null }).title ?? null,
    d_day: (r as { d_day?: string | null }).d_day ?? null,
    host: (r as { host?: string | null }).host ?? null,
    url: (r as { url?: string | null }).url ?? null,
    category: (r as { category?: string | null }).category ?? null,
    content: (r as { content?: string | null }).content ?? null,
    created_at: (r as { created_at?: string | null }).created_at ?? null,
    first_seen_at: (r as { first_seen_at?: string | null }).first_seen_at ?? null,
    updated_at: (r as { updated_at?: string | null }).updated_at ?? null,
  }))

  return { success: true, rows, total: count ?? 0 }
}

export async function fetchContestSourcesForAdmin(): Promise<{ success: true; sources: string[] } | { success: false; error: string }> {
  try {
    const { sources } = await fetchContestFilters()
    return { success: true, sources }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { success: false, error: msg || '출처 목록을 불러오지 못했습니다.' }
  }
}

export type AdminContestPatch = {
  title?: string | null
  d_day?: string | null
  host?: string | null
  url?: string | null
  category?: string | null
  content?: string | null
}

export async function updateAdminContest(
  source: string,
  id: string,
  patch: AdminContestPatch,
): Promise<{ success: true } | { success: false; error: string }> {
  if (!source || !id) {
    return { success: false, error: '출처 또는 ID가 없습니다.' }
  }
  const sb = getSupabase()
  const { error } = await sb
    .from('contests')
    .update({
      ...patch,
      updated_at: new Date().toISOString(),
    })
    .eq('source', source)
    .eq('id', id)

  if (error) {
    return { success: false, error: error.message || '수정에 실패했습니다.' }
  }
  return { success: true }
}

export async function deleteAdminContest(
  source: string,
  id: string,
): Promise<{ success: true } | { success: false; error: string }> {
  if (!source || !id) {
    return { success: false, error: '출처 또는 ID가 없습니다.' }
  }
  const sb = getSupabase()
  const { error } = await sb.from('contests').delete().eq('source', source).eq('id', id)
  if (error) {
    return { success: false, error: error.message || '삭제에 실패했습니다.' }
  }
  return { success: true }
}

export type AdminContestInsert = {
  source: string
  id: string
  title?: string | null
  d_day?: string | null
  host?: string | null
  url?: string | null
  category?: string | null
  content?: string | null
}

export async function insertAdminContest(
  row: AdminContestInsert,
): Promise<{ success: true } | { success: false; error: string }> {
  const source = row.source.trim()
  const id = row.id.trim()
  if (!source || !id) {
    return { success: false, error: '출처와 게시글 ID는 필수입니다.' }
  }
  const now = new Date().toISOString()
  const sb = getSupabase()
  const { error } = await sb.from('contests').insert({
    source,
    id,
    title: row.title?.trim() || null,
    d_day: row.d_day?.trim() || null,
    host: row.host?.trim() || null,
    url: row.url?.trim() || null,
    category: row.category?.trim() || null,
    content: row.content?.trim() || null,
    created_at: now,
    first_seen_at: now,
    updated_at: now,
  })

  if (error) {
    return { success: false, error: error.message || '등록에 실패했습니다.' }
  }
  return { success: true }
}
