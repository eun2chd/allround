import { useEffect, useMemo, useState } from 'react'
import { HiLockClosed, HiSparkles, HiTrophy, HiXMark } from 'react-icons/hi2'
import { appToast } from '../../lib/appToast'
import { listExpActivitiesForUi } from '../../services/expRewardsConfig'
import { saveUserHashtags } from '../../services/profileMutations'
import type { MypageSnapshotData } from '../../types/mypage'

export const PROFILE_THEME_STORAGE_KEY = 'allyoung_profile_theme'
export const PROFILE_THEME_EVENT = 'allyoung-profile-theme'

const EXP_ACTIVITY_ROWS = listExpActivitiesForUi()

function emitProfileThemeApplied() {
  window.dispatchEvent(new CustomEvent(PROFILE_THEME_EVENT))
}

function applyProfileThemeClass(theme: string) {
  const el = document.getElementById('profileSection')
  if (!el) return
  ;['basic', 'rare', 'epic', 'platinum', 'legend', 'default'].forEach((t) => {
    el.classList.remove(`profile-theme-${t}`)
  })
  if (theme && theme !== 'default') el.classList.add(`profile-theme-${theme}`)
  try {
    localStorage.setItem(PROFILE_THEME_STORAGE_KEY, theme || 'default')
  } catch {
    /* ignore */
  }
  emitProfileThemeApplied()
}

type Props = {
  snapshot: MypageSnapshotData
  openId: string | null
  onClose: () => void
  onSaved: () => void
}

export function MypageOverlayModals({ snapshot, openId, onClose, onSaved }: Props) {
  const [hashtagSel, setHashtagSel] = useState<Set<string>>(() => new Set(snapshot.selected_hashtag_ids || []))

  useEffect(() => {
    if (openId === 'hashtags') {
      setHashtagSel(new Set(snapshot.selected_hashtag_ids || []))
    }
  }, [openId, snapshot.selected_hashtag_ids])

  const hashtagCount = hashtagSel.size
  const maxH = snapshot.hashtag_max_limit || 0

  const orderedCategories = useMemo(() => {
    const order = snapshot.hashtag_category_order || []
    const byCat = snapshot.hashtag_master_by_category || {}
    const seen = new Set<string>()
    const out: string[] = []
    for (const c of order) {
      if (byCat[c]?.length && !seen.has(c)) {
        seen.add(c)
        out.push(c)
      }
    }
    for (const c of Object.keys(byCat)) {
      if (byCat[c]?.length && !seen.has(c)) out.push(c)
    }
    return out
  }, [snapshot.hashtag_category_order, snapshot.hashtag_master_by_category])

  if (!openId) return null

  const wrap = (body: React.ReactNode, wide = false) => (
    <div className="modal-overlay active" role="presentation">
      <div className={'modal-box' + (wide ? ' modal-profile-theme' : '')} role="dialog">
        {body}
      </div>
    </div>
  )

  if (openId === 'tier') {
    return wrap(
      <>
        <div className="modal-header">
          <h4 className="modal-header-title-with-ico">
            <HiTrophy className="modal-header-ico" aria-hidden /> 레벨·티어 시스템
          </h4>
          <button type="button" className="modal-close" aria-label="닫기" onClick={onClose}>
            <HiXMark className="modal-close-ico" aria-hidden />
          </button>
        </div>
        <div className="modal-body">
          <p>경험치를 쌓아 레벨업하면 티어가 올라가고, 프로필 비주얼이 업그레이드됩니다.</p>
          <table className="tier-table">
            <thead>
              <tr>
                <th>Tier</th>
                <th>레벨 구간</th>
                <th>효과</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>BRONZE</td>
                <td>Lv.1~20</td>
                <td>기본 흰 배경</td>
              </tr>
              <tr>
                <td>SILVER</td>
                <td>Lv.21~70</td>
                <td>실버 테두리 + 아바타 실버 글로우</td>
              </tr>
              <tr>
                <td>GOLD</td>
                <td>Lv.71~120</td>
                <td>골드 배경 + 회전 골드 보더 + shimmer 효과</td>
              </tr>
              <tr>
                <td>PLATINUM</td>
                <td>Lv.121~140</td>
                <td>다크 배경 + 파티클 + 무지개 보더</td>
              </tr>
              <tr>
                <td>LEGEND</td>
                <td>Lv.141~</td>
                <td>최고 등급 + 레전드 뱃지</td>
              </tr>
            </tbody>
          </table>
          <p style={{ fontSize: '0.85rem', color: 'var(--gray-muted)', marginTop: 16 }}>
            참가·활동 시 경험치를 얻고, 레벨업 시 더 화려한 프로필을 갖게 됩니다.
          </p>
        </div>
      </>,
    )
  }

  if (openId === 'tierExp') {
    return wrap(
      <>
        <div className="modal-header">
          <h4>전체 레벨 &amp; 티어별 도달 총 경험치</h4>
          <button type="button" className="modal-close" aria-label="닫기" onClick={onClose}>
            <HiXMark className="modal-close-ico" aria-hidden />
          </button>
        </div>
        <div className="modal-body">
          <table className="tier-exp-table">
            <thead>
              <tr>
                <th>티어</th>
                <th>전체 레벨 구간</th>
                <th>해당 티어 도달 총 경험치</th>
              </tr>
            </thead>
            <tbody>
              {(snapshot.tier_exp_milestones || []).map((m) => (
                <tr key={m.tier} className={`tier-row tier-row-${String(m.tier).toLowerCase()}`}>
                  <td>
                    <span className={`tier-badge-pill tier-badge-pill-${String(m.tier).toLowerCase()}`}>
                      {m.tier}
                    </span>
                  </td>
                  <td>{m.level_range}</td>
                  <td className="tier-exp-value">{Math.floor(m.exp || 0)} EXP</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="tier-exp-foot">
            현재 총 경험치: <strong>{snapshot.total_exp}</strong> EXP
          </p>
        </div>
      </>,
    )
  }

  if (openId === 'expAmounts') {
    return wrap(
      <>
        <div className="modal-header">
          <h4>행위별 경험치</h4>
          <button type="button" className="modal-close" aria-label="닫기" onClick={onClose}>
            <HiXMark className="modal-close-ico" aria-hidden />
          </button>
        </div>
        <div className="modal-body">
          <p className="exp-amounts-desc">아래 행위를 수행하면 경험치를 획득할 수 있습니다.</p>
          <table className="exp-amounts-table">
            <thead>
              <tr>
                <th>행위</th>
                <th>경험치</th>
              </tr>
            </thead>
            <tbody>
              {EXP_ACTIVITY_ROWS.map((row) => (
                <tr key={row.activity_type}>
                  <td>{row.label}</td>
                  <td className="exp-value">+{row.exp} EXP</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>,
    )
  }

  if (openId === 'headline') {
    return wrap(
      <>
        <div className="modal-header">
          <h4>자동 생성 헤드라인</h4>
          <button type="button" className="modal-close" aria-label="닫기" onClick={onClose}>
            <HiXMark className="modal-close-ico" aria-hidden />
          </button>
        </div>
        <div className="modal-body">
          <p>역량이 쌓이면 프로필에 노출되는 한 줄 자기소개가 자동으로 업그레이드됩니다.</p>
          <div className="headline-tier-list">
            <div className="headline-tier-item">
              <div className="headline-tier-header">
                <span className="headline-tier-dot headline-tier-dot--bronze" aria-hidden /> BRONZE (Lv.1~20) — 자동
                헤드라인 1종
              </div>
              <ul>
                <li>새로운 도전을 시작하는 크리에이터</li>
              </ul>
            </div>
            <div className="headline-tier-item">
              <div className="headline-tier-header">
                <span className="headline-tier-dot headline-tier-dot--silver" aria-hidden /> SILVER (Lv.21~70) — 자동
                헤드라인 2종
              </div>
              <ul>
                <li>꾸준히 도전하며 성장 중인 크리에이터</li>
                <li>경험을 쌓아가는 실전형 도전자</li>
              </ul>
            </div>
            <div className="headline-tier-item">
              <div className="headline-tier-header">
                <span className="headline-tier-dot headline-tier-dot--gold" aria-hidden /> GOLD (Lv.71~120) — 자동
                헤드라인 3종
              </div>
              <ul>
                <li>성과를 만들어내는 전략형 크리에이터</li>
                <li>경험을 실력으로 증명하는 도전자</li>
                <li>경쟁 속에서 결과를 남기는 크리에이터</li>
              </ul>
            </div>
            <div className="headline-tier-item">
              <div className="headline-tier-header">
                <span className="headline-tier-dot headline-tier-dot--platinum" aria-hidden /> PLATINUM (Lv.121~140)
                — 자동 헤드라인 4종
              </div>
              <ul>
                <li>검증된 성과를 보유한 상위권 크리에이터</li>
                <li>전략과 실행을 겸비한 프로젝트 리더형</li>
                <li>꾸준한 수상과 결과로 증명하는 전문가</li>
                <li>경쟁을 즐기는 실전 최적화형 인재</li>
              </ul>
            </div>
            <div className="headline-tier-item">
              <div className="headline-tier-header">
                <span className="headline-tier-dot headline-tier-dot--legend" aria-hidden /> LEGEND (Lv.141+) — 자동
                헤드라인 5종
              </div>
              <ul>
                <li>최고 등급의 성취를 보유한 레전드 크리에이터</li>
                <li>영향력을 만드는 최상위 성과자</li>
                <li>결과로 증명된 최고 수준의 도전자</li>
                <li>기준이 되는 퍼포먼스 크리에이터</li>
                <li>도전을 넘어 성취를 설계하는 상위 1%</li>
              </ul>
            </div>
          </div>
        </div>
      </>,
    )
  }

  if (openId === 'hashtags') {
    const canEdit = snapshot.level >= 71
    return wrap(
      <>
        <div className="modal-header">
          <h4># 해시태그 선택</h4>
          <button type="button" className="modal-close" aria-label="닫기" onClick={onClose}>
            <HiXMark className="modal-close-ico" aria-hidden />
          </button>
        </div>
        <div className="modal-body">
          {canEdit ? (
            <>
              <p className="hashtag-desc">
                원하는 해시태그를 선택하세요. <strong>최대 {maxH}개</strong>까지 추가할 수 있습니다.
              </p>
              <form
                id="hashtagForm"
                onSubmit={(e) => {
                  e.preventDefault()
                }}
              >
                {orderedCategories.map((cat) => {
                  const tags = snapshot.hashtag_master_by_category[cat] || []
                  if (!tags.length) return null
                  return (
                    <div key={cat} className="hashtag-category">
                      <h5 className="hashtag-category-title">{cat}</h5>
                      <div className="hashtag-chips">
                        {tags.map((t) => {
                          const checked = hashtagSel.has(t.id)
                          const disabled = !checked && hashtagCount >= maxH
                          return (
                            <label key={t.id} className={'hashtag-chip' + (disabled ? ' is-disabled' : '')}>
                              <input
                                type="checkbox"
                                name="hashtag_id"
                                value={t.id}
                                checked={checked}
                                disabled={disabled}
                                onChange={() => {
                                  setHashtagSel((prev) => {
                                    const next = new Set(prev)
                                    if (next.has(t.id)) next.delete(t.id)
                                    else {
                                      if (next.size >= maxH) return prev
                                      next.add(t.id)
                                    }
                                    return next
                                  })
                                }}
                              />
                              <span>#{t.tag_name}</span>
                            </label>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </form>
              <div className="hashtag-actions">
                <span className="hashtag-count">
                  {hashtagCount} / {maxH}
                </span>
                <button
                  type="button"
                  className="btn-save-hashtags"
                  onClick={async () => {
                    const ids = [...hashtagSel]
                    const r = await saveUserHashtags(ids)
                    if (!r.success) {
                      appToast(r.error, 'error')
                      return
                    }
                    appToast('해시태그가 저장되었습니다.')
                    onSaved()
                    onClose()
                  }}
                >
                  저장
                </button>
              </div>
            </>
          ) : (
            <p className="tags-tier-notice">해시태그는 골드 등급(Lv.71) 이상부터 추가할 수 있습니다.</p>
          )}
        </div>
      </>,
    )
  }

  if (openId === 'theme') {
    const level = snapshot.level
    const themes: { key: string; req: number; levelLabel: string; name: string; desc: string; variant: string }[] = [
      { key: 'basic', req: 1, levelLabel: 'Lv.1 BRONZE', name: '브론즈 프로필', desc: '"도전의 시작" · BRONZE 등급입니다.', variant: 'theme-basic' },
      { key: 'rare', req: 21, levelLabel: 'Lv.21 SILVER', name: '경험축적 프로필', desc: '"경험의 축적" · SILVER 등급입니다.', variant: 'theme-rare' },
      { key: 'epic', req: 71, levelLabel: 'Lv.71 GOLD', name: '도전확장 프로필', desc: '"성과의 가시화" · GOLD 등급입니다.', variant: 'theme-epic' },
      { key: 'platinum', req: 121, levelLabel: 'Lv.121 PLATINUM', name: '성과전문 프로필', desc: '"검증된 실력" · PLATINUM 등급입니다.', variant: 'theme-platinum' },
      {
        key: 'default',
        req: 141,
        levelLabel: 'Lv.141 LEGEND',
        name: '최고성과 프로필',
        desc: '"영향력 있는 성취자" · Lv.141부터 LEGEND 등급 전용입니다.',
        variant: 'theme-default-tier',
      },
    ]
    return wrap(
      <>
        <div className="modal-header">
          <h4>프로필 테마 상점</h4>
          <button type="button" className="modal-close" aria-label="닫기" onClick={onClose}>
            <HiXMark className="modal-close-ico" aria-hidden />
          </button>
        </div>
        <div className="modal-body">
          <p className="profile-theme-desc">
            현재 티어에 해당하는 특별한 프로필을 적용해 보세요!{' '}
            <HiSparkles className="profile-theme-desc-ico" aria-hidden />
          </p>
          <div className="profile-theme-grid" data-user-level={level}>
            {themes.map((th) => {
              const locked = level < th.req
              return (
                <div key={th.key} className="profile-theme-card" data-theme={th.key} data-level-required={th.req}>
                  <div className={`theme-preview ${th.variant}`}>
                    {th.key === 'epic' ? <div className="theme-mini-particle" /> : null}
                    {th.key === 'default' ? (
                      <div className="tier-crown" aria-hidden>
                        <HiSparkles className="tier-crown-ico" />
                      </div>
                    ) : null}
                    <div className={'theme-preview-avatar' + (th.key === 'default' ? ' legendary' : '')} />
                    <div className={'theme-preview-bar' + (th.key === 'default' ? ' legendary' : '')} />
                    <div className="theme-lock-overlay" style={{ display: locked ? 'flex' : 'none' }}>
                      <HiLockClosed className="theme-lock-ico" aria-hidden />
                      <span className="theme-lock-msg">레벨 조건이 되지 않습니다</span>
                    </div>
                  </div>
                  <div className="theme-info">
                    <span className="theme-level">{th.levelLabel}</span>
                    <span className="theme-name">{th.name}</span>
                    <p className="theme-desc">{th.desc}</p>
                    <button
                      type="button"
                      className="theme-apply-btn"
                      disabled={locked}
                      onClick={() => {
                        if (locked) return
                        applyProfileThemeClass(th.key === 'default' ? 'default' : th.key)
                        appToast('프로필 테마가 적용되었습니다.')
                        onClose()
                      }}
                    >
                      적용하기
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </>,
      true,
    )
  }

  return null
}
