/**
 * Flask app.py EXP_AMOUNTS / EXP_ACTIVITY_LABELS 와 동일 (행위별 경험치 표시·지급 기준)
 */
export const EXP_ACTIVITY_AMOUNTS: Record<string, number> = {
  content_check: 5,
  participate: 15,
  pass: 5,
  support_complete: 20,
  finalist: 300,
  award: 1000,
}

export const EXP_ACTIVITY_LABELS: Record<string, string> = {
  content_check: '내용확인',
  participate: '참가',
  pass: '패스',
  support_complete: '지원완료',
  finalist: '본선진출',
  award: '수상',
  /** exp_events 기록용. 지급량은 행의 exp_amount 사용 */
  admin_grant: '관리자 지급·차감',
}

const EXP_UI_ORDER: string[] = [
  'content_check',
  'participate',
  'pass',
  'support_complete',
  'finalist',
  'award',
]

export type ExpActivityRow = { activity_type: string; label: string; exp: number }

export function listExpActivitiesForUi(): ExpActivityRow[] {
  return EXP_UI_ORDER.filter((k) => k in EXP_ACTIVITY_AMOUNTS).map((activity_type) => ({
    activity_type,
    label: EXP_ACTIVITY_LABELS[activity_type] ?? activity_type,
    exp: EXP_ACTIVITY_AMOUNTS[activity_type] ?? 0,
  }))
}

/** 실제 EXP가 지급된 경우에만 토스트용 문구 (중복 행위는 0이라 null) */
export function formatExpGainedToast(activityType: string, exp: number): string | null {
  if (exp <= 0) return null
  const label = EXP_ACTIVITY_LABELS[activityType] ?? activityType
  return `${label} · +${exp} EXP를 획득했습니다.`
}

/** 동일 행위 일괄 처리(예: 전체 내용확인) 시 합산 EXP 안내 */
export function formatExpGainedBulkToast(
  activityType: string,
  totalExp: number,
  processedCount: number,
): string | null {
  if (totalExp <= 0) return null
  const label = EXP_ACTIVITY_LABELS[activityType] ?? activityType
  if (processedCount > 1) {
    return `${label} ${processedCount}건 · +${totalExp} EXP를 획득했습니다.`
  }
  return `${label} · +${totalExp} EXP를 획득했습니다.`
}
