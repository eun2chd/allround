const prefix = 'allround:teamVaultRecord:'

export type TeamVaultRecord = {
  /** 브라우저에 저장된 최대 누적 상금(원) */
  maxWon: number
  /** 목표 대비 완료한 구간 수(목표가 있을 때) */
  maxCompletedGoals: number
}

export function readTeamVaultRecord(year: number): TeamVaultRecord | null {
  try {
    const raw = localStorage.getItem(prefix + year)
    if (!raw) return null
    const j = JSON.parse(raw) as Partial<TeamVaultRecord>
    if (typeof j.maxWon !== 'number') return null
    return {
      maxWon: Math.max(0, j.maxWon),
      maxCompletedGoals: Math.max(0, Math.floor(Number(j.maxCompletedGoals) || 0)),
    }
  } catch {
    return null
  }
}

export function mergeTeamVaultRecord(year: number, totalAchievedWon: number, completedGoals: number): TeamVaultRecord {
  const prev = readTeamVaultRecord(year)
  const next: TeamVaultRecord = {
    maxWon: Math.max(prev?.maxWon ?? 0, Math.floor(Math.max(0, totalAchievedWon))),
    maxCompletedGoals: Math.max(prev?.maxCompletedGoals ?? 0, Math.max(0, completedGoals)),
  }
  try {
    localStorage.setItem(prefix + year, JSON.stringify(next))
  } catch {
    /* ignore quota */
  }
  return next
}
