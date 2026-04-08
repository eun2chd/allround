import { useEffect, useState } from 'react'
import { HiCamera } from 'react-icons/hi2'
import { Link } from 'react-router-dom'
import { useConfirm } from '../../context/ConfirmContext'
import { appToast } from '../../lib/appToast'
import { updateStatusMessage, uploadProfileAvatar } from '../../services/profileMutations'
import type { MypageSnapshotData } from '../../types/mypage'
import { PROFILE_THEME_EVENT, PROFILE_THEME_STORAGE_KEY } from './MypageOverlayModals'

type Props = {
  data: MypageSnapshotData
  onStatusUpdated: () => void
  onOpenModal?: (id: string) => void
}

export function MypageProfileSection({ data, onStatusUpdated, onOpenModal }: Props) {
  const confirm = useConfirm()
  const {
    profile,
    role_label,
    is_own_profile,
    level,
    total_exp,
    exp_percent,
    exp_current,
    exp_next,
    user_hashtags,
    auto_headlines,
    tier_level,
    tier_name,
    tier_sprite,
  } = data

  const [statusMsg, setStatusMsg] = useState((profile.status_message as string) || '')

  useEffect(() => {
    const syncTheme = () => {
      const el = document.getElementById('profileSection')
      if (!el) return
      let theme = 'default'
      try {
        theme = localStorage.getItem(PROFILE_THEME_STORAGE_KEY) || 'default'
      } catch {
        /* ignore */
      }
      ;['basic', 'rare', 'epic', 'platinum', 'legend', 'default'].forEach((t) => {
        el.classList.remove(`profile-theme-${t}`)
      })
      if (theme && theme !== 'default') el.classList.add(`profile-theme-${theme}`)
    }
    syncTheme()
    window.addEventListener(PROFILE_THEME_EVENT, syncTheme)
    return () => window.removeEventListener(PROFILE_THEME_EVENT, syncTheme)
  }, [profile.id])

  const saveStatus = async () => {
    try {
      const j = await updateStatusMessage(statusMsg)
      if (j.success) {
        appToast('상태 메시지를 저장했습니다.', 'success')
        onStatusUpdated()
      } else {
        appToast(j.error || '저장에 실패했습니다.', 'error')
      }
    } catch {
      appToast('저장에 실패했습니다.', 'error')
    }
  }

  const clearStatus = async () => {
    const ok = await confirm({
      title: '상태 메시지',
      message: '상태 메시지를 삭제할까요?',
      confirmText: '삭제',
      danger: true,
    })
    if (!ok) return
    setStatusMsg('')
    try {
      const j = await updateStatusMessage('')
      if (j.success) {
        appToast('상태 메시지를 삭제했습니다.', 'success')
        onStatusUpdated()
      } else {
        appToast(j.error || '삭제에 실패했습니다.', 'error')
      }
    } catch {
      appToast('삭제에 실패했습니다.', 'error')
    }
  }

  const expHint =
    exp_next <= 0
      ? '최고 레벨 달성'
      : exp_current >= exp_next || exp_percent >= 100
        ? `다음 레벨 도달! (${exp_percent}% 완료)`
        : `다음 레벨까지 ${exp_next - exp_current} EXP 필요 (${exp_percent}% 완료)`

  return (
    <section className={`profile-section tier-${tier_level}`} id="profileSection" data-own-profile={is_own_profile ? '1' : '0'}>
      {tier_level >= 3 ? <div className="platinum-shine-overlay" /> : null}
      {tier_level >= 4 ? <div className="legend-light-overlay" aria-hidden="true" /> : null}
      {tier_level >= 2 ? (
        <svg className="profile-border-svg" viewBox="0 0 500 300" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="goldSectionGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#e8b923" />
              <stop offset="50%" stopColor="#fcd34d" />
              <stop offset="100%" stopColor="#fde68a" />
            </linearGradient>
            <linearGradient id="rainbowSectionGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#f59e0b" />
              <stop offset="25%" stopColor="#ec4899" />
              <stop offset="50%" stopColor="#3b82f6" />
              <stop offset="75%" stopColor="#06b6d4" />
              <stop offset="100%" stopColor="#f59e0b" />
            </linearGradient>
            <linearGradient id="pinkSectionGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#831843" />
              <stop offset="50%" stopColor="#ec4899" />
              <stop offset="100%" stopColor="#be185d" />
            </linearGradient>
          </defs>
          <rect x="1.5" y="1.5" width="497" height="297" rx="12" ry="12" />
        </svg>
      ) : null}
      {tier_level >= 3 ? (
        <div className="tier-particles">
          {[...Array(6)].map((_, i) => (
            <span key={i} className="tier-particle" />
          ))}
        </div>
      ) : null}
      <div className="profile-top">
        <div className="avatar-wrap">
          <div
            className={`avatar${tier_level >= 2 ? ' legend-border' : ''}${!profile.profile_url ? ' avatar-no-image' : ''}`}
            id="profileAvatar"
            style={profile.profile_url ? { backgroundImage: `url('${profile.profile_url}')` } : undefined}
          >
            {!profile.profile_url ? <span>{(profile.nickname || '?').toString().slice(0, 1)}</span> : null}
          </div>
          {tier_level >= 4 ? <span className="symbol-badge-medal" aria-hidden="true" /> : null}
          {is_own_profile ? (
            <label className="btn-avatar-upload" title="프로필 이미지 변경">
              <input
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp"
                style={{ display: 'none' }}
                onChange={async (e) => {
                  const f = e.target.files?.[0]
                  if (!f) return
                  await uploadProfileAvatar(f)
                  onStatusUpdated()
                  e.target.value = ''
                }}
              />
              <HiCamera className="btn-avatar-upload-ico" aria-hidden />
            </label>
          ) : null}
        </div>
        <div className="info">
          <h2>
            {profile.nickname || '회원'}
            <span className="role-badge">{role_label}</span>
          </h2>
          <div className="headline-badges">
            {(auto_headlines || []).map((headline, i) => (
              <span key={i} className={`headline-badge headline-badge-${i + 1}`}>
                <span className="headline-badge-dot" />
                {headline}
              </span>
            ))}
          </div>
          <div className="hashtag-row" id="userHashtagsContainer">
            {user_hashtags?.map((h) => (
              <span key={h.id} className="hashtag-badge">
                #{h.tag_name}
              </span>
            ))}
            {is_own_profile && level >= 71 ? (
              <button
                type="button"
                className="hashtag-add-btn"
                title="해시태그 추가"
                onClick={() => onOpenModal?.('hashtags')}
              >
                <span className="hashtag-add-icon">+</span> 해시태그를 추가해보세요
              </button>
            ) : null}
          </div>
          {is_own_profile ? (
            <p style={{ fontSize: '0.85rem', color: 'var(--gray-muted)', marginTop: 8 }}>{profile.email || ''}</p>
          ) : null}
        </div>
        {is_own_profile ? (
          <Link to="/mypage/password" className="btn-outline profile-logout">
            비밀번호 변경
          </Link>
        ) : (
          <Link to="/" className="btn-outline">
            홈으로
          </Link>
        )}
      </div>
      <div className="level-exp-block">
        <div className="level-exp-row">
          <div className="level-exp-emblem">
            <span
              className={`tier-sprite tier-sprite-profile tier-sprite-${tier_sprite}`}
              aria-hidden="true"
            />
          </div>
          <div className="level-exp-info-col">
            <div className="level-tier-line">
              <span className="level-text">Lv.{level}</span>
              <span className={`tier-badge-pill tier-badge-pill-${(tier_name || 'bronze').toLowerCase()}`}>
                {tier_name}
              </span>
              <div className="level-exp-btns">
                <button
                  type="button"
                  className="btn-tier-exp"
                  title="티어별 도달 경험치"
                  onClick={() => onOpenModal?.('tierExp')}
                >
                  EXP
                </button>
                <button
                  type="button"
                  className="btn-tier-exp"
                  title="행위별 경험치"
                  onClick={() => onOpenModal?.('expAmounts')}
                >
                  경험치
                </button>
              </div>
            </div>
            <p className="level-total-exp">총 {total_exp} EXP</p>
            <div className="exp-bar-wrap">
              <div
                className={`exp-bar-fill${tier_level >= 3 ? ' legend' : tier_level >= 2 ? ' gold' : ''}`}
                style={{ width: `${Math.min(100, exp_percent)}%` }}
              />
            </div>
            <p className="exp-next-hint">{expHint}</p>
          </div>
        </div>
      </div>
      {is_own_profile ? (
        <div className="profile-status-row">
          <div className="status-row-inner">
            <input
              type="text"
              className="status-input"
              id="statusInput"
              value={statusMsg}
              onChange={(e) => setStatusMsg(e.target.value)}
              placeholder="상태 메시지를 입력하세요"
              maxLength={80}
            />
            <button type="button" className="btn-save-status" title="저장" onClick={saveStatus}>
              저장
            </button>
            <button type="button" className="btn-clear-status" title="상태 메시지 삭제" onClick={clearStatus}>
              삭제
            </button>
          </div>
        </div>
      ) : null}
    </section>
  )
}
