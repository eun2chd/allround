import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useConfirm } from '../context/ConfirmContext'
import { useAdminOutletContext } from '../components/admin/adminLayoutContext'
import { PaginationBar } from '../components/common/PaginationBar'
import { appToast } from '../lib/appToast'
import {
  deleteRepresentativeWork,
  fetchRepresentativeWorksAdminPage,
  type RepWorkAdminRow,
} from '../services/adminRepresentativeWorksService'

const PAGE_SIZE = 30

export function AdminRepresentativeWorksPage() {
  const ctx = useAdminOutletContext()
  const confirm = useConfirm()
  const [rows, setRows] = useState<RepWorkAdminRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetchRepresentativeWorksAdminPage({ page, pageSize: PAGE_SIZE })
      if (!r.ok) {
        appToast(r.error, 'error')
        setRows([])
        setTotal(0)
        return
      }
      setRows(r.rows)
      setTotal(r.total)
    } finally {
      setLoading(false)
    }
  }, [page])

  useEffect(() => {
    void load()
  }, [load])

  const onDelete = async (r: RepWorkAdminRow) => {
    const ok = await confirm({
      title: '대표작품 제거',
      message: `${r.nickname} 회원의 대표작 슬롯 ${r.sort_order} (${r.source}/${r.contest_id})를 삭제할까요?`,
      confirmText: '삭제',
      danger: true,
    })
    if (!ok) return
    const res = await deleteRepresentativeWork(r.user_id, r.sort_order)
    if (!res.ok) {
      appToast(res.error, 'error')
      return
    }
    appToast('삭제했습니다.')
    void load()
  }

  if (!ctx?.me) return null

  return (
    <div className="content-route-wrap admin-repworks-page">
      <div className="content-page content-page--wide">
        <header className="content-page-header admin-users-header">
          <div>
            <h1>
              대표작품 <span>관리</span>
            </h1>
            <p className="admin-dashboard-lead">마이페이지에 노출되는 대표작 슬롯을 정리합니다. 삭제 후 회원은 마이페이지에서 다시 등록할 수 있습니다.</p>
          </div>
          <button type="button" className="btn-secondary" onClick={() => void load()} disabled={loading}>
            새로고침
          </button>
        </header>

        <div className="admin-users-table-wrap">
          {loading ? (
            <p className="admin-users-state">불러오는 중…</p>
          ) : rows.length === 0 ? (
            <p className="admin-users-state">등록된 대표작품이 없습니다.</p>
          ) : (
            <table className="admin-users-table">
              <thead>
                <tr>
                  <th>회원</th>
                  <th>슬롯</th>
                  <th>공모전</th>
                  <th>수상</th>
                  <th>등록일</th>
                  <th>작업</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={`${r.user_id}-${r.sort_order}`}>
                    <td>
                      <Link to={`/admin/users/${r.user_id}`} className="admin-users-nick-link">
                        {r.nickname}
                      </Link>
                    </td>
                    <td>{r.sort_order}</td>
                    <td className="admin-exp-cell-code">
                      {r.source}/{r.contest_id}
                    </td>
                    <td>{r.award_status || '—'}</td>
                    <td className="admin-exp-cell-muted">{r.created_at ? new Date(r.created_at).toLocaleString('ko-KR') : '—'}</td>
                    <td>
                      <button type="button" className="btn-secondary btn-delete" onClick={() => void onDelete(r)}>
                        삭제
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="admin-exp-pagination-bar-wrap">
          <PaginationBar total={total} page={page} pageSize={PAGE_SIZE} onGo={setPage} />
        </div>
      </div>
    </div>
  )
}
