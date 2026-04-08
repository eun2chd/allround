import { useEffect, useState } from 'react'
import { HiXMark } from 'react-icons/hi2'
import { appToast } from '../../lib/appToast'
import {
  deleteParticipationDetailRow,
  fetchParticipationDetailRow,
  upsertParticipationDetailRow,
} from '../../services/participationDetailService'

const STATUSES = ['지원완료', '심사중', '본선진출', '수상', '미수상', '취소'] as const
const AWARDS = ['대상', '최우수상', '우수상', '장려상', '입선', '기타'] as const

export type ParticipationDetailModalCtx = {
  profileUserId: string
  source: string
  contestId: string
  title: string
  /** 같은 행을 다시 열 때도 fetch가 돌도록 */
  rev: number
}

type Props = {
  ctx: ParticipationDetailModalCtx | null
  onClose: () => void
  onSaved: () => void
}

export function MypageParticipationDetailModal({ ctx, onClose, onSaved }: Props) {
  const [status, setStatus] = useState<string>('지원완료')
  const [award, setAward] = useState('')
  const [hasPrize, setHasPrize] = useState(false)
  const [prizeAmount, setPrizeAmount] = useState('')
  const [submittedAt, setSubmittedAt] = useState('')
  const [resultDate, setResultDate] = useState('')
  const [resultMethod, setResultMethod] = useState('')
  const [docPath, setDocPath] = useState('')
  const [docFilename, setDocFilename] = useState('')
  const [docFile, setDocFile] = useState<File | null>(null)
  const [docUploadLabel, setDocUploadLabel] = useState('등록')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!ctx?.source || !ctx.contestId) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setStatus('지원완료')
      setAward('')
      setHasPrize(false)
      setPrizeAmount('')
      setSubmittedAt('')
      setResultDate('')
      setResultMethod('')
      setDocPath('')
      setDocFilename('')
      setDocFile(null)
      setDocUploadLabel('등록')
      try {
        const d = await fetchParticipationDetailRow(ctx.profileUserId, ctx.source, ctx.contestId)
        if (cancelled || !d) return
        setStatus(String(d.participation_status || '지원완료'))
        setAward(String(d.award_status || ''))
        setHasPrize(!!d.has_prize)
        setPrizeAmount(d.prize_amount != null ? String(d.prize_amount) : '')
        if (d.submitted_at) {
          const dt = new Date(d.submitted_at as string)
          if (!Number.isNaN(dt.getTime())) setSubmittedAt(dt.toISOString().slice(0, 16))
        }
        if (d.result_announcement_date) {
          const rd = String(d.result_announcement_date)
          setResultDate(rd.length >= 10 ? rd.slice(0, 10) : rd)
        }
        if (d.result_announcement_method) setResultMethod(String(d.result_announcement_method))
        const path = String(d.document_path || '')
        const fn = String(d.document_filename || '')
        setDocPath(path)
        setDocFilename(fn)
        if (path && fn) setDocUploadLabel('변경')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [ctx?.profileUserId, ctx?.source, ctx?.contestId, ctx?.rev])

  if (!ctx) return null

  const showAward = status === '수상'
  const hasDisplayDoc = !!(docPath && docFilename)

  const clearDoc = () => {
    setDocPath('')
    setDocFilename('')
    setDocFile(null)
    setDocUploadLabel('등록')
  }

  const onSave = async () => {
    const hasFile = !!docFile
    const hasDoc = (docPath && docFilename) || hasFile
    if (!hasDoc) {
      appToast('제출물을 등록해 주세요.', 'error')
      return
    }
    setSaving(true)
    try {
      const r = await upsertParticipationDetailRow({
        source: ctx.source,
        contest_id: ctx.contestId,
        participation_status: status,
        award_status: showAward ? award : null,
        has_prize: hasPrize,
        prize_amount: prizeAmount.trim() ? Number(prizeAmount) : null,
        submitted_at: submittedAt || null,
        result_announcement_date: resultDate || null,
        result_announcement_method: resultMethod.trim() || null,
        document_path: docPath || null,
        document_filename: docFilename || null,
        documentFile: docFile,
      })
      if (!r.success) {
        appToast(r.error || '저장 실패', 'error')
        return
      }
      appToast('저장되었습니다.')
      onSaved()
      onClose()
    } finally {
      setSaving(false)
    }
  }

  const onDelete = async () => {
    if (!confirm('참가 상세 정보를 삭제할까요?')) return
    const r = await deleteParticipationDetailRow(ctx.source, ctx.contestId)
    if (!r.success) {
      appToast(r.error || '삭제 실패', 'error')
      return
    }
    appToast('삭제되었습니다.')
    onSaved()
    onClose()
  }

  return (
    <div
      className="modal-overlay active mypage-participation-detail-overlay"
      role="presentation"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="modal-box mypage-participation-detail-modal" role="dialog" aria-modal="true">
        <div className="modal-header">
          <h4>참가 상세: {ctx.title || ''}</h4>
          <button type="button" className="modal-close" onClick={onClose} aria-label="닫기">
            <HiXMark className="modal-close-ico" aria-hidden />
          </button>
        </div>
        <div className="modal-body">
          {loading ? (
            <div className="exp-loading">불러오는 중...</div>
          ) : (
            <>
              <div className="form-group">
                <label>참가 상태</label>
                <select
                  value={status}
                  onChange={(e) => {
                    setStatus(e.target.value)
                  }}
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              {showAward ? (
                <div className="form-group">
                  <label>수상 등급</label>
                  <select value={award} onChange={(e) => setAward(e.target.value)}>
                    <option value="">선택</option>
                    {AWARDS.map((a) => (
                      <option key={a} value={a}>
                        {a}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
              <div className="form-group form-group-checkbox">
                <label>
                  <input
                    type="checkbox"
                    className="participation-detail-checkbox"
                    checked={hasPrize}
                    onChange={(e) => setHasPrize(e.target.checked)}
                  />
                  상금 수령
                </label>
              </div>
              <div className="form-group">
                <label>상금 액수 (원)</label>
                <input
                  type="number"
                  placeholder="0"
                  min={0}
                  step={1}
                  value={prizeAmount}
                  onChange={(e) => setPrizeAmount(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label>제출일</label>
                <input
                  type="datetime-local"
                  value={submittedAt}
                  onChange={(e) => setSubmittedAt(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label>결과 발표일</label>
                <input type="date" value={resultDate} onChange={(e) => setResultDate(e.target.value)} />
              </div>
              <div className="form-group">
                <label>결과 발표 (경로)</label>
                <input
                  type="text"
                  placeholder="예: 문자, SNS, 홈페이지, 전화통보, 이메일 등"
                  value={resultMethod}
                  onChange={(e) => setResultMethod(e.target.value)}
                />
              </div>
              {hasDisplayDoc ? (
                <div className="form-group">
                  <label>현재 제출물</label>
                  <div className="participation-doc-current">
                    <span className="participation-doc-filename">{docFilename}</span>
                    <div className="participation-doc-actions">
                      {docPath.startsWith('http') ? (
                        <a
                          href={docPath}
                          target="_blank"
                          rel="noreferrer"
                          className="btn-outline btn-sm"
                        >
                          열기
                        </a>
                      ) : null}
                      <button type="button" className="btn-outline btn-sm" onClick={clearDoc}>
                        제거
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}
              <div className="form-group">
                <label>
                  제출물 <span className="form-required-star">*</span>{' '}
                  <span>{docUploadLabel}</span>
                </label>
                <input
                  type="file"
                  accept=".pdf,.doc,.docx,.hwp,.ppt,.pptx,.xls,.xlsx,.zip,.txt"
                  className="participation-doc-file-input"
                  onChange={(e) => {
                    const f = e.target.files?.[0] || null
                    setDocFile(f)
                    if (f) setDocUploadLabel(`변경됨 (${f.name})`)
                  }}
                />
              </div>
              <div className="participation-detail-actions">
                <button type="button" className="btn-outline danger" onClick={onDelete}>
                  삭제
                </button>
                <button type="button" className="btn-primary" disabled={saving} onClick={onSave}>
                  {saving ? '저장 중…' : '저장'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
