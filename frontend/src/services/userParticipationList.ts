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

const CONTEST_BATCH = 100

async function loadContestsMapForPairs(
  pairs: { source: string; contest_id: string }[],
): Promise<Map<string, { title: string; url: string; d_day: string; host: string }>> {
  const sb = getSupabase()
  const bySource = new Map<string, Set<string>>()
  for (const { source, contest_id } of pairs) {
    const s = String(source || '').trim()
    const id = String(contest_id || '').trim()
    if (!s || !id) continue
    if (!bySource.has(s)) bySource.set(s, new Set())
    bySource.get(s)!.add(id)
  }
  const map = new Map<string, { title: string; url: string; d_day: string; host: string }>()
  for (const [source, idSet] of bySource) {
    const ids = [...idSet]
    for (let i = 0; i < ids.length; i += CONTEST_BATCH) {
      const chunk = ids.slice(i, i + CONTEST_BATCH)
      const { data, error } = await sb
        .from('contests')
        .select('id, title, url, d_day, host')
        .eq('source', source)
        .in('id', chunk)
      if (error) continue
      for (const c of data || []) {
        const cid = String((c as { id?: string }).id ?? '')
        map.set(`${source}:${cid}`, {
          title: String((c as { title?: string }).title || ''),
          url: String((c as { url?: string }).url || ''),
          d_day: (c as { d_day?: unknown }).d_day != null ? String((c as { d_day?: unknown }).d_day) : '-',
          host: (c as { host?: unknown }).host != null ? String((c as { host?: unknown }).host) : '-',
        })
      }
    }
  }
  return map
}

/** `/api/user/participation` 과 유사 (UI에 필요한 필드 위주) */
export async function fetchUserParticipationPage(opts: {
  profileId: string
  page: number
  perPage: number
  filter: 'all' | 'participate' | 'pass'
  /** 상세(contest_participation_detail)가 있는 행만 */
  detailOnly?: boolean
  /** 참가 중 상세가 없는 행만 (패스 제외) */
  noDetailOnly?: boolean
  /** 공모전 제목 부분 일치(대소문자 무시) */
  titleSearch?: string
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

  const list = [...(rows || [])]
  const teamIdSet = new Set<string>()
  for (const p of list) {
    const pt = String((p as { participation_type?: string }).participation_type ?? '').trim()
    const tid = (p as { team_id?: string | null }).team_id
    if (pt === 'team' && tid) teamIdSet.add(String(tid))
  }
  const teamNameById: Record<string, string> = {}
  if (teamIdSet.size) {
    const { data: trows } = await sb.from('contest_team').select('id, team_name').in('id', [...teamIdSet])
    for (const t of trows || []) teamNameById[String(t.id)] = String(t.team_name || '')
  }

  const pairs = list.map((p) => ({
    source: String(p.source || ''),
    contest_id: String(p.contest_id || ''),
  }))
  const contestMap = await loadContestsMapForPairs(pairs)

  const enriched: ParticipationRow[] = []
  for (const p of list) {
    const src = String(p.source || '')
    const cid = String(p.contest_id || '')
    const dkey = `${src}:${cid}`
    const c = contestMap.get(dkey)
    const detail = detailByKey.get(dkey)
    const pt = String((p as { participation_type?: string }).participation_type ?? 'individual').trim()
    const tid = (p as { team_id?: string | null }).team_id
    const mode: 'individual' | 'team' = pt === 'team' && tid ? 'team' : 'individual'
    const tn = mode === 'team' && tid ? teamNameById[String(tid)] || null : null
    enriched.push({
      source: src,
      contest_id: cid,
      status: String(p.status || ''),
      title: c?.title ? String(c.title) : '(제목 없음)',
      url: c?.url ? String(c.url) : '',
      d_day: c?.d_day ?? '-',
      host: c?.host ?? '-',
      has_detail: detail != null,
      participation_status: detail?.participation_status ?? null,
      award_status: detail?.award_status ?? null,
      participation_mode: String(p.status || '') === 'participate' ? mode : undefined,
      team_name: String(p.status || '') === 'participate' ? tn : null,
    })
  }

  let filtered = enriched
  if (opts.detailOnly) filtered = filtered.filter((r) => r.has_detail)
  else if (opts.noDetailOnly)
    filtered = filtered.filter(
      (r) => String(r.status || '') === 'participate' && !r.has_detail,
    )
  const qTitle = (opts.titleSearch || '').trim().toLowerCase()
  if (qTitle) filtered = filtered.filter((r) => (r.title || '').toLowerCase().includes(qTitle))

  filtered.sort((a, b) => {
    const sa = String(a.status || '')
    const sb_ = String(b.status || '')
    const ar = sa === 'participate' ? 0 : 1
    const br = sb_ === 'participate' ? 0 : 1
    return ar - br
  })

  const total = filtered.length
  const offset = (opts.page - 1) * opts.perPage
  const pageRows = filtered.slice(offset, offset + opts.perPage)
  return { success: true, data: pageRows, total }
}
