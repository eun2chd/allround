import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useConfirm } from '../context/ConfirmContext'
import { useAdminOutletContext } from '../components/admin/adminLayoutContext'
import { PaginationBar } from '../components/common/PaginationBar'
import { appToast } from '../lib/appToast'
import {
  adminDeleteContestComment,
  adminDeleteStartupComment,
  fetchContestCommentsModerationPage,
  fetchStartupCommentsModerationPage,
  type ContestCommentModRow,
  type StartupCommentModRow,
} from '../services/adminCommentsModerationService'

const PAGE_SIZE = 25

type Tab = 'contest' | 'startup'

function truncate(s: string, n: number) {
  const t = s.trim()
  if (t.length <= n) return t
  return t.slice(0, n) + '…'
}

export function AdminCommentsPage() {
  const ctx = useAdminOutletContext()
  const confirm = useConfirm()
  const [tab, setTab] = useState<Tab>('contest')
  const [rowsC, setRowsC] = useState<ContestCommentModRow[]>([])
  const [totalC, setTotalC] = useState(0)
  const [pageC, setPageC] = useState(1)
  const [rowsS, setRowsS] = useState<StartupCommentModRow[]>([])
  const [totalS, setTotalS] = useState(0)
  const [pageS, setPageS] = useState(1)
  const [loading, setLoading] = useState(true)

  const loadContest = useCallback(async () => {
    const r = await fetchContestCommentsModerationPage({ page: pageC, pageSize: PAGE_SIZE })
    if (!r.ok) {
      appToast(r.error, 'error')
      setRowsC([])
      setTotalC(0)
      return
    }
    setRowsC(r.rows)
    setTotalC(r.total)
  }, [pageC])

  const loadStartup = useCallback(async () => {
    const r = await fetchStartupCommentsModerationPage({ page: pageS, pageSize: PAGE_SIZE })
    if (!r.ok) {
      appToast(r.error, 'error')
      setRowsS([])
      setTotalS(0)
      return
    }
    setRowsS(r.rows)
    setTotalS(r.total)
  }, [pageS])

  useEffect(() => {
    let alive = true
    ;(async () => {
      setLoading(true)
      try {
        if (tab === 'contest') await loadContest()
        else await loadStartup()
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [tab, loadContest, loadStartup])

  const delContest = async (row: ContestCommentModRow) => {
    const ok = await confirm({
      title: '댓글 삭제',
      message: '이 공모전 댓글을 삭제할까요?',
      confirmText: '삭제',
      danger: true,
    })
    if (!ok) return
    const r = await adminDeleteContestComment(row.id)
    if (!r.ok) {
      appToast(r.error, 'error')
      return
    }
    appToast('삭제했습니다.')
    void loadContest()
  }

  const delStartup = async (row: StartupCommentModRow) => {
    const ok = await confirm({
      title: '댓글 삭제',
      message: '이 창업 허브 댓글을 삭제할까요?',
      confirmText: '삭제',
      danger: true,
    })
    if (!ok) return
    const r = await adminDeleteStartupComment(row.id)
    if (!r.ok) {
      appToast(r.error, 'error')
      return
    }
    appToast('삭제했습니다.')
    void loadStartup()
  }

  if (!ctx?.me) return null

  return (
    <div className="content-route-wrap admin-comments-page">
      <div className="content-page content-page--wide">
        <header className="content-page-header admin-users-header">
          <div>
            <h1>
              댓글 <span>관리</span>
            </h1>
            <p className="admin-dashboard-lead">부적절한 댓글·자동 생성 오류 줄을 삭제합니다. 공모전 상세와 창업 허브에 즉시 반영됩니다.</p>
          </div>
          <button type="button" className="btn-secondary" onClick={() => void (tab === 'contest' ? loadContest() : loadStartup())} disabled={loading}>
            새로고침
          </button>
        </header>

        <div className="admin-exp-tabs" role="tablist">
          <button type="button" role="tab" className={'admin-exp-tab' + (tab === 'contest' ? ' is-active' : '')} onClick={() => setTab('contest')}>
            공모전 댓글
          </button>
          <button type="button" role="tab" className={'admin-exp-tab' + (tab === 'startup' ? ' is-active' : '')} onClick={() => setTab('startup')}>
            창업 댓글
          </button>
        </div>

        {tab === 'contest' ? (
          <>
            <div className="admin-users-table-wrap admin-comments-contest-table-wrap">
              {loading ? (
                <p className="admin-users-state">불러오는 중…</p>
              ) : rowsC.length === 0 ? (
                <p className="admin-users-state">댓글이 없습니다.</p>
              ) : (
                <table className="admin-users-table admin-comments-contest-table">
                  <thead>
                    <tr>
                      <th>일시</th>
                      <th>작성자</th>
                      <th>공모전</th>
                      <th>내용</th>
                      <th>작업</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rowsC.map((r) => (
                      <tr key={r.id}>
                        <td className="admin-exp-cell-muted">{new Date(r.created_at).toLocaleString('ko-KR')}</td>
                        <td>
                          <Link to={`/admin/users/${r.user_id}`} className="admin-users-nick-link">
                            {r.nickname}
                          </Link>
                        </td>
                        <td className="admin-exp-cell-code">
                          {r.source}/{truncate(r.contest_id, 24)}
                        </td>
                        <td>{truncate(r.body, 80)}</td>
                        <td>
                          <button type="button" className="btn-secondary btn-delete" onClick={() => void delContest(r)}>
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
              <PaginationBar total={totalC} page={pageC} pageSize={PAGE_SIZE} onGo={setPageC} />
            </div>
          </>
        ) : (
          <>
            <div className="admin-users-table-wrap admin-comments-startup-table-wrap">
              {loading ? (
                <p className="admin-users-state">불러오는 중…</p>
              ) : rowsS.length === 0 ? (
                <p className="admin-users-state">댓글이 없습니다.</p>
              ) : (
                <table className="admin-users-table admin-comments-startup-table">
                  <thead>
                    <tr>
                      <th>일시</th>
                      <th>작성자</th>
                      <th>유형·ID</th>
                      <th>내용</th>
                      <th>작업</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rowsS.map((r) => (
                      <tr key={r.id}>
                        <td className="admin-exp-cell-muted">{new Date(r.created_at).toLocaleString('ko-KR')}</td>
                        <td>
                          <Link to={`/admin/users/${r.user_id}`} className="admin-users-nick-link">
                            {r.nickname}
                          </Link>
                        </td>
                        <td className="admin-exp-cell-code">
                          {r.item_type}/{truncate(r.item_id, 20)}
                        </td>
                        <td>{truncate(r.body, 80)}</td>
                        <td>
                          <button type="button" className="btn-secondary btn-delete" onClick={() => void delStartup(r)}>
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
              <PaginationBar total={totalS} page={pageS} pageSize={PAGE_SIZE} onGo={setPageS} />
            </div>
          </>
        )}
      </div>
    </div>
  )
}
