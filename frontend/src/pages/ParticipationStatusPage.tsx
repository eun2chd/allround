import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMainLayoutOutletContext } from '../components/layout/mainLayoutContext'
import type { ParticipationDetailViewCtx } from '../components/mypage/MypageParticipationDetailViewModal'
import { MypageParticipationDetailViewModal } from '../components/mypage/MypageParticipationDetailViewModal'
import {
  fetchTeamParticipationOverview,
  type TeamMemberContest,
  type TeamMemberOverview,
} from '../services/teamParticipationService'

function ddayClass(d: string | undefined) {
  if (!d) return ''
  const s = String(d).trim()
  if (s.includes('마감')) return 'd-day-urgent'
  if (s.includes('오늘') || s === 'D-day') return 'd-day-today'
  return ''
}

export function ParticipationStatusPage() {
  const ctx = useMainLayoutOutletContext()
  const me = ctx?.me
  const [members, setMembers] = useState<TeamMemberOverview[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState(false)
  const [viewCtx, setViewCtx] = useState<ParticipationDetailViewCtx | null>(null)

  useEffect(() => {
    let ok = true
    ;(async () => {
      setLoading(true)
      setErr(false)
      try {
        const r = await fetchTeamParticipationOverview()
        if (!ok) return
        if (!r.success) setErr(true)
        else setMembers(r.data || [])
      } catch {
        if (ok) setErr(true)
      } finally {
        if (ok) setLoading(false)
      }
    })()
    return () => {
      ok = false
    }
  }, [])

  const openContestDetail = (member: TeamMemberOverview, c: TeamMemberContest) => {
    const src = String(c.source || '').trim()
    const cid = String(c.id || '').trim()
    if (!src || !cid) return
    const metaLine =
      [c.d_day, c.host].filter(Boolean).join(' · ') ||
      String(c.source || '').trim() ||
      ''
    setViewCtx({
      profileUserId: member.id,
      source: src,
      contestId: cid,
      title: c.title || '(제목 없음)',
      contestUrl: String(c.url || ''),
      metaLine,
      hasDetail: !!c.has_detail,
      rev: Date.now(),
      memberLabel: `${member.nickname}님의 참가 상세`,
    })
  }

  if (!me) return null

  return (
    <div className="participation-page">
      <div className="content-page content-page--wide">
        <header className="content-page-header participation-page-header">
          <div>
            <h1>
              <span>참여</span>현황
            </h1>
            <p className="page-desc">각 팀원이 참가 중인 공모전을 한눈에 확인할 수 있습니다. 항목을 누르면 등록된 참가 상세를 볼 수 있습니다.</p>
          </div>
        </header>

        {loading ? (
          <div className="notice-state-msg">로딩 중...</div>
        ) : err || members.length === 0 ? (
          <div className="notice-state-msg">
            {err ? '데이터를 불러오지 못했습니다.' : '팀원이 없거나 참가 중인 공모전이 없습니다.'}
          </div>
        ) : (
          <div className="member-grid">
            {members.map((m) => {
              const initial = (m.nickname || '?').trim().charAt(0).toUpperCase()
              const count = m.contests.length
              return (
                <div key={m.id} className="member-card">
                  <Link to={`/mypage/${encodeURIComponent(m.id)}`} className="member-card-header">
                    <div
                      className="member-avatar"
                      style={
                        m.profile_url
                          ? { backgroundImage: `url('${m.profile_url.replace(/'/g, "\\'")}')` }
                          : undefined
                      }
                    >
                      {!m.profile_url ? initial : null}
                    </div>
                    <div className="member-name-block">
                      <div className="member-nickname">{m.nickname}</div>
                      <div className="member-count">참가 {count}건</div>
                    </div>
                  </Link>
                  <div className="member-contests">
                    {count === 0 ? (
                      <div className="member-contests-empty">참가 중인 공모전이 없습니다</div>
                    ) : (
                      m.contests.map((c) => {
                        const ddc = ddayClass(c.d_day)
                        const source = c.source || '요즘것들'
                        return (
                          <button
                            key={`${c.id}-${c.source}`}
                            type="button"
                            className="contest-item-link"
                            onClick={() => openContestDetail(m, c)}
                          >
                            <div className="contest-item-title2">{c.title || '(제목 없음)'}</div>
                            <div className="contest-item-meta2">
                              {c.d_day ? (
                                <>
                                  <span className={ddc}>{c.d_day}</span>
                                  {' · '}
                                </>
                              ) : null}
                              {source}
                              {c.has_detail ? (
                                <>
                                  {' · '}
                                  <span className="contest-detail-tag contest-detail-tag--registered">상세등록</span>
                                </>
                              ) : (
                                <>
                                  {' · '}
                                  <span className="contest-detail-tag contest-detail-tag--unregistered">미등록</span>
                                </>
                              )}
                            </div>
                          </button>
                        )
                      })
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
      <MypageParticipationDetailViewModal ctx={viewCtx} onClose={() => setViewCtx(null)} />
    </div>
  )
}
