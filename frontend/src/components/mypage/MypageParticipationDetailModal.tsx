import { useEffect, useRef, useState } from 'react'
import {
  isAllowedParticipationFile,
  participationFileRejectMessage,
} from '../../features/participation/participationFileUpload'
import { HiXMark } from 'react-icons/hi2'
import { appToast } from '../../lib/appToast'
import {
  lifecycleForParticipationStatus,
  PARTICIPATION_LIFECYCLE_STATUSES,
} from '../../features/participation/participationLifecycle'
import { PRIZE_SETTLEMENT_STATUSES } from '../../features/participation/prizeSettlement'
import { ParticipationFileDropzone } from '../common/ParticipationFileDropzone'
import { ParticipationAttachmentPreview } from '../participation/ParticipationAttachmentPreview'
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
  const [lifecycle, setLifecycle] = useState<string>('진행중')
  const [award, setAward] = useState('')
  const [hasPrize, setHasPrize] = useState(false)
  const [prizeAmount, setPrizeAmount] = useState('')
  const [prizeSettlement, setPrizeSettlement] = useState<string>('미수령')
  const [submittedAt, setSubmittedAt] = useState('')
  const [resultDate, setResultDate] = useState('')
  const [resultMethod, setResultMethod] = useState('')
  const [docPath, setDocPath] = useState('')
  const [docFilename, setDocFilename] = useState('')
  const [docFile, setDocFile] = useState<File | null>(null)
  const [docUploadLabel, setDocUploadLabel] = useState('등록')
  const [awardWorkPath, setAwardWorkPath] = useState('')
  const [awardWorkFilename, setAwardWorkFilename] = useState('')
  const [awardWorkFile, setAwardWorkFile] = useState<File | null>(null)
  const [awardWorkUploadLabel, setAwardWorkUploadLabel] = useState('등록')
  const [awardWorkCleared, setAwardWorkCleared] = useState(false)
  const pasteTargetRef = useRef<'doc' | 'award'>('doc')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!ctx?.source || !ctx.contestId) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setStatus('지원완료')
      setLifecycle('진행중')
      setAward('')
      setHasPrize(false)
      setPrizeAmount('')
      setPrizeSettlement('미수령')
      setSubmittedAt('')
      setResultDate('')
      setResultMethod('')
      setDocPath('')
      setDocFilename('')
      setDocFile(null)
      setDocUploadLabel('등록')
      setAwardWorkPath('')
      setAwardWorkFilename('')
      setAwardWorkFile(null)
      setAwardWorkUploadLabel('등록')
      setAwardWorkCleared(false)
      try {
        const d = await fetchParticipationDetailRow(ctx.profileUserId, ctx.source, ctx.contestId)
        if (cancelled || !d) return
        setStatus(String(d.participation_status || '지원완료'))
        setLifecycle(String((d as { lifecycle_status?: string }).lifecycle_status || '진행중'))
        setAward(String(d.award_status || ''))
        setHasPrize(!!d.has_prize)
        setPrizeAmount(d.prize_amount != null ? String(d.prize_amount) : '')
        const ps = String((d as { prize_settlement_status?: string | null }).prize_settlement_status || '').trim()
        setPrizeSettlement(
          (PRIZE_SETTLEMENT_STATUSES as readonly string[]).includes(ps) ? ps : '미수령',
        )
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
        const awardPath = String((d as { award_work_path?: string }).award_work_path || '')
        const awardFn = String((d as { award_work_filename?: string }).award_work_filename || '')
        setAwardWorkPath(awardPath)
        setAwardWorkFilename(awardFn)
        if (awardPath && awardFn) setAwardWorkUploadLabel('변경')
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
  const hasDisplayAwardWork = !!(awardWorkPath && awardWorkFilename)

  const clearDoc = () => {
    setDocPath('')
    setDocFilename('')
    setDocFile(null)
    setDocUploadLabel('등록')
  }

  const clearAwardWork = () => {
    setAwardWorkPath('')
    setAwardWorkFilename('')
    setAwardWorkFile(null)
    setAwardWorkUploadLabel('등록')
    setAwardWorkCleared(true)
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
        lifecycle_status: lifecycle,
        award_status: showAward ? award : null,
        has_prize: hasPrize,
        prize_amount: prizeAmount.trim() ? Number(prizeAmount) : null,
        prize_settlement_status: hasPrize ? prizeSettlement : null,
        submitted_at: submittedAt || null,
        result_announcement_date: resultDate || null,
        result_announcement_method: resultMethod.trim() || null,
        document_path: docPath || null,
        document_filename: docFilename || null,
        documentFile: docFile,
        award_work_path: awardWorkPath || null,
        award_work_filename: awardWorkFilename || null,
        awardWorkFile: awardWorkFile,
        clear_award_work: awardWorkCleared && !awardWorkPath && !awardWorkFilename && !awardWorkFile,
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

  const applyPastedFile = (f: File) => {
    if (!isAllowedParticipationFile(f)) {
      appToast(participationFileRejectMessage(), 'error')
      return
    }
    if (pasteTargetRef.current === 'award') {
      setAwardWorkFile(f)
      setAwardWorkCleared(false)
      setAwardWorkUploadLabel(`변경됨 (${f.name})`)
      return
    }
    setDocFile(f)
    setDocUploadLabel(`변경됨 (${f.name})`)
  }

  const onModalPaste = (e: React.ClipboardEvent) => {
    const f = e.clipboardData.files?.[0]
    if (!f) return
    e.preventDefault()
    applyPastedFile(f)
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
    >
      <div className="modal-box mypage-participation-detail-modal" role="dialog" aria-modal="true">
        <div className="modal-header">
          <h4>참가 상세: {ctx.title || ''}</h4>
          <button type="button" className="modal-close" onClick={onClose} aria-label="닫기">
            <HiXMark className="modal-close-ico" aria-hidden />
          </button>
        </div>
        <div className="modal-body" onPaste={onModalPaste}>
          {loading ? (
            <div className="exp-loading">불러오는 중...</div>
          ) : (
            <>
              <div className="form-group">
                <label>진행 상태</label>
                <select value={lifecycle} onChange={(e) => setLifecycle(e.target.value)}>
                  {PARTICIPATION_LIFECYCLE_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
                <p className="participation-detail-settlement-hint">
                  진행중 = 아직 진행 중인 공모전 · 종료 = 결과 확정·취소 등 마무리된 참가
                </p>
              </div>
              <div className="form-group">
                <label>지원·심사 단계</label>
                <select
                  value={status}
                  onChange={(e) => {
                    const v = e.target.value
                    setStatus(v)
                    const nextLifecycle = lifecycleForParticipationStatus(v)
                    if (nextLifecycle) setLifecycle(nextLifecycle)
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
              {hasPrize ? (
                <div className="form-group">
                  <label>상금 정산 상태</label>
                  <select value={prizeSettlement} onChange={(e) => setPrizeSettlement(e.target.value)}>
                    {PRIZE_SETTLEMENT_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                  <p className="participation-detail-settlement-hint">
                    팀 금고·참여현황에서 정산 현황을 모아 보여 줍니다.
                  </p>
                </div>
              ) : null}
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
              <div className="form-group participation-attachment-form-group">
                <label>
                  제출물 <span className="form-required-star">*</span>{' '}
                  <span>{docUploadLabel}</span>
                </label>
                {hasDisplayDoc && !docFile ? (
                  <ParticipationAttachmentPreview
                    heading="제출물"
                    filename={docFilename}
                    path={docPath}
                    onRemove={clearDoc}
                  />
                ) : null}
                {docFile ? (
                  <ParticipationAttachmentPreview
                    heading="제출물 (변경 예정)"
                    filename={docFile.name}
                    localFile={docFile}
                    onRemove={() => {
                      setDocFile(null)
                      setDocUploadLabel(docPath && docFilename ? '변경' : '등록')
                    }}
                  />
                ) : null}
                <ParticipationFileDropzone
                  pendingName={docFile?.name ?? null}
                  onActivate={() => {
                    pasteTargetRef.current = 'doc'
                  }}
                  onFile={(f) => {
                    setDocFile(f)
                    if (f) setDocUploadLabel(`변경됨 (${f.name})`)
                  }}
                />
              </div>
              <div className="participation-award-work-block">
                  <div className="form-group participation-attachment-form-group">
                    <label>
                      수상작 첨부 <span>{awardWorkUploadLabel}</span>
                    </label>
                    {hasDisplayAwardWork && !awardWorkFile ? (
                      <ParticipationAttachmentPreview
                        heading="수상작"
                        filename={awardWorkFilename}
                        path={awardWorkPath}
                        onRemove={clearAwardWork}
                      />
                    ) : null}
                    {awardWorkFile ? (
                      <ParticipationAttachmentPreview
                        heading="수상작 (변경 예정)"
                        filename={awardWorkFile.name}
                        localFile={awardWorkFile}
                        onRemove={() => {
                          setAwardWorkFile(null)
                          setAwardWorkUploadLabel(
                            awardWorkPath && awardWorkFilename ? '변경' : '등록',
                          )
                        }}
                      />
                    ) : null}
                    <ParticipationFileDropzone
                      pendingName={awardWorkFile?.name ?? null}
                      onActivate={() => {
                        pasteTargetRef.current = 'award'
                      }}
                      onFile={(f) => {
                        setAwardWorkFile(f)
                        if (f) {
                          setAwardWorkCleared(false)
                          setAwardWorkUploadLabel(`변경됨 (${f.name})`)
                        }
                      }}
                    />
                    <p className="participation-detail-settlement-hint">
                      수상한 경우 입상 작품·시안·PDF·한글·이미지 등을 추가로 올릴 수 있습니다. (선택)
                    </p>
                  </div>
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
