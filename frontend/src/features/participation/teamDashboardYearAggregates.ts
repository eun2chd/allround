import { normalizePrizeSettlement } from './prizeSettlement'
import { participationRowTouchesYear } from './participationRowYear'
import type { SidebarMemberPrizeRow, SidebarMemberRow } from '../../services/sidebarSupabaseService'
import type { TeamMemberContest, TeamMemberOverview } from '../../services/teamParticipationService'

function contestsForScope(m: TeamMemberOverview, year: number | null, filterByYear: boolean): TeamMemberContest[] {
  if (!filterByYear || year == null) return m.contests
  return m.contests.filter((c) => participationRowTouchesYear(c, year))
}

/** 멤버별 참가 건수·수령 완료 상금 합 (연도 필터 시 참가현황판과 동일 규칙) */
export function buildTeamDashboardRankings(
  overview: TeamMemberOverview[],
  year: number | null,
  filterByYear: boolean,
): { byParticipation: SidebarMemberRow[]; byPrize: SidebarMemberPrizeRow[] } {
  const base = overview.map((m) => {
    const contests = contestsForScope(m, year, filterByYear)
    let prize = 0
    for (const c of contests) {
      if (!c.has_prize || c.prize_amount == null) continue
      const n = Number(c.prize_amount)
      if (Number.isNaN(n) || n <= 0) continue
      if (normalizePrizeSettlement(c.prize_settlement_status) !== '수령 완료') continue
      prize += n
    }
    const pu = (m.profile_url || '').trim()
    return {
      id: m.id,
      nickname: m.nickname || '회원',
      profile_url: pu ? pu : null,
      participate_count: contests.length,
      prize_received_won: Math.floor(prize),
    }
  })

  const byParticipation: SidebarMemberRow[] = base
    .map(({ prize_received_won: _p, ...rest }) => rest)
    .sort(
      (a, b) =>
        (b.participate_count || 0) - (a.participate_count || 0) ||
        (a.nickname || '').localeCompare(b.nickname || '', 'ko'),
    )

  const byPrize: SidebarMemberPrizeRow[] = [...base].sort(
    (a, b) =>
      b.prize_received_won - a.prize_received_won ||
      (b.participate_count || 0) - (a.participate_count || 0) ||
      (a.nickname || '').localeCompare(b.nickname || '', 'ko'),
  )

  return { byParticipation, byPrize }
}

/** 팀 전체 수령 완료 상금 합(원) — 목표 달성 막대용(마감 연도 제외 시 라이브 집계) */
export function teamReceivedWonFromOverview(
  overview: TeamMemberOverview[],
  year: number | null,
  filterByYear: boolean,
): number {
  let t = 0
  for (const m of overview) {
    for (const c of contestsForScope(m, year, filterByYear)) {
      if (!c.has_prize || c.prize_amount == null) continue
      const n = Number(c.prize_amount)
      if (Number.isNaN(n) || n <= 0) continue
      if (normalizePrizeSettlement(c.prize_settlement_status) !== '수령 완료') continue
      t += n
    }
  }
  return Math.floor(t)
}
