import { getSupabase } from './supabaseClient'

export type RepWorkAdminRow = {
  user_id: string
  sort_order: number
  source: string
  contest_id: string
  created_at: string | null
  award_status: string | null
  image_path: string | null
  nickname?: string
}

const PAGE_MAX = 50

export async function fetchRepresentativeWorksAdminPage(params: {
  page: number
  pageSize: number
}): Promise<{ ok: true; rows: RepWorkAdminRow[]; total: number } | { ok: false; error: string }> {
  const sb = getSupabase()
  const p = Math.max(1, params.page)
  const lim = Math.max(1, Math.min(PAGE_MAX, params.pageSize))
  const from = (p - 1) * lim
  const { data, count, error } = await sb
    .from('user_representative_works')
    .select('user_id, sort_order, source, contest_id, created_at, award_status, image_path', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, from + lim - 1)
  if (error) return { ok: false, error: error.message || '목록을 불러오지 못했습니다.' }
  const raw = (data || []) as RepWorkAdminRow[]
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

export async function deleteRepresentativeWork(
  userId: string,
  sortOrder: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const sb = getSupabase()
  const { error } = await sb.from('user_representative_works').delete().eq('user_id', userId).eq('sort_order', sortOrder)
  if (error) return { ok: false, error: error.message || '삭제에 실패했습니다.' }
  return { ok: true }
}
