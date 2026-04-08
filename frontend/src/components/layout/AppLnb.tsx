import { useEffect, useState } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import {
  HiArrowPath,
  HiBookmark,
  HiBuildingOffice2,
  HiEnvelope,
  HiMegaphone,
  HiRocketLaunch,
  HiTrophy,
  HiUserCircle,
  HiUserGroup,
} from 'react-icons/hi2'
import { staticUrl } from '../../lib/api'
import type { MeData } from '../../hooks/useAuthMe'

const LOGO_KEY = 'headerLogo'

type Props = {
  me: MeData
  hubTab: 'allyoung' | 'startup'
  onHubTab: (t: 'allyoung' | 'startup') => void
}

const navItemClass = ({ isActive }: { isActive: boolean }) =>
  'app-lnb-link' + (isActive ? ' app-lnb-link--active' : '')

export function AppLnb({ me, hubTab, onHubTab }: Props) {
  const location = useLocation()
  const navigate = useNavigate()
  const [logo2, setLogo2] = useState(false)
  const onHome = location.pathname === '/'

  useEffect(() => {
    try {
      setLogo2(localStorage.getItem(LOGO_KEY) === 'logo2')
    } catch {
      /* ignore */
    }
  }, [])

  const toggleLogo = () => {
    const next = !logo2
    setLogo2(next)
    try {
      localStorage.setItem(LOGO_KEY, next ? 'logo2' : 'logo')
    } catch {
      /* ignore */
    }
  }

  const logoSrc = logo2 ? staticUrl('/logo2.png') : staticUrl('/logo.png')

  return (
    <aside className="app-lnb" aria-label="메인 메뉴">
      <div className="app-lnb-brand">
        <Link to="/" className="app-lnb-logo-link">
          <img src={logoSrc} alt="" className={logo2 ? 'app-lnb-logo app-lnb-logo--large' : 'app-lnb-logo'} height={32} />
        </Link>
        <button type="button" className="app-lnb-logo-switch" title="로고 변경" aria-label="로고 변경" onClick={toggleLogo}>
          <HiArrowPath className="app-lnb-logo-switch-ico" aria-hidden />
        </button>
      </div>
      <p className="app-lnb-service-name">Ex Tech Korea</p>

      <nav className="app-lnb-nav" aria-label="서비스 navigation">
        <div className="app-lnb-nav-group">
          <span className="app-lnb-nav-heading">허브</span>
          <button
            type="button"
            className={'app-lnb-link app-lnb-link--btn' + (onHome && hubTab === 'allyoung' ? ' app-lnb-link--active' : '')}
            onClick={() => {
              onHubTab('allyoung')
              navigate('/')
            }}
          >
            <span className="app-lnb-ico" aria-hidden>
              <HiTrophy />
            </span>
            공모전
          </button>
          <button
            type="button"
            className={'app-lnb-link app-lnb-link--btn' + (onHome && hubTab === 'startup' ? ' app-lnb-link--active' : '')}
            onClick={() => {
              onHubTab('startup')
              navigate('/')
            }}
          >
            <span className="app-lnb-ico" aria-hidden>
              <HiRocketLaunch />
            </span>
            창업
          </button>
        </div>
        <div className="app-lnb-nav-group">
          <span className="app-lnb-nav-heading">바로가기</span>
          <NavLink to="/notices" className={navItemClass}>
            <span className="app-lnb-ico" aria-hidden>
              <HiMegaphone />
            </span>
            공지사항
          </NavLink>
          <NavLink to="/participation-status" className={navItemClass}>
            <span className="app-lnb-ico" aria-hidden>
              <HiUserGroup />
            </span>
            참여현황
          </NavLink>
          <NavLink to="/team" className={navItemClass}>
            <span className="app-lnb-ico" aria-hidden>
              <HiBuildingOffice2 />
            </span>
            팀 대시보드
          </NavLink>
          <NavLink to="/feedback" className={navItemClass}>
            <span className="app-lnb-ico" aria-hidden>
              <HiEnvelope />
            </span>
            건의·신고
          </NavLink>
          <NavLink to="/bookmarks" className={navItemClass}>
            <span className="app-lnb-ico" aria-hidden>
              <HiBookmark />
            </span>
            즐겨찾기
          </NavLink>
          <NavLink to={`/mypage/${me.user_id}`} className={navItemClass}>
            <span className="app-lnb-ico" aria-hidden>
              <HiUserCircle />
            </span>
            마이페이지
          </NavLink>
        </div>
      </nav>
    </aside>
  )
}
