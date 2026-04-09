import { useEffect, useState } from 'react'
import { HiXMark } from 'react-icons/hi2'
import { appToast } from '../../lib/appToast'
import { createContestTeam, fetchContestTeamsForParticipation, type ContestTeamRow } from '../../services/contestTeamService'

export type ParticipateApplyResult =
  | { mode: 'individual' }
  | { mode: 'team'; teamId: string; teamName: string }

type Props = {
  open: boolean
  contestTitle: string
  source: string
  contestId: string
  onClose: () => void
  onConfirm: (result: ParticipateApplyResult) => void
}

export function ParticipateApplyModal({ open, contestTitle, source, contestId, onClose, onConfirm }: Props) {
  const [mode, setMode] = useState<'individual' | 'team'>('individual')
  const [teams, setTeams] = useState<ContestTeamRow[]>([])
  const [loadingTeams, setLoadingTeams] = useState(false)
  const [selectedTeamId, setSelectedTeamId] = useState('')
  const [newTeamName, setNewTeamName] = useState('')
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    if (!open) return
    setMode('individual')
    setTeams([])
    setSelectedTeamId('')
    setNewTeamName('')
  }, [open])

  /** 팀 라디오 선택 시점에 조회 (모달 직후 세션 미준비로 빈 목록 나오는 경우 방지) */
  useEffect(() => {
    if (!open) return
    if (String(contestId ?? '').trim() === '') return
    if (mode !== 'team') return
    let cancelled = false
    ;(async () => {
      setLoadingTeams(true)
      try {
        const list = await fetchContestTeamsForParticipation(source, contestId)
        if (!cancelled) {
          setTeams(list)
          setSelectedTeamId((prev) => (list.some((t) => t.id === prev) ? prev : list[0]?.id ?? ''))
        }
      } finally {
        if (!cancelled) setLoadingTeams(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, mode, source, contestId])

  useEffect(() => {
    if (mode !== 'team' || !teams.length) return
    if (!selectedTeamId || !teams.some((t) => t.id === selectedTeamId)) {
      setSelectedTeamId(teams[0].id)
    }
  }, [mode, teams, selectedTeamId])

  if (!open) return null

  const submit = async () => {
    if (mode === 'individual') {
      onConfirm({ mode: 'individual' })
      return
    }
    let teamId = selectedTeamId
    let teamName = teams.find((t) => t.id === teamId)?.team_name || ''
    const trimmedNew = newTeamName.trim()
    if (!teamId && trimmedNew) {
      setCreating(true)
      try {
        const r = await createContestTeam(source, contestId, trimmedNew)
        if (!r.success) {
          appToast(r.error, 'error')
          return
        }
        teamId = r.id
        teamName = r.team_name
        setTeams((prev) => [{ id: r.id, team_name: r.team_name }, ...prev])
        setNewTeamName('')
      } finally {
        setCreating(false)
      }
    }
    if (!teamId) {
      appToast('팀을 선택하거나 새 팀 이름을 입력하세요.', 'error')
      return
    }
    if (!teamName) teamName = teams.find((t) => t.id === teamId)?.team_name || '팀'
    onConfirm({ mode: 'team', teamId, teamName })
  }

  return (
    <div className="modal-overlay active participate-apply-overlay" role="presentation">
      <div className="modal-box participate-apply-modal" role="dialog" aria-modal="true" aria-labelledby="participate-apply-title">
        <div className="modal-header">
          <h4 id="participate-apply-title">참가 방식</h4>
          <button type="button" className="modal-close" onClick={onClose} aria-label="닫기">
            <HiXMark className="modal-close-ico" aria-hidden />
          </button>
        </div>
        <div className="modal-body participate-apply-body">
          <p className="participate-apply-contest-title">{contestTitle || '공모전'}</p>
          <p className="participate-apply-lead">
            개인으로 참가하거나, 이 공고에 이미 만든 팀을 고르거나, 새 팀을 만들 수 있습니다. 팀 참가는 같은 팀에 속한다는 의미로만 저장되며, 초대·승인 기능은 없습니다. (패스는 이 창 없이
            처리됩니다.)
          </p>
          <div className="participate-apply-modes" role="radiogroup" aria-label="참가 방식">
            <label className="participate-apply-radio">
              <input type="radio" name="part-mode" checked={mode === 'individual'} onChange={() => setMode('individual')} />
              <span>개인 참가</span>
            </label>
            <label className="participate-apply-radio">
              <input type="radio" name="part-mode" checked={mode === 'team'} onChange={() => setMode('team')} />
              <span>팀 참가</span>
            </label>
          </div>
          {mode === 'team' ? (
            <div className="participate-apply-team-block">
              {loadingTeams ? (
                <p className="participate-apply-hint">팀 목록 불러오는 중…</p>
              ) : teams.length > 0 ? (
                <div className="form-group">
                  <label htmlFor="participate-team-select">내 팀 선택</label>
                  <select
                    id="participate-team-select"
                    className="participate-apply-select"
                    value={selectedTeamId}
                    onChange={(e) => setSelectedTeamId(e.target.value)}
                  >
                    {teams.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.team_name}
                        {t.leader_nickname ? ` · 리더 ${t.leader_nickname}` : ''}
                        {t.i_am_leader ? ' (내가 만든 팀)' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <>
                  <p className="participate-apply-hint">
                    아직 이 공고용 팀이 없습니다. 아래에서 새 팀 이름을 입력해 만들거나, 다른 사람이 먼저 만들었다면 목록이 생긴 뒤 여기서 선택하면 됩니다.
                  </p>
                  <p className="participate-apply-debug">
                    목록 조회 범위: 출처 <code>{source || '—'}</code> · 공고 id <code>{String(contestId).trim() || '—'}</code> (같은 공고·같은 출처로 저장된 팀만)
                  </p>
                </>
              )}
              <div className="form-group">
                <label htmlFor="participate-new-team">새 팀 만들기 (이름)</label>
                <input
                  id="participate-new-team"
                  type="text"
                  className="participate-apply-input"
                  placeholder="예: OO기획팀"
                  value={newTeamName}
                  onChange={(e) => setNewTeamName(e.target.value)}
                />
                <p className="participate-apply-hint subtle">입력 후 확인 시 팀이 생성되고 그 팀으로 참가합니다.</p>
              </div>
            </div>
          ) : null}
          <div className="participate-apply-actions">
            <button type="button" className="btn-outline" onClick={onClose} disabled={creating}>
              취소
            </button>
            <button type="button" className="btn btn-action" onClick={() => void submit()} disabled={creating}>
              {creating ? '처리 중…' : '참가 저장'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
