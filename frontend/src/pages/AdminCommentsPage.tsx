import { useCallback, useEffect, useRef, useState } from 'react'
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
  const [selectedContestIds, setSelectedContestIds] = useState<Set<string>>(() => new Set())
  const [selectedStartupIds, setSelectedStartupIds] = useState<Set<string>>(() => new Set())
  const selectAllRef = useRef<HTMLInputElement>(null)

  const loadContest = useCallback(async () => {
    setSelectedContestIds(new Set())
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
    setSelectedStartupIds(new Set())
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

  const toggleContest = (id: string) => {
    setSelectedContestIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleStartup = (id: string) => {
    setSelectedStartupIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAllContest = () => {
    const pageIds = rowsC.map((r) => r.id)
    setSelectedContestIds((prev) => {
      const next = new Set(prev)
      const allOnPage = pageIds.length > 0 && pageIds.every((id) => next.has(id))
      if (allOnPage) {
        for (const id of pageIds) next.delete(id)
      } else {
        for (const id of pageIds) next.add(id)
      }
      return next
    })
  }

  const toggleSelectAllStartup = () => {
    const pageIds = rowsS.map((r) => r.id)
    setSelectedStartupIds((prev) => {
      const next = new Set(prev)
      const allOnPage = pageIds.length > 0 && pageIds.every((id) => next.has(id))
      if (allOnPage) {
        for (const id of pageIds) next.delete(id)
      } else {
        for (const id of pageIds) next.add(id)
      }
      return next
    })
  }

  const allContestSelected = rowsC.length > 0 && rowsC.every((r) => selectedContestIds.has(r.id))
  const someContestOnPage = rowsC.some((r) => selectedContestIds.has(r.id))
  const allStartupSelected = rowsS.length > 0 && rowsS.every((r) => selectedStartupIds.has(r.id))
  const someStartupOnPage = rowsS.some((r) => selectedStartupIds.has(r.id))

  useEffect(() => {
    const el = selectAllRef.current
    if (!el) return
    if (tab === 'contest') {
      el.indeterminate = someContestOnPage && !allContestSelected
    } else {
      el.indeterminate = someStartupOnPage && !allStartupSelected
    }
  }, [tab, someContestOnPage, allContestSelected, someStartupOnPage, allStartupSelected])

  const deleteSelectedContest = async () => {
    const picked = rowsC.filter((r) => selectedContestIds.has(r.id))
    if (!picked.length) {
      appToast('삭제할 댓글을 선택하세요.', 'error')
      return
    }
    const preview = picked
      .slice(0, 6)
      .map((r) => truncate(r.body, 40))
      .join('\n')
    const more = picked.length > 6 ? `\n… 외 ${picked.length - 6}건` : ''
    const ok = await confirm({
      title: '공모전 댓글 삭제',
      message: `선택한 ${picked.length}건을 삭제할까요? 공모전 상세에 즉시 반영됩니다.\n\n${preview}${more}`,
      confirmText: '삭제',
      danger: true,
    })
    if (!ok) return
    for (const row of picked) {
      const r = await adminDeleteContestComment(row.id)
      if (!r.ok) {
        appToast(r.error, 'error')
        void loadContest()
        return
      }
    }
    appToast(`${picked.length}건 삭제했습니다.`)
    void loadContest()
  }

  const deleteSelectedStartup = async () => {
    const picked = rowsS.filter((r) => selectedStartupIds.has(r.id))
    if (!picked.length) {
      appToast('삭제할 댓글을 선택하세요.', 'error')
      return
    }
    const preview = picked
      .slice(0, 6)
      .map((r) => truncate(r.body, 40))
      .join('\n')
    const more = picked.length > 6 ? `\n… 외 ${picked.length - 6}건` : ''
    const ok = await confirm({
      title: '창업 허브 댓글 삭제',
      message: `선택한 ${picked.length}건을 삭제할까요? 창업 허브에 즉시 반영됩니다.\n\n${preview}${more}`,
      confirmText: '삭제',
      danger: true,
    })
    if (!ok) return
    for (const row of picked) {
      const r = await adminDeleteStartupComment(row.id)
      if (!r.ok) {
        appToast(r.error, 'error')
        void loadStartup()
        return
      }
    }
    appToast(`${picked.length}건 삭제했습니다.`)
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
            <p className="admin-dashboard-lead">
              부적절한 댓글·자동 생성 오류 줄을 삭제합니다. 행을 선택한 뒤 <strong>선택 삭제</strong>를 누르면 공모전 상세·창업 허브에 즉시 반영됩니다.
            </p>
          </div>
          <div className="admin-notices-header-actions">
            <button type="button" className="btn-secondary" onClick={() => void (tab === 'contest' ? loadContest() : loadStartup())} disabled={loading}>
              새로고침
            </button>
            <button
              type="button"
              className="btn-secondary btn-delete"
              onClick={() => void (tab === 'contest' ? deleteSelectedContest() : deleteSelectedStartup())}
              disabled={
                loading ||
                (tab === 'contest' ? selectedContestIds.size === 0 : selectedStartupIds.size === 0)
              }
            >
              선택 삭제
              {tab === 'contest'
                ? selectedContestIds.size > 0
                  ? ` (${selectedContestIds.size})`
                  : ''
                : selectedStartupIds.size > 0
                  ? ` (${selectedStartupIds.size})`
                  : ''}
            </button>
          </div>
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
                      <th scope="col" className="admin-contests-col-check">
                        <span className="visually-hidden">선택</span>
                        <input
                          ref={selectAllRef}
                          type="checkbox"
                          className="admin-contests-select-all"
                          checked={allContestSelected}
                          onChange={toggleSelectAllContest}
                          disabled={loading || rowsC.length === 0}
                          title="이 페이지 전체 선택"
                          aria-label="이 페이지 전체 선택"
                        />
                      </th>
                      <th>일시</th>
                      <th>작성자</th>
                      <th>공모전</th>
                      <th>내용</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rowsC.map((r) => (
                      <tr key={r.id}>
                        <td className="admin-contests-col-check">
                          <input
                            type="checkbox"
                            className="admin-contests-row-check"
                            checked={selectedContestIds.has(r.id)}
                            onChange={() => toggleContest(r.id)}
                            aria-label={`댓글 선택 (${truncate(r.body, 24)})`}
                          />
                        </td>
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
                      <th scope="col" className="admin-contests-col-check">
                        <span className="visually-hidden">선택</span>
                        <input
                          ref={selectAllRef}
                          type="checkbox"
                          className="admin-contests-select-all"
                          checked={allStartupSelected}
                          onChange={toggleSelectAllStartup}
                          disabled={loading || rowsS.length === 0}
                          title="이 페이지 전체 선택"
                          aria-label="이 페이지 전체 선택"
                        />
                      </th>
                      <th>일시</th>
                      <th>작성자</th>
                      <th>유형·ID</th>
                      <th>내용</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rowsS.map((r) => (
                      <tr key={r.id}>
                        <td className="admin-contests-col-check">
                          <input
                            type="checkbox"
                            className="admin-contests-row-check"
                            checked={selectedStartupIds.has(r.id)}
                            onChange={() => toggleStartup(r.id)}
                            aria-label={`댓글 선택 (${truncate(r.body, 24)})`}
                          />
                        </td>
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
