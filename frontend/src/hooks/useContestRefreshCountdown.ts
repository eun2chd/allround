import { useEffect, useState } from 'react'

const INTERVAL_SEC = 30 * 60
/** 키 변경 시 이전 주기(5분) 마감값과 섞이지 않음 */
const STORAGE_KEY = 'countdown_next_refresh_contest_allyoung_30m'

function formatMmSs(seconds: number) {
  const m = Math.floor(Math.max(0, seconds) / 60)
  const s = Math.max(0, seconds) % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function readNextDeadlineMs(): number | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw == null) return null
    const nextMs = parseInt(raw, 10)
    if (Number.isNaN(nextMs)) return null
    return nextMs
  } catch {
    return null
  }
}

function writeNextDeadlineMs(nextMs: number) {
  try {
    localStorage.setItem(STORAGE_KEY, String(nextMs))
  } catch {
    /* ignore */
  }
}

function ensureDeadlineMs(): number {
  let nextMs = readNextDeadlineMs()
  const now = Date.now()
  if (nextMs == null) {
    nextMs = now + INTERVAL_SEC * 1000
    writeNextDeadlineMs(nextMs)
    return nextMs
  }
  if (nextMs > now) return nextMs
  while (nextMs <= now) {
    nextMs += INTERVAL_SEC * 1000
  }
  writeNextDeadlineMs(nextMs)
  return nextMs
}

function formatDateTimeKo() {
  return new Date().toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  })
}

function snapshot(): { countdownText: string; dateTimeText: string } {
  const nextMs = ensureDeadlineMs()
  const remaining = Math.max(0, Math.ceil((nextMs - Date.now()) / 1000))
  return {
    countdownText: `(데이터는 30분마다 업데이트·다음 갱신까지 ${formatMmSs(remaining)})`,
    dateTimeText: formatDateTimeKo(),
  }
}

/** 30분 주기·다음 갱신 시각을 localStorage에 두어 탭/페이지 이동 후에도 타이머가 이어짐 */
export function useContestRefreshCountdown() {
  const [{ countdownText, dateTimeText }, setTexts] = useState(snapshot)

  useEffect(() => {
    const id = window.setInterval(() => setTexts(snapshot()), 1000)
    return () => window.clearInterval(id)
  }, [])

  return { countdownText, dateTimeText }
}
