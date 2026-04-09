import { getSupabase } from './supabaseClient'
import type { TeamSettingRow } from './sidebarSupabaseService'

export async function fetchAdminTeamSettingsRows(): Promise<
  { success: true; rows: TeamSettingRow[] } | { success: false; error: string }
> {
  const sb = getSupabase()
  const { data, error } = await sb
    .from('site_team_settings')
    .select('year, team_name, team_desc, goal_prize, image_path, achieved_amount, closed, updated_at')
    .order('year', { ascending: false })
  if (error) return { success: false, error: error.message }
  return { success: true, rows: (data || []) as TeamSettingRow[] }
}
