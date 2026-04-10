import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { participationRowTouchesYear } from '../../features/participation/participationRowYear'
import { normalizePrizeSettlement, PRIZE_SETTLEMENT_STATUSES } from '../../features/participation/prizeSettlement'
import { parseDdayDays } from '../../services/contestDashboardSummaryService'
import type { TeamMemberContest, TeamMemberOverview } from '../../services/teamParticipationService'
import { TeamPrizeVault, type PrizeVaultProgress } from './TeamPrizeVault'

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

function formatDateShort(iso: string | null | undefined): string {
  if (!iso) return '—'
  const s = String(iso).slice(0, 10)
  if (s.length < 10) return iso
  const [, m, day] = s.split('-')
  return `${m}.${day}`
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

function isRowEnded(r: DashboardFlatRow, startToday: number): boolean {
  if (r.result_announcement_date) {
    const t = new Date(`${String(r.result_announcement_date).slice(0, 10)}T12:00:00`).getTime()
    if (!Number.isNaN(t) && t < startToday) return true
  }
  const st = r.participation_status || ''
  if (st === '수상' || st === '미수상' || st === '취소') return true
  return false
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
  const [incompleteMemberIdFilter, setIncompleteMemberIdFilter] = useState('')

  const flat = useMemo(() => flattenMembers(members), [members])
  const flatFiltered = useMemo(
    () => flat.filter((r) => rowTouchesYear(r, dashboardYear)),
    [flat, dashboardYear],
  )
  const now = useMemo(() => new Date(), [])
  const startToday = startOfToday(now)
  const viewIsCalendarYear = dashboardYear === now.getFullYear()

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

  const incompleteRows = useMemo(() => {
    return flatFiltered
      .filter((r) => !r.has_detail)
      .sort((a, b) => {
        const ra = ddayRankForSort(a.d_day)
        const rb = ddayRankForSort(b.d_day)
        if (ra !== rb) return ra - rb
        return (a.title || '').localeCompare(b.title || '')
      })
  }, [flatFiltered])

  const incompleteMemberOptions = useMemo(() => {
    const byId = new Map<string, string>()
    for (const r of incompleteRows) {
      byId.set(r.memberId, r.memberNickname || '(닉네임 없음)')
    }
    return [...byId.entries()].sort((a, b) => a[1].localeCompare(b[1], 'ko'))
  }, [incompleteRows])

  useEffect(() => {
    if (
      incompleteMemberIdFilter &&
      !incompleteMemberOptions.some(([id]) => id === incompleteMemberIdFilter)
    ) {
      setIncompleteMemberIdFilter('')
    }
  }, [incompleteMemberIdFilter, incompleteMemberOptions])

  const incompleteFilteredRows = useMemo(() => {
    if (!incompleteMemberIdFilter) return incompleteRows
    return incompleteRows.filter((r) => r.memberId === incompleteMemberIdFilter)
  }, [incompleteRows, incompleteMemberIdFilter])

  const incompleteFilterSelectValue = incompleteMemberOptions.some(
    ([id]) => id === incompleteMemberIdFilter,
  )
    ? incompleteMemberIdFilter
    : ''

  const prizeVaultSettlement = useMemo(() => {
    const counts = {
      미수령: 0,
      '수령 완료': 0,
      '팀 회식비 전환': 0,
    } as Record<(typeof PRIZE_SETTLEMENT_STATUSES)[number], number>
    let prizeEntryCount = 0
    for (const r of flatFiltered) {
      if (!r.has_prize) continue
      const amt = r.prize_amount != null ? Number(r.prize_amount) : 0
      if (amt <= 0) continue
      prizeEntryCount += 1
      const norm = normalizePrizeSettlement(r.prize_settlement_status) || '미수령'
      counts[norm] += 1
    }
    return { counts, prizeEntryCount }
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
    const mon = viewIsCalendarYear ? now.getMonth() : 0
    const set = new Set<string>()
    for (const r of flatFiltered) {
      if (!r.result_announcement_date) continue
      const s = String(r.result_announcement_date).slice(0, 10)
      const d = new Date(`${s}T12:00:00`)
      if (Number.isNaN(d.getTime())) continue
      if (d.getFullYear() === y && d.getMonth() === mon) set.add(s)
    }
    return set
  }, [flatFiltered, dashboardYear, viewIsCalendarYear, now])

  const todayIso = useMemo(() => {
    const y = now.getFullYear()
    const mon = now.getMonth()
    const d = now.getDate()
    return `${y}-${String(mon + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  }, [now])

  const calendarGrid = useMemo(() => {
    const y = dashboardYear
    const mon = viewIsCalendarYear ? now.getMonth() : 0
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
  }, [dashboardYear, viewIsCalendarYear, now, calendarMarks, todayIso])

  const tableRows = useMemo(() => {
    let list = flatFiltered.slice()
    if (scopeFilter === 'focus') {
      list = list.filter((r) => !isRowEnded(r, startToday))
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
  }, [flatFiltered, tableFilter, scopeFilter, startToday])

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
            onChange={(e) => onDashboardYearChange(Number(e.target.value))}
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
          onChange={(e) => onDashboardYearChange(Number(e.target.value))}
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
        prizeEntryCount={prizeVaultSettlement.prizeEntryCount}
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

      <div className="participation-dashboard-main-grid participation-dashboard-main-grid--top">
        <section className="participation-dashboard-timeline" aria-label="다가오는 발표">
          <h2 className="participation-dashboard-h2">가까운 발표 일정</h2>
          {timeline.length === 0 ? (
            <p className="participation-dashboard-empty">예정된 결과 발표일이 없거나 이미 지났습니다.</p>
          ) : (
            <ul className="participation-timeline-list">
              {timeline.map((r) => {
                const du = daysUntilAnnouncement(r.result_announcement_date, now)
                const m = resolveMember(r.memberId)
                return (
                  <li key={`${r.memberId}-${r.source}-${r.id}-tl`} className="participation-timeline-item">
                    <div className="participation-timeline-date">
                      {formatDateShort(r.result_announcement_date)}
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

        <section className="participation-dashboard-calendar" aria-label="이번 달 발표일">
          <h2 className="participation-dashboard-h2">{calendarGrid.label}</h2>
          <div className="participation-mini-cal">
            <div className="participation-mini-cal-weekdays">
              {['월', '화', '수', '목', '금', '토', '일'].map((w) => (
                <span key={w}>{w}</span>
              ))}
            </div>
            <div className="participation-mini-cal-cells">
              {calendarGrid.cells.map((c, i) =>
                c.day == null ? (
                  <span key={`e-${i}`} className="participation-mini-cal-cell participation-mini-cal-cell--empty" />
                ) : (
                  <span
                    key={c.iso || i}
                    className={
                      'participation-mini-cal-cell' +
                      (c.mark ? ' participation-mini-cal-cell--mark' : '') +
                      (c.isToday ? ' participation-mini-cal-cell--today' : '')
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
                  >
                    {c.day}
                  </span>
                ),
              )}
            </div>
          </div>
          <p className="participation-mini-cal-legend">
            테두리 강조 = 오늘 · 보라 배경 = 결과 발표일 (겹치면 둘 다 표시)
          </p>
        </section>
      </div>

      {incompleteRows.length > 0 ? (
        <details className="participation-incomplete-details">
          <summary className="participation-incomplete-summary">
            <span className="participation-incomplete-summary-title">상세 등록이 필요한 참가</span>
            <span className="participation-incomplete-summary-count">
              {incompleteMemberIdFilter
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
                value={incompleteFilterSelectValue}
                onChange={(e) => setIncompleteMemberIdFilter(e.target.value)}
              >
                <option value="">전체</option>
                {incompleteMemberOptions.map(([memberId, nickname]) => (
                  <option key={memberId} value={memberId}>
                    {nickname}
                  </option>
                ))}
              </select>
            </div>
            <div className="participation-incomplete-list">
              {incompleteFilteredRows.length === 0 ? (
                <p className="participation-incomplete-filter-empty">선택한 팀원에 해당하는 항목이 없습니다.</p>
              ) : null}
              {incompleteFilteredRows.map((r) => {
                const n = parseDdayDays(r.d_day)
                const urgent5 = n !== null && n !== -1 && n <= 5
                const urgent10 = n !== null && n !== -1 && n <= 10
                const m = resolveMember(r.memberId)
                return (
                  <div
                    key={`${r.memberId}-${r.source}-${r.id}`}
                    className={
                      'participation-incomplete-card' +
                      (urgent5 ? ' participation-incomplete-card--d5' : '') +
                      (!urgent5 && urgent10 ? ' participation-incomplete-card--d10' : '')
                    }
                  >
                    <div className="participation-incomplete-main">
                      <span className="participation-incomplete-dday">
                        {r.d_day?.trim() ? r.d_day : 'D-day —'}
                      </span>
                      <span className="participation-incomplete-title">{r.title || '(제목 없음)'}</span>
                    </div>
                    <div className="participation-incomplete-meta">
                      <span>{r.memberNickname}</span>
                      <span>·</span>
                      <span>{r.source || '요즘것들'}</span>
                    </div>
                    <div className="participation-incomplete-actions">
                      {m ? (
                        <button
                          type="button"
                          className="btn btn-outline participation-incomplete-btn"
                          onClick={() => onOpenContest(m, r)}
                        >
                          요약 보기
                        </button>
                      ) : null}
                      <Link
                        to={`/mypage/${encodeURIComponent(r.memberId)}#participationSection`}
                        className="btn btn-primary participation-incomplete-btn"
                      >
                        상세 등록하러 가기
                      </Link>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </details>
      ) : null}

      <section className="participation-dashboard-table-section" aria-label="전체 지원 이력">
        <div className="participation-dashboard-section-head participation-dashboard-table-head">
          <h2>전체 지원 이력</h2>
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
            <thead>
              <tr>
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
              {tableRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="participation-dashboard-table-empty">
                    조건에 맞는 행이 없습니다.
                  </td>
                </tr>
              ) : (
                tableRows.map((r) => {
                  const m = resolveMember(r.memberId)
                  const prize =
                    r.has_prize && r.prize_amount != null ? formatKrw(Number(r.prize_amount)) : '—'
                  const st = r.has_detail ? r.participation_status || '—' : '상세 미등록'
                  const du = daysUntilAnnouncement(r.result_announcement_date, now)
                  return (
                    <tr key={`${r.memberId}-${r.source}-${r.id}-tb`}>
                      <td className="participation-dt-title">{r.title || '—'}</td>
                      <td>{r.memberNickname}</td>
                      <td>{formatDateShort(r.participation_registered_at || r.submitted_at)}</td>
                      <td>
                        {formatDateShort(r.result_announcement_date)}
                        {du != null && du >= 0 ? (
                          <span className="participation-dt-dd"> (D-{du})</span>
                        ) : null}
                      </td>
                      <td>{prize}</td>
                      <td>
                        <span
                          className={
                            'participation-dt-status' +
                            (st === '상세 미등록' ? ' participation-dt-status--warn' : '')
                          }
                        >
                          {st}
                        </span>
                      </td>
                      <td className="participation-dt-actions">
                        {r.url ? (
                          <a href={r.url} target="_blank" rel="noreferrer" className="participation-dt-link">
                            원문
                          </a>
                        ) : null}
                        {r.document_filename ? (
                          <span className="participation-dt-doc" title={r.document_filename}>
                            첨부
                          </span>
                        ) : null}
                        {m ? (
                          <button
                            type="button"
                            className="participation-dt-link-btn"
                            onClick={() => onOpenContest(m, r)}
                          >
                            상세
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
