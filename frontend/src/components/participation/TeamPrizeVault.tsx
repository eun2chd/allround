import type { CSSProperties } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { PRIZE_SETTLEMENT_STATUSES } from '../../features/participation/prizeSettlement'
import { mergeTeamVaultRecord } from '../../features/participation/teamPrizeVaultStorage'
import {
  vaultDataRatio,
  vaultLootTier,
  vaultVisualFillRatio,
} from '../../features/participation/vaultVisualMath'

/** `frontend/public/icon8.gif` — 팀 금고 낙하 아이콘 */
export const DEFAULT_VAULT_COIN_SRC = '/icon8.png'

const DROP_COUNT = 12
const dropStyles = Array.from({ length: DROP_COUNT }, (_, i) => ({
  key: i,
  delay: `${((i * 0.31) % 2.8).toFixed(2)}s`,
  duration: `${(2.0 + (i % 6) * 0.22).toFixed(2)}s`,
  x: `${6 + ((i * 17) % 78)}%`,
  scale: `${0.45 + (i % 5) * 0.1}`,
  wobble: i % 4,
}))

const CEREMONY_BASELINE_KEY = 'allround:vaultCeremonyBaseline:'

export type PrizeVaultProgress = {
  year: number
  goalPrizeManwon: number
  totalAchievedWon: number
  closed: boolean
}

export type PrizeVaultSettlementCounts = Record<(typeof PRIZE_SETTLEMENT_STATUSES)[number], number>

export type PrizeVaultContributor = {
  nickname: string
  profileUrl?: string
}

type Props = {
  progress: PrizeVaultProgress
  settlementCounts: PrizeVaultSettlementCounts
  /** 상금 액수가 입력된 건 수 (정산 집계 대상) */
  prizeEntryCount: number
  /**
   * 금고에 들어가는 상금(원): **수령 완료** 합계. 생략 시 `progress.totalAchievedWon`(DB·레거시 합)을 씁니다.
   */
  vaultReceivedWon?: number
  /** 낙하 아이콘 URL (기본: `/icon8.gif`) */
  coinImageSrc?: string
  /** 수령 완료 상금이 있는 공모전 기준 팀원(금액 큰 순, 중복 제거) */
  prizeContributors?: PrizeVaultContributor[]
}

function formatWonReadable(n: number): string {
  const w = Math.floor(Math.max(0, n))
  if (w >= 100000000) {
    const eok = w / 100000000
    return `${eok >= 10 ? Math.round(eok) : Math.round(eok * 10) / 10}억 원`
  }
  if (w >= 10000) return `${Math.round(w / 10000).toLocaleString('ko-KR')}만 원`
  return `${w.toLocaleString('ko-KR')}원`
}

function VaultCoinFallback({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <svg
      className={className}
      style={style}
      viewBox="0 0 32 32"
      width={32}
      height={32}
      aria-hidden
    >
      <defs>
        <linearGradient id="vault-coin-fallback-g" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#fde047" />
          <stop offset="100%" stopColor="#ca8a04" />
        </linearGradient>
      </defs>
      <rect x="4" y="10" width="24" height="14" rx="2" fill="url(#vault-coin-fallback-g)" />
      <rect x="6" y="12" width="20" height="2" rx="1" fill="rgba(255,255,255,0.35)" />
      <circle cx="16" cy="24" r="3" fill="#eab308" />
    </svg>
  )
}

function VaultMascotBee({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 48 40"
      width={40}
      height={34}
      aria-hidden
    >
      <ellipse cx="24" cy="22" rx="14" ry="11" fill="#fbbf24" stroke="#b45309" strokeWidth="1.2" />
      <ellipse cx="24" cy="22" rx="14" ry="11" fill="none" stroke="#451a03" strokeWidth="0" />
      <path
        d="M12 18h24v8H12z"
        fill="none"
        stroke="#451a03"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <ellipse cx="32" cy="16" rx="9" ry="8" fill="#fef3c7" stroke="#b45309" strokeWidth="1" />
      <circle cx="35" cy="14" r="2" fill="#1e293b" />
      <path d="M38 12l4-3" stroke="#1e293b" strokeWidth="1.4" strokeLinecap="round" />
      <ellipse cx="18" cy="10" rx="7" ry="5" fill="rgba(255,255,255,0.35)" transform="rotate(-18 18 10)" />
      <path
        d="M8 20 Q4 14 6 10 M40 20 Q44 14 42 10"
        fill="none"
        stroke="#94a3b8"
        strokeWidth="1.6"
        strokeLinecap="round"
        opacity="0.85"
      />
    </svg>
  )
}

export function TeamPrizeVault({
  progress,
  settlementCounts,
  prizeEntryCount,
  vaultReceivedWon,
  coinImageSrc = DEFAULT_VAULT_COIN_SRC,
  prizeContributors = [],
}: Props) {
  const { year, goalPrizeManwon, totalAchievedWon: progressTotalAchieved, closed } = progress
  const [coinBroken, setCoinBroken] = useState(false)
  const [ceremony, setCeremony] = useState(false)

  const won = vaultReceivedWon !== undefined && vaultReceivedWon !== null ? vaultReceivedWon : progressTotalAchieved

  const goalWon = Math.max(0, goalPrizeManwon) * 10000
  const completedGoals = goalWon > 0 ? Math.floor(won / goalWon) : 0

  const visualFill = useMemo(() => vaultVisualFillRatio(won, goalWon), [won, goalWon])
  const dataRatio = useMemo(() => vaultDataRatio(won, goalWon), [won, goalWon])
  const lootTier = useMemo(() => vaultLootTier(visualFill), [visualFill])

  const honestPct =
    goalWon > 0
      ? dataRatio >= 1
        ? 100
        : Math.min(100, Math.round(dataRatio * 100))
      : Math.round(visualFill * 100)

  const barWidthPct = goalWon > 0 ? Math.min(99, visualFill * 100) : Math.min(99, visualFill * 100)
  const liquidScaleY = won <= 0 ? 0 : visualFill

  const goalMet = goalWon > 0 && won >= goalWon
  const goalExceeded = goalWon > 0 && won > goalWon
  const isEmpty = won <= 0

  const recordDisplay = useMemo(() => mergeTeamVaultRecord(year, won, completedGoals), [year, won, completedGoals])

  useEffect(() => {
    let last = 0
    try {
      last = Number(localStorage.getItem(CEREMONY_BASELINE_KEY + year) || '0')
    } catch {
      /* ignore */
    }
    const safeLast = Number.isFinite(last) ? last : 0
    if (won <= safeLast) return

    const raf = requestAnimationFrame(() => {
      setCeremony(true)
      try {
        localStorage.setItem(CEREMONY_BASELINE_KEY + year, String(won))
      } catch {
        /* ignore */
      }
    })
    const t = window.setTimeout(() => setCeremony(false), 2800)
    return () => {
      cancelAnimationFrame(raf)
      window.clearTimeout(t)
    }
  }, [won, year])

  const headline =
    goalWon > 0
      ? `${year}년 목표 ${goalPrizeManwon.toLocaleString('ko-KR')}만 원 중 ${formatWonReadable(won)} 달성! (수령 완료)`
      : won > 0
        ? `${year}년 팀 상금(수령 완료) ${formatWonReadable(won)} — 목표는 관리자에서 만원 단위로 설정`
        : `${year}년 팀 금고 — 수령 완료된 상금만 통에 쌓여요.`

  const levelLine =
    goalWon > 0
      ? completedGoals > 0
        ? `무한 성장 · 목표를 ${completedGoals}회 넘겼어요. 지금은 ${completedGoals + 1}번째 구간을 채우는 중!`
        : `첫 목표 구간을 채우면 레벨 업 보너스(후광·축하 바)가 켜져요.`
      : null

  const pendingCount = settlementCounts['미수령']

  const caption = isEmpty
    ? '여기에 우리의 첫 상금을 채워볼까요? (수령 완료만 반영)'
    : lootTier >= 4
      ? ''
      : '가득 채울수록 보람 채워져요'

  return (
    <section
      className={
        'team-prize-vault' +
        (goalMet ? ' team-prize-vault--celebrate' : '') +
        (completedGoals >= 1 ? ' team-prize-vault--leveled' : '') +
        (isEmpty ? ' team-prize-vault--empty' : '') +
        (ceremony ? ' team-prize-vault--ceremony' : '')
      }
      aria-label="팀 금고"
    >
      <div className="team-prize-vault-glow" aria-hidden />
      <div className="team-prize-vault-inner">
        <div className="team-prize-vault-visual" aria-hidden>
          <div
            className={
              'team-prize-vault-stage' + (completedGoals >= 1 ? ' team-prize-vault-stage--halo' : '')
            }
          >
            {pendingCount > 0 ? (
              <div className="team-prize-vault-pending-cloud" title={`미수령 ${pendingCount}건`}>
                <span className="team-prize-vault-pending-cloud-ico" aria-hidden>
                  ☁️
                </span>
                <span className="team-prize-vault-pending-cloud-text">입금 대기 {pendingCount}</span>
              </div>
            ) : null}
            <div
              className={
                'team-prize-vault-fall-zone team-prize-vault-fall-zone--t' +
                lootTier +
                (isEmpty ? ' team-prize-vault-fall-zone--dim' : '')
              }
            >
              {dropStyles.map((d) => {
                const c =
                  prizeContributors.length > 0 ? prizeContributors[d.key % prizeContributors.length] : null
                return (
                  <span
                    key={d.key}
                    className={'team-prize-vault-drop-wrap team-prize-vault-drop-wrap--w' + d.wobble}
                    style={
                      {
                        '--vault-drop-delay': d.delay,
                        '--vault-drop-duration': d.duration,
                        '--vault-drop-x': d.x,
                        '--vault-drop-scale': d.scale,
                      } as CSSProperties
                    }
                  >
                    {coinBroken ? (
                      <VaultCoinFallback className="team-prize-vault-drop team-prize-vault-drop--svg" />
                    ) : (
                      <img
                        className="team-prize-vault-drop"
                        src={coinImageSrc}
                        alt=""
                        width={36}
                        height={36}
                        loading="lazy"
                        decoding="async"
                        onError={() => setCoinBroken(true)}
                      />
                    )}
                    {lootTier >= 4 ? <span className="team-prize-vault-drop-spark" aria-hidden /> : null}
                    {c ? (
                      <span className="team-prize-vault-drop-tag" title={c.nickname}>
                        {c.profileUrl ? (
                          <span
                            className="team-prize-vault-drop-avatar"
                            style={{ backgroundImage: `url('${String(c.profileUrl).replace(/'/g, "\\'")}')` }}
                          />
                        ) : (
                          <span className="team-prize-vault-drop-initial">
                            {(c.nickname || '?').trim().charAt(0)}
                          </span>
                        )}
                        <span className="team-prize-vault-drop-nick">{c.nickname}</span>
                      </span>
                    ) : null}
                  </span>
                )
              })}
            </div>
            <div className="team-prize-vault-jar">
              <div className={'team-prize-vault-jar-lid' + (won > 0 ? ' team-prize-vault-jar-lid--open' : '')} />
              <div className="team-prize-vault-jar-body">
                <div className="team-prize-vault-jar-shine" />
                <div className="team-prize-vault-liquid-track">
                  <div
                    className={'team-prize-vault-liquid' + (goalMet ? ' team-prize-vault-liquid--burst' : '')}
                    style={{ transform: `scaleY(${liquidScaleY})` }}
                  />
                </div>
                {!isEmpty ? (
                  <div
                    className={
                      'team-prize-vault-mascot' +
                      (lootTier >= 3 ? ' team-prize-vault-mascot--chill' : '') +
                      (ceremony ? ' team-prize-vault-mascot--bounce' : '')
                    }
                  >
                    <VaultMascotBee className="team-prize-vault-mascot-svg" />
                  </div>
                ) : null}
              </div>
            </div>
          </div>
          <p className="team-prize-vault-visual-caption">{caption}</p>
        </div>

        <div className="team-prize-vault-copy">
          <h2 className="team-prize-vault-title">팀 금고</h2>
          <p className="team-prize-vault-headline">{headline}</p>
          {levelLine ? <p className="team-prize-vault-level-line">{levelLine}</p> : null}
          {goalMet ? (
            <p className="team-prize-vault-celebrate-msg" role="status">
              목표 달성! 팀 금고 레벨 {Math.max(1, completedGoals)} 구간 완료
              {goalExceeded ? ' · 계속 쌓이는 중' : ''}
            </p>
          ) : null}

          <div className="team-prize-vault-progress-wrap">
            <div
              className={
                'team-prize-vault-progress-bar' + (goalMet ? ' team-prize-vault-progress-bar--done' : '')
              }
              role="progressbar"
              aria-valuenow={honestPct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="목표 대비 수령 완료 상금 달성률(데이터 기준)"
            >
              <div
                className={
                  'team-prize-vault-progress-fill team-prize-vault-progress-fill--visual' +
                  (goalMet ? ' team-prize-vault-progress-fill--celebrate' : '')
                }
                style={{ width: `${barWidthPct}%` }}
              />
            </div>
            <div className="team-prize-vault-progress-meta">
              {goalWon > 0 ? (
                <>
                  <span title="실제 목표 대비 비율(수령 완료)">{honestPct}%</span>
                  <span className="team-prize-vault-progress-delim">·</span>
                  <span>
                    {goalMet
                      ? won > goalWon
                        ? `목표 초과 ${formatWonReadable(won - goalWon)}`
                        : '목표 금액 달성'
                      : `${formatWonReadable(Math.max(0, goalWon - won))} 남음`}
                  </span>
                  <span className="team-prize-vault-progress-delim">·</span>
                  <span className="team-prize-vault-progress-visual-hint" title="통·막대는 80% 법칙으로 천천히 차요">
                    통 높이 ≈ {Math.round(visualFill * 100)}%
                  </span>
                </>
              ) : (
                <span>목표 금액을 넣으면 막대가 목표 대비 %로 움직여요</span>
              )}
              {closed ? (
                <>
                  <span className="team-prize-vault-progress-delim">·</span>
                  <span className="team-prize-vault-closed-tag">연도 마감</span>
                </>
              ) : null}
            </div>
          </div>

          {recordDisplay && goalWon > 0 ? (
            <p className="team-prize-vault-record">
              최고 기록: 목표 <strong>{recordDisplay.maxCompletedGoals}</strong>회 달성 · 누적 최고{' '}
              <strong>{formatWonReadable(recordDisplay.maxWon)}</strong>
            </p>
          ) : won > 0 && goalWon <= 0 && recordDisplay ? (
            <p className="team-prize-vault-record">
              누적 입력 상금 최고: <strong>{formatWonReadable(recordDisplay.maxWon)}</strong>
            </p>
          ) : null}

          <div
            className={
              'team-prize-vault-settlement' + (pendingCount > 0 ? ' team-prize-vault-settlement--pending' : '')
            }
          >
            <h3 className="team-prize-vault-settlement-title">상금 정산 상태</h3>
            <p className="team-prize-vault-settlement-hint">
              집계 대상은 「상금 수령」+ 금액이 입력된 건뿐입니다. <strong>금고 통·막대</strong>에는{' '}
              <strong>수령 완료</strong> 금액만 반영됩니다. 정산 상태는{' '}
              <strong>해당 공모전을 등록한 팀원 본인</strong>이{' '}
              <strong>마이페이지 → 참가 목록 → 상세 등록(또는 수정)</strong> 모달에서 바꿉니다. 건수{' '}
              <strong>{prizeEntryCount}</strong>
            </p>
            {pendingCount > 0 ? (
              <p className="team-prize-vault-pending-cta">
                미수령 {pendingCount}건 — 위 공모전을 등록한 팀원이 마이페이지에서 상세를 열고 「상금 정산 상태」를
                바꾸면 금고에 반영돼요. (참여현황 화면은 보기 전용입니다.)
              </p>
            ) : null}
            <ul className="team-prize-vault-settlement-chips">
              {PRIZE_SETTLEMENT_STATUSES.map((key) => (
                <li
                  key={key}
                  className={key === '미수령' && pendingCount > 0 ? 'team-prize-vault-chip-li--pulse' : undefined}
                >
                  <span className={'team-prize-vault-chip team-prize-vault-chip--' + chipClass(key)}>
                    <span className="team-prize-vault-chip-label">{key}</span>
                    <span className="team-prize-vault-chip-count">{settlementCounts[key]}건</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  )
}

function chipClass(s: string): string {
  if (s === '미수령') return 'pending'
  if (s === '수령 완료') return 'done'
  return 'party'
}
