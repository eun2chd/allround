import { getSupabase } from './supabaseClient'

const PAGE_MAX = 100

export type StartupBusinessAdminRow = Record<string, unknown>

export async function fetchStartupBusinessAdminPage(params: {
  page: number
  pageSize: number
  q?: string
}): Promise<
  | { ok: true; rows: Record<string, unknown>[]; total: number }
  | { ok: false; error: string }
> {
  const sb = getSupabase()
  const p = Math.max(1, params.page)
  const lim = Math.max(1, Math.min(PAGE_MAX, params.pageSize))
  let q = sb.from('startup_business').select('*', { count: 'exact' })
  if (params.q?.trim()) q = q.ilike('supt_biz_titl_nm', `%${params.q.trim()}%`)
  q = q.order('updated_at', { ascending: false }).order('created_at', { ascending: false })
  const from = (p - 1) * lim
  const { data, count, error } = await q.range(from, from + lim - 1)
  if (error) return { ok: false, error: error.message || '목록을 불러오지 못했습니다.' }
  return { ok: true, rows: (data || []) as Record<string, unknown>[], total: count ?? 0 }
}

export async function fetchStartupAnnouncementAdminPage(params: {
  page: number
  pageSize: number
  q?: string
}): Promise<
  | { ok: true; rows: Record<string, unknown>[]; total: number }
  | { ok: false; error: string }
> {
  const sb = getSupabase()
  const p = Math.max(1, params.page)
  const lim = Math.max(1, Math.min(PAGE_MAX, params.pageSize))
  let q = sb.from('startup_announcement').select('*', { count: 'exact' })
  if (params.q?.trim()) q = q.ilike('biz_pbanc_nm', `%${params.q.trim()}%`)
  q = q.order('updated_at', { ascending: false }).order('created_at', { ascending: false })
  const from = (p - 1) * lim
  const { data, count, error } = await q.range(from, from + lim - 1)
  if (error) return { ok: false, error: error.message || '목록을 불러오지 못했습니다.' }
  return { ok: true, rows: (data || []) as Record<string, unknown>[], total: count ?? 0 }
}

export async function updateStartupBusiness(
  id: string,
  patch: Record<string, string | null>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const sb = getSupabase()
  const { error } = await sb
    .from('startup_business')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) return { ok: false, error: error.message || '수정에 실패했습니다.' }
  return { ok: true }
}

export async function deleteStartupBusiness(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const sb = getSupabase()
  const { error } = await sb.from('startup_business').delete().eq('id', id)
  if (error) return { ok: false, error: error.message || '삭제에 실패했습니다.' }
  return { ok: true }
}

export async function updateStartupAnnouncement(
  pbancSn: string,
  patch: Record<string, string | null>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const sb = getSupabase()
  const { error } = await sb
    .from('startup_announcement')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('pbanc_sn', pbancSn)
  if (error) return { ok: false, error: error.message || '수정에 실패했습니다.' }
  return { ok: true }
}

export async function deleteStartupAnnouncement(pbancSn: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const sb = getSupabase()
  const { error } = await sb.from('startup_announcement').delete().eq('pbanc_sn', pbancSn)
  if (error) return { ok: false, error: error.message || '삭제에 실패했습니다.' }
  return { ok: true }
}

export type KstartupCrawlStateRow = {
  id: number
  business_next_page: number
  announcement_next_page: number
  updated_at: string
}

export async function fetchKstartupCrawlState(): Promise<
  { ok: true; row: KstartupCrawlStateRow | null } | { ok: false; error: string }
> {
  const sb = getSupabase()
  const { data, error } = await sb.from('kstartup_crawl_state').select('*').eq('id', 1).maybeSingle()
  if (error) return { ok: false, error: error.message || '불러오지 못했습니다.' }
  if (!data) return { ok: true, row: null }
  const r = data as Record<string, unknown>
  return {
    ok: true,
    row: {
      id: Number(r.id),
      business_next_page: Number(r.business_next_page ?? 1),
      announcement_next_page: Number(r.announcement_next_page ?? 1),
      updated_at: String(r.updated_at || ''),
    },
  }
}

export async function updateKstartupCrawlState(payload: {
  business_next_page: number
  announcement_next_page: number
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const b = Math.max(1, Math.trunc(payload.business_next_page))
  const a = Math.max(1, Math.trunc(payload.announcement_next_page))
  const sb = getSupabase()
  const now = new Date().toISOString()
  const { data: existing } = await sb.from('kstartup_crawl_state').select('id').eq('id', 1).maybeSingle()
  if (!existing) {
    const { error: insErr } = await sb
      .from('kstartup_crawl_state')
      .insert({ id: 1, business_next_page: b, announcement_next_page: a, updated_at: now })
    if (insErr) return { ok: false, error: insErr.message || '저장에 실패했습니다.' }
    return { ok: true }
  }
  const { error } = await sb
    .from('kstartup_crawl_state')
    .update({ business_next_page: b, announcement_next_page: a, updated_at: now })
    .eq('id', 1)
  if (error) return { ok: false, error: error.message || '저장에 실패했습니다.' }
  return { ok: true }
}
