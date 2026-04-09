import { useEffect, useState } from 'react'

const INTERVAL_SEC = 30 * 60
/** 공모전 카운트다운과 동일 30분 주기; 이전 10분 저장값과 분리 */
const STORAGE_KEY = 'countdown_next_refresh_startup_30m'

function formatMmSs(seconds: number) {
  const m = Math.floor(Math.max(0, seconds) / 60)
  const s = Math.max(0, seconds) % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

/** 30분 주기·공모전 목록과 동일 (localStorage로 탭 이동 후에도 이어짐) */
export function useStartupRefreshCountdown() {
  const [countdownText, setCountdownText] = useState('')
  const [dateTimeText, setDateTimeText] = useState('')

  useEffect(() => {
    function getStoredRemainingSec(): number | null {
      try {
        const stored = localStorage.getItem(STORAGE_KEY)
        if (!stored) return null
        const nextMs = parseInt(stored, 10)
        const remaining = Math.ceil((nextMs - Date.now()) / 1000)
        if (remaining > 0 && remaining <= INTERVAL_SEC) return remaining
      } catch {
        /* ignore */
      }
      return null
    }
    function storeNextRefresh() {
      try {
        localStorage.setItem(STORAGE_KEY, String(Date.now() + INTERVAL_SEC * 1000))
      } catch {
        /* ignore */
      }
    }

    let countdownSec = INTERVAL_SEC
    const stored = getStoredRemainingSec()
    if (stored !== null) countdownSec = stored
    else storeNextRefresh()

    const updateCountdown = () => {
      setCountdownText(`(데이터는 30분마다 업데이트·다음 갱신까지 ${formatMmSs(countdownSec)})`)
    }
    const tickClock = () => {
      setDateTimeText(
        new Date().toLocaleString('ko-KR', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
        }),
      )
    }

    updateCountdown()
    tickClock()
    const id1 = window.setInterval(() => {
      countdownSec -= 1
      if (countdownSec <= 0) {
        countdownSec = INTERVAL_SEC
        storeNextRefresh()
      }
      updateCountdown()
    }, 1000)
    const id2 = window.setInterval(tickClock, 1000)
    return () => {
      window.clearInterval(id1)
      window.clearInterval(id2)
    }
  }, [])

  return { countdownText, dateTimeText }
}
