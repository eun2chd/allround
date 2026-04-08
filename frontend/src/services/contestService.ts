import type { SupabaseClient } from '@supabase/supabase-js'
import { DEFAULT_CONTEST_SOURCE, contestKey } from '../features/contests/contestTypes'
import { getSupabase } from './supabaseClient'
import { EXP_ACTIVITY_AMOUNTS } from './expRewardsConfig'
import { computeLevelFromExpRows, type LevelConfigRow } from './levelUtils'

const EXP_AMOUNTS: Record<string, number> = { ...EXP_ACTIVITY_AMOUNTS }

type ContestMetaPayload = {
  bookmarks: { source: string; contest_id: string }[]
  content_checks: string[]
  participation: Record<string, string>
  commented: string[]
}

/** Keep only bookmark / meta entries whose keys are in `keys`. */
function filterContestMetaPayload(meta: ContestMetaPayload, keys: string[]): ContestMetaPayload {
  if (!keys.length) return meta
  const keySet = new Set(keys)
  return {
    bookmarks: meta.bookmarks.filter((b) => keySet.has(contestKey(b.source, b.contest_id))),
    content_checks: meta.content_checks.filter((k) => keySet.has(k)),
    participation: Object.fromEntries(Object.entries(meta.participation).filter(([k]) => keySet.has(k))),
    commented: meta.commented.filter((c) => keySet.has(c)),
  }
}

function parseRpcMetaRows(rows: Record<string, unknown>[]): ContestMetaPayload {
  const bookmarks: ContestMetaPayload['bookmarks'] = []
  const content_checks: string[] = []
  const participation: Record<string, string> = {}
  const commented: string[] = []
  for (const row of rows) {
    const cid = String(row.contest_id ?? '')
    const key = contestKey(row.source != null ? String(row.source) : undefined, cid)
    const srcForPair =
      row.source != null && String(row.source).trim() !== ''
        ? String(row.source).trim()
        : DEFAULT_CONTEST_SOURCE
    if (row.is_bookmarked) bookmarks.push({ source: srcForPair, contest_id: cid })
    if (row.is_content_checked) content_checks.push(key)
    const psRaw = row.participation_status ?? (row as Record<string, unknown>).status
    const ps = psRaw != null && String(psRaw).trim() !== '' ? String(psRaw).trim() : ''
    if (ps) participation[key] = ps
    if (row.has_commented) commented.push(key)
  }
  return { bookmarks, content_checks, participation, commented }
}

async function loadLevelRows(): Promise<LevelConfigRow[]> {
  const sb = getSupabase()
  const { data } = await sb.from('level_config').select('level, exp_to_next').order('level')
  return (data || []) as LevelConfigRow[]
}

async function grantExp(userId: string, activityType: string, source: string, contestId: string): Promise<number> {
  const amt = EXP_AMOUNTS[activityType]
  if (!amt) return 0
  const sb = getSupabase()
  const { data: dup } = await sb
    .from('exp_events')
    .select('user_id')
    .eq('user_id', userId)
    .eq('activity_type', activityType)
    .eq('source', source)
    .eq('contest_id', contestId)
    .limit(1)
    .maybeSingle()
  if (dup) return 0
  const { error: insErr } = await sb.from('exp_events').insert({
    user_id: userId,
    activity_type: activityType,
    source,
    contest_id: contestId,
    exp_amount: amt,
  })
  if (insErr) return 0
  const { data: prof } = await sb.from('profiles').select('total_exp').eq('id', userId).maybeSingle()
  const cur = Number(prof?.total_exp ?? 0)
  await sb.from('profiles').update({ total_exp: cur + amt }).eq('id', userId)
  return amt
}

async function postAutoComment(userId: string, source: string, contestId: string, body: string) {
  const sb = getSupabase()
  await sb.from('contest_comments').insert({ user_id: userId, source, contest_id: contestId, body })
}

function sortedDistinct(arr: string[]) {
  return [...new Set(arr)].filter(Boolean).sort()
}

function mergeContestFilterSources(sources: string[]): string[] {
  return sortedDistinct([...sources, DEFAULT_CONTEST_SOURCE])
}

/** Rows with NULL/empty `source` are shown as DEFAULT_CONTEST_SOURCE; filter must include them. */
function applyContestListSourceFilter<Q extends { eq(column: string, value: string): Q; or(filters: string): Q }>(
  q: Q,
  source: string | undefined,
): Q {
  const s = source?.trim()
  if (!s) return q
  if (s === DEFAULT_CONTEST_SOURCE) {
    return q.or(`source.eq.${DEFAULT_CONTEST_SOURCE},source.is.null,source.eq.`)
  }
  return q.eq('source', s)
}

const CONTEST_LIST_COLUMNS =
  'id, title, d_day, host, url, category, source, created_at, updated_at' as const
/** View: contest columns plus per-user my_* flags (one round-trip when logged in). */
const CONTEST_LIST_WITH_USER_STATE_COLUMNS =
  `${CONTEST_LIST_COLUMNS}, my_participation_status, my_content_checked, my_bookmarked, my_has_commented` as const
const IN_CHUNK = 120

/** Load contest rows by (source, id) pairs; batches `in(id)` per source to avoid N+1. */
async function loadContestsBySourceIdPairs(
  pairs: { source: string; contest_id: string }[],
): Promise<Map<string, Record<string, unknown>>> {
  const sb = getSupabase()
  const bySource = new Map<string, Set<string>>()
  for (const p of pairs) {
    const s = String(p.source ?? '').trim()
    const id = String(p.contest_id ?? '').trim()
    if (!s || !id) continue
    if (!bySource.has(s)) bySource.set(s, new Set())
    bySource.get(s)!.add(id)
  }
  const byKey = new Map<string, Record<string, unknown>>()
  for (const [source, idSet] of bySource) {
    const ids = [...idSet]
    const chunks: string[][] = []
    for (let i = 0; i < ids.length; i += IN_CHUNK) chunks.push(ids.slice(i, i + IN_CHUNK))
    const results = await Promise.all(
      chunks.map((chunk) =>
        sb.from('contests').select(CONTEST_LIST_COLUMNS).eq('source', source).in('id', chunk),
      ),
    )
    for (const res of results) {
      if (res.error) throw res.error
      for (const c of res.data || []) {
        const row = c as Record<string, unknown>
        const src = String(row.source ?? source)
        const cid = String(row.id ?? '')
        byKey.set(`${src}:${cid}`, row)
      }
    }
  }
  return byKey
}

function unwrapContestFilterRpcData(raw: unknown): Record<string, unknown> {
  if (raw == null) return {}
  if (typeof raw === 'string') {
    try {
      return unwrapContestFilterRpcData(JSON.parse(raw) as unknown)
    } catch {
      return {}
    }
  }
  if (typeof raw !== 'object') return {}
  if (Array.isArray(raw)) {
    if (!raw.length) return {}
    return unwrapContestFilterRpcData(raw[0])
  }
  const o = raw as Record<string, unknown>
  const inner = o.get_contest_filter_options
  if (inner != null && typeof inner === 'object' && !Array.isArray(inner)) {
    return inner as Record<string, unknown>
  }
  return o
}

/** RPC JSONB / odd encodings ? string list (Flask filters API? ?? ??) */
function coerceFilterOptionStrings(value: unknown): string[] {
  if (value == null) return []
  if (typeof value === 'string') {
    const t = value.trim()
    if (!t) return []
    if (t.startsWith('[')) {
      try {
        return coerceFilterOptionStrings(JSON.parse(t) as unknown)
      } catch {
        return [t]
      }
    }
    return [t]
  }
  if (Array.isArray(value)) {
    return value
      .map((x) => (x == null ? '' : String(x).trim()))
      .filter(Boolean)
  }
  if (typeof value === 'object') {
    return Object.values(value as Record<string, unknown>)
      .map((x) => (x == null ? '' : String(x).trim()))
      .filter(Boolean)
  }
  return []
}

const FILTER_SCAN_PAGE = 1000

/** ??: PostgREST ?? ? ?? ??? ? ?? select?? DISTINCT? ??? ? ?? ? ?? ?? */
async function scanContestFilterColumnsFromTable(sb: SupabaseClient): Promise<{
  categories: string[]
  sources: string[]
} | null> {
  const cat = new Set<string>()
  const src = new Set<string>()
  let offset = 0
  for (;;) {
    const { data: rows, error } = await sb
      .from('contests')
      .select('category, source')
      .order('created_at', { ascending: true })
      .order('source', { ascending: true })
      .order('id', { ascending: true })
      .range(offset, offset + FILTER_SCAN_PAGE - 1)
    if (error) return null
    const batch = rows || []
    for (const r of batch) {
      const c = r.category != null ? String(r.category).trim() : ''
      if (c) cat.add(c)
      const s = r.source != null ? String(r.source).trim() : ''
      if (s) src.add(s)
    }
    if (batch.length < FILTER_SCAN_PAGE) break
    offset += FILTER_SCAN_PAGE
  }
  return {
    categories: sortedDistinct([...cat]),
    sources: sortedDistinct([...src]),
  }
}

export async function fetchContestFilters(): Promise<{ categories: string[]; sources: string[] }> {
  const sb = getSupabase()
  const { data: raw, error: rpcErr } = await sb.rpc('get_contest_filter_options')
  if (!rpcErr && raw != null) {
    const o = unwrapContestFilterRpcData(raw)
    const categories = coerceFilterOptionStrings(o.categories)
    const sources = coerceFilterOptionStrings(o.sources)
    if (categories.length > 0 || sources.length > 0) {
      return {
        categories: sortedDistinct(categories),
        sources: mergeContestFilterSources(sources),
      }
    }
  }
  const scanned = await scanContestFilterColumnsFromTable(sb)
  if (!scanned) {
    return { categories: [], sources: mergeContestFilterSources([]) }
  }
  return {
    categories: scanned.categories,
    sources: mergeContestFilterSources(scanned.sources),
  }
}

export type FetchContestsPageResult = {
  success: true
  data: Record<string, unknown>[]
  total: number
  page: number
  limit: number
  /** When true, row includes my_* from the view and skips a second meta fetch. */
  embeddedUserMeta: boolean
}

/** Optional filters for contests_list_with_user_state (logged-in). checkFilter must run in SQL for correct counts with category/source. */
export type FetchContestsPageMeta = {
  checkFilter?: '' | 'checked' | 'unchecked'
}

export async function fetchContestsPage(params: {
  page: number
  limit: number
  q?: string
  category?: string
  source?: string
  meta?: FetchContestsPageMeta
}): Promise<FetchContestsPageResult> {
  const sb = getSupabase()
  const {
    data: { session },
  } = await sb.auth.getSession()

  const offset = (params.page - 1) * params.limit
  const rangeEnd = offset + params.limit - 1
  const chk = params.meta?.checkFilter

  if (session?.user) {
    let q = sb
      .from('contests_list_with_user_state')
      .select(CONTEST_LIST_WITH_USER_STATE_COLUMNS, { count: 'exact' })
      .order('created_at', { ascending: false })
    if (params.category?.trim()) q = q.eq('category', params.category.trim())
    q = applyContestListSourceFilter(q, params.source)
    if (chk === 'checked') q = q.eq('my_content_checked', true)
    if (chk === 'unchecked') q = q.eq('my_content_checked', false)
    if (params.q) {
      const safe = params.q.replace(/,/g, ' ').replace(/%/g, '')
      const pattern = `%${safe}%`
      q = q.or(`title.ilike.${pattern},host.ilike.${pattern},category.ilike.${pattern}`)
    }
    const { data, error, count } = await q.range(offset, rangeEnd)
    if (!error) {
      const rows = data || []
      return {
        success: true as const,
        data: rows,
        total: count ?? (rows.length || 0),
        page: params.page,
        limit: params.limit,
        embeddedUserMeta: true,
      }
    }
  }

  let q = sb.from('contests').select(CONTEST_LIST_COLUMNS, { count: 'exact' }).order('created_at', { ascending: false })
  if (params.category?.trim()) q = q.eq('category', params.category.trim())
  q = applyContestListSourceFilter(q, params.source)
  if (params.q) {
    const safe = params.q.replace(/,/g, ' ').replace(/%/g, '')
    const pattern = `%${safe}%`
    q = q.or(`title.ilike.${pattern},host.ilike.${pattern},category.ilike.${pattern}`)
  }
  const { data, error, count } = await q.range(offset, rangeEnd)
  if (error) throw error
  const rows = data || []
  return {
    success: true as const,
    data: rows,
    total: count ?? (rows.length || 0),
    page: params.page,
    limit: params.limit,
    embeddedUserMeta: false,
  }
}

export async function fetchContestsByParticipation(status: 'participate' | 'pass') {
  const sb = getSupabase()
  const {
    data: { session },
  } = await sb.auth.getSession()
  if (!session?.user) return { success: true as const, data: [] as Record<string, unknown>[] }
  const uid = session.user.id
  const { data: parts } = await sb
    .from('contest_participation')
    .select('source, contest_id')
    .eq('user_id', uid)
    .eq('status', status)
    .order('updated_at', { ascending: false })
  const rows = parts || []
  if (!rows.length) return { success: true as const, data: [] }
  const pairList = rows.map((p) => ({ source: String(p.source), contest_id: String(p.contest_id) }))
  const byKey = await loadContestsBySourceIdPairs(pairList)
  const result = pairList
    .map((p) => byKey.get(`${String(p.source)}:${String(p.contest_id)}`))
    .filter(Boolean) as Record<string, unknown>[]
  return { success: true as const, data: result }
}

/** Flask bookmarks: ?? / ??? / ?? ?? id */
export type BookmarkFolderFilter = 'all' | 'unfiled' | string

export async function fetchBookmarkedContests(folderFilter: BookmarkFolderFilter = 'all'): Promise<
  { success: true; data: Record<string, unknown>[] } | { success: false; error: string }
> {
  const sb = getSupabase()
  const {
    data: { session },
  } = await sb.auth.getSession()
  if (!session?.user) return { success: true as const, data: [] as Record<string, unknown>[] }
  const uid = session.user.id
  let q = sb
    .from('contest_bookmarks')
    .select('source, contest_id, folder_id')
    .eq('user_id', uid)
    .order('created_at', { ascending: false })
  if (folderFilter === 'unfiled') q = q.is('folder_id', null)
  else if (folderFilter !== 'all') q = q.eq('folder_id', folderFilter)
  const bookmarks = await q
  const bmErr = bookmarks.error
  if (bmErr?.message?.includes('folder_id')) {
    const legacy = await sb
      .from('contest_bookmarks')
      .select('source, contest_id')
      .eq('user_id', uid)
      .order('created_at', { ascending: false })
    const rows = legacy.data || []
    if (!rows.length) return { success: true as const, data: [] }
    const pairList = rows.map((b) => ({ source: String(b.source), contest_id: String(b.contest_id) }))
    const byKey = await loadContestsBySourceIdPairs(pairList)
    const result: Record<string, unknown>[] = []
    for (const b of rows) {
      const contest = byKey.get(`${String(b.source)}:${String(b.contest_id)}`)
      if (!contest) continue
      result.push({ ...contest, folder_id: null })
    }
    return { success: true as const, data: result }
  }
  if (bmErr) {
    return { success: false as const, error: bmErr.message }
  }
  const rows = bookmarks.data || []
  if (!rows.length) return { success: true as const, data: [] }
  const pairList = rows.map((b) => ({ source: String(b.source), contest_id: String(b.contest_id) }))
  const byKey = await loadContestsBySourceIdPairs(pairList)
  const result: Record<string, unknown>[] = []
  for (const b of rows) {
    const contest = byKey.get(`${String(b.source)}:${String(b.contest_id)}`)
    if (!contest) continue
    result.push({ ...contest, folder_id: b.folder_id ?? null })
  }
  return { success: true as const, data: result }
}

export type BookmarkFolderRow = {
  id: string
  parent_id: string | null
  name: string
  sort_order: number | null
}

export type BookmarkFolderCounts = {
  all: number
  unfiled: number
  folders: Record<string, number>
}

export async function fetchBookmarkFolders(): Promise<
  { success: true; data: BookmarkFolderRow[] } | { success: false; error: string }
> {
  const sb = getSupabase()
  const {
    data: { session },
  } = await sb.auth.getSession()
  if (!session?.user) return { success: true, data: [] }
  const { data, error } = await sb
    .from('bookmark_folders')
    .select('id, parent_id, name, sort_order')
    .eq('user_id', session.user.id)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })
  if (error) {
    if (error.message.includes('bookmark_folders') || error.code === '42P01') {
      return { success: true, data: [] }
    }
    return { success: false, error: error.message }
  }
  const rows = (data || []) as BookmarkFolderRow[]
  return { success: true, data: rows }
}

export async function fetchBookmarkFolderCounts(): Promise<
  { success: true; data: BookmarkFolderCounts } | { success: false; error: string }
> {
  const empty: BookmarkFolderCounts = { all: 0, unfiled: 0, folders: {} }
  const sb = getSupabase()
  const {
    data: { session },
  } = await sb.auth.getSession()
  if (!session?.user) return { success: true, data: empty }
  const { data, error } = await sb.from('contest_bookmarks').select('folder_id').eq('user_id', session.user.id)
  if (error) {
    if (error.message.includes('folder_id')) {
      const { data: rows } = await sb.from('contest_bookmarks').select('source').eq('user_id', session.user.id)
      const n = rows?.length ?? 0
      return { success: true, data: { all: n, unfiled: n, folders: {} } }
    }
    return { success: false, error: error.message }
  }
  const rows = data || []
  const folders: Record<string, number> = {}
  let unfiled = 0
  for (const r of rows) {
    const fid = r.folder_id as string | null | undefined
    if (fid == null || fid === '') unfiled++
    else folders[fid] = (folders[fid] || 0) + 1
  }
  return { success: true, data: { all: rows.length, unfiled, folders } }
}

export async function createBookmarkFolder(
  name: string,
  parentId: string | null = null,
): Promise<{ success: true; data: BookmarkFolderRow } | { success: false; error: string }> {
  const sb = getSupabase()
  const {
    data: { session },
  } = await sb.auth.getSession()
  if (!session?.user) return { success: false, error: 'unauthorized' }
  const uid = session.user.id
  const trimmed = name.trim()
  if (!trimmed) return { success: false, error: 'name ??' }
  if (parentId) {
    const { data: p } = await sb
      .from('bookmark_folders')
      .select('id, parent_id')
      .eq('id', parentId)
      .eq('user_id', uid)
      .maybeSingle()
    if (!p) return { success: false, error: '?? ?? ??' }
    if (p.parent_id != null)
      return { success: false, error: '2????? ????? (?? ???? ? ??? ?? ? ??)' }
    const { count } = await sb
      .from('bookmark_folders')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', uid)
      .eq('parent_id', parentId)
    if ((count ?? 0) >= 10) return { success: false, error: '?? ??? ?? 10???' }
  }
  let base = sb.from('bookmark_folders').select('sort_order').eq('user_id', uid)
  if (parentId) base = base.eq('parent_id', parentId)
  else base = base.is('parent_id', null)
  const { data: ordRows } = await base.order('sort_order', { ascending: false }).limit(1)
  let maxOrder = 0
  if (ordRows?.[0] && ordRows[0].sort_order != null) maxOrder = Number(ordRows[0].sort_order) + 1
  const ins = {
    user_id: uid,
    parent_id: parentId,
    name: trimmed,
    sort_order: maxOrder,
  }
  const { data: created, error } = await sb
    .from('bookmark_folders')
    .insert(ins)
    .select('id, parent_id, name, sort_order')
    .single()
  if (error) return { success: false, error: error.message }
  return { success: true, data: created as BookmarkFolderRow }
}

export async function updateBookmarkFolder(
  id: string,
  updates: { name?: string; sort_order?: number },
): Promise<{ success: true } | { success: false; error: string }> {
  const sb = getSupabase()
  const {
    data: { session },
  } = await sb.auth.getSession()
  if (!session?.user) return { success: false, error: 'unauthorized' }
  const uid = session.user.id
  const patch: Record<string, unknown> = {}
  if (updates.name !== undefined) {
    const n = updates.name.trim()
    if (!n) return { success: false, error: 'name ??' }
    patch.name = n
  }
  if (updates.sort_order !== undefined) patch.sort_order = updates.sort_order
  if (!Object.keys(patch).length) return { success: false, error: '??? ?? ??' }
  const { error } = await sb.from('bookmark_folders').update(patch).eq('id', id).eq('user_id', uid)
  if (error) return { success: false, error: error.message }
  return { success: true }
}

export async function deleteBookmarkFolder(
  id: string,
): Promise<{ success: true } | { success: false; error: string }> {
  const sb = getSupabase()
  const {
    data: { session },
  } = await sb.auth.getSession()
  if (!session?.user) return { success: false, error: 'unauthorized' }
  const { error } = await sb.from('bookmark_folders').delete().eq('id', id).eq('user_id', session.user.id)
  if (error) return { success: false, error: error.message }
  return { success: true }
}

export async function assignBookmarkToFolder(
  source: string,
  contestId: string,
  folderId: string | null,
): Promise<{ success: true } | { success: false; error: string }> {
  const sb = getSupabase()
  const {
    data: { session },
  } = await sb.auth.getSession()
  if (!session?.user) return { success: false, error: 'unauthorized' }
  const uid = session.user.id
  const { error } = await sb
    .from('contest_bookmarks')
    .update({ folder_id: folderId })
    .eq('user_id', uid)
    .eq('source', source)
    .eq('contest_id', contestId)
  if (error) {
    if (error.message.includes('folder_id')) return { success: true }
    return { success: false, error: error.message }
  }
  return { success: true }
}

/**
 * ?? ?? contestKey? ??? ?? contest_participation?? ?? (??/?? ??? ??)
 */
export async function fetchParticipationForContestRows(
  rows: { source?: string; id?: string }[],
): Promise<Record<string, 'participate' | 'pass'>> {
  const sb = getSupabase()
  const {
    data: { session },
  } = await sb.auth.getSession()
  if (!session?.user) return {}

  const wanted = new Set<string>()
  for (const row of rows) {
    const cid = String(row.id ?? '')
    if (!cid) continue
    wanted.add(contestKey(row.source, row.id))
  }
  if (!wanted.size) return {}

  const { data, error } = await sb
    .from('contest_participation')
    .select('source, contest_id, status')
    .eq('user_id', session.user.id)
  if (error || !data?.length) return {}

  const out: Record<string, 'participate' | 'pass'> = {}
  for (const row of data) {
    const key = contestKey(row.source != null ? String(row.source) : undefined, String(row.contest_id ?? ''))
    if (!wanted.has(key)) continue
    const st = String(row.status ?? '').trim()
    if (st === 'participate' || st === 'pass') out[key] = st
  }
  return out
}

export async function fetchContestUserMeta(idsParam?: string): Promise<{ success: boolean; data: ContestMetaPayload }> {
  const empty: ContestMetaPayload = { bookmarks: [], content_checks: [], participation: {}, commented: [] }
  const sb = getSupabase()
  const {
    data: { session },
  } = await sb.auth.getSession()
  if (!session?.user) return { success: true, data: empty }
  const uid = session.user.id
  let contestKeys: string[] | null = null
  if (idsParam?.trim()) contestKeys = idsParam.split(',').map((k) => k.trim()).filter(Boolean)
  try {
    const { data, error } = await sb.rpc('get_contest_user_status', { p_user_id: uid })
    if (error) throw error
    const rows = (data || []) as Record<string, unknown>[]
    const parsed = parseRpcMetaRows(rows)
    return {
      success: true,
      data: contestKeys?.length ? filterContestMetaPayload(parsed, contestKeys) : parsed,
    }
  } catch {
    const { data: b } = await sb.from('contest_bookmarks').select('source, contest_id').eq('user_id', uid)
    const bookmarks = (b || []).map((x) => ({ source: String(x.source), contest_id: String(x.contest_id) }))
    const { data: cc } = await sb.from('contest_content_checks').select('source, contest_id').eq('user_id', uid)
    const content_checks = (cc || []).map((x) =>
      contestKey(x.source != null ? String(x.source) : undefined, String(x.contest_id ?? '')),
    )
    const { data: cp } = await sb.from('contest_participation').select('source, contest_id, status').eq('user_id', uid)
    const participation: Record<string, string> = {}
    for (const x of cp || [])
      participation[contestKey(x.source != null ? String(x.source) : undefined, String(x.contest_id ?? ''))] = String(
        x.status || '',
      )
    const { data: cm } = await sb.from('contest_comments').select('source, contest_id').eq('user_id', uid)
    const commented = [
      ...new Set(
        (cm || []).map((x) => contestKey(x.source != null ? String(x.source) : undefined, String(x.contest_id ?? ''))),
      ),
    ]
    let meta: ContestMetaPayload = { bookmarks, content_checks, participation, commented }
    if (contestKeys?.length) {
      meta = filterContestMetaPayload(meta, contestKeys)
    }
    return { success: true, data: meta }
  }
}

export async function toggleBookmark(source: string, contestId: string) {
  const sb = getSupabase()
  const {
    data: { session },
  } = await sb.auth.getSession()
  if (!session?.user) return { success: false as const, error: 'unauthorized' }
  const uid = session.user.id
  const { data: ex } = await sb
    .from('contest_bookmarks')
    .select('user_id')
    .eq('user_id', uid)
    .eq('source', source)
    .eq('contest_id', contestId)
    .maybeSingle()
  if (ex) {
    await sb.from('contest_bookmarks').delete().eq('user_id', uid).eq('source', source).eq('contest_id', contestId)
    return { success: true as const, bookmarked: false as const }
  }
  await sb.from('contest_bookmarks').insert({ user_id: uid, source, contest_id: contestId })
  return { success: true as const, bookmarked: true as const }
}

async function upsertContentCheck(userId: string, source: string, contestId: string) {
  const sb = getSupabase()
  const { error } = await sb.from('contest_content_checks').upsert(
    { user_id: userId, source, contest_id: contestId },
    { onConflict: 'user_id,source,contest_id' },
  )
  if (error) {
    await sb.from('contest_content_checks').insert({ user_id: userId, source, contest_id: contestId })
  }
}

const MSG_CHECK_DONE = '\uacf5\ubaa8\uc804 \ub0b4\uc6a9\ud655\uc778 \uc644\ub8cc'
const MSG_NEED_LOGIN = '\ub85c\uadf8\uc778\uc774 \ud544\uc694\ud569\ub2c8\ub2e4'
const MSG_NEED_CONTENT_CHECK = '\uba3c\uc800 \ub0b4\uc6a9\ud655\uc778\uc744 \ud574\uc8fc\uc138\uc694'
const MSG_BULK_LIMIT = 'contests: max 100'
const MSG_GOLD_ONLY = '\uace8\ub4dc(Lv.71) \uc774\uc0c1\ub9cc \uc774\uc6a9 \uac00\ub2a5\ud569\ub2c8\ub2e4'
const PARTICIPATE_BODY = '\uacf5\ubaa8\uc804 \ucc38\uac00'
const PASS_BODY = '\uacf5\ubaa8\uc804 \ud328\uc2a4'
const ANON = '\uc775\uba85'

export async function postContentCheck(source: string, contestId: string) {
  const sb = getSupabase()
  const {
    data: { session },
  } = await sb.auth.getSession()
  if (!session?.user) return { success: false as const, error: MSG_NEED_LOGIN }
  const uid = session.user.id
  try {
    await upsertContentCheck(uid, source, contestId)
    await postAutoComment(uid, source, contestId, MSG_CHECK_DONE)
    const exp_gained = await grantExp(uid, 'content_check', source, contestId)
    return { success: true as const, exp_gained }
  } catch (e) {
    return { success: false as const, error: String(e) }
  }
}

export async function postContentCheckBulk(contests: { source?: string; contest_id?: string; id?: string }[]) {
  const sb = getSupabase()
  const {
    data: { session },
  } = await sb.auth.getSession()
  if (!session?.user) return { success: false as const, error: MSG_NEED_LOGIN }
  const uid = session.user.id
  if (!Array.isArray(contests) || contests.length > 100) return { success: false as const, error: MSG_BULK_LIMIT }
  const levelRows = await loadLevelRows()
  const { data: prof } = await sb.from('profiles').select('total_exp').eq('id', uid).maybeSingle()
  const totalExp = Number(prof?.total_exp ?? 0)
  const level = computeLevelFromExpRows(totalExp, levelRows)
  if (level < 71) return { success: false as const, error: MSG_GOLD_ONLY }
  const { data: existing } = await sb.from('contest_content_checks').select('source, contest_id').eq('user_id', uid)
  const already = new Set((existing || []).map((r) => `${r.source}:${r.contest_id}`))
  let done = 0
  let totalExpGained = 0
  for (const item of contests) {
    const src = String(item.source || '').trim()
    const cid = String(item.contest_id || item.id || '').trim()
    if (!src || !cid || already.has(`${src}:${cid}`)) continue
    await upsertContentCheck(uid, src, cid)
    await postAutoComment(uid, src, cid, MSG_CHECK_DONE)
    totalExpGained += await grantExp(uid, 'content_check', src, cid)
    already.add(`${src}:${cid}`)
    done += 1
  }
  return { success: true as const, done, exp_gained: totalExpGained }
}

async function upsertParticipationComment(userId: string, source: string, contestId: string, body: string) {
  const sb = getSupabase()
  const { data: row } = await sb
    .from('contest_comments')
    .select('id')
    .eq('user_id', userId)
    .eq('source', source)
    .eq('contest_id', contestId)
    .in('body', [PARTICIPATE_BODY, PASS_BODY])
    .limit(1)
    .maybeSingle()
  if (row?.id) await sb.from('contest_comments').update({ body }).eq('id', row.id)
  else await sb.from('contest_comments').insert({ user_id: userId, source, contest_id: contestId, body })
}

export async function setContestParticipation(
  source: string,
  contestId: string,
  body: { status: 'participate' | 'pass'; participation_type?: string; team_id?: string | null },
) {
  const sb = getSupabase()
  const {
    data: { session },
  } = await sb.auth.getSession()
  if (!session?.user) return { success: false as const, error: MSG_NEED_LOGIN }
  const uid = session.user.id
  const { data: chk } = await sb
    .from('contest_content_checks')
    .select('user_id')
    .eq('user_id', uid)
    .eq('source', source)
    .eq('contest_id', contestId)
    .maybeSingle()
  if (!chk) return { success: false as const, error: MSG_NEED_CONTENT_CHECK }
  const { error: uerr } = await sb.from('contest_participation').upsert(
    {
      user_id: uid,
      source,
      contest_id: contestId,
      status: body.status,
      participation_type: body.participation_type || 'individual',
      team_id: body.team_id ?? null,
    },
    { onConflict: 'user_id,source,contest_id' },
  )
  if (uerr) return { success: false as const, error: uerr.message }
  const commentBody = body.status === 'participate' ? PARTICIPATE_BODY : PASS_BODY
  await upsertParticipationComment(uid, source, contestId, commentBody)
  const act = body.status === 'participate' ? 'participate' : 'pass'
  const exp_gained = await grantExp(uid, act, source, contestId)
  return { success: true as const, exp_gained }
}

export async function deleteContestParticipation(source: string, contestId: string) {
  const sb = getSupabase()
  const {
    data: { session },
  } = await sb.auth.getSession()
  if (!session?.user) return { success: false as const, error: MSG_NEED_LOGIN }
  const uid = session.user.id
  await sb.from('contest_participation').delete().eq('user_id', uid).eq('source', source).eq('contest_id', contestId)
  await sb
    .from('contest_comments')
    .delete()
    .eq('user_id', uid)
    .eq('source', source)
    .eq('contest_id', contestId)
    .in('body', [PARTICIPATE_BODY, PASS_BODY])
  return { success: true as const }
}

const ERR_DETAIL = '\uc0c1\uc138 \ub0b4\uc6a9\uc744 \uac00\uc838\uc62c \uc218 \uc5c6\uc2b5\ub2c8\ub2e4.'

export async function fetchContestDetail(source: string, contestId: string) {
  const sb = getSupabase()
  const {
    data: { session },
  } = await sb.auth.getSession()
  const { data: row, error } = await sb
    .from('contests')
    .select('id, title, host, category, url, content, d_day')
    .eq('source', source)
    .eq('id', contestId)
    .maybeSingle()
  if (error || !row) return { success: false as const, error: ERR_DETAIL }
  const content = String(row.content || '')
  const detail = {
    id: String(row.id ?? contestId),
    url: String(row.url || ''),
    title: String(row.title || ''),
    host: String(row.host || ''),
    category: String(row.category || ''),
    apply_period: '',
    body: content,
    apply_url: '',
    images: [] as string[],
    has_content: Boolean(content),
  }
  const { data: crows } = await sb
    .from('contest_comments')
    .select('id, user_id, body, created_at')
    .eq('source', source)
    .eq('contest_id', contestId)
    .order('created_at')
  const commentRows = crows || []
  const userIds = [...new Set(commentRows.map((x) => x.user_id).filter(Boolean))] as string[]
  const profilesMap: Record<string, { nickname: string; profile_url: string }> = {}
  if (userIds.length) {
    const { data: profs } = await sb.from('profiles').select('id, nickname, profile_url').in('id', userIds)
    for (const u of profs || []) {
      profilesMap[String(u.id)] = {
        nickname: String(u.nickname || ANON),
        profile_url: String(u.profile_url || ''),
      }
    }
  }
  const comments = commentRows.map((crow) => {
    const pr = profilesMap[String(crow.user_id)] || { nickname: ANON, profile_url: '' }
    return { ...crow, nickname: pr.nickname, profile_url: pr.profile_url }
  })
  const current_user_id = session?.user?.id ?? null
  return {
    success: true as const,
    data: { content: detail, comments, current_user_id },
  }
}

export async function fetchContestCommentsOnly(source: string, contestId: string) {
  const sb = getSupabase()
  const {
    data: { session },
  } = await sb.auth.getSession()
  const { data: rows } = await sb
    .from('contest_comments')
    .select('id, user_id, body, created_at')
    .eq('source', source)
    .eq('contest_id', contestId)
    .order('created_at')
  const commentRows = rows || []
  const userIds = [...new Set(commentRows.map((x) => x.user_id).filter(Boolean))] as string[]
  const profilesMap: Record<string, { nickname: string; profile_url: string }> = {}
  if (userIds.length) {
    const { data: profs } = await sb.from('profiles').select('id, nickname, profile_url').in('id', userIds)
    for (const u of profs || []) {
      profilesMap[String(u.id)] = {
        nickname: String(u.nickname || ANON),
        profile_url: String(u.profile_url || ''),
      }
    }
  }
  const data = commentRows.map((crow) => {
    const pr = profilesMap[String(crow.user_id)] || { nickname: ANON, profile_url: '' }
    return { ...crow, nickname: pr.nickname, profile_url: pr.profile_url }
  })
  return { success: true as const, data, current_user_id: session?.user?.id ?? null }
}

export async function createContestComment(source: string, contestId: string, body: string) {
  const sb = getSupabase()
  const {
    data: { session },
  } = await sb.auth.getSession()
  if (!session?.user) return { success: false as const, error: MSG_NEED_LOGIN }
  const { data: created, error } = await sb
    .from('contest_comments')
    .insert({ user_id: session.user.id, source, contest_id: contestId, body })
    .select()
    .maybeSingle()
  if (error) return { success: false as const, error: error.message }
  return { success: true as const, data: created }
}

const ERR_COMMENT404 = '\ub313\uae00\uc744 \ucc3e\uc744 \uc218 \uc5c6\uc2b5\ub2c8\ub2e4'
const ERR_NOT_OWNER = '\ubcf8\uc778 \ub313\uae00\ub9cc \uc0ad\uc81c\ud560 \uc218 \uc788\uc2b5\ub2c8\ub2e4'

export async function deleteContestComment(commentId: string) {
  const sb = getSupabase()
  const {
    data: { session },
  } = await sb.auth.getSession()
  if (!session?.user) return { success: false as const, error: MSG_NEED_LOGIN }
  const { data: row } = await sb
    .from('contest_comments')
    .select('id, user_id, source, contest_id')
    .eq('id', commentId)
    .maybeSingle()
  if (!row) return { success: false as const, error: ERR_COMMENT404 }
  if (String(row.user_id) !== session.user.id) return { success: false as const, error: ERR_NOT_OWNER }
  await sb.from('contest_comments').delete().eq('id', commentId)
  return { success: true as const, source: row.source, contest_id: row.contest_id }
}
