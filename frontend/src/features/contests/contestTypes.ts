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
  participationFilter: '' | 'participate' | 'pass'
  bookmarkOnly: boolean
}

export type ContestMeta = {
  bookmarkSet: Set<string>
  contentChecks: Set<string>
  participation: Record<string, string>
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

/** 메타 키 `source:contestId`에서 contestId 부분 (source에 `:`가 있어도 마지막 `:` 기준) */
export function contestIdFromMetaKey(key: string): string {
  const i = key.lastIndexOf(':')
  return i < 0 ? key : key.slice(i + 1)
}
