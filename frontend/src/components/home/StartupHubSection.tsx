import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { useConfirm } from '../../context/ConfirmContext'
import { useStartupRefreshCountdown } from '../../hooks/useStartupRefreshCountdown'
import { PaginationBar } from '../common/PaginationBar'
import { appToast } from '../../lib/appToast'
import {
  fetchStartupAnnouncements,
  fetchStartupBusiness,
  deleteStartupComment,
  fetchStartupComments,
  fetchStartupContentChecks,
  postStartupComment,
  postStartupContentCheck,
  type StartupCommentRow,
} from '../../services/startupService'

const STARTUP_PAGE_SIZE = 10
const STORAGE_DISMISSED = 'ar_startup_row_unread_dismissed_v1'

type HubTab = 'business' | 'announcements'

type RowRec = Record<string, unknown>

function truncate(s: string, max: number) {
  const t = s.trim()
  if (t.length <= max) return t
  return t.slice(0, max)
}

function str(val: unknown) {
  if (val == null) return '-'
  const t = String(val).trim()
  return t || '-'
}

function formatListTime(iso: unknown): string {
  if (iso == null || iso === '') return '-'
  try {
    const d = new Date(String(iso))
    if (Number.isNaN(d.getTime())) return '-'
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    const h = String(d.getHours()).padStart(2, '0')
    const min = String(d.getMinutes()).padStart(2, '0')
    return `${m}/${day} ${h}:${min}`
  } catch {
    return '-'
  }
}

function loadDismissedInit(): Set<string> {
  try {
    const raw = sessionStorage.getItem(STORAGE_DISMISSED)
    if (!raw) return new Set()
    const arr = JSON.parse(raw) as unknown
    if (!Array.isArray(arr)) return new Set()
    return new Set(arr.map(String))
  } catch {
    return new Set()
  }
}

function persistDismissed(s: Set<string>) {
  try {
    sessionStorage.setItem(STORAGE_DISMISSED, JSON.stringify([...s]))
  } catch {
    /* ignore */
  }
}

function StartupCommentsBlock({
  itemType,
  itemId,
  refreshBust,
  showToast,
  currentUserId,
}: {
  itemType: 'business' | 'announcement'
  itemId: string
  refreshBust: number
  showToast: (msg: string, type?: 'success' | 'error') => void
  currentUserId: string
}) {
  const confirm = useConfirm()
  const [rows, setRows] = useState<StartupCommentRow[]>([])
  const [loading, setLoading] = useState(true)
  const [text, setText] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const r = await fetchStartupComments(itemType, itemId)
    if (r.success) setRows(r.data)
    setLoading(false)
  }, [itemType, itemId, refreshBust])

  useEffect(() => {
    void load()
  }, [load])

  const submit = async () => {
    const body = text.trim()
    if (!body) {
      showToast('글을 작성해주세요.', 'error')
      return
    }
    const r = await postStartupComment(itemType, itemId, body)
    if (r.success) {
      setText('')
      void load()
      showToast('댓글이 등록되었습니다.')
    } else {
      showToast(r.error || '등록 실패', 'error')
    }
  }

  const handleDelete = async (commentId: string) => {
    const ok = await confirm({
      title: '댓글 삭제',
      message: '이 댓글을 삭제할까요?',
      confirmText: '삭제',
      danger: true,
    })
    if (!ok) return
    const r = await deleteStartupComment(commentId)
    if (r.success) {
      void load()
      showToast('삭제했습니다.')
    } else showToast(r.error || '삭제 실패', 'error')
  }

  return (
    <div className="detail-comments startup-hub-comments" data-item-type={itemType} data-item-id={itemId}>
      <div className="detail-comments-title">댓글</div>
      <div className="detail-comments-list">
        {loading ? (
          <div className="detail-comment-empty">댓글 불러오는 중…</div>
        ) : !rows.length ? (
          <div className="detail-comment-empty">아직 댓글이 없습니다.</div>
        ) : (
          rows.map((c) => {
            const cid = String(c.id)
            const own = c.user_id && String(c.user_id) === String(currentUserId)
            return (
              <div key={cid} className="detail-comment-item">
                <div className="detail-comment-header">
                  <div
                    className="detail-comment-avatar"
                    style={
                      c.author_profile_url ? { backgroundImage: `url('${c.author_profile_url}')` } : undefined
                    }
                  >
                    {!c.author_profile_url ? (
                      <span>{(c.author_nickname || '?').slice(0, 1).toUpperCase()}</span>
                    ) : null}
                  </div>
                  <span className="detail-comment-nickname">{c.author_nickname || '익명'}</span>
                  {c.created_at ? (
                    <span className="detail-comment-time">{new Date(c.created_at).toLocaleString('ko-KR')}</span>
                  ) : null}
                </div>
                <div className="detail-comment-body">{c.body || ''}</div>
                {own && cid ? (
                  <button type="button" className="comment-delete-btn" onClick={() => void handleDelete(cid)}>
                    삭제
                  </button>
                ) : null}
              </div>
            )
          })
        )}
      </div>
      <div className="detail-comment-form">
        <textarea
          placeholder="댓글을 입력하세요"
          rows={2}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <button type="button" className="btn btn-primary detail-comment-submit" onClick={() => void submit()}>
          등록
        </button>
      </div>
    </div>
  )
}

type HubProps = { currentUserId: string }

export function StartupHubSection({ currentUserId }: HubProps) {
  const { countdownText, dateTimeText } = useStartupRefreshCountdown()
  const [tab, setTab] = useState<HubTab>('business')

  const [bizPage, setBizPage] = useState(1)
  const [annPage, setAnnPage] = useState(1)
  const [bizTotal, setBizTotal] = useState(0)
  const [annTotal, setAnnTotal] = useState(0)
  const [bizRows, setBizRows] = useState<RowRec[]>([])
  const [annRows, setAnnRows] = useState<RowRec[]>([])
  const [bizQDraft, setBizQDraft] = useState('')
  const [annQDraft, setAnnQDraft] = useState('')
  const [bizQ, setBizQ] = useState('')
  const [annQ, setAnnQ] = useState('')
  const [loadingBiz, setLoadingBiz] = useState(true)
  const [loadingAnn, setLoadingAnn] = useState(true)

  const [contentChecks, setContentChecks] = useState<Set<string>>(new Set())
  const [dismissed, setDismissed] = useState<Set<string>>(() => loadDismissedInit())

  const [expandedBizId, setExpandedBizId] = useState<string | null>(null)
  const [expandedAnnId, setExpandedAnnId] = useState<string | null>(null)
  const [commentsBust, setCommentsBust] = useState(0)

  const showToast = useCallback((msg: string, type: 'success' | 'error' = 'success') => {
    appToast(msg, type)
  }, [])

  const sortedBiz = useMemo(() => {
    const arr = [...bizRows]
    arr.sort((a, b) => {
      const ak = `business:${a.id}`
      const bk = `business:${b.id}`
      return Number(contentChecks.has(ak)) - Number(contentChecks.has(bk))
    })
    return arr
  }, [bizRows, contentChecks])

  const sortedAnn = useMemo(() => {
    const arr = [...annRows]
    arr.sort((a, b) => {
      const ak = `announcement:${a.id}`
      const bk = `announcement:${b.id}`
      return Number(contentChecks.has(ak)) - Number(contentChecks.has(bk))
    })
    return arr
  }, [annRows, contentChecks])

  const loadBiz = useCallback(
    async (page: number, q: string) => {
      setLoadingBiz(true)
      const res = await fetchStartupBusiness(page, STARTUP_PAGE_SIZE, q)
      if (!res.success || !('data' in res)) {
        setBizRows([])
        setBizTotal(0)
        showToast('목록을 불러올 수 없습니다.', 'error')
      } else {
        setBizRows(res.data)
        setBizTotal(res.total)
        setBizPage(res.page)
      }
      setLoadingBiz(false)
    },
    [showToast],
  )

  const loadAnn = useCallback(
    async (page: number, q: string) => {
      setLoadingAnn(true)
      const res = await fetchStartupAnnouncements(page, STARTUP_PAGE_SIZE, q)
      if (!res.success || !('data' in res)) {
        setAnnRows([])
        setAnnTotal(0)
        showToast('목록을 불러올 수 없습니다.', 'error')
      } else {
        setAnnRows(res.data)
        setAnnTotal(res.total)
        setAnnPage(res.page)
      }
      setLoadingAnn(false)
    },
    [showToast],
  )

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const ck = await fetchStartupContentChecks()
      if (cancelled) return
      if (ck.success) setContentChecks(new Set(ck.keys))
      await Promise.all([loadBiz(1, ''), loadAnn(1, '')])
    })()
    return () => {
      cancelled = true
    }
  }, [loadAnn, loadBiz])

  const dismissBizRow = (id: string | undefined) => {
    if (!id) return
    const k = `business:${id}`
    if (contentChecks.has(k) || dismissed.has(k)) return
    setDismissed((prev) => {
      const n = new Set(prev)
      n.add(k)
      persistDismissed(n)
      return n
    })
  }

  const dismissAnnRow = (id: string | undefined) => {
    if (!id) return
    const k = `announcement:${id}`
    if (contentChecks.has(k) || dismissed.has(k)) return
    setDismissed((prev) => {
      const n = new Set(prev)
      n.add(k)
      persistDismissed(n)
      return n
    })
  }

  const onContentCheck = async (itemType: 'business' | 'announcement', itemId: string) => {
    const r = await postStartupContentCheck(itemType, itemId)
    if (r.success) {
      const k = `${itemType}:${itemId}`
      setContentChecks((prev) => new Set([...prev, k]))
      showToast('내용확인 완료')
      setCommentsBust((b) => b + 1)
    } else {
      showToast(r.error || '실패', 'error')
    }
  }

  const colSpanBiz = 6
  const colSpanAnn = 5

  return (
    <div id="pageWavity">
      <header className="page-header">
        <h1>
          <span>창업</span> 지원사업
        </h1>
        <p className="startup-exp-notice">* 해당 창업은 경험치 지급에 포함되지 않으니 참고하시기 바랍니다. *</p>
        <div className="page-meta">
          <div className="page-meta-info">
            <span className="countdown" id="startupCountdown">
              {countdownText}
            </span>
            <span className="datetime" id="startupDateTime">
              {dateTimeText}
            </span>
          </div>
        </div>
      </header>

      <div className="startup-tabs">
        <button
          type="button"
          className={'startup-tab' + (tab === 'business' ? ' active' : '')}
          onClick={() => setTab('business')}
        >
          통합지원사업
        </button>
        <button
          type="button"
          className={'startup-tab' + (tab === 'announcements' ? ' active' : '')}
          onClick={() => setTab('announcements')}
        >
          지원사업 공고
        </button>
      </div>

      <div id="startupTabBusiness" style={{ display: tab === 'business' ? 'block' : 'none' }}>
        <div className="startup-search-bar">
          <input
            type="text"
            className="startup-search-input"
            placeholder="지원사업명으로 검색..."
            autoComplete="off"
            value={bizQDraft}
            onChange={(e) => setBizQDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                setBizQ(bizQDraft.trim())
                setBizPage(1)
                void loadBiz(1, bizQDraft.trim())
              }
            }}
          />
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              setBizQ(bizQDraft.trim())
              setBizPage(1)
              void loadBiz(1, bizQDraft.trim())
            }}
          >
            검색
          </button>
        </div>
        <div className="card startup-hub-table-card">
          <div className="table-wrap startup-hub-table-wrap">
            <table className="startup-hub-table">
              <thead>
                <tr>
                  <th style={{ minWidth: 40 }}>No</th>
                  <th style={{ minWidth: 56 }}>사업연도</th>
                  <th className="startup-hub-th-title">지원사업명</th>
                  <th style={{ minWidth: 88 }}>생성시간</th>
                  <th style={{ minWidth: 88 }}>업데이트시간</th>
                  <th className="startup-hub-th-menu">원문보기</th>
                </tr>
              </thead>
              <tbody
                onClickCapture={(e) => {
                  const tr = (e.target as HTMLElement).closest(
                    'tr.startup-business-data-row',
                  ) as HTMLTableRowElement | null
                  if (tr?.dataset.id) dismissBizRow(tr.dataset.id)
                }}
              >
                {loadingBiz ? (
                  <tr>
                    <td colSpan={colSpanBiz} className="loading">
                      로딩 중
                    </td>
                  </tr>
                ) : sortedBiz.length === 0 ? (
                  <tr>
                    <td colSpan={colSpanBiz} className="empty-state">
                      등록된 통합지원사업이 없습니다.
                    </td>
                  </tr>
                ) : (
                  sortedBiz.map((row, idx) => {
                    const id = String(row.id ?? '')
                    const cKey = `business:${id}`
                    const checked = contentChecks.has(cKey)
                    const unread = !checked && !dismissed.has(cKey)
                    const rowClass =
                      (checked ? ' row-startup-checked' : '') +
                      ' startup-business-data-row' +
                      (unread ? ' startup-row-unread' : '')
                    const no = (bizPage - 1) * STARTUP_PAGE_SIZE + idx + 1
                    const title = str(row.title)
                    const url = row.url ? String(row.url) : ''
                    const expanded = expandedBizId === id

                    return (
                      <Fragment key={id}>
                        <tr
                          className={rowClass.trim()}
                          data-id={id}
                          onClick={(e) => {
                            if ((e.target as HTMLElement).closest('button, a')) return
                            setExpandedBizId((v) => (v === id ? null : id))
                            setExpandedAnnId(null)
                          }}
                        >
                          <td>{no}</td>
                          <td>{str(row.biz_yr)}</td>
                          <td className="title-cell startup-hub-title-cell" style={{ textAlign: 'left' }} title={title}>
                            <span className="title-cell__text">{truncate(title, 78)}</span>
                          </td>
                          <td>{formatListTime(row.created_at)}</td>
                          <td>{formatListTime(row.updated_at)}</td>
                          <td className="startup-hub-menu-cell" onClick={(e) => e.stopPropagation()}>
                            {url ? (
                              <a href={url} target="_blank" rel="noopener noreferrer" className="btn btn-primary">
                                원문보기
                              </a>
                            ) : (
                              <span className="startup-hub-menu-muted">-</span>
                            )}
                            {checked ? (
                              <button type="button" className="btn btn-action" disabled title="이미 확인함">
                                확인완료
                              </button>
                            ) : (
                              <button
                                type="button"
                                className="btn btn-action btn-startup-content-check"
                                title="내용확인"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  void onContentCheck('business', id)
                                }}
                              >
                                내용확인
                              </button>
                            )}
                          </td>
                        </tr>
                        {expanded ? (
                          <tr className="startup-business-detail-row" data-for-id={id}>
                            <td colSpan={colSpanBiz}>
                              <div className="startup-hub-detail-body-wrap">
                                <div className="detail-block">
                                  <div className="detail-label">지원대상</div>
                                  <div className="detail-value">{str(row.target)}</div>
                                </div>
                                <div className="detail-block">
                                  <div className="detail-label">지원내용</div>
                                  <div className="detail-value">{str(row.content)}</div>
                                </div>
                                <div className="detail-block">
                                  <div className="detail-label">예산/지원규모</div>
                                  <div className="detail-value">{str(row.bdgt)}</div>
                                </div>
                                <div className="detail-block">
                                  <div className="detail-label">지원사업소개</div>
                                  <div className="detail-value">{str(row.intrd)}</div>
                                </div>
                              </div>
                              <StartupCommentsBlock
                                itemType="business"
                                itemId={id}
                                refreshBust={commentsBust}
                                showToast={showToast}
                                currentUserId={currentUserId}
                              />
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
          <PaginationBar
            total={bizTotal}
            page={bizPage}
            pageSize={STARTUP_PAGE_SIZE}
            onGo={(p) => {
              setBizPage(p)
              void loadBiz(p, bizQ)
            }}
          />
        </div>
      </div>

      <div id="startupTabAnnouncements" style={{ display: tab === 'announcements' ? 'block' : 'none' }}>
        <div className="startup-search-bar">
          <input
            type="text"
            className="startup-search-input"
            placeholder="공고명으로 검색..."
            autoComplete="off"
            value={annQDraft}
            onChange={(e) => setAnnQDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                setAnnQ(annQDraft.trim())
                setAnnPage(1)
                void loadAnn(1, annQDraft.trim())
              }
            }}
          />
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              setAnnQ(annQDraft.trim())
              setAnnPage(1)
              void loadAnn(1, annQDraft.trim())
            }}
          >
            검색
          </button>
        </div>
        <div className="card startup-hub-table-card">
          <div className="table-wrap startup-hub-table-wrap">
            <table className="startup-hub-table">
              <thead>
                <tr>
                  <th style={{ minWidth: 40 }}>No</th>
                  <th className="startup-hub-th-title">공고명</th>
                  <th style={{ minWidth: 88 }}>생성시간</th>
                  <th style={{ minWidth: 88 }}>업데이트시간</th>
                  <th className="startup-hub-th-menu">원문보기</th>
                </tr>
              </thead>
              <tbody
                onClickCapture={(e) => {
                  const tr = (e.target as HTMLElement).closest(
                    'tr.startup-announcements-data-row',
                  ) as HTMLTableRowElement | null
                  if (tr?.dataset.id) dismissAnnRow(tr.dataset.id)
                }}
              >
                {loadingAnn ? (
                  <tr>
                    <td colSpan={colSpanAnn} className="loading">
                      로딩 중
                    </td>
                  </tr>
                ) : sortedAnn.length === 0 ? (
                  <tr>
                    <td colSpan={colSpanAnn} className="empty-state">
                      등록된 지원사업 공고가 없습니다.
                    </td>
                  </tr>
                ) : (
                  sortedAnn.map((row, idx) => {
                    const id = String(row.id ?? '')
                    const cKey = `announcement:${id}`
                    const checked = contentChecks.has(cKey)
                    const unread = !checked && !dismissed.has(cKey)
                    const rowClass =
                      (checked ? ' row-startup-checked' : '') +
                      ' startup-announcements-data-row' +
                      (unread ? ' startup-row-unread' : '')
                    const no = (annPage - 1) * STARTUP_PAGE_SIZE + idx + 1
                    const title = str(row.title)
                    const url = row.url ? String(row.url) : ''
                    const expanded = expandedAnnId === id

                    return (
                      <Fragment key={id}>
                        <tr
                          className={rowClass.trim()}
                          data-id={id}
                          onClick={(e) => {
                            if ((e.target as HTMLElement).closest('button, a')) return
                            setExpandedAnnId((v) => (v === id ? null : id))
                            setExpandedBizId(null)
                          }}
                        >
                          <td>{no}</td>
                          <td className="title-cell startup-hub-title-cell" style={{ textAlign: 'left' }} title={title}>
                            <span className="title-cell__text">{truncate(title, 78)}</span>
                          </td>
                          <td>{formatListTime(row.created_at)}</td>
                          <td>{formatListTime(row.updated_at)}</td>
                          <td className="startup-hub-menu-cell" onClick={(e) => e.stopPropagation()}>
                            {url ? (
                              <a href={url} target="_blank" rel="noopener noreferrer" className="btn btn-primary">
                                원문보기
                              </a>
                            ) : (
                              <span className="startup-hub-menu-muted">-</span>
                            )}
                            {checked ? (
                              <button type="button" className="btn btn-action" disabled title="이미 확인함">
                                확인완료
                              </button>
                            ) : (
                              <button
                                type="button"
                                className="btn btn-action btn-startup-content-check"
                                title="내용확인"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  void onContentCheck('announcement', id)
                                }}
                              >
                                내용확인
                              </button>
                            )}
                          </td>
                        </tr>
                        {expanded ? (
                          <tr className="startup-announcements-detail-row" data-for-id={id}>
                            <td colSpan={colSpanAnn}>
                              <div className="startup-hub-detail-body-wrap">
                                <div className="detail-block">
                                  <div className="detail-label">공고명</div>
                                  <div className="detail-value">{str(row.title)}</div>
                                </div>
                                <div className="detail-block">
                                  <div className="detail-label">신청대상</div>
                                  <div className="detail-value">{str(row.aply_trgt)}</div>
                                </div>
                                <div className="detail-block">
                                  <div className="detail-label">창업기간</div>
                                  <div className="detail-value">{str(row.biz_enyy)}</div>
                                </div>
                                <div className="detail-block">
                                  <div className="detail-label">대상연령</div>
                                  <div className="detail-value">{str(row.biz_trgt_age)}</div>
                                </div>
                              </div>
                              <StartupCommentsBlock
                                itemType="announcement"
                                itemId={id}
                                refreshBust={commentsBust}
                                showToast={showToast}
                                currentUserId={currentUserId}
                              />
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
          <PaginationBar
            total={annTotal}
            page={annPage}
            pageSize={STARTUP_PAGE_SIZE}
            onGo={(p) => {
              setAnnPage(p)
              void loadAnn(p, annQ)
            }}
          />
        </div>
      </div>
    </div>
  )
}
