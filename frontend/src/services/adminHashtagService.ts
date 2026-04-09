import { getSupabase } from './supabaseClient'

export type HashtagMasterRow = {
  id: number
  tag_name: string
  category: string
  sort_order: number
}

function mapRow(r: Record<string, unknown>): HashtagMasterRow {
  return {
    id: Number(r.id),
    tag_name: String(r.tag_name ?? ''),
    category: String(r.category ?? ''),
    sort_order: Math.trunc(Number(r.sort_order ?? 0)),
  }
}

export async function fetchHashtagMasterForAdmin(): Promise<
  { ok: true; rows: HashtagMasterRow[] } | { ok: false; error: string }
> {
  const sb = getSupabase()
  const { data, error } = await sb
    .from('hashtag_master')
    .select('id, tag_name, category, sort_order')
    .order('sort_order', { ascending: true })
    .order('id', { ascending: true })
  if (error) return { ok: false, error: error.message || '해시태그 목록을 불러오지 못했습니다.' }
  return { ok: true, rows: (data || []).map((x) => mapRow(x as Record<string, unknown>)) }
}

export async function insertHashtagMaster(payload: {
  tag_name: string
  category: string
  sort_order: number
}): Promise<{ ok: true; row: HashtagMasterRow } | { ok: false; error: string }> {
  const tag_name = payload.tag_name.trim()
  const category = payload.category.trim()
  if (!tag_name) return { ok: false, error: '태그 이름을 입력하세요.' }
  if (!category) return { ok: false, error: '카테고리를 입력하세요.' }
  const sort_order = Math.trunc(Number(payload.sort_order))
  if (!Number.isFinite(sort_order)) return { ok: false, error: '정렬 순서는 숫자여야 합니다.' }
  const sb = getSupabase()
  const { data, error } = await sb
    .from('hashtag_master')
    .insert({ tag_name, category, sort_order })
    .select('id, tag_name, category, sort_order')
    .maybeSingle()
  if (error) {
    if (error.code === '23505' || String(error.message).includes('duplicate')) {
      return { ok: false, error: '이미 같은 이름의 태그가 있습니다.' }
    }
    return { ok: false, error: error.message || '등록에 실패했습니다.' }
  }
  if (!data) return { ok: false, error: '등록 후 데이터를 받지 못했습니다.' }
  return { ok: true, row: mapRow(data as Record<string, unknown>) }
}

export async function updateHashtagMaster(
  id: number,
  payload: { tag_name: string; category: string; sort_order: number },
): Promise<{ ok: true; row: HashtagMasterRow } | { ok: false; error: string }> {
  const tag_name = payload.tag_name.trim()
  const category = payload.category.trim()
  if (!tag_name) return { ok: false, error: '태그 이름을 입력하세요.' }
  if (!category) return { ok: false, error: '카테고리를 입력하세요.' }
  const sort_order = Math.trunc(Number(payload.sort_order))
  if (!Number.isFinite(sort_order)) return { ok: false, error: '정렬 순서는 숫자여야 합니다.' }
  const sb = getSupabase()
  const { data, error } = await sb
    .from('hashtag_master')
    .update({ tag_name, category, sort_order })
    .eq('id', id)
    .select('id, tag_name, category, sort_order')
    .maybeSingle()
  if (error) {
    if (error.code === '23505' || String(error.message).includes('duplicate')) {
      return { ok: false, error: '이미 같은 이름의 태그가 있습니다.' }
    }
    return { ok: false, error: error.message || '수정에 실패했습니다.' }
  }
  if (!data) return { ok: false, error: '해당 태그를 찾을 수 없습니다.' }
  return { ok: true, row: mapRow(data as Record<string, unknown>) }
}

export async function deleteHashtagMaster(id: number): Promise<{ ok: true } | { ok: false; error: string }> {
  const sb = getSupabase()
  const { error } = await sb.from('hashtag_master').delete().eq('id', id)
  if (error) return { ok: false, error: error.message || '삭제에 실패했습니다.' }
  return { ok: true }
}
