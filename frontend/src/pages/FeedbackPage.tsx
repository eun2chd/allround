import { useCallback, useEffect, useState } from 'react'
import { HiXMark } from 'react-icons/hi2'
import { useConfirm } from '../context/ConfirmContext'
import { useMainLayoutOutletContext } from '../components/layout/mainLayoutContext'
import { appToast } from '../lib/appToast'
import {
  createFeedback,
  deleteFeedback,
  fetchFeedbackDetail,
  fetchFeedbackList,
  updateFeedback,
  uploadFeedbackImage,
  type FeedbackCategory,
  type FeedbackDetailRow,
  type FeedbackListRow,
} from '../services/feedbackService'

function formatDate(iso: string | undefined) {
  if (!iso) return ''
  return new Date(iso).toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function FeedbackPage() {
  const ctx = useMainLayoutOutletContext()
  const me = ctx?.me
  const confirm = useConfirm()
  const [category, setCategory] = useState<'' | FeedbackCategory>('')
  const [list, setList] = useState<FeedbackListRow[]>([])
  const [loading, setLoading] = useState(true)

  const [writeOpen, setWriteOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [formCat, setFormCat] = useState<FeedbackCategory>('error')
  const [formTitle, setFormTitle] = useState('')
  const [formDesc, setFormDesc] = useState('')
  const [formReason, setFormReason] = useState('')
  const [formFile, setFormFile] = useState<File | null>(null)

  const [detailOpen, setDetailOpen] = useState(false)
  const [detail, setDetail] = useState<FeedbackDetailRow | null>(null)

  const showToast = useCallback((msg: string, type: 'success' | 'error' = 'success') => {
    appToast(msg, type)
  }, [])

  const load = useCallback(async () => {
    if (!me) return
    setLoading(true)
    try {
      const r = await fetchFeedbackList({
        category: category || undefined,
        isAdmin: false,
        currentUserId: me.user_id,
      })
      if (!r.success) {
        showToast(r.error || '목록 조회 실패', 'error')
        setList([])
      } else setList(r.data || [])
    } finally {
      setLoading(false)
    }
  }, [me, category, showToast])

  useEffect(() => {
    void load()
  }, [load])

  const openWrite = () => {
    setEditId(null)
    setFormCat('error')
    setFormTitle('')
    setFormDesc('')
    setFormReason('')
    setFormFile(null)
    setWriteOpen(true)
  }

  const submitWrite = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!me) return
    if (!formTitle.trim() || !formDesc.trim()) {
      showToast('제목과 내용을 입력해 주세요.', 'error')
      return
    }
    if (formCat === 'feature' && !formReason.trim()) {
      showToast('기능 제안 시 필요한 이유를 입력해 주세요.', 'error')
      return
    }

    let imageUrl: string | null | undefined
    if (formFile && formCat === 'error') {
      imageUrl = await uploadFeedbackImage(me.user_id, formFile)
      if (!imageUrl) showToast('이미지 업로드에 실패했습니다. 글만 등록합니다.', 'error')
    }

    if (editId) {
      const r = await updateFeedback(editId, {
        category: formCat,
        title: formTitle,
        description: formDesc,
        reason: formCat === 'feature' ? formReason : null,
        imageUrl: formFile ? imageUrl : undefined,
        userId: me.user_id,
      })
      if (!r.success) {
        showToast(r.error || '수정 실패', 'error')
        return
      }
      showToast('수정되었습니다.')
    } else {
      const r = await createFeedback({
        category: formCat,
        title: formTitle,
        description: formDesc,
        reason: formCat === 'feature' ? formReason : null,
        imageUrl: imageUrl ?? null,
        userId: me.user_id,
        nickname: me.nickname,
      })
      if (!r.success) {
        showToast(r.error || '등록 실패', 'error')
        return
      }
      showToast('등록되었습니다.')
    }
    setWriteOpen(false)
    void load()
  }

  const openDetail = async (id: string) => {
    if (!me) return
    const r = await fetchFeedbackDetail(id, { isAdmin: false, currentUserId: me.user_id })
    if (!r.success || !r.data) {
      showToast(r.error || '상세 조회 실패', 'error')
      return
    }
    setDetail(r.data)
    setDetailOpen(true)
  }

  const editFromDetail = () => {
    if (!detail) return
    setEditId(detail.id)
    setFormCat(detail.category)
    setFormTitle(detail.title)
    setFormDesc(detail.description)
    setFormReason(detail.reason || '')
    setFormFile(null)
    setDetailOpen(false)
    setWriteOpen(true)
  }

  const removeDetail = async () => {
    if (!detail || !me) return
    const ok = await confirm({
      title: '삭제',
      message: '이 글을 삭제하시겠습니까?',
      confirmText: '삭제',
      danger: true,
    })
    if (!ok) return
    const r = await deleteFeedback(detail.id, me.user_id)
    if (!r.success) showToast(r.error || '삭제 실패', 'error')
    else {
      showToast('삭제되었습니다.')
      setDetailOpen(false)
      void load()
    }
  }

  if (!me) return null

  return (
    <div className="content-route-wrap content-route-wrap--paper">
    <div className="content-page feedback-layout">
      <div className="feedback-section-head">
        <header className="content-page-header" style={{ marginBottom: 0 }}>
          <h1>
            <span>오류 신고</span>·<span>기능 제안</span>
          </h1>
          <button type="button" className="btn-write" onClick={openWrite}>
            글쓰기
          </button>
        </header>
        <p>오류를 발견하셨거나 필요한 기능이 있으시면 알려주세요.</p>
      </div>

      <div className="feedback-filter-bar">
        <div className="feedback-filter-row">
          <button
            type="button"
            className={'feedback-filter-btn' + (category === '' ? ' active' : '')}
            onClick={() => setCategory('')}
          >
            전체
          </button>
          <button
            type="button"
            className={'feedback-filter-btn' + (category === 'error' ? ' active' : '')}
            onClick={() => setCategory('error')}
          >
            오류 신고
          </button>
          <button
            type="button"
            className={'feedback-filter-btn' + (category === 'feature' ? ' active' : '')}
            onClick={() => setCategory('feature')}
          >
            기능 제안
          </button>
        </div>
      </div>

      <div className="feedback-list-shell">
        {loading ? (
          <div className="notice-state-msg">로딩 중...</div>
        ) : list.length === 0 ? (
          <div className="notice-state-msg">
            <p>등록된 글이 없습니다.</p>
            <p style={{ marginTop: 8 }}>오류 신고나 기능 제안을 등록해 보세요.</p>
          </div>
        ) : (
          list.map((f) => {
            const preview = (f.description || '').replace(/\s+/g, ' ').trim().slice(0, 80)
            const hasReply = !!(f.admin_reply && f.admin_reply.trim())
            return (
              <button
                key={f.id}
                type="button"
                className="feedback-item-card"
                onClick={() => void openDetail(f.id)}
              >
                <div className="feedback-item-head">
                  <span className="feedback-item-title">{f.title}</span>
                  <span className={'feedback-cat ' + (f.category === 'error' ? 'error' : 'feature')}>
                    {f.category === 'error' ? '오류 신고' : '기능 제안'}
                  </span>
                  <span className={'feedback-reply-badge ' + (hasReply ? 'done' : 'pending')}>
                    {hasReply ? '답변완료' : '대기중'}
                  </span>
                </div>
                <div className="feedback-item-meta">
                  {(f.author_nickname ? `${f.author_nickname} · ` : '') + formatDate(f.created_at)}
                </div>
                {preview ? (
                  <div className="feedback-item-preview">
                    {preview}
                    {f.description && f.description.length > 80 ? '…' : ''}
                  </div>
                ) : null}
              </button>
            )
          })
        )}
      </div>

      {writeOpen ? (
        <div
          className="cp-modal-overlay"
          role="presentation"
        >
          <div className="cp-modal">
            <div className="cp-modal-header">
              <h2>{editId ? '수정' : '오류 신고 / 기능 제안'}</h2>
              <button type="button" className="cp-modal-close" aria-label="닫기" onClick={() => setWriteOpen(false)}>
                <HiXMark className="cp-modal-close-ico" aria-hidden />
              </button>
            </div>
            <form onSubmit={(e) => void submitWrite(e)}>
              <div className="cp-modal-body">
                <div className="cp-form-group">
                  <span style={{ display: 'block', fontSize: '0.9rem', fontWeight: 600, marginBottom: 6 }}>카테고리 *</span>
                  <div className="cp-radio-row">
                    <label>
                      <input
                        type="radio"
                        name="fb-cat"
                        checked={formCat === 'error'}
                        onChange={() => setFormCat('error')}
                      />
                      오류 신고
                    </label>
                    <label>
                      <input
                        type="radio"
                        name="fb-cat"
                        checked={formCat === 'feature'}
                        onChange={() => setFormCat('feature')}
                      />
                      기능 제안
                    </label>
                  </div>
                </div>
                <div className="cp-form-group">
                  <label htmlFor="fb-title">제목 *</label>
                  <input id="fb-title" value={formTitle} onChange={(e) => setFormTitle(e.target.value)} required />
                </div>
                <div className="cp-form-group">
                  <label htmlFor="fb-desc">내용 *</label>
                  <textarea id="fb-desc" value={formDesc} onChange={(e) => setFormDesc(e.target.value)} required rows={4} />
                </div>
                {formCat === 'feature' ? (
                  <div className="cp-form-group">
                    <label htmlFor="fb-reason">해당 기능이 필요한 이유 *</label>
                    <textarea id="fb-reason" value={formReason} onChange={(e) => setFormReason(e.target.value)} rows={3} />
                  </div>
                ) : null}
                {formCat === 'error' ? (
                  <div className="cp-form-group">
                    <label htmlFor="fb-img">오류 사진 (선택)</label>
                    <input id="fb-img" type="file" accept="image/png,image/jpeg,image/jpg,image/gif,image/webp" onChange={(e) => setFormFile(e.target.files?.[0] ?? null)} />
                  </div>
                ) : null}
              </div>
              <div className="cp-modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setWriteOpen(false)}>
                  취소
                </button>
                <button type="submit" className="btn-write">
                  {editId ? '수정' : '등록'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {detailOpen && detail ? (
        <div
          className="cp-modal-overlay"
          role="presentation"
        >
          <div className="cp-modal">
            <div className="cp-modal-header">
              <h2>{detail.title}</h2>
              <button type="button" className="cp-modal-close" aria-label="닫기" onClick={() => setDetailOpen(false)}>
                <HiXMark className="cp-modal-close-ico" aria-hidden />
              </button>
            </div>
            <div className="cp-modal-body">
              <div className="cp-detail-meta">
                <span className={'feedback-cat ' + (detail.category === 'error' ? 'error' : 'feature')}>
                  {detail.category === 'error' ? '오류 신고' : '기능 제안'}
                </span>{' '}
                {detail.author_nickname ? `${detail.author_nickname} · ` : ''}
                {formatDate(detail.created_at)}
              </div>
              <div style={{ marginBottom: 16 }}>
                <h4 style={{ fontSize: '0.9rem', color: 'var(--gray-muted)', marginBottom: 6 }}>내용</h4>
                <div className="cp-detail-body">{detail.description || '(내용 없음)'}</div>
              </div>
              {detail.category === 'feature' && detail.reason ? (
                <div style={{ marginBottom: 16 }}>
                  <h4 style={{ fontSize: '0.9rem', color: 'var(--gray-muted)', marginBottom: 6 }}>필요한 이유</h4>
                  <div className="cp-detail-body">{detail.reason}</div>
                </div>
              ) : null}
              {detail.category === 'error' && detail.image_url ? (
                <div style={{ marginBottom: 16 }}>
                  <h4 style={{ fontSize: '0.9rem', color: 'var(--gray-muted)', marginBottom: 6 }}>첨부 이미지</h4>
                  <button
                    type="button"
                    style={{ border: 'none', padding: 0, background: 'none', cursor: 'pointer' }}
                    onClick={() => window.open(detail.image_url!, '_blank')}
                  >
                    <img src={detail.image_url} alt="첨부" style={{ maxWidth: '100%', maxHeight: 300, borderRadius: 8, border: '1px solid var(--border-gray)' }} />
                  </button>
                </div>
              ) : null}

              <div className="feedback-admin-reply-box">
                <h4>관리자 답변</h4>
                {detail.admin_reply?.trim() ? (
                  <div className="cp-detail-body">{detail.admin_reply}</div>
                ) : (
                  <div style={{ color: 'var(--gray-muted)', fontSize: '0.9rem' }}>아직 답변이 없습니다.</div>
                )}
              </div>

              {detail.is_own ? (
                <div className="cp-detail-actions">
                  <button type="button" className="btn-secondary" onClick={editFromDetail}>
                    수정
                  </button>
                  <button type="button" className="btn-secondary btn-delete" onClick={() => void removeDetail()}>
                    삭제
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
    </div>
  )
}

