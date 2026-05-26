/** YYYY-MM-DD (필터·정렬용) */
export function participationDateIso(iso: string | null | undefined): string | null {
  if (!iso) return null
  const s = String(iso).slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null
}

/** 일반 표시용 YYYY.MM.DD */
export function formatParticipationDateShort(iso: string | null | undefined): string {
  const s = participationDateIso(iso)
  if (!s) return '-'
  const [y, m, day] = s.split('-')
  return `${y}.${m}.${day}`
}

/** 테이블 셀용 YY.MM.DD (한 줄·말줄임) */
export function formatParticipationDateTable(iso: string | null | undefined): string {
  const s = participationDateIso(iso)
  if (!s) return '-'
  const [y, m, day] = s.split('-')
  return `${y.slice(2)}.${m}.${day}`
}

/** 툴팁·필터 UI용 (날짜+시간이 있으면 시각 포함) */
export function formatParticipationDateFull(iso: string | null | undefined): string {
  if (!iso) return '-'
  const raw = String(iso).trim()
  const dateOnly = participationDateIso(raw)
  if (!dateOnly) return '-'
  const t = raw.length > 10 ? raw.slice(11, 16) : ''
  if (t && /^\d{2}:\d{2}/.test(t)) return `${dateOnly} ${t}`
  return dateOnly
}
