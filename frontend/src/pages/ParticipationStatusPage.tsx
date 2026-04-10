import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ParticipationDashboardPanel } from '../components/participation/ParticipationDashboardPanel'
import type { PrizeVaultProgress } from '../components/participation/TeamPrizeVault'
import { useMainLayoutOutletContext } from '../components/layout/mainLayoutContext'
import type { ParticipationDetailViewCtx } from '../components/mypage/MypageParticipationDetailViewModal'
import { MypageParticipationDetailViewModal } from '../components/mypage/MypageParticipationDetailViewModal'
import {
  fetchSiteTeamSettingsList,
  fetchTeamPrizeProgress,
} from '../services/sidebarSupabaseService'
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

type ParticipationTab = 'members' | 'dashboard'

export function ParticipationStatusPage() {
  const ctx = useMainLayoutOutletContext()
  const me = ctx?.me
  const [tab, setTab] = useState<ParticipationTab>('dashboard')
  const [members, setMembers] = useState<TeamMemberOverview[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState(false)
  const [viewCtx, setViewCtx] = useState<ParticipationDetailViewCtx | null>(null)
  const [prizeVault, setPrizeVault] = useState<PrizeVaultProgress>(() => ({
    year: new Date().getFullYear(),
    goalPrizeManwon: 0,
    totalAchievedWon: 0,
    closed: false,
  }))
  const [teamSettingYears, setTeamSettingYears] = useState<number[]>([])
  const [dashboardYear, setDashboardYear] = useState<number | null>(null)

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
      }

      try {
        if (!ok) return
        const { rows } = await fetchSiteTeamSettingsList()
        const cy = new Date().getFullYear()
        const years = (rows || [])
          .map((x) => (x.year != null ? parseInt(String(x.year), 10) : NaN))
          .filter((n) => !Number.isNaN(n))
          .sort((a, b) => b - a)
        setTeamSettingYears(years)
        const y = years.length ? (years.includes(cy) ? cy : years[0]!) : cy
        setDashboardYear(y)
      } catch {
        if (ok) setDashboardYear(new Date().getFullYear())
      } finally {
        if (ok) setLoading(false)
      }
    })()
    return () => {
      ok = false
    }
  }, [])

  useEffect(() => {
    if (dashboardYear == null) return
    let ok = true
    ;(async () => {
      try {
        const prog = await fetchTeamPrizeProgress(dashboardYear)
        if (!ok) return
        setPrizeVault({
          year: dashboardYear,
          goalPrizeManwon: prog.goal_prize,
          totalAchievedWon: prog.total_achieved,
          closed: prog.closed,
        })
      } catch {
        if (ok) {
          setPrizeVault({
            year: dashboardYear,
            goalPrizeManwon: 0,
            totalAchievedWon: 0,
            closed: false,
          })
        }
      }
    })()
    return () => {
      ok = false
    }
  }, [dashboardYear])

  const dashboardYearOptions = useMemo(() => {
    const set = new Set<number>()
    const cy = new Date().getFullYear()
    set.add(cy)
    teamSettingYears.forEach((y) => set.add(y))
    for (const m of members) {
      for (const c of m.contests) {
        for (const raw of [c.participation_registered_at, c.submitted_at, c.result_announcement_date]) {
          if (!raw) continue
          const y = parseInt(String(raw).slice(0, 4), 10)
          if (!Number.isNaN(y)) set.add(y)
        }
      }
    }
    if (dashboardYear != null) set.add(dashboardYear)
    return [...set].sort((a, b) => b - a)
  }, [members, teamSettingYears, dashboardYear])

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
            <p className="page-desc">
              팀 단위로 참가 공모전을 모읍니다. <strong>현황판</strong>에서는 발표·상금·상세 미등록을 한눈에 보고,{' '}
              <strong>팀원별</strong>에서는 사람 기준으로 목록을 봅니다.
            </p>
          </div>
        </header>

        <div className="participation-page-tabs" role="tablist" aria-label="참여 현황 보기 방식">
          <button
            type="button"
            role="tab"
            id="participation-tab-dashboard"
            aria-selected={tab === 'dashboard'}
            aria-controls="participation-panel-dashboard"
            className={'participation-page-tab' + (tab === 'dashboard' ? ' is-active' : '')}
            onClick={() => setTab('dashboard')}
          >
            현황판
          </button>
          <button
            type="button"
            role="tab"
            id="participation-tab-members"
            aria-selected={tab === 'members'}
            aria-controls="participation-panel-members"
            className={'participation-page-tab' + (tab === 'members' ? ' is-active' : '')}
            onClick={() => setTab('members')}
          >
            팀원별
          </button>
        </div>

        {loading ? (
          <div className="notice-state-msg">로딩 중...</div>
        ) : err ? (
          <div className="notice-state-msg">데이터를 불러오지 못했습니다.</div>
        ) : tab === 'dashboard' ? (
          <div
            id="participation-panel-dashboard"
            role="tabpanel"
            aria-labelledby="participation-tab-dashboard"
          >
            {dashboardYear != null ? (
              <ParticipationDashboardPanel
                members={members}
                loading={false}
                prizeVault={prizeVault}
                dashboardYear={dashboardYear}
                dashboardYearOptions={dashboardYearOptions}
                onDashboardYearChange={setDashboardYear}
                onOpenContest={openContestDetail}
              />
            ) : (
              <div className="notice-state-msg">연도를 불러오는 중…</div>
            )}
          </div>
        ) : members.length === 0 ? (
          <div className="notice-state-msg">팀원이 없거나 참가 중인 공모전이 없습니다.</div>
        ) : (
          <div
            id="participation-panel-members"
            role="tabpanel"
            aria-labelledby="participation-tab-members"
            className="member-grid"
          >
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
