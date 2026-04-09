import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { HiXMark } from 'react-icons/hi2'
import type { ConfirmOptions } from '../../context/ConfirmContext'
import {
  closeTeamSettingYear,
  deleteTeamSettingYear,
  fetchSumPrizeAchieved,
  type TeamSettingRow,
  uploadTeamProfileImage,
  upsertTeamSettings,
} from '../../services/sidebarSupabaseService'

type Props = {
  open: boolean
  mode: 'add' | 'edit'
  initial: TeamSettingRow | null
  yearOptions: number[]
  onClose: () => void
  onSaved: () => void
  confirm: (opts: ConfirmOptions) => Promise<boolean>
}

export function AdminTeamYearModal({ open, mode, initial, yearOptions, onClose, onSaved, confirm }: Props) {
  const [year, setYear] = useState<number>(new Date().getFullYear())
  const [teamName, setTeamName] = useState('')
  const [teamDesc, setTeamDesc] = useState('')
  const [goalPrize, setGoalPrize] = useState('')
  const [achievedAmount, setAchievedAmount] = useState('')
  const [closed, setClosed] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const curYear = new Date().getFullYear()
  /** 추가: 새로 만들 연도 — DB에 없는 연도도 고를 수 있도록 범위 후보를 섞음. 편집: 기존 행 연도 포함. */
  const yearSelectOpts = useMemo(() => {
    const spread = Array.from({ length: 14 }, (_, i) => curYear + 6 - i)
    if (mode === 'add') {
      return [...new Set([...spread, ...yearOptions])].sort((a, b) => b - a)
    }
    const editYear = initial?.year != null ? Number(initial.year) : NaN
    const merged =
      Number.isFinite(editYear) ? [...yearOptions, editYear] : [...yearOptions]
    if (merged.length === 0) return [...spread]
    return [...new Set(merged)].sort((a, b) => b - a)
  }, [mode, yearOptions, curYear, initial?.year])

  useEffect(() => {
    if (!open) return
    setError(null)
    setFile(null)
    if (mode === 'edit' && initial) {
      setYear(Number(initial.year) || curYear)
      setTeamName((initial.team_name || '').trim())
      setTeamDesc((initial.team_desc || '').trim())
      setGoalPrize(initial.goal_prize != null ? String(initial.goal_prize) : '')
      setAchievedAmount(initial.achieved_amount != null ? String(initial.achieved_amount) : '')
      setClosed(Boolean(initial.closed))
      const ip = (initial.image_path || '').trim()
      setPreviewUrl(ip || null)
    } else {
      setYear(curYear)
      setTeamName('')
      setTeamDesc('')
      setGoalPrize('')
      setAchievedAmount('0')
      setClosed(false)
      setPreviewUrl(null)
    }
  }, [open, mode, initial, curYear])

  if (!open) return null

  const showDelete = mode === 'edit'

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSaving(true)
    try {
      const goalNum = goalPrize.trim() === '' ? 0 : Math.max(0, parseInt(goalPrize, 10) || 0)
      const ach =
        achievedAmount.trim() === '' ? 0 : Math.max(0, Math.floor(parseFloat(achievedAmount) || 0))
      const up = await upsertTeamSettings({
        year,
        team_name: teamName.trim() || '우리 팀',
        team_desc: teamDesc.trim(),
        goal_prize: goalNum,
        achieved_amount: ach,
        closed,
      })
      if (!up.ok) {
        setError(up.error || '저장에 실패했습니다.')
        setSaving(false)
        return
      }
      if (file) {
        const img = await uploadTeamProfileImage(year, file)
        if (!img.ok) {
          setError(img.error || '이미지 업로드에 실패했습니다.')
          setSaving(false)
          return
        }
      }
      onSaved()
      onClose()
    } catch {
      setError('저장에 실패했습니다.')
    } finally {
      setSaving(false)
    }
  }

  async function fillAchievedFromDb() {
    setError(null)
    try {
      const n = await fetchSumPrizeAchieved()
      setAchievedAmount(String(Math.max(0, Math.floor(n))))
    } catch {
      setError('수상 합계를 불러오지 못했습니다.')
    }
  }

  async function doCloseYearSnapshot() {
    const ok = await confirm({
      title: '수상 합계로 마감',
      message: `${year}년을 마감할까요? 지금까지 DB에 기록된 수상 금액 합계를 달성 금액 칸에 넣고, 마감 상태로 저장합니다. 이후 표시용으로는 그때 저장한 달성액이 쓰입니다.`,
      confirmText: '마감하기',
      danger: true,
    })
    if (!ok) return
    const r = await closeTeamSettingYear(year)
    if (!r.ok) {
      setError(r.error || '마감에 실패했습니다.')
      return
    }
    onSaved()
    onClose()
  }

  async function doDelete() {
    const ok = await confirm({
      title: '팀 연도 설정 삭제',
      message: `${year}년 site_team_settings 행을 삭제할까요?`,
      confirmText: '삭제',
      danger: true,
    })
    if (!ok) return
    const r = await deleteTeamSettingYear(year)
    if (!r.ok) {
      setError(r.error || '삭제에 실패했습니다.')
      return
    }
    onSaved()
    onClose()
  }

  return (
    <div className="cp-modal-overlay admin-team-year-overlay" role="presentation">
      <div className="cp-modal cp-modal--wide admin-team-year-modal">
        <div className="cp-modal-header">
          <h2>{mode === 'edit' ? '팀 설정 편집' : '팀 설정 추가'}</h2>
          <button type="button" className="cp-modal-close" aria-label="닫기" onClick={onClose}>
            <HiXMark className="cp-modal-close-ico" aria-hidden />
          </button>
        </div>
        <form className="admin-team-year-form" onSubmit={submit}>
          <div className="cp-modal-body admin-contests-edit-body admin-team-year-modal-body">
            {error ? <p className="admin-team-year-error">{error}</p> : null}
          <div className="cp-form-group">
            <label htmlFor="admin-team-year">연도 *</label>
            <select
              id="admin-team-year"
              className="admin-exp-select admin-team-year-select"
              value={year}
              disabled={mode === 'edit'}
              onChange={(e) => setYear(parseInt(e.target.value, 10) || curYear)}
            >
              {yearSelectOpts.map((y) => (
                <option key={y} value={y}>
                  {y}년
                </option>
              ))}
            </select>
          </div>
          <div className="cp-form-group">
            <label>팀 프로필 이미지 (teamprofile)</label>
            <div
              className="admin-team-year-avatar-preview"
              style={
                previewUrl
                  ? { backgroundImage: `url('${previewUrl.replace(/'/g, "\\'")}')` }
                  : undefined
              }
            />
            <input
              type="file"
              accept="image/*"
              className="admin-team-year-file"
              onChange={(e) => {
                const f = e.target.files?.[0]
                setFile(f ?? null)
                if (f) setPreviewUrl(URL.createObjectURL(f))
              }}
            />
          </div>
          <div className="cp-form-group cp-form-row-2">
            <div>
              <label htmlFor="admin-team-name">팀 이름</label>
              <input
                id="admin-team-name"
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
                placeholder="우리 팀"
                autoComplete="off"
              />
            </div>
            <div>
              <label htmlFor="admin-team-goal">목표 금액 (만원)</label>
              <input
                id="admin-team-goal"
                type="number"
                min={0}
                value={goalPrize}
                onChange={(e) => setGoalPrize(e.target.value)}
                placeholder="2000"
              />
            </div>
          </div>
          <div className="cp-form-group">
            <label htmlFor="admin-team-desc">팀 설명</label>
            <input
              id="admin-team-desc"
              value={teamDesc}
              onChange={(e) => setTeamDesc(e.target.value)}
              placeholder="한 줄 소개"
              autoComplete="off"
            />
          </div>
          <div className="admin-team-year-section">
            <h3 className="admin-team-year-section-title">달성 금액 · 마감</h3>
            <p className="admin-team-year-section-lead">
              <strong>달성 금액</strong>은 팀이 얼마나 상금을 탔는지 보여 줄 숫자(원)입니다. 직접 입력하거나, 아래 버튼으로 DB에
              쌓인 수상 합계를 가져올 수 있습니다.{' '}
              <strong>마감</strong>을 켜 두면 통계용으로 이 달성액을 고정하는 데 쓰입니다(저장 시 함께 반영).
            </p>

            <div className="cp-form-group">
              <label htmlFor="admin-team-achieved">달성 금액 (원)</label>
              <input
                id="admin-team-achieved"
                type="number"
                min={0}
                value={achievedAmount}
                onChange={(e) => setAchievedAmount(e.target.value)}
                placeholder="0"
              />
              <button
                type="button"
                className="btn-secondary admin-team-year-fill-btn"
                onClick={() => void fillAchievedFromDb()}
              >
                수상 합계만 불러오기 (입력칸에 채움)
              </button>
            </div>

            <div className="cp-form-group">
              <label className="admin-team-year-check-label">
                <input type="checkbox" checked={closed} onChange={(e) => setClosed(e.target.checked)} />
                <span className="admin-team-year-check-text">이 연도는 마감 처리됨</span>
              </label>
              <p className="admin-team-year-hint">켜면 마감 상태로 저장합니다. 끄면 진행 중으로 둡니다.</p>
            </div>
          </div>

          {mode === 'edit' ? (
            <div className="admin-team-year-advanced">
              <h3 className="admin-team-year-section-title">빠른 작업</h3>
              <p className="admin-team-year-section-lead">
                아래는 여러 단계를 한 번에 하는 버튼입니다. 일반적으로는 위에서 숫자만 맞춘 뒤 「저장」해도 됩니다.
              </p>
              <div className="admin-team-year-actions-row">
                <button type="button" className="btn-secondary" onClick={() => void doCloseYearSnapshot()}>
                  수상 합계로 마감하기
                </button>
                <span className="admin-team-year-action-note">
                  → 합계를 달성액에 넣고 자동으로 마감까지 처리 (확인 창이 뜹니다)
                </span>
              </div>
              {showDelete ? (
                <div className="admin-team-year-actions-row admin-team-year-actions-row--danger">
                  <button type="button" className="btn-secondary btn-delete" onClick={() => void doDelete()}>
                    이 연도 설정 삭제
                  </button>
                  <span className="admin-team-year-action-note">→ DB에서 {year}년 행을 삭제합니다 (복구 없음)</span>
                </div>
              ) : null}
            </div>
          ) : null}
          </div>
          <div className="cp-modal-footer">
            <button type="button" className="btn-secondary" onClick={onClose}>
              취소
            </button>
            <button type="submit" className="btn-write" disabled={saving}>
              {saving ? '저장 중…' : '저장'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
