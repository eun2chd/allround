import { useId } from 'react'
import { Link } from 'react-router-dom'
import { useTeamDashboardData } from '../../hooks/useTeamDashboardData'
import type { SidebarMemberPrizeRow, SidebarMemberRow } from '../../services/sidebarSupabaseService'

function formatActivityAgo(iso: string | null | undefined): string {
  if (iso == null || iso === '') return ''
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return ''
  const sec = Math.floor((Date.now() - t) / 1000)
  if (sec < 45) return '방금 전'
  if (sec < 3600) return `${Math.floor(sec / 60)}분 전`
  if (sec < 86400) return `${Math.floor(sec / 3600)}시간 전`
  return `${Math.floor(sec / 86400)}일 전`
}

const TROPHY = ['🥇', '🥈', '🥉'] as const

function PodiumCard({ m, rank }: { m: SidebarMemberRow; rank: number }) {
  const cnt = m.participate_count || 0
  const badge = TROPHY[rank - 1] ?? `${rank}위`
  const initial = (m.nickname || '?').trim().charAt(0).toUpperCase()
  const url = m.profile_url?.trim()

  return (
    <div className={'td-podium-card td-podium-card--' + rank}>
      <span className="td-podium-trophy" aria-hidden>
        {badge}
      </span>
      <Link to={`/mypage/${encodeURIComponent(m.id)}`} className="td-podium-avatar-link">
        <div
          className="td-podium-avatar"
          style={url ? { backgroundImage: `url('${url.replace(/'/g, "\\'")}')` } : undefined}
        >
          {!url ? initial : null}
        </div>
      </Link>
      <Link to={`/mypage/${encodeURIComponent(m.id)}`} className="td-podium-name">
        {m.nickname || '회원'}
      </Link>
      <div className="td-podium-meta">
        <span className="td-podium-badge">참가 {cnt}건</span>
        <span className="td-podium-badge td-podium-badge--soft">도전 중</span>
      </div>
    </div>
  )
}

function truncate(s: string | undefined, max = 20): string {
  const str = (s || '').trim() || '공모전'
  return str.length > max ? str.slice(0, max) + '...' : str
}

/** 1 → [a], 2 → [a,b], 3 → [a,b,c] … 꼭대기가 1명인 피라미드 행 */
function chunkPyramid<T>(items: T[]): T[][] {
  const rows: T[][] = []
  let i = 0
  let rowLen = 1
  while (i < items.length) {
    rows.push(items.slice(i, i + rowLen))
    i += rowLen
    rowLen += 1
  }
  return rows
}

function pyramidRankAt(rowIndex: number, colIndex: number): number {
  return (rowIndex * (rowIndex + 1)) / 2 + 1 + colIndex
}

function PyramidPrizeCard({ m, rank }: { m: SidebarMemberPrizeRow; rank: number }) {
  const badge = rank <= 3 ? TROPHY[rank - 1] : `${rank}위`
  const initial = (m.nickname || '?').trim().charAt(0).toUpperCase()
  const url = m.profile_url?.trim()
  const tierClass =
    rank === 1 ? 'td-pyramid-card--gold' : rank === 2 ? 'td-pyramid-card--silver' : rank === 3 ? 'td-pyramid-card--bronze' : ''

  return (
    <div className={'td-pyramid-card ' + tierClass}>
      <span className="td-pyramid-rank" aria-hidden>
        {badge}
      </span>
      <Link to={`/mypage/${encodeURIComponent(m.id)}`} className="td-pyramid-avatar-link">
        <div
          className="td-pyramid-avatar"
          style={url ? { backgroundImage: `url('${url.replace(/'/g, "\\'")}')` } : undefined}
        >
          {!url ? initial : null}
        </div>
      </Link>
      <Link to={`/mypage/${encodeURIComponent(m.id)}`} className="td-pyramid-name">
        {m.nickname || '회원'}
      </Link>
      <p className="td-pyramid-prize">{formatPrizeWon(m.prize_received_won)}</p>
      <div className="td-pyramid-meta">
        <span className="td-pyramid-badge">참가 {m.participate_count || 0}건</span>
      </div>
    </div>
  )
}

function formatPrizeWon(won: number): string {
  const v = Math.floor(Math.max(0, won))
  if (v >= 100000000) {
    const eok = v / 100000000
    return `${eok >= 10 ? Math.round(eok) : Math.round(eok * 10) / 10}억 원`
  }
  if (v >= 10000) return `${Math.round(v / 10000).toLocaleString('ko-KR')}만 원`
  if (v <= 0) return '0원'
  return `${v.toLocaleString('ko-KR')}원`
}

const DONUT_R = 39

function GoalDonut({
  pct,
  achievedLabel,
}: {
  pct: number
  achievedLabel: string
}) {
  const uid = useId().replace(/:/g, '')
  const c = 2 * Math.PI * DONUT_R
  const p = Math.min(100, Math.max(0, pct))
  const dash = (p / 100) * c

  return (
    <div className="td-donut-wrap">
      <svg className="td-donut-svg" viewBox="0 0 100 100" aria-hidden>
        <defs>
          <linearGradient id={`td-donut-grad-${uid}`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="var(--main-purple)" />
            <stop offset="100%" stopColor="var(--brand-light)" />
          </linearGradient>
        </defs>
        <circle className="td-donut-track" cx="50" cy="50" r={DONUT_R} transform="rotate(-90 50 50)" />
        <circle
          className="td-donut-progress"
          cx="50"
          cy="50"
          r={DONUT_R}
          transform="rotate(-90 50 50)"
          stroke={`url(#td-donut-grad-${uid})`}
          strokeDasharray={`${dash} ${c}`}
        />
      </svg>
      <div className="td-donut-center">
        <span className="td-donut-pct">{Math.round(p)}%</span>
        <span className="td-donut-sub">{achievedLabel}</span>
      </div>
    </div>
  )
}

export function TeamDashboardView() {
  const d = useTeamDashboardData()
  const {
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
    membersErr,
    activities,
    actErr,
    hasYears,
    refreshForYear,
    formatPrize,
    formatWon,
  } = d

  const top3 = members.slice(0, 3)
  const rest = members.slice(3)

  function renderPodium() {
    const a = top3[0]
    const b = top3[1]
    const c = top3[2]
    if (!a) return null
    if (!b) {
      return (
        <div className="td-podium td-podium--single">
          <PodiumCard m={a} rank={1} />
        </div>
      )
    }
    if (!c) {
      return (
        <div className="td-podium td-podium--double">
          <PodiumCard m={b} rank={2} />
          <PodiumCard m={a} rank={1} />
        </div>
      )
    }
    return (
      <div className="td-podium td-podium--triple">
        <PodiumCard m={b} rank={2} />
        <PodiumCard m={a} rank={1} />
        <PodiumCard m={c} rank={3} />
      </div>
    )
  }

  return (
    <div className="td-page">
      <header className="td-header">
        <div className="td-header-main">
          <div>
            <h1 className="td-title">팀 대시보드</h1>
            <p className="td-subtitle">
              연도를 바꾸면 목표·수령 상금·참가 랭킹·활동 타임라인이 같은 해 기준으로 맞춰집니다. 팀 이름·프로필은 관리자
              메뉴에서 설정됩니다.
            </p>
          </div>
          {hasYears ? (
            <label className="td-header-year">
              <span className="td-header-year-label">대시보드 연도</span>
              <select
                className="td-year-select td-year-select--header"
                value={year ?? ''}
                onChange={(e) => {
                  const y = parseInt(e.target.value, 10)
                  setYear(y)
                  void refreshForYear(y, hasYears)
                }}
              >
                {teamYears.map((y) => (
                  <option key={y} value={y}>
                    {y}년
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
        {hasYears && year != null ? (
          <p className="td-year-scope-hint">
            참가 등록·제출일·결과 발표일 중 하나가 <strong>{year}년</strong>인 공모전만 집계합니다. 활동 목록은 해당 연도에
            접수된 참가(updated_at 기준)입니다.
          </p>
        ) : null}
      </header>

      <div className="td-grid-top">
        <section className="td-widget td-widget--profile">
          <div className="td-widget-head">
            <h2 className="td-widget-title">팀 소개</h2>
          </div>

          <div className="td-team-hero">
            <div
              className="td-team-hero-avatar"
              style={avatarBg ? { backgroundImage: `url('${avatarBg.replace(/'/g, "\\'")}')` } : undefined}
            >
              {avatarText}
            </div>
            <div className="td-team-hero-text">
              <h3 className="td-team-name">{teamName}</h3>
              <p className="td-team-desc">{teamDesc}</p>
            </div>
          </div>

          <div className="td-goal-split">
            <GoalDonut
              pct={goalPct}
              achievedLabel={
                hasYears && year != null ? `${year}년 ${formatWon(achieved)}` : `달성 ${formatWon(achieved)}`
              }
            />
            <div className="td-goal-figures">
              <div>
                <span className="td-figure-label">{hasYears && year != null ? `${year}년 목표` : '목표'}</span>
                <p className="td-figure-value td-figure-value--goal">
                  {formatPrize(goalPrizeMan)}
                  {goalClosed ? (
                    <span className="td-closed-pill" title="마감">
                      마감
                    </span>
                  ) : null}
                </p>
              </div>
              <div>
                <span className="td-figure-label">
                  {hasYears && year != null ? `${year}년 수령 합` : '수령 완료 합'}
                </span>
                <p className="td-figure-value td-figure-value--achieved">{formatWon(achieved)}</p>
              </div>
            </div>
          </div>

          <div className="td-bar-wrap">
            <div className="td-bar" role="progressbar" aria-valuenow={Math.round(goalPct)} aria-valuemin={0} aria-valuemax={100}>
              <div className="td-bar-fill" style={{ width: `${Math.min(100, Math.max(0, goalPct))}%` }} />
            </div>
          </div>
          <p className="td-hint">{goalHint}</p>
        </section>

        <section className="td-widget td-widget--activity">
          <h2 className="td-widget-title">팀 활동</h2>
          <p className="td-widget-desc">
            {hasYears && year != null
              ? `${year}년에 접수된 참가 기록(updated_at) 최근 순입니다.`
              : '최근 참가 신청이 반영된 공모전입니다.'}
          </p>
          {actErr ? (
            <p className="td-empty">{actErr}</p>
          ) : activities.length === 0 ? (
            <p className="td-empty">최근 참가 기록이 없습니다.</p>
          ) : (
            <ul className="td-timeline">
              {activities.map((a, idx) => (
                <li key={`${a.url}-${idx}`} className="td-timeline-item">
                  <span className="td-timeline-dot" aria-hidden />
                  <div className="td-timeline-body">
                    <div className="td-timeline-meta">
                      <span className="td-timeline-name">{a.nickname}</span>
                      <span className="td-timeline-time">{formatActivityAgo(a.updated_at)}</span>
                    </div>
                    <a href={a.url || '#'} className="td-timeline-link" target="_blank" rel="noopener noreferrer">
                      <span className="td-timeline-action">공모전 참가</span>
                      <span className="td-timeline-title">{truncate(a.title, 48)}</span>
                    </a>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="td-widget td-widget--pyramid">
        <h2 className="td-widget-title">상금 피라미드</h2>
        <p className="td-widget-desc">
          {hasYears && year != null ? (
            <>
              <strong>{year}년</strong>에 해당하는 공모전만 집계합니다. 상세 기준 <strong>수령 완료</strong> 금액 합(원) — 많이
              받은 사람이 꼭대기입니다.
            </>
          ) : (
            <>
              상세 기준 <strong>수령 완료</strong> 금액 합(원) — 많이 받은 사람이 꼭대기입니다.
            </>
          )}{' '}
          아래「멤버 랭킹」은 같은 범위의 참가 건수 기준이에요.
        </p>
        {membersErr ? (
          <p className="td-empty">{membersErr}</p>
        ) : membersByPrize.length === 0 ? (
          <p className="td-empty">멤버가 없습니다.</p>
        ) : (
          <div className="td-pyramid" aria-label="수령 완료 상금 피라미드 랭킹">
            {chunkPyramid(membersByPrize).map((row, ri) => (
              <div key={ri} className="td-pyramid-row">
                {row.map((m, ci) => (
                  <PyramidPrizeCard key={m.id} m={m} rank={pyramidRankAt(ri, ci)} />
                ))}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="td-widget td-widget--ranking">
        <h2 className="td-widget-title">멤버 랭킹</h2>
        <p className="td-widget-desc">
          {hasYears && year != null ? (
            <>
              <strong>{year}년</strong>에 해당하는 공모전만 · 참가 건수 기준입니다.
            </>
          ) : (
            <>전 기간 참가 건수 기준입니다.</>
          )}
        </p>
        {membersErr ? (
          <p className="td-empty">{membersErr}</p>
        ) : members.length === 0 ? (
          <p className="td-empty">멤버가 없습니다.</p>
        ) : (
          <>
            {top3.length > 0 ? renderPodium() : null}
            {rest.length > 0 ? (
              <div className="td-ranking-table-wrap">
                <table className="td-ranking-table">
                  <thead>
                    <tr>
                      <th>순위</th>
                      <th>멤버</th>
                      <th>참가</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rest.map((m, i) => {
                      const rank = i + 4
                      const cnt = m.participate_count || 0
                      return (
                        <tr key={m.id}>
                          <td>{rank}</td>
                          <td>
                            <Link to={`/mypage/${encodeURIComponent(m.id)}`}>{m.nickname || '회원'}</Link>
                          </td>
                          <td>{cnt > 0 ? `${cnt}건` : '—'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            ) : null}
          </>
        )}
      </section>
    </div>
  )
}
