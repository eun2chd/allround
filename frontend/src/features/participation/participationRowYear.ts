import type { TeamMemberContest } from '../../services/teamParticipationService'

/** 참가 등록·제출·발표일 중 하나라도 해당 연도(날짜 문자열 앞 4자리)에 속하면 포함 */
export function participationRowTouchesYear(
  r: Pick<TeamMemberContest, 'participation_registered_at' | 'submitted_at' | 'result_announcement_date'>,
  year: number,
): boolean {
  for (const raw of [r.participation_registered_at, r.submitted_at, r.result_announcement_date]) {
    if (!raw) continue
    const s = String(raw).trim()
    const y = parseInt(s.slice(0, 4), 10)
    if (!Number.isNaN(y) && y === year) return true
  }
  return false
}
