/** DB contest_participation_detail.prize_settlement_status 와 동일 */
export const PRIZE_SETTLEMENT_STATUSES = ['미수령', '수령 완료', '팀 회식비 전환'] as const

export type PrizeSettlementStatus = (typeof PRIZE_SETTLEMENT_STATUSES)[number]

export function normalizePrizeSettlement(
  raw: string | null | undefined,
): PrizeSettlementStatus | null {
  if (!raw) return null
  const s = String(raw).trim()
  return (PRIZE_SETTLEMENT_STATUSES as readonly string[]).includes(s)
    ? (s as PrizeSettlementStatus)
    : null
}
