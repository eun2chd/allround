import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useConfirm } from '../context/ConfirmContext'
import { PaginationBar } from '../components/common/PaginationBar'
import { useAdminOutletContext } from '../components/admin/adminLayoutContext'
import { appToast } from '../lib/appToast'
import {
  deleteExpEventAndAdjustProfile,
  deleteExpRewardOverride,
  fetchExpRewardConfigForAdmin,
  reconcileProfileTotalExpFromEvents,
  adminApplyExpDelta,
  upsertExpRewardConfig,
  type ExpEventPrimaryKey,
  type ExpRewardConfigRow,
} from '../services/adminExpActionsService'
import {
  ADMIN_EXP_SUMMARY_MAX_ROWS,
  adminExpPeriodToSinceIso,
  fetchAdminExpEventList,
  fetchAdminExpMonitorSummary,
  type AdminExpActivitySummary,
  type AdminExpEventRow,
} from '../services/adminExpMonitorService'
import { EXP_ACTIVITY_LABELS, listExpActivitiesForUi } from '../services/expRewardsConfig'

type ExpTab = 'monitor' | 'balance' | 'manual'

function formatWhen(iso: string | null | undefined) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  } catch {
    return iso
  }
}

function eventRowKey(r: AdminExpEventRow): ExpEventPrimaryKey {
  return {
    user_id: r.user_id,
    activity_type: r.activity_type,
    source: r.source,
    contest_id: r.contest_id,
  }
}

function eventKeyString(r: AdminExpEventRow): string {
  const k = eventRowKey(r)
  return `${k.user_id}|${k.activity_type}|${k.source}|${k.contest_id}`
}

/** PostgreSQL integer(int4)는 약 ±21억까지. 큰 EXP는 DB bigint 마이그레이션 후 저장 가능. */
const EXP_UNIT_CHIPS: { label: string; value: number }[] = [
  { label: '1만', value: 10_000 },
  { label: '10만', value: 100_000 },
  { label: '100만', value: 1_000_000 },
  { label: '1억', value: 100_000_000 },
]

function addToExpNumericString(prev: string, delta: number): string {
  const raw = prev.replace(/,/g, '').trim()
  if (raw === '' || raw === '+' || raw === '-') {
    const sign = raw === '-' ? -1 : 1
    return String(sign * delta)
  }
  const n = Number(raw)
  if (!Number.isFinite(n)) return String(delta)
  const sum = Math.trunc(n) + Math.trunc(delta)
  if (!Number.isSafeInteger(sum)) return prev
  return String(sum)
}

function ExpUnitChipBar({ onAdd, dense }: { onAdd: (delta: number) => void; dense?: boolean }) {
  return (
    <div className={'admin-exp-unit-chips' + (dense ? ' admin-exp-unit-chips--dense' : '')} role="group" aria-label="금액 단위 더하기">
      {EXP_UNIT_CHIPS.map(({ label, value }) => (
        <button key={label} type="button" className="admin-exp-unit-chip" onClick={() => onAdd(value)}>
          +{label}
        </button>
      ))}
    </div>
  )
}

export function AdminExpPage() {
  const ctx = useAdminOutletContext()
  const me = ctx?.me
  const confirm = useConfirm()

  const [tab, setTab] = useState<ExpTab>('monitor')

  const [period, setPeriod] = useState<'1d' | '7d' | '30d' | 'all'>('7d')
  const [activityFilter, setActivityFilter] = useState<string>('')
  const [page, setPage] = useState(1)
  const pageSize = 40

  const [loading, setLoading] = useState(true)
  const [summaries, setSummaries] = useState<AdminExpActivitySummary[]>([])
  const [summaryMeta, setSummaryMeta] = useState<{
    totalCount: number
    totalExp: number
    truncated: boolean
    scannedRows: number
  } | null>(null)
  const [rows, setRows] = useState<AdminExpEventRow[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [selectedExpKeys, setSelectedExpKeys] = useState<Set<string>>(() => new Set())
  const [bulkDeleteBusy, setBulkDeleteBusy] = useState(false)
  const selectAllExpRef = useRef<HTMLInputElement>(null)

  const filterActivityOptions = useMemo(
    () => [
      ...listExpActivitiesForUi(),
      { activity_type: 'admin_grant', label: EXP_ACTIVITY_LABELS.admin_grant ?? '관리자', exp: 0 },
    ],
    [],
  )

  const loadMonitor = useCallback(async () => {
    setLoading(true)
    setSelectedExpKeys(new Set())
    const sinceIso = adminExpPeriodToSinceIso(period)
    const act = activityFilter.trim() || null
    try {
      const [s, l] = await Promise.all([
        fetchAdminExpMonitorSummary({ sinceIso, activityType: act }),
        fetchAdminExpEventList({ page, pageSize, sinceIso, activityType: act }),
      ])

      if (!s.ok) {
        appToast(s.error, 'error')
        setSummaries([])
        setSummaryMeta(null)
      } else {
        setSummaries(s.summaries)
        setSummaryMeta({
          totalCount: s.totalCount,
          totalExp: s.totalExp,
          truncated: s.truncated,
          scannedRows: s.scannedRows,
        })
      }

      if (!l.ok) {
        appToast(l.error, 'error')
        setRows([])
        setTotalCount(0)
      } else {
        setRows(l.rows)
        setTotalCount(l.totalCount)
      }
    } finally {
      setLoading(false)
    }
  }, [period, activityFilter, page, pageSize])

  useEffect(() => {
    if (tab !== 'monitor') return
    void loadMonitor()
  }, [tab, loadMonitor])

  useEffect(() => {
    const tp = Math.max(1, Math.ceil(totalCount / pageSize))
    if (page > tp) setPage(tp)
  }, [totalCount, pageSize, page])

  const [balanceRows, setBalanceRows] = useState<ExpRewardConfigRow[]>([])
  const [balanceInputs, setBalanceInputs] = useState<Record<string, string>>({})
  const [balanceLoading, setBalanceLoading] = useState(false)
  const [balanceSaving, setBalanceSaving] = useState<string | null>(null)

  const loadBalance = useCallback(async () => {
    setBalanceLoading(true)
    try {
      const r = await fetchExpRewardConfigForAdmin()
      if (!r.ok) {
        appToast(r.error, 'error')
        setBalanceRows([])
        setBalanceInputs({})
        return
      }
      setBalanceRows(r.rows)
      const inputs: Record<string, string> = {}
      for (const row of r.rows) {
        const eff = row.dbExp != null ? row.dbExp : row.defaultExp
        inputs[row.activity_type] = String(eff)
      }
      setBalanceInputs(inputs)
    } finally {
      setBalanceLoading(false)
    }
  }, [])

  useEffect(() => {
    if (tab === 'balance') void loadBalance()
  }, [tab, loadBalance])

  const [manualNickname, setManualNickname] = useState('')
  const [manualDelta, setManualDelta] = useState('')
  const [manualNote, setManualNote] = useState('')
  const [manualBusy, setManualBusy] = useState(false)

  const [syncNickname, setSyncNickname] = useState('')
  const [syncBusy, setSyncBusy] = useState(false)

  const allExpOnPageSelected = rows.length > 0 && rows.every((r) => selectedExpKeys.has(eventKeyString(r)))
  const someExpOnPageSelected = rows.some((r) => selectedExpKeys.has(eventKeyString(r)))

  useEffect(() => {
    const el = selectAllExpRef.current
    if (!el) return
    el.indeterminate = someExpOnPageSelected && !allExpOnPageSelected
  }, [someExpOnPageSelected, allExpOnPageSelected])

  const toggleExpRowSelect = (r: AdminExpEventRow) => {
    const k = eventKeyString(r)
    setSelectedExpKeys((prev) => {
      const next = new Set(prev)
      if (next.has(k)) next.delete(k)
      else next.add(k)
      return next
    })
  }

  const toggleSelectAllExpOnPage = () => {
    const pageKeys = rows.map(eventKeyString)
    setSelectedExpKeys((prev) => {
      const next = new Set(prev)
      const allOnPage = pageKeys.length > 0 && pageKeys.every((pk) => next.has(pk))
      if (allOnPage) {
        for (const pk of pageKeys) next.delete(pk)
      } else {
        for (const pk of pageKeys) next.add(pk)
      }
      return next
    })
  }

  const onDeleteSelectedExpEvents = async () => {
    const picked = rows.filter((r) => selectedExpKeys.has(eventKeyString(r)))
    if (!picked.length) {
      appToast('삭제할 기록을 선택하세요.', 'error')
      return
    }
    const preview = picked
      .slice(0, 6)
      .map((r) => `${r.activity_label} ${r.exp_amount >= 0 ? '+' : ''}${r.exp_amount.toLocaleString('ko-KR')}`)
      .join(', ')
    const more = picked.length > 6 ? ` 외 ${picked.length - 6}건` : ''
    const ok = await confirm({
      title: '경험치 기록 삭제',
      message: `선택한 ${picked.length}건을 삭제하고 프로필 EXP를 되돌릴까요? (되돌릴 EXP가 현재 누적보다 크면 0까지로 맞춥니다.)\n\n${preview}${more}`,
      confirmText: '삭제',
      danger: true,
    })
    if (!ok) return
    setBulkDeleteBusy(true)
    try {
      for (const r of picked) {
        const res = await deleteExpEventAndAdjustProfile(eventRowKey(r))
        if (!res.ok) {
          appToast(res.error, 'error')
          return
        }
      }
      appToast(`${picked.length}건 삭제했습니다.`)
      setSelectedExpKeys(new Set())
      void loadMonitor()
    } finally {
      setBulkDeleteBusy(false)
    }
  }

  const onSaveBalanceRow = async (activity_type: string) => {
    const raw = balanceInputs[activity_type]?.trim()
    const n = raw != null && raw !== '' ? Number(raw) : NaN
    if (!Number.isFinite(n) || n < 0) {
      appToast('0 이상의 숫자를 입력하세요.', 'error')
      return
    }
    setBalanceSaving(activity_type)
    try {
      const res = await upsertExpRewardConfig(activity_type, n)
      if (!res.ok) {
        appToast(res.error, 'error')
        return
      }
      appToast('저장했습니다.')
      void loadBalance()
    } finally {
      setBalanceSaving(null)
    }
  }

  const onClearBalanceOverride = async (activity_type: string) => {
    const ok = await confirm({
      title: '기본값으로 되돌리기',
      message: 'DB 오버라이드를 삭제하고 코드 기본 보상으로 되돌릴까요?',
      confirmText: '되돌리기',
    })
    if (!ok) return
    setBalanceSaving(activity_type)
    try {
      const res = await deleteExpRewardOverride(activity_type)
      if (!res.ok) {
        appToast(res.error, 'error')
        return
      }
      appToast('오버라이드를 제거했습니다.')
      void loadBalance()
    } finally {
      setBalanceSaving(null)
    }
  }

  const onManualSubmit = async (e: FormEvent) => {
    e.preventDefault()
    const delta = Number(manualDelta)
    if (!Number.isFinite(delta) || delta === 0) {
      appToast('0이 아닌 숫자를 입력하세요.', 'error')
      return
    }
    setManualBusy(true)
    try {
      const res = await adminApplyExpDelta({
        userId: manualNickname,
        deltaExp: Math.trunc(delta),
        note: manualNote,
      })
      if (!res.ok) {
        appToast(res.error, 'error')
        return
      }
      appToast('반영했습니다.')
      setManualDelta('')
      setManualNote('')
      if (tab === 'monitor') void loadMonitor()
    } finally {
      setManualBusy(false)
    }
  }

  const onReconcile = async (e: FormEvent) => {
    e.preventDefault()
    const ok = await confirm({
      title: 'EXP 재계산',
      message:
        '해당 사용자의 exp_events 금액을 모두 합산해 profiles.total_exp를 덮어씁니다. 수동으로만 바꾼 누적이 있다면 사라질 수 있습니다. 진행할까요?',
      confirmText: '동기화',
      danger: true,
    })
    if (!ok) return
    setSyncBusy(true)
    try {
      const res = await reconcileProfileTotalExpFromEvents(syncNickname)
      if (!res.ok) {
        appToast(res.error, 'error')
        return
      }
      appToast(`동기화 완료: 합계 ${res.sum.toLocaleString('ko-KR')} EXP`)
      if (tab === 'monitor') void loadMonitor()
    } finally {
      setSyncBusy(false)
    }
  }

  if (!ctx || !me) {
    return null
  }

  return (
    <div className="content-route-wrap admin-exp-page">
      <div className="content-page content-page--wide">
        <header className="content-page-header admin-users-header">
          <div>
            <h1>
              경험치 <span>관리</span>
            </h1>
            <p className="admin-dashboard-lead">
              지급 기록 모니터링에서는 행을 체크한 뒤 <strong>선택 삭제</strong>로 지울 수 있습니다. 행위별 보상(밸런스) 수정, 관리자 수동 지급·차감·동기화를 한 화면에서 처리합니다. DB에{' '}
              <code className="admin-exp-inline-code">exp_reward_config</code> 마이그레이션과{' '}
              <code className="admin-exp-inline-code">admin_grant</code> 타입이 적용되어 있어야 일부 기능이 동작합니다.               아주 큰 EXP(약 21억 초과)는 DB 컬럼이 <code className="admin-exp-inline-code">bigint</code>여야 합니다. 배포 시{' '}
              <code className="admin-exp-inline-code">20260429_exp_amount_columns_bigint</code> 마이그레이션을 적용하세요.
            </p>
          </div>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              if (tab === 'monitor') void loadMonitor()
              if (tab === 'balance') void loadBalance()
            }}
            disabled={loading || balanceLoading}
          >
            새로고침
          </button>
        </header>

        <div className="admin-exp-tabs" role="tablist" aria-label="경험치 관리 구역">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'monitor'}
            className={'admin-exp-tab' + (tab === 'monitor' ? ' is-active' : '')}
            onClick={() => setTab('monitor')}
          >
            모니터링
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'balance'}
            className={'admin-exp-tab' + (tab === 'balance' ? ' is-active' : '')}
            onClick={() => setTab('balance')}
          >
            보상 밸런스
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'manual'}
            className={'admin-exp-tab' + (tab === 'manual' ? ' is-active' : '')}
            onClick={() => setTab('manual')}
          >
            수동 지급·동기화
          </button>
        </div>

        {tab === 'monitor' ? (
          <>
            <div className="admin-exp-toolbar">
              <label className="admin-exp-filter">
                <span className="admin-exp-filter-label">기간</span>
                <select
                  className="admin-exp-select"
                  value={period}
                  onChange={(e) => {
                    setPeriod(e.target.value as typeof period)
                    setPage(1)
                  }}
                  aria-label="기간"
                >
                  <option value="1d">오늘</option>
                  <option value="7d">최근 7일</option>
                  <option value="30d">최근 30일</option>
                  <option value="all">전체</option>
                </select>
              </label>
              <label className="admin-exp-filter">
                <span className="admin-exp-filter-label">행위 유형</span>
                <select
                  className="admin-exp-select"
                  value={activityFilter}
                  onChange={(e) => {
                    setActivityFilter(e.target.value)
                    setPage(1)
                  }}
                  aria-label="행위 유형"
                >
                  <option value="">전체</option>
                  {filterActivityOptions.map((a) => (
                    <option key={a.activity_type} value={a.activity_type}>
                      {a.label}
                      {a.exp > 0 ? ` (기본 ${a.exp} EXP)` : ''}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {summaryMeta ? (
              <div className="admin-exp-summary-band">
                <div className="admin-exp-summary-total">
                  <span className="admin-exp-summary-total-label">선택 구간 합계</span>
                  <strong className="admin-exp-summary-total-value">
                    {summaryMeta.totalCount.toLocaleString('ko-KR')}건 ·{' '}
                    {summaryMeta.totalExp.toLocaleString('ko-KR')} EXP
                  </strong>
                  {summaryMeta.truncated ? (
                    <p className="admin-exp-summary-note">
                      집계는 최신 순 최대 {ADMIN_EXP_SUMMARY_MAX_ROWS.toLocaleString('ko-KR')}건까지만 반영했습니다. 더 많은 데이터가 있을 수
                      있습니다.
                    </p>
                  ) : null}
                </div>
                {summaries.length > 0 ? (
                  <ul className="admin-exp-summary-grid">
                    {summaries.map((s) => (
                      <li key={s.activity_type} className="admin-exp-summary-card">
                        <span className="admin-exp-summary-card-label">{s.label}</span>
                        <span className="admin-exp-summary-card-count">{s.count.toLocaleString('ko-KR')}건</span>
                        <span className="admin-exp-summary-card-exp">+{s.totalExp.toLocaleString('ko-KR')} EXP</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="admin-exp-summary-empty">이 조건에 해당하는 경험치 지급 기록이 없습니다.</p>
                )}
              </div>
            ) : null}

            <div className="admin-users-toolbar admin-exp-list-toolbar">
              <span className="admin-users-count">
                목록 {totalCount.toLocaleString('ko-KR')}건 · {pageSize}건씩
              </span>
              {!loading && rows.length > 0 ? (
                <button
                  type="button"
                  className="btn-secondary btn-delete"
                  disabled={bulkDeleteBusy || selectedExpKeys.size === 0}
                  onClick={() => void onDeleteSelectedExpEvents()}
                >
                  {bulkDeleteBusy ? '처리 중…' : `선택 삭제${selectedExpKeys.size > 0 ? ` (${selectedExpKeys.size})` : ''}`}
                </button>
              ) : null}
            </div>

            <div className="admin-users-table-wrap admin-exp-table-wrap">
              {loading ? (
                <p className="admin-users-state">불러오는 중…</p>
              ) : rows.length === 0 ? (
                <p className="admin-users-state">표시할 기록이 없습니다.</p>
              ) : (
                <table className="admin-users-table admin-exp-table">
                  <thead>
                    <tr>
                      <th scope="col" className="admin-level-col-check">
                        <span className="visually-hidden">선택</span>
                        <input
                          ref={selectAllExpRef}
                          type="checkbox"
                          className="admin-level-config-check"
                          checked={allExpOnPageSelected}
                          onChange={toggleSelectAllExpOnPage}
                          disabled={loading || rows.length === 0 || bulkDeleteBusy}
                          title="이 페이지 전체 선택"
                          aria-label="이 페이지 전체 선택"
                        />
                      </th>
                      <th scope="col" className="admin-users-col-no">
                        No
                      </th>
                      <th scope="col">일시</th>
                      <th scope="col">닉네임</th>
                      <th scope="col">행위</th>
                      <th scope="col" className="admin-exp-col-num">
                        EXP
                      </th>
                      <th scope="col">소스</th>
                      <th scope="col">공모전 ID</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => {
                      const dk = eventKeyString(r)
                      const rowNo = (page - 1) * pageSize + i + 1
                      return (
                        <tr key={`${r.user_id}-${r.activity_type}-${r.source}-${r.contest_id}-${r.created_at}-${i}`}>
                          <td className="admin-level-col-check">
                            <input
                              type="checkbox"
                              className="admin-level-config-check"
                              checked={selectedExpKeys.has(dk)}
                              onChange={() => toggleExpRowSelect(r)}
                              disabled={bulkDeleteBusy}
                              aria-label={`${r.activity_label} 기록 선택`}
                            />
                          </td>
                          <td className="admin-users-col-no">{rowNo}</td>
                          <td className="admin-exp-cell-muted">{formatWhen(r.created_at)}</td>
                          <td>
                            <Link to={`/admin/users/${r.user_id}`} className="admin-users-nick-link">
                              {r.nickname || '—'}
                            </Link>
                          </td>
                          <td>{r.activity_label}</td>
                          <td className="admin-exp-col-num admin-users-exp">
                            {r.exp_amount >= 0 ? '+' : ''}
                            {r.exp_amount.toLocaleString('ko-KR')}
                          </td>
                          <td className="admin-exp-cell-code">{r.source || '—'}</td>
                          <td className="admin-exp-cell-code">{r.contest_id || '—'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>

            {!loading ? (
              <div className="admin-exp-pagination-bar-wrap">
                <PaginationBar total={totalCount} page={page} pageSize={pageSize} onGo={setPage} />
              </div>
            ) : null}
          </>
        ) : null}

        {tab === 'balance' ? (
          <div className="admin-exp-panel">
            <p className="admin-exp-panel-lead">
              공모전·마이페이지에서 자동 지급될 때 사용하는 행위별 EXP입니다. 값을 저장하면 <strong>exp_reward_config</strong>에 기록되며,
              약 30초 캐시 후 반영됩니다.
            </p>
            {balanceLoading ? (
              <p className="admin-users-state">불러오는 중…</p>
            ) : balanceRows.length === 0 ? (
              <p className="admin-users-state">설정을 불러오지 못했습니다. 마이그레이션과 RLS(관리자 쓰기)를 확인하세요.</p>
            ) : (
              <div className="admin-exp-balance-table-wrap">
                <table className="admin-users-table admin-exp-balance-table">
                  <thead>
                    <tr>
                      <th scope="col">행위</th>
                      <th scope="col">코드 기본값</th>
                      <th scope="col">적용 EXP</th>
                      <th scope="col">상태</th>
                      <th scope="col">작업</th>
                    </tr>
                  </thead>
                  <tbody>
                    {balanceRows.map((row) => {
                      const busy = balanceSaving === row.activity_type
                      return (
                        <tr key={row.activity_type}>
                          <td>
                            <span className="admin-exp-balance-label">{row.label}</span>
                            <span className="admin-exp-balance-key">{row.activity_type}</span>
                          </td>
                          <td>{row.defaultExp.toLocaleString('ko-KR')}</td>
                          <td>
                            <div className="admin-exp-input-stack">
                              <input
                                type="number"
                                min={0}
                                className="admin-exp-balance-input"
                                value={balanceInputs[row.activity_type] ?? ''}
                                onChange={(e) =>
                                  setBalanceInputs((prev) => ({ ...prev, [row.activity_type]: e.target.value }))
                                }
                                aria-label={`${row.label} EXP`}
                              />
                              <ExpUnitChipBar
                                dense
                                onAdd={(v) =>
                                  setBalanceInputs((prev) => {
                                    const cur = prev[row.activity_type] ?? ''
                                    const next = addToExpNumericString(cur, v)
                                    if (next === cur && cur.trim() !== '') appToast('합이 너무 커서 더할 수 없습니다.', 'error')
                                    return { ...prev, [row.activity_type]: next }
                                  })
                                }
                              />
                            </div>
                          </td>
                          <td>{row.dbExp != null ? <span className="admin-exp-override-pill">DB 오버라이드</span> : '코드 기본'}</td>
                          <td>
                            <div className="admin-exp-balance-actions">
                              <button
                                type="button"
                                className="btn-secondary"
                                disabled={busy}
                                onClick={() => void onSaveBalanceRow(row.activity_type)}
                              >
                                저장
                              </button>
                              {row.dbExp != null ? (
                                <button
                                  type="button"
                                  className="btn-secondary"
                                  disabled={busy}
                                  onClick={() => void onClearBalanceOverride(row.activity_type)}
                                >
                                  기본값
                                </button>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : null}

        {tab === 'manual' ? (
          <div className="admin-exp-panel">
            <form className="admin-exp-manual-form" onSubmit={onManualSubmit}>
              <h2 className="admin-exp-panel-subtitle">수동 지급·차감</h2>
              <p className="admin-exp-panel-lead">
                <code>admin_grant</code> 이벤트를 남기고 프로필 EXP를 조정합니다. 차감은 음수로 입력하세요.
              </p>
              <label className="admin-exp-manual-field">
                <span>닉네임</span>
                <input
                  type="text"
                  className="admin-exp-manual-input"
                  value={manualNickname}
                  onChange={(e) => setManualNickname(e.target.value)}
                  placeholder="프로필에 표시되는 닉네임"
                  autoComplete="off"
                  required
                />
              </label>
              <label className="admin-exp-manual-field">
                <span>EXP 변화 (+ 지급 / − 차감)</span>
                <input
                  type="number"
                  className="admin-exp-manual-input"
                  value={manualDelta}
                  onChange={(e) => setManualDelta(e.target.value)}
                  placeholder="예: 100 또는 -50"
                  required
                />
                <ExpUnitChipBar
                  onAdd={(v) =>
                    setManualDelta((prev) => {
                      const next = addToExpNumericString(prev, v)
                      if (next === prev) appToast('합이 너무 커서 더할 수 없습니다.', 'error')
                      return next
                    })
                  }
                />
                <span className="admin-exp-unit-chips-hint">버튼은 현재 입력값에 해당 만·억 단위를 더합니다.</span>
              </label>
              <label className="admin-exp-manual-field">
                <span>메모 (선택, 공모전 ID 접두에 반영)</span>
                <input
                  type="text"
                  className="admin-exp-manual-input"
                  value={manualNote}
                  onChange={(e) => setManualNote(e.target.value)}
                  placeholder="이벤트 보상, 오지급 정정 등"
                  autoComplete="off"
                />
              </label>
              <button type="submit" className="btn-secondary" disabled={manualBusy}>
                {manualBusy ? '처리 중…' : '반영'}
              </button>
            </form>

            <form className="admin-exp-manual-form admin-exp-sync-form" onSubmit={onReconcile}>
              <h2 className="admin-exp-panel-subtitle">이벤트 합계로 프로필 동기화</h2>
              <p className="admin-exp-panel-lead">
                해당 유저의 모든 <code>exp_events.exp_amount</code> 합을 구해 <code>profiles.total_exp</code>를 덮어씁니다.
              </p>
              <label className="admin-exp-manual-field">
                <span>닉네임</span>
                <input
                  type="text"
                  className="admin-exp-manual-input"
                  value={syncNickname}
                  onChange={(e) => setSyncNickname(e.target.value)}
                  placeholder="프로필에 표시되는 닉네임"
                  autoComplete="off"
                  required
                />
              </label>
              <button type="submit" className="btn-secondary" disabled={syncBusy}>
                {syncBusy ? '처리 중…' : '동기화 실행'}
              </button>
            </form>
          </div>
        ) : null}
      </div>
    </div>
  )
}
