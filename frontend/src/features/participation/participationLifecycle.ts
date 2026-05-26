export const PARTICIPATION_LIFECYCLE_STATUSES = ['진행중', '종료'] as const
export type ParticipationLifecycle = (typeof PARTICIPATION_LIFECYCLE_STATUSES)[number]

export type LifecycleFilter = 'all' | 'ongoing' | 'ended'

export type LifecycleFilterInput = {
  lifecycle_status?: string | null
  participation_status?: string | null
  result_announcement_date?: string | null
}

export function matchesLifecycleFilter(
  input: LifecycleFilterInput,
  filter: LifecycleFilter,
  now: Date = new Date(),
): boolean {
  if (filter === 'all') return true
  const lifecycle = resolveParticipationLifecycle(input, now)
  if (filter === 'ongoing') return lifecycle === '진행중'
  return lifecycle === '종료'
}

export function countParticipationLifecycle(
  rows: LifecycleFilterInput[],
  now: Date = new Date(),
): { ongoing: number; ended: number } {
  let ongoing = 0
  let ended = 0
  for (const r of rows) {
    if (resolveParticipationLifecycle(r, now) === '종료') ended += 1
    else ongoing += 1
  }
  return { ongoing, ended }
}

function startOfTodayMs(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

export function deriveParticipationLifecycle(
  input: {
    participation_status?: string | null
    result_announcement_date?: string | null
  },
  now: Date = new Date(),
): ParticipationLifecycle {
  const st = input.participation_status || ''
  if (st === '수상' || st === '미수상' || st === '취소') return '종료'
  if (input.result_announcement_date) {
    const t = new Date(`${String(input.result_announcement_date).slice(0, 10)}T12:00:00`).getTime()
    if (!Number.isNaN(t) && t < startOfTodayMs(now)) return '종료'
  }
  return '진행중'
}

export function resolveParticipationLifecycle(
  input: {
    lifecycle_status?: string | null
    participation_status?: string | null
    result_announcement_date?: string | null
  },
  now: Date = new Date(),
): ParticipationLifecycle {
  const stored = String(input.lifecycle_status || '').trim()
  if (stored === '진행중' || stored === '종료') return stored
  return deriveParticipationLifecycle(input, now)
}

export function isParticipationEnded(
  input: {
    lifecycle_status?: string | null
    participation_status?: string | null
    result_announcement_date?: string | null
  },
  now: Date = new Date(),
): boolean {
  return resolveParticipationLifecycle(input, now) === '종료'
}

/** 지원·심사 단계 변경 시 종료 단계면 lifecycle 을 종료로 맞추기 */
export function lifecycleForParticipationStatus(status: string): ParticipationLifecycle | null {
  if (status === '수상' || status === '미수상' || status === '취소') return '종료'
  return null
}
