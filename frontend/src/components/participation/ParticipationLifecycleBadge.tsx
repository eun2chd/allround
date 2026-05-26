import {
  resolveParticipationLifecycle,
  type ParticipationLifecycle,
} from '../../features/participation/participationLifecycle'

type Props = {
  lifecycle_status?: string | null
  participation_status?: string | null
  result_announcement_date?: string | null
  now?: Date
}

export function ParticipationLifecycleBadge({
  lifecycle_status,
  participation_status,
  result_announcement_date,
  now,
}: Props) {
  const lifecycle: ParticipationLifecycle = resolveParticipationLifecycle(
    { lifecycle_status, participation_status, result_announcement_date },
    now,
  )
  return (
    <span
      className={
        'participation-lifecycle-badge' +
        (lifecycle === '종료' ? ' participation-lifecycle-badge--ended' : ' participation-lifecycle-badge--ongoing')
      }
    >
      {lifecycle}
    </span>
  )
}
