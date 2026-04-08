import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useConfirm } from '../../context/ConfirmContext'
import { appToast } from '../../lib/appToast'
import { useNotificationsFeed } from '../../hooks/useNotificationsFeed'
import type { MeData } from '../../hooks/useAuthMe'
import { HiBell } from 'react-icons/hi2'
import { NotificationPanel } from './NotificationPanel'

const NOTI_REFETCH_MS = 30_000

function pageTitle(pathname: string, hubTab: 'allyoung' | 'startup'): string {
  if (pathname === '/') return hubTab === 'allyoung' ? '공모전 목록' : '창업 허브'
  if (pathname.startsWith('/mypage')) return '마이페이지'
  if (pathname === '/bookmarks') return '즐겨찾기'
  if (pathname === '/notices') return '공지사항'
  if (pathname === '/participation-status') return '참여현황'
  if (pathname === '/feedback') return '건의·신고'
  if (pathname === '/team') return '팀 대시보드'
  return '대시보드'
}

type Props = {
  me: MeData | null
  hubTab: 'allyoung' | 'startup'
  onHubTab?: (t: 'allyoung' | 'startup') => void
}

export function AppNav({ me, hubTab, onHubTab }: Props) {
  const navigate = useNavigate()
  const location = useLocation()
  const confirm = useConfirm()
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [notiOpen, setNotiOpen] = useState(false)

  const notiPanelRef = useRef<HTMLElement | null>(null)
  const notiBellRef = useRef<HTMLSpanElement | null>(null)
  const dropdownRef = useRef<HTMLDivElement | null>(null)
  const lastNotiPanelFetchAt = useRef(0)

  const showNavToast = useCallback((msg: string, type: 'success' | 'error' = 'success') => {
    appToast(msg, type)
  }, [])

  const onUnreadBumped = useCallback(() => {
    showNavToast('새 알림이 도착했습니다', 'success')
  }, [showNavToast])

  const { items: notiItems, unreadCount, reload: reloadNoti, readOne, deleteOne, readAll, deleteAll } =
    useNotificationsFeed(!!me, onUnreadBumped)

  useEffect(() => {
    if (!notiOpen) return
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node
      if (notiPanelRef.current?.contains(t)) return
      if (notiBellRef.current?.contains(t)) return
      setNotiOpen(false)
    }
    document.addEventListener('click', onDoc)
    return () => document.removeEventListener('click', onDoc)
  }, [notiOpen])

  useEffect(() => {
    if (!dropdownOpen) return
    const onDoc = (e: MouseEvent) => {
      const el = dropdownRef.current
      if (el && !el.contains(e.target as Node)) setDropdownOpen(false)
    }
    document.addEventListener('click', onDoc)
    return () => document.removeEventListener('click', onDoc)
  }, [dropdownOpen])

  const title = pageTitle(location.pathname, hubTab)

  const openNotiPanel = () => {
    setNotiOpen((v) => {
      const next = !v
      if (next && Date.now() - lastNotiPanelFetchAt.current > NOTI_REFETCH_MS) {
        lastNotiPanelFetchAt.current = Date.now()
        void reloadNoti()
      }
      return next
    })
  }

  const onHome = location.pathname === '/'

  return (
    <>
      <header className="app-topbar">
        <div className="app-topbar-inner">
          <h1 className="app-topbar-title">{title}</h1>
          {me ? (
            <div className="app-topbar-actions navbar-user">
              <Link to={`/mypage/${me.user_id}`} className="app-topbar-profile user-profile">
                <div
                  className="user-avatar"
                  style={me.profile_url ? { backgroundImage: `url('${me.profile_url}')` } : undefined}
                >
                  {!me.profile_url ? <span>{(me.nickname || '?').slice(0, 1)}</span> : null}
                </div>
                <span className="user-nickname">{me.nickname || '회원'}</span>
              </Link>
              <span className="nav-notification-wrap" ref={notiBellRef}>
                <button
                  type="button"
                  className="nav-btn-icon"
                  title="알림"
                  aria-expanded={notiOpen}
                  onClick={(e) => {
                    e.stopPropagation()
                    openNotiPanel()
                  }}
                >
                  <HiBell className="nav-notification-bell" aria-hidden />
                  <span className="visually-hidden">알림</span>
                </button>
                {unreadCount > 0 ? <span className="nav-notification-dot" aria-hidden /> : null}
              </span>
              <div ref={dropdownRef} className={'nav-dropdown app-topbar-dropdown' + (dropdownOpen ? ' active' : '')}>
                <button
                  type="button"
                  className="nav-btn-menu nav-dropdown-toggle app-topbar-more"
                  onClick={(e) => {
                    e.stopPropagation()
                    setDropdownOpen((v) => !v)
                  }}
                >
                  메뉴
                </button>
                <div className="nav-dropdown-menu">
                  <NavLink to="/bookmarks" className="nav-dropdown-item" onClick={() => setDropdownOpen(false)}>
                    즐겨찾기
                  </NavLink>
                  <NavLink to="/team" className="nav-dropdown-item" onClick={() => setDropdownOpen(false)}>
                    팀 대시보드
                  </NavLink>
                  <div className="nav-dropdown-divider" />
                  <button
                    type="button"
                    className="nav-dropdown-item nav-dropdown-item-danger"
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      border: 'none',
                      cursor: 'pointer',
                      font: 'inherit',
                      background: 'none',
                    }}
                    onClick={async () => {
                      setDropdownOpen(false)
                      const ok = await confirm({
                        title: '로그아웃',
                        message: '로그아웃할까요?',
                        confirmText: '로그아웃',
                      })
                      if (ok) navigate('/logout')
                    }}
                  >
                    로그아웃
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="navbar-right">
              <Link to="/login">로그인</Link>
              <Link to="/signup">회원가입</Link>
            </div>
          )}
        </div>
        {me && onHubTab ? (
          <nav className="app-topbar-quicklinks" aria-label="빠른 메뉴">
            <button
              type="button"
              className={'app-topbar-quicklink' + (onHome && hubTab === 'allyoung' ? ' is-active' : '')}
              onClick={() => {
                onHubTab('allyoung')
                navigate('/')
              }}
            >
              공모전
            </button>
            <button
              type="button"
              className={'app-topbar-quicklink' + (onHome && hubTab === 'startup' ? ' is-active' : '')}
              onClick={() => {
                onHubTab('startup')
                navigate('/')
              }}
            >
              창업
            </button>
            <NavLink to="/notices" className={({ isActive }) => 'app-topbar-quicklink' + (isActive ? ' is-active' : '')}>
              공지
            </NavLink>
            <NavLink
              to="/participation-status"
              className={({ isActive }) => 'app-topbar-quicklink' + (isActive ? ' is-active' : '')}
            >
              참여
            </NavLink>
            <NavLink to="/feedback" className={({ isActive }) => 'app-topbar-quicklink' + (isActive ? ' is-active' : '')}>
              건의
            </NavLink>
            <NavLink to="/team" className={({ isActive }) => 'app-topbar-quicklink' + (isActive ? ' is-active' : '')}>
              팀
            </NavLink>
          </nav>
        ) : null}
      </header>
      {me ? (
        <NotificationPanel
          ref={notiPanelRef}
          open={notiOpen}
          onClose={() => setNotiOpen(false)}
          items={notiItems}
          onReadOne={readOne}
          onDeleteOne={deleteOne}
          onReadAll={readAll}
          onDeleteAll={deleteAll}
          onToast={showNavToast}
        />
      ) : null}
    </>
  )
}
