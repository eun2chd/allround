import { useMemo, useState } from 'react'
import {
  countParticipationLifecycle,
  isParticipationEnded,
  matchesLifecycleFilter,
  type LifecycleFilter,
} from '../../features/participation/participationLifecycle'
import { participationRowTouchesYear } from '../../features/participation/participationRowYear'
import { ParticipationLifecycleBadge } from './ParticipationLifecycleBadge'
import { ParticipationLifecycleMetricGrid } from './ParticipationLifecycleMetricGrid'
import { normalizePrizeSettlement, PRIZE_SETTLEMENT_STATUSES } from '../../features/participation/prizeSettlement'
import { parseDdayDays } from '../../services/contestDashboardSummaryService'
import type { TeamMemberContest, TeamMemberOverview } from '../../services/teamParticipationService'
import { TeamPrizeVault, type PrizeVaultProgress } from './TeamPrizeVault'
import { PaginationBar } from '../common/PaginationBar'
import { TableActionDropdown, type TableActionMenuItem } from '../common/TableActionDropdown'
import {
  formatParticipationDateFull,
  formatParticipationDateTable,
  participationDateIso,
} from '../../features/participation/participationDates'
import { openParticipationFile, resolveParticipationFileUrl } from '../../features/participation/participationFilePreview'
import { onParticipationTableRowClick } from '../../features/participation/participationTableRowClick'
import { TableEllipsis } from '../common/TableEllipsis'

export type DashboardFlatRow = TeamMemberContest & {
  memberId: string
  memberNickname: string
}

function flattenMembers(members: TeamMemberOverview[]): DashboardFlatRow[] {
  const out: DashboardFlatRow[] = []
  for (const m of members) {
    for (const c of m.contests) {
      out.push({
        ...c,
        memberId: m.id,
        memberNickname: m.nickname,
      })
    }
  }
  return out
}

function startOfToday(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

function formatKrw(n: number): string {
  return new Intl.NumberFormat('ko-KR', {
    style: 'currency',
    currency: 'KRW',
    maximumFractionDigits: 0,
  }).format(n)
}

function formatCalendarDayLabel(iso: string): string {
  const d = new Date(`${iso}T12:00:00`)
  if (Number.isNaN(d.getTime())) return iso
  const weekdays = ['일', '월', '화', '수', '목', '금', '토']
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${weekdays[d.getDay()]})`
}

function daysUntilAnnouncement(dateStr: string | null | undefined, now: Date): number | null {
  if (!dateStr) return null
  const t = new Date(`${String(dateStr).slice(0, 10)}T12:00:00`).getTime()
  if (Number.isNaN(t)) return null
  const diff = Math.ceil((t - startOfToday(now)) / (24 * 60 * 60 * 1000))
  return diff
}

function ddayRankForSort(d: string | undefined): number {
  const n = parseDdayDays(d)
  if (n === null) return 999
  if (n === -1) return 998
  return n
}

function rowTouchesYear(r: DashboardFlatRow, year: number): boolean {
  return participationRowTouchesYear(r, year)
}

type TableFilter = 'all' | '지원완료' | '심사·진행' | '수상' | '미수상'
type ScopeFilter = 'focus' | 'all'

type Props = {
  members: TeamMemberOverview[]
  loading: boolean
  prizeVault: PrizeVaultProgress
  dashboardYear: number
  dashboardYearOptions: number[]
  onDashboardYearChange: (year: number) => void
  onOpenContest: (member: TeamMemberOverview, c: TeamMemberContest) => void
}

const DASHBOARD_PAGE_SIZE = 5

function tableRowNo(page: number, index: number): number {
  return (page - 1) * DASHBOARD_PAGE_SIZE + index + 1
}

type IncompleteDetailsProps = {
  incompleteRows: DashboardFlatRow[]
  incompleteFilteredRows: DashboardFlatRow[]
  incompleteMemberOptions: [string, string][]
  effectiveIncompleteMemberIdFilter: string
  onMemberFilterChange: (memberId: string) => void
  members: TeamMemberOverview[]
  onOpenContest: (member: TeamMemberOverview, c: TeamMemberContest) => void
  now: Date
}

/** 페이지 state는 여기 두고 상위에서 `key`로 필터·연도 변경 시 리셋 */
function ParticipationIncompleteDetailsBlock({
  incompleteRows,
  incompleteFilteredRows,
  incompleteMemberOptions,
  effectiveIncompleteMemberIdFilter,
  onMemberFilterChange,
  members,
  onOpenContest,
  now,
}: IncompleteDetailsProps) {
  const [incompletePage, setIncompletePage] = useState(1)
  const paginatedIncompleteRows = useMemo(
    () =>
      incompleteFilteredRows.slice(
        (incompletePage - 1) * DASHBOARD_PAGE_SIZE,
        incompletePage * DASHBOARD_PAGE_SIZE,
      ),
    [incompleteFilteredRows, incompletePage],
  )

  const resolveMember = (memberId: string): TeamMemberOverview | undefined =>
    members.find((m) => m.id === memberId)

  return (
    <details className="participation-incomplete-details" open>
      <summary className="participation-incomplete-summary">
        <span className="participation-incomplete-summary-title">상세 등록이 필요한 참가</span>
        <span className="participation-incomplete-summary-count">
          {effectiveIncompleteMemberIdFilter
            ? `${incompleteFilteredRows.length}/${incompleteRows.length}건`
            : `${incompleteRows.length}건`}
        </span>
      </summary>
      <div className="participation-incomplete-details-body">
        <p className="participation-dashboard-section-desc participation-incomplete-details-desc">
          참가만 눌렀고 상세를 안 채운 공모전입니다. D-day가 10일 이내인 항목을 위에 모았습니다.
        </p>
        <div className="participation-incomplete-filter-row">
          <label className="participation-incomplete-filter-label" htmlFor="participation-incomplete-member-filter">
            팀원(닉네임)
          </label>
          <select
            id="participation-incomplete-member-filter"
            className="participation-status-filter-select participation-incomplete-member-select"
            value={effectiveIncompleteMemberIdFilter}
            onChange={(e) => onMemberFilterChange(e.target.value)}
          >
            <option value="">전체</option>
            {incompleteMemberOptions.map(([memberId, nickname]) => (
              <option key={memberId} value={memberId}>
                {nickname}
              </option>
            ))}
          </select>
        </div>
        <div className="participation-dashboard-table-wrap">
          <table className="participation-dashboard-table">
            <colgroup>
              <col className="participation-dashboard-col-no" />
              <col className="participation-dashboard-col-lifecycle" />
              <col className="participation-dashboard-col-dday" />
              <col className="participation-dashboard-col-date" />
              <col className="participation-dashboard-col-title" />
              <col className="participation-dashboard-col-member" />
              <col className="participation-dashboard-col-source" />
              <col className="participation-dashboard-col-actions" />
            </colgroup>
            <thead>
              <tr>
                <th scope="col" className="participation-dt-no-col">
                  No
                </th>
                <th scope="col">진행</th>
                <th scope="col">D-day</th>
                <th scope="col">결과 발표</th>
                <th scope="col">공모전</th>
                <th scope="col">팀원</th>
                <th scope="col">출처</th>
                <th scope="col">비고·링크</th>
              </tr>
            </thead>
            <tbody>
              {incompleteFilteredRows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="participation-dashboard-table-empty">
                    선택한 팀원에 해당하는 항목이 없습니다.
                  </td>
                </tr>
              ) : (
                paginatedIncompleteRows.map((r, i) => {
                  const n = parseDdayDays(r.d_day)
                  const urgent5 = n !== null && n !== -1 && n <= 5
                  const urgent10 = n !== null && n !== -1 && n <= 10
                  const m = resolveMember(r.memberId)
                  const incompleteActions: TableActionMenuItem[] = []
                  if (m) {
                    incompleteActions.push({
                      kind: 'button',
                      label: '요약',
                      onClick: () => onOpenContest(m, r),
                    })
                  }
                  incompleteActions.push({
                    kind: 'link',
                    label: '상세 등록',
                    to: `/mypage/${encodeURIComponent(r.memberId)}#participationSection`,
                  })
                  const lifecycleEnded = isParticipationEnded(
                    {
                      lifecycle_status: r.lifecycle_status,
                      participation_status: r.participation_status,
                      result_announcement_date: r.result_announcement_date,
                    },
                    now,
                  )
                  return (
                    <tr
                      key={`${r.memberId}-${r.source}-${r.id}`}
                      className={
                        'participation-table-row--clickable' +
                        (urgent5 ? ' participation-incomplete-row--d5' : '') +
                        (!urgent5 && urgent10 ? ' participation-incomplete-row--d10' : '') +
                        (lifecycleEnded
                          ? ' participation-table-row--lifecycle-ended'
                          : ' participation-table-row--lifecycle-ongoing')
                      }
                      onClick={(e) => {
                        if (!m) return
                        onParticipationTableRowClick(e, () => onOpenContest(m, r))
                      }}
                    >
                      <td className="participation-dt-no">{tableRowNo(incompletePage, i)}</td>
                      <td>
                        <ParticipationLifecycleBadge
                          lifecycle_status={r.lifecycle_status}
                          participation_status={r.participation_status}
                          result_announcement_date={r.result_announcement_date}
                          now={now}
                        />
                      </td>
                      <td
                        className={
                          'participation-incomplete-dday participation-table-cell-clip' +
                          (urgent5 ? ' participation-incomplete-dday--d5' : '')
                        }
                      >
                        <TableEllipsis text={r.d_day?.trim() ? r.d_day : ''} />
                      </td>
                      <td
                        className="participation-table-cell-clip participation-table-date"
                        data-date={participationDateIso(r.result_announcement_date) ?? ''}
                      >
                        <TableEllipsis
                          text={formatParticipationDateTable(r.result_announcement_date)}
                          title={formatParticipationDateFull(r.result_announcement_date)}
                        />
                      </td>
                      <td className="participation-table-cell-clip participation-dt-title">
                        <TableEllipsis text={r.title || ''} emptyLabel="(제목 없음)" />
                      </td>
                      <td className="participation-table-cell-clip">
                        <TableEllipsis text={r.memberNickname || ''} />
                      </td>
                      <td className="participation-table-cell-clip">
                        <TableEllipsis text={r.source || '요즘것들'} />
                      </td>
                      <td className="participation-dt-actions">
                        <TableActionDropdown items={incompleteActions} />
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
        {incompleteFilteredRows.length > DASHBOARD_PAGE_SIZE ? (
          <div className="participation-dashboard-pagination">
            <PaginationBar
              total={incompleteFilteredRows.length}
              page={incompletePage}
              pageSize={DASHBOARD_PAGE_SIZE}
              onGo={setIncompletePage}
            />
          </div>
        ) : null}
      </div>
    </details>
  )
}

type HistoryTableProps = {
  tableRows: DashboardFlatRow[]
  tableFilter: TableFilter
  scopeFilter: ScopeFilter
  setTableFilter: (f: TableFilter) => void
  setScopeFilter: (s: ScopeFilter) => void
  now: Date
  members: TeamMemberOverview[]
  onOpenContest: (member: TeamMemberOverview, c: TeamMemberContest) => void
}

function ParticipationHistoryTableBlock({
  tableRows,
  tableFilter,
  scopeFilter,
  setTableFilter,
  setScopeFilter,
  now,
  members,
  onOpenContest,
}: HistoryTableProps) {
  const [tablePage, setTablePage] = useState(1)
  const paginatedRows = useMemo(
    () =>
      tableRows.slice((tablePage - 1) * DASHBOARD_PAGE_SIZE, tablePage * DASHBOARD_PAGE_SIZE),
    [tableRows, tablePage],
  )

  const resolveMember = (memberId: string): TeamMemberOverview | undefined =>
    members.find((m) => m.id === memberId)

  return (
    <details className="participation-incomplete-details participation-table-accordion" open>
      <summary className="participation-incomplete-summary">
        <span className="participation-incomplete-summary-title">전체 지원 이력</span>
        <span className="participation-incomplete-summary-count">{tableRows.length}건</span>
      </summary>
      <div className="participation-incomplete-details-body">
        <div className="participation-dashboard-section-head participation-dashboard-table-head">
          <div className="participation-table-filters">
            <div className="participation-scope-toggle" role="group" aria-label="목록 범위">
              <button
                type="button"
                className={scopeFilter === 'focus' ? 'active' : ''}
                onClick={() => setScopeFilter('focus')}
              >
                집중 (진행 중)
              </button>
              <button
                type="button"
                className={scopeFilter === 'all' ? 'active' : ''}
                onClick={() => setScopeFilter('all')}
              >
                전체
              </button>
            </div>
            <label className="participation-status-filter-label">
              <span className="visually-hidden">상태 필터</span>
              <select
                className="participation-status-filter-select"
                value={tableFilter}
                onChange={(e) => setTableFilter(e.target.value as TableFilter)}
              >
                <option value="all">상태 · 전체</option>
                <option value="지원완료">지원완료</option>
                <option value="심사·진행">심사·본선</option>
                <option value="수상">수상</option>
                <option value="미수상">탈락·미수상</option>
              </select>
            </label>
          </div>
        </div>
        <div className="participation-dashboard-table-wrap">
          <table className="participation-dashboard-table">
            <colgroup>
              <col className="participation-dashboard-col-no" />
              <col className="participation-dashboard-col-lifecycle" />
              <col className="participation-dashboard-col-title" />
              <col className="participation-dashboard-col-member" />
              <col className="participation-dashboard-col-date" />
              <col className="participation-dashboard-col-announce" />
              <col className="participation-dashboard-col-prize" />
              <col className="participation-dashboard-col-status" />
              <col className="participation-dashboard-col-actions" />
            </colgroup>
            <thead>
              <tr>
                <th scope="col" className="participation-dt-no-col">
                  No
                </th>
                <th scope="col">진행</th>
                <th scope="col">공모전</th>
                <th scope="col">팀원</th>
                <th scope="col">지원일</th>
                <th scope="col">결과 발표</th>
                <th scope="col">상금</th>
                <th scope="col">상태</th>
                <th scope="col">비고·링크</th>
              </tr>
            </thead>
            <tbody>
              {paginatedRows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="participation-dashboard-table-empty">
                    조건에 맞는 행이 없습니다.
                  </td>
                </tr>
              ) : (
                paginatedRows.map((r, i) => {
                  const m = resolveMember(r.memberId)
                  const prize =
                    r.has_prize && r.prize_amount != null ? formatKrw(Number(r.prize_amount)) : '-'
                  const st = r.has_detail ? r.participation_status || '-' : '상세 미등록'
                  const du = daysUntilAnnouncement(r.result_announcement_date, now)
                  const historyActions: TableActionMenuItem[] = []
                  if (r.url) {
                    historyActions.push({
                      kind: 'link',
                      label: '원문',
                      to: String(r.url),
                      external: true,
                    })
                  }
                  if (r.document_filename && r.document_path) {
                    const docName = String(r.document_filename)
                    const docUrl = resolveParticipationFileUrl(r.document_path)
                    historyActions.push({
                      kind: 'button',
                      label: docName.length > 18 ? `첨부: ${docName.slice(0, 16)}…` : `첨부: ${docName}`,
                      title: docName,
                      onClick: () => {
                        if (docUrl) openParticipationFile(docUrl)
                      },
                      disabled: !docUrl,
                    })
                  }
                  if (m) {
                    historyActions.push({
                      kind: 'button',
                      label: '상세',
                      onClick: () => onOpenContest(m, r),
                    })
                  }
                  const lifecycleEnded = isParticipationEnded(
                    {
                      lifecycle_status: r.lifecycle_status,
                      participation_status: r.participation_status,
                      result_announcement_date: r.result_announcement_date,
                    },
                    now,
                  )
                  return (
                    <tr
                      key={`${r.memberId}-${r.source}-${r.id}-tb`}
                      className={
                        'participation-table-row--clickable' +
                        (lifecycleEnded
                          ? ' participation-table-row--lifecycle-ended'
                          : ' participation-table-row--lifecycle-ongoing')
                      }
                      onClick={(e) => {
                        if (!m) return
                        onParticipationTableRowClick(e, () => onOpenContest(m, r))
                      }}
                    >
                      <td className="participation-dt-no">{tableRowNo(tablePage, i)}</td>
                      <td>
                        <ParticipationLifecycleBadge
                          lifecycle_status={r.lifecycle_status}
                          participation_status={r.participation_status}
                          result_announcement_date={r.result_announcement_date}
                          now={now}
                        />
                      </td>
                      <td className="participation-table-cell-clip participation-dt-title">
                        <TableEllipsis text={r.title || ''} />
                      </td>
                      <td className="participation-table-cell-clip">
                        <TableEllipsis text={r.memberNickname || ''} />
                      </td>
                      <td
                        className="participation-table-cell-clip participation-table-date"
                        data-date={
                          participationDateIso(r.participation_registered_at || r.submitted_at) ?? ''
                        }
                      >
                        <TableEllipsis
                          text={formatParticipationDateTable(
                            r.participation_registered_at || r.submitted_at,
                          )}
                          title={formatParticipationDateFull(
                            r.participation_registered_at || r.submitted_at,
                          )}
                        />
                      </td>
                      <td
                        className="participation-table-cell-clip participation-table-date"
                        data-date={participationDateIso(r.result_announcement_date) ?? ''}
                      >
                        <TableEllipsis
                          text={formatParticipationDateTable(r.result_announcement_date)}
                          title={
                            du != null && du >= 0
                              ? `${formatParticipationDateFull(r.result_announcement_date)} (D-${du})`
                              : formatParticipationDateFull(r.result_announcement_date)
                          }
                        />
                      </td>
                      <td className="participation-table-cell-clip">
                        <TableEllipsis text={prize} />
                      </td>
                      <td className="participation-table-cell-clip">
                        <TableEllipsis
                          text={st}
                          className={
                            'participation-dt-status' +
                            (st === '상세 미등록' ? ' participation-dt-status--warn' : '')
                          }
                        />
                      </td>
                      <td className="participation-dt-actions">
                        <TableActionDropdown items={historyActions} />
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
        {tableRows.length > DASHBOARD_PAGE_SIZE ? (
          <div className="participation-dashboard-pagination">
            <PaginationBar
              total={tableRows.length}
              page={tablePage}
              pageSize={DASHBOARD_PAGE_SIZE}
              onGo={setTablePage}
            />
          </div>
        ) : null}
      </div>
    </details>
  )
}

export function ParticipationDashboardPanel({
  members,
  loading,
  prizeVault,
  dashboardYear,
  dashboardYearOptions,
  onDashboardYearChange,
  onOpenContest,
}: Props) {
  const [tableFilter, setTableFilter] = useState<TableFilter>('all')
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>('focus')
  const [lifecycleFilter, setLifecycleFilter] = useState<LifecycleFilter>('all')
  const [incompleteMemberIdFilter, setIncompleteMemberIdFilter] = useState('')
  const [selectedCalendarIso, setSelectedCalendarIso] = useState<string | null>(null)
  const [calendarMonth, setCalendarMonth] = useState(() =>
    dashboardYear === new Date().getFullYear() ? new Date().getMonth() : 0,
  )

  const flat = useMemo(() => flattenMembers(members), [members])
  const flatFiltered = useMemo(
    () => flat.filter((r) => rowTouchesYear(r, dashboardYear)),
    [flat, dashboardYear],
  )
  const flatLifecycleFiltered = useMemo(() => {
    if (lifecycleFilter === 'all') return flatFiltered
    return flatFiltered.filter((r) =>
      matchesLifecycleFilter(
        {
          lifecycle_status: r.lifecycle_status,
          participation_status: r.participation_status,
          result_announcement_date: r.result_announcement_date,
        },
        lifecycleFilter,
      ),
    )
  }, [flatFiltered, lifecycleFilter])
  const now = useMemo(() => new Date(), [])
  const startToday = startOfToday(now)
  const viewIsCalendarYear = dashboardYear === now.getFullYear()

  const effectiveSelectedCalendarIso = useMemo(() => {
    if (!selectedCalendarIso) return null
    const [yStr, mStr] = selectedCalendarIso.split('-')
    const y = Number(yStr)
    const m = Number(mStr) - 1
    if (y !== dashboardYear || m !== calendarMonth) return null
    return selectedCalendarIso
  }, [selectedCalendarIso, dashboardYear, calendarMonth])

  const handleDashboardYearChange = (year: number) => {
    setCalendarMonth(year === now.getFullYear() ? now.getMonth() : 0)
    setSelectedCalendarIso(null)
    onDashboardYearChange(year)
  }

  const canPrevCalendarMonth = calendarMonth > 0
  const canNextCalendarMonth = calendarMonth < 11

  const goPrevCalendarMonth = () => {
    if (!canPrevCalendarMonth) return
    setCalendarMonth((m) => m - 1)
    setSelectedCalendarIso(null)
  }

  const goNextCalendarMonth = () => {
    if (!canNextCalendarMonth) return
    setCalendarMonth((m) => m + 1)
    setSelectedCalendarIso(null)
  }

  const metrics = useMemo(() => {
    const cy = now.getFullYear()
    const mon = now.getMonth()
    const startM = new Date(cy, mon, 1).getTime()
    const endM = new Date(cy, mon + 1, 0, 23, 59, 59, 999).getTime()
    let ongoingSupport = 0
    let announcementsThisMonth = 0
    let totalPrize = 0
    for (const r of flatFiltered) {
      if (r.has_detail && r.participation_status === '지원완료') ongoingSupport += 1
      if (viewIsCalendarYear && r.result_announcement_date) {
        const t = new Date(`${String(r.result_announcement_date).slice(0, 10)}T12:00:00`).getTime()
        if (!Number.isNaN(t) && t >= startM && t <= endM) announcementsThisMonth += 1
      }
      if (r.has_prize && r.prize_amount != null && !Number.isNaN(Number(r.prize_amount))) {
        totalPrize += Number(r.prize_amount)
      }
    }
    return { ongoingSupport, announcementsThisMonth, totalPrize }
  }, [flatFiltered, now, viewIsCalendarYear])

  const lifecycleCounts = useMemo(
    () =>
      countParticipationLifecycle(
        flatFiltered.map((r) => ({
          lifecycle_status: r.lifecycle_status,
          participation_status: r.participation_status,
          result_announcement_date: r.result_announcement_date,
        })),
        now,
      ),
    [flatFiltered, now],
  )

  const incompleteRows = useMemo(() => {
    return flatLifecycleFiltered
      .filter((r) => !r.has_detail)
      .sort((a, b) => {
        const ra = ddayRankForSort(a.d_day)
        const rb = ddayRankForSort(b.d_day)
        if (ra !== rb) return ra - rb
        return (a.title || '').localeCompare(b.title || '')
      })
  }, [flatLifecycleFiltered])

  const incompleteMemberOptions = useMemo(() => {
    const byId = new Map<string, string>()
    for (const r of incompleteRows) {
      byId.set(r.memberId, r.memberNickname || '(닉네임 없음)')
    }
    return [...byId.entries()].sort((a, b) => a[1].localeCompare(b[1], 'ko'))
  }, [incompleteRows])

  /** 옵션에서 빠진 등 잘못된 값은 전체 보기와 동일하게 취급 */
  const effectiveIncompleteMemberIdFilter = useMemo(() => {
    if (
      !incompleteMemberIdFilter ||
      !incompleteMemberOptions.some(([id]) => id === incompleteMemberIdFilter)
    )
      return ''
    return incompleteMemberIdFilter
  }, [incompleteMemberIdFilter, incompleteMemberOptions])

  const incompleteFilteredRows = useMemo(() => {
    if (!effectiveIncompleteMemberIdFilter) return incompleteRows
    return incompleteRows.filter((r) => r.memberId === effectiveIncompleteMemberIdFilter)
  }, [incompleteRows, effectiveIncompleteMemberIdFilter])

  const prizeVaultSettlement = useMemo(() => {
    const counts = {
      미수령: 0,
      '수령 완료': 0,
      '팀 회식비 전환': 0,
    } as Record<(typeof PRIZE_SETTLEMENT_STATUSES)[number], number>
    for (const r of flatFiltered) {
      if (!r.has_prize) continue
      const amt = r.prize_amount != null ? Number(r.prize_amount) : 0
      if (amt <= 0) continue
      const norm = normalizePrizeSettlement(r.prize_settlement_status) || '미수령'
      counts[norm] += 1
    }
    return { counts }
  }, [flatFiltered])

  /** 금고 UI: 「수령 완료」만 합산 (미수령·회식비 전환은 제외) */
  const vaultReceivedWon = useMemo(() => {
    let t = 0
    for (const r of flatFiltered) {
      if (!r.has_prize || r.prize_amount == null || Number.isNaN(Number(r.prize_amount))) continue
      if (normalizePrizeSettlement(r.prize_settlement_status) !== '수령 완료') continue
      t += Number(r.prize_amount)
    }
    return Math.floor(t)
  }, [flatFiltered])

  const prizeVaultContributors = useMemo(() => {
    const rows = flatFiltered.filter(
      (r) =>
        r.has_prize &&
        r.prize_amount != null &&
        !Number.isNaN(Number(r.prize_amount)) &&
        Number(r.prize_amount) > 0 &&
        normalizePrizeSettlement(r.prize_settlement_status) === '수령 완료',
    )
    rows.sort((a, b) => Number(b.prize_amount) - Number(a.prize_amount))
    const seen = new Set<string>()
    const out: { nickname: string; profileUrl?: string }[] = []
    for (const r of rows) {
      if (seen.has(r.memberId)) continue
      seen.add(r.memberId)
      const m = members.find((x) => x.id === r.memberId)
      out.push({
        nickname: r.memberNickname || '팀원',
        profileUrl: m?.profile_url ? String(m.profile_url) : undefined,
      })
      if (out.length >= 10) break
    }
    return out
  }, [flatFiltered, members])

  const timeline = useMemo(() => {
    return flatFiltered
      .filter((r) => r.result_announcement_date)
      .map((r) => ({
        row: r,
        t: new Date(`${String(r.result_announcement_date).slice(0, 10)}T12:00:00`).getTime(),
      }))
      .filter((x) => !Number.isNaN(x.t) && x.t >= startToday)
      .sort((a, b) => a.t - b.t)
      .slice(0, 4)
      .map((x) => x.row)
  }, [flatFiltered, startToday])

  const calendarMarks = useMemo(() => {
    const y = dashboardYear
    const set = new Set<string>()
    for (const r of flatFiltered) {
      if (!r.result_announcement_date) continue
      const s = String(r.result_announcement_date).slice(0, 10)
      const d = new Date(`${s}T12:00:00`)
      if (Number.isNaN(d.getTime())) continue
      if (d.getFullYear() === y && d.getMonth() === calendarMonth) set.add(s)
    }
    return set
  }, [flatFiltered, dashboardYear, calendarMonth])

  const todayIso = useMemo(() => {
    const y = now.getFullYear()
    const mon = now.getMonth()
    const d = now.getDate()
    return `${y}-${String(mon + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  }, [now])

  const selectedCalendarRows = useMemo(() => {
    if (!effectiveSelectedCalendarIso) return []
    return flatFiltered
      .filter((r) => {
        if (!r.result_announcement_date) return false
        return String(r.result_announcement_date).slice(0, 10) === effectiveSelectedCalendarIso
      })
      .sort((a, b) => (a.title || '').localeCompare(b.title || '', 'ko'))
  }, [flatFiltered, effectiveSelectedCalendarIso])

  const calendarGrid = useMemo(() => {
    const y = dashboardYear
    const mon = calendarMonth
    const first = new Date(y, mon, 1)
    const last = new Date(y, mon + 1, 0)
    const startPad = (first.getDay() + 6) % 7
    const daysInMonth = last.getDate()
    const cells: { day: number | null; mark: boolean; isToday: boolean; iso: string | null }[] = []
    for (let i = 0; i < startPad; i++) cells.push({ day: null, mark: false, isToday: false, iso: null })
    for (let d = 1; d <= daysInMonth; d++) {
      const iso = `${y}-${String(mon + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      cells.push({
        day: d,
        mark: calendarMarks.has(iso),
        isToday: iso === todayIso,
        iso,
      })
    }
    return { cells, label: `${y}년 ${mon + 1}월` }
  }, [dashboardYear, calendarMonth, calendarMarks, todayIso])

  const tableRows = useMemo(() => {
    let list = flatLifecycleFiltered.slice()
    if (scopeFilter === 'focus') {
      list = list.filter(
        (r) =>
          !isParticipationEnded(
            {
              lifecycle_status: r.lifecycle_status,
              participation_status: r.participation_status,
              result_announcement_date: r.result_announcement_date,
            },
            now,
          ),
      )
    }
    if (tableFilter === 'all') return list
    return list.filter((r) => {
      const st = r.participation_status || ''
      if (tableFilter === '지원완료') return st === '지원완료'
      if (tableFilter === '심사·진행') return st === '심사중' || st === '본선진출'
      if (tableFilter === '수상') return st === '수상'
      if (tableFilter === '미수상') return st === '미수상'
      return true
    })
  }, [flatLifecycleFiltered, tableFilter, scopeFilter, now])

  const resolveMember = (memberId: string): TeamMemberOverview | undefined =>
    members.find((m) => m.id === memberId)

  if (loading) {
    return <div className="notice-state-msg participation-dashboard-loading">불러오는 중…</div>
  }

  if (!members.length) {
    return (
      <div className="participation-dashboard">
        <div className="participation-dashboard-year-bar">
          <label className="participation-dashboard-year-label" htmlFor="participation-dashboard-year-select-empty">
            현황판 연도
          </label>
          <select
            id="participation-dashboard-year-select-empty"
            className="participation-dashboard-year-select"
            value={dashboardYear}
            onChange={(e) => handleDashboardYearChange(Number(e.target.value))}
          >
            {dashboardYearOptions.map((y) => (
              <option key={y} value={y}>
                {y}년
              </option>
            ))}
          </select>
        </div>
        <div className="notice-state-msg">
          팀원이 없거나 참가 중인 공모전이 없습니다. 팀원별 탭에서도 동일합니다.
        </div>
      </div>
    )
  }

  return (
    <div className="participation-dashboard">
      <div className="participation-dashboard-year-bar">
        <label className="participation-dashboard-year-label" htmlFor="participation-dashboard-year-select">
          현황판 연도
        </label>
        <select
          id="participation-dashboard-year-select"
          className="participation-dashboard-year-select"
          value={dashboardYear}
          onChange={(e) => handleDashboardYearChange(Number(e.target.value))}
        >
          {dashboardYearOptions.map((y) => (
            <option key={y} value={y}>
              {y}년
            </option>
          ))}
        </select>
        <span className="participation-dashboard-year-hint">
          참가 등록·제출일·결과 발표일 중 하나가 해당 연도인 건만 집계합니다. 금고{' '}
          <strong>목표(만원)</strong>는 팀 설정 동일 연도, <strong>통·막대</strong>는{' '}
          <strong>수령 완료</strong> 금액만 반영합니다. (요약 카드「누적 입력 상금」은 상금 체크된 전체)
        </span>
      </div>
      <p className="participation-dashboard-lead">
        <strong>{dashboardYear}년</strong> 기준으로 팀 참가·발표·상금을 모았습니다. 상세 미등록은 마감이 가까운 순입니다.
        (알림 푸시·자동 종료 이동은 추후 연동 예정입니다.)
      </p>

      <TeamPrizeVault
        progress={prizeVault}
        vaultReceivedWon={vaultReceivedWon}
        settlementCounts={prizeVaultSettlement.counts}
        prizeContributors={prizeVaultContributors}
      />

      <section className="participation-dashboard-metrics" aria-label="요약 지표">
        <div className="participation-metric-card">
          <div className="participation-metric-value">{metrics.ongoingSupport}</div>
          <div className="participation-metric-label">진행 중 지원</div>
          <div className="participation-metric-hint">상세 등록됨 · 상태 「지원완료」</div>
        </div>
        <div className="participation-metric-card">
          <div className="participation-metric-value">{metrics.announcementsThisMonth}</div>
          <div className="participation-metric-label">이번 달 발표 예정</div>
          <div className="participation-metric-hint">
            {viewIsCalendarYear
              ? '결과 발표일 · 실제 이번 달'
              : '연도 필터가 올해가 아니면 0입니다 (이번 달 기준은 항상 실제 달력).'}
          </div>
        </div>
        <div className="participation-metric-card participation-metric-card--gold">
          <div className="participation-metric-value">{formatKrw(metrics.totalPrize)}</div>
          <div className="participation-metric-label">누적 입력 상금</div>
          <div className="participation-metric-hint">상세에서 상금 체크·금액 입력 합산</div>
        </div>
      </section>

      <ParticipationLifecycleMetricGrid
        ongoing={lifecycleCounts.ongoing}
        ended={lifecycleCounts.ended}
        activeFilter={lifecycleFilter}
        onFilter={(f) => {
          setLifecycleFilter(f)
          setIncompleteMemberIdFilter('')
        }}
        hint={`${dashboardYear}년 팀 참가 기준 · 상세 등록 여부와 관계없이 진행 상태를 집계합니다.`}
      />

      <div className="participation-dashboard-main-grid participation-dashboard-main-grid--top">
        <section
          className="participation-dashboard-timeline"
          aria-label={effectiveSelectedCalendarIso ? '선택한 날짜 결과 발표' : '다가오는 발표'}
          aria-live="polite"
        >
          <h2 className="participation-dashboard-h2">
            {effectiveSelectedCalendarIso
              ? `${formatCalendarDayLabel(effectiveSelectedCalendarIso)} 결과 발표`
              : '가까운 발표 일정'}
          </h2>
          {effectiveSelectedCalendarIso ? (
            selectedCalendarRows.length === 0 ? (
              <p className="participation-dashboard-empty">
                이 날짜에 예정된 결과 발표가 없습니다.
              </p>
            ) : (
              <ul className="participation-timeline-list">
                {selectedCalendarRows.map((r) => {
                  const du = daysUntilAnnouncement(r.result_announcement_date, now)
                  const m = resolveMember(r.memberId)
                  return (
                    <li
                      key={`${r.memberId}-${r.source}-${r.id}-cal`}
                      className="participation-timeline-item"
                    >
                      <div className="participation-timeline-date">
                        {formatParticipationDateTable(r.result_announcement_date)}
                        {du != null && du >= 0 ? (
                          <span
                            className={
                              du <= 3
                                ? 'participation-timeline-dd participation-timeline-dd--hot'
                                : 'participation-timeline-dd'
                            }
                          >
                            D-{du}
                          </span>
                        ) : null}
                      </div>
                      <div className="participation-timeline-body">
                        <div className="participation-timeline-title">{r.title || '(제목 없음)'}</div>
                        <div className="participation-timeline-sub">
                          {r.memberNickname}
                          {r.result_announcement_method
                            ? ` · ${r.result_announcement_method}`
                            : ''}
                        </div>
                      </div>
                      {m ? (
                        <button
                          type="button"
                          className="btn btn-outline participation-timeline-open"
                          onClick={() => onOpenContest(m, r)}
                        >
                          보기
                        </button>
                      ) : null}
                    </li>
                  )
                })}
              </ul>
            )
          ) : timeline.length === 0 ? (
            <p className="participation-dashboard-empty">
              예정된 결과 발표일이 없거나 이미 지났습니다. 달력에서 날짜를 선택하면 해당 일 발표를 볼 수
              있습니다.
            </p>
          ) : (
            <ul className="participation-timeline-list">
              {timeline.map((r) => {
                const du = daysUntilAnnouncement(r.result_announcement_date, now)
                const m = resolveMember(r.memberId)
                return (
                  <li key={`${r.memberId}-${r.source}-${r.id}-tl`} className="participation-timeline-item">
                    <div className="participation-timeline-date">
                      {formatParticipationDateTable(r.result_announcement_date)}
                      {du != null && du >= 0 ? (
                        <span className={du <= 3 ? 'participation-timeline-dd participation-timeline-dd--hot' : 'participation-timeline-dd'}>
                          D-{du}
                        </span>
                      ) : null}
                    </div>
                    <div className="participation-timeline-body">
                      <div className="participation-timeline-title">{r.title || '(제목 없음)'}</div>
                      <div className="participation-timeline-sub">
                        {r.memberNickname}
                        {r.result_announcement_method ? ` · ${r.result_announcement_method}` : ''}
                      </div>
                    </div>
                    {m ? (
                      <button
                        type="button"
                        className="btn btn-outline participation-timeline-open"
                        onClick={() => onOpenContest(m, r)}
                      >
                        보기
                      </button>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        <section className="participation-dashboard-calendar" aria-label="결과 발표일 달력">
          <div className="participation-mini-cal-nav">
            <button
              type="button"
              className="participation-mini-cal-nav-btn"
              onClick={goPrevCalendarMonth}
              disabled={!canPrevCalendarMonth}
              aria-label="이전 달"
            >
              ‹
            </button>
            <h2 className="participation-dashboard-h2 participation-mini-cal-nav-title">
              {calendarGrid.label}
            </h2>
            <button
              type="button"
              className="participation-mini-cal-nav-btn"
              onClick={goNextCalendarMonth}
              disabled={!canNextCalendarMonth}
              aria-label="다음 달"
            >
              ›
            </button>
          </div>
          <div className="participation-mini-cal">
            <div className="participation-mini-cal-weekdays">
              {['월', '화', '수', '목', '금', '토', '일'].map((w) => (
                <span key={w}>{w}</span>
              ))}
            </div>
            <div className="participation-mini-cal-cells" role="grid">
              {calendarGrid.cells.map((c, i) =>
                c.day == null ? (
                  <span key={`e-${i}`} className="participation-mini-cal-cell participation-mini-cal-cell--empty" />
                ) : (
                  <button
                    key={c.iso || i}
                    type="button"
                    className={
                      'participation-mini-cal-cell participation-mini-cal-cell--btn' +
                      (c.mark ? ' participation-mini-cal-cell--mark' : '') +
                      (c.isToday ? ' participation-mini-cal-cell--today' : '') +
                      (c.iso === effectiveSelectedCalendarIso
                        ? ' participation-mini-cal-cell--selected'
                        : '')
                    }
                    aria-pressed={c.iso === effectiveSelectedCalendarIso}
                    aria-label={
                      c.isToday && c.mark
                        ? `${c.day}일, 오늘, 결과 발표 ${effectiveSelectedCalendarIso === c.iso ? '선택됨' : '선택'}`
                        : c.isToday
                          ? `${c.day}일, 오늘${effectiveSelectedCalendarIso === c.iso ? ', 선택됨' : ''}`
                          : c.mark
                            ? `${c.day}일, 결과 발표 ${effectiveSelectedCalendarIso === c.iso ? '선택됨' : '선택'}`
                            : `${c.day}일${effectiveSelectedCalendarIso === c.iso ? ', 선택됨' : ''}`
                    }
                    title={
                      c.isToday && c.mark
                        ? '오늘 · 결과 발표일 있음'
                        : c.isToday
                          ? '오늘'
                          : c.mark
                            ? '결과 발표일 있음'
                            : undefined
                    }
                    onClick={() =>
                      setSelectedCalendarIso((prev) => (prev === c.iso ? null : c.iso))
                    }
                  >
                    {c.day}
                  </button>
                ),
              )}
            </div>
          </div>
          <p className="participation-mini-cal-legend">
            날짜를 누르면 왼쪽에 해당 일 발표 목록이 표시됩니다. 테두리 강조 = 오늘 · 보라 배경 = 결과
            발표일
          </p>
        </section>
      </div>

      <div className="participation-dashboard-lifecycle-filter" role="group" aria-label="진행 상태 필터">
        <span className="participation-dashboard-lifecycle-filter-label">진행 상태</span>
        <div className="participation-scope-toggle">
          {(
            [
              ['all', '전체'],
              ['ongoing', '진행중'],
              ['ended', '종료'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={lifecycleFilter === value ? 'active' : ''}
              onClick={() => {
                setLifecycleFilter(value)
                setIncompleteMemberIdFilter('')
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {incompleteRows.length > 0 ? (
        <ParticipationIncompleteDetailsBlock
          key={`${incompleteMemberIdFilter}:${dashboardYear}:${lifecycleFilter}`}
          incompleteRows={incompleteRows}
          incompleteFilteredRows={incompleteFilteredRows}
          incompleteMemberOptions={incompleteMemberOptions}
          effectiveIncompleteMemberIdFilter={effectiveIncompleteMemberIdFilter}
          onMemberFilterChange={setIncompleteMemberIdFilter}
          members={members}
          onOpenContest={onOpenContest}
          now={now}
        />
      ) : null}

      <ParticipationHistoryTableBlock
        key={`${tableFilter}:${scopeFilter}:${dashboardYear}:${lifecycleFilter}`}
        tableRows={tableRows}
        tableFilter={tableFilter}
        scopeFilter={scopeFilter}
        setTableFilter={setTableFilter}
        setScopeFilter={setScopeFilter}
        now={now}
        members={members}
        onOpenContest={onOpenContest}
      />
    </div>
  )
}
