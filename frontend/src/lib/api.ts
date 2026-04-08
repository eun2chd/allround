/**
 * `public/` 아래 정적 파일 URL (Vite가 개발·프로덕션에서 동일 경로로 서빙).
 */
export function staticUrl(path: string): string {
  const raw = path.startsWith('/') ? path : `/${path}`
  const base = import.meta.env.BASE_URL ?? '/'
  if (base === '/') return raw
  const b = base.endsWith('/') ? base.slice(0, -1) : base
  return `${b}${raw}`
}
