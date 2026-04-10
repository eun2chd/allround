import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useConfirm } from '../context/ConfirmContext'
import { useAdminOutletContext } from '../components/admin/adminLayoutContext'
import { PaginationBar } from '../components/common/PaginationBar'
import { appToast } from '../lib/appToast'
import {
  deleteLevelConfigRows,
  deleteLevelTiers,
  fetchLevelConfigPageForAdmin,
  fetchLevelTiersForAdmin,
  insertLevelConfigRow,
  insertLevelTier,
  updateLevelConfigRow,
  updateLevelTier,
  type LevelConfigAdminRow,
  type LevelTierRow,
} from '../services/adminLevelService'

const LEVEL_CONFIG_PAGE_SIZE = 10

function TierEditRow({
  row,
  onSaved,
  checked,
  onToggleCheck,
}: {
  row: LevelTierRow
  onSaved: () => void
  checked: boolean
  onToggleCheck: () => void
}) {
  const [tierName, setTierName] = useState(row.tier_name)
  const [levelMin, setLevelMin] = useState(String(row.level_min))
  const [levelMax, setLevelMax] = useState(row.level_max == null ? '' : String(row.level_max))
  const [expPer, setExpPer] = useState(String(row.exp_per_level))
  const [sort, setSort] = useState(String(row.sort_order))
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setTierName(row.tier_name)
    setLevelMin(String(row.level_min))
    setLevelMax(row.level_max == null ? '' : String(row.level_max))
    setExpPer(String(row.exp_per_level))
    setSort(String(row.sort_order))
  }, [row])

  const save = async () => {
    setBusy(true)
    try {
      const r = await updateLevelTier(row.tier_id, {
        tier_name: tierName,
        level_min: Number(levelMin) || 0,
        level_max: levelMax.trim() === '' ? null : Number(levelMax),
        exp_per_level: Number(expPer) || 0,
        sort_order: Number(sort) || 0,
      })
      if (!r.ok) {
        appToast(r.error, 'error')
        return
      }
      appToast('티어를 저장했습니다.')
      onSaved()
    } finally {
      setBusy(false)
    }
  }

  return (
    <tr>
      <td className="admin-level-col-check">
        <input
          type="checkbox"
          className="admin-level-config-check"
          checked={checked}
          onChange={onToggleCheck}
          aria-label={`티어 ${row.tier_id} 선택`}
        />
      </td>
      <td>{row.tier_id}</td>
      <td>
        <input className="admin-level-inline-input" value={tierName} onChange={(e) => setTierName(e.target.value)} />
      </td>
      <td>
        <input className="admin-level-inline-input admin-level-num" value={levelMin} onChange={(e) => setLevelMin(e.target.value)} />
      </td>
      <td>
        <input
          className="admin-level-inline-input admin-level-num"
          value={levelMax}
          onChange={(e) => setLevelMax(e.target.value)}
          placeholder="무제한은 비움"
        />
      </td>
      <td>
        <input className="admin-level-inline-input admin-level-num" value={expPer} onChange={(e) => setExpPer(e.target.value)} />
      </td>
      <td>
        <input className="admin-level-inline-input admin-level-num" value={sort} onChange={(e) => setSort(e.target.value)} />
      </td>
      <td>
        <button type="button" className="btn-secondary" disabled={busy} onClick={() => void save()}>
          {busy ? '…' : '저장'}
        </button>
      </td>
    </tr>
  )
}

export function AdminLevelPage() {
  const ctx = useAdminOutletContext()
  const confirm = useConfirm()

  const [tiers, setTiers] = useState<LevelTierRow[]>([])
  const [config, setConfig] = useState<LevelConfigAdminRow[]>([])
  const [configTotal, setConfigTotal] = useState(0)
  const [configMaxLevel, setConfigMaxLevel] = useState(0)
  const [configPage, setConfigPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [configPagingBusy, setConfigPagingBusy] = useState(false)
  const [newLevel, setNewLevel] = useState('')
  const [newExp, setNewExp] = useState('100')
  const [newTier, setNewTier] = useState('1')
  const [newBusy, setNewBusy] = useState(false)

  const [newTierMetaId, setNewTierMetaId] = useState('')
  const [newTierMetaName, setNewTierMetaName] = useState('')
  const [newTierMetaMin, setNewTierMetaMin] = useState('1')
  const [newTierMetaMax, setNewTierMetaMax] = useState('')
  const [newTierMetaExp, setNewTierMetaExp] = useState('100')
  const [newTierMetaSort, setNewTierMetaSort] = useState('1')
  const [tierNewBusy, setTierNewBusy] = useState(false)

  const [draftByLevel, setDraftByLevel] = useState<Record<number, { exp: string; tierId: string }>>({})
  const [selectedLevels, setSelectedLevels] = useState<Set<number>>(() => new Set())
  const [selectedTierIds, setSelectedTierIds] = useState<Set<number>>(() => new Set())
  const [bulkBusy, setBulkBusy] = useState(false)
  const [tierBulkBusy, setTierBulkBusy] = useState(false)
  const selectAllRef = useRef<HTMLInputElement>(null)
  const tierSelectAllRef = useRef<HTMLInputElement>(null)
  const skipConfigPageEffectOnce = useRef(true)
  const configPageRef = useRef(configPage)
  configPageRef.current = configPage

  const tierOptions = useMemo(() => {
    if (!tiers.length) return [1, 2, 3, 4, 5, 6]
    return [...tiers.map((t) => t.tier_id)].sort((a, b) => a - b)
  }, [tiers])

  useEffect(() => {
    if (!tierOptions.length) return
    setNewTier((prev) => {
      const n = Number(prev)
      return tierOptions.includes(n) ? prev : String(tierOptions[0])
    })
  }, [tierOptions])

  const freeTierSlots = useMemo(() => {
    const used = new Set(tiers.map((t) => t.tier_id))
    return [1, 2, 3, 4, 5, 6].filter((n) => !used.has(n))
  }, [tiers])

  const loadConfigPage = useCallback(async (page: number) => {
    const c = await fetchLevelConfigPageForAdmin({ page, pageSize: LEVEL_CONFIG_PAGE_SIZE })
    if (!c.ok) {
      appToast(c.error, 'error')
      setConfig([])
      setConfigTotal(0)
      setConfigMaxLevel(0)
      return
    }
    setConfig(c.rows)
    setConfigTotal(c.total)
    setConfigMaxLevel(c.maxLevel)
  }, [])

  const loadTiersOnly = useCallback(async () => {
    const t = await fetchLevelTiersForAdmin()
    if (!t.ok) {
      appToast(t.error, 'error')
      setTiers([])
    } else {
      setTiers(t.rows)
    }
  }, [])

  const refreshAll = useCallback(async () => {
    setLoading(true)
    setSelectedTierIds(new Set())
    try {
      await loadTiersOnly()
      await loadConfigPage(configPageRef.current)
    } finally {
      setLoading(false)
    }
  }, [loadTiersOnly, loadConfigPage])

  useEffect(() => {
    let dead = false
    ;(async () => {
      setLoading(true)
      setSelectedTierIds(new Set())
      try {
        const t = await fetchLevelTiersForAdmin()
        if (!dead && !t.ok) {
          appToast(t.error, 'error')
          setTiers([])
        } else if (!dead && t.ok) {
          setTiers(t.rows)
        }
        const c = await fetchLevelConfigPageForAdmin({ page: 1, pageSize: LEVEL_CONFIG_PAGE_SIZE })
        if (!dead && !c.ok) {
          appToast(c.error, 'error')
          setConfig([])
          setConfigTotal(0)
          setConfigMaxLevel(0)
        } else if (!dead && c.ok) {
          setConfig(c.rows)
          setConfigTotal(c.total)
          setConfigMaxLevel(c.maxLevel)
          setConfigPage(1)
        }
      } finally {
        if (!dead) setLoading(false)
      }
    })()
    return () => {
      dead = true
    }
  }, [])

  useEffect(() => {
    if (skipConfigPageEffectOnce.current) {
      skipConfigPageEffectOnce.current = false
      return
    }
    let dead = false
    ;(async () => {
      setConfigPagingBusy(true)
      try {
        const c = await fetchLevelConfigPageForAdmin({ page: configPage, pageSize: LEVEL_CONFIG_PAGE_SIZE })
        if (!dead && !c.ok) {
          appToast(c.error, 'error')
          setConfig([])
          setConfigTotal(0)
          setConfigMaxLevel(0)
        } else if (!dead && c.ok) {
          setConfig(c.rows)
          setConfigTotal(c.total)
          setConfigMaxLevel(c.maxLevel)
        }
      } finally {
        if (!dead) setConfigPagingBusy(false)
      }
    })()
    return () => {
      dead = true
    }
  }, [configPage])

  useEffect(() => {
    const next: Record<number, { exp: string; tierId: string }> = {}
    for (const r of config) {
      next[r.level] = { exp: String(r.exp_to_next), tierId: String(r.tier_id) }
    }
    setDraftByLevel(next)
    setSelectedLevels(new Set())
  }, [config])

  useEffect(() => {
    if (configMaxLevel > 0 && newLevel === '') {
      setNewLevel(String(configMaxLevel + 1))
    }
  }, [configMaxLevel, newLevel])

  useEffect(() => {
    const totalPages = Math.max(1, Math.ceil(configTotal / LEVEL_CONFIG_PAGE_SIZE) || 1)
    if (configPage > totalPages) setConfigPage(totalPages)
  }, [configTotal, configPage])

  useEffect(() => {
    const used = new Set(tiers.map((t) => t.tier_id))
    setNewTierMetaId((prev) => {
      const n = Number(prev)
      if (prev !== '' && Number.isFinite(n) && !used.has(n)) return prev
      const free = [1, 2, 3, 4, 5, 6].find((x) => !used.has(x))
      return free != null ? String(free) : ''
    })
  }, [tiers])

  const allSelected = config.length > 0 && selectedLevels.size === config.length
  const someSelected = selectedLevels.size > 0

  const allTiersSelected = tiers.length > 0 && tiers.every((t) => selectedTierIds.has(t.tier_id))
  const someTiersSelected = selectedTierIds.size > 0

  useEffect(() => {
    const el = selectAllRef.current
    if (!el) return
    el.indeterminate = someSelected && !allSelected
  }, [someSelected, allSelected])

  useEffect(() => {
    const el = tierSelectAllRef.current
    if (!el) return
    el.indeterminate = someTiersSelected && !allTiersSelected
  }, [someTiersSelected, allTiersSelected])

  const toggleLevelSelect = (level: number) => {
    setSelectedLevels((prev) => {
      const n = new Set(prev)
      if (n.has(level)) n.delete(level)
      else n.add(level)
      return n
    })
  }

  const toggleSelectAllLevels = () => {
    setSelectedLevels((prev) => {
      if (config.length > 0 && prev.size === config.length) return new Set()
      return new Set(config.map((r) => r.level))
    })
  }

  const toggleTierSelect = (tierId: number) => {
    setSelectedTierIds((prev) => {
      const n = new Set(prev)
      if (n.has(tierId)) n.delete(tierId)
      else n.add(tierId)
      return n
    })
  }

  const toggleSelectAllTiers = () => {
    setSelectedTierIds((prev) => {
      if (tiers.length > 0 && tiers.every((t) => prev.has(t.tier_id))) return new Set()
      return new Set(tiers.map((t) => t.tier_id))
    })
  }

  const setDraft = (level: number, patch: Partial<{ exp: string; tierId: string }>) => {
    setDraftByLevel((prev) => ({
      ...prev,
      [level]: { ...prev[level], exp: prev[level]?.exp ?? '', tierId: prev[level]?.tierId ?? '1', ...patch },
    }))
  }

  const onSaveSelected = async () => {
    const levels = [...selectedLevels].sort((a, b) => a - b)
    if (!levels.length) {
      appToast('저장할 행을 선택하세요.', 'error')
      return
    }
    setBulkBusy(true)
    try {
      for (const lv of levels) {
        const d = draftByLevel[lv]
        if (!d) continue
        const exp = Number(d.exp)
        const tid = Number(d.tierId)
        const r = await updateLevelConfigRow(lv, exp, tid)
        if (!r.ok) {
          appToast(`레벨 ${lv}: ${r.error}`, 'error')
          return
        }
      }
      appToast(`${levels.length}개 저장했습니다.`)
      void refreshAll()
    } finally {
      setBulkBusy(false)
    }
  }

  const onDeleteSelected = async () => {
    const levels = [...selectedLevels].sort((a, b) => a - b)
    if (!levels.length) {
      appToast('삭제할 행을 선택하세요.', 'error')
      return
    }
    const ok = await confirm({
      title: '레벨 행 삭제',
      message: `선택한 레벨 ${levels.length}개(레벨 번호: ${levels.slice(0, 12).join(', ')}${levels.length > 12 ? '…' : ''}) 행을 삭제할까요? 진행도 계산이 어긋날 수 있습니다.`,
      confirmText: '삭제',
      danger: true,
    })
    if (!ok) return
    setBulkBusy(true)
    try {
      const r = await deleteLevelConfigRows(levels)
      if (!r.ok) {
        appToast(r.error, 'error')
        return
      }
      appToast(`${r.deleted}개 삭제했습니다.`)
      void refreshAll()
    } finally {
      setBulkBusy(false)
    }
  }

  const addTierMeta = async () => {
    const tid = Number(newTierMetaId)
    if (!Number.isFinite(tid) || tid < 1 || tid > 6) {
      appToast('tier_id를 선택하세요.', 'error')
      return
    }
    setTierNewBusy(true)
    try {
      const r = await insertLevelTier({
        tier_id: tid,
        tier_name: newTierMetaName,
        level_min: Number(newTierMetaMin) || 0,
        level_max: newTierMetaMax.trim() === '' ? null : Number(newTierMetaMax),
        exp_per_level: Number(newTierMetaExp) || 0,
        sort_order: Number(newTierMetaSort) || 0,
      })
      if (!r.ok) {
        appToast(r.error, 'error')
        return
      }
      appToast('티어를 등록했습니다.')
      setNewTierMetaName('')
      void refreshAll()
    } finally {
      setTierNewBusy(false)
    }
  }

  const onDeleteSelectedTiers = async () => {
    const ids = [...selectedTierIds].sort((a, b) => a - b)
    if (!ids.length) {
      appToast('삭제할 티어를 선택하세요.', 'error')
      return
    }
    const picked = tiers.filter((t) => selectedTierIds.has(t.tier_id))
    const preview = picked
      .slice(0, 8)
      .map((t) => `${t.tier_name} (${t.tier_id})`)
      .join(', ')
    const more = picked.length > 8 ? ` 외 ${picked.length - 8}개` : ''
    const ok = await confirm({
      title: '티어 메타 삭제',
      message: `선택한 ${ids.length}개 티어(level_tiers 행)를 삭제할까요? level_config에서 참조 중이면 삭제되지 않습니다.\n\n${preview}${more}`,
      confirmText: '삭제',
      danger: true,
    })
    if (!ok) return
    setTierBulkBusy(true)
    try {
      const r = await deleteLevelTiers(ids)
      if (!r.ok) {
        appToast(r.error, 'error')
        return
      }
      appToast(`${r.deleted}개 삭제했습니다.`)
      void refreshAll()
    } finally {
      setTierBulkBusy(false)
    }
  }

  const addLevel = async () => {
    const lv = Number(newLevel)
    const exp = Number(newExp)
    const tid = Number(newTier)
    setNewBusy(true)
    try {
      const r = await insertLevelConfigRow(lv, exp, tid)
      if (!r.ok) {
        appToast(r.error, 'error')
        return
      }
      appToast('레벨 행을 추가했습니다.')
      await loadTiersOnly()
      const meta = await fetchLevelConfigPageForAdmin({ page: 1, pageSize: LEVEL_CONFIG_PAGE_SIZE })
      if (meta.ok) {
        setConfigTotal(meta.total)
        setConfigMaxLevel(meta.maxLevel)
        const last = Math.max(1, Math.ceil(meta.total / LEVEL_CONFIG_PAGE_SIZE) || 1)
        setConfigPage(last)
      }
    } finally {
      setNewBusy(false)
    }
  }

  if (!ctx?.me) return null

  return (
    <div className="content-route-wrap admin-level-page">
      <div className="content-page content-page--wide">
        <header className="content-page-header admin-users-header">
          <div>
            <h1>
              레벨·티어 <span>설정</span>
            </h1>
            <p className="admin-dashboard-lead">
              <strong>level_config</strong>의 <code>exp_to_next</code>가 마이페이지·경험치 계산에 직결됩니다. 아래 표에서 행을
              체크한 뒤 <strong>선택 저장</strong> 또는 <strong>선택 삭제</strong>를 사용하세요. 잘못 수정하면 진행도가 어긋날 수
              있습니다.
            </p>
          </div>
          <button type="button" className="btn-secondary" onClick={() => void refreshAll()} disabled={loading}>
            새로고침
          </button>
        </header>

        {loading ? (
          <p className="admin-users-state">불러오는 중…</p>
        ) : (
          <>
            <h2 className="admin-exp-panel-subtitle">티어 메타 (level_tiers)</h2>
            <p className="admin-level-tier-hint">
              DB 제약상 <code>tier_id</code>는 1~6 슬롯입니다. 비어 있는 번호로만 새로 등록할 수 있고, 삭제는 체크 후{' '}
              <strong>선택 삭제</strong>를 사용하세요. <code>level_config</code>에서 쓰는 티어는 외래키 때문에 삭제되지 않을 수
              있습니다.
            </p>

            <div className="admin-level-new-row admin-level-new-row--tier">
              <h3 className="admin-exp-panel-subtitle">새 티어 등록</h3>
              {freeTierSlots.length === 0 ? (
                <p className="admin-users-state" style={{ margin: 0 }}>
                  등록 가능한 슬롯(1~6)이 없습니다. 티어를 삭제한 뒤 다시 시도하세요.
                </p>
              ) : (
                <div className="admin-level-new-grid">
                  <label>
                    tier_id *
                    <select
                      value={newTierMetaId}
                      onChange={(e) => setNewTierMetaId(e.target.value)}
                      disabled={tierNewBusy}
                    >
                      {freeTierSlots.map((n) => (
                        <option key={n} value={String(n)}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    이름 *
                    <input
                      value={newTierMetaName}
                      onChange={(e) => setNewTierMetaName(e.target.value)}
                      placeholder="예: BRONZE"
                      autoComplete="off"
                      disabled={tierNewBusy}
                    />
                  </label>
                  <label>
                    level_min
                    <input
                      className="admin-level-num"
                      value={newTierMetaMin}
                      onChange={(e) => setNewTierMetaMin(e.target.value)}
                      disabled={tierNewBusy}
                    />
                  </label>
                  <label>
                    level_max
                    <input
                      className="admin-level-num"
                      value={newTierMetaMax}
                      onChange={(e) => setNewTierMetaMax(e.target.value)}
                      placeholder="무제한은 비움"
                      disabled={tierNewBusy}
                    />
                  </label>
                  <label>
                    exp/레벨
                    <input
                      className="admin-level-num"
                      value={newTierMetaExp}
                      onChange={(e) => setNewTierMetaExp(e.target.value)}
                      disabled={tierNewBusy}
                    />
                  </label>
                  <label>
                    sort
                    <input
                      className="admin-level-num"
                      value={newTierMetaSort}
                      onChange={(e) => setNewTierMetaSort(e.target.value)}
                      disabled={tierNewBusy}
                    />
                  </label>
                  <button type="button" className="btn-write" disabled={tierNewBusy} onClick={() => void addTierMeta()}>
                    {tierNewBusy ? '…' : '등록'}
                  </button>
                </div>
              )}
            </div>

            <div className="admin-level-config-actions admin-level-tier-actions">
              <button
                type="button"
                className="btn-secondary btn-delete"
                disabled={tierBulkBusy || !someTiersSelected}
                onClick={() => void onDeleteSelectedTiers()}
              >
                {tierBulkBusy ? '처리 중…' : `선택 삭제${someTiersSelected ? ` (${selectedTierIds.size})` : ''}`}
              </button>
            </div>

            <div className="admin-users-table-wrap admin-level-tier-table-wrap">
              <table className="admin-users-table admin-level-tier-table">
                <thead>
                  <tr>
                    <th scope="col" className="admin-level-col-check">
                      <span className="visually-hidden">선택</span>
                      <input
                        ref={tierSelectAllRef}
                        type="checkbox"
                        className="admin-level-config-check"
                        checked={allTiersSelected}
                        onChange={toggleSelectAllTiers}
                        disabled={loading || tiers.length === 0}
                        title="전체 선택"
                        aria-label="전체 선택"
                      />
                    </th>
                    <th>tier_id</th>
                    <th>이름</th>
                    <th>level_min</th>
                    <th>level_max</th>
                    <th>exp/레벨(참고)</th>
                    <th>sort</th>
                    <th> </th>
                  </tr>
                </thead>
                <tbody>
                  {tiers.map((row) => (
                    <TierEditRow
                      key={row.tier_id}
                      row={row}
                      onSaved={refreshAll}
                      checked={selectedTierIds.has(row.tier_id)}
                      onToggleCheck={() => toggleTierSelect(row.tier_id)}
                    />
                  ))}
                </tbody>
              </table>
            </div>

            <h2 className="admin-exp-panel-subtitle" style={{ marginTop: 28 }}>
              레벨별 필요 EXP (level_config)
            </h2>
            <div className="admin-level-new-row admin-level-new-row--top">
              <h3 className="admin-exp-panel-subtitle">새 레벨 행 추가</h3>
              <div className="admin-level-new-grid">
                <label>
                  level
                  <input value={newLevel} onChange={(e) => setNewLevel(e.target.value)} />
                </label>
                <label>
                  exp_to_next
                  <input value={newExp} onChange={(e) => setNewExp(e.target.value)} />
                </label>
                <label>
                  tier_id
                  <select value={newTier} onChange={(e) => setNewTier(e.target.value)}>
                    {tierOptions.map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
                <button type="button" className="btn-write" disabled={newBusy} onClick={() => void addLevel()}>
                  추가
                </button>
              </div>
            </div>

            <div className="admin-level-config-toolbar">
              <span className="admin-users-count">
                {configPagingBusy && !loading
                  ? '목록 불러오는 중…'
                  : `총 ${configTotal.toLocaleString('ko-KR')}레벨`}
              </span>
            </div>

            <div className="admin-level-config-actions">
              <button
                type="button"
                className="btn-secondary"
                disabled={bulkBusy || !someSelected || configPagingBusy}
                onClick={() => void onSaveSelected()}
              >
                {bulkBusy ? '처리 중…' : `선택 저장${someSelected ? ` (${selectedLevels.size})` : ''}`}
              </button>
              <button
                type="button"
                className="btn-secondary btn-delete"
                disabled={bulkBusy || !someSelected || configPagingBusy}
                onClick={() => void onDeleteSelected()}
              >
                {bulkBusy ? '처리 중…' : `선택 삭제${someSelected ? ` (${selectedLevels.size})` : ''}`}
              </button>
            </div>

            <div
              className={`admin-users-table-wrap admin-level-config-table-wrap${configPagingBusy ? ' admin-level-config-table-wrap--busy' : ''}`}
            >
              <table className="admin-users-table admin-level-config-table">
                <thead>
                  <tr>
                    <th scope="col" className="admin-level-col-check">
                      <span className="visually-hidden">선택</span>
                      <input
                        ref={selectAllRef}
                        type="checkbox"
                        className="admin-level-config-check"
                        checked={allSelected}
                        onChange={toggleSelectAllLevels}
                        disabled={loading || config.length === 0 || configPagingBusy}
                        title="전체 선택"
                        aria-label="전체 선택"
                      />
                    </th>
                    <th scope="col">level</th>
                    <th scope="col">exp_to_next</th>
                    <th scope="col">tier_id</th>
                  </tr>
                </thead>
                <tbody>
                  {config.map((row) => {
                    const d = draftByLevel[row.level] ?? { exp: String(row.exp_to_next), tierId: String(row.tier_id) }
                    return (
                      <tr key={row.level}>
                        <td className="admin-level-col-check">
                          <input
                            type="checkbox"
                            className="admin-level-config-check"
                            checked={selectedLevels.has(row.level)}
                            onChange={() => toggleLevelSelect(row.level)}
                            aria-label={`레벨 ${row.level} 선택`}
                          />
                        </td>
                        <td className="admin-exp-col-num">{row.level}</td>
                        <td>
                          <input
                            className="admin-level-inline-input admin-level-num"
                            value={d.exp}
                            onChange={(e) => setDraft(row.level, { exp: e.target.value })}
                            aria-label={`레벨 ${row.level} exp_to_next`}
                          />
                        </td>
                        <td>
                          <select
                            className="admin-level-tier-select"
                            value={d.tierId}
                            onChange={(e) => setDraft(row.level, { tierId: e.target.value })}
                            aria-label={`레벨 ${row.level} tier_id`}
                          >
                            {tierOptions.map((n) => (
                              <option key={n} value={n}>
                                {n}
                              </option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <PaginationBar
              total={configTotal}
              page={configPage}
              pageSize={LEVEL_CONFIG_PAGE_SIZE}
              onGo={(p) => setConfigPage(p)}
            />
          </>
        )}
      </div>
    </div>
  )
}
