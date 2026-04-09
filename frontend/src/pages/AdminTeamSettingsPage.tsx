import { useCallback, useEffect, useState } from 'react'
import { AdminTeamYearModal } from '../components/admin/AdminTeamYearModal'
import { useAdminOutletContext } from '../components/admin/adminLayoutContext'
import { useConfirm } from '../context/ConfirmContext'
import { appToast } from '../lib/appToast'
import { fetchAdminTeamSettingsRows } from '../services/adminTeamSettingsService'
import type { TeamSettingRow } from '../services/sidebarSupabaseService'

function formatDt(iso: string | null | undefined) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('ko-KR', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function AdminTeamSettingsPage() {
  const ctx = useAdminOutletContext()
  const me = ctx?.me
  const confirm = useConfirm()

  const [rows, setRows] = useState<TeamSettingRow[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [modalMode, setModalMode] = useState<'add' | 'edit'>('add')
  const [modalInitial, setModalInitial] = useState<TeamSettingRow | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetchAdminTeamSettingsRows()
      if (!r.success) {
        appToast(r.error, 'error')
        setRows([])
      } else {
        setRows(r.rows)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const yearOptions = rows.map((x) => Number(x.year)).filter((y) => !Number.isNaN(y))

  if (!ctx || !me) {
    return null
  }

  return (
    <div className="content-route-wrap admin-team-settings-page">
      <div className="content-page content-page--wide">
        <header className="content-page-header admin-users-header">
          <div>
            <h1>
              팀 설정 <span>관리</span>
            </h1>
            <p className="admin-dashboard-lead">
              연도별 <code>site_team_settings</code>입니다. 팀 이름·설명·프로필 이미지·목표 금액(만원)·달성액(원)·마감 여부를
              설정합니다. 일반 사용자 팀 대시보드(<code>/team</code>)에서는 편집할 수 없습니다.
            </p>
          </div>
          <div className="admin-notices-header-actions">
            <button type="button" className="btn-secondary" onClick={() => void load()} disabled={loading}>
              새로고침
            </button>
            <button
              type="button"
              className="btn-write"
              onClick={() => {
                setModalInitial(null)
                setModalMode('add')
                setModalOpen(true)
              }}
            >
              연도 추가
            </button>
          </div>
        </header>

        <div className="admin-users-table-wrap">
          {loading ? (
            <p className="admin-users-state">불러오는 중…</p>
          ) : rows.length === 0 ? (
            <p className="admin-users-state">등록된 연도가 없습니다. 「연도 추가」로 첫 행을 만드세요.</p>
          ) : (
            <table className="admin-users-table admin-team-settings-table">
              <thead>
                <tr>
                  <th scope="col">연도</th>
                  <th scope="col">팀 이름</th>
                  <th scope="col">목표(만원)</th>
                  <th scope="col">달성(원)</th>
                  <th scope="col">마감</th>
                  <th scope="col">갱신</th>
                  <th scope="col" className="admin-users-col-actions">
                    작업
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const y = row.year ?? 0
                  return (
                    <tr key={y}>
                      <td>{y}</td>
                      <td className="admin-team-settings-cell-name">{row.team_name || '—'}</td>
                      <td>{row.goal_prize ?? 0}</td>
                      <td>{row.achieved_amount != null ? Number(row.achieved_amount).toLocaleString('ko-KR') : '—'}</td>
                      <td>{row.closed ? '예' : '—'}</td>
                      <td className="admin-team-settings-cell-dt">{formatDt(row.updated_at)}</td>
                      <td>
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={() => {
                            setModalInitial(row)
                            setModalMode('edit')
                            setModalOpen(true)
                          }}
                        >
                          편집
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {modalOpen ? (
        <AdminTeamYearModal
          open={modalOpen}
          mode={modalMode}
          initial={modalInitial}
          yearOptions={yearOptions}
          onClose={() => setModalOpen(false)}
          onSaved={() => void load()}
          confirm={confirm}
        />
      ) : null}
    </div>
  )
}
