import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { HiChevronDoubleLeft, HiChevronDoubleRight, HiXMark } from 'react-icons/hi2'
import { fetchSidebarUsers } from '../../services/sidebarSupabaseService'
import { getSupabase } from '../../services/supabaseClient'

const SIDEBAR_KEY = 'allyoung_sidebar_collapsed'
const CACHE_KEY = 'allyoung_sidebar_users_v3'
const CACHE_TTL = 20 * 60 * 1000

const ONLINE_MS = 30 * 60 * 1000
const USERS_REFRESH_MS = 60 * 1000

type UserRow = {
  id: string
  nickname?: string
  profile_url?: string
  status_message?: string
  last_seen?: string | null
}

function formatTimeAgo(isoStr: string): string {
  const date = new Date(isoStr.replace('Z', '+00:00'))
  const now = Date.now()
  const diffSec = Math.floor((now - date.getTime()) / 1000)
  if (diffSec < 60) return '방금 전'
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}분 전`
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}시간 전`
  if (diffSec < 2592000) return `${Math.floor(diffSec / 86400)}일 전`
  return `${Math.floor(diffSec / 2592000)}달 전`
}

function isWithin30Min(lastSeen?: string | null): boolean {
  if (!lastSeen) return false
  const t = new Date(lastSeen.replace('Z', '+00:00')).getTime()
  return Date.now() - t < ONLINE_MS
}

type Props = {
  currentUserId: string
  /** 1100px 이하에서 우측 시트로 표시 */
  mobileOpen?: boolean
  onMobileClose?: () => void
}

export function UsersSidebar({ currentUserId, mobileOpen = false, onMobileClose }: Props) {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_KEY) === '1'
    } catch {
      return false
    }
  })
  const [users, setUsers] = useState<UserRow[]>([])
  const [listHint, setListHint] = useState('로딩 중...')
  const [, setTick] = useState(0)

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_KEY, collapsed ? '1' : '0')
    } catch {
      /* ignore */
    }
  }, [collapsed])

  async function loadUsers(forceFetch: boolean) {
    if (!forceFetch) {
      try {
        const cached = sessionStorage.getItem(CACHE_KEY)
        if (cached) {
          const { data, ts } = JSON.parse(cached) as { data: UserRow[]; ts: number }
          if (data && Date.now() - ts < CACHE_TTL) {
            setUsers(data)
            setListHint('')
            return
          }
        }
      } catch {
        /* ignore */
      }
    }
    try {
      const data = await fetchSidebarUsers()
      const now = Date.now()
      try {
        sessionStorage.setItem(
          CACHE_KEY,
          JSON.stringify({
            data,
            ts: now,
          }),
        )
      } catch {
        /* ignore */
      }
      setUsers(data)
      setListHint(data.length ? '' : '표시할 사용자가 없습니다.')
    } catch {
      setUsers([])
      setListHint('로드 실패')
    }
  }

  useEffect(() => {
    const t = window.setTimeout(() => void loadUsers(false), 0)
    const id = window.setInterval(() => void loadUsers(true), USERS_REFRESH_MS)
    return () => {
      window.clearTimeout(t)
      window.clearInterval(id)
    }
  }, [])

  useEffect(() => {
    const id = window.setInterval(() => setTick((v) => v + 1), USERS_REFRESH_MS)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    const sb = getSupabase()
    let refreshTimer: number | null = null
    const scheduleRefresh = () => {
      if (refreshTimer !== null) window.clearTimeout(refreshTimer)
      refreshTimer = window.setTimeout(() => {
        void loadUsers(true)
      }, 1000)
    }

    const channel = sb
      .channel('sidebar-users-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'presence' },
        scheduleRefresh,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'profiles' },
        scheduleRefresh,
      )
      .subscribe()

    const onFocus = () => void loadUsers(true)
    const onVisible = () => {
      if (!document.hidden) void loadUsers(true)
    }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      if (refreshTimer !== null) window.clearTimeout(refreshTimer)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisible)
      void sb.removeChannel(channel)
    }
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.ctrlKey || e.shiftKey || e.altKey || e.key.toLowerCase() !== 'q' || e.repeat) return
      const el = e.target as HTMLElement | null
      if (el?.closest('input, textarea, select, [contenteditable="true"]')) return
      e.preventDefault()
      setCollapsed((c) => !c)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (!mobileOpen || !onMobileClose) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onMobileClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mobileOpen, onMobileClose])

  useEffect(() => {
    if (!mobileOpen) return
    const mq = window.matchMedia('(max-width: 1100px)')
    if (!mq.matches) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [mobileOpen])

  useEffect(() => {
    if (!onMobileClose) return
    const mq = window.matchMedia('(max-width: 1100px)')
    const sync = () => {
      if (!mq.matches) onMobileClose()
    }
    mq.addEventListener('change', sync)
    if (!mq.matches && mobileOpen) onMobileClose()
    return () => mq.removeEventListener('change', sync)
  }, [mobileOpen, onMobileClose])

  const sheetOpen = mobileOpen
  const asideClass =
    'sidebar-users' +
    (collapsed ? ' collapsed' : '') +
    (sheetOpen ? ' sidebar-users--mobile-open' : '')

  return (
    <>
      {sheetOpen ? (
        <button
          type="button"
          className="sidebar-users-mobile-backdrop"
          aria-label="접속 유저 패널 닫기"
          onClick={() => onMobileClose?.()}
        />
      ) : null}
      <aside className={asideClass} id="sidebarUsers" aria-label="접속 유저">
      <div className="sidebar-header">
        <span className="sidebar-title">접속 유저</span>
        {sheetOpen ? (
          <button
            type="button"
            className="sidebar-users-mobile-close"
            aria-label="닫기"
            onClick={() => onMobileClose?.()}
          >
            <HiXMark aria-hidden />
          </button>
        ) : null}
      </div>
      <div className="sidebar-user-list">
        <div id="sidebarUserList">
          {listHint && users.length === 0 ? (
            <div className="user-item" style={{ color: 'var(--gray-muted)', fontSize: '0.8rem', justifyContent: 'center' }}>
              {listHint}
            </div>
          ) : (
            users.map((u) => {
              const name = u.nickname || '회원'
              const initial = name.charAt(0)
              const within = isWithin30Min(u.last_seen)
              const ago = u.last_seen ? formatTimeAgo(u.last_seen) : ''
              const statusText = within ? (ago ? `${ago} 접속` : '온라인') : ago ? `${ago} 오프라인` : '오프라인'
              const statusLineClass = within ? 'user-status online' : 'user-status status-gray'
              const me = u.id === currentUserId ? ' (나)' : ''
              const statusMsg = (u.status_message || '').trim()

              return (
                <Link
                  key={u.id}
                  to={`/mypage/${encodeURIComponent(u.id)}`}
                  className="user-item"
                  onClick={() => {
                    if (sheetOpen) onMobileClose?.()
                  }}
                >
                  <div
                    className="user-avatar"
                    style={u.profile_url ? { backgroundImage: `url('${u.profile_url.replace(/'/g, "\\'")}')` } : undefined}
                  >
                    {!u.profile_url ? <span>{initial}</span> : null}
                  </div>
                  <div className="user-info">
                    <div className="user-name">
                      {name}
                      {me}
                    </div>
                    <div className={statusLineClass}>
                      <span className={'status-dot ' + (within ? 'online' : 'offline')} /> {statusText}
                    </div>
                    {statusMsg ? <div className="user-status-msg">{statusMsg}</div> : null}
                  </div>
                </Link>
              )
            })
          )}
        </div>
      </div>
      <div className="sidebar-footer">
        <button
          type="button"
          className="sidebar-toggle"
          id="sidebarToggle"
          title={collapsed ? '사이드바 펼치기 (Ctrl+Q)' : '사이드바 접기 (Ctrl+Q)'}
          aria-keyshortcuts="Control+Q"
          onClick={() => setCollapsed((c) => !c)}
        >
          <HiChevronDoubleLeft className="sidebar-toggle-icon sidebar-icon-collapse" aria-hidden />
          <HiChevronDoubleRight className="sidebar-toggle-icon sidebar-icon-expand" aria-hidden />
        </button>
      </div>
    </aside>
    </>
  )
}
