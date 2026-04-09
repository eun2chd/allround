import {
  fetchBookmarkedContests,
  fetchContestUserMeta,
  fetchContestsByParticipation,
  fetchContestsPage,
  fetchParticipationForContestRows,
} from '../../services/contestService'
import type { ContestMeta, ContestRow, FilterState } from './contestTypes'
import {
  contestIdFromMetaKey,
  contestKey,
  DEFAULT_CONTEST_SOURCE,
  PAGE_SIZE,
} from './contestTypes'

function rowMatchesSourceFilter(row: ContestRow, filterSrc: string): boolean {
  const fs = filterSrc.trim()
  if (!fs) return true
  const raw = String(row.source ?? '').trim()
  if (fs === DEFAULT_CONTEST_SOURCE) return raw === '' || raw === DEFAULT_CONTEST_SOURCE
  return raw === fs
}

/**
 * 북마크·내용확인·참가 등 메타 키는 DB source 그대로라 `요즘것들:id` 이고
 * 목록 행은 contests 의 `위비티:id` 인 경우가 있음 → contestId 기준으로 목록 contestKey 에 맞춤
 */
function alignMetaKeysToListRows(meta: ContestMeta, rows: ContestRow[]): ContestMeta {
  if (!rows.length) return meta
  const participation = { ...meta.participation }
  const participationApply = { ...meta.participationApply }
  const contentChecks = new Set(meta.contentChecks)
  const commented = new Set(meta.commented)
  const bookmarkSet = new Set(meta.bookmarkSet)
  const rowNormSource = (r: ContestRow) =>
    r.source != null && String(r.source).trim() !== '' ? String(r.source).trim() : DEFAULT_CONTEST_SOURCE
  const srcPartOfKey = (k: string) => {
    const i = k.lastIndexOf(':')
    return i < 0 ? '' : k.slice(0, i)
  }

  for (const row of rows) {
    const canonical = contestKey(row.source, row.id)
    const rid = String(row.id ?? '')
    if (!rid) continue

    if (!participation[canonical]) {
      const matches = Object.entries(meta.participation).filter(
        ([k, st]) => !!st && contestIdFromMetaKey(k) === rid,
      )
      if (matches.length === 1) {
        participation[canonical] = matches[0][1]
      } else if (matches.length > 1) {
        const rs = rowNormSource(row)
        const pick =
          matches.find(([k]) => k === canonical) ||
          matches.find(([k]) => srcPartOfKey(k) === rs) ||
          matches.find(([k]) => {
            const s = srcPartOfKey(k)
            return s === DEFAULT_CONTEST_SOURCE || s === ''
          }) ||
          matches[0]
        participation[canonical] = pick[1]
      }
    }

    if (!participationApply[canonical]) {
      const matchesApply = Object.entries(meta.participationApply).filter(
        ([k, v]) => !!v && contestIdFromMetaKey(k) === rid,
      )
      if (matchesApply.length === 1) {
        participationApply[canonical] = matchesApply[0][1]
      } else if (matchesApply.length > 1) {
        const rs = rowNormSource(row)
        const pickA =
          matchesApply.find(([k]) => k === canonical) ||
          matchesApply.find(([k]) => srcPartOfKey(k) === rs) ||
          matchesApply.find(([k]) => {
            const s = srcPartOfKey(k)
            return s === DEFAULT_CONTEST_SOURCE || s === ''
          }) ||
          matchesApply[0]
        participationApply[canonical] = pickA[1]
      }
    }

    if (!contentChecks.has(canonical)) {
      const srcHas = [...meta.contentChecks].some((k) => contestIdFromMetaKey(k) === rid)
      if (srcHas) contentChecks.add(canonical)
    }
    if (!commented.has(canonical)) {
      const srcHas = [...meta.commented].some((k) => contestIdFromMetaKey(k) === rid)
      if (srcHas) commented.add(canonical)
    }
    if (!bookmarkSet.has(canonical)) {
      const srcHas = [...meta.bookmarkSet].some((k) => contestIdFromMetaKey(k) === rid)
      if (srcHas) bookmarkSet.add(canonical)
    }
  }

  return { ...meta, participation, participationApply, contentChecks, commented, bookmarkSet }
}

/** contest_participation 테이블 값으로 참가/패스 덮어씀 (RPC·키 정규화와 무관하게 표시 정합) */
async function mergeParticipationFromTable(meta: ContestMeta, rows: ContestRow[]): Promise<ContestMeta> {
  if (!rows.length) return meta
  const patch = await fetchParticipationForContestRows(rows)
  if (!Object.keys(patch.participation).length && !Object.keys(patch.participationApply).length) return meta
  const nextP = { ...meta.participation, ...patch.participation }
  const nextA = { ...meta.participationApply, ...patch.participationApply }
  for (const k of Object.keys(nextP)) {
    if (nextP[k] !== 'participate') delete nextA[k]
  }
  return { ...meta, participation: nextP, participationApply: nextA }
}

/** contests_list_with_user_state 뷰 행 → ContestMeta (목록 1쿼리) */
function metaFromViewRows(rows: Record<string, unknown>[]): ContestMeta {
  const bookmarkSet = new Set<string>()
  const contentChecks = new Set<string>()
  const participation: Record<string, string> = {}
  const commented = new Set<string>()
  for (const raw of rows) {
    const k = contestKey(raw.source as string | undefined, raw.id as string | undefined)
    if (raw.my_bookmarked === true) bookmarkSet.add(k)
    if (raw.my_content_checked === true) contentChecks.add(k)
    const ps = raw.my_participation_status
    if (ps === 'participate' || ps === 'pass') participation[k] = ps
    if (raw.my_has_commented === true) commented.add(k)
  }
  return { bookmarkSet, contentChecks, participation, participationApply: {}, commented }
}

function parseMetaPayload(data: Record<string, unknown> | undefined): ContestMeta {
  const d = data || {}
  const bookmarks = (d.bookmarks as { source?: string; contest_id?: string }[]) || []
  const content_checks = (d.content_checks as string[]) || []
  const participation = (d.participation as Record<string, string>) || {}
  const commented = (d.commented as string[]) || []
  return {
    bookmarkSet: new Set(bookmarks.map((x) => contestKey(x.source, x.contest_id))),
    contentChecks: new Set(content_checks),
    participation: { ...participation },
    participationApply: {},
    commented: new Set(commented),
  }
}

export type ContestListResult = {
  rows: ContestRow[]
  total: number
  page: number
  meta: ContestMeta
}

export async function loadContestList(page: number, fp: FilterState): Promise<ContestListResult> {
  const bookmarkOnly = fp.bookmarkOnly
  const participationOnly = fp.participationFilter === 'participate' || fp.participationFilter === 'pass'
  const needsAll =
    fp.checkFilter === 'checked' || fp.checkFilter === 'unchecked' || bookmarkOnly || participationOnly

  let meta: ContestMeta = {
    bookmarkSet: new Set(),
    contentChecks: new Set(),
    participation: {},
    participationApply: {},
    commented: new Set(),
  }

  const makeKey = (row: ContestRow) => contestKey(row.source, row.id)
  const hasCheck = (row: ContestRow) => meta.contentChecks.has(makeKey(row))

  if (participationOnly) {
    const st = fp.participationFilter as 'participate' | 'pass'
    const partRes = await fetchContestsByParticipation(st)
    if (!(partRes.success && partRes.data)) return { rows: [], total: 0, page: 1, meta }
    let list = (partRes.data || []) as ContestRow[]
    const metaKeys = [...new Set(list.map((r) => contestKey(r.source, r.id)))]
    if (metaKeys.length) {
      const metaRes = await fetchContestUserMeta(metaKeys.join(','))
      if (metaRes.success && metaRes.data) meta = parseMetaPayload(metaRes.data as unknown as Record<string, unknown>)
    }
    meta = alignMetaKeysToListRows(meta, list)
    meta = await mergeParticipationFromTable(meta, list)
    /** contest_participation 조회 실패 시에만 필터 상태로 표시 보강 */
    for (const r of list) {
      const k = makeKey(r)
      if (!meta.participation[k]) meta.participation[k] = st
    }
    if (fp.checkFilter === 'checked') list = list.filter(hasCheck)
    else if (fp.checkFilter === 'unchecked') list = list.filter((r) => !hasCheck(r))
    if (fp.q) {
      const q = fp.q.toLowerCase()
      list = list.filter(
        (r) =>
          (r.title || '').toLowerCase().includes(q) ||
          (r.host || '').toLowerCase().includes(q) ||
          (r.category || '').toLowerCase().includes(q),
      )
    }
    const catEq = (fp.category || '').trim()
    const srcEq = (fp.source || '').trim()
    if (catEq) list = list.filter((r) => String(r.category ?? '').trim() === catEq)
    if (srcEq) list = list.filter((r) => rowMatchesSourceFilter(r, srcEq))
    if (fp.bookmarkOnly) list = list.filter((row) => meta.bookmarkSet.has(makeKey(row)))
    list.sort((a, b) => {
      const createdA = new Date(a.created_at || 0).getTime()
      const createdB = new Date(b.created_at || 0).getTime()
      if (createdB !== createdA) return createdB - createdA
      const tA = new Date(a.updated_at || 0).getTime()
      const tB = new Date(b.updated_at || 0).getTime()
      if (tB !== tA) return tB - tA
      return (hasCheck(a) ? 1 : 0) - (hasCheck(b) ? 1 : 0)
    })
    const total = list.length
    const start = (page - 1) * PAGE_SIZE
    list = list.slice(start, start + PAGE_SIZE)
    return { rows: list, total, page, meta }
  }

  if (bookmarkOnly) {
    const bookRes = await fetchBookmarkedContests()
    if (!bookRes.success) return { rows: [], total: 0, page: 1, meta }
    let list = bookRes.data as ContestRow[]
    const metaKeys = [...new Set(list.map((r) => contestKey(r.source, r.id)))]
    if (metaKeys.length) {
      const metaRes = await fetchContestUserMeta(metaKeys.join(','))
      if (metaRes.success && metaRes.data) meta = parseMetaPayload(metaRes.data as unknown as Record<string, unknown>)
    }
    meta = alignMetaKeysToListRows(meta, list)
    meta = await mergeParticipationFromTable(meta, list)
    if (fp.checkFilter === 'checked') list = list.filter(hasCheck)
    else if (fp.checkFilter === 'unchecked') list = list.filter((r) => !hasCheck(r))
    if (fp.q) {
      const q = fp.q.toLowerCase()
      list = list.filter(
        (r) =>
          (r.title || '').toLowerCase().includes(q) ||
          (r.host || '').toLowerCase().includes(q) ||
          (r.category || '').toLowerCase().includes(q),
      )
    }
    const catEqB = (fp.category || '').trim()
    const srcEqB = (fp.source || '').trim()
    if (catEqB) list = list.filter((r) => String(r.category ?? '').trim() === catEqB)
    if (srcEqB) list = list.filter((r) => rowMatchesSourceFilter(r, srcEqB))
    if (fp.participationFilter === 'participate' || fp.participationFilter === 'pass') {
      const st = fp.participationFilter
      list = list.filter((row) => (meta.participation[makeKey(row)] || '') === st)
    }
    list.sort((a, b) => {
      const createdA = new Date(a.created_at || 0).getTime()
      const createdB = new Date(b.created_at || 0).getTime()
      if (createdB !== createdA) return createdB - createdA
      const tA = new Date(a.updated_at || 0).getTime()
      const tB = new Date(b.updated_at || 0).getTime()
      if (tB !== tA) return tB - tA
      return (hasCheck(a) ? 1 : 0) - (hasCheck(b) ? 1 : 0)
    })
    const total = list.length
    const start = (page - 1) * PAGE_SIZE
    list = list.slice(start, start + PAGE_SIZE)
    meta = alignMetaKeysToListRows(meta, list)
    meta = await mergeParticipationFromTable(meta, list)
    return { rows: list, total, page, meta }
  }

  const j = await fetchContestsPage({
    page,
    limit: PAGE_SIZE,
    q: fp.q,
    category: fp.category || undefined,
    source: fp.source || undefined,
    meta: { checkFilter: fp.checkFilter },
  })
  const listData = (j.success && j.data ? j.data : []) as ContestRow[]
  if (j.embeddedUserMeta) {
    meta = metaFromViewRows(listData as unknown as Record<string, unknown>[])
  } else {
    const ids = listData.map((r) => contestKey(r.source, r.id)).filter(Boolean)
    if (ids.length) {
      const metaRes = await fetchContestUserMeta(ids.join(','))
      if (metaRes.success && metaRes.data) meta = parseMetaPayload(metaRes.data as unknown as Record<string, unknown>)
    }
    meta = alignMetaKeysToListRows(meta, listData)
    meta = await mergeParticipationFromTable(meta, listData)
  }
  if (!j.success || !j.data) {
    return { rows: [], total: 0, page: 1, meta }
  }

  let list = listData
  if (needsAll) {
    const checkInSql =
      j.embeddedUserMeta && (fp.checkFilter === 'checked' || fp.checkFilter === 'unchecked')
    if (!checkInSql && fp.checkFilter === 'checked') list = list.filter(hasCheck)
    else if (!checkInSql && fp.checkFilter === 'unchecked') list = list.filter((r) => !hasCheck(r))
    list.sort((a, b) => {
      const createdA = new Date(a.created_at || 0).getTime()
      const createdB = new Date(b.created_at || 0).getTime()
      if (createdB !== createdA) return createdB - createdA
      const tA = new Date(a.updated_at || 0).getTime()
      const tB = new Date(b.updated_at || 0).getTime()
      if (tB !== tA) return tB - tA
      return (hasCheck(a) ? 1 : 0) - (hasCheck(b) ? 1 : 0)
    })
    return { rows: list, total: Number(j.total ?? list.length), page, meta }
  }

  return {
    rows: list,
    total: j.total != null ? Number(j.total) : list.length,
    page: j.page != null ? Number(j.page) : page,
    meta,
  }
}
