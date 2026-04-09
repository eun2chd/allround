import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useConfirm } from '../../context/ConfirmContext'
import { appToast } from '../../lib/appToast'
import { useNotificationsFeed } from '../../hooks/useNotificationsFeed'
import type { MeData } from '../../hooks/useAuthMe'
import { HiBell } from 'react-icons/hi2'
import { signOutEverywhere } from '../../services/authService'
import { NotificationPanel } from '../layout/NotificationPanel'

const NOTI_REFETCH_MS = 30_000

function adminPageTitle(pathname: string): string {
  if (pathname === '/admin' || pathname === '/admin/') return '관리자 대시보드'
  if (/^\/admin\/users\/[^/]+$/.test(pathname)) return '사용자 상세'
  if (pathname.startsWith('/admin/users')) return '사용자 관리'
  if (pathname.startsWith('/admin/hashtags')) return '해시태그 관리'
  if (pathname.startsWith('/admin/level')) return '레벨·티어 설정'
  if (pathname.startsWith('/admin/startup')) return '창업 허브 데이터'
  if (pathname.startsWith('/admin/comments')) return '댓글 관리'
  if (pathname.startsWith('/admin/representative-works')) return '대표작품 관리'
  if (pathname.startsWith('/admin/exp')) return '경험치 관리'
  if (pathname.startsWith('/admin/notices')) return '공지사항'
  if (pathname.startsWith('/admin/contests')) return '공모전 관리'
  if (pathname.startsWith('/admin/feedback')) return '건의·신고'
  if (pathname.startsWith('/admin/team-settings')) return '팀 설정'
  return '관리자'
}

type Props = {
  me: MeData
}

export function AdminTopBar({ me }: Props) {
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
    useNotificationsFeed(true, onUnreadBumped)

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

  const title = adminPageTitle(location.pathname)

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

  return (
    <>
      <header className="admin-app-topbar">
        <div className="admin-app-topbar-inner">
          <h1 className="admin-app-topbar-title">{title}</h1>
          <div className="admin-app-topbar-actions">
            <Link to="/" className="admin-app-topbar-link-home">
              서비스 홈
            </Link>
            <span className="admin-app-topbar-noti-wrap" ref={notiBellRef}>
              <button
                type="button"
                className="admin-app-topbar-icon-btn"
                title="알림"
                aria-expanded={notiOpen}
                onClick={(e) => {
                  e.stopPropagation()
                  openNotiPanel()
                }}
              >
                <HiBell className="admin-app-topbar-bell" aria-hidden />
                <span className="visually-hidden">알림</span>
              </button>
              {unreadCount > 0 ? <span className="admin-app-topbar-noti-dot" aria-hidden /> : null}
            </span>
            <Link to={`/mypage/${me.user_id}`} className="admin-app-topbar-profile">
              <div
                className="admin-app-topbar-avatar"
                style={me.profile_url ? { backgroundImage: `url('${me.profile_url}')` } : undefined}
              >
                {!me.profile_url ? <span>{(me.nickname || '?').slice(0, 1)}</span> : null}
              </div>
              <span className="admin-app-topbar-nick">{me.nickname || '회원'}</span>
            </Link>
            <div ref={dropdownRef} className={'admin-app-topbar-dropdown' + (dropdownOpen ? ' is-open' : '')}>
              <button
                type="button"
                className="admin-app-topbar-menu-btn"
                onClick={(e) => {
                  e.stopPropagation()
                  setDropdownOpen((v) => !v)
                }}
              >
                메뉴
              </button>
              <div className="admin-app-topbar-dropdown-menu">
                <button
                  type="button"
                  className="admin-app-topbar-dropdown-item admin-app-topbar-dropdown-item-danger"
                  onClick={async () => {
                    setDropdownOpen(false)
                    const ok = await confirm({
                      title: '로그아웃',
                      message: '로그아웃할까요?',
                      confirmText: '로그아웃',
                    })
                    if (!ok) return
                    await signOutEverywhere()
                    navigate('/login', { replace: true })
                  }}
                >
                  로그아웃
                </button>
              </div>
            </div>
          </div>
        </div>
      </header>
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
    </>
  )
}
