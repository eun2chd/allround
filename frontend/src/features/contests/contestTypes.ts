export type ContestRow = {
  id: string
  title?: string
  d_day?: string
  host?: string
  url?: string
  category?: string
  source?: string
  created_at?: string
  updated_at?: string
}

export type FilterState = {
  q: string
  category: string
  source: string
  checkFilter: '' | 'checked' | 'unchecked'
  participationFilter: '' | 'participate' | 'pass' | 'none'
  bookmarkOnly: boolean
  /** D-3 이내·마감 등 요약 카드와 동일 기준 */
  deadlineSoonOnly: boolean
  /** 오늘 등록(로컬 0시 이후 created_at) 요약 카드와 동일 기준 */
  registeredTodayOnly: boolean
  /** true: D-day 기준 마감 임박 순(목록 전체를 불러온 뒤 정렬·페이지네이션) */
  sortDdayUrgent?: boolean
}

/** 목록에서 참가(participate)일 때 개인/팀 표시용 */
export type ParticipationApplyInfo = {
  mode: 'individual' | 'team'
  teamName?: string
}

export type ContestMeta = {
  bookmarkSet: Set<string>
  contentChecks: Set<string>
  participation: Record<string, string>
  /** participate 행만. 패스·미선택 키는 없을 수 있음 */
  participationApply: Record<string, ParticipationApplyInfo>
  commented: Set<string>
}

export const PAGE_SIZE = 10

/** DB `source` 누락 시 목록·메타 키와 동일하게 쓰는 기본 출처 */
export const DEFAULT_CONTEST_SOURCE = '\uc694\uc998\uac83\ub4e4'

export function contestKey(source: string | undefined, id: string | undefined): string {
  const src =
    source != null && String(source).trim() !== '' ? String(source).trim() : DEFAULT_CONTEST_SOURCE
  return `${src}:${String(id ?? '')}`
}

/**
 * contest_team / contests 조회 시 source 불일치 보정.
 * DB에는 source가 빈 문자열이고 앱·URL은 기본 출처(요즘것들)로만 다루는 경우가 있어 둘 다 조회한다.
 */
export function contestSourceQueryCandidates(source: string | undefined): string[] {
  const rawTrim = source != null ? String(source).trim() : ''
  const canonical =
    rawTrim !== '' ? rawTrim : DEFAULT_CONTEST_SOURCE
  const seen = new Set<string>()
  const out: string[] = []
  const push = (s: string) => {
    if (!seen.has(s)) {
      seen.add(s)
      out.push(s)
    }
  }
  push(canonical)
  if (canonical === DEFAULT_CONTEST_SOURCE) push('')
  return out
}

/** 타인 프로필·알림 등에서 본 공모전을 내 계정으로 열 때 사용하는 경로 */
export function contestFocusPath(source: string | undefined, contestId: string | undefined): string {
  const src =
    source != null && String(source).trim() !== '' ? String(source).trim() : DEFAULT_CONTEST_SOURCE
  const id = String(contestId ?? '').trim()
  return `/contest/${encodeURIComponent(src)}/${encodeURIComponent(id)}`
}

/** 메타 키 `source:contestId`에서 contestId 부분 (source에 `:`가 있어도 마지막 `:` 기준) */
export function contestIdFromMetaKey(key: string): string {
  const i = key.lastIndexOf(':')
  return i < 0 ? key : key.slice(i + 1)
}
