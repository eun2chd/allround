import { useEffect, useState, type FormEvent } from 'react'
import { HiXMark } from 'react-icons/hi2'
import {
  closeTeamSettingYear,
  deleteTeamSettingYear,
  type TeamSettingRow,
  uploadTeamProfileImage,
  upsertTeamSettings,
} from '../../services/sidebarSupabaseService'

export type { TeamSettingRow }

type Props = {
  open: boolean
  mode: 'add' | 'edit'
  initial: TeamSettingRow | null
  yearOptions: number[]
  onClose: () => void
  onSaved: () => void
}

export function TeamSettingsModal({ open, mode, initial, yearOptions, onClose, onSaved }: Props) {
  const [year, setYear] = useState<number>(new Date().getFullYear())
  const [teamName, setTeamName] = useState('')
  const [teamDesc, setTeamDesc] = useState('')
  const [goalPrize, setGoalPrize] = useState('')
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const curYear = new Date().getFullYear()
  const yearSelectOpts =
    yearOptions.length > 0
      ? [...new Set(yearOptions)].sort((a, b) => b - a)
      : Array.from({ length: 6 }, (_, i) => curYear + 2 - i)

  useEffect(() => {
    if (!open) return
    setError(null)
    setFile(null)
    if (mode === 'edit' && initial) {
      setYear(Number(initial.year) || curYear)
      setTeamName((initial.team_name || '').trim())
      setTeamDesc((initial.team_desc || '').trim())
      setGoalPrize(initial.goal_prize != null ? String(initial.goal_prize) : '')
      const ip = (initial.image_path || '').trim()
      setPreviewUrl(ip || null)
    } else {
      setYear(curYear)
      setTeamName('')
      setTeamDesc('')
      setGoalPrize('')
      setPreviewUrl(null)
    }
  }, [open, mode, initial, curYear])

  if (!open) return null

  const isClosed = Boolean(initial?.closed)
  const showDelete = mode === 'edit' && !isClosed
  const showClose = mode === 'edit' && !isClosed

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSaving(true)
    try {
      const goalNum =
        goalPrize.trim() === '' ? 0 : Math.max(0, parseInt(goalPrize, 10) || 0)
      const up = await upsertTeamSettings({
        year,
        team_name: teamName.trim() || '우리 팀',
        team_desc: teamDesc.trim(),
        goal_prize: goalNum,
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

  async function doCloseYear() {
    if (!window.confirm(`${year}년 팀 목표를 마감할까요? 마감 후 수정이 불가합니다.`)) return
    const r = await closeTeamSettingYear(year)
    if (!r.ok) {
      setError(r.error || '마감에 실패했습니다.')
      return
    }
    onSaved()
    onClose()
  }

  async function doDelete() {
    if (!window.confirm(`${year}년 팀 설정을 삭제할까요?`)) return
    const r = await deleteTeamSettingYear(year)
    if (!r.ok) {
      setError(r.error || '삭제에 실패했습니다.')
      return
    }
    onSaved()
    onClose()
  }

  return (
    <div
      className="team-settings-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="team-settings-title"
      onMouseDown={(ev) => {
        if (ev.target === ev.currentTarget) onClose()
      }}
    >
      <div className="team-settings-box">
        <div className="modal-header">
          <h4 id="team-settings-title">팀 설정</h4>
          <button type="button" className="modal-close" aria-label="닫기" onClick={onClose}>
            <HiXMark className="modal-close-ico" aria-hidden />
          </button>
        </div>
        <form className="modal-body" onSubmit={submit}>
          {error ? (
            <p style={{ color: '#b91c1c', fontSize: '0.9rem', marginBottom: 12 }}>{error}</p>
          ) : null}
          <div className="form-group" style={{ marginBottom: 12 }}>
            <label htmlFor="teamSettingsYear">연도</label>
            <select
              id="teamSettingsYear"
              value={year}
              disabled={mode === 'edit'}
              onChange={(e) => setYear(parseInt(e.target.value, 10) || curYear)}
              style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--border-gray)', borderRadius: 6 }}
            >
              {yearSelectOpts.map((y) => (
                <option key={y} value={y}>
                  {y}년
                </option>
              ))}
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 12 }}>
            <label>팀 프로필 이미지</label>
            <div
              style={{
                width: 80,
                height: 80,
                borderRadius: 10,
                background: '#f3f4f6',
                marginBottom: 8,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                backgroundImage: previewUrl ? `url('${previewUrl.replace(/'/g, "\\'")}')` : undefined,
              }}
            />
            <input
              type="file"
              accept="image/*"
              style={{ fontSize: '0.85rem' }}
              onChange={(e) => {
                const f = e.target.files?.[0]
                setFile(f ?? null)
                if (f) {
                  setPreviewUrl(URL.createObjectURL(f))
                }
              }}
            />
          </div>
          <div className="form-group" style={{ marginBottom: 12 }}>
            <label htmlFor="teamSettingsName">팀 이름</label>
            <input
              id="teamSettingsName"
              value={teamName}
              onChange={(e) => setTeamName(e.target.value)}
              placeholder="우리 팀"
              style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--border-gray)', borderRadius: 6 }}
            />
          </div>
          <div className="form-group" style={{ marginBottom: 12 }}>
            <label htmlFor="teamSettingsDesc">팀 설명</label>
            <input
              id="teamSettingsDesc"
              value={teamDesc}
              onChange={(e) => setTeamDesc(e.target.value)}
              placeholder="팀 설명"
              style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--border-gray)', borderRadius: 6 }}
            />
          </div>
          <div className="form-group" style={{ marginBottom: 16 }}>
            <label htmlFor="teamSettingsGoal">목표 금액 (만원)</label>
            <input
              id="teamSettingsGoal"
              type="number"
              min={0}
              value={goalPrize}
              onChange={(e) => setGoalPrize(e.target.value)}
              placeholder="2000"
              style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--border-gray)', borderRadius: 6 }}
            />
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: 6 }}>
              {showClose ? (
                <button type="button" className="btn-outline" style={{ borderColor: '#dc2626', color: '#dc2626' }} onClick={() => void doCloseYear()}>
                  마감
                </button>
              ) : null}
              {showDelete ? (
                <button type="button" className="btn-outline" style={{ borderColor: '#dc2626', color: '#dc2626' }} onClick={() => void doDelete()}>
                  삭제
                </button>
              ) : null}
            </div>
            <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
              <button type="button" className="btn-outline" onClick={onClose}>
                취소
              </button>
              <button type="submit" className="btn-primary" disabled={saving}>
                {saving ? '저장 중…' : '저장'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
