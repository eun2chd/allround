/**
 * 금고 액체/막대에 쓰는 "80% 법칙" 시각 높이 (0~1, 상한 약 0.9).
 * 데이터 비율 r = achieved / goal (목표 없으면 별도 처리).
 */
export function vaultVisualFillRatio(achievedWon: number, goalWon: number): number {
  if (goalWon <= 0) {
    if (achievedWon <= 0) return 0
    return Math.min(0.88, 0.12 + Math.min(0.76, achievedWon / 2_500_000))
  }
  const r = achievedWon / goalWon
  if (r <= 0) return 0
  if (r <= 0.5) {
    return 0.08 + (r / 0.5) * (0.5 - 0.08)
  }
  if (r <= 0.8) {
    const t = (r - 0.5) / 0.3
    return 0.5 + t * 0.25
  }
  const over = Math.min(r, 50)
  return 0.75 + (1 - Math.exp(-(over - 0.8) * 1.8)) * 0.14
}

/** 진짜 목표 대비 비율 (라벨·스크린리더용, 0~∞) */
export function vaultDataRatio(achievedWon: number, goalWon: number): number {
  if (goalWon <= 0) return 0
  return achievedWon / goalWon
}

/** 1=동전~ 4=럭셔리 — 시각 단계 (떨어지는 이펙트·복사 문구) */
export function vaultLootTier(visualRatio: number): 1 | 2 | 3 | 4 {
  if (visualRatio < 0.1) return 1
  if (visualRatio < 0.5) return 2
  if (visualRatio < 0.8) return 3
  return 4
}
