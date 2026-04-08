import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useConfirm } from '../context/ConfirmContext'
import { useAdminOutletContext } from '../components/admin/adminLayoutContext'
import { appToast } from '../lib/appToast'
import {
  fetchAdminProfilesList,
  updateProfileRole,
  type AdminProfileRow,
} from '../services/adminUsersService'

function roleLabel(role: string) {
  return role === 'admin' ? '관리자' : '팀원'
}

export function AdminUsersPage() {
  const ctx = useAdminOutletContext()
  const me = ctx?.me
  const confirm = useConfirm()

  const [rows, setRows] = useState<AdminProfileRow[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [updatingId, setUpdatingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetchAdminProfilesList()
      if (!r.success) {
        appToast(r.error, 'error')
        setRows([])
      } else {
        setRows(r.data)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return rows
    return rows.filter(
      (r) => r.nickname.toLowerCase().includes(q) || r.email.toLowerCase().includes(q),
    )
  }, [rows, query])

  const onRoleChange = async (row: AdminProfileRow, next: 'admin' | 'member') => {
    if (!me) return
    if (row.id === me.user_id) {
      appToast('본인 계정의 역할은 여기서 바꿀 수 없습니다.', 'error')
      return
    }
    if (row.role === next) return

    const ok = await confirm({
      title: '역할 변경',
      message: `「${row.nickname || row.email || '이 사용자'}」을(를) ${roleLabel(next)}(으)로 바꿀까요?`,
      confirmText: '변경',
    })
    if (!ok) return

    setUpdatingId(row.id)
    try {
      const r = await updateProfileRole(row.id, next)
      if (!r.success) {
        appToast(r.error, 'error')
        return
      }
      appToast('역할이 변경되었습니다.')
      setRows((prev) => prev.map((p) => (p.id === row.id ? { ...p, role: next } : p)))
    } finally {
      setUpdatingId(null)
    }
  }

  if (!ctx || !me) {
    return null
  }

  return (
    <div className="content-route-wrap admin-users-page">
      <div className="content-page content-page--wide">
        <header className="content-page-header admin-users-header">
          <div>
            <h1>
              사용자 <span>관리</span>
            </h1>
            <p className="admin-dashboard-lead">프로필 목록 및 역할(관리자 / 팀원)을 관리합니다. RLS 정책에 따라 일부 작업이 거절될 수 있습니다.</p>
          </div>
          <button type="button" className="btn-secondary" onClick={() => void load()} disabled={loading}>
            새로고침
          </button>
        </header>

        <div className="admin-users-toolbar">
          <label className="admin-users-search-label">
            <span className="visually-hidden">검색</span>
            <input
              type="search"
              className="admin-users-search-input"
              placeholder="닉네임, 이메일 검색"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoComplete="off"
            />
          </label>
          <span className="admin-users-count">{filtered.length}명</span>
        </div>

        <div className="admin-users-table-wrap">
          {loading ? (
            <p className="admin-users-state">불러오는 중…</p>
          ) : filtered.length === 0 ? (
            <p className="admin-users-state">표시할 사용자가 없습니다.</p>
          ) : (
            <table className="admin-users-table">
              <thead>
                <tr>
                  <th scope="col" className="admin-users-col-no">
                    No
                  </th>
                  <th scope="col">닉네임</th>
                  <th scope="col">이메일</th>
                  <th scope="col">역할</th>
                  <th scope="col">EXP</th>
                  <th scope="col">이동</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row, index) => {
                  const busy = updatingId === row.id
                  const isSelf = row.id === me.user_id
                  return (
                    <tr key={row.id}>
                      <td className="admin-users-col-no">{index + 1}</td>
                      <td>
                        <Link to={`/admin/users/${row.id}`} className="admin-users-nick-link">
                          <div className="admin-users-nick-cell">
                            {row.profile_url ? (
                              <span
                                className="admin-users-avatar"
                                style={{ backgroundImage: `url('${row.profile_url}')` }}
                              />
                            ) : (
                              <span className="admin-users-avatar admin-users-avatar-fallback">
                                {(row.nickname || '?').slice(0, 1)}
                              </span>
                            )}
                            <span>{row.nickname || '—'}</span>
                          </div>
                        </Link>
                      </td>
                      <td className="admin-users-email">{row.email || '—'}</td>
                      <td>
                        {isSelf ? (
                          <span className="admin-users-role-pill admin-users-role-pill-self">{roleLabel(row.role)} (나)</span>
                        ) : (
                          <select
                            className="admin-users-role-select"
                            value={row.role}
                            disabled={busy}
                            onChange={(e) => {
                              const v = e.target.value === 'admin' ? 'admin' : 'member'
                              void onRoleChange(row, v)
                            }}
                            aria-label={`${row.nickname} 역할`}
                          >
                            <option value="member">팀원</option>
                            <option value="admin">관리자</option>
                          </select>
                        )}
                      </td>
                      <td className="admin-users-exp">{row.total_exp.toLocaleString('ko-KR')}</td>
                      <td>
                        <Link to={`/mypage/${row.id}`} className="admin-users-mypage-link">
                          마이페이지
                        </Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
