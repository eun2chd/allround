import type { ContestDashboardSummary } from '../../services/contestDashboardSummaryService'

type Props = {
  summary: ContestDashboardSummary | null
  loading: boolean
  newTodayFilterActive?: boolean
  onNewTodayClick?: () => void
  deadlineSoonFilterActive?: boolean
  onDeadlineSoonClick?: () => void
}

export function ContestSummaryCards({
  summary,
  loading,
  newTodayFilterActive = false,
  onNewTodayClick,
  deadlineSoonFilterActive = false,
  onDeadlineSoonClick,
}: Props) {
  if (loading) {
    return (
      <div className="contest-summary-grid contest-summary-grid--loading">
        <div className="contest-summary-card contest-summary-card--skeleton" />
        <div className="contest-summary-card contest-summary-card--skeleton" />
        <div className="contest-summary-card contest-summary-card--skeleton" />
      </div>
    )
  }

  const s = summary ?? { newToday: 0, updatedLastHour: 0, deadlineSoon: 0 }

  return (
    <div className="contest-summary-grid" role="region" aria-label="오늘의 공모전 현황 요약">
      <button
        type="button"
        className={
          'contest-summary-card contest-summary-card--new contest-summary-card--clickable' +
          (newTodayFilterActive ? ' contest-summary-card--filter-active' : '')
        }
        onClick={onNewTodayClick}
        aria-pressed={newTodayFilterActive}
        aria-label={
          newTodayFilterActive
            ? '오늘 등록 필터 해제, 전체 목록으로'
            : '오늘 등록된 공모전만 보기'
        }
      >
        <div className="contest-summary-card__label">신규 공모전</div>
        <div className="contest-summary-card__value">
          오늘 <strong>{s.newToday}</strong>건 등록
        </div>
        <p className="contest-summary-card__hint">새로 올라온 공고를 먼저 확인해 보세요</p>
      </button>
      <button
        type="button"
        className={
          'contest-summary-card contest-summary-card--deadline contest-summary-card--clickable' +
          (deadlineSoonFilterActive ? ' contest-summary-card--filter-active' : '')
        }
        onClick={onDeadlineSoonClick}
        aria-pressed={deadlineSoonFilterActive}
        aria-label={
          deadlineSoonFilterActive
            ? '마감 임박 필터 해제, 전체 목록으로'
            : '마감 임박 공모전만 보기 (D-3 이내)'
        }
      >
        <div className="contest-summary-card__label">마감 임박</div>
        <div className="contest-summary-card__value">
          D-3 이내 <strong>{s.deadlineSoon}</strong>건
        </div>
        <p className="contest-summary-card__hint">마감이 가까운 일정은 붉은·주황 태그로 표시됩니다</p>
      </button>
      <div className="contest-summary-card contest-summary-card--refresh">
        <div className="contest-summary-card__label">업데이트</div>
        <div className="contest-summary-card__value">
          최근 1시간 <strong>{s.updatedLastHour}</strong>건 갱신
        </div>
        <p className="contest-summary-card__hint">크롤·수정 반영 현황</p>
      </div>
    </div>
  )
}
