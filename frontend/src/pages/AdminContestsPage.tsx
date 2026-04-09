import { useCallback, useEffect, useMemo, useState } from 'react'
import { HiXMark } from 'react-icons/hi2'
import { useConfirm } from '../context/ConfirmContext'
import { useAdminOutletContext } from '../components/admin/adminLayoutContext'
import { AdminContestHtmlEditor } from '../components/admin/AdminContestHtmlEditor'
import { PaginationBar } from '../components/common/PaginationBar'
import { appToast } from '../lib/appToast'
import { resolveHtmlMediaUrls } from '../lib/resolveHtmlMediaUrls'
import { DEFAULT_CONTEST_SOURCE } from '../features/contests/contestTypes'
import {
  deleteAdminContest,
  fetchAdminContestsPage,
  fetchContestSourcesForAdmin,
  insertAdminContest,
  updateAdminContest,
  type AdminContestRow,
} from '../services/adminContestsService'

const PAGE_SIZE = 25

function formatDt(iso: string | null | undefined) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('ko-KR', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function truncate(s: string, max: number) {
  const t = s.trim()
  if (t.length <= max) return t
  return t.slice(0, max) + '…'
}

export function AdminContestsPage() {
  const ctx = useAdminOutletContext()
  const me = ctx?.me
  const confirm = useConfirm()

  const [rows, setRows] = useState<AdminContestRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [sources, setSources] = useState<string[]>([])
  const [sourceFilter, setSourceFilter] = useState('')
  const [searchDraft, setSearchDraft] = useState('')
  const [searchApplied, setSearchApplied] = useState('')

  const [editOpen, setEditOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [editing, setEditing] = useState<AdminContestRow | null>(null)
  const [formNewSource, setFormNewSource] = useState('')
  const [formNewId, setFormNewId] = useState('')
  const [formTitle, setFormTitle] = useState('')
  const [formDDay, setFormDDay] = useState('')
  const [formHost, setFormHost] = useState('')
  const [formUrl, setFormUrl] = useState('')
  const [formCategory, setFormCategory] = useState('')
  const [formContent, setFormContent] = useState('')
  const [previewRow, setPreviewRow] = useState<AdminContestRow | null>(null)

  const previewHtmlSafe = useMemo(() => {
    if (!previewRow?.content?.trim()) return ''
    const raw = previewRow.content
    const pageUrl = String(previewRow.url || '').trim()
    return pageUrl ? resolveHtmlMediaUrls(raw, pageUrl) : raw
  }, [previewRow])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetchAdminContestsPage({
        page,
        pageSize: PAGE_SIZE,
        searchQ: searchApplied.trim() || undefined,
        sourceFilter: sourceFilter.trim() || undefined,
      })
      if (!r.success) {
        appToast(r.error, 'error')
        setRows([])
        setTotal(0)
      } else {
        setRows(r.rows)
        setTotal(r.total)
      }
    } finally {
      setLoading(false)
    }
  }, [page, searchApplied, sourceFilter])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    ;(async () => {
      const r = await fetchContestSourcesForAdmin()
      if (r.success) {
        setSources(r.sources)
        setFormNewSource((prev) => {
          if (prev.trim()) return prev
          return r.sources[0]?.trim() || DEFAULT_CONTEST_SOURCE
        })
      }
    })()
  }, [])

  const resetFormFields = () => {
    setFormTitle('')
    setFormDDay('')
    setFormHost('')
    setFormUrl('')
    setFormCategory('')
    setFormContent('')
  }

  const openCreate = () => {
    setEditing(null)
    setEditOpen(false)
    setFormNewSource(sources[0]?.trim() || DEFAULT_CONTEST_SOURCE)
    setFormNewId('')
    resetFormFields()
    setCreateOpen(true)
  }

  const openEdit = (row: AdminContestRow) => {
    setCreateOpen(false)
    setEditing(row)
    setFormTitle(row.title || '')
    setFormDDay(row.d_day || '')
    setFormHost(row.host || '')
    setFormUrl(row.url || '')
    setFormCategory(row.category || '')
    setFormContent(row.content || '')
    setEditOpen(true)
  }

  const submitCreate = async () => {
    const src = formNewSource.trim()
    const cid = formNewId.trim()
    if (!src || !cid) {
      appToast('출처와 게시글 ID를 입력해 주세요.', 'error')
      return
    }
    const r = await insertAdminContest({
      source: src,
      id: cid,
      title: formTitle.trim() || null,
      d_day: formDDay.trim() || null,
      host: formHost.trim() || null,
      url: formUrl.trim() || null,
      category: formCategory.trim() || null,
      content: formContent.trim() || null,
    })
    if (!r.success) {
      appToast(r.error, 'error')
      return
    }
    appToast('등록되었습니다.')
    setCreateOpen(false)
    setFormNewId('')
    resetFormFields()
    setPage(1)
    setSearchApplied('')
    setSearchDraft('')
    void load()
  }

  const submitEdit = async () => {
    if (!editing) return
    const r = await updateAdminContest(editing.source, editing.id, {
      title: formTitle.trim() || null,
      d_day: formDDay.trim() || null,
      host: formHost.trim() || null,
      url: formUrl.trim() || null,
      category: formCategory.trim() || null,
      content: formContent.trim() || null,
    })
    if (!r.success) {
      appToast(r.error, 'error')
      return
    }
    appToast('수정되었습니다.')
    setEditOpen(false)
    setEditing(null)
    void load()
  }

  const removeRow = async (row: AdminContestRow) => {
    const ok = await confirm({
      title: '공모전 글 삭제',
      message: `「${row.title || row.id}」(${row.source})를 삭제할까요? 댓글·북마크 등 연관 데이터가 함께 삭제될 수 있습니다.`,
      confirmText: '삭제',
      danger: true,
    })
    if (!ok) return
    const r = await deleteAdminContest(row.source, row.id)
    if (!r.success) {
      appToast(r.error, 'error')
      return
    }
    appToast('삭제되었습니다.')
    void load()
  }

  const applySearch = () => {
    setSearchApplied(searchDraft)
    setPage(1)
  }

  if (!ctx || !me) {
    return null
  }

  return (
    <div className="content-route-wrap admin-contests-page">
      <div className="content-page content-page--wide">
        <header className="content-page-header admin-users-header">
          <div>
            <h1>
              공모전 게시글 <span>관리</span>
            </h1>
            <p className="admin-dashboard-lead">
              contests 테이블 목록입니다. 새로 등록·수정·삭제할 수 있고, 목록에서 「본문 보기」로 저장된 HTML을 사용자 화면과
              비슷하게 미리 볼 수 있습니다. 수정 시에는 출처(source)와 ID가 키라서 바꿀 수 없습니다. RLS가 적용된 경우 관리자
              계정만 저장·삭제·등록됩니다.
            </p>
          </div>
          <div className="admin-notices-header-actions">
            <button type="button" className="btn-secondary" onClick={() => void load()} disabled={loading}>
              새로고침
            </button>
            <button type="button" className="btn-write" onClick={openCreate}>
              새로 등록
            </button>
          </div>
        </header>

        <div className="admin-contests-toolbar">
          <label className="admin-contests-filter">
            <span className="admin-contests-filter-label">출처</span>
            <select
              className="admin-exp-select"
              value={sourceFilter}
              onChange={(e) => {
                setSourceFilter(e.target.value)
                setPage(1)
              }}
            >
              <option value="">전체</option>
              {sources.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <div className="admin-contests-search">
            <input
              type="search"
              className="admin-contests-search-input"
              placeholder="제목·주최·ID 검색"
              value={searchDraft}
              onChange={(e) => setSearchDraft(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && applySearch()}
            />
            <button type="button" className="btn-secondary" onClick={applySearch}>
              검색
            </button>
          </div>
        </div>

        <div className="admin-users-toolbar">
          <span className="admin-users-count">
            {loading ? '불러오는 중…' : `총 ${total.toLocaleString('ko-KR')}건`}
          </span>
        </div>

        <div className="admin-users-table-wrap admin-contests-table-wrap">
          {loading ? (
            <p className="admin-users-state">불러오는 중…</p>
          ) : rows.length === 0 ? (
            <p className="admin-users-state">조건에 맞는 공모전 글이 없습니다.</p>
          ) : (
            <table className="admin-users-table admin-contests-table">
              <thead>
                <tr>
                  <th scope="col" className="admin-users-col-no">
                    No
                  </th>
                  <th scope="col">출처</th>
                  <th scope="col">ID</th>
                  <th scope="col">제목</th>
                  <th scope="col">D-day</th>
                  <th scope="col">주최/주관</th>
                  <th scope="col">카테고리</th>
                  <th scope="col">업데이트</th>
                  <th scope="col">작업</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => {
                  const rowNo = (page - 1) * PAGE_SIZE + index + 1
                  const title = row.title || '—'
                  const hasBody = Boolean(row.content?.trim())
                  return (
                    <tr key={`${row.source}:${row.id}`}>
                      <td className="admin-users-col-no">{rowNo}</td>
                      <td className="admin-contests-cell-nowrap">{row.source}</td>
                      <td className="admin-contests-cell-id" title={row.id}>
                        {truncate(row.id, 12)}
                      </td>
                      <td className="admin-contests-cell-title" title={title}>
                        {truncate(title, 40)}
                      </td>
                      <td>{row.d_day || '—'}</td>
                      <td className="admin-contests-cell-host" title={row.host || ''}>
                        {truncate(row.host || '—', 20)}
                      </td>
                      <td className="admin-contests-cell-nowrap">{row.category || '—'}</td>
                      <td className="admin-contests-cell-date">{formatDt(row.updated_at)}</td>
                      <td>
                        <div className="admin-notices-row-actions admin-contests-row-actions">
                          <button
                            type="button"
                            className="btn-secondary"
                            onClick={() => setPreviewRow(row)}
                            title={hasBody ? '저장된 본문을 렌더링해 봅니다' : '저장된 본문이 없습니다'}
                          >
                            본문 보기
                          </button>
                          <button type="button" className="btn-secondary" onClick={() => openEdit(row)}>
                            수정
                          </button>
                          <button type="button" className="btn-secondary btn-delete" onClick={() => void removeRow(row)}>
                            삭제
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        <PaginationBar total={total} page={page} pageSize={PAGE_SIZE} onGo={(p) => setPage(p)} />
      </div>

      {editOpen && editing ? (
        <div className="cp-modal-overlay" role="presentation">
          <div className="cp-modal cp-modal--wide">
            <div className="cp-modal-header">
              <h2>공모전 글 수정</h2>
              <button
                type="button"
                className="cp-modal-close"
                aria-label="닫기"
                onClick={() => {
                  setEditOpen(false)
                  setEditing(null)
                }}
              >
                <HiXMark className="cp-modal-close-ico" aria-hidden />
              </button>
            </div>
            <div className="cp-modal-body admin-contests-edit-body">
              <p className="admin-contests-edit-keys">
                <strong>출처</strong> {editing.source} · <strong>ID</strong> {editing.id}
              </p>
              <div className="cp-form-group">
                <label htmlFor="admin-contest-title">제목</label>
                <input
                  id="admin-contest-title"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  autoComplete="off"
                />
              </div>
              <div className="cp-form-group cp-form-row-2">
                <div>
                  <label htmlFor="admin-contest-dday">D-day</label>
                  <input id="admin-contest-dday" value={formDDay} onChange={(e) => setFormDDay(e.target.value)} />
                </div>
                <div>
                  <label htmlFor="admin-contest-cat">카테고리</label>
                  <input id="admin-contest-cat" value={formCategory} onChange={(e) => setFormCategory(e.target.value)} />
                </div>
              </div>
              <div className="cp-form-group">
                <label htmlFor="admin-contest-host">주최/주관</label>
                <input id="admin-contest-host" value={formHost} onChange={(e) => setFormHost(e.target.value)} />
              </div>
              <div className="cp-form-group">
                <label htmlFor="admin-contest-url">URL</label>
                <input id="admin-contest-url" value={formUrl} onChange={(e) => setFormUrl(e.target.value)} />
              </div>
              <div className="cp-form-group">
                <label htmlFor="admin-contest-content">본문 HTML (content)</label>
                <AdminContestHtmlEditor
                  id="admin-contest-content"
                  value={formContent}
                  onChange={setFormContent}
                  pageUrl={formUrl}
                />
              </div>
            </div>
            <div className="cp-modal-footer">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  setEditOpen(false)
                  setEditing(null)
                }}
              >
                취소
              </button>
              <button type="button" className="btn-write" onClick={() => void submitEdit()}>
                저장
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {previewRow ? (
        <div className="cp-modal-overlay" role="presentation">
          <div className="cp-modal cp-modal--wide admin-contests-preview-modal">
            <div className="cp-modal-header">
              <h2>본문 미리보기</h2>
              <button
                type="button"
                className="cp-modal-close"
                aria-label="닫기"
                onClick={() => setPreviewRow(null)}
              >
                <HiXMark className="cp-modal-close-ico" aria-hidden />
              </button>
            </div>
            <div className="cp-modal-body admin-contests-preview-body">
              <p className="admin-contests-edit-keys">
                <strong>출처</strong> {previewRow.source} · <strong>ID</strong> {previewRow.id}
                {previewRow.title ? (
                  <>
                    {' '}
                    · <strong>제목</strong> {previewRow.title}
                  </>
                ) : null}
              </p>
              {previewRow.url?.trim() ? (
                <p className="admin-contests-preview-original">
                  <a href={previewRow.url.trim()} target="_blank" rel="noreferrer">
                    원문 페이지 열기
                  </a>
                </p>
              ) : null}
              {previewHtmlSafe ? (
                <div className="admin-contests-preview-scroll">
                  <div
                    className="admin-contests-preview-html"
                    dangerouslySetInnerHTML={{ __html: previewHtmlSafe }}
                  />
                </div>
              ) : (
                <p className="admin-contests-preview-empty">저장된 본문(content)이 없습니다. 수정에서 HTML을 입력하면 여기서 확인할 수 있습니다.</p>
              )}
            </div>
            <div className="cp-modal-footer">
              <button type="button" className="btn-secondary" onClick={() => setPreviewRow(null)}>
                닫기
              </button>
              <button
                type="button"
                className="btn-write"
                onClick={() => {
                  const r = previewRow
                  setPreviewRow(null)
                  openEdit(r)
                }}
              >
                이 글 수정
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {createOpen ? (
        <div className="cp-modal-overlay" role="presentation">
          <div className="cp-modal cp-modal--wide">
            <div className="cp-modal-header">
              <h2>공모전 글 등록</h2>
              <button type="button" className="cp-modal-close" aria-label="닫기" onClick={() => setCreateOpen(false)}>
                <HiXMark className="cp-modal-close-ico" aria-hidden />
              </button>
            </div>
            <div className="cp-modal-body admin-contests-edit-body">
              <p className="admin-contests-edit-keys">
                출처와 ID는 필수이며, 동일한 조합이 이미 있으면 등록되지 않습니다.
              </p>
              <div className="cp-form-group cp-form-row-2">
                <div>
                  <label htmlFor="admin-contest-create-source">출처 (source) *</label>
                  <input
                    id="admin-contest-create-source"
                    value={formNewSource}
                    onChange={(e) => setFormNewSource(e.target.value)}
                    list="admin-contest-source-datalist"
                    placeholder={DEFAULT_CONTEST_SOURCE}
                    autoComplete="off"
                  />
                  <datalist id="admin-contest-source-datalist">
                    {sources.map((s) => (
                      <option key={s} value={s} />
                    ))}
                  </datalist>
                </div>
                <div>
                  <label htmlFor="admin-contest-create-id">게시글 ID *</label>
                  <input
                    id="admin-contest-create-id"
                    value={formNewId}
                    onChange={(e) => setFormNewId(e.target.value)}
                    placeholder="출처 내 고유 ID"
                    autoComplete="off"
                  />
                </div>
              </div>
              <div className="cp-form-group">
                <label htmlFor="admin-contest-create-title">제목</label>
                <input
                  id="admin-contest-create-title"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  autoComplete="off"
                />
              </div>
              <div className="cp-form-group cp-form-row-2">
                <div>
                  <label htmlFor="admin-contest-create-dday">D-day</label>
                  <input id="admin-contest-create-dday" value={formDDay} onChange={(e) => setFormDDay(e.target.value)} />
                </div>
                <div>
                  <label htmlFor="admin-contest-create-cat">카테고리</label>
                  <input id="admin-contest-create-cat" value={formCategory} onChange={(e) => setFormCategory(e.target.value)} />
                </div>
              </div>
              <div className="cp-form-group">
                <label htmlFor="admin-contest-create-host">주최/주관</label>
                <input id="admin-contest-create-host" value={formHost} onChange={(e) => setFormHost(e.target.value)} />
              </div>
              <div className="cp-form-group">
                <label htmlFor="admin-contest-create-url">URL</label>
                <input id="admin-contest-create-url" value={formUrl} onChange={(e) => setFormUrl(e.target.value)} />
              </div>
              <div className="cp-form-group">
                <label htmlFor="admin-contest-create-content">본문 HTML (content)</label>
                <AdminContestHtmlEditor
                  id="admin-contest-create-content"
                  value={formContent}
                  onChange={setFormContent}
                  pageUrl={formUrl}
                />
              </div>
            </div>
            <div className="cp-modal-footer">
              <button type="button" className="btn-secondary" onClick={() => setCreateOpen(false)}>
                취소
              </button>
              <button type="button" className="btn-write" onClick={() => void submitCreate()}>
                등록
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
