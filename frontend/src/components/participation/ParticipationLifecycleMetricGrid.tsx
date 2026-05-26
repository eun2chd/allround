import type { LifecycleFilter } from '../../features/participation/participationLifecycle'

type Props = {
  ongoing: number
  ended: number
  activeFilter: LifecycleFilter
  onFilter: (filter: LifecycleFilter) => void
  hint?: string
}

export function ParticipationLifecycleMetricGrid({
  ongoing,
  ended,
  activeFilter,
  onFilter,
  hint,
}: Props) {
  return (
    <section className="participation-lifecycle-metrics" aria-label="진행 상태 요약">
      <button
        type="button"
        className={
          'participation-lifecycle-metric-card participation-lifecycle-metric-card--ongoing' +
          (activeFilter === 'ongoing' ? ' is-active' : '')
        }
        aria-pressed={activeFilter === 'ongoing'}
        onClick={() => onFilter('ongoing')}
      >
        <div className="participation-lifecycle-metric-value">{ongoing}</div>
        <div className="participation-lifecycle-metric-label">진행중</div>
        <div className="participation-lifecycle-metric-hint">클릭 시 진행중만 보기</div>
      </button>
      <button
        type="button"
        className={
          'participation-lifecycle-metric-card participation-lifecycle-metric-card--ended' +
          (activeFilter === 'ended' ? ' is-active' : '')
        }
        aria-pressed={activeFilter === 'ended'}
        onClick={() => onFilter('ended')}
      >
        <div className="participation-lifecycle-metric-value">{ended}</div>
        <div className="participation-lifecycle-metric-label">종료</div>
        <div className="participation-lifecycle-metric-hint">클릭 시 종료만 보기</div>
      </button>
      {activeFilter !== 'all' ? (
        <button
          type="button"
          className="participation-lifecycle-metrics-reset"
          onClick={() => onFilter('all')}
        >
          전체 보기 (필터 해제)
        </button>
      ) : null}
      {hint ? <p className="participation-lifecycle-metrics-note">{hint}</p> : null}
    </section>
  )
}
