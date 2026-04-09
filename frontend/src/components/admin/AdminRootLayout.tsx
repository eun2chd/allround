import { useEffect } from 'react'
import { Navigate, Outlet, useNavigate } from 'react-router-dom'
import { useAuthMe } from '../../hooks/useAuthMe'
import { AdminTopBar } from './AdminTopBar'
import { AdminNavProvider } from './adminNavContext'
import type { AdminOutletContext } from './adminLayoutContext'

export function AdminRootLayout() {
  const navigate = useNavigate()
  const { me, loading } = useAuthMe()

  useEffect(() => {
    if (!loading && !me) {
      navigate('/login', { replace: true })
    }
  }, [me, loading, navigate])

  if (loading || !me) {
    return <div className="page-placeholder">로딩 중…</div>
  }

  if (me.role !== 'admin') {
    return <Navigate to="/" replace />
  }

  const ctx: AdminOutletContext = { me }

  return (
    <AdminNavProvider>
      <div className="admin-app-root">
        <AdminTopBar me={me} />
        <div className="admin-app-body">
          <Outlet context={ctx} />
        </div>
      </div>
    </AdminNavProvider>
  )
}
