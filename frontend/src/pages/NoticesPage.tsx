import { useCallback, useEffect, useState } from 'react'
import { HiXMark } from 'react-icons/hi2'
import { useMainLayoutOutletContext } from '../components/layout/mainLayoutContext'
import { appToast } from '../lib/appToast'
import { fetchNoticeDetail, fetchNoticesList, type NoticeRow } from '../services/noticesService'

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

  const [rows, setRows] = useState<NoticeRow[]>([])
  const [loading, setLoading] = useState(true)

  const [detailOpen, setDetailOpen] = useState(false)
  const [detailRow, setDetailRow] = useState<NoticeRow | null>(null)

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

  if (!me) return null

  return (
    <div className="content-route-wrap content-route-wrap--paper">
      <div className="content-page">
      <header className="content-page-header">
        <h1>
          <span>공지사항</span>
        </h1>
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

      {detailOpen && detailRow ? (
        <div
          className="cp-modal-overlay"
          role="presentation"
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
            </div>
          </div>
        </div>
      ) : null}
      </div>
    </div>
  )
}
