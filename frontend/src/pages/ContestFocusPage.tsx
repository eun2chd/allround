import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ContestDetailRow } from '../components/home/ContestDetailRow'
import { ParticipateApplyModal } from '../components/contests/ParticipateApplyModal'
import type { ParticipateApplyResult } from '../components/contests/ParticipateApplyModal'
import { useMainLayoutOutletContext } from '../components/layout/mainLayoutContext'
import { useConfirm } from '../context/ConfirmContext'
import { DEFAULT_CONTEST_SOURCE, type ParticipationApplyInfo } from '../features/contests/contestTypes'
import { appToast } from '../lib/appToast'
import {
  deleteContestParticipation,
  fetchMyContestActionState,
  postContentCheck,
  setContestParticipation,
} from '../services/contestService'
import { getSupabase } from '../services/supabaseClient'
import { formatExpGainedToast } from '../services/expRewardsConfig'

export function ContestFocusPage() {
  const ctx = useMainLayoutOutletContext()
  const me = ctx?.me
  const confirm = useConfirm()
  const params = useParams<{ source: string; contestId: string }>()

  const sourceRaw = params.source != null ? decodeURIComponent(params.source) : ''
  const contestIdRaw = params.contestId != null ? decodeURIComponent(params.contestId) : ''
  const source =
    sourceRaw.trim() !== '' ? sourceRaw.trim() : DEFAULT_CONTEST_SOURCE
  const contestId = contestIdRaw.trim()

  const [title, setTitle] = useState('')
  const [dDay, setDDay] = useState('')
  const [host, setHost] = useState('')
  const [metaLoading, setMetaLoading] = useState(true)
  const [contentChecked, setContentChecked] = useState(false)
  const [participation, setParticipation] = useState<'participate' | 'pass' | null>(null)
  const [applyInfo, setApplyInfo] = useState<ParticipationApplyInfo | null>(null)
  const [applyModalOpen, setApplyModalOpen] = useState(false)
  const [detailRev, setDetailRev] = useState(0)

  const reloadState = useCallback(async () => {
    if (!contestId) return
    const s = await fetchMyContestActionState(source, contestId)
    setContentChecked(s.contentChecked)
    setParticipation(s.participation)
    setApplyInfo(s.apply)
  }, [source, contestId])

  useEffect(() => {
    if (!me || !contestId) return
    let ok = true
    ;(async () => {
      setMetaLoading(true)
      try {
        const sb = getSupabase()
        const { data: row } = await sb
          .from('contests')
          .select('title, d_day, host')
          .eq('source', source)
          .eq('id', contestId)
          .maybeSingle()
        if (!ok) return
        setTitle(String(row?.title || '').trim() || '공모전')
        setDDay(row?.d_day != null ? String(row.d_day) : '')
        setHost(row?.host != null ? String(row.host) : '')
        await reloadState()
      } finally {
        if (ok) setMetaLoading(false)
      }
    })()
    return () => {
      ok = false
    }
  }, [me, source, contestId, reloadState])

  const showToast = useCallback((msg: string, type?: 'success' | 'error') => {
    appToast(msg, type === 'error' ? 'error' : 'success')
  }, [])

  const onContentCheck = async () => {
    if (!contestId) return
    const ok = await confirm({
      title: '내용확인',
      message: `「${title.slice(0, 48)}」 공고를 내용확인 처리할까요?`,
      confirmText: '확인 처리',
    })
    if (!ok) return
    try {
      const j = await postContentCheck(source, contestId)
      if (j.success) {
        setContentChecked(true)
        showToast('내용 확인 처리되었습니다.')
        const expLine = formatExpGainedToast('content_check', j.exp_gained)
        if (expLine) showToast(expLine)
        setDetailRev((v) => v + 1)
      } else showToast('내용 확인 실패', 'error')
    } catch {
      showToast('내용 확인 실패', 'error')
    }
  }

  const applyBody = (r: ParticipateApplyResult) =>
    r.mode === 'individual'
      ? { participation_type: 'individual' as const, team_id: null as string | null }
      : { participation_type: 'team' as const, team_id: r.teamId }

  const toggleParticipation = async (status: 'participate' | 'pass', participateResult?: ParticipateApplyResult) => {
    if (!contestId) return
    const cur = participation
    const remove = cur === status
    try {
      if (remove) {
        const ok = await confirm({
          title: '참가·패스',
          message: '참가/패스 표시를 해제할까요?',
          confirmText: '해제',
          danger: true,
        })
        if (!ok) return
        const j = await deleteContestParticipation(source, contestId)
        if (j.success) {
          setParticipation(null)
          setApplyInfo(null)
          showToast('참가/패스를 해제했습니다.')
        }
      } else {
        if (cur && cur !== status) {
          const ok2 = await confirm({
            title: '참가·패스',
            message: cur === 'participate' ? '참가를 패스로 바꿀까요?' : '패스를 참가로 바꿀까요?',
            confirmText: '바꾸기',
          })
          if (!ok2) return
        }
        const body =
          status === 'participate'
            ? { status, ...applyBody(participateResult || { mode: 'individual' }) }
            : { status }
        const j = await setContestParticipation(source, contestId, body)
        if (j.success) {
          setParticipation(status)
          if (status === 'participate') {
            const pr = participateResult || { mode: 'individual' as const }
            setApplyInfo(
              pr.mode === 'team' ? { mode: 'team', teamName: pr.teamName } : { mode: 'individual' },
            )
          } else setApplyInfo(null)
          showToast(status === 'participate' ? '참가로 표시했습니다.' : '패스로 표시했습니다.')
          const expLine = formatExpGainedToast(status === 'participate' ? 'participate' : 'pass', j.exp_gained)
          if (expLine) showToast(expLine)
        }
      }
      void reloadState()
      setDetailRev((v) => v + 1)
    } catch {
      showToast('처리 실패', 'error')
    }
  }

  const openParticipateApply = () => {
    if (participation === 'participate') {
      void toggleParticipation('participate')
      return
    }
    setApplyModalOpen(true)
  }

  if (!ctx || !me) return null

  if (!contestId) {
    return (
      <div className="container contest-focus-page">
        <p className="contest-focus-error">잘못된 공모전 링크입니다.</p>
        <Link to="/">목록으로</Link>
      </div>
    )
  }

  const participateLocked = !contentChecked && participation !== 'participate'
  const passLocked = !contentChecked && participation !== 'pass'

  return (
    <div className="container contest-focus-page">
      <header className="page-header contest-focus-header">
        <div className="contest-focus-header-row">
          <Link to="/" className="contest-focus-back">
            ← 공모전 목록
          </Link>
        </div>
        <h1 className="contest-focus-title">{metaLoading ? '불러오는 중…' : title}</h1>
        <p className="contest-focus-meta">
          {[dDay && `D-day ${dDay}`, host].filter(Boolean).join(' · ')}
          {contentChecked ? (
            <span className="contest-focus-badge contest-focus-badge--ok">내용확인 함</span>
          ) : (
            <span className="contest-focus-badge">내용확인 전</span>
          )}
          {participation === 'participate' ? (
            <span className="contest-focus-badge contest-focus-badge--participate">
              내 기준: 참가
              {applyInfo?.mode === 'team'
                ? ` (팀${applyInfo.teamName ? ` · ${applyInfo.teamName}` : ''})`
                : applyInfo?.mode === 'individual'
                  ? ' (개인)'
                  : ''}
            </span>
          ) : participation === 'pass' ? (
            <span className="contest-focus-badge contest-focus-badge--pass">내 기준: 패스</span>
          ) : (
            <span className="contest-focus-badge">내 기준: 미선택</span>
          )}
        </p>
      </header>

      <div className="contest-focus-toolbar">
        <button type="button" className="btn btn-secondary contest-focus-btn" onClick={() => void onContentCheck()}>
          내용확인
        </button>
        <button
          type="button"
          className={'btn btn-action contest-focus-btn' + (participation === 'participate' ? ' is-active' : '')}
          disabled={participateLocked}
          title={participateLocked ? '먼저 내용확인을 해 주세요.' : undefined}
          onClick={() => {
            if (participateLocked) {
              showToast('내용확인 먼저 처리해 주세요.', 'error')
              return
            }
            openParticipateApply()
          }}
        >
          참가
        </button>
        <button
          type="button"
          className={'btn btn-action contest-focus-btn' + (participation === 'pass' ? ' is-active' : '')}
          disabled={passLocked}
          title={passLocked ? '먼저 내용확인을 해 주세요.' : undefined}
          onClick={() => {
            if (passLocked) {
              showToast('내용확인 먼저 처리해 주세요.', 'error')
              return
            }
            void toggleParticipation('pass')
          }}
        >
          패스
        </button>
      </div>
      <p className="contest-focus-hint">타인 프로필에서 넘어온 경우, 위 버튼은 <strong>내 계정</strong> 기준으로 동작합니다. 본문·댓글은 아래와 같습니다.</p>

      {applyModalOpen ? (
        <ParticipateApplyModal
          open
          contestTitle={title}
          source={source}
          contestId={contestId}
          onClose={() => setApplyModalOpen(false)}
          onConfirm={(result) => {
            setApplyModalOpen(false)
            void toggleParticipation('participate', result)
          }}
        />
      ) : null}

      <div className="card contest-focus-detail-card">
        <ContestDetailRow
          key={`${source}-${contestId}-${detailRev}`}
          source={source}
          contestId={contestId}
          showToast={(msg, t) => appToast(msg, t || 'success')}
          currentUserId={me.user_id}
          commented={() => setDetailRev((v) => v + 1)}
        />
      </div>
    </div>
  )
}
