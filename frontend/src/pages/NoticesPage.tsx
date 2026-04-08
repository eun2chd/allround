import { useCallback, useEffect, useState } from 'react'
import { HiXMark } from 'react-icons/hi2'
import { useConfirm } from '../context/ConfirmContext'
import { useMainLayoutOutletContext } from '../components/layout/mainLayoutContext'
import { appToast } from '../lib/appToast'
import {
  createNotice,
  deleteNotice,
  fetchNoticeDetail,
  fetchNoticesList,
  updateNotice,
  type NoticeRow,
} from '../services/noticesService'

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

function previewBody(body: string | null | undefined) {
  const s = (body || '').replace(/\s+/g, ' ').trim().slice(0, 80)
  return { text: s, more: (body || '').length > 80 }
}

export function NoticesPage() {
  const ctx = useMainLayoutOutletContext()
  const me = ctx?.me
  const confirm = useConfirm()
  const isAdmin = me?.role === 'admin'

  const [rows, setRows] = useState<NoticeRow[]>([])
  const [loading, setLoading] = useState(true)

  const [detailOpen, setDetailOpen] = useState(false)
  const [detailRow, setDetailRow] = useState<NoticeRow | null>(null)

  const [writeOpen, setWriteOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [formTitle, setFormTitle] = useState('')
  const [formBody, setFormBody] = useState('')
  const [formPinned, setFormPinned] = useState(false)

  const showToast = useCallback((msg: string, type: 'success' | 'error' = 'success') => {
    appToast(msg, type)
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetchNoticesList()
      if (!r.success) {
        showToast(r.error || '목록 조회 실패', 'error')
        setRows([])
      } else setRows(r.data || [])
    } finally {
      setLoading(false)
    }
  }, [showToast])

  useEffect(() => {
    void load()
  }, [load])

  const openDetail = async (id: string) => {
    const r = await fetchNoticeDetail(id)
    if (!r.success || !r.data) {
      showToast(r.error || '상세 조회 실패', 'error')
      return
    }
    setDetailRow(r.data)
    setDetailOpen(true)
  }

  const openWriteNew = () => {
    setEditId(null)
    setFormTitle('')
    setFormBody('')
    setFormPinned(false)
    setWriteOpen(true)
  }

  const openEditFromDetail = async () => {
    if (!detailRow) return
    setEditId(detailRow.id)
    setFormTitle(detailRow.title || '')
    setFormBody(detailRow.body || '')
    setFormPinned(!!detailRow.is_pinned)
    setDetailOpen(false)
    setWriteOpen(true)
  }

  const submitWrite = async () => {
    const title = formTitle.trim()
    if (!title) {
      showToast('제목을 입력해 주세요.', 'error')
      return
    }
    if (!me) return
    if (editId) {
      const r = await updateNotice(editId, {
        title,
        body: formBody.trim(),
        is_pinned: formPinned,
      })
      if (!r.success) {
        showToast(r.error || '수정 실패', 'error')
        return
      }
      showToast('수정되었습니다.')
    } else {
      const r = await createNotice({
        title,
        body: formBody.trim(),
        is_pinned: formPinned,
        authorId: me.user_id,
      })
      if (!r.success) {
        showToast(r.error || '등록 실패', 'error')
        return
      }
      showToast('공지사항이 등록되었습니다.')
    }
    setWriteOpen(false)
    void load()
  }

  const removeNotice = async (id: string) => {
    const ok = await confirm({
      title: '공지사항',
      message: '이 공지사항을 삭제할까요?',
      confirmText: '삭제',
      danger: true,
    })
    if (!ok) return { success: false }
    const r = await deleteNotice(id)
    if (!r.success) showToast(r.error || '삭제 실패', 'error')
    else {
      showToast('삭제되었습니다.')
      setDetailOpen(false)
      void load()
    }
  }

  if (!me) return null

  return (
    <div className="content-route-wrap">
      <div className="content-page">
      <header className="content-page-header">
        <h1>
          <span>공지사항</span>
        </h1>
        {isAdmin ? (
          <button type="button" className="btn-write" onClick={openWriteNew}>
            글쓰기
          </button>
        ) : null}
      </header>

      <div className="notice-list-box">
        {loading ? (
          <div className="notice-state-msg">로딩 중...</div>
        ) : rows.length === 0 ? (
          <div className="notice-state-msg">
            <p>등록된 공지사항이 없습니다.</p>
          </div>
        ) : (
          rows.map((n) => {
            const pv = previewBody(n.body)
            return (
              <button
                key={n.id}
                type="button"
                className="notice-item-card"
                onClick={() => void openDetail(n.id)}
              >
                <div className="notice-item-head">
                  <span className="notice-item-title">{n.title}</span>
                  {n.is_pinned ? <span className="notice-pinned-tag">고정</span> : null}
                </div>
                <div className="notice-item-meta">
                  {(n.author_nickname ? `${n.author_nickname} · ` : '') + formatDate(n.created_at)}
                </div>
                {pv.text ? (
                  <div className="notice-item-preview">
                    {pv.text}
                    {pv.more ? '…' : ''}
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
          onClick={(e) => e.target === e.currentTarget && setWriteOpen(false)}
        >
          <div className="cp-modal">
            <div className="cp-modal-header">
              <h2>{editId ? '공지사항 수정' : '공지사항 작성'}</h2>
              <button type="button" className="cp-modal-close" aria-label="닫기" onClick={() => setWriteOpen(false)}>
                <HiXMark className="cp-modal-close-ico" aria-hidden />
              </button>
            </div>
            <div className="cp-modal-body">
              <div className="cp-form-group">
                <label htmlFor="notice-title">제목 *</label>
                <input
                  id="notice-title"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="제목을 입력하세요"
                />
              </div>
              <div className="cp-form-group">
                <label htmlFor="notice-body">내용</label>
                <textarea
                  id="notice-body"
                  value={formBody}
                  onChange={(e) => setFormBody(e.target.value)}
                  placeholder="내용을 입력하세요"
                />
              </div>
              <div className="cp-form-group" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  id="notice-pin"
                  type="checkbox"
                  checked={formPinned}
                  onChange={(e) => setFormPinned(e.target.checked)}
                />
                <label htmlFor="notice-pin">상단 고정</label>
              </div>
            </div>
            <div className="cp-modal-footer">
              <button type="button" className="btn-secondary" onClick={() => setWriteOpen(false)}>
                취소
              </button>
              <button type="button" className="btn-write" onClick={() => void submitWrite()}>
                {editId ? '수정' : '등록'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {detailOpen && detailRow ? (
        <div
          className="cp-modal-overlay"
          role="presentation"
          onClick={(e) => e.target === e.currentTarget && setDetailOpen(false)}
        >
          <div className="cp-modal">
            <div className="cp-modal-header">
              <h2>{detailRow.title}</h2>
              <button type="button" className="cp-modal-close" aria-label="닫기" onClick={() => setDetailOpen(false)}>
                <HiXMark className="cp-modal-close-ico" aria-hidden />
              </button>
            </div>
            <div className="cp-modal-body">
              <div className="cp-detail-meta">
                {detailRow.is_pinned ? <span className="notice-pinned-tag">고정</span> : null}{' '}
                {detailRow.author_nickname ? <span>{detailRow.author_nickname} · </span> : null}
                <span>{formatDate(detailRow.created_at)}</span>
              </div>
              <div className="cp-detail-body">{detailRow.body || '(내용 없음)'}</div>
              {isAdmin ? (
                <div className="cp-detail-actions">
                  <button type="button" className="btn-write" onClick={() => void openEditFromDetail()}>
                    수정
                  </button>
                  <button type="button" className="btn-secondary btn-delete" onClick={() => void removeNotice(detailRow.id)}>
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
