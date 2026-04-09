import { Fragment, useCallback, useEffect, useState } from 'react'
import { HiFolder, HiPlus, HiStar } from 'react-icons/hi2'
import { Link } from 'react-router-dom'
import { useConfirm } from '../context/ConfirmContext'
import { appToast } from '../lib/appToast'
import {
  assignBookmarkToFolder,
  createBookmarkFolder,
  deleteBookmarkFolder,
  fetchBookmarkFolderCounts,
  fetchBookmarkedContests,
  fetchBookmarkFolders,
  toggleBookmark,
  updateBookmarkFolder,
  type BookmarkFolderCounts,
  type BookmarkFolderRow,
  type BookmarkFolderFilter,
} from '../services/contestService'

type FolderNav = 'all' | 'unfiled' | string

function truncateWithEllipsis(s: unknown, maxLen = 12) {
  const str = String(s ?? '')
    .trim()
    .replace(/\s+/g, ' ')
  if (!str) return '공모전'
  return str.length > maxLen ? str.slice(0, maxLen) + '…' : str
}

function ddayClass(d: unknown) {
  const s = String(d ?? '').trim()
  if (s.includes('마감')) return 'urgent'
  if (s.includes('오늘')) return 'today'
  return 'normal'
}

function BookmarkFolderModal({
  title,
  initial,
  onClose,
  onSave,
}: {
  title: string
  initial: string
  onClose: () => void
  onSave: (name: string) => Promise<void>
}) {
  const [value, setValue] = useState(initial)
  useEffect(() => {
    setValue(initial)
  }, [initial])

  return (
    <div className="bm-modal-overlay" role="presentation">
      <div className="bm-modal" role="dialog" aria-labelledby="modal-folder-title">
        <h3 id="modal-folder-title">{title}</h3>
        <input
          type="text"
          placeholder="폴더 이름"
          value={value}
          autoFocus
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              const n = value.trim()
              if (!n) return
              void (async () => {
                try {
                  await onSave(n)
                } catch {
                  /* 실패 시 부모에서 토스트 처리 */
                }
              })()
            }
          }}
        />
        <div className="bm-modal-btns">
          <button type="button" className="btn-secondary" onClick={onClose}>
            취소
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={() => {
              void (async () => {
                const n = value.trim()
                if (!n) return
                try {
                  await onSave(n)
                } catch {
                  /* */
                }
              })()
            }}
          >
            확인
          </button>
        </div>
      </div>
    </div>
  )
}

export function BookmarksPage() {
  const confirm = useConfirm()
  const [folderNav, setFolderNav] = useState<FolderNav>('all')
  const [folders, setFolders] = useState<BookmarkFolderRow[]>([])
  const [counts, setCounts] = useState<BookmarkFolderCounts>({ all: 0, unfiled: 0, folders: {} })
  const [rows, setRows] = useState<Record<string, unknown>[]>([])
  const [loading, setLoading] = useState(true)
  const [tableErr, setTableErr] = useState(false)
  const [modal, setModal] = useState<{
    title: string
    initial: string
    /** 성공 시 resolve, 검증/API 실패 시 reject (모달 유지) */
    onSave: (n: string) => Promise<void>
  } | null>(null)

  const loadFolderSidebar = useCallback(async () => {
    const [fr, cr] = await Promise.all([fetchBookmarkFolders(), fetchBookmarkFolderCounts()])
    if (fr.success) setFolders(fr.data)
    if (cr.success) setCounts(cr.data)
  }, [])

  const loadTable = useCallback(async () => {
    setLoading(true)
    setTableErr(false)
    const filter: BookmarkFolderFilter =
      folderNav === 'all' ? 'all' : folderNav === 'unfiled' ? 'unfiled' : folderNav
    const res = await fetchBookmarkedContests(filter)
    if (!res.success) {
      setTableErr(true)
      setRows([])
    } else {
      setRows(res.data)
    }
    setLoading(false)
  }, [folderNav])

  useEffect(() => {
    void loadFolderSidebar()
  }, [loadFolderSidebar])

  useEffect(() => {
    void loadTable()
  }, [loadTable])

  const openCreateRoot = () => {
    setModal({
      title: '새 폴더',
      initial: '',
      onSave: async (name) => {
        const r = await createBookmarkFolder(name, null)
        if (!r.success) {
          appToast(r.error || '오류', 'error')
          throw new Error(r.error)
        }
        await loadFolderSidebar()
        appToast('폴더를 추가했습니다')
      },
    })
  }

  const onFolderPanelClick = async (e: React.MouseEvent<HTMLDivElement>) => {
    const t = e.target as HTMLElement
    const btn = t.closest<HTMLButtonElement>('button[data-bm-action]')
    if (btn) {
      e.stopPropagation()
      const action = btn.dataset.bmAction
      const id = btn.dataset.id || ''
      const parent = btn.dataset.parent || ''
      if (action === 'add-child') {
        setModal({
          title: '새 하위 폴더',
          initial: '',
          onSave: async (name) => {
            const r = await createBookmarkFolder(name, parent)
            if (!r.success) {
              appToast(r.error || '오류', 'error')
              throw new Error(r.error)
            }
            await loadFolderSidebar()
            appToast('폴더를 추가했습니다')
          },
        })
        return
      }
      if (action === 'rename') {
        const f = folders.find((x) => x.id === id)
        setModal({
          title: '폴더 이름 변경',
          initial: f?.name || '',
          onSave: async (name) => {
            const r = await updateBookmarkFolder(id, { name })
            if (!r.success) {
              appToast(r.error || '오류', 'error')
              throw new Error(r.error)
            }
            await loadFolderSidebar()
            await loadTable()
            appToast('이름을 변경했습니다')
          },
        })
        return
      }
      if (action === 'delete') {
        const ok = await confirm({
          message: '이 폴더를 삭제할까요? 폴더 안 북마크는 미분류로 이동합니다.',
          confirmText: '삭제',
          danger: true,
        })
        if (!ok) return
        const r = await deleteBookmarkFolder(id)
        if (!r.success) {
          appToast(r.error || '오류', 'error')
          return
        }
        await loadFolderSidebar()
        await loadTable()
        appToast('폴더를 삭제했습니다')
      }
      return
    }

    const hit = t.closest<HTMLElement>('[data-bm-folder-id]')
    if (!hit) return
    const fid = hit.dataset.bmFolderId
    if (fid === 'all') setFolderNav('all')
    else if (fid === 'unfiled') setFolderNav('unfiled')
    else if (fid) setFolderNav(fid)
  }

  const onToggleStar = async (source: string, contestId: string) => {
    const j = await toggleBookmark(source, contestId)
    if (!j.success || !('bookmarked' in j)) {
      appToast('오류가 발생했습니다', 'error')
      return
    }
    if (!j.bookmarked) {
      await loadFolderSidebar()
      await loadTable()
      appToast('북마크에서 제거했습니다')
    }
  }

  const onFolderSelectChange = async (source: string, contestId: string, raw: string) => {
    const folderId = raw ? raw : null
    const r = await assignBookmarkToFolder(source, contestId, folderId)
    if (!r.success) {
      appToast('오류가 발생했습니다', 'error')
      return
    }
    await loadFolderSidebar()
    await loadTable()
    appToast('폴더에 추가했습니다')
  }

  const roots = folders.filter((f) => !f.parent_id)
  const children = folders.filter((f) => f.parent_id)
  const n = (v: number | undefined) => v ?? 0

  return (
    <div className="bookmarks-page">
      {modal ? (
        <BookmarkFolderModal
          title={modal.title}
          initial={modal.initial}
          onClose={() => setModal(null)}
          onSave={async (name) => {
            try {
              await modal.onSave(name)
              setModal(null)
            } catch {
              /* 실패 시 모달 유지 */
            }
          }}
        />
      ) : null}

      <div className="bookmarks-layout">
        <aside className="bookmarks-folder-panel">
          <div className="bm-folder-panel-title">폴더</div>
          <div onClick={onFolderPanelClick} role="presentation">
            <div
              className={`folder-virtual folder-all ${folderNav === 'all' ? 'active' : ''}`}
              data-bm-folder-id="all"
            >
              <span>전체</span>
              <span className="folder-count">{n(counts.all)}</span>
            </div>
            <div
              className={`folder-virtual folder-unfiled ${folderNav === 'unfiled' ? 'active' : ''}`}
              data-bm-folder-id="unfiled"
            >
              <span>미분류</span>
              <span className="folder-count">{n(counts.unfiled)}</span>
            </div>
            {roots.length > 0 ? <div className="folder-divider" /> : null}
            {roots.map((r) => {
              const subs = children.filter((c) => c.parent_id === r.id)
              const canAddChild = subs.length < 10
              const cnt = counts.folders[r.id] || 0
              return (
                <div key={r.id} className="folder-group">
                  <div
                    className={`folder-item level-1 ${folderNav === r.id ? 'active' : ''}`}
                    data-bm-folder-id={r.id}
                  >
                    <span className="folder-left">
                      <span className="folder-icon">
                        <HiFolder aria-hidden />
                      </span>
                      <span className="folder-name">{r.name}</span>
                    </span>
                    <span className="folder-right">
                      <span className="folder-count">{n(cnt)}</span>
                      <span className="folder-actions">
                        {canAddChild ? (
                          <button type="button" data-bm-action="add-child" data-parent={r.id} title="하위 폴더">
                            <HiPlus className="folder-action-ico" aria-hidden />
                          </button>
                        ) : null}
                        <button type="button" data-bm-action="rename" data-id={r.id}>
                          수정
                        </button>
                        <button type="button" data-bm-action="delete" data-id={r.id}>
                          삭제
                        </button>
                      </span>
                    </span>
                  </div>
                  {subs.map((c) => {
                    const cnt2 = counts.folders[c.id] || 0
                    return (
                      <div
                        key={c.id}
                        className={`folder-item level-2 ${folderNav === c.id ? 'active' : ''}`}
                        data-bm-folder-id={c.id}
                      >
                        <span className="folder-left">
                          <span className="folder-name">{c.name}</span>
                        </span>
                        <span className="folder-right">
                          <span className="folder-count">{n(cnt2)}</span>
                          <span className="folder-actions">
                            <button type="button" data-bm-action="rename" data-id={c.id}>
                              수정
                            </button>
                            <button type="button" data-bm-action="delete" data-id={c.id}>
                              삭제
                            </button>
                          </span>
                        </span>
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>
          <button type="button" className="btn-add-folder" onClick={openCreateRoot}>
            <HiPlus className="btn-add-folder-ico" aria-hidden />
            새 폴더
          </button>
        </aside>

        <main className="bookmarks-main">
          <header className="bm-page-header">
            <h1>
              <span>즐겨찾기</span> - 북마크한 공고
            </h1>
          </header>

          <div className="bm-table-wrap">
            <table className="bm-table">
              <thead>
                <tr>
                  <th style={{ width: 40 }} title="북마크 해제" className="bm-th-ico">
                    <HiStar className="bm-th-star" aria-hidden />
                  </th>
                  <th style={{ width: 50 }}>No</th>
                  <th style={{ width: 70 }}>D-day</th>
                  <th style={{ width: '28%' }}>제목</th>
                  <th style={{ width: '18%' }}>주최/주관</th>
                  <th style={{ width: 90 }}>카테고리</th>
                  <th style={{ width: 70 }}>출처</th>
                  <th style={{ width: 110 }}>폴더</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={8} className="bm-loading">
                      로딩 중
                    </td>
                  </tr>
                ) : tableErr ? (
                  <tr>
                    <td colSpan={8} className="bm-empty">
                      데이터를 불러올 수 없습니다.
                    </td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="bm-empty">
                      <p>북마크한 공고가 없습니다.</p>
                      <p className="bm-empty-hint-star">
                        <Link to="/">공모전 목록</Link>에서{' '}
                        <HiStar className="bm-inline-star" aria-hidden />를 눌러 즐겨찾기에 추가해 보세요.
                      </p>
                    </td>
                  </tr>
                ) : (
                  rows.map((row, idx) => {
                    const source = String(row.source ?? '요즘것들')
                    const id = String(row.id ?? '')
                    const url = String(row.url ?? '#')
                    const title = String(row.title ?? '')
                    const fid = row.folder_id != null ? String(row.folder_id) : ''
                    return (
                      <tr key={`${source}:${id}`} data-id={id} data-source={source}>
                        <td onClick={(e) => e.stopPropagation()}>
                          <span
                            className="bookmark-star"
                            role="button"
                            tabIndex={0}
                            title="북마크 해제"
                            onClick={() => onToggleStar(source, id)}
                            onKeyDown={(e) => e.key === 'Enter' && onToggleStar(source, id)}
                          >
                            <HiStar className="bookmark-star__ico" aria-hidden />
                          </span>
                        </td>
                        <td>{idx + 1}</td>
                        <td>
                          <span className={`bm-d-day ${ddayClass(row.d_day)}`}>{String(row.d_day ?? '-')}</span>
                        </td>
                        <td className="bm-title-cell">
                          <a href={url} target="_blank" rel="noopener noreferrer" title={title}>
                            {title}
                          </a>
                        </td>
                        <td className="bm-host-cell" title={String(row.host ?? '')}>
                          {String(row.host ?? '-')}
                        </td>
                        <td className="bm-category-cell" title={String(row.category ?? '공모전')}>
                          {truncateWithEllipsis(row.category, 12)}
                        </td>
                        <td>{source}</td>
                        <td onClick={(e) => e.stopPropagation()}>
                          <select
                            className="bm-folder-select"
                            value={fid}
                            onChange={(e) => onFolderSelectChange(source, id, e.target.value)}
                            aria-label="폴더"
                          >
                            <option value="">미분류</option>
                            {roots.map((r) => (
                              <Fragment key={r.id}>
                                <option value={r.id}>{r.name}</option>
                                {children
                                  .filter((c) => c.parent_id === r.id)
                                  .map((c) => (
                                    <option key={c.id} value={c.id}>
                                      &nbsp;&nbsp;└ {c.name}
                                    </option>
                                  ))}
                              </Fragment>
                            ))}
                          </select>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </main>
      </div>
    </div>
  )
}
