import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type {
  AdminCategoryBar,
  AdminDailyExpPoint,
  AdminFeedbackSlice,
  AdminTierSlice,
  AdminDashboardSummary,
} from '../../services/adminDashboardService'

const PIE_COLORS = ['#a78bfa', '#818cf8', '#34d399', '#fbbf24', '#f472b6', '#94a3b8']
const TOOLTIP_STYLE = {
  backgroundColor: '#1a1f2a',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 8,
  color: '#fff',
  fontSize: 12,
}
const AXIS_TICK = { fill: 'rgba(255,255,255,0.65)', fontSize: 11 }

function pctDelta(today: number, yesterday: number): string {
  if (yesterday === 0) return today > 0 ? '전일 0 → 증가' : '전일 대비 0%'
  const p = Math.round(((today - yesterday) / yesterday) * 1000) / 10
  return `전일 대비 ${p >= 0 ? '+' : ''}${p}%`
}

function SummaryCard({
  title,
  value,
  sub,
}: {
  title: string
  value: string | number
  sub?: string
}) {
  return (
    <div className="admin-dash-stat-card">
      <p className="admin-dash-stat-title">{title}</p>
      <p className="admin-dash-stat-value">{value}</p>
      {sub ? <p className="admin-dash-stat-sub">{sub}</p> : null}
    </div>
  )
}

type Props = {
  summary: AdminDashboardSummary
  tierDistribution: AdminTierSlice[]
  expEventsByDay: AdminDailyExpPoint[]
  contestsByCategory: AdminCategoryBar[]
  feedbackByStatus: AdminFeedbackSlice[]
  expEventsChartTruncated: boolean
}

export function AdminDashboardOverview({
  summary,
  tierDistribution,
  expEventsByDay,
  contestsByCategory,
  feedbackByStatus,
  expEventsChartTruncated,
}: Props) {
  const feedbackStack = [
    {
      name: '건의·신고',
      pending: feedbackByStatus.find((s) => s.status === 'pending')?.count ?? 0,
      processing: feedbackByStatus.find((s) => s.status === 'processing')?.count ?? 0,
      done: feedbackByStatus.find((s) => s.status === 'done')?.count ?? 0,
    },
  ]

  return (
    <div className="admin-dash-overview">
      <section className="admin-dash-section" aria-label="요약 지표">
        <h2 className="admin-dash-section-title">서비스 요약</h2>
        <div className="admin-dash-stat-grid">
          <SummaryCard
            title="전체 사용자"
            value={summary.totalUsers.toLocaleString('ko-KR')}
            sub={`오늘 가입 ${summary.newUsersToday}명 · 어제 ${summary.newUsersYesterday}명`}
          />
          <SummaryCard
            title="오늘 EXP 이벤트"
            value={summary.expEventsToday.toLocaleString('ko-KR')}
            sub={pctDelta(summary.expEventsToday, summary.expEventsYesterday)}
          />
          <SummaryCard
            title="미처리 건의"
            value={summary.feedbackPending.toLocaleString('ko-KR')}
            sub="status = pending"
          />
          <SummaryCard
            title="진행 중 공모전"
            value={summary.contestsActive.toLocaleString('ko-KR')}
            sub={`전체 ${summary.contestsTotal.toLocaleString('ko-KR')}건 중 (d_day 기준)`}
          />
        </div>
      </section>

      <section className="admin-dash-section" aria-label="차트">
        <h2 className="admin-dash-section-title">시각화</h2>
        <div className="admin-dash-chart-grid">
          <div className="admin-dash-chart-card">
            <h3 className="admin-dash-chart-title">티어별 사용자 분포</h3>
            {tierDistribution.length === 0 ? (
              <p className="admin-dash-chart-empty">표시할 프로필 데이터가 없습니다.</p>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={tierDistribution}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={56}
                    outerRadius={88}
                    paddingAngle={2}
                  >
                    {tierDistribution.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                  <Legend wrapperStyle={{ color: '#fff', fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="admin-dash-chart-card">
            <h3 className="admin-dash-chart-title">일별 EXP 이벤트 (최근 30일)</h3>
            {expEventsChartTruncated ? (
              <p className="admin-dash-chart-note">※ 최근 기록 상한으로 일부만 집계되었을 수 있습니다.</p>
            ) : null}
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={expEventsByDay} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="adminExpFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#a78bfa" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#a78bfa" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                <XAxis
                  dataKey="date"
                  tick={AXIS_TICK}
                  tickFormatter={(v) => String(v).slice(5)}
                  interval="preserveStartEnd"
                />
                <YAxis tick={AXIS_TICK} allowDecimals={false} width={36} />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  formatter={(value: number | string) => [`${value}건`, '이벤트']}
                  labelFormatter={(label) => `날짜 ${label}`}
                />
                <Area type="monotone" dataKey="count" stroke="#a78bfa" fill="url(#adminExpFill)" name="이벤트 수" />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="admin-dash-chart-card">
            <h3 className="admin-dash-chart-title">공모전 카테고리 비중 (상위)</h3>
            {contestsByCategory.length === 0 ? (
              <p className="admin-dash-chart-empty">공모전 데이터가 없습니다.</p>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={contestsByCategory} layout="vertical" margin={{ left: 8, right: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                  <XAxis type="number" tick={AXIS_TICK} allowDecimals={false} />
                  <YAxis type="category" dataKey="category" width={100} tick={AXIS_TICK} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                  <Bar dataKey="count" name="건수" fill="#818cf8" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="admin-dash-chart-card">
            <h3 className="admin-dash-chart-title">건의·신고 처리 상태</h3>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={feedbackStack} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                <XAxis type="category" dataKey="name" tick={AXIS_TICK} />
                <YAxis tick={AXIS_TICK} allowDecimals={false} width={36} />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Legend wrapperStyle={{ color: '#fff', fontSize: 12 }} />
                <Bar dataKey="pending" stackId="s" name="대기" fill="#fbbf24" />
                <Bar dataKey="processing" stackId="s" name="처리 중" fill="#818cf8" />
                <Bar dataKey="done" stackId="s" name="완료" fill="#34d399" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>
    </div>
  )
}
