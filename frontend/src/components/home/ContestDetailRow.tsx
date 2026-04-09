import { useEffect, useState } from 'react'
import { useConfirm } from '../../context/ConfirmContext'
import { resolveHtmlMediaUrls } from '../../lib/resolveHtmlMediaUrls'
import {
  createContestComment,
  deleteContestComment,
  fetchContestCommentsOnly,
  fetchContestDetail,
} from '../../services/contestService'

type Comment = {
  id?: string
  user_id?: string
  nickname?: string
  profile_url?: string
  body?: string
  created_at?: string
}

type DetailContent = {
  has_content?: boolean
  body?: string
  url?: string
  host?: string
  category?: string
  apply_period?: string
}

type Props = {
  source: string
  contestId: string
  showToast: (msg: string, type?: 'success' | 'error') => void
  currentUserId: string
  commented: () => void
}

export function ContestDetailRow({
  source,
  contestId,
  showToast,
  currentUserId,
  commented,
}: Props) {
  const confirm = useConfirm()
  const [loading, setLoading] = useState(true)
  const [sourcePageUrl, setSourcePageUrl] = useState<string | null>(null)
  const [bodyHtml, setBodyHtml] = useState<string | null>(null)
  const [hasContent, setHasContent] = useState(false)
  const [metaLines, setMetaLines] = useState<string[]>([])
  const [comments, setComments] = useState<Comment[]>([])
  const [commentText, setCommentText] = useState('')

  const loadComments = async () => {
    try {
      const j = await fetchContestCommentsOnly(source, contestId)
      setComments(j.data || [])
    } catch {
      setComments([])
    }
  }

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setSourcePageUrl(null)
      try {
        const j = await fetchContestDetail(source, contestId)
        if (cancelled) return
        if (!j.success || !('data' in j)) {
          if (!cancelled) showToast('상세 불러오기 실패', 'error')
          return
        }
        const d = (j.data.content || {}) as DetailContent
        const pageUrl = String(d.url || '').trim()
        setSourcePageUrl(pageUrl || null)
        setHasContent(!!d.has_content)
        const raw = d.body || ''
        setBodyHtml(raw ? (pageUrl ? resolveHtmlMediaUrls(raw, pageUrl) : raw) : null)
        const meta: string[] = []
        if (d.host) meta.push('주최/주관: ' + d.host)
        if (d.category) meta.push('카테고리: ' + d.category)
        if (d.apply_period) meta.push('접수기간: ' + d.apply_period)
        setMetaLines(meta)
        if (j.data.comments?.length) setComments(j.data.comments)
        else await loadComments()
      } catch {
        if (!cancelled) showToast('상세 불러오기 실패', 'error')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [source, contestId, showToast])

  const submitComment = async () => {
    const body = commentText.trim()
    if (!body) {
      showToast('글을 작성해주세요.', 'error')
      return
    }
    try {
      const j = await createContestComment(source, contestId, body)
      if (j.success) {
        commented()
        setCommentText('')
        await loadComments()
        showToast('댓글이 등록되었습니다.')
      } else showToast('등록 실패', 'error')
    } catch {
      showToast('등록 실패', 'error')
    }
  }

  const deleteComment = async (id: string) => {
    const ok = await confirm({
      title: '댓글 삭제',
      message: '이 댓글을 삭제할까요?',
      confirmText: '삭제',
      danger: true,
    })
    if (!ok) return
    try {
      const j = await deleteContestComment(id)
      if (j.success) {
        await loadComments()
        showToast('삭제했습니다.')
      }
    } catch {
      showToast('삭제 실패', 'error')
    }
  }

  if (loading) {
    return (
      <div className="detail-inner">
        <div className="detail-loading">불러오는 중...</div>
      </div>
    )
  }

  return (
    <>
      <div className="detail-inner">
        {sourcePageUrl ? (
          <div className="detail-original-wrap">
            <a className="detail-original-link" href={sourcePageUrl} target="_blank" rel="noreferrer">
              원문으로 이동
            </a>
          </div>
        ) : null}
        {metaLines.length > 0 ? <div className="detail-meta">{metaLines.join(' · ')}</div> : null}
        {hasContent && bodyHtml ? (
          <div className="detail-body-html" dangerouslySetInnerHTML={{ __html: bodyHtml }} />
        ) : (
          <div className="detail-no-content">저장된 본문이 없습니다. 원문 페이지에서 확인해 주세요.</div>
        )}
      </div>
      <div className="detail-comments">
        <div className="detail-comments-title">댓글</div>
        <div className="detail-comments-list">
          {!comments.length ? (
            <div className="detail-comment-empty">아직 댓글이 없습니다.</div>
          ) : (
            comments.map((c) => {
              const own = c.user_id && String(c.user_id) === String(currentUserId)
              return (
                <div key={c.id} className="detail-comment-item">
                  <div className="detail-comment-header">
                    <div
                      className="detail-comment-avatar"
                      style={c.profile_url ? { backgroundImage: `url('${c.profile_url}')` } : undefined}
                    >
                      {!c.profile_url ? <span>{(c.nickname || '?').slice(0, 1).toUpperCase()}</span> : null}
                    </div>
                    <span className="detail-comment-nickname">{c.nickname || '익명'}</span>
                    {c.created_at ? (
                      <span className="detail-comment-time">
                        {new Date(c.created_at).toLocaleString('ko-KR')}
                      </span>
                    ) : null}
                  </div>
                  <div className="detail-comment-body">{c.body || ''}</div>
                  {own && c.id ? (
                    <button type="button" className="comment-delete-btn" onClick={() => deleteComment(c.id!)}>
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
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
          />
          <button type="button" className="btn btn-primary detail-comment-submit" onClick={submitComment}>
            등록
          </button>
        </div>
      </div>
    </>
  )
}
