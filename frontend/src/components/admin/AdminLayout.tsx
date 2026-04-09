import { useEffect } from 'react'
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
import { Link, NavLink, Outlet, useLocation, useOutletContext } from 'react-router-dom'
import type { AdminOutletContext } from './adminLayoutContext'
import { useAdminNav } from './adminNavContext'

export function AdminLayout() {
  const ctx = useOutletContext<AdminOutletContext | null | undefined>()
  const me = ctx?.me
  const location = useLocation()
  const { isOpen: navOpen, closeNav } = useAdminNav()

  useEffect(() => {
    closeNav()
  }, [location.pathname, closeNav])

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1025px)')
    const onMq = () => {
      if (mq.matches) closeNav()
    }
    mq.addEventListener('change', onMq)
    return () => mq.removeEventListener('change', onMq)
  }, [closeNav])

  useEffect(() => {
    if (!navOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeNav()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [navOpen, closeNav])

  useEffect(() => {
    if (!navOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [navOpen])

  if (!ctx || !me) {
    return null
  }

  const onNav = () => closeNav()

  return (
    <div className={'admin-shell' + (navOpen ? ' admin-shell--nav-open' : '')}>
      <button type="button" className="admin-shell-nav-backdrop" aria-label="메뉴 닫기" onClick={closeNav} />
      <aside id="admin-sidenav" className="admin-shell-sidenav" aria-label="관리자 메뉴">
        <div className="admin-shell-sidenav-head">
          <span className="admin-shell-sidenav-title">관리자</span>
        </div>
        <nav className="admin-shell-sidenav-nav">
          <NavLink
            end
            to="/admin"
            onClick={onNav}
            className={({ isActive }) => 'admin-shell-navlink' + (isActive ? ' is-active' : '')}
          >
            <HiChartPie aria-hidden className="admin-shell-navlink-icon" />
            개요
          </NavLink>
          <NavLink
            to="/admin/users"
            onClick={onNav}
            className={({ isActive }) => 'admin-shell-navlink' + (isActive ? ' is-active' : '')}
          >
            <HiUsers aria-hidden className="admin-shell-navlink-icon" />
            사용자 관리
          </NavLink>
          <NavLink
            to="/admin/exp"
            onClick={onNav}
            className={({ isActive }) => 'admin-shell-navlink' + (isActive ? ' is-active' : '')}
          >
            <HiBolt aria-hidden className="admin-shell-navlink-icon" />
            경험치 관리
          </NavLink>
          <NavLink
            to="/admin/hashtags"
            onClick={onNav}
            className={({ isActive }) => 'admin-shell-navlink' + (isActive ? ' is-active' : '')}
          >
            <HiHashtag aria-hidden className="admin-shell-navlink-icon" />
            해시태그
          </NavLink>
          <NavLink
            to="/admin/level"
            onClick={onNav}
            className={({ isActive }) => 'admin-shell-navlink' + (isActive ? ' is-active' : '')}
          >
            <HiAdjustmentsVertical aria-hidden className="admin-shell-navlink-icon" />
            레벨·티어
          </NavLink>
          <div className="admin-shell-sidenav-divider" />
          <NavLink
            to="/admin/contests"
            onClick={onNav}
            className={({ isActive }) => 'admin-shell-navlink' + (isActive ? ' is-active' : '')}
          >
            <HiClipboardDocumentList aria-hidden className="admin-shell-navlink-icon" />
            공모전 관리
          </NavLink>
          <NavLink
            to="/admin/notices"
            onClick={onNav}
            className={({ isActive }) => 'admin-shell-navlink' + (isActive ? ' is-active' : '')}
          >
            <HiMegaphone aria-hidden className="admin-shell-navlink-icon" />
            공지사항
          </NavLink>
          <NavLink
            to="/admin/feedback"
            onClick={onNav}
            className={({ isActive }) => 'admin-shell-navlink' + (isActive ? ' is-active' : '')}
          >
            <HiChatBubbleLeftRight aria-hidden className="admin-shell-navlink-icon" />
            건의·신고
          </NavLink>
          <NavLink
            to="/admin/team-settings"
            onClick={onNav}
            className={({ isActive }) => 'admin-shell-navlink' + (isActive ? ' is-active' : '')}
          >
            <HiUserGroup aria-hidden className="admin-shell-navlink-icon" />
            팀 설정
          </NavLink>
          <NavLink
            to="/admin/startup"
            onClick={onNav}
            className={({ isActive }) => 'admin-shell-navlink' + (isActive ? ' is-active' : '')}
          >
            <HiBuildingOffice aria-hidden className="admin-shell-navlink-icon" />
            창업 허브
          </NavLink>
          <NavLink
            to="/admin/comments"
            onClick={onNav}
            className={({ isActive }) => 'admin-shell-navlink' + (isActive ? ' is-active' : '')}
          >
            <HiChatBubbleBottomCenterText aria-hidden className="admin-shell-navlink-icon" />
            댓글 관리
          </NavLink>
          <NavLink
            to="/admin/representative-works"
            onClick={onNav}
            className={({ isActive }) => 'admin-shell-navlink' + (isActive ? ' is-active' : '')}
          >
            <HiPhoto aria-hidden className="admin-shell-navlink-icon" />
            대표작품
          </NavLink>
        </nav>
        <div className="admin-shell-sidenav-foot">
          <Link to="/" className="admin-shell-back-link" onClick={onNav}>
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
