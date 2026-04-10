import { PRIZE_SETTLEMENT_STATUSES } from '../features/participation/prizeSettlement'
import { getSupabase } from './supabaseClient'

const CONTEST_BUCKET = 'contest'
const ALLOWED_DOC_EXT = new Set(['pdf', 'doc', 'docx', 'hwp', 'ppt', 'pptx', 'xls', 'xlsx', 'zip', 'txt'])

function safeAscii(s: string) {
  return [...String(s)].filter((c) => /[a-zA-Z0-9._-]/.test(c)).join('') || 'x'
}

/** 마이페이지 주인(`profileUserId`)의 참가 상세 1건. 타인 프로필 조회 시에도 동일. */
export async function fetchParticipationDetailRow(profileUserId: string, source: string, contestId: string) {
  const sb = getSupabase()
  const {
    data: { session },
  } = await sb.auth.getSession()
  if (!session?.user) return null
  const { data } = await sb
    .from('contest_participation_detail')
    .select('*')
    .eq('user_id', profileUserId)
    .eq('source', source)
    .eq('contest_id', contestId)
    .maybeSingle()
  return data
}

export async function deleteParticipationDetailRow(
  source: string,
  contestId: string,
): Promise<{ success: boolean; error?: string }> {
  const sb = getSupabase()
  const {
    data: { session },
  } = await sb.auth.getSession()
  if (!session?.user) return { success: false, error: '로그인이 필요합니다.' }
  const { error } = await sb
    .from('contest_participation_detail')
    .delete()
    .eq('user_id', session.user.id)
    .eq('source', source)
    .eq('contest_id', contestId)
  if (error) return { success: false, error: error.message }
  return { success: true }
}

export async function upsertParticipationDetailRow(opts: {
  source: string
  contest_id: string
  participation_status: string
  award_status?: string | null
  has_prize: boolean
  prize_amount?: number | null
  prize_settlement_status?: string | null
  submitted_at?: string | null
  result_announcement_date?: string | null
  result_announcement_method?: string | null
  document_path?: string | null
  document_filename?: string | null
  documentFile?: File | null
}): Promise<{ success: boolean; error?: string }> {
  const validStatuses = ['지원완료', '심사중', '본선진출', '수상', '미수상', '취소'] as const
  if (!validStatuses.includes(opts.participation_status as (typeof validStatuses)[number])) {
    return { success: false, error: '참가 상태가 올바르지 않습니다.' }
  }
  if (opts.participation_status === '수상' && !opts.award_status?.trim()) {
    return { success: false, error: '수상 시 수상 등급을 선택해 주세요.' }
  }
  const sb = getSupabase()
  const {
    data: { session },
  } = await sb.auth.getSession()
  if (!session?.user) return { success: false, error: '로그인이 필요합니다.' }
  const uid = session.user.id
  let document_path = opts.document_path ?? null
  let document_filename = opts.document_filename ?? null

  if (opts.documentFile && opts.documentFile.name) {
    const orig = opts.documentFile.name
    const ext = (orig.includes('.') ? orig.split('.').pop() : '')?.toLowerCase() || 'pdf'
    const safeExt = ALLOWED_DOC_EXT.has(ext) ? ext : 'pdf'
    const safe_key = `doc_${safeAscii(opts.source)}_${safeAscii(opts.contest_id)}_${Date.now()}.${safeExt}`
    const path = `private/${uid}/${safe_key}`
    const buf = await opts.documentFile.arrayBuffer()
    const { error: upErr } = await sb.storage.from(CONTEST_BUCKET).upload(path, buf, {
      upsert: true,
      contentType: opts.documentFile.type || 'application/octet-stream',
    })
    if (upErr) return { success: false, error: upErr.message }
    const { data: pub } = sb.storage.from(CONTEST_BUCKET).getPublicUrl(path)
    document_path = pub?.publicUrl || path
    document_filename = orig
  }

  if (!document_path || !document_filename) {
    return { success: false, error: '제출물을 등록해 주세요.' }
  }

  const payload = {
    user_id: uid,
    source: opts.source,
    contest_id: opts.contest_id,
    participation_status: opts.participation_status,
    award_status: opts.award_status?.trim() || null,
    has_prize: opts.has_prize,
    prize_amount: opts.prize_amount ?? null,
    prize_settlement_status: opts.has_prize
      ? (() => {
          const s = opts.prize_settlement_status?.trim() || '미수령'
          return (PRIZE_SETTLEMENT_STATUSES as readonly string[]).includes(s) ? s : '미수령'
        })()
      : null,
    submitted_at: opts.submitted_at || null,
    result_announcement_date: opts.result_announcement_date || null,
    result_announcement_method: opts.result_announcement_method?.trim() || null,
    document_path,
    document_filename,
  }
  const { error } = await sb.from('contest_participation_detail').upsert(payload, {
    onConflict: 'user_id,source,contest_id',
  })
  if (error) return { success: false, error: error.message }
  return { success: true }
}
