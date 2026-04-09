import type { NotificationRow } from './notificationsService'

const STORAGE_KEY = 'allround-browser-notifications-enabled'

export function browserNotificationsSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window
}

export function getBrowserNotificationsEnabled(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

export function setBrowserNotificationsEnabled(on: boolean): void {
  try {
    if (on) localStorage.setItem(STORAGE_KEY, '1')
    else localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
}

export async function requestBrowserNotificationPermission(): Promise<NotificationPermission> {
  if (!browserNotificationsSupported()) return 'denied'
  return Notification.requestPermission()
}

/** 탭이 백그라운드일 때만 표시 (포그라운드는 앱 내 토스트로 충분). */
export function showBrowserNotificationForNew(row: NotificationRow | null): void {
  if (!browserNotificationsSupported()) return
  if (Notification.permission !== 'granted') return
  if (!getBrowserNotificationsEnabled()) return
  if (typeof document !== 'undefined' && document.visibilityState === 'visible') return

  const title = 'allround'
  const body = row?.message?.trim() || '새 알림이 도착했습니다'
  const icon = '/logo.png'
  const badge = '/favicon.png'
  const tag = row?.id != null ? `allround-noti-${row.id}` : 'allround-noti'

  try {
    new Notification(title, { body, icon, badge, tag })
  } catch {
    /* 일부 환경에서 예외 가능 */
  }
}
