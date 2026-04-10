import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react'
import { createPortal } from 'react-dom'
import {
  HiArrowPath,
  HiArrowRightCircle,
  HiCheck,
  HiChevronDown,
  HiMagnifyingGlass,
  HiOutlineStar,
  HiPlayCircle,
  HiStar,
} from 'react-icons/hi2'
import { useConfirm } from '../../context/ConfirmContext'
import type { MeData } from '../../hooks/useAuthMe'
import { useContestRefreshCountdown } from '../../hooks/useContestRefreshCountdown'
import {
  fetchContestFilters,
  postContentCheck,
  postContentCheckBulk,
  setContestParticipation,
  deleteContestParticipation,
  toggleBookmark as toggleContestBookmark,
} from '../../services/contestService'
import { loadContestList } from '../../features/contests/contestListEngine'
import type {
  ContestMeta,
  ContestRow,
  FilterState,
  ParticipationApplyInfo,
} from '../../features/contests/contestTypes'
import { DEFAULT_CONTEST_SOURCE, PAGE_SIZE, contestKey } from '../../features/contests/contestTypes'
import { PaginationBar } from '../common/PaginationBar'
import { ParticipateApplyModal } from '../contests/ParticipateApplyModal'
import type { ParticipateApplyResult } from '../contests/ParticipateApplyModal'
import { ContestSummaryCards } from './ContestSummaryCards'
import { ContestDetailRow } from './ContestDetailRow'
import { fetchContestDashboardSummary } from '../../services/contestDashboardSummaryService'
import { formatExpGainedBulkToast, formatExpGainedToast } from '../../services/expRewardsConfig'

/** reload 직후 RPC가 아직 반영 전일 때 참가상태가 깜빡이지 않도록 임시 보강 */
type ParticipationPatch = Record<string, 'participate' | 'pass' | null>

function mergeParticipationPatch(
  server: Record<string, string>,
  patch: ParticipationPatch,
): Record<string, string> {
  const out = { ...server }
  for (const [key, val] of Object.entries(patch)) {
    if (val === null) delete out[key]
    else out[key] = val
  }
  return out
}

function pruneParticipationPatch(patch: ParticipationPatch, server: Record<string, string>): void {
  for (const key of Object.keys(patch)) {
    const want = patch[key]
    const got = server[key]
    if (want === null) {
      if (got == null || got === '') delete patch[key]
    } else if (got === want) {
      delete patch[key]
    }
  }
}

function ddayClass(dDay: string | undefined): string {
  const tag = 'd-day-tag'
  if (!dDay) return `d-day normal ${tag}`
  const s = dDay.trim()
  if (s.includes('오늘') || s === 'D-day') return `d-day today ${tag}`
  if (s.includes('마감')) return `d-day urgent ${tag}`
  const m = /^D-(\d+)$/i.exec(s)
  if (m) {
    const n = parseInt(m[1], 10)
    if (n <= 3) return `d-day urgent ${tag}`
    if (n <= 7) return `d-day soon ${tag}`
  }
  return `d-day normal ${tag}`
}

function formatFetchTime(iso: string | undefined): string {
  if (!iso) return '-'
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return '-'
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    const h = String(d.getHours()).padStart(2, '0')
    const min = String(d.getMinutes()).padStart(2, '0')
    return `${m}/${day} ${h}:${min}`
  } catch {
    return '-'
  }
}

function truncate(s: string | undefined, max = 20): string {
  const str = (s || '').trim() || '공모전'
  return str.length > max ? str.slice(0, max) + '...' : str
}

type Props = {
  me: MeData
  showToast: (msg: string, type?: 'success' | 'error') => void
  loadingOverlay: (active: boolean) => void
}

/** 공모전 테이블 PC 레이아웃·제목 truncate 길이 (home-page.css @media min-width 와 동일) */
const CONTEST_TABLE_WIDE_MIN_PX = 901

function useContestTableWideLayout(): boolean {
  const [wide, setWide] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(`(min-width: ${CONTEST_TABLE_WIDE_MIN_PX}px)`).matches : false,
  )
  useEffect(() => {
    const mq = window.matchMedia(`(min-width: ${CONTEST_TABLE_WIDE_MIN_PX}px)`)
    const sync = () => setWide(mq.matches)
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])
  return wide
}

export function ContestAllyoungSection({ me, showToast, loadingOverlay }: Props) {
  const confirm = useConfirm()
  const contestTableWide = useContestTableWideLayout()
  const { countdownText, dateTimeText } = useContestRefreshCountdown()
  const [filterOptions, setFilterOptions] = useState<{ categories: string[]; sources: string[] }>({
    categories: [],
    sources: [],
  })
  const [filters, setFilters] = useState<FilterState>({
    q: '',
    category: '',
    source: '',
    checkFilter: '',
    participationFilter: '',
    bookmarkOnly: false,
    deadlineSoonOnly: false,
    registeredTodayOnly: false,
    sortDdayUrgent: false,
  })
  const [uiQ, setUiQ] = useState('')
  const [rows, setRows] = useState<ContestRow[]>([])
  const [meta, setMeta] = useState<ContestMeta>({
    bookmarkSet: new Set(),
    contentChecks: new Set(),
    participation: {},
    participationApply: {},
    commented: new Set(),
  })
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [summaryLoading, setSummaryLoading] = useState(true)
  const [summary, setSummary] = useState<Awaited<ReturnType<typeof fetchContestDashboardSummary>>>(null)
  const [openDetail, setOpenDetail] = useState<{ source: string; id: string } | null>(null)
  const participationPatchRef = useRef<ParticipationPatch>({})
  const [applyModal, setApplyModal] = useState<{
    source: string
    contestId: string
    title: string
    row: ContestRow
  } | null>(null)
  const [filterPanelExpanded, setFilterPanelExpanded] = useState(false)
  const [rowSelection, setRowSelection] = useState<Set<string>>(() => new Set())
  const selectAllCheckboxRef = useRef<HTMLInputElement>(null)

  const userLevel = me.user_level ?? 1
  const canBulk = userLevel >= 71

  useEffect(() => {
    const allowed = new Set(rows.map((r) => contestKey(r.source, r.id)))
    setRowSelection((prev) => {
      const next = new Set<string>()
      for (const k of prev) {
        if (allowed.has(k)) next.add(k)
      }
      return next.size === prev.size && [...prev].every((k) => next.has(k)) ? prev : next
    })
  }, [rows])

  const selectedRows = useMemo(
    () => rows.filter((r) => rowSelection.has(contestKey(r.source, r.id))),
    [rows, rowSelection],
  )

  const bulkContentCheckTargets = useMemo(
    () => selectedRows.filter((r) => !meta.contentChecks.has(contestKey(r.source, r.id))),
    [selectedRows, meta.contentChecks],
  )

  const bulkParticipateTargets = useMemo(
    () =>
      selectedRows.filter((r) => {
        const k = contestKey(r.source, r.id)
        return meta.contentChecks.has(k) && meta.participation[k] !== 'participate'
      }),
    [selectedRows, meta.contentChecks, meta.participation],
  )

  const bulkPassTargets = useMemo(
    () =>
      selectedRows.filter((r) => {
        const k = contestKey(r.source, r.id)
        return meta.contentChecks.has(k) && meta.participation[k] !== 'pass'
      }),
    [selectedRows, meta.contentChecks, meta.participation],
  )

  const allPageSelected =
    rows.length > 0 && rows.every((r) => rowSelection.has(contestKey(r.source, r.id)))
  const somePageSelected = rows.some((r) => rowSelection.has(contestKey(r.source, r.id)))

  useLayoutEffect(() => {
    const el = selectAllCheckboxRef.current
    if (!el) return
    el.indeterminate = somePageSelected && !allPageSelected
  }, [somePageSelected, allPageSelected, rows.length])

  const toggleRowSelect = useCallback((k: string) => {
    setRowSelection((prev) => {
      const next = new Set(prev)
      if (next.has(k)) next.delete(k)
      else next.add(k)
      return next
    })
  }, [])

  const toggleSelectAllPage = useCallback(() => {
    setRowSelection((prev) => {
      const keys = rows.map((r) => contestKey(r.source, r.id))
      if (keys.length === 0) return prev
      const allOn = keys.every((k) => prev.has(k))
      if (allOn) {
        const next = new Set(prev)
        for (const k of keys) next.delete(k)
        return next
      }
      const next = new Set(prev)
      for (const k of keys) next.add(k)
      return next
    })
  }, [rows])

  const reload = useCallback(
    async (pageNum: number, showBlocking = true) => {
      if (showBlocking) loadingOverlay(true)
      setLoading(true)
      try {
        const res = await loadContestList(pageNum, filters)
        const serverPart = res.meta.participation
        const mergedPart = mergeParticipationPatch(serverPart, participationPatchRef.current)
        pruneParticipationPatch(participationPatchRef.current, serverPart)
        setRows(res.rows)
        setTotal(res.total)
        setPage(res.page)
        setMeta({ ...res.meta, participation: mergedPart })
      } catch {
        showToast('목록을 불러오지 못했습니다.', 'error')
      } finally {
        setLoading(false)
        if (showBlocking) loadingOverlay(false)
      }
    },
    [filters, loadingOverlay, showToast],
  )

  useEffect(() => {
    void (async () => {
      try {
        const j = await fetchContestFilters()
        setFilterOptions({ categories: j.categories || [], sources: j.sources || [] })
      } catch {
        /* ignore */
      }
    })()
  }, [])

  useEffect(() => {
    void reload(1, true)
  }, [filters, reload])

  const loadSummary = useCallback(async () => {
    setSummaryLoading(true)
    try {
      const s = await fetchContestDashboardSummary()
      setSummary(s)
    } catch {
      setSummary(null)
    } finally {
      setSummaryLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadSummary()
  }, [loadSummary])

  useEffect(() => {
    const onRealtime = () => void loadSummary()
    window.addEventListener('contests-realtime', onRealtime)
    return () => window.removeEventListener('contests-realtime', onRealtime)
  }, [loadSummary])

  const defaultFilterState: FilterState = {
    q: '',
    category: '',
    source: '',
    checkFilter: '',
    participationFilter: '',
    bookmarkOnly: false,
    deadlineSoonOnly: false,
    registeredTodayOnly: false,
    sortDdayUrgent: false,
  }

  const applySearch = () => {
    setFilters((f) => ({ ...f, q: uiQ.trim() }))
    setPage(1)
  }

  const resetFilters = () => {
    setUiQ('')
    setFilters({ ...defaultFilterState })
    setPage(1)
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const toggleCheckChip = (v: '' | 'checked' | 'unchecked') => {
    setFilters((f) => ({ ...f, checkFilter: f.checkFilter === v ? '' : v }))
    setPage(1)
  }

  const togglePartChip = (v: 'participate' | 'pass' | 'none') => {
    setFilters((f) => ({ ...f, participationFilter: f.participationFilter === v ? '' : v }))
    setPage(1)
  }

  const goPage = (p: number) => {
    const next = Math.min(Math.max(1, p), totalPages)
    void reload(next, true)
  }

  const toggleBookmark = async (row: ContestRow) => {
    const source =
      row.source != null && String(row.source).trim() !== ''
        ? String(row.source).trim()
        : DEFAULT_CONTEST_SOURCE
    const id = String(row.id ?? '')
    const k = contestKey(row.source, row.id)
    if (meta.bookmarkSet.has(k)) {
      const ok = await confirm({
        title: '즐겨찾기',
        message: '즐겨찾기에서 제거할까요?',
        confirmText: '제거',
        danger: true,
      })
      if (!ok) return
    }
    try {
      const j = await toggleContestBookmark(source, id)
      if (j.success && 'bookmarked' in j) {
        setMeta((m) => {
          const next = new Set(m.bookmarkSet)
          const k = contestKey(source, id)
          if (j.bookmarked) next.add(k)
          else next.delete(k)
          return { ...m, bookmarkSet: next }
        })
      }
    } catch {
      showToast('즐겨찾기 처리 실패', 'error')
    }
  }

  const applyBodyFromResult = (r: ParticipateApplyResult) => {
    if (r.mode === 'individual') return { participation_type: 'individual' as const, team_id: null as string | null }
    return { participation_type: 'team' as const, team_id: r.teamId }
  }

  const toggleParticipation = async (
    row: ContestRow,
    status: 'participate' | 'pass',
    participateApply?: ParticipateApplyResult,
  ) => {
    const source =
      row.source != null && String(row.source).trim() !== ''
        ? String(row.source).trim()
        : DEFAULT_CONTEST_SOURCE
    const id = String(row.id ?? '')
    const k = contestKey(row.source, row.id)
    const cur = meta.participation[k]
    const remove = cur === status
    try {
      if (remove) {
        const ok = await confirm({
          title: '참가·패스',
          message: '참가/패스 표시를 해제할까요?',
          confirmText: '해제',
          danger: true,
        })
        if (!ok) return
        const j = await deleteContestParticipation(source, id)
        if (j.success) {
          participationPatchRef.current[k] = null
          setMeta((m) => {
            const p = { ...m.participation }
            delete p[k]
            const a = { ...m.participationApply }
            delete a[k]
            return { ...m, participation: p, participationApply: a }
          })
          showToast('참가/패스를 해제했습니다.')
        }
      } else {
        if (cur && cur !== status) {
          const ok = await confirm({
            title: '참가·패스',
            message:
              cur === 'participate'
                ? '참가를 패스로 바꿀까요?'
                : '패스를 참가로 바꿀까요?',
            confirmText: '바꾸기',
          })
          if (!ok) return
        }
        const body =
          status === 'participate'
            ? { status, ...applyBodyFromResult(participateApply || { mode: 'individual' }) }
            : { status }
        const j = await setContestParticipation(source, id, body)
        if (j.success) {
          participationPatchRef.current[k] = status
          const applyPatch =
            status === 'participate'
              ? participateApply
                ? participateApply.mode === 'team'
                  ? { mode: 'team' as const, teamName: participateApply.teamName }
                  : { mode: 'individual' as const }
                : { mode: 'individual' as const }
              : null
          setMeta((m) => {
            const nextA = { ...m.participationApply }
            if (status === 'participate' && applyPatch) nextA[k] = applyPatch
            else delete nextA[k]
            return { ...m, participation: { ...m.participation, [k]: status }, participationApply: nextA }
          })
          showToast(status === 'participate' ? '참가로 표시했습니다.' : '패스로 표시했습니다.')
          const expAct = status === 'participate' ? 'participate' : 'pass'
          const expLine = formatExpGainedToast(expAct, j.exp_gained)
          if (expLine) showToast(expLine)
        }
      }
      void reload(page, false)
    } catch {
      showToast('처리 실패', 'error')
    }
  }

  const openParticipateFlow = (row: ContestRow) => {
    const source =
      row.source != null && String(row.source).trim() !== ''
        ? String(row.source).trim()
        : DEFAULT_CONTEST_SOURCE
    const id = String(row.id ?? '')
    const k = contestKey(row.source, row.id)
    const cur = meta.participation[k]
    if (cur === 'participate') {
      void toggleParticipation(row, 'participate')
      return
    }
    setApplyModal({ source, contestId: id, title: row.title || '', row })
  }

  const contentCheck = async (row: ContestRow) => {
    const source =
      row.source != null && String(row.source).trim() !== ''
        ? String(row.source).trim()
        : DEFAULT_CONTEST_SOURCE
    const id = String(row.id ?? '')
    const ok = await confirm({
      title: '내용확인',
      message: `「${truncate(row.title, 40)}」 공고를 내용확인 처리할까요?`,
      confirmText: '확인 처리',
    })
    if (!ok) return
    try {
      const j = await postContentCheck(source, id)
      if (j.success) {
        setMeta((m) => {
          const next = new Set(m.contentChecks)
          next.add(contestKey(source, id))
          return { ...m, contentChecks: next }
        })
        showToast('내용 확인 처리되었습니다.')
        const expLine = formatExpGainedToast('content_check', j.exp_gained)
        if (expLine) showToast(expLine)
        void reload(page, false)
      } else showToast('내용 확인 실패', 'error')
    } catch {
      showToast('내용 확인 실패', 'error')
    }
  }

  const bulkContentCheckSelected = async () => {
    const targets = bulkContentCheckTargets
    if (!targets.length) {
      showToast('선택한 항목 중 미확인 공고가 없습니다.')
      return
    }
    const ok = await confirm({
      title: '선택 내용확인',
      message: `선택 ${selectedRows.length}건 중 미확인 ${targets.length}건을 내용확인 처리할까요?`,
      confirmText: '처리',
    })
    if (!ok) return
    loadingOverlay(true)
    try {
      if (canBulk) {
        const j = await postContentCheckBulk(
          targets.map((r) => ({
            source: r.source?.trim() || DEFAULT_CONTEST_SOURCE,
            contest_id: String(r.id ?? ''),
          })),
        )
        if (j.success) {
          const done = j.done ?? 0
          showToast(`내용확인 ${done}건 처리했습니다.`)
          const expLine = formatExpGainedBulkToast('content_check', j.exp_gained ?? 0, done)
          if (expLine) showToast(expLine)
        } else {
          showToast('error' in j ? j.error : '처리 실패', 'error')
        }
      } else {
        let done = 0
        let totalExp = 0
        for (const row of targets) {
          const src = row.source?.trim() || DEFAULT_CONTEST_SOURCE
          const id = String(row.id ?? '')
          const j = await postContentCheck(src, id)
          if (j.success) {
            done += 1
            totalExp += j.exp_gained ?? 0
          }
        }
        showToast(`내용확인 ${done}건 처리했습니다.`)
        const expLine = formatExpGainedBulkToast('content_check', totalExp, done)
        if (expLine) showToast(expLine)
      }
      setRowSelection(new Set())
      void reload(page, false)
    } finally {
      loadingOverlay(false)
    }
  }

  const bulkParticipateSelected = async () => {
    const targets = bulkParticipateTargets
    if (!targets.length) {
      showToast('선택 항목 중 내용확인 후 참가로 바꿀 수 있는 공고가 없습니다.')
      return
    }
    const passCount = targets.filter((r) => meta.participation[contestKey(r.source, r.id)] === 'pass').length
    const ok = await confirm({
      title: '선택 참가',
      message:
        passCount > 0
          ? `선택 ${selectedRows.length}건 중 ${targets.length}건을 개인 참가로 표시합니다. (패스였던 ${passCount}건은 참가로 바뀝니다.)`
          : `선택 ${selectedRows.length}건 중 ${targets.length}건을 개인 참가로 표시할까요?`,
      confirmText: '참가 표시',
    })
    if (!ok) return
    loadingOverlay(true)
    let done = 0
    let fail = 0
    let totalExp = 0
    try {
      for (const row of targets) {
        const src = row.source?.trim() || DEFAULT_CONTEST_SOURCE
        const id = String(row.id ?? '')
        const j = await setContestParticipation(src, id, {
          status: 'participate',
          participation_type: 'individual',
          team_id: null,
        })
        if (j.success) {
          done += 1
          totalExp += j.exp_gained ?? 0
        } else fail += 1
      }
      showToast(
        done ? `참가 표시 ${done}건${fail ? ` (${fail}건 실패)` : ''}` : '처리에 실패했습니다.',
        done ? 'success' : 'error',
      )
      const expLine = formatExpGainedBulkToast('participate', totalExp, done)
      if (expLine) showToast(expLine)
      setRowSelection(new Set())
      void reload(page, false)
    } finally {
      loadingOverlay(false)
    }
  }

  const bulkPassSelected = async () => {
    const targets = bulkPassTargets
    if (!targets.length) {
      showToast('선택 항목 중 내용확인 후 패스로 바꿀 수 있는 공고가 없습니다.')
      return
    }
    const participateCount = targets.filter(
      (r) => meta.participation[contestKey(r.source, r.id)] === 'participate',
    ).length
    const ok = await confirm({
      title: '선택 패스',
      message:
        participateCount > 0
          ? `선택 ${selectedRows.length}건 중 ${targets.length}건을 패스로 표시합니다. (참가였던 ${participateCount}건은 패스로 바뀝니다.)`
          : `선택 ${selectedRows.length}건 중 ${targets.length}건을 패스로 표시할까요?`,
      confirmText: '패스 표시',
    })
    if (!ok) return
    loadingOverlay(true)
    let done = 0
    let fail = 0
    let totalExp = 0
    try {
      for (const row of targets) {
        const src = row.source?.trim() || DEFAULT_CONTEST_SOURCE
        const id = String(row.id ?? '')
        const j = await setContestParticipation(src, id, { status: 'pass' })
        if (j.success) {
          done += 1
          totalExp += j.exp_gained ?? 0
        } else fail += 1
      }
      showToast(
        done ? `패스 표시 ${done}건${fail ? ` (${fail}건 실패)` : ''}` : '처리에 실패했습니다.',
        done ? 'success' : 'error',
      )
      const expLine = formatExpGainedBulkToast('pass', totalExp, done)
      if (expLine) showToast(expLine)
      setRowSelection(new Set())
      void reload(page, false)
    } finally {
      loadingOverlay(false)
    }
  }

  const contestListScrollRef = useRef<HTMLDivElement>(null)

  return (
    <div id="pageAllyoung">
      <header className="page-header">
        <h1>
          <span>{me.nickname || '회원'}</span>님, <span>공모전</span> 모음을 확인해보세요
        </h1>
        <div className="page-meta">
          <div className="page-meta-info">
            <span className="countdown" id="countdown">
              {countdownText}
            </span>
            <span className="datetime" id="currentDateTime">
              {dateTimeText}
            </span>
          </div>
        </div>
      </header>

      <ContestSummaryCards
        summary={summary}
        loading={summaryLoading}
        newTodayFilterActive={filters.registeredTodayOnly}
        onNewTodayClick={() =>
          setFilters((f) => ({ ...f, registeredTodayOnly: !f.registeredTodayOnly }))
        }
        deadlineSoonFilterActive={filters.deadlineSoonOnly}
        onDeadlineSoonClick={() =>
          setFilters((f) => ({ ...f, deadlineSoonOnly: !f.deadlineSoonOnly }))
        }
      />

      <div
        className={
          'contest-filter-panel' + (filterPanelExpanded ? ' contest-filter-panel--expanded' : '')
        }
        id="filterBar"
      >
        <div className="contest-filter-panel__head">
          <div className="contest-filter-panel__head-text">
            <span className="contest-filter-panel__title">필터</span>
            <span className="contest-filter-panel__subtitle">빠른 필터 · 상세 조건 · 검색</span>
          </div>
          <button
            type="button"
            className="contest-filter-panel__toggle"
            aria-expanded={filterPanelExpanded}
            aria-controls="contestFilterPanelBody"
            onClick={() => setFilterPanelExpanded((v) => !v)}
          >
            <span>{filterPanelExpanded ? '접기' : '펼치기'}</span>
            <HiChevronDown
              className={'contest-filter-panel__toggle-ico' + (filterPanelExpanded ? ' is-open' : '')}
              aria-hidden
            />
          </button>
        </div>

        <div
          id="contestFilterPanelBody"
          className="contest-filter-panel__body"
          hidden={!filterPanelExpanded}
        >
          <div className="filter-chip-row" aria-label="빠른 필터">
            <span className="filter-chip-row__label">빠른 필터</span>
            <button
              type="button"
              className={'filter-chip' + (filters.bookmarkOnly ? ' is-active' : '')}
              onClick={() => {
                setFilters((f) => ({ ...f, bookmarkOnly: !f.bookmarkOnly }))
                setPage(1)
              }}
            >
              <HiStar className="filter-chip__ico" aria-hidden />
              즐겨찾기만
            </button>
            <button
              type="button"
              className={'filter-chip' + (filters.checkFilter === 'unchecked' ? ' is-active' : '')}
              onClick={() => toggleCheckChip('unchecked')}
            >
              <span className="filter-chip__ico filter-chip__ico--dot" aria-hidden />
              미확인
            </button>
            <button
              type="button"
              className={'filter-chip' + (filters.checkFilter === 'checked' ? ' is-active' : '')}
              onClick={() => toggleCheckChip('checked')}
            >
              <HiCheck className="filter-chip__ico" aria-hidden />
              확인함
            </button>
            <button
              type="button"
              className={'filter-chip' + (filters.participationFilter === 'participate' ? ' is-active' : '')}
              onClick={() => togglePartChip('participate')}
            >
              <HiPlayCircle className="filter-chip__ico" aria-hidden />
              참가만
            </button>
            <button
              type="button"
              className={'filter-chip' + (filters.participationFilter === 'pass' ? ' is-active' : '')}
              onClick={() => togglePartChip('pass')}
            >
              <HiArrowRightCircle className="filter-chip__ico" aria-hidden />
              패스만
            </button>
            <button
              type="button"
              className={'filter-chip' + (filters.participationFilter === 'none' ? ' is-active' : '')}
              onClick={() => togglePartChip('none')}
            >
              <span className="filter-chip__ico filter-chip__ico--dot filter-chip__ico--neutral" aria-hidden />
              미선택만
            </button>
          </div>

          <div className="contest-filter-detail-row">
          <span className="contest-filter-detail-label">상세 조건</span>
          <div className="filter-pill-group" role="group" aria-label="상세 필터">
            <div className="filter-select-field">
              <label htmlFor="categorySelect" className="visually-hidden">
                카테고리
              </label>
              <select
                id="categorySelect"
                className="filter-select-pill"
                value={filters.category}
                onChange={(e) => setFilters((f) => ({ ...f, category: e.target.value }))}
              >
                <option value="">카테고리</option>
                {filterOptions.categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div className="filter-select-field">
              <label htmlFor="sourceSelect" className="visually-hidden">
                출처
              </label>
              <select
                id="sourceSelect"
                className="filter-select-pill"
                value={filters.source}
                onChange={(e) => setFilters((f) => ({ ...f, source: e.target.value }))}
              >
                <option value="">출처</option>
                {filterOptions.sources.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div className="filter-select-field">
              <label htmlFor="checkFilterSelect" className="visually-hidden">
                내용 확인 상태
              </label>
              <select
                id="checkFilterSelect"
                className="filter-select-pill"
                value={filters.checkFilter}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, checkFilter: e.target.value as FilterState['checkFilter'] }))
                }
              >
                <option value="">상태 · 전체</option>
                <option value="checked">확인함</option>
                <option value="unchecked">확인 안함</option>
              </select>
            </div>
            <div className="filter-select-field">
              <label htmlFor="participationFilterSelect" className="visually-hidden">
                참가 또는 패스
              </label>
              <select
                id="participationFilterSelect"
                className="filter-select-pill"
                value={filters.participationFilter}
                onChange={(e) =>
                  setFilters((f) => ({
                    ...f,
                    participationFilter: e.target.value as FilterState['participationFilter'],
                  }))
                }
              >
                <option value="">참가/패스 · 전체</option>
                <option value="participate">참가만</option>
                <option value="pass">패스만</option>
                <option value="none">참가·패스 미선택</option>
              </select>
            </div>
          </div>
          <button type="button" className="filter-reset-btn" onClick={resetFilters} title="필터 초기화">
            <HiArrowPath className="filter-reset-btn__ico" aria-hidden />
            초기화
          </button>
          </div>

          <div className="contest-filter-search-row">
            <div className="filter-search filter-search--primary">
              <HiMagnifyingGlass className="filter-search__icon" aria-hidden />
              <input
                type="text"
                id="searchInput"
                className="filter-search__input"
                placeholder="제목, 주최·주관 검색"
                autoComplete="off"
                value={uiQ}
                onChange={(e) => setUiQ(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && applySearch()}
                aria-label="검색어"
              />
              <button type="button" id="searchButton" className="filter-search__submit" onClick={applySearch}>
                검색
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="card contest-list-card">
        <div className="list-toolbar">
          <div className="list-toolbar-left" role="group" aria-label="선택 항목 일괄 처리">
            {selectedRows.length > 0 ? (
              <span className="list-toolbar-selection-count">{selectedRows.length}건 선택</span>
            ) : null}
            <button
              type="button"
              className="btn btn-selection-action"
              disabled={!bulkContentCheckTargets.length}
              title="체크한 공고 중 아직 내용확인 안 한 건만 처리합니다."
              onClick={() => void bulkContentCheckSelected()}
            >
              선택 내용확인
            </button>
            <button
              type="button"
              className="btn btn-selection-action"
              disabled={!bulkParticipateTargets.length}
              title="내용확인된 공고만 개인 참가로 일괄 표시합니다."
              onClick={() => void bulkParticipateSelected()}
            >
              선택 참가
            </button>
            <button
              type="button"
              className="btn btn-selection-action"
              disabled={!bulkPassTargets.length}
              title="내용확인된 공고만 패스로 일괄 표시합니다."
              onClick={() => void bulkPassSelected()}
            >
              선택 패스
            </button>
          </div>
          <div className="list-toolbar-right">
          <button
            type="button"
            id="btnBulkContentCheck"
            className={'btn btn-bulk-check' + (!canBulk ? ' btn-bulk-check--locked' : '')}
            title="현재 화면의 미확인 공고 전체 내용확인 (골드 Lv.71 이상만 사용 가능)"
            aria-disabled={!canBulk}
            onClick={async () => {
              if (!canBulk) {
                showToast(
                  `현재 Lv.${userLevel}입니다. 골드(Lv.71) 이상만 「전체 내용확인」을 쓸 수 있어요. 그 전에는 목록에서 공고별 내용확인만 가능합니다.`,
                )
                return
              }
              const unchecked = rows.filter((r) => !meta.contentChecks.has(contestKey(r.source, r.id)))
              if (!unchecked.length) {
                showToast('미확인 공고가 없습니다.')
                return
              }
              const payload = unchecked.map((r) => ({
                source: r.source || '요즘것들',
                contest_id: String(r.id || ''),
              }))
              const okBulk = await confirm({
                title: '전체 내용확인',
                message: `현재 목록에서 미확인 ${payload.length}건을 일괄 내용확인할까요?`,
                confirmText: '일괄 처리',
              })
              if (!okBulk) return
              try {
                const j = await postContentCheckBulk(payload)
                if (j.success) {
                  const done = j.done ?? payload.length
                  showToast(`일괄 내용확인 ${done}건`)
                  const expLine = formatExpGainedBulkToast('content_check', j.exp_gained ?? 0, done)
                  if (expLine) showToast(expLine)
                  void reload(page, false)
                } else showToast('일괄 처리 실패', 'error')
              } catch {
                showToast('일괄 처리 실패', 'error')
              }
            }}
          >
            전체 내용확인
          </button>
          </div>
        </div>
        <div className="contest-list-x-scroll" ref={contestListScrollRef}>
        <table className="contest-table">
          <thead>
            <tr>
              <th className="contest-th-select" scope="col">
                <input
                  ref={selectAllCheckboxRef}
                  type="checkbox"
                  className="contest-row-select-checkbox"
                  checked={allPageSelected}
                  onChange={toggleSelectAllPage}
                  disabled={!rows.length || loading}
                  aria-label="현재 페이지 행 전체 선택"
                />
              </th>
              <th style={{ width: 40 }} title="북마크" className="th-ico-cell">
                <HiStar className="th-bookmark-ico" aria-hidden />
              </th>
              <th style={{ width: 60 }}>No</th>
              <th className="contest-th-dday" scope="col">
                <button
                  type="button"
                  className={
                    'contest-th-sort-dday' + (filters.sortDdayUrgent ? ' contest-th-sort-dday--active' : '')
                  }
                  onClick={() =>
                    setFilters((f) => ({
                      ...f,
                      sortDdayUrgent: !f.sortDdayUrgent,
                    }))
                  }
                  title={
                    filters.sortDdayUrgent
                      ? '다시 누르면 최신 등록 순으로 돌아갑니다.'
                      : '클릭하면 마감이 가까운 순으로 정렬합니다. (오늘·D-day → D-1 → … → 마감·형식 없음은 뒤로)'
                  }
                  aria-pressed={filters.sortDdayUrgent === true}
                >
                  <span className="contest-th-sort-dday-main">D-day</span>
                  {filters.sortDdayUrgent ? (
                    <span className="contest-th-sort-dday-badge contest-th-sort-dday-badge--on">급함순</span>
                  ) : (
                    <span className="contest-th-sort-dday-badge">눌러 정렬</span>
                  )}
                </button>
              </th>
              <th className="contest-th-title">제목</th>
              <th style={{ width: 180 }}>주최/주관</th>
              <th className="contest-th-category" style={{ width: 72 }}>
                카테고리
              </th>
              <th style={{ width: 80 }}>출처</th>
              <th style={{ width: 100 }}>생성시간</th>
              <th style={{ width: 100 }}>업데이트시간</th>
              <th className="contest-th-participation">참가·패스</th>
              <th className="contest-th-menu">메뉴</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={12} className="loading">
                  로딩 중
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={12} className="empty-state">
                  표시할 공모전이 없습니다.
                </td>
              </tr>
            ) : (
              rows.map((row, idx) => {
                const rk = contestKey(row.source, row.id)
                const open =
                  openDetail && openDetail.id === String(row.id) && openDetail.source === (row.source || '요즘것들')
                const bookmarked = meta.bookmarkSet.has(rk)
                const checked = meta.contentChecks.has(rk)
                const part = meta.participation[rk]
                const participateApply = meta.participationApply[rk]
                const rowNo = (page - 1) * PAGE_SIZE + idx + 1
                return (
                  <FragmentWithDetail
                    key={rk + String(idx)}
                    row={row}
                    rowSelected={rowSelection.has(rk)}
                    onToggleRowSelect={() => toggleRowSelect(rk)}
                    rowNo={rowNo}
                    listScrollRef={contestListScrollRef}
                    menuFlipUp={rows.length > 1 && idx >= rows.length - 2 && idx > 0}
                    open={!!open}
                    bookmarked={bookmarked}
                    checked={checked}
                    part={part}
                    participateApply={participateApply}
                    ddayClassName={ddayClass(row.d_day)}
                    onRowClick={() => {
                      const src = row.source || '요즘것들'
                      const id = String(row.id || '')
                      setOpenDetail((o) => (o && o.id === id && o.source === src ? null : { source: src, id }))
                    }}
                    onToggleBookmark={() => toggleBookmark(row)}
                    onParticipate={() => openParticipateFlow(row)}
                    onPass={() => toggleParticipation(row, 'pass')}
                    onContentCheck={() => contentCheck(row)}
                    showToast={showToast}
                    formatFetchTime={formatFetchTime}
                    truncate={truncate}
                    titleTruncateMax={contestTableWide ? 56 : 22}
                    detail={
                      open ? (
                        <ContestDetailRow
                          source={row.source || '요즘것들'}
                          contestId={String(row.id || '')}
                          showToast={showToast}
                          currentUserId={me.user_id}
                          commented={() => {
                            setMeta((m) => {
                              const next = new Set(m.commented)
                              next.add(contestKey(row.source, row.id))
                              return { ...m, commented: next }
                            })
                          }}
                        />
                      ) : null
                    }
                  />
                )
              })
            )}
          </tbody>
        </table>
        </div>
        <PaginationBar total={total} page={page} pageSize={PAGE_SIZE} onGo={goPage} />
      </div>
      {applyModal ? (
        <ParticipateApplyModal
          open
          contestTitle={applyModal.title}
          source={applyModal.source}
          contestId={applyModal.contestId}
          onClose={() => setApplyModal(null)}
          onConfirm={(result) => {
            const r = applyModal.row
            setApplyModal(null)
            void toggleParticipation(r, 'participate', result)
          }}
        />
      ) : null}
    </div>
  )
}

const MENU_FLOAT_GAP = 4
const MENU_FALLBACK_H = 120
const MENU_FALLBACK_W = 160

function FragmentWithDetail({
  row,
  rowSelected,
  onToggleRowSelect,
  rowNo,
  listScrollRef,
  menuFlipUp,
  open,
  bookmarked,
  checked,
  part,
  participateApply,
  ddayClassName,
  onRowClick,
  onToggleBookmark,
  onParticipate,
  onPass,
  onContentCheck,
  showToast,
  formatFetchTime,
  truncate,
  titleTruncateMax,
  detail,
}: {
  row: ContestRow
  rowSelected: boolean
  onToggleRowSelect: () => void
  rowNo: number
  listScrollRef: RefObject<HTMLDivElement | null>
  /** 목록 하단부: 더보기 패널을 위로 펼칠 때(뷰포트 여유 있으면) */
  menuFlipUp: boolean
  open: boolean
  bookmarked: boolean
  checked: boolean
  part?: string
  participateApply?: ParticipationApplyInfo
  ddayClassName: string
  onRowClick: () => void
  onToggleBookmark: () => void
  onParticipate: () => void
  onPass: () => void
  onContentCheck: () => void
  showToast: (msg: string, type?: 'success' | 'error') => void
  formatFetchTime: (iso: string | undefined) => string
  truncate: (s: string | undefined, max?: number) => string
  titleTruncateMax: number
  detail: ReactNode
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [menuFixed, setMenuFixed] = useState<{ top: number; left: number; flip: boolean } | null>(null)
  const menuWrapRef = useRef<HTMLDivElement>(null)
  const menuTriggerRef = useRef<HTMLButtonElement>(null)
  const menuPortalRef = useRef<HTMLUListElement>(null)

  const updateMenuPosition = useCallback(() => {
    if (!menuOpen || !menuTriggerRef.current) return
    const t = menuTriggerRef.current.getBoundingClientRect()
    const p = menuPortalRef.current
    const ph = p?.offsetHeight ?? MENU_FALLBACK_H
    const pw = p?.offsetWidth ?? MENU_FALLBACK_W
    const edge = 8
    let flip = menuFlipUp
    if (!flip && t.bottom + MENU_FLOAT_GAP + ph > window.innerHeight - edge && t.top > ph + MENU_FLOAT_GAP + edge) {
      flip = true
    }
    if (flip && t.top - MENU_FLOAT_GAP - ph < edge && t.bottom + MENU_FLOAT_GAP + ph < window.innerHeight - edge) {
      flip = false
    }
    let left = t.right - pw
    left = Math.max(edge, Math.min(left, window.innerWidth - pw - edge))
    const top = flip ? t.top - MENU_FLOAT_GAP - ph : t.bottom + MENU_FLOAT_GAP
    setMenuFixed({ top, left, flip })
  }, [menuOpen, menuFlipUp])

  useLayoutEffect(() => {
    if (!menuOpen) {
      setMenuFixed(null)
      return
    }
    updateMenuPosition()
    const id = requestAnimationFrame(() => requestAnimationFrame(updateMenuPosition))
    return () => cancelAnimationFrame(id)
  }, [menuOpen, updateMenuPosition])

  useEffect(() => {
    if (!menuOpen) return
    const sc = listScrollRef.current
    const onScrollOrResize = () => updateMenuPosition()
    window.addEventListener('resize', onScrollOrResize)
    window.addEventListener('scroll', onScrollOrResize, true)
    sc?.addEventListener('scroll', onScrollOrResize)
    return () => {
      window.removeEventListener('resize', onScrollOrResize)
      window.removeEventListener('scroll', onScrollOrResize, true)
      sc?.removeEventListener('scroll', onScrollOrResize)
    }
  }, [menuOpen, listScrollRef, updateMenuPosition])

  useEffect(() => {
    if (!menuOpen) return
    function handleDocMouseDown(e: MouseEvent) {
      const t = e.target as Node
      if (menuWrapRef.current?.contains(t)) return
      if (menuPortalRef.current?.contains(t)) return
      setMenuOpen(false)
    }
    document.addEventListener('mousedown', handleDocMouseDown)
    return () => document.removeEventListener('mousedown', handleDocMouseDown)
  }, [menuOpen])

  /** 백엔드와 동일: 내용확인 전에는 참가/패스 신규·변경 불가. 이미 표시된 항목은 더보기에서 같은 항목으로 해제만 가능 */
  const participateLocked = !checked && part !== 'participate'
  const passLocked = !checked && part !== 'pass'

  return (
    <>
      <tr
        className={checked ? 'row-viewed' : ''}
        data-id={row.id}
        data-source={row.source || ''}
        style={{ cursor: 'pointer' }}
        onClick={onRowClick}
      >
        <td className="contest-select-cell" onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            className="contest-row-select-checkbox"
            checked={rowSelected}
            onChange={onToggleRowSelect}
            onClick={(e) => e.stopPropagation()}
            aria-label={`${truncate(row.title, 40)} 선택`}
          />
        </td>
        <td onClick={(e) => e.stopPropagation()}>
          <span
            className={`bookmark-star${bookmarked ? ' bookmarked' : ''}`}
            role="button"
            tabIndex={0}
            onClick={onToggleBookmark}
            onKeyDown={(e) => e.key === 'Enter' && onToggleBookmark()}
          >
            {bookmarked ? <HiStar className="bookmark-star__ico" aria-hidden /> : <HiOutlineStar className="bookmark-star__ico" aria-hidden />}
          </span>
        </td>
        <td>
          {checked ? (
            <span className="status-check" aria-hidden>
              <HiCheck className="status-check__ico" />
            </span>
          ) : null}
          {rowNo}
        </td>
        <td>
          <span className={ddayClassName}>{row.d_day || '-'}</span>
        </td>
        <td className="title-cell">
          <span className="title-cell__text" title={row.title || undefined}>
            {truncate(row.title, titleTruncateMax)}
          </span>
        </td>
        <td className="host-cell">{row.host || '-'}</td>
        <td
          className="contest-category-cell"
          title={row.category?.trim() ? row.category : undefined}
        >
          {row.category || '-'}
        </td>
        <td>{row.source || '-'}</td>
        <td>{formatFetchTime(row.created_at)}</td>
        <td>{formatFetchTime(row.updated_at)}</td>
        <td className="participation-status-cell" onClick={(e) => e.stopPropagation()}>
          {part === 'participate' ? (
            <span className="participation-status-stack">
              <span className="participation-badge participation-badge--participate">참가</span>
              {participateApply?.mode === 'team' ? (
                <span className="participation-apply-sub">{participateApply.teamName || '팀'}</span>
              ) : participateApply?.mode === 'individual' ? (
                <span className="participation-apply-sub">개인</span>
              ) : null}
            </span>
          ) : part === 'pass' ? (
            <span className="participation-badge participation-badge--pass">패스</span>
          ) : (
            '-'
          )}
        </td>
        <td className="action-cell" onClick={(e) => e.stopPropagation()}>
          <div className="contest-menu-wrap" ref={menuWrapRef}>
            <button
              ref={menuTriggerRef}
              type="button"
              className="btn btn-action contest-menu-trigger"
              aria-expanded={menuOpen}
              aria-haspopup="menu"
              onClick={() => setMenuOpen((o) => !o)}
            >
              더보기
              <HiChevronDown className="contest-menu-caret-ico" aria-hidden />
            </button>
            {menuOpen
              ? createPortal(
                  <ul
                    ref={menuPortalRef}
                    className={
                      'contest-menu-panel contest-menu-panel--portal' +
                      (menuFixed?.flip ? ' contest-menu-panel--flip-up' : '')
                    }
                    style={
                      menuFixed
                        ? { top: menuFixed.top, left: menuFixed.left }
                        : menuTriggerRef.current
                          ? (() => {
                              const r = menuTriggerRef.current!.getBoundingClientRect()
                              return {
                                top: r.bottom + MENU_FLOAT_GAP,
                                left: Math.max(8, r.right - MENU_FALLBACK_W),
                              }
                            })()
                          : undefined
                    }
                    role="menu"
                  >
                    <li role="none">
                      <button
                        type="button"
                        role="menuitem"
                        className="contest-menu-item"
                        onClick={() => {
                          onContentCheck()
                          setMenuOpen(false)
                        }}
                      >
                        내용확인
                      </button>
                    </li>
                    <li role="none">
                      <button
                        type="button"
                        role="menuitem"
                        className={
                          'contest-menu-item' +
                          (part === 'participate' ? ' contest-menu-item--active' : '') +
                          (participateLocked ? ' contest-menu-item--locked' : '')
                        }
                        title={
                          participateLocked
                            ? '먼저 내용확인을 해주세요. (표시 해제는 이 항목을 다시 누르세요)'
                            : undefined
                        }
                        onClick={() => {
                          if (participateLocked) {
                            showToast('내용확인 먼저 처리해주세요.')
                            setMenuOpen(false)
                            return
                          }
                          onParticipate()
                          setMenuOpen(false)
                        }}
                      >
                        참가
                      </button>
                    </li>
                    <li role="none">
                      <button
                        type="button"
                        role="menuitem"
                        className={
                          'contest-menu-item' +
                          (part === 'pass' ? ' contest-menu-item--active' : '') +
                          (passLocked ? ' contest-menu-item--locked' : '')
                        }
                        title={
                          passLocked ? '먼저 내용확인을 해주세요. (표시 해제는 이 항목을 다시 누르세요)' : undefined
                        }
                        onClick={() => {
                          if (passLocked) {
                            showToast('내용확인 먼저 처리해주세요.')
                            setMenuOpen(false)
                            return
                          }
                          onPass()
                          setMenuOpen(false)
                        }}
                      >
                        패스
                      </button>
                    </li>
                  </ul>,
                  document.body,
                )
              : null}
          </div>
        </td>
      </tr>
      {open && detail ? (
        <tr className="detail-row">
          <td colSpan={12}>{detail}</td>
        </tr>
      ) : null}
    </>
  )
}
