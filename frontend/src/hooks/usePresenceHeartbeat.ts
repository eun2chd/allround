import { useEffect } from 'react'
import { upsertPresenceOffline, upsertPresenceOnline } from '../services/presenceService'

const HEARTBEAT_MS = 60 * 1000

export function usePresenceHeartbeat(userId: string | null | undefined) {
  useEffect(() => {
    if (!userId) return
    let mounted = true

    const online = () => {
      if (!mounted) return
      void upsertPresenceOnline(userId)
    }
    const offline = () => {
      if (!mounted) return
      void upsertPresenceOffline(userId)
    }

    // Initial online mark and periodic heartbeat.
    online()
    const intervalId = window.setInterval(online, HEARTBEAT_MS)

    const onVisibility = () => {
      if (document.hidden) offline()
      else online()
    }
    const onFocus = () => online()
    const onBlur = () => offline()
    const onPageHide = () => offline()
    const onBeforeUnload = () => offline()

    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('focus', onFocus)
    window.addEventListener('blur', onBlur)
    window.addEventListener('pagehide', onPageHide)
    window.addEventListener('beforeunload', onBeforeUnload)

    return () => {
      mounted = false
      window.clearInterval(intervalId)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('blur', onBlur)
      window.removeEventListener('pagehide', onPageHide)
      window.removeEventListener('beforeunload', onBeforeUnload)
      void upsertPresenceOffline(userId)
    }
  }, [userId])
}
