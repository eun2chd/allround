import { PARTICIPATION_FILE_EXT_SET } from '../features/participation/participationFileUpload'
import { PARTICIPATION_LIFECYCLE_STATUSES } from '../features/participation/participationLifecycle'
import { PRIZE_SETTLEMENT_STATUSES } from '../features/participation/prizeSettlement'
import { getSupabase } from './supabaseClient'
import type { SupabaseClient } from '@supabase/supabase-js'

const CONTEST_BUCKET = 'contest'
const ALLOWED_UPLOAD_EXT = PARTICIPATION_FILE_EXT_SET

function safeAscii(s: string) {
  return [...String(s)].filter((c) => /[a-zA-Z0-9._-]/.test(c)).join('') || 'x'
}

/** 텍스트 파일인 경우 한글 깨짐 방지를 위해 UTF-8로 변환 */
async function prepareFileForUpload(file: File): Promise<{ blob: Blob; contentType: string }> {
  const name = file.name.toLowerCase()
  const ext = name.split('.').pop() || ''

  const mimeMap: Record<string, string> = {
    pdf: 'application/pdf',
    txt: 'text/plain; charset=utf-8',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    hwp: 'application/x-hwp',
    hwpx: 'application/hwp+zip',
    ppt: 'application/vnd.ms-powerpoint',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    zip: 'application/zip',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
  }

  const contentType = mimeMap[ext] || file.type || 'application/octet-stream'

  if (ext === 'txt') {
    const buffer = await file.arrayBuffer()
    try {
      const utf8Decoder = new TextDecoder('utf-8', { fatal: true })
      utf8Decoder.decode(buffer)
      return { blob: file, contentType }
    } catch {
      const cp949Decoder = new TextDecoder('cp949')
      const text = cp949Decoder.decode(buffer)
      return { blob: new Blob([text], { type: 'text/plain; charset=utf-8' }), contentType }
    }
  }

  return { blob: file, contentType }
}

async function uploadPrivateContestFile(
  sb: SupabaseClient,
  uid: string,
  source: string,
  contestId: string,
  filePrefix: string,
  file: File,
  allowedExt: Set<string>,
): Promise<{ path: string; filename: string } | { error: string }> {
  const orig = file.name
  const { blob, contentType } = await prepareFileForUpload(file)
  const ext = (orig.includes('.') ? orig.split('.').pop() : '')?.toLowerCase() || 'pdf'
  const safeExt = allowedExt.has(ext) ? ext : 'pdf'
  const safe_key = `${filePrefix}_${safeAscii(source)}_${safeAscii(contestId)}_${Date.now()}.${safeExt}`
  const storagePath = `private/${uid}/${safe_key}`
  const buf = await blob.arrayBuffer()
  const { error: upErr } = await sb.storage.from(CONTEST_BUCKET).upload(storagePath, buf, {
    upsert: true,
    contentType,
  })
  if (upErr) return { error: upErr.message }
  const { data: pub } = sb.storage.from(CONTEST_BUCKET).getPublicUrl(storagePath)
  return { path: pub?.publicUrl || storagePath, filename: orig }
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
  lifecycle_status?: string
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
  award_work_path?: string | null
  award_work_filename?: string | null
  awardWorkFile?: File | null
  clear_award_work?: boolean
}): Promise<{ success: boolean; error?: string }> {
  const validStatuses = ['미등록', '지원완료', '심사중', '본선진출', '수상', '미수상', '취소'] as const
  if (!validStatuses.includes(opts.participation_status as (typeof validStatuses)[number])) {
    return { success: false, error: '참가 상태가 올바르지 않습니다.' }
  }
  const lifecycle = opts.lifecycle_status?.trim() || '진행중'
  if (!(PARTICIPATION_LIFECYCLE_STATUSES as readonly string[]).includes(lifecycle)) {
    return { success: false, error: '진행 상태가 올바르지 않습니다.' }
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
  let award_work_path = opts.clear_award_work ? null : (opts.award_work_path ?? null)
  let award_work_filename = opts.clear_award_work ? null : (opts.award_work_filename ?? null)

  if (opts.documentFile && opts.documentFile.name) {
    const up = await uploadPrivateContestFile(
      sb,
      uid,
      opts.source,
      opts.contest_id,
      'doc',
      opts.documentFile,
      ALLOWED_UPLOAD_EXT,
    )
    if ('error' in up) return { success: false, error: up.error }
    document_path = up.path
    document_filename = up.filename
  }

  // 제출물은 선택 사항 — 없으면 null로 저장

  if (opts.awardWorkFile && opts.awardWorkFile.name) {
    const up = await uploadPrivateContestFile(
      sb,
      uid,
      opts.source,
      opts.contest_id,
      'award',
      opts.awardWorkFile,
      ALLOWED_UPLOAD_EXT,
    )
    if ('error' in up) return { success: false, error: up.error }
    award_work_path = up.path
    award_work_filename = up.filename
  }

  const payload = {
    user_id: uid,
    source: opts.source,
    contest_id: opts.contest_id,
    participation_status: opts.participation_status,
    lifecycle_status: lifecycle,
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
    award_work_path,
    award_work_filename,
  }
  const { error } = await sb.from('contest_participation_detail').upsert(payload, {
    onConflict: 'user_id,source,contest_id',
  })
  if (error) return { success: false, error: error.message }
  return { success: true }
}
