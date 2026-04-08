import { getSupabase } from './supabaseClient'

export type FeedbackCategory = 'error' | 'feature'

export type FeedbackListRow = {
  id: string
  user_id: string
  category: FeedbackCategory
  title: string
  description: string
  reason: string | null
  image_url: string | null
  status: string
  admin_reply: string | null
  admin_replied_at: string | null
  created_at: string
  author_nickname?: string | null
}

export type FeedbackDetailRow = FeedbackListRow & { is_own: boolean }

function randomHex() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID().replace(/-/g, '')
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`
}

export async function uploadFeedbackImage(userId: string, file: File): Promise<string | null> {
  const sb = getSupabase()
  const ext = (file.name.split('.').pop() || 'png').toLowerCase()
  const safeExt = ['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext) ? ext : 'png'
  const path = `private/${userId}/feedback_${randomHex()}.${safeExt}`
  const { error } = await sb.storage.from('rep').upload(path, file, {
    upsert: true,
    contentType: file.type || `image/${safeExt}`,
  })
  if (error) return null
  const { data } = sb.storage.from('rep').getPublicUrl(path)
  return data?.publicUrl ?? null
}

async function attachNicknames(rows: FeedbackListRow[]): Promise<FeedbackListRow[]> {
  const ids = [...new Set(rows.map((r) => r.user_id).filter(Boolean))]
  if (!ids.length) return rows
  const sb = getSupabase()
  const { data } = await sb.from('profiles').select('id, nickname').in('id', ids)
  const map: Record<string, string> = {}
  for (const p of data || []) map[String((p as { id: string }).id)] = String((p as { nickname?: string }).nickname || '')
  return rows.map((r) => ({ ...r, author_nickname: map[r.user_id] ?? null }))
}

export async function fetchFeedbackList(params: {
  category?: '' | FeedbackCategory
  isAdmin: boolean
  currentUserId: string
}): Promise<{ success: boolean; data?: FeedbackListRow[]; error?: string }> {
  const sb = getSupabase()
  let q = sb
    .from('feedback_requests')
    .select(
      'id, user_id, category, title, description, reason, image_url, status, admin_reply, admin_replied_at, created_at',
    )
    .order('created_at', { ascending: false })
  if (!params.isAdmin) q = q.eq('user_id', params.currentUserId)
  if (params.category === 'error' || params.category === 'feature') q = q.eq('category', params.category)
  const { data, error } = await q
  if (error) return { success: false, error: error.message }
  const rows = (data || []) as FeedbackListRow[]
  return { success: true, data: await attachNicknames(rows) }
}

export async function fetchFeedbackDetail(
  id: string,
  params: { isAdmin: boolean; currentUserId: string },
): Promise<{ success: boolean; data?: FeedbackDetailRow; error?: string }> {
  const sb = getSupabase()
  const { data, error } = await sb
    .from('feedback_requests')
    .select(
      'id, user_id, category, title, description, reason, image_url, status, admin_reply, admin_replied_at, created_at',
    )
    .eq('id', id)
    .maybeSingle()
  if (error) return { success: false, error: error.message }
  if (!data) return { success: false, error: 'not_found' }
  const row = data as FeedbackListRow
  if (!params.isAdmin && row.user_id !== params.currentUserId) {
    return { success: false, error: 'forbidden' }
  }
  const [withNick] = await attachNicknames([row])
  return {
    success: true,
    data: { ...withNick, is_own: row.user_id === params.currentUserId },
  }
}

export async function createFeedback(payload: {
  category: FeedbackCategory
  title: string
  description: string
  reason: string | null
  imageUrl: string | null
  userId: string
  nickname: string
}): Promise<{ success: boolean; data?: { id: string }; error?: string }> {
  const sb = getSupabase()
  const { data, error } = await sb
    .from('feedback_requests')
    .insert({
      user_id: payload.userId,
      category: payload.category,
      title: payload.title.trim(),
      description: payload.description.trim(),
      reason: payload.reason?.trim() || null,
      image_url: payload.imageUrl,
    })
    .select('id')
    .maybeSingle()
  if (error) return { success: false, error: error.message }
  try {
    const titleShort =
      payload.title.trim().length > 30 ? `${payload.title.trim().slice(0, 30)}…` : payload.title.trim()
    const { data: notif } = await sb
      .from('notifications')
      .insert({
        type: 'notice',
        source: '건의·신고',
        count: 1,
        message: `${payload.nickname || '회원'}님이 새로운 글을 작성했습니다: ${titleShort}`,
      })
      .select('id')
      .maybeSingle()
    const nid = notif && (notif as { id?: number }).id
    if (nid != null) {
      const { data: admins } = await sb.from('profiles').select('id').eq('role', 'admin')
      const states = (admins || []).map((a) => ({
        user_id: (a as { id: string }).id,
        notification_id: nid,
        read: false,
        deleted: false,
      }))
      if (states.length) await sb.from('notification_user_state').insert(states)
    }
  } catch {
    /* ignore */
  }
  return { success: true, data: data as { id: string } }
}

export async function updateFeedback(
  id: string,
  payload: {
    category: FeedbackCategory
    title: string
    description: string
    reason: string | null
    imageUrl: string | null | undefined
    userId: string
  },
): Promise<{ success: boolean; error?: string }> {
  const sb = getSupabase()
  const { data: existing } = await sb.from('feedback_requests').select('user_id').eq('id', id).maybeSingle()
  if (!existing || (existing as { user_id: string }).user_id !== payload.userId) {
    return { success: false, error: 'forbidden' }
  }
  const updates: Record<string, unknown> = {
    category: payload.category,
    title: payload.title.trim(),
    description: payload.description.trim(),
    reason: payload.reason?.trim() || null,
    updated_at: new Date().toISOString(),
  }
  if (payload.imageUrl !== undefined) updates.image_url = payload.imageUrl
  const { error } = await sb.from('feedback_requests').update(updates).eq('id', id).eq('user_id', payload.userId)
  if (error) return { success: false, error: error.message }
  return { success: true }
}

export async function deleteFeedback(
  id: string,
  userId: string,
): Promise<{ success: boolean; error?: string }> {
  const sb = getSupabase()
  const { error } = await sb.from('feedback_requests').delete().eq('id', id).eq('user_id', userId)
  if (error) return { success: false, error: error.message }
  return { success: true }
}

export async function submitFeedbackAdminReply(
  id: string,
  adminReply: string,
): Promise<{ success: boolean; data?: { admin_replied_at: string | null }; error?: string }> {
  const sb = getSupabase()
  const now = new Date().toISOString()
  const reply = adminReply.trim()
  const { error } = await sb
    .from('feedback_requests')
    .update({
      admin_reply: reply || null,
      admin_replied_at: reply ? now : null,
      updated_at: now,
    })
    .eq('id', id)
  if (error) return { success: false, error: error.message }
  return { success: true, data: { admin_replied_at: reply ? now : null } }
}
