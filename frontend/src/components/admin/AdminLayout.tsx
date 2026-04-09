import {
  HiArrowLeft,
  HiBolt,
  HiChartPie,
  HiChatBubbleLeftRight,
  HiClipboardDocumentList,
  HiMegaphone,
  HiUsers,
  HiUserGroup,
  HiHashtag,
  HiAdjustmentsVertical,
  HiBuildingOffice,
  HiChatBubbleBottomCenterText,
  HiPhoto,
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
          <NavLink to="/admin/hashtags" className={({ isActive }) => 'admin-shell-navlink' + (isActive ? ' is-active' : '')}>
            <HiHashtag aria-hidden className="admin-shell-navlink-icon" />
            해시태그
          </NavLink>
          <NavLink to="/admin/level" className={({ isActive }) => 'admin-shell-navlink' + (isActive ? ' is-active' : '')}>
            <HiAdjustmentsVertical aria-hidden className="admin-shell-navlink-icon" />
            레벨·티어
          </NavLink>
          <div className="admin-shell-sidenav-divider" />
          <NavLink to="/admin/contests" className={({ isActive }) => 'admin-shell-navlink' + (isActive ? ' is-active' : '')}>
            <HiClipboardDocumentList aria-hidden className="admin-shell-navlink-icon" />
            공모전 관리
          </NavLink>
          <NavLink to="/admin/notices" className={({ isActive }) => 'admin-shell-navlink' + (isActive ? ' is-active' : '')}>
            <HiMegaphone aria-hidden className="admin-shell-navlink-icon" />
            공지사항
          </NavLink>
          <NavLink to="/admin/feedback" className={({ isActive }) => 'admin-shell-navlink' + (isActive ? ' is-active' : '')}>
            <HiChatBubbleLeftRight aria-hidden className="admin-shell-navlink-icon" />
            건의·신고
          </NavLink>
          <NavLink to="/admin/team-settings" className={({ isActive }) => 'admin-shell-navlink' + (isActive ? ' is-active' : '')}>
            <HiUserGroup aria-hidden className="admin-shell-navlink-icon" />
            팀 설정
          </NavLink>
          <NavLink to="/admin/startup" className={({ isActive }) => 'admin-shell-navlink' + (isActive ? ' is-active' : '')}>
            <HiBuildingOffice aria-hidden className="admin-shell-navlink-icon" />
            창업 허브
          </NavLink>
          <NavLink to="/admin/comments" className={({ isActive }) => 'admin-shell-navlink' + (isActive ? ' is-active' : '')}>
            <HiChatBubbleBottomCenterText aria-hidden className="admin-shell-navlink-icon" />
            댓글 관리
          </NavLink>
          <NavLink to="/admin/representative-works" className={({ isActive }) => 'admin-shell-navlink' + (isActive ? ' is-active' : '')}>
            <HiPhoto aria-hidden className="admin-shell-navlink-icon" />
            대표작품
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
