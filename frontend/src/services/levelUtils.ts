export const HEADLINE_BY_TIER: Record<number, string[]> = {
  0: ['새로운 도전을 시작하는 크리에이터'],
  1: [
    '꾸준히 도전하며 성장 중인 크리에이터',
    '경험을 쌓아가는 실전형 도전자',
  ],
  2: [
    '성과를 만들어내는 전략형 크리에이터',
    '경험을 실력으로 증명하는 도전자',
    '경쟁 속에서 결과를 남기는 크리에이터',
  ],
  3: [
    '검증된 성과를 보유한 상위권 크리에이터',
    '전략과 실행을 겸비한 프로젝트 리더형',
    '꾸준한 수상과 결과로 증명하는 전문가',
    '경쟁을 즐기는 실전 최적화형 인재',
  ],
  4: [
    '최고 등급의 성취를 보유한 레전드 크리에이터',
    '영향력을 만드는 최상위 성과자',
    '결과로 증명된 최고 수준의 도전자',
    '기준이 되는 퍼포먼스 크리에이터',
    '도전을 넘어 성취를 설계하는 상위 1%',
  ],
}

export type LevelConfigRow = { level: number; exp_to_next: number }

export function getTierFromLevel(level: number): { tierId: number; tierName: string; tierLevel: number } {
  if (level <= 20) return { tierId: 1, tierName: 'BRONZE', tierLevel: 0 }
  if (level <= 70) return { tierId: 2, tierName: 'SILVER', tierLevel: 1 }
  if (level <= 120) return { tierId: 3, tierName: 'GOLD', tierLevel: 2 }
  if (level <= 140) return { tierId: 4, tierName: 'PLATINUM', tierLevel: 3 }
  return { tierId: 5, tierName: 'LEGEND', tierLevel: 4 }
}

export function computeLevelFromExpRows(totalExpVal: number, rows: LevelConfigRow[]): number {
  if (totalExpVal <= 0 || rows.length === 0) return 1
  let cumulative = 0
  let level = 1
  for (const r of rows) {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const lv = Number((r as any).level ?? 0)
    const expTo = Number((r as any).exp_to_next ?? 0)
    if (totalExpVal >= cumulative) level = lv
    cumulative += expTo
  }
  return Math.max(1, level)
}

function computeLevelExpCached(levelVal: number, totalExpVal: number, levelConfigRows: LevelConfigRow[]) {
  let expCurrent = 0
  let expNext = 100
  let expPercent = 0
  if (!levelConfigRows.length) return { expCurrent, expNext, expPercent }
  try {
    const rows = levelConfigRows.filter((r) => Number(r.level) <= levelVal)
    if (!rows.length) return { expCurrent, expNext, expPercent }
    const expCumulative = rows.slice(0, -1).reduce((s, r) => s + Number(r.exp_to_next || 0), 0)
    expCurrent = Math.max(0, totalExpVal - expCumulative)
    expNext = Number(rows[rows.length - 1]?.exp_to_next ?? 100)
    expPercent = expNext ? Math.round((expCurrent / expNext) * 100) : 0
  } catch {
    /* ignore */
  }
  return { expCurrent, expNext, expPercent }
}

/** Flask `_mypage_page_data` / `_compute_level_exp` 루프와 동일한 레벨·경험치 진행도 */
export function resolveLevelProgress(totalExp: number, levelConfigRows: LevelConfigRow[]) {
  if (!levelConfigRows.length) {
    return { level: 1, expCurrent: 0, expNext: 100, expPercent: 0 }
  }
  let level = computeLevelFromExpRows(totalExp, levelConfigRows)
  let { expCurrent, expNext, expPercent } = computeLevelExpCached(level, totalExp, levelConfigRows)
  for (let i = 0; i < 199; i++) {
    if (expNext <= 0 || expCurrent < expNext) break
    const nextLevel = level + 1
    const ec = computeLevelExpCached(nextLevel, totalExp, levelConfigRows)
    if (ec.expNext === 0 || (ec.expCurrent === expCurrent && ec.expNext === expNext)) break
    level = nextLevel
    expCurrent = ec.expCurrent
    expNext = ec.expNext
    expPercent = ec.expNext ? Math.round((ec.expCurrent / ec.expNext) * 100) : 0
  }
  return { level, expCurrent, expNext, expPercent: Math.min(100, expPercent) }
}
