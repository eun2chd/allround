import { getSupabase } from './supabaseClient'

export async function fetchStartupBusiness(page: number, limit: number, q?: string) {
  const sb = getSupabase()
  const {
    data: { session },
  } = await sb.auth.getSession()
  if (!session?.user) return { success: false as const, error: 'unauthorized', data: [] as Record<string, unknown>[] }
  const p = Math.max(1, page)
  const lim = Math.max(1, Math.min(100, limit))
  let query = sb
    .from('startup_business')
    .select(
      'id, supt_biz_titl_nm, biz_category_cd, biz_yr, biz_supt_trgt_info, biz_supt_ctnt, biz_supt_bdgt_info, supt_biz_chrct, supt_biz_intrd_info, detl_pg_url, created_at, updated_at',
      { count: 'exact' },
    )
  if (q?.trim()) query = query.ilike('supt_biz_titl_nm', `%${q.trim()}%`)
  query = query.order('created_at', { ascending: false }).order('updated_at', { ascending: false })
  const offset = (p - 1) * lim
  const { data: raw, count, error } = await query.range(offset, offset + lim - 1)
  if (error) return { success: false as const, error: error.message, data: [] }
  const rows: Record<string, unknown>[] = []
  for (const x of raw || []) {
    let url = String((x as Record<string, unknown>).detl_pg_url || '').trim()
    if (url && !url.startsWith('http')) url = `https://${url}`
    rows.push({
      id: (x as Record<string, unknown>).id,
      title: (x as Record<string, unknown>).supt_biz_titl_nm,
      category: (x as Record<string, unknown>).biz_category_cd,
      biz_yr: (x as Record<string, unknown>).biz_yr,
      target: (x as Record<string, unknown>).biz_supt_trgt_info,
      content: (x as Record<string, unknown>).biz_supt_ctnt,
      bdgt: (x as Record<string, unknown>).biz_supt_bdgt_info,
      chrct: (x as Record<string, unknown>).supt_biz_chrct,
      intrd: (x as Record<string, unknown>).supt_biz_intrd_info,
      url: url || null,
      created_at: (x as Record<string, unknown>).created_at,
      updated_at: (x as Record<string, unknown>).updated_at,
    })
  }
  return {
    success: true as const,
    data: rows,
    total: count ?? rows.length,
    page: p,
    limit: lim,
  }
}

export async function fetchStartupAnnouncements(page: number, limit: number, q?: string) {
  const sb = getSupabase()
  const {
    data: { session },
  } = await sb.auth.getSession()
  if (!session?.user) return { success: false as const, error: 'unauthorized', data: [] as Record<string, unknown>[] }
  const p = Math.max(1, page)
  const lim = Math.max(1, Math.min(100, limit))
  let query = sb
    .from('startup_announcement')
    .select(
      'pbanc_sn, biz_pbanc_nm, intg_pbanc_biz_nm, pbanc_ntrp_nm, biz_prch_dprt_nm, prch_cnpl_no, supt_regin, supt_biz_clsfc, sprv_inst, pbanc_rcpt_bgng_dt, pbanc_rcpt_end_dt, rcrt_prgs_yn, aply_trgt, biz_enyy, biz_trgt_age, detl_pg_url, created_at, updated_at',
      { count: 'exact' },
    )
  if (q?.trim()) query = query.ilike('biz_pbanc_nm', `%${q.trim()}%`)
  query = query.order('created_at', { ascending: false }).order('updated_at', { ascending: false })
  const offset = (p - 1) * lim
  const { data: raw, count, error } = await query.range(offset, offset + lim - 1)
  if (error) return { success: false as const, error: error.message, data: [] }
  const rows: Record<string, unknown>[] = []
  for (const x of raw || []) {
    const r = x as Record<string, unknown>
    let url = String(r.detl_pg_url || '').trim()
    if (url && !url.startsWith('http')) url = `https://${url}`
    rows.push({
      id: r.pbanc_sn,
      title: r.biz_pbanc_nm,
      intg_nm: r.intg_pbanc_biz_nm,
      org: r.pbanc_ntrp_nm,
      dprt: r.biz_prch_dprt_nm,
      contact: r.prch_cnpl_no,
      region: r.supt_regin,
      clsfc: r.supt_biz_clsfc,
      sprv_inst: r.sprv_inst,
      start_date: r.pbanc_rcpt_bgng_dt,
      end_date: r.pbanc_rcpt_end_dt,
      rcrt_prgs: r.rcrt_prgs_yn,
      aply_trgt: r.aply_trgt,
      biz_enyy: r.biz_enyy,
      biz_trgt_age: r.biz_trgt_age,
      url: url || null,
      created_at: r.created_at,
      updated_at: r.updated_at,
    })
  }
  return {
    success: true as const,
    data: rows,
    total: count ?? rows.length,
    page: p,
    limit: lim,
  }
}

export async function fetchStartupContentChecks(): Promise<{ success: boolean; keys: string[] }> {
  const sb = getSupabase()
  const {
    data: { session },
  } = await sb.auth.getSession()
  if (!session?.user?.id) return { success: true, keys: [] }
  const { data, error } = await sb
    .from('startup_content_checks')
    .select('item_type, item_id')
    .eq('user_id', session.user.id)
  if (error) return { success: false, keys: [] }
  const keys = (data || []).map(
    (r) => `${(r as { item_type: string }).item_type}:${(r as { item_id: string }).item_id}`,
  )
  return { success: true, keys }
}

export async function postStartupContentCheck(
  itemType: 'business' | 'announcement',
  itemId: string,
): Promise<{ success: boolean; error?: string }> {
  const sb = getSupabase()
  const {
    data: { session },
  } = await sb.auth.getSession()
  if (!session?.user?.id) return { success: false, error: '로그인이 필요합니다' }
  const uid = session.user.id
  const idStr = String(itemId)
  const { error: e1 } = await sb.from('startup_content_checks').upsert(
    { user_id: uid, item_type: itemType, item_id: idStr },
    { onConflict: 'user_id,item_type,item_id' },
  )
  if (e1) return { success: false, error: e1.message }
  const { error: e2 } = await sb.from('startup_comments').insert({
    user_id: uid,
    item_type: itemType,
    item_id: idStr,
    body: '내용 확인 완료',
  })
  if (e2) return { success: false, error: e2.message }
  return { success: true }
}

export type StartupCommentRow = {
  id: string
  user_id: string
  body: string
  created_at: string
  author_nickname?: string
  author_profile_url?: string | null
}

export async function fetchStartupComments(
  itemType: 'business' | 'announcement',
  itemId: string,
): Promise<{ success: boolean; data: StartupCommentRow[] }> {
  const sb = getSupabase()
  const idStr = String(itemId)
  const { data: rows, error } = await sb
    .from('startup_comments')
    .select('id, user_id, body, created_at')
    .eq('item_type', itemType)
    .eq('item_id', idStr)
    .order('created_at', { ascending: true })
  if (error) return { success: false, data: [] }
  const list = (rows || []) as StartupCommentRow[]
  const userIds = [...new Set(list.map((r) => r.user_id).filter(Boolean))]
  if (userIds.length) {
    const { data: profs } = await sb.from('profiles').select('id, nickname, profile_url').in('id', userIds)
    const nick: Record<string, string> = {}
    const pic: Record<string, string | null> = {}
    for (const p of profs || []) {
      const id = String((p as { id: string }).id)
      nick[id] = String((p as { nickname?: string }).nickname || '익명')
      pic[id] = ((p as { profile_url?: string | null }).profile_url as string | null) ?? null
    }
    for (const r of list) {
      r.author_nickname = nick[r.user_id] ?? '익명'
      r.author_profile_url = pic[r.user_id] ?? null
    }
  }
  return { success: true, data: list }
}

export async function postStartupComment(
  itemType: 'business' | 'announcement',
  itemId: string,
  body: string,
): Promise<{ success: boolean; error?: string }> {
  const sb = getSupabase()
  const {
    data: { session },
  } = await sb.auth.getSession()
  if (!session?.user?.id) return { success: false, error: '로그인이 필요합니다' }
  const text = body.trim()
  if (!text) return { success: false, error: '댓글 내용을 입력하세요' }
  const { error } = await sb.from('startup_comments').insert({
    user_id: session.user.id,
    item_type: itemType,
    item_id: String(itemId),
    body: text,
  })
  if (error) return { success: false, error: error.message }
  return { success: true }
}

export async function deleteStartupComment(commentId: string): Promise<{ success: boolean; error?: string }> {
  const sb = getSupabase()
  const {
    data: { session },
  } = await sb.auth.getSession()
  if (!session?.user?.id) return { success: false, error: 'unauthorized' }
  const { error } = await sb
    .from('startup_comments')
    .delete()
    .eq('id', commentId)
    .eq('user_id', session.user.id)
  if (error) return { success: false, error: error.message }
  return { success: true }
}
