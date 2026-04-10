import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  buildTeamDashboardRankings,
  teamReceivedWonFromOverview,
} from '../features/participation/teamDashboardYearAggregates'
import {
  fetchSiteTeamSettingsList,
  fetchTeamActivityForYear,
  fetchTeamActivityLast5,
  fetchTeamPrizeProgress,
  fetchTeamSettingByYear,
  type SidebarActivityRow,
  type SidebarMemberPrizeRow,
  type SidebarMemberRow,
  type TeamSettingRow,
} from '../services/sidebarSupabaseService'
import { fetchTeamParticipationOverview, type TeamMemberOverview } from '../services/teamParticipationService'

function formatPrize(n: number): string {
  if (n < 0) return '0만원'
  if (n >= 10000) return `${n / 10000}억원`
  return `${n}만원`
}

function formatWon(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return '0원'
  const v = Math.floor(Number(n))
  if (v >= 10000) return `${v / 10000}만원`
  return `${v.toLocaleString()}원`
}

export function useTeamDashboardData() {
  const [teamYears, setTeamYears] = useState<number[]>([])
  const [year, setYear] = useState<number | null>(null)

  const [teamName, setTeamName] = useState('로딩 중...')
  const [teamDesc, setTeamDesc] = useState('')
  const [avatarText, setAvatarText] = useState('팀')
  const [avatarBg, setAvatarBg] = useState<string | undefined>()

  const [goalPrizeMan, setGoalPrizeMan] = useState(0)
  const [goalClosed, setGoalClosed] = useState(false)
  /** 마감 연도에 저장된 고정 달성액(원). 0이면 라이브(참가 데이터) 합계 사용 */
  const [achievedFrozen, setAchievedFrozen] = useState(0)

  const [participationOverview, setParticipationOverview] = useState<TeamMemberOverview[]>([])
  const [overviewErr, setOverviewErr] = useState<string | null>(null)

  const [activities, setActivities] = useState<SidebarActivityRow[]>([])
  const [actErr, setActErr] = useState<string | null>(null)

  const applyTeamSettingsUi = useCallback((d: TeamSettingRow | null, hasYears: boolean, y: number | null) => {
    if (!hasYears || !y) {
      setTeamName('우리 팀')
      setAvatarText('팀')
      setAvatarBg(undefined)
      setTeamDesc('연도별 팀 소개가 등록되면 여기에 표시됩니다.')
      return
    }
    if (!d) {
      setTeamName('우리 팀')
      setAvatarText('팀')
      setAvatarBg(undefined)
      setTeamDesc('이 연도 설정이 없습니다.')
      return
    }
    const name = ((d.team_name || '우리 팀') as string).trim() || '우리 팀'
    setTeamName(name)
    const img = (d.image_path || '').trim()
    if (img) {
      setAvatarBg(img)
      setAvatarText('')
    } else {
      setAvatarBg(undefined)
      setAvatarText(name.charAt(0).toUpperCase() || '팀')
    }
    setTeamDesc(((d.team_desc || '') as string).trim() || '등록된 설명이 없습니다.')
  }, [])

  const applyPrizeProgressMeta = useCallback((j: Record<string, unknown>, hasYears: boolean, y: number | null) => {
    if (!hasYears || !y) {
      setGoalPrizeMan(0)
      setAchievedFrozen(0)
      setGoalClosed(false)
      return
    }
    const goalMan = Math.max(0, parseInt(String(j.goal_prize), 10) || 0)
    const closed = Boolean(j.closed)
    const frozen = Math.max(0, parseInt(String(j.achieved_frozen), 10) || 0)
    setGoalPrizeMan(goalMan)
    setGoalClosed(closed)
    setAchievedFrozen(frozen)
  }, [])

  const refreshForYear = useCallback(
    async (y: number | null, hasYears: boolean) => {
      try {
        if (!hasYears || !y) {
          applyTeamSettingsUi(null, false, null)
          applyPrizeProgressMeta({}, false, null)
          return
        }
        const [row, prog] = await Promise.all([fetchTeamSettingByYear(y), fetchTeamPrizeProgress(y)])
        applyTeamSettingsUi(row, true, y)
        applyPrizeProgressMeta(
          {
            goal_prize: prog.goal_prize,
            closed: prog.closed,
            achieved_frozen: prog.achieved_frozen,
          },
          true,
          y,
        )
      } catch {
        applyTeamSettingsUi(null, hasYears, y)
        applyPrizeProgressMeta({}, hasYears, y)
      }
    },
    [applyPrizeProgressMeta, applyTeamSettingsUi],
  )

  const loadTeamYears = useCallback(async () => {
    try {
      const { rows } = await fetchSiteTeamSettingsList()
      if (rows.length) {
        const years = rows
          .map((x) => (x.year != null ? parseInt(String(x.year), 10) : NaN))
          .filter((n) => !Number.isNaN(n))
          .sort((a, b) => b - a)
        const cy = new Date().getFullYear()
        const sel = years.includes(cy) ? cy : years[0] ?? null
        setTeamYears(years)
        setYear(sel)
        await refreshForYear(sel, years.length > 0)
      } else {
        setTeamYears([])
        setYear(null)
        await refreshForYear(null, false)
      }
    } catch {
      setTeamYears([])
      setYear(null)
      await refreshForYear(null, false)
    }
  }, [refreshForYear])

  useEffect(() => {
    const id = window.setTimeout(() => void loadTeamYears(), 0)
    return () => window.clearTimeout(id)
  }, [loadTeamYears])

  useEffect(() => {
    let ok = true
    ;(async () => {
      try {
        const r = await fetchTeamParticipationOverview()
        if (!ok) return
        if (r.success) {
          setParticipationOverview(r.data ?? [])
          setOverviewErr(null)
        } else {
          setParticipationOverview([])
          setOverviewErr(r.error || '참가 데이터를 불러오지 못했습니다.')
        }
      } catch {
        if (ok) {
          setParticipationOverview([])
          setOverviewErr('참가 데이터를 불러오지 못했습니다.')
        }
      }
    })()
    return () => {
      ok = false
    }
  }, [])

  const hasYears = teamYears.length > 0
  const filterByYear = Boolean(hasYears && year != null)

  const { byParticipation, byPrize } = useMemo(
    () => buildTeamDashboardRankings(participationOverview, year, filterByYear),
    [participationOverview, year, filterByYear],
  )

  const members: SidebarMemberRow[] = byParticipation
  const membersByPrize: SidebarMemberPrizeRow[] = byPrize

  const achievedEarned = useMemo(
    () => teamReceivedWonFromOverview(participationOverview, year, filterByYear),
    [participationOverview, year, filterByYear],
  )

  const achieved = goalClosed && achievedFrozen > 0 ? achievedFrozen : achievedEarned

  const goalWon = goalPrizeMan * 10000

  const goalPct = useMemo(() => {
    if (!hasYears || year == null) return 0
    if (goalWon <= 0) return 0
    return Math.min(100, (achieved / goalWon) * 100)
  }, [hasYears, year, goalWon, achieved])

  const goalHint = useMemo(() => {
    if (!hasYears || year == null) {
      return '연도별 팀 설정이 등록되면 상단에서 연도를 고르고, 목표·랭킹·활동이 같은 해로 맞춰집니다.'
    }
    if (goalWon > 0) {
      const remaining = goalWon - achieved
      const base =
        remaining <= 0
          ? '목표 달성!'
          : `${formatWon(achieved)} / 목표 ${formatWon(goalWon)}, ${formatWon(remaining)} 남음`
      return base + (goalClosed ? ' (마감 · 달성액은 관리자 저장값이면 그 숫자를 씁니다)' : '')
    }
    const base =
      achieved > 0
        ? `${year}년 수령 완료 합 ${formatWon(achieved)} (목표 미설정)`
        : '관리자에서 해당 연도 목표 금액(만원)을 넣으면 진행률이 표시됩니다.'
    return base + (goalClosed ? ' (마감)' : '')
  }, [hasYears, year, goalWon, achieved, goalClosed])

  useEffect(() => {
    let ok = true
    ;(async () => {
      try {
        const data =
          hasYears && year != null
            ? await fetchTeamActivityForYear(year, 5)
            : await fetchTeamActivityLast5()
        if (!ok) return
        setActivities(data.length ? data : [])
        setActErr(null)
      } catch {
        if (ok) {
          setActivities([])
          setActErr('로드 실패')
        }
      }
    })()
    return () => {
      ok = false
    }
  }, [year, hasYears])

  return {
    teamYears,
    year,
    setYear,
    teamName,
    teamDesc,
    avatarText,
    avatarBg,
    goalPrizeMan,
    achieved,
    goalPct,
    goalHint,
    goalClosed,
    members,
    membersByPrize,
    membersErr: overviewErr,
    activities,
    actErr,
    hasYears,
    refreshForYear,
    loadTeamYears,
    formatPrize,
    formatWon,
  }
}
