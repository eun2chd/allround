import { useCallback, useEffect, useRef, useState } from 'react'
import type { NotificationRow } from '../services/notificationsService'
import {
  fetchNotifications,
  markAllNotificationsDeleted,
  markAllNotificationsRead,
  markNotificationDeleted,
  markNotificationRead,
} from '../services/notificationsService'

const POLL_MS = 60_000

export function useNotificationsFeed(enabled: boolean, onUnreadBumped?: () => void) {
  const [items, setItems] = useState<NotificationRow[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const lastUnreadRef = useRef<number | null>(null)
  const bumpRef = useRef(onUnreadBumped)
  bumpRef.current = onUnreadBumped

  const reload = useCallback(async () => {
    const r = await fetchNotifications()
    if (!r.success) return
    const unread = r.unread_count
    if (lastUnreadRef.current !== null && unread > lastUnreadRef.current) {
      bumpRef.current?.()
    }
    lastUnreadRef.current = unread
    setItems(r.data)
    setUnreadCount(unread)
  }, [])

  useEffect(() => {
    if (!enabled) return
    void reload()
    const t = window.setInterval(() => void reload(), POLL_MS)
    return () => window.clearInterval(t)
  }, [enabled, reload])

  const readOne = useCallback(
    async (id: string | number) => {
      const r = await markNotificationRead(id)
      if (r.success) await reload()
      return r.success
    },
    [reload],
  )

  const deleteOne = useCallback(
    async (id: string | number) => {
      const r = await markNotificationDeleted(id)
      if (r.success) await reload()
      return r.success
    },
    [reload],
  )

  const readAll = useCallback(async () => {
    const r = await markAllNotificationsRead()
    if (r.success) await reload()
    return r.success
  }, [reload])

  const deleteAll = useCallback(async () => {
    const r = await markAllNotificationsDeleted()
    if (r.success) await reload()
    return r.success
  }, [reload])

  return { items, unreadCount, reload, readOne, deleteOne, readAll, deleteAll }
}
