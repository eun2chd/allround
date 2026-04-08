import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAdminOutletContext } from '../components/admin/adminLayoutContext'
import { appToast } from '../lib/appToast'
import {
  FEEDBACK_STATUS_LABEL,
  fetchFeedbackDetail,
  updateFeedbackAsAdmin,
  type FeedbackDetailRow,
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

export function AdminFeedbackDetailPage() {
  const { feedbackId } = useParams<{ feedbackId: string }>()
  const ctx = useAdminOutletContext()
  const me = ctx?.me

  const [detail, setDetail] = useState<FeedbackDetailRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [adminReply, setAdminReply] = useState('')
  const [status, setStatus] = useState<FeedbackStatus>('pending')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    if (!feedbackId?.trim() || !me) {
      setDetail(null)
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const r = await fetchFeedbackDetail(feedbackId, { isAdmin: true, currentUserId: me.user_id })
      if (!r.success || !r.data) {
        appToast(r.error === 'not_found' ? '글을 찾을 수 없습니다.' : r.error || '불러오지 못했습니다.', 'error')
        setDetail(null)
      } else {
        setDetail(r.data)
        setAdminReply(r.data.admin_reply?.trim() || '')
        const st = r.data.status
        if (st === 'pending' || st === 'processing' || st === 'done') setStatus(st)
        else setStatus('pending')
      }
    } finally {
      setLoading(false)
    }
  }, [feedbackId, me])

  useEffect(() => {
    void load()
  }, [load])

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!feedbackId?.trim()) return
    setSaving(true)
    try {
      const r = await updateFeedbackAsAdmin(feedbackId, { admin_reply: adminReply, status })
      if (!r.success) {
        appToast(r.error || '저장에 실패했습니다.', 'error')
        return
      }
      appToast('저장했습니다.')
      void load()
    } finally {
      setSaving(false)
    }
  }

  if (!ctx || !me) {
    return null
  }

  return (
    <div className="content-route-wrap admin-feedback-detail-page">
      <div className="content-page content-page--wide">
        <header className="content-page-header admin-user-detail-header">
          <div>
            <h1>
              건의·신고 <span>상세</span>
            </h1>
            <p className="admin-dashboard-lead">내용을 확인한 뒤 답변과 처리 상태를 저장합니다.</p>
          </div>
          <div className="admin-user-detail-header-actions">
            <Link to="/admin/feedback" className="btn-secondary admin-user-detail-back">
              목록으로
            </Link>
            {detail ? (
              <Link to={`/admin/users/${detail.user_id}`} className="btn-secondary">
                신청자 프로필
              </Link>
            ) : null}
          </div>
        </header>

        {loading ? (
          <p className="admin-users-state">불러오는 중…</p>
        ) : !detail ? (
          <p className="admin-users-state">글을 찾을 수 없습니다.</p>
        ) : (
          <div className="admin-feedback-detail-layout">
            <div className="admin-user-detail-card admin-feedback-detail-card">
              <table className="admin-user-detail-table">
                <tbody>
                  <tr className="admin-user-detail-row">
                    <th className="admin-user-detail-label">제목</th>
                    <td className="admin-user-detail-value">{detail.title}</td>
                  </tr>
                  <tr className="admin-user-detail-row">
                    <th className="admin-user-detail-label">구분</th>
                    <td className="admin-user-detail-value">
                      {detail.category === 'error' ? '오류 신고' : '기능 제안'}
                    </td>
                  </tr>
                  <tr className="admin-user-detail-row">
                    <th className="admin-user-detail-label">신청자</th>
                    <td className="admin-user-detail-value">
                      <Link to={`/admin/users/${detail.user_id}`} className="admin-users-nick-link">
                        {detail.author_nickname || '프로필 보기'}
                      </Link>
                    </td>
                  </tr>
                  <tr className="admin-user-detail-row">
                    <th className="admin-user-detail-label">접수일</th>
                    <td className="admin-user-detail-value">{formatDate(detail.created_at)}</td>
                  </tr>
                </tbody>
              </table>

              <div className="admin-feedback-detail-block">
                <h2 className="admin-feedback-detail-block-title">내용</h2>
                <div className="admin-feedback-detail-body">{detail.description || '(내용 없음)'}</div>
              </div>

              {detail.category === 'feature' && detail.reason ? (
                <div className="admin-feedback-detail-block">
                  <h2 className="admin-feedback-detail-block-title">필요한 이유</h2>
                  <div className="admin-feedback-detail-body">{detail.reason}</div>
                </div>
              ) : null}

              {detail.category === 'error' && detail.image_url ? (
                <div className="admin-feedback-detail-block">
                  <h2 className="admin-feedback-detail-block-title">첨부 이미지</h2>
                  <button
                    type="button"
                    className="admin-feedback-image-btn"
                    onClick={() => window.open(detail.image_url!, '_blank')}
                  >
                    <img src={detail.image_url} alt="첨부" className="admin-feedback-image" />
                  </button>
                </div>
              ) : null}
            </div>

            <form className="admin-feedback-reply-card" onSubmit={onSubmit}>
              <h2 className="admin-feedback-reply-card-title">관리자 답변·처리</h2>
              <label className="admin-feedback-field">
                <span>처리 상태</span>
                <select
                  className="admin-exp-select admin-feedback-select"
                  value={status}
                  onChange={(e) => setStatus(e.target.value as FeedbackStatus)}
                  aria-label="처리 상태"
                >
                  {(Object.keys(FEEDBACK_STATUS_LABEL) as FeedbackStatus[]).map((k) => (
                    <option key={k} value={k}>
                      {FEEDBACK_STATUS_LABEL[k]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="admin-feedback-field">
                <span>답변 내용</span>
                <textarea
                  className="admin-feedback-reply-textarea"
                  value={adminReply}
                  onChange={(e) => setAdminReply(e.target.value)}
                  placeholder="회원에게 전달할 답변을 입력하세요."
                  rows={8}
                />
              </label>
              {detail.admin_replied_at ? (
                <p className="admin-feedback-replied-at">마지막 답변 시각: {formatDate(detail.admin_replied_at)}</p>
              ) : null}
              <button type="submit" className="btn-write" disabled={saving}>
                {saving ? '저장 중…' : '저장'}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  )
}
