import { HiCurrencyDollar, HiRocketLaunch, HiTrophy } from 'react-icons/hi2'
import type { MypageSnapshotData } from '../../types/mypage'

export function MypageDashboardSummary({ data }: { data: MypageSnapshotData }) {
  const { awards_total, awards_by_status, prize_total, participate_count } = data
  const breakdown = Object.entries(awards_by_status || {})
    .filter(([, cnt]) => cnt > 0)
    .map(([status, cnt]) => `${status} ${cnt}건`)
    .join(' · ')

  const ico = { className: 'summary-dash-ico', 'aria-hidden': true as const }

  return (
    <section className="dashboard-summary">
      <div className="summary-card">
        <div className="summary-icon trophy">
          <HiTrophy {...ico} />
        </div>
        <div>
          <div className="summary-value">{awards_total ?? 0}건</div>
          <div className="summary-label">수상</div>
          {breakdown ? <div className="summary-awards-breakdown">{breakdown}</div> : null}
        </div>
      </div>
      <div className="summary-card">
        <div className="summary-icon money">
          <HiCurrencyDollar {...ico} />
        </div>
        <div>
          <div className="summary-value">{prize_total || '0'}원</div>
          <div className="summary-label">상금</div>
        </div>
      </div>
      <div className="summary-card">
        <div className="summary-icon rocket">
          <HiRocketLaunch {...ico} />
        </div>
        <div>
          <div className="summary-value">{participate_count ?? 0}건</div>
          <div className="summary-label">도전</div>
        </div>
      </div>
    </section>
  )
}
