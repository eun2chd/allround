import { getSupabase } from './supabaseClient'

function nowIso(): string {
  return new Date().toISOString()
}

export async function upsertPresenceOnline(userId: string): Promise<void> {
  const sb = getSupabase()
  await sb.from('presence').upsert(
    {
      user_id: userId,
      last_seen: nowIso(),
      online: true,
    },
    { onConflict: 'user_id' },
  )
}

export async function upsertPresenceOffline(userId: string): Promise<void> {
  const sb = getSupabase()
  await sb.from('presence').upsert(
    {
      user_id: userId,
      last_seen: nowIso(),
      online: false,
    },
    { onConflict: 'user_id' },
  )
}
