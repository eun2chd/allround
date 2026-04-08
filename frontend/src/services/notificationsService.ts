import { getSupabase } from './supabaseClient'

export type NotificationRow = {
  id: number | string
  type: string | null
  source: string | null
  count: number | null
  message: string | null
  created_at: string | null
  read: boolean
}

async function currentUserId(): Promise<string | null> {
  const sb = getSupabase()
  const { data } = await sb.auth.getSession()
  return data.session?.user.id ?? null
}

export async function fetchNotifications(): Promise<{
  success: boolean
  data: NotificationRow[]
  unread_count: number
  error?: string
}> {
  const uid = await currentUserId()
  if (!uid) return { success: true, data: [], unread_count: 0 }

  const sb = getSupabase()
  const { data: stateRows, error: e1 } = await sb
    .from('notification_user_state')
    .select('notification_id, read, deleted')
    .eq('user_id', uid)
    .eq('deleted', false)

  if (e1) return { success: false, data: [], unread_count: 0, error: e1.message }
  if (!stateRows?.length) return { success: true, data: [], unread_count: 0 }

  const stateByNid = new Map<string, boolean>()
  const rawIds: (string | number)[] = []
  for (const s of stateRows) {
    const nid = s.notification_id as string | number | null
    if (nid == null) continue
    rawIds.push(nid)
    stateByNid.set(String(nid), !!s.read)
  }
  if (!rawIds.length) return { success: true, data: [], unread_count: 0 }

  const { data: notifs, error: e2 } = await sb
    .from('notifications')
    .select('id, type, source, count, message, created_at')
    .in('id', rawIds as never[])
    .order('created_at', { ascending: false })

  if (e2) return { success: false, data: [], unread_count: 0, error: e2.message }

  const result: NotificationRow[] = (notifs || []).map((n) => {
    const sid = (n as { id: string | number }).id
    return {
      id: sid,
      type: (n as { type?: string }).type ?? null,
      source: (n as { source?: string }).source ?? null,
      count: (n as { count?: number }).count ?? null,
      message: (n as { message?: string }).message ?? null,
      created_at: (n as { created_at?: string }).created_at ?? null,
      read: stateByNid.get(String(sid)) ?? false,
    }
  })

  const unread_count = result.filter((r) => !r.read).length
  return { success: true, data: result, unread_count }
}

export async function markNotificationRead(notificationId: string | number): Promise<{ success: boolean; error?: string }> {
  const uid = await currentUserId()
  if (!uid) return { success: false, error: 'unauthorized' }
  const sb = getSupabase()
  const { error } = await sb
    .from('notification_user_state')
    .update({ read: true })
    .eq('user_id', uid)
    .eq('notification_id', notificationId as never)
  if (error) return { success: false, error: error.message }
  return { success: true }
}

export async function markNotificationDeleted(notificationId: string | number): Promise<{ success: boolean; error?: string }> {
  const uid = await currentUserId()
  if (!uid) return { success: false, error: 'unauthorized' }
  const sb = getSupabase()
  const { error } = await sb
    .from('notification_user_state')
    .update({ deleted: true })
    .eq('user_id', uid)
    .eq('notification_id', notificationId as never)
  if (error) return { success: false, error: error.message }
  return { success: true }
}

export async function markAllNotificationsRead(): Promise<{ success: boolean; error?: string }> {
  const uid = await currentUserId()
  if (!uid) return { success: false, error: 'unauthorized' }
  const sb = getSupabase()
  const { error } = await sb
    .from('notification_user_state')
    .update({ read: true })
    .eq('user_id', uid)
    .eq('deleted', false)
  if (error) return { success: false, error: error.message }
  return { success: true }
}

export async function markAllNotificationsDeleted(): Promise<{ success: boolean; error?: string }> {
  const uid = await currentUserId()
  if (!uid) return { success: false, error: 'unauthorized' }
  const sb = getSupabase()
  const { error } = await sb
    .from('notification_user_state')
    .update({ deleted: true })
    .eq('user_id', uid)
    .eq('deleted', false)
  if (error) return { success: false, error: error.message }
  return { success: true }
}
