import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAdminOutletContext } from '../components/admin/adminLayoutContext'
import { useConfirm } from '../context/ConfirmContext'
import { appToast } from '../lib/appToast'
import {
  deleteFeedbackAsAdmin,
  FEEDBACK_STATUS_LABEL,
  fetchFeedbackList,
  type FeedbackCategory,
  type FeedbackListRow,
  type FeedbackStatus,
} from '../services/feedbackService'

function formatDate(iso: string | undefined) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function statusLabel(s: string): string {
  if (s === 'pending' || s === 'processing' || s === 'done') return FEEDBACK_STATUS_LABEL[s]
  return s || '—'
}

export function AdminFeedbackListPage() {
  const ctx = useAdminOutletContext()
  const me = ctx?.me
  const confirm = useConfirm()

  const [category, setCategory] = useState<'' | FeedbackCategory>('')
  const [status, setStatus] = useState<'' | FeedbackStatus>('')
  const [list, setList] = useState<FeedbackListRow[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!me) return
    setLoading(true)
    try {
      const r = await fetchFeedbackList({
        category: category || undefined,
        status: status || undefined,
        isAdmin: true,
        currentUserId: me.user_id,
      })
      if (!r.success) {
        appToast(r.error || '목록을 불러오지 못했습니다.', 'error')
        setList([])
      } else {
        setList(r.data || [])
      }
    } finally {
      setLoading(false)
    }
  }, [me, category, status])

  useEffect(() => {
    void load()
  }, [load])

  const removeRow = async (f: FeedbackListRow) => {
    const ok = await confirm({
      title: '접수 삭제',
      message: `「${f.title}」건을 삭제할까요? 삭제 후 복구할 수 없습니다.`,
      confirmText: '삭제',
      danger: true,
    })
    if (!ok) return
    const r = await deleteFeedbackAsAdmin(f.id)
    if (!r.success) {
      appToast(r.error || '삭제에 실패했습니다.', 'error')
      return
    }
    appToast('삭제했습니다.')
    void load()
  }

  if (!ctx || !me) {
    return null
  }

  return (
    <div className="content-route-wrap admin-feedback-list-page">
      <div className="content-page content-page--wide">
        <header className="content-page-header admin-users-header">
          <div>
            <h1>
              건의·신고 <span>관리</span>
            </h1>
            <p className="admin-dashboard-lead">접수된 건을 확인하고 상세에서 답변·처리 상태를 기록합니다.</p>
          </div>
          <button type="button" className="btn-secondary" onClick={() => void load()} disabled={loading}>
            새로고침
          </button>
        </header>

        <div className="admin-feedback-filters">
          <div className="admin-feedback-filter-group">
            <span className="admin-exp-filter-label">구분</span>
            <div className="admin-feedback-filter-btns">
              <button type="button" className={category === '' ? 'is-active' : ''} onClick={() => setCategory('')}>
                전체
              </button>
              <button
                type="button"
                className={category === 'error' ? 'is-active' : ''}
                onClick={() => setCategory('error')}
              >
                오류 신고
              </button>
              <button
                type="button"
                className={category === 'feature' ? 'is-active' : ''}
                onClick={() => setCategory('feature')}
              >
                기능 제안
              </button>
            </div>
          </div>
          <div className="admin-feedback-filter-group">
            <span className="admin-exp-filter-label">상태</span>
            <div className="admin-feedback-filter-btns">
              <button type="button" className={status === '' ? 'is-active' : ''} onClick={() => setStatus('')}>
                전체
              </button>
              <button
                type="button"
                className={status === 'pending' ? 'is-active' : ''}
                onClick={() => setStatus('pending')}
              >
                대기
              </button>
              <button
                type="button"
                className={status === 'processing' ? 'is-active' : ''}
                onClick={() => setStatus('processing')}
              >
                처리 중
              </button>
              <button type="button" className={status === 'done' ? 'is-active' : ''} onClick={() => setStatus('done')}>
                완료
              </button>
            </div>
          </div>
        </div>

        <div className="admin-users-toolbar">
          <span className="admin-users-count">{list.length.toLocaleString('ko-KR')}건</span>
        </div>

        <div className="admin-users-table-wrap">
          {loading ? (
            <p className="admin-users-state">불러오는 중…</p>
          ) : list.length === 0 ? (
            <p className="admin-users-state">표시할 접수가 없습니다.</p>
          ) : (
            <table className="admin-users-table admin-feedback-table">
              <thead>
                <tr>
                  <th scope="col" className="admin-users-col-no">
                    No
                  </th>
                  <th scope="col">구분</th>
                  <th scope="col">제목</th>
                  <th scope="col">신청자</th>
                  <th scope="col">상태</th>
                  <th scope="col">답변</th>
                  <th scope="col">접수일</th>
                  <th scope="col" className="admin-feedback-col-actions">
                    작업
                  </th>
                </tr>
              </thead>
              <tbody>
                {list.map((f, index) => {
                  const hasReply = !!(f.admin_reply && f.admin_reply.trim())
                  return (
                    <tr key={f.id}>
                      <td className="admin-users-col-no">{index + 1}</td>
                      <td>
                        <span className={'admin-feedback-cat ' + (f.category === 'error' ? 'is-error' : 'is-feature')}>
                          {f.category === 'error' ? '오류' : '기능'}
                        </span>
                      </td>
                      <td>
                        <Link to={`/admin/feedback/${f.id}`} className="admin-feedback-title-link">
                          {f.title}
                        </Link>
                      </td>
                      <td>
                        <Link to={`/admin/users/${f.user_id}`} className="admin-users-nick-link">
                          {f.author_nickname || '—'}
                        </Link>
                      </td>
                      <td>
                        <span className="admin-feedback-status-pill" data-status={f.status}>
                          {statusLabel(f.status)}
                        </span>
                      </td>
                      <td>{hasReply ? '등록됨' : '—'}</td>
                      <td className="admin-notice-date">{formatDate(f.created_at)}</td>
                      <td className="admin-feedback-actions-cell">
                        <button
                          type="button"
                          className="btn-secondary btn-delete"
                          onClick={() => void removeRow(f)}
                        >
                          삭제
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
    </div>
  )
}
