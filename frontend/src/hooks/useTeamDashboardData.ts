import { useCallback, useEffect, useState } from 'react'
import {
  fetchMemberRanking,
  fetchSiteTeamSettingsList,
  fetchTeamActivityLast5,
  fetchTeamPrizeProgress,
  fetchTeamSettingByYear,
  type SidebarActivityRow,
  type SidebarMemberRow,
  type TeamSettingRow,
} from '../services/sidebarSupabaseService'

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
  const [achieved, setAchieved] = useState(0)
  const [goalPct, setGoalPct] = useState(0)
  const [goalHint, setGoalHint] = useState('')
  const [goalClosed, setGoalClosed] = useState(false)

  const [members, setMembers] = useState<SidebarMemberRow[]>([])
  const [membersErr, setMembersErr] = useState<string | null>(null)
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

  const applyPrizeProgressUi = useCallback((j: Record<string, unknown>, hasYears: boolean, y: number | null) => {
    if (!hasYears || !y) {
      setGoalPrizeMan(0)
      setAchieved(0)
      setGoalPct(0)
      setGoalHint('목표가 등록되면 여기에 표시됩니다.')
      setGoalClosed(false)
      return
    }
    const goalMan = Math.max(0, parseInt(String(j.goal_prize), 10) || 0)
    const ach = Math.max(0, parseInt(String(j.total_achieved), 10) || 0)
    const closed = Boolean(j.closed)
    const goalWon = goalMan * 10000
    setGoalPrizeMan(goalMan)
    setAchieved(ach)
    let pct = 0
    let hint = ''
    if (goalWon > 0) {
      pct = Math.min(100, (ach / goalWon) * 100)
      const remaining = goalWon - ach
      hint = remaining <= 0 ? '목표 달성!' : `${formatWon(ach)} / 목표 ${formatWon(goalWon)}, ${formatWon(remaining)} 남음`
    } else {
      hint = ach > 0 ? `달성 ${formatWon(ach)} (목표 미설정)` : '관리자에서 올해 목표 금액(만원)을 넣으면 진행률이 표시됩니다.'
    }
    setGoalPct(pct)
    setGoalHint(hint + (closed ? ' (마감)' : ''))
    setGoalClosed(closed)
  }, [])

  const refreshForYear = useCallback(
    async (y: number | null, hasYears: boolean) => {
      try {
        if (!hasYears || !y) {
          applyTeamSettingsUi(null, false, null)
          applyPrizeProgressUi({}, false, null)
          return
        }
        const [row, prog] = await Promise.all([fetchTeamSettingByYear(y), fetchTeamPrizeProgress(y)])
        applyTeamSettingsUi(row, true, y)
        applyPrizeProgressUi(
          {
            goal_prize: prog.goal_prize,
            total_achieved: prog.total_achieved,
            closed: prog.closed,
          },
          true,
          y,
        )
      } catch {
        applyTeamSettingsUi(null, hasYears, y)
        applyPrizeProgressUi({}, hasYears, y)
      }
    },
    [applyPrizeProgressUi, applyTeamSettingsUi],
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
        const data = await fetchMemberRanking()
        if (!ok) return
        setMembers(data.length ? data : [])
        setMembersErr(null)
      } catch {
        if (ok) {
          setMembers([])
          setMembersErr('로드 실패')
        }
      }
    })()
    return () => {
      ok = false
    }
  }, [])

  useEffect(() => {
    let ok = true
    ;(async () => {
      try {
        const data = await fetchTeamActivityLast5()
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
  }, [])

  const hasYears = teamYears.length > 0

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
    membersErr,
    activities,
    actErr,
    hasYears,
    refreshForYear,
    loadTeamYears,
    formatPrize,
    formatWon,
  }
}
