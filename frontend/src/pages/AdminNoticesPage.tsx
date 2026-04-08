import { useCallback, useEffect, useState } from 'react'
import { HiXMark } from 'react-icons/hi2'
import { useConfirm } from '../context/ConfirmContext'
import { useAdminOutletContext } from '../components/admin/adminLayoutContext'
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
  if (!iso) return '—'
  return new Date(iso).toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function AdminNoticesPage() {
  const ctx = useAdminOutletContext()
  const me = ctx?.me
  const confirm = useConfirm()

  const [rows, setRows] = useState<NoticeRow[]>([])
  const [loading, setLoading] = useState(true)

  const [detailOpen, setDetailOpen] = useState(false)
  const [detailRow, setDetailRow] = useState<NoticeRow | null>(null)

  const [writeOpen, setWriteOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [formTitle, setFormTitle] = useState('')
  const [formBody, setFormBody] = useState('')
  const [formPinned, setFormPinned] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetchNoticesList()
      if (!r.success) {
        appToast(r.error || '목록을 불러오지 못했습니다.', 'error')
        setRows([])
      } else {
        setRows(r.data || [])
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const openDetail = async (id: string) => {
    const r = await fetchNoticeDetail(id)
    if (!r.success || !r.data) {
      appToast(r.error || '상세를 불러오지 못했습니다.', 'error')
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

  const openEditFromRow = (n: NoticeRow) => {
    setEditId(n.id)
    setFormTitle(n.title || '')
    setFormBody(n.body || '')
    setFormPinned(!!n.is_pinned)
    setDetailOpen(false)
    setWriteOpen(true)
  }

  const openEditFromDetail = () => {
    if (!detailRow) return
    openEditFromRow(detailRow)
  }

  const submitWrite = async () => {
    const title = formTitle.trim()
    if (!title) {
      appToast('제목을 입력해 주세요.', 'error')
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
        appToast(r.error || '수정에 실패했습니다.', 'error')
        return
      }
      appToast('수정되었습니다.')
    } else {
      const r = await createNotice({
        title,
        body: formBody.trim(),
        is_pinned: formPinned,
        authorId: me.user_id,
      })
      if (!r.success) {
        appToast(r.error || '등록에 실패했습니다.', 'error')
        return
      }
      appToast('공지사항이 등록되었습니다.')
    }
    setWriteOpen(false)
    void load()
  }

  const removeNotice = async (id: string) => {
    const ok = await confirm({
      title: '공지사항 삭제',
      message: '이 공지사항을 삭제할까요?',
      confirmText: '삭제',
      danger: true,
    })
    if (!ok) return
    const r = await deleteNotice(id)
    if (!r.success) {
      appToast(r.error || '삭제에 실패했습니다.', 'error')
      return
    }
    appToast('삭제되었습니다.')
    setDetailOpen(false)
    void load()
  }

  if (!ctx || !me) {
    return null
  }

  return (
    <div className="content-route-wrap admin-notices-page">
      <div className="content-page content-page--wide">
        <header className="content-page-header admin-users-header">
          <div>
            <h1>
              공지사항 <span>관리</span>
            </h1>
            <p className="admin-dashboard-lead">
              등록·수정·삭제는 이 화면에서만 진행합니다. 일반 회원용 목록은 서비스 메뉴의 공지사항에서 확인할 수 있습니다.
            </p>
          </div>
          <div className="admin-notices-header-actions">
            <button type="button" className="btn-secondary" onClick={() => void load()} disabled={loading}>
              새로고침
            </button>
            <button type="button" className="btn-write" onClick={openWriteNew}>
              글쓰기
            </button>
          </div>
        </header>

        <div className="admin-users-table-wrap">
          {loading ? (
            <p className="admin-users-state">불러오는 중…</p>
          ) : rows.length === 0 ? (
            <p className="admin-users-state">등록된 공지사항이 없습니다.</p>
          ) : (
            <table className="admin-users-table admin-notices-table">
              <thead>
                <tr>
                  <th scope="col" className="admin-users-col-no">
                    No
                  </th>
                  <th scope="col">제목</th>
                  <th scope="col">고정</th>
                  <th scope="col">작성자</th>
                  <th scope="col">등록일</th>
                  <th scope="col">작업</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((n, index) => (
                  <tr key={n.id}>
                    <td className="admin-users-col-no">{index + 1}</td>
                    <td>
                      <button type="button" className="admin-notice-title-link" onClick={() => void openDetail(n.id)}>
                        {n.title}
                      </button>
                    </td>
                    <td>{n.is_pinned ? <span className="admin-notice-pinned">고정</span> : '—'}</td>
                    <td>{n.author_nickname || '—'}</td>
                    <td className="admin-notice-date">{formatDate(n.created_at)}</td>
                    <td>
                      <div className="admin-notices-row-actions">
                        <button type="button" className="btn-secondary" onClick={() => openEditFromRow(n)}>
                          수정
                        </button>
                        <button type="button" className="btn-secondary btn-delete" onClick={() => void removeNotice(n.id)}>
                          삭제
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
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
                <label htmlFor="admin-notice-title">제목 *</label>
                <input
                  id="admin-notice-title"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="제목을 입력하세요"
                />
              </div>
              <div className="cp-form-group">
                <label htmlFor="admin-notice-body">내용</label>
                <textarea
                  id="admin-notice-body"
                  value={formBody}
                  onChange={(e) => setFormBody(e.target.value)}
                  placeholder="내용을 입력하세요"
                />
              </div>
              <div className="cp-form-group admin-notice-pin-row">
                <input
                  id="admin-notice-pin"
                  type="checkbox"
                  checked={formPinned}
                  onChange={(e) => setFormPinned(e.target.checked)}
                />
                <label htmlFor="admin-notice-pin">상단 고정</label>
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
                {detailRow.is_pinned ? <span className="admin-notice-pinned">고정</span> : null}{' '}
                {detailRow.author_nickname ? <span>{detailRow.author_nickname} · </span> : null}
                <span>{formatDate(detailRow.created_at)}</span>
              </div>
              <div className="cp-detail-body">{detailRow.body || '(내용 없음)'}</div>
              <div className="cp-detail-actions">
                <button type="button" className="btn-write" onClick={() => openEditFromDetail()}>
                  수정
                </button>
                <button type="button" className="btn-secondary btn-delete" onClick={() => void removeNotice(detailRow.id)}>
                  삭제
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
