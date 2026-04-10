import type { ReactNode } from 'react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  HiChevronDoubleLeft,
  HiChevronDoubleRight,
  HiChevronLeft,
  HiChevronRight,
} from 'react-icons/hi2'

/** home-page.css `@media (max-width: 520px)` 과 동일 */
const NARROW_MAX_PX = 520

/**
 * 숫자 구간 (PC·모바일 공통): 10개 단위 슬라이딩
 * - 1~9페이지: 1~10
 * - 10~20페이지: 10~21
 * - 21페이지~: 21~31, 31~41, …
 */
function pageNumberWindowBounds(page: number, totalPages: number): { start: number; end: number } {
  if (totalPages <= 10) return { start: 1, end: totalPages }
  if (page < 10) return { start: 1, end: Math.min(10, totalPages) }
  if (page <= 20) return { start: 10, end: Math.min(21, totalPages) }
  const rel = page - 21
  const idx = Math.floor(rel / 10)
  const start = 21 + idx * 10
  const end = Math.min(start + 10, totalPages)
  return { start, end }
}

function pushSlidingNumberRow(
  nums: ReactNode[],
  page: number,
  totalPages: number,
  onGo: (p: number) => void,
) {
  const { start, end } = pageNumberWindowBounds(page, totalPages)
  if (totalPages <= 10) {
    for (let i = 1; i <= totalPages; i++) nums.push(pageButton(i, page, onGo))
    return
  }
  if (start > 1) {
    nums.push(pageButton(1, page, onGo))
    if (start > 2) nums.push(<span key="e-narrow-pre" className="pagination-ellipsis">…</span>)
  }
  for (let i = start; i <= end; i++) nums.push(pageButton(i, page, onGo))
  if (end < totalPages) {
    if (end < totalPages - 1) nums.push(<span key="e-narrow-post" className="pagination-ellipsis">…</span>)
    nums.push(pageButton(totalPages, page, onGo))
  }
}

function narrowFromWidth(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia(`(max-width: ${NARROW_MAX_PX}px)`).matches
}

function useNarrowPagination(): boolean {
  const [narrow, setNarrow] = useState(narrowFromWidth)

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${NARROW_MAX_PX}px)`)
    const sync = () => setNarrow(mq.matches)
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])

  return narrow
}

export type PaginationBarProps = {
  total: number
  page: number
  pageSize: number
  onGo: (p: number) => void
}

const arrowIcoProps = { className: 'pagination-arrow-ico', 'aria-hidden': true as const }

function pageButton(i: number, page: number, onGo: (p: number) => void): ReactNode {
  return i === page ? (
    <button key={i} type="button" className="active" disabled>
      {i}
    </button>
  ) : (
    <button key={i} type="button" onClick={() => onGo(i)}>
      {i}
    </button>
  )
}

export function PaginationBar({ total, page, pageSize, onGo }: PaginationBarProps) {
  const narrow = useNarrowPagination()
  const numbersRef = useRef<HTMLSpanElement>(null)
  const totalPages = Math.ceil(total / pageSize)

  useLayoutEffect(() => {
    if (!narrow || total < 1 || totalPages <= 1) return
    const root = numbersRef.current
    if (!root) return
    const active = root.querySelector<HTMLButtonElement>('button.active')
    if (!active) return
    active.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'auto' })
  }, [narrow, page, total, pageSize, totalPages])

  if (total < 1 || totalPages <= 1) return null

  const nums: ReactNode[] = []
  pushSlidingNumberRow(nums, page, totalPages, onGo)

  return (
    <div className="pagination">
      <button type="button" className="pagination-arrow" title="첫 페이지" disabled={page <= 1} onClick={() => onGo(1)}>
        <HiChevronDoubleLeft {...arrowIcoProps} />
      </button>
      <button
        type="button"
        className="pagination-arrow"
        title="이전"
        disabled={page <= 1}
        onClick={() => onGo(page - 1)}
      >
        <HiChevronLeft {...arrowIcoProps} />
      </button>
      <span className="pagination-numbers" ref={numbersRef}>
        {nums}
      </span>
      <button
        type="button"
        className="pagination-arrow"
        title="다음"
        disabled={page >= totalPages}
        onClick={() => onGo(page + 1)}
      >
        <HiChevronRight {...arrowIcoProps} />
      </button>
      <button
        type="button"
        className="pagination-arrow"
        title="끝 페이지"
        disabled={page >= totalPages}
        onClick={() => onGo(totalPages)}
      >
        <HiChevronDoubleRight {...arrowIcoProps} />
      </button>
    </div>
  )
}
