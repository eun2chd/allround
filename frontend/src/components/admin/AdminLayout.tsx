import {
  HiArrowLeft,
  HiBolt,
  HiChartPie,
  HiChatBubbleLeftRight,
  HiMegaphone,
  HiUsers,
} from 'react-icons/hi2'
import { Link, NavLink, Outlet, useOutletContext } from 'react-router-dom'
import type { AdminOutletContext } from './adminLayoutContext'

export function AdminLayout() {
  const ctx = useOutletContext<AdminOutletContext | null | undefined>()
  const me = ctx?.me

  if (!ctx || !me) {
    return null
  }

  return (
    <div className="admin-shell">
      <aside className="admin-shell-sidenav" aria-label="관리자 메뉴">
        <div className="admin-shell-sidenav-head">
          <span className="admin-shell-sidenav-title">관리자</span>
        </div>
        <nav className="admin-shell-sidenav-nav">
          <NavLink end to="/admin" className={({ isActive }) => 'admin-shell-navlink' + (isActive ? ' is-active' : '')}>
            <HiChartPie aria-hidden className="admin-shell-navlink-icon" />
            개요
          </NavLink>
          <NavLink to="/admin/users" className={({ isActive }) => 'admin-shell-navlink' + (isActive ? ' is-active' : '')}>
            <HiUsers aria-hidden className="admin-shell-navlink-icon" />
            사용자 관리
          </NavLink>
          <NavLink to="/admin/exp" className={({ isActive }) => 'admin-shell-navlink' + (isActive ? ' is-active' : '')}>
            <HiBolt aria-hidden className="admin-shell-navlink-icon" />
            경험치 관리
          </NavLink>
          <div className="admin-shell-sidenav-divider" />
          <NavLink to="/admin/notices" className={({ isActive }) => 'admin-shell-navlink' + (isActive ? ' is-active' : '')}>
            <HiMegaphone aria-hidden className="admin-shell-navlink-icon" />
            공지사항
          </NavLink>
          <NavLink to="/admin/feedback" className={({ isActive }) => 'admin-shell-navlink' + (isActive ? ' is-active' : '')}>
            <HiChatBubbleLeftRight aria-hidden className="admin-shell-navlink-icon" />
            건의·신고
          </NavLink>
        </nav>
        <div className="admin-shell-sidenav-foot">
          <Link to="/" className="admin-shell-back-link">
            <HiArrowLeft aria-hidden className="admin-shell-navlink-icon" />
            서비스 홈
          </Link>
        </div>
      </aside>
      <div className="admin-shell-body">
        <Outlet context={ctx} />
      </div>
    </div>
  )
}
