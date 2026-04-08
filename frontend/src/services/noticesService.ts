import { getSupabase } from './supabaseClient'

export type NoticeRow = {
  id: string
  title: string
  body: string | null
  author_id: string | null
  is_pinned: boolean
  created_at: string
  updated_at: string
  author_nickname?: string | null
}

async function attachAuthorNicknames(rows: NoticeRow[]): Promise<NoticeRow[]> {
  const ids = [...new Set(rows.map((r) => r.author_id).filter(Boolean))] as string[]
  if (!ids.length) return rows.map((r) => ({ ...r, author_nickname: null }))
  const sb = getSupabase()
  const { data } = await sb.from('profiles').select('id, nickname').in('id', ids)
  const map: Record<string, string> = {}
  for (const p of data || []) map[String(p.id)] = String((p as { nickname?: string }).nickname || '')
  return rows.map((r) => ({
    ...r,
    author_nickname: r.author_id ? map[r.author_id] ?? null : null,
  }))
}

export async function fetchNoticesList(): Promise<{ success: boolean; data?: NoticeRow[]; error?: string }> {
  const sb = getSupabase()
  const { data, error } = await sb
    .from('notices')
    .select('id, title, body, author_id, is_pinned, created_at, updated_at')
    .order('is_pinned', { ascending: false })
    .order('created_at', { ascending: false })
  if (error) return { success: false, error: error.message }
  const rows = (data || []) as NoticeRow[]
  return { success: true, data: await attachAuthorNicknames(rows) }
}

export async function fetchNoticeDetail(
  id: string,
): Promise<{ success: boolean; data?: NoticeRow; error?: string }> {
  const sb = getSupabase()
  const { data, error } = await sb
    .from('notices')
    .select('id, title, body, author_id, is_pinned, created_at, updated_at')
    .eq('id', id)
    .maybeSingle()
  if (error) return { success: false, error: error.message }
  if (!data) return { success: false, error: 'not_found' }
  const [withNick] = await attachAuthorNicknames([data as NoticeRow])
  return { success: true, data: withNick }
}

export async function createNotice(payload: {
  title: string
  body: string
  is_pinned: boolean
  authorId: string
}): Promise<{ success: boolean; data?: NoticeRow; error?: string }> {
  const sb = getSupabase()
  const { data, error } = await sb
    .from('notices')
    .insert({
      title: payload.title.trim(),
      body: payload.body.trim() || null,
      is_pinned: payload.is_pinned,
      author_id: payload.authorId,
    })
    .select('id, title, body, author_id, is_pinned, created_at, updated_at')
    .maybeSingle()
  if (error) return { success: false, error: error.message }
  try {
    const { data: notif } = await sb
      .from('notifications')
      .insert({
        type: 'notice',
        source: '공지사항',
        count: 1,
        message: `새 공지사항: ${payload.title.trim().slice(0, 80)}`,
      })
      .select('id')
      .maybeSingle()
    const nid = notif && (notif as { id?: number }).id
    if (nid != null) {
      const { data: members } = await sb.from('profiles').select('id')
      const states = (members || []).map((m) => ({
        user_id: (m as { id: string }).id,
        notification_id: nid,
        read: false,
        deleted: false,
      }))
      if (states.length) await sb.from('notification_user_state').insert(states)
    }
  } catch {
    /* 알림 실패는 무시 */
  }
  return { success: true, data: data as NoticeRow }
}

export async function updateNotice(
  id: string,
  payload: { title: string; body: string; is_pinned: boolean },
): Promise<{ success: boolean; data?: NoticeRow; error?: string }> {
  const sb = getSupabase()
  const { data, error } = await sb
    .from('notices')
    .update({
      title: payload.title.trim(),
      body: payload.body.trim() || null,
      is_pinned: payload.is_pinned,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select('id, title, body, author_id, is_pinned, created_at, updated_at')
    .maybeSingle()
  if (error) return { success: false, error: error.message }
  if (!data) return { success: false, error: 'not_found' }
  return { success: true, data: data as NoticeRow }
}

export async function deleteNotice(id: string): Promise<{ success: boolean; error?: string }> {
  const sb = getSupabase()
  const { error } = await sb.from('notices').delete().eq('id', id)
  if (error) return { success: false, error: error.message }
  return { success: true }
}
