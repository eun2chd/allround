import { useEffect, useState } from 'react'
import { Outlet, useNavigate } from 'react-router-dom'
import { useAuthMe } from '../../hooks/useAuthMe'
import { usePresenceHeartbeat } from '../../hooks/usePresenceHeartbeat'
import { AppLnb } from './AppLnb'
import { AppNav } from './AppNav'
import { LayoutShortcutBar } from './LayoutShortcutBar'
import type { MainLayoutOutletContext } from './mainLayoutContext'
import { UsersSidebar } from './UsersSidebar'

export function MainLayout() {
  const navigate = useNavigate()
  const { me, loading } = useAuthMe()
  usePresenceHeartbeat(me?.user_id)
  const [hubTab, setHubTab] = useState<'allyoung' | 'startup'>('allyoung')

  useEffect(() => {
    if (!loading && !me) {
      navigate('/login', { replace: true })
    }
  }, [me, loading, navigate])

  if (loading || !me) {
    return <div className="page-placeholder">로딩 중…</div>
  }

  const ctx: MainLayoutOutletContext = { me, hubTab, setHubTab }

  return (
    <>
      <AppLnb me={me} hubTab={hubTab} onHubTab={setHubTab} />
      <div className="app-main-column">
        <AppNav me={me} hubTab={hubTab} onHubTab={setHubTab} />
        <div className="app-main-with-sidebars">
          <Outlet context={ctx} />
        </div>
      </div>
      <UsersSidebar currentUserId={me.user_id} />
      <LayoutShortcutBar />
    </>
  )
}
