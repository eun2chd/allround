import { getTierFromLevel, resolveLevelProgress, type LevelConfigRow } from './levelUtils'
import { getSupabase } from './supabaseClient'

const PROFILE_BUCKET = 'profile'
const REP_BUCKET = 'rep'

async function loadLevelRows(sb: ReturnType<typeof getSupabase>): Promise<LevelConfigRow[]> {
  const { data } = await sb.from('level_config').select('level, exp_to_next').order('level')
  return (data || []) as LevelConfigRow[]
}

async function broadcastStatusMessageNotification(sb: ReturnType<typeof getSupabase>, nickname: string) {
  const {
    data: { session },
  } = await sb.auth.getSession()
  const uid = session?.user?.id
  if (!uid) return
  const nick = nickname.trim() || '회원'
  try {
    const { data: notif } = await sb
      .from('notifications')
      .insert({
        type: 'status',
        source: '상태메시지',
        count: 1,
        message: `${nick}님이 상태 메시지를 변경했습니다`,
      })
      .select('id')
      .maybeSingle()
    const nid = notif && (notif as { id?: number | string }).id
    if (nid == null) return
    const { data: members } = await sb.from('profiles').select('id').eq('role', 'member')
    const states = (members || [])
      .map((row) => String((row as { id: string }).id || ''))
      .filter((id) => id && id !== uid)
      .map((user_id) => ({
        user_id,
        notification_id: nid,
        read: false,
        deleted: false,
      }))
    if (states.length) await sb.from('notification_user_state').insert(states)
  } catch {
    /* 알림 실패는 상태 저장 성공에 영향 없음 */
  }
}

export async function updateStatusMessage(
  statusMessage: string,
): Promise<{ success: boolean; error?: string; status_message?: string }> {
  const sb = getSupabase()
  const {
    data: { session },
  } = await sb.auth.getSession()
  if (!session?.user) return { success: false, error: 'unauthorized' }
  const trimmed = statusMessage.trim().slice(0, 80)
  const { data, error } = await sb
    .from('profiles')
    .update({ status_message: trimmed || null })
    .eq('id', session.user.id)
    .select('nickname')
  if (error) return { success: false, error: error.message }
  if (!data?.length) return { success: false, error: 'profile not found' }
  const nickname = String((data[0] as { nickname?: string }).nickname || '')
  void broadcastStatusMessageNotification(sb, nickname)
  return { success: true, status_message: trimmed }
}

const ALLOWED_EXT = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp'])

export async function uploadProfileAvatar(file: File): Promise<{ success: boolean; profile_url?: string; error?: string }> {
  const sb = getSupabase()
  const {
    data: { session },
  } = await sb.auth.getSession()
  if (!session?.user) return { success: false, error: 'unauthorized' }
  const name = file.name || ''
  const ext = (name.includes('.') ? name.split('.').pop() : '')?.toLowerCase() || ''
  if (!ALLOWED_EXT.has(ext)) return { success: false, error: 'invalid type' }
  const uid = session.user.id
  const path = `private/${uid}/avatar.${ext}`
  const buf = await file.arrayBuffer()
  const { error: upErr } = await sb.storage.from(PROFILE_BUCKET).upload(path, buf, {
    upsert: true,
    contentType: file.type || `image/${ext === 'jpg' ? 'jpeg' : ext}`,
  })
  if (upErr) return { success: false, error: upErr.message }
  const { data: pub } = sb.storage.from(PROFILE_BUCKET).getPublicUrl(path)
  const profile_url = pub?.publicUrl || ''
  if (!profile_url) return { success: false, error: 'url failed' }
  const { error: dbErr } = await sb.from('profiles').update({ profile_url }).eq('id', uid)
  if (dbErr) return { success: false, error: dbErr.message }
  return { success: true, profile_url }
}

export async function deleteRepresentativeWork(source: string, contestId: string): Promise<{ success: boolean; error?: string }> {
  const sb = getSupabase()
  const {
    data: { session },
  } = await sb.auth.getSession()
  if (!session?.user) return { success: false, error: 'unauthorized' }
  const { error } = await sb
    .from('user_representative_works')
    .delete()
    .eq('user_id', session.user.id)
    .eq('source', source)
    .eq('contest_id', contestId)
  if (error) return { success: false, error: error.message }
  return { success: true }
}

export async function saveUserHashtags(
  hashtagIds: string[],
): Promise<{ success: true } | { success: false; error: string }> {
  const sb = getSupabase()
  const {
    data: { session },
  } = await sb.auth.getSession()
  if (!session?.user) return { success: false, error: '로그인이 필요합니다.' }
  const uid = session.user.id
  const rows = await loadLevelRows(sb)
  const { data: prof } = await sb.from('profiles').select('total_exp').eq('id', uid).maybeSingle()
  const totalExp = Number(prof?.total_exp ?? 0)
  const { level } = resolveLevelProgress(totalExp, rows)
  if (level < 71) {
    return { success: false, error: '골드 등급(Lv.71) 이상부터 해시태그를 추가할 수 있습니다.' }
  }
  const { tierLevel } = getTierFromLevel(level)
  const limit = tierLevel === 2 ? 5 : tierLevel === 3 ? 10 : tierLevel === 4 ? 15 : 0
  if (hashtagIds.length > limit) {
    return { success: false, error: `해시태그는 ${limit}개까지 선택할 수 있습니다.` }
  }
  const nums = hashtagIds.map((id) => Number(id)).filter((n) => Number.isFinite(n))
  if (nums.length !== hashtagIds.length) {
    return { success: false, error: '잘못된 해시태그입니다.' }
  }
  const { data: existing } = await sb.from('user_hashtags').select('hashtag_id').eq('user_id', uid)
  const existingNums = new Set((existing || []).map((r) => Number(r.hashtag_id)))
  const target = new Set(nums)
  for (const hid of existingNums) {
    if (!target.has(hid)) {
      const { error } = await sb.from('user_hashtags').delete().eq('user_id', uid).eq('hashtag_id', hid)
      if (error) return { success: false, error: error.message }
    }
  }
  for (const hid of target) {
    if (!existingNums.has(hid)) {
      const { error } = await sb.from('user_hashtags').insert({ user_id: uid, hashtag_id: hid })
      if (error) return { success: false, error: error.message }
    }
  }
  return { success: true }
}

export type RepWorkEligibleRow = { source: string; contest_id: string; title: string }

export async function fetchRepWorkEligibleParticipations(): Promise<RepWorkEligibleRow[]> {
  const sb = getSupabase()
  const {
    data: { session },
  } = await sb.auth.getSession()
  if (!session?.user) return []
  const uid = session.user.id
  const { data: parts } = await sb
    .from('contest_participation')
    .select('source, contest_id')
    .eq('user_id', uid)
    .eq('status', 'participate')
  const { data: reps } = await sb.from('user_representative_works').select('source, contest_id').eq('user_id', uid)
  const repKeys = new Set((reps || []).map((r) => `${String(r.source)}:${String(r.contest_id)}`))
  const out: RepWorkEligibleRow[] = []
  for (const p of parts || []) {
    const src = String(p.source || '')
    const cid = String(p.contest_id || '')
    if (!src || !cid) continue
    if (repKeys.has(`${src}:${cid}`)) continue
    const { data: c } = await sb.from('contests').select('title').eq('source', src).eq('id', cid).maybeSingle()
    out.push({ source: src, contest_id: cid, title: String(c?.title || '(제목 없음)') })
  }
  return out
}

export async function addRepresentativeWork(opts: {
  source: string
  contestId: string
  awardStatus?: string
  resultAnnouncementMethod?: string
  file?: File | null
}): Promise<{ success: true } | { success: false; error: string }> {
  const sb = getSupabase()
  const {
    data: { session },
  } = await sb.auth.getSession()
  if (!session?.user) return { success: false, error: '로그인이 필요합니다.' }
  const uid = session.user.id
  const source = opts.source.trim()
  const contestId = opts.contestId.trim()
  if (!source || !contestId) return { success: false, error: 'source, contest_id가 필요합니다.' }
  const { data: part } = await sb
    .from('contest_participation')
    .select('user_id')
    .eq('user_id', uid)
    .eq('source', source)
    .eq('contest_id', contestId)
    .maybeSingle()
  if (!part) return { success: false, error: '참가한 공모전만 대표작으로 추가할 수 있습니다.' }
  const { data: existing } = await sb
    .from('user_representative_works')
    .select('sort_order')
    .eq('user_id', uid)
    .order('sort_order')
  if ((existing || []).length >= 3) return { success: false, error: '대표작품은 최대 3개까지 등록할 수 있습니다.' }
  const { data: dup } = await sb
    .from('user_representative_works')
    .select('user_id')
    .eq('user_id', uid)
    .eq('source', source)
    .eq('contest_id', contestId)
    .maybeSingle()
  if (dup) return { success: false, error: '이미 대표작품에 등록되어 있습니다.' }
  const used = new Set((existing || []).map((r) => Number(r.sort_order || 0)))
  let sortOrder = 1
  for (let i = 1; i <= 3; i++) {
    if (!used.has(i)) {
      sortOrder = i
      break
    }
  }
  let award = opts.awardStatus?.trim() || null
  if (award && !['대상', '최우수상', '우수상'].includes(award)) award = null
  const resultMethod = opts.resultAnnouncementMethod?.trim() || null
  let imagePath: string | null = null
  if (opts.file && opts.file.size > 0) {
    const up = await uploadRepImage(sb, uid, source, contestId, opts.file)
    if (!up.success) return up
    imagePath = up.url
  }
  const { error } = await sb.from('user_representative_works').insert({
    user_id: uid,
    source,
    contest_id: contestId,
    sort_order: sortOrder,
    award_status: award,
    result_announcement_method: resultMethod,
    image_path: imagePath,
  })
  if (error) return { success: false, error: error.message }
  return { success: true }
}

async function uploadRepImage(
  sb: ReturnType<typeof getSupabase>,
  uid: string,
  _source: string,
  contestId: string,
  file: File,
): Promise<{ success: true; url: string } | { success: false; error: string }> {
  const name = file.name || ''
  const ext = (name.includes('.') ? name.split('.').pop() : '')?.toLowerCase() || 'png'
  const safeExt = ALLOWED_EXT.has(ext) ? ext : 'png'
  const path = `private/${uid}/____${contestId}.${safeExt}`
  const buf = await file.arrayBuffer()
  const { error: upErr } = await sb.storage.from(REP_BUCKET).upload(path, buf, {
    upsert: true,
    contentType: file.type || `image/${safeExt === 'jpg' ? 'jpeg' : safeExt}`,
  })
  if (upErr) return { success: false, error: upErr.message }
  const { data: pub } = sb.storage.from(REP_BUCKET).getPublicUrl(path)
  const url = pub?.publicUrl || ''
  if (!url) return { success: false, error: 'storage url failed' }
  return { success: true, url }
}

export async function updateRepresentativeWork(opts: {
  source: string
  contestId: string
  awardStatus?: string
  resultAnnouncementMethod?: string
  file?: File | null
}): Promise<{ success: true } | { success: false; error: string }> {
  const sb = getSupabase()
  const {
    data: { session },
  } = await sb.auth.getSession()
  if (!session?.user) return { success: false, error: '로그인이 필요합니다.' }
  const uid = session.user.id
  const source = opts.source.trim()
  const contestId = opts.contestId.trim()
  const { data: row } = await sb
    .from('user_representative_works')
    .select('user_id')
    .eq('user_id', uid)
    .eq('source', source)
    .eq('contest_id', contestId)
    .maybeSingle()
  if (!row) return { success: false, error: '대표작을 찾을 수 없습니다.' }
  let award = opts.awardStatus !== undefined ? opts.awardStatus.trim() || null : undefined
  if (award != null && award !== '' && !['대상', '최우수상', '우수상'].includes(award)) award = null
  const resultMethod =
    opts.resultAnnouncementMethod !== undefined ? opts.resultAnnouncementMethod.trim() || null : undefined
  const updates: Record<string, unknown> = {}
  if (award !== undefined) updates.award_status = award
  if (resultMethod !== undefined) updates.result_announcement_method = resultMethod
  if (opts.file && opts.file.size > 0) {
    const up = await uploadRepImage(sb, uid, source, contestId, opts.file)
    if (!up.success) return up
    updates.image_path = up.url
  }
  if (!Object.keys(updates).length) return { success: true }
  const { error } = await sb
    .from('user_representative_works')
    .update(updates)
    .eq('user_id', uid)
    .eq('source', source)
    .eq('contest_id', contestId)
  if (error) return { success: false, error: error.message }
  return { success: true }
}

export async function reorderRepresentativeWorks(
  orderedItems: { source: string; contest_id: string }[],
): Promise<{ success: true } | { success: false; error: string }> {
  const sb = getSupabase()
  const {
    data: { session },
  } = await sb.auth.getSession()
  if (!session?.user) return { success: false, error: '로그인이 필요합니다.' }
  const uid = session.user.id
  for (let i = 0; i < orderedItems.length; i++) {
    const { source, contest_id } = orderedItems[i]
    const { error } = await sb
      .from('user_representative_works')
      .update({ sort_order: i + 1 })
      .eq('user_id', uid)
      .eq('source', source)
      .eq('contest_id', contest_id)
    if (error) return { success: false, error: error.message }
  }
  return { success: true }
}
