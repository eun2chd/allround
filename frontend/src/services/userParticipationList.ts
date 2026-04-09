import { getSupabase } from './supabaseClient'

export type ParticipationRow = {
  title?: string
  url?: string
  source?: string
  contest_id?: string
  status?: string
  d_day?: string
  host?: string
  has_detail?: boolean
  participation_status?: string | null
  award_status?: string | null
  /** contest_participation: 개인/팀 */
  participation_mode?: 'individual' | 'team'
  team_name?: string | null
}

/** `/api/user/participation` 과 유사 (UI에 필요한 필드 위주) */
export async function fetchUserParticipationPage(opts: {
  profileId: string
  page: number
  perPage: number
  filter: 'all' | 'participate' | 'pass'
}): Promise<{ success: boolean; data: ParticipationRow[]; total: number }> {
  const sb = getSupabase()
  const {
    data: { session },
  } = await sb.auth.getSession()
  if (!session?.user) return { success: true, data: [], total: 0 }
  const userId = opts.profileId
  let q = sb
    .from('contest_participation')
    .select('source, contest_id, status, updated_at, participation_type, team_id')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
  if (opts.filter !== 'all') q = q.eq('status', opts.filter)
  const { data: rows, error } = await q
  if (error) return { success: true, data: [], total: 0 }

  const { data: detailRows } = await sb
    .from('contest_participation_detail')
    .select('source, contest_id, participation_status, award_status')
    .eq('user_id', userId)
  const detailByKey = new Map<
    string,
    { participation_status?: string | null; award_status?: string | null }
  >()
  for (const d of detailRows || []) {
    detailByKey.set(`${String(d.source)}:${String(d.contest_id)}`, {
      participation_status: d.participation_status as string | null | undefined,
      award_status: d.award_status as string | null | undefined,
    })
  }

  const teamIdSet = new Set<string>()
  for (const p of rows || []) {
    const pt = String((p as { participation_type?: string }).participation_type ?? '').trim()
    const tid = (p as { team_id?: string | null }).team_id
    if (pt === 'team' && tid) teamIdSet.add(String(tid))
  }
  const teamNameById: Record<string, string> = {}
  if (teamIdSet.size) {
    const { data: trows } = await sb.from('contest_team').select('id, team_name').in('id', [...teamIdSet])
    for (const t of trows || []) teamNameById[String(t.id)] = String(t.team_name || '')
  }

  const list = [...(rows || [])]
  list.sort((a, b) => {
    const sa = String(a.status || '')
    const sb_ = String(b.status || '')
    const ar = sa === 'participate' ? 0 : 1
    const br = sb_ === 'participate' ? 0 : 1
    return ar - br
  })
  const total = list.length
  const offset = (opts.page - 1) * opts.perPage
  const pageRows = list.slice(offset, offset + opts.perPage)
  const result: ParticipationRow[] = []
  for (const p of pageRows) {
    const src = String(p.source || '')
    const cid = String(p.contest_id || '')
    const { data: c } = await sb
      .from('contests')
      .select('title, url, d_day, host')
      .eq('source', src)
      .eq('id', cid)
      .limit(1)
      .maybeSingle()
    const dkey = `${src}:${cid}`
    const detail = detailByKey.get(dkey)
    const pt = String((p as { participation_type?: string }).participation_type ?? 'individual').trim()
    const tid = (p as { team_id?: string | null }).team_id
    const mode: 'individual' | 'team' = pt === 'team' && tid ? 'team' : 'individual'
    const tn = mode === 'team' && tid ? teamNameById[String(tid)] || null : null
    result.push({
      source: src,
      contest_id: cid,
      status: String(p.status || ''),
      title: String(c?.title || '(\uc81c\ubaa9 \uc5c6\uc74c)'),
      url: String(c?.url || ''),
      d_day: c?.d_day != null ? String(c.d_day) : '-',
      host: c?.host != null ? String(c.host) : '-',
      has_detail: detail != null,
      participation_status: detail?.participation_status ?? null,
      award_status: detail?.award_status ?? null,
      participation_mode: String(p.status || '') === 'participate' ? mode : undefined,
      team_name: String(p.status || '') === 'participate' ? tn : null,
    })
  }
  return { success: true, data: result, total }
}
