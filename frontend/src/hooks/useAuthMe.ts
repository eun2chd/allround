import { useCallback, useEffect, useState } from 'react'
import { getSupabase, isSupabaseConfigured } from '../services/supabaseClient'
import type { MeData } from '../services/profileService'
import { fetchMeFromSupabase } from '../services/profileService'

export type { MeData }

export function useAuthMe() {
  const [me, setMe] = useState<MeData | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    if (!isSupabaseConfigured()) {
      setMe(null)
      return
    }
    try {
      const m = await fetchMeFromSupabase()
      setMe(m)
    } catch {
      setMe(null)
    }
  }, [])

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setMe(null)
      setLoading(false)
      return
    }
    const sb = getSupabase()
    let ok = true
    ;(async () => {
      setLoading(true)
      try {
        const m = await fetchMeFromSupabase()
        if (ok) setMe(m)
      } finally {
        if (ok) setLoading(false)
      }
    })()
    const {
      data: { subscription },
    } = sb.auth.onAuthStateChange(() => {
      void refresh()
    })
    return () => {
      ok = false
      subscription.unsubscribe()
    }
  }, [refresh])

  return { me, loading, refresh }
}
