import { useCallback, useEffect, useState } from 'react'
import { ContestAllyoungSection } from '../components/home/ContestAllyoungSection'
import { StartupHubSection } from '../components/home/StartupHubSection'
import { useMainLayoutOutletContext } from '../components/layout/mainLayoutContext'
import { appToast } from '../lib/appToast'
import { getSupabase } from '../services/supabaseClient'

export function HomePage() {
  const ctx = useMainLayoutOutletContext()
  const me = ctx?.me
  const hubTab = ctx?.hubTab ?? 'allyoung'
  const [overlay, setOverlay] = useState(false)

  const showToast = useCallback((msg: string, type: 'success' | 'error' = 'success') => {
    appToast(msg, type)
  }, [])

  const loadingOverlay = useCallback((active: boolean) => {
    setOverlay(active)
  }, [])

  useEffect(() => {
    if (!me) return
    const sb = getSupabase()
    let t: ReturnType<typeof setTimeout> | undefined
    const sub = sb
      .channel('contests-react')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'contests' }, () => {
        if (t) clearTimeout(t)
        t = setTimeout(() => window.dispatchEvent(new CustomEvent('contests-realtime')), 400)
      })
      .subscribe()
    return () => {
      if (t) clearTimeout(t)
      void sub.unsubscribe()
    }
  }, [me?.user_id])

  if (!ctx || !me) {
    return null
  }

  return (
    <>
      <div className="container home-container">
        {hubTab === 'allyoung' ? (
          <ContestAllyoungSection me={me} showToast={showToast} loadingOverlay={loadingOverlay} />
        ) : (
          <StartupHubSection currentUserId={me.user_id} />
        )}
      </div>
      <div className={'loading-overlay' + (overlay ? ' is-active' : '')} aria-busy={overlay}>
        <div className="loading-overlay__backdrop" />
        <div className="loading-overlay__content">
          <div className="loading-overlay__spinner" />
          <p className="loading-overlay__text">로딩 중...</p>
        </div>
      </div>
    </>
  )
}
