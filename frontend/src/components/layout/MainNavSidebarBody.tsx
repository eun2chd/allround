import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import {
  HiBookmark,
  HiBuildingOffice2,
  HiEnvelope,
  HiMegaphone,
  HiRocketLaunch,
  HiTrophy,
  HiUserCircle,
  HiUserGroup,
} from 'react-icons/hi2'
import type { MeData } from '../../hooks/useAuthMe'

const navItemClass = ({ isActive }: { isActive: boolean }) =>
  'app-lnb-link' + (isActive ? ' app-lnb-link--active' : '')

type Props = {
  me: MeData
  hubTab: 'allyoung' | 'startup'
  onHubTab: (t: 'allyoung' | 'startup') => void
  /** 모바일 드로어에서 항목 선택 후 닫기 등 */
  afterNavigate?: () => void
}

export function MainNavSidebarBody({ me, hubTab, onHubTab, afterNavigate }: Props) {
  const location = useLocation()
  const navigate = useNavigate()
  const onHome = location.pathname === '/'
  const done = () => afterNavigate?.()

  return (
    <>
      <div className="app-lnb-nav-group">
        <span className="app-lnb-nav-heading">허브</span>
        <button
          type="button"
          className={'app-lnb-link app-lnb-link--btn' + (onHome && hubTab === 'allyoung' ? ' app-lnb-link--active' : '')}
          onClick={() => {
            onHubTab('allyoung')
            navigate('/')
            done()
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
            done()
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
        <NavLink to="/notices" className={navItemClass} onClick={done}>
          <span className="app-lnb-ico" aria-hidden>
            <HiMegaphone />
          </span>
          공지사항
        </NavLink>
        <NavLink to="/participation-status" className={navItemClass} onClick={done}>
          <span className="app-lnb-ico" aria-hidden>
            <HiUserGroup />
          </span>
          참여현황
        </NavLink>
        <NavLink to="/team" className={navItemClass} onClick={done}>
          <span className="app-lnb-ico" aria-hidden>
            <HiBuildingOffice2 />
          </span>
          팀 대시보드
        </NavLink>
        <NavLink to="/feedback" className={navItemClass} onClick={done}>
          <span className="app-lnb-ico" aria-hidden>
            <HiEnvelope />
          </span>
          건의·신고
        </NavLink>
        <NavLink to="/bookmarks" className={navItemClass} onClick={done}>
          <span className="app-lnb-ico" aria-hidden>
            <HiBookmark />
          </span>
          즐겨찾기
        </NavLink>
        <NavLink to={`/mypage/${me.user_id}`} className={navItemClass} onClick={done}>
          <span className="app-lnb-ico" aria-hidden>
            <HiUserCircle />
          </span>
          마이페이지
        </NavLink>
      </div>
    </>
  )
}
