import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMainLayoutOutletContext } from '../components/layout/mainLayoutContext'
import {
  PASSWORD_CHANGE_RULE_MESSAGE,
  updateAuthPassword,
  validatePasswordChangeDigits,
} from '../services/authService'
import { appToast } from '../lib/appToast'

export function PasswordChangePage() {
  const ctx = useMainLayoutOutletContext()
  const [nextPw, setNextPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [busy, setBusy] = useState(false)

  if (!ctx) return null
  const { me } = ctx
  const backTo = `/mypage/${encodeURIComponent(me.user_id)}`

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (busy) return
    if (!validatePasswordChangeDigits(nextPw)) {
      appToast(PASSWORD_CHANGE_RULE_MESSAGE, 'error')
      return
    }
    if (nextPw !== confirmPw) {
      appToast('비밀번호 확인이 일치하지 않습니다.', 'error')
      return
    }
    setBusy(true)
    try {
      await updateAuthPassword(nextPw)
      appToast('비밀번호가 변경되었습니다.', 'success')
      setNextPw('')
      setConfirmPw('')
    } catch (err) {
      appToast(err instanceof Error ? err.message : '변경에 실패했습니다.', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="password-change-page">
      <div className="container" style={{ padding: '48px 24px', maxWidth: 480 }}>
        <h1 style={{ fontSize: '1.25rem', marginBottom: 8 }}>비밀번호 변경</h1>
        <p style={{ color: '#6b7280', marginBottom: 20, fontSize: '0.9rem', lineHeight: 1.5 }}>{PASSWORD_CHANGE_RULE_MESSAGE}</p>
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label htmlFor="new-password" style={{ display: 'block', fontSize: '0.875rem', marginBottom: 6 }}>
              새 비밀번호
            </label>
            <input
              id="new-password"
              type="password"
              autoComplete="new-password"
              value={nextPw}
              onChange={(e) => setNextPw(e.target.value)}
              style={{ width: '100%', padding: '10px 12px', border: '1px solid #e5e7eb', borderRadius: 8 }}
            />
          </div>
          <div>
            <label htmlFor="confirm-password" style={{ display: 'block', fontSize: '0.875rem', marginBottom: 6 }}>
              새 비밀번호 확인
            </label>
            <input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              value={confirmPw}
              onChange={(e) => setConfirmPw(e.target.value)}
              style={{ width: '100%', padding: '10px 12px', border: '1px solid #e5e7eb', borderRadius: 8 }}
            />
          </div>
          <button
            type="submit"
            disabled={busy}
            style={{
              padding: '12px 16px',
              background: busy ? '#9ca3af' : '#2563eb',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              fontWeight: 600,
              cursor: busy ? 'not-allowed' : 'pointer',
            }}
          >
            {busy ? '처리 중…' : '비밀번호 변경'}
          </button>
        </form>
        <p style={{ marginTop: 24 }}>
          <Link to={backTo} style={{ color: '#2563eb' }}>
            마이페이지로
          </Link>
          {' · '}
          <Link to="/" style={{ color: '#2563eb' }}>
            홈
          </Link>
        </p>
      </div>
    </div>
  )
}
