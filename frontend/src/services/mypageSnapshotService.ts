import type { MypageSnapshotData } from '../types/mypage'
import { getSupabase } from './supabaseClient'
import {
  HEADLINE_BY_TIER,
  getTierFromLevel,
  resolveLevelProgress,
  type LevelConfigRow,
} from './levelUtils'

function maskEmail(email: string): string {
  if (!email || !email.includes('@')) return ''
  const at = email.lastIndexOf('@')
  const local = email.slice(0, at)
  return `${local}@***`
}

async function loadLevelRows(sb: ReturnType<typeof getSupabase>): Promise<LevelConfigRow[]> {
  const { data } = await sb.from('level_config').select('level, exp_to_next').order('level')
  return (data || []) as LevelConfigRow[]
}

async function loadTierExpMilestones(sb: ReturnType<typeof getSupabase>) {
  const milestones = [
    { tier: 'BRONZE', level: 1, exp: 0, level_range: 'Lv.1 ~ Lv.20' },
    { tier: 'SILVER', level: 21, exp: 0, level_range: 'Lv.21 ~ Lv.70' },
    { tier: 'GOLD', level: 71, exp: 0, level_range: 'Lv.71 ~ Lv.120' },
    { tier: 'PLATINUM', level: 121, exp: 0, level_range: 'Lv.121 ~ Lv.140' },
    { tier: 'LEGEND', level: 141, exp: 0, level_range: 'Lv.141 ~ Lv.200' },
  ]
  try {
    const { data: rows } = await sb.from('level_config').select('level, exp_to_next').order('level')
    const r = rows || []
    let cumulative = 0
    const expByLevel: Record<number, number> = {}
    for (const row of r) {
      const lv = Number(row.level ?? 0)
      const expTo = Number(row.exp_to_next ?? 0)
      expByLevel[lv] = cumulative
      cumulative += expTo
    }
    for (const m of milestones) {
      m.exp = expByLevel[m.level] ?? m.exp
    }
  } catch {
    /* ignore */
  }
  return milestones
}

/** Flask `_mypage_page_data` 와 동일한 스냅샷 (RLS: 본인/공개 정책에 따름) */
export async function fetchMypageSnapshot(userId: string, viewerId: string): Promise<MypageSnapshotData | null> {
  if (!userId) return null
  const sb = getSupabase()
  const { data: profRow, error } = await sb
    .from('profiles')
    .select('id, nickname, profile_url, role, email, status_message, level, total_exp')
    .eq('id', userId)
    .maybeSingle()
  if (error || !profRow) return null

  const profile = { ...profRow } as Record<string, unknown>
  profile.id = String(profile.id ?? '')
  if (profile.email) profile.email = maskEmail(String(profile.email))

  const isOwn = String(profile.id) === String(viewerId || '')
  const role = String(profile.role || 'member')
  const roleLabel = role === 'admin' ? '\uad00\ub9ac\uc790' : '\ud300\uc6d0'

  const levelRows = await loadLevelRows(sb)
  const totalExp = Number(profile.total_exp || 0)
  const { level, expCurrent, expNext, expPercent } = resolveLevelProgress(totalExp, levelRows)
  const tierInfo = getTierFromLevel(level)
  const tierName = tierInfo.tierName
  const tierLevel = tierInfo.tierLevel
  const tierSprite = tierInfo.tierId
  const autoHeadlines = HEADLINE_BY_TIER[tierLevel] ?? HEADLINE_BY_TIER[0]

  const hashtagCategoryOrder = [
    '\uae30\uc220\u00b7\uac1c\ubc1c\ub825 \uc911\uc2ec',
    '\ubb38\uc81c\ud574\uacb0\ub825',
    '\ub370\uc774\ud130 \ud2b9\ud654',
    '\ucc3d\uc758\uc131',
    '\ubc94',
  ]

  let userHashtags: { id: string; tag_name: string; category?: string }[] = []
  let hashtagMasterByCategory: Record<string, { id: string; tag_name: string }[]> = {}
  try {
    const { data: uh } = await sb.from('user_hashtags').select('hashtag_id').eq('user_id', userId)
    const tagIds = (uh || []).map((r) => r.hashtag_id).filter(Boolean) as string[]
    if (tagIds.length) {
      const { data: hm } = await sb.from('hashtag_master').select('id, tag_name, category').in('id', tagIds).order('sort_order')
      userHashtags = (hm || []).map((row) => ({
        id: String(row.id),
        tag_name: String(row.tag_name),
        category: String(row.category || ''),
      }))
    }
    const { data: allHm } = await sb.from('hashtag_master').select('id, tag_name, category, sort_order').order('sort_order')
    hashtagMasterByCategory = {}
    for (const row of allHm || []) {
      const cat = String(row.category || '\uae30\ud0c0')
      if (!hashtagMasterByCategory[cat]) hashtagMasterByCategory[cat] = []
      hashtagMasterByCategory[cat].push({ id: String(row.id), tag_name: String(row.tag_name) })
    }
  } catch {
    /* ignore */
  }

  const hashtagMaxLimit = tierLevel === 2 ? 5 : tierLevel === 3 ? 10 : tierLevel === 4 ? 15 : 0

  const representativeWorks: MypageSnapshotData['representative_works'] = []
  try {
    const { data: rw } = await sb
      .from('user_representative_works')
      .select('source, contest_id, sort_order, award_status, result_announcement_method, image_path')
      .eq('user_id', userId)
      .order('sort_order')
    const rowsData = rw || []
    const uniqueKeys = [...new Set(rowsData.map((row) => [String(row.source), String(row.contest_id)] as const))].filter(
      ([s, c]) => s && c,
    )
    const contestByKey: Record<string, { title?: string; url?: string }> = {}
    for (const [src, cid] of uniqueKeys) {
      const { data: c } = await sb.from('contests').select('title, url').eq('source', src).eq('id', cid).limit(1).maybeSingle()
      if (c) contestByKey[`${src}:${cid}`] = c
    }
    for (const row of rowsData) {
      const src = String(row.source || '')
      const cid = String(row.contest_id || '')
      const contest = contestByKey[`${src}:${cid}`] || {}
      representativeWorks.push({
        source: src,
        contest_id: cid,
        sort_order: Number(row.sort_order || 1),
        award_status: String(row.award_status || ''),
        result_announcement_method: String(row.result_announcement_method || ''),
        image_path: String(row.image_path || ''),
        title: String(contest.title || '(\uc81c\ubaa9 \uc5c6\uc74c)'),
        url: String(contest.url || '#'),
      })
    }
  } catch {
    /* ignore */
  }

  let participateCount = 0
  try {
    const { data: pc } = await sb
      .from('contest_participation')
      .select('user_id')
      .eq('user_id', userId)
      .eq('status', 'participate')
    participateCount = (pc || []).length
  } catch {
    /* ignore */
  }

  const awardsByStatus: Record<string, number> = { '\ub300\uc0c1': 0, '\ucd5c\uc6b0\uc218\uc0c1': 0, '\uc6b0\uc218\uc0c1': 0 }
  try {
    const { data: rwAll } = await sb.from('user_representative_works').select('award_status').eq('user_id', userId)
    for (const row of rwAll || []) {
      const s = String(row.award_status || '').trim()
      if (s in awardsByStatus) awardsByStatus[s] += 1
    }
  } catch {
    /* ignore */
  }

  let prizeTotal = 0
  try {
    const { data: pd } = await sb.from('contest_participation_detail').select('prize_amount, has_prize').eq('user_id', userId)
    for (const row of pd || []) {
      if (row.has_prize && row.prize_amount != null) {
        const v = Number(row.prize_amount)
        if (!Number.isNaN(v)) prizeTotal += v
      }
    }
  } catch {
    /* ignore */
  }
  const prizeTotalStr =
    prizeTotal === Math.floor(prizeTotal) ? `${Math.floor(prizeTotal).toLocaleString()}` : `${prizeTotal.toFixed(0)}`

  const tierExpMilestones = await loadTierExpMilestones(sb)

  return {
    profile: profile as MypageSnapshotData['profile'],
    role_label: roleLabel,
    is_own_profile: isOwn,
    level,
    total_exp: totalExp,
    exp_percent: Math.min(100, expPercent),
    exp_current: expCurrent,
    exp_next: expNext,
    user_hashtags: userHashtags,
    selected_hashtag_ids: userHashtags.map((h) => h.id),
    hashtag_master_by_category: hashtagMasterByCategory,
    hashtag_category_order: hashtagCategoryOrder,
    hashtag_max_limit: hashtagMaxLimit,
    representative_works: representativeWorks,
    tier_level: tierLevel,
    tier_name: tierName,
    tier_sprite: tierSprite,
    auto_headlines: autoHeadlines,
    participate_count: participateCount,
    awards_by_status: awardsByStatus,
    awards_total: Object.values(awardsByStatus).reduce((a, b) => a + b, 0),
    prize_total: prizeTotalStr,
    tier_exp_milestones: tierExpMilestones,
  }
}
