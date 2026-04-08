/** `/api/mypage/:id/snapshot` → data */
export type MypageSnapshotData = {
  profile: {
    id?: string
    nickname?: string
    profile_url?: string
    role?: string
    email?: string
    status_message?: string
    level?: number
    total_exp?: number /** @deprecated computed */
  }
  role_label: string
  is_own_profile: boolean
  level: number
  total_exp: number
  exp_percent: number
  exp_current: number
  exp_next: number
  user_hashtags: { id: string; tag_name: string; category?: string }[]
  selected_hashtag_ids: string[]
  hashtag_master_by_category: Record<string, { id: string; tag_name: string }[]>
  hashtag_category_order: string[]
  hashtag_max_limit: number
  representative_works: {
    source: string
    contest_id: string
    sort_order: number
    award_status: string
    result_announcement_method: string
    image_path: string
    title: string
    url: string
  }[]
  tier_level: number
  tier_name: string
  tier_sprite: number
  auto_headlines: string[]
  participate_count: number
  awards_by_status: Record<string, number>
  awards_total: number
  prize_total: string
  tier_exp_milestones: { tier: string; level: number; exp: number; level_range: string }[]
}
