import { useCallback, useEffect, useState } from 'react'
import { useConfirm } from '../context/ConfirmContext'
import { useAdminOutletContext } from '../components/admin/adminLayoutContext'
import { appToast } from '../lib/appToast'
import {
  deleteLevelConfigRow,
  fetchLevelConfigForAdmin,
  fetchLevelTiersForAdmin,
  insertLevelConfigRow,
  updateLevelConfigRow,
  updateLevelTier,
  type LevelConfigAdminRow,
  type LevelTierRow,
} from '../services/adminLevelService'

function TierEditRow({
  row,
  onSaved,
}: {
  row: LevelTierRow
  onSaved: () => void
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

function ConfigEditRow({
  row,
  onSaved,
}: {
  row: LevelConfigAdminRow
  onSaved: () => void
}) {
  const confirm = useConfirm()
  const [exp, setExp] = useState(String(row.exp_to_next))
  const [tierId, setTierId] = useState(String(row.tier_id))
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setExp(String(row.exp_to_next))
    setTierId(String(row.tier_id))
  }, [row])

  const save = async () => {
    setBusy(true)
    try {
      const r = await updateLevelConfigRow(row.level, Number(exp), Number(tierId))
      if (!r.ok) {
        appToast(r.error, 'error')
        return
      }
      appToast(`레벨 ${row.level} 저장됨`)
      onSaved()
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    const ok = await confirm({
      title: '레벨 행 삭제',
      message: `레벨 ${row.level} 행을 삭제할까요? 진행도 계산이 어긋날 수 있습니다.`,
      confirmText: '삭제',
      danger: true,
    })
    if (!ok) return
    setBusy(true)
    try {
      const r = await deleteLevelConfigRow(row.level)
      if (!r.ok) {
        appToast(r.error, 'error')
        return
      }
      appToast('삭제했습니다.')
      onSaved()
    } finally {
      setBusy(false)
    }
  }

  return (
    <tr>
      <td className="admin-exp-col-num">{row.level}</td>
      <td>
        <input className="admin-level-inline-input admin-level-num" value={exp} onChange={(e) => setExp(e.target.value)} />
      </td>
      <td>
        <select className="admin-level-tier-select" value={tierId} onChange={(e) => setTierId(e.target.value)}>
          {[1, 2, 3, 4, 5].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </td>
      <td>
        <button type="button" className="btn-secondary" disabled={busy} onClick={() => void save()}>
          저장
        </button>{' '}
        <button type="button" className="btn-secondary btn-delete" disabled={busy} onClick={() => void remove()}>
          삭제
        </button>
      </td>
    </tr>
  )
}

export function AdminLevelPage() {
  const ctx = useAdminOutletContext()
  const [tiers, setTiers] = useState<LevelTierRow[]>([])
  const [config, setConfig] = useState<LevelConfigAdminRow[]>([])
  const [loading, setLoading] = useState(true)
  const [newLevel, setNewLevel] = useState('')
  const [newExp, setNewExp] = useState('100')
  const [newTier, setNewTier] = useState('1')
  const [newBusy, setNewBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [t, c] = await Promise.all([fetchLevelTiersForAdmin(), fetchLevelConfigForAdmin()])
      if (!t.ok) {
        appToast(t.error, 'error')
        setTiers([])
      } else setTiers(t.rows)
      if (!c.ok) {
        appToast(c.error, 'error')
        setConfig([])
      } else setConfig(c.rows)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (config.length && newLevel === '') {
      const max = Math.max(...config.map((r) => r.level))
      setNewLevel(String(max + 1))
    }
  }, [config, newLevel])

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
      void load()
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
              <strong>level_config</strong>의 <code>exp_to_next</code>가 마이페이지·경험치 계산에 직결됩니다. 잘못 수정하면 진행도가 어긋날 수 있습니다.
            </p>
          </div>
          <button type="button" className="btn-secondary" onClick={() => void load()} disabled={loading}>
            새로고침
          </button>
        </header>

        {loading ? (
          <p className="admin-users-state">불러오는 중…</p>
        ) : (
          <>
            <h2 className="admin-exp-panel-subtitle">티어 메타 (level_tiers)</h2>
            <div className="admin-users-table-wrap admin-level-tier-table-wrap">
              <table className="admin-users-table admin-level-tier-table">
                <thead>
                  <tr>
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
                    <TierEditRow key={row.tier_id} row={row} onSaved={load} />
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
                    {[1, 2, 3, 4, 5].map((n) => (
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
            <div className="admin-users-table-wrap admin-level-config-table-wrap">
              <table className="admin-users-table admin-level-config-table">
                <thead>
                  <tr>
                    <th>level</th>
                    <th>exp_to_next</th>
                    <th>tier_id</th>
                    <th>작업</th>
                  </tr>
                </thead>
                <tbody>
                  {config.map((row) => (
                    <ConfigEditRow key={row.level} row={row} onSaved={load} />
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
