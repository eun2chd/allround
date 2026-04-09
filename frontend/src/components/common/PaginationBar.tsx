import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'
import {
  HiChevronDoubleLeft,
  HiChevronDoubleRight,
  HiChevronLeft,
  HiChevronRight,
} from 'react-icons/hi2'

/** 좁은 화면에서 페이지 숫자 슬라이스 폭을 줄임 (CSS와 브레이크포인트 맞춤). */
function useNeighborPad(): number {
  const [pad, setPad] = useState(() => neighborPadFromWidth())

  useEffect(() => {
    const mqNarrow = window.matchMedia('(max-width: 360px)')
    const mqMid = window.matchMedia('(max-width: 520px)')
    const sync = () => setPad(neighborPadFromWidth())
    sync()
    mqNarrow.addEventListener('change', sync)
    mqMid.addEventListener('change', sync)
    return () => {
      mqNarrow.removeEventListener('change', sync)
      mqMid.removeEventListener('change', sync)
    }
  }, [])

  return pad
}

function neighborPadFromWidth(): number {
  if (typeof window === 'undefined') return 2
  if (window.matchMedia('(max-width: 360px)').matches) return 0
  if (window.matchMedia('(max-width: 520px)').matches) return 1
  return 2
}

export type PaginationBarProps = {
  total: number
  page: number
  pageSize: number
  onGo: (p: number) => void
}

const arrowIcoProps = { className: 'pagination-arrow-ico', 'aria-hidden': true as const }

export function PaginationBar({ total, page, pageSize, onGo }: PaginationBarProps) {
  const pad = useNeighborPad()
  const totalPages = Math.ceil(total / pageSize)
  if (total < 1 || totalPages <= 1) return null
  const winStart = Math.max(2, page - pad)
  const winEnd = Math.min(totalPages - 1, page + pad)
  const showFirstEllipsis = winStart > 2
  const showLastEllipsis = winEnd < totalPages - 1

  const nums: ReactNode[] = []
  nums.push(
    page === 1 ? (
      <button key={1} type="button" className="active" disabled>
        1
      </button>
    ) : (
      <button key={1} type="button" onClick={() => onGo(1)}>
        1
      </button>
    ),
  )
  if (showFirstEllipsis) nums.push(<span key="e1" className="pagination-ellipsis">…</span>)
  for (let i = winStart; i <= winEnd; i++) {
    nums.push(
      i === page ? (
        <button key={i} type="button" className="active" disabled>
          {i}
        </button>
      ) : (
        <button key={i} type="button" onClick={() => onGo(i)}>
          {i}
        </button>
      ),
    )
  }
  if (showLastEllipsis) nums.push(<span key="e2" className="pagination-ellipsis">…</span>)
  if (totalPages > 1) {
    nums.push(
      page === totalPages ? (
        <button key={totalPages} type="button" className="active" disabled>
          {totalPages}
        </button>
      ) : (
        <button key={totalPages} type="button" onClick={() => onGo(totalPages)}>
          {totalPages}
        </button>
      ),
    )
  }

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
      <span className="pagination-numbers">{nums}</span>
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
