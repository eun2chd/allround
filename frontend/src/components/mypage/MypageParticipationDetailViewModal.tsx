import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { HiXMark } from 'react-icons/hi2'
import { contestFocusPath } from '../../features/contests/contestTypes'
import { fetchParticipationDetailRow } from '../../services/participationDetailService'

export type ParticipationDetailViewCtx = {
  profileUserId: string
  source: string
  contestId: string
  title: string
  contestUrl: string
  metaLine: string
  hasDetail: boolean
  rev: number
  /** 참여현황 등: 누구의 상세인지 표시 */
  memberLabel?: string
}

type DetailRow = Awaited<ReturnType<typeof fetchParticipationDetailRow>>

type Props = {
  ctx: ParticipationDetailViewCtx | null
  onClose: () => void
}

function formatDt(iso: string | null | undefined) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return String(iso)
  return d.toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatDateOnly(s: string | null | undefined) {
  if (!s) return '—'
  const t = String(s)
  return t.length >= 10 ? t.slice(0, 10) : t
}

function DetailField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="participation-view-field">
      <div className="participation-view-label">{label}</div>
      <div className="participation-view-value">{children}</div>
    </div>
  )
}

export function MypageParticipationDetailViewModal({ ctx, onClose }: Props) {
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<DetailRow>(null)

  useEffect(() => {
    if (!ctx?.source || !ctx.contestId) return
    if (!ctx.hasDetail) {
      setData(null)
      setLoading(false)
      return
    }
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const d = await fetchParticipationDetailRow(ctx.profileUserId, ctx.source, ctx.contestId)
        if (!cancelled) setData(d)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [ctx?.profileUserId, ctx?.source, ctx?.contestId, ctx?.hasDetail, ctx?.rev])

  if (!ctx) return null

  const showExternal = ctx.contestUrl && ctx.contestUrl !== '#' && /^https?:\/\//i.test(ctx.contestUrl)

  return (
    <div
      className="modal-overlay active mypage-participation-detail-overlay"
      role="presentation"
    >
      <div className="modal-box mypage-participation-detail-modal" role="dialog" aria-modal="true">
        <div className="modal-header">
          <h4>참가 상세 정보</h4>
          <button type="button" className="modal-close" onClick={onClose} aria-label="닫기">
            <HiXMark className="modal-close-ico" aria-hidden />
          </button>
        </div>
        <div className="modal-body participation-detail-view-body">
          <p className="participation-view-contest-title">{ctx.title || '제목 없음'}</p>
          {ctx.memberLabel ? <p className="participation-view-member">{ctx.memberLabel}</p> : null}
          {ctx.metaLine ? (
            <p className="participation-view-meta" style={{ marginTop: 4, marginBottom: 16 }}>
              {ctx.metaLine}
            </p>
          ) : null}

          {!ctx.hasDetail ? (
            <p className="participation-view-empty">등록된 참가 상세가 없습니다.</p>
          ) : loading ? (
            <p className="exp-loading">불러오는 중...</p>
          ) : !data ? (
            <p className="participation-view-empty">상세 정보를 불러올 수 없습니다.</p>
          ) : (
            <div className="participation-view-fields">
              <DetailField label="지원·심사 단계">{String(data.participation_status || '—')}</DetailField>
              {String(data.participation_status) === '수상' && data.award_status ? (
                <DetailField label="수상 등급">{String(data.award_status)}</DetailField>
              ) : null}
              <DetailField label="상금">
                {data.has_prize ? (
                  <>
                    수령
                    {data.prize_amount != null && Number(data.prize_amount) > 0
                      ? ` · ${Number(data.prize_amount).toLocaleString('ko-KR')}원`
                      : null}
                  </>
                ) : (
                  '미수령'
                )}
              </DetailField>
              <DetailField label="제출일">{formatDt(data.submitted_at as string | null)}</DetailField>
              <DetailField label="결과 발표일">{formatDateOnly(data.result_announcement_date as string | null)}</DetailField>
              <DetailField label="결과 발표 (경로)">
                {data.result_announcement_method ? String(data.result_announcement_method) : '—'}
              </DetailField>
              <DetailField label="제출물">
                {data.document_filename ? (
                  <>
                    <span>{String(data.document_filename)}</span>
                    {data.document_path && String(data.document_path).startsWith('http') ? (
                      <>
                        {' '}
                        <a href={String(data.document_path)} target="_blank" rel="noreferrer" className="participation-view-doc-link">
                          열기
                        </a>
                      </>
                    ) : null}
                  </>
                ) : (
                  '—'
                )}
              </DetailField>
            </div>
          )}

          <div className="participation-view-footer participation-view-footer--stack">
            <Link to={contestFocusPath(ctx.source, ctx.contestId)} className="participation-view-open-app">
              상세 본문 보고 내 참가·패스하기
            </Link>
            {showExternal ? (
              <a href={ctx.contestUrl} target="_blank" rel="noreferrer" className="btn-outline">
                원문 사이트 열기
              </a>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}
