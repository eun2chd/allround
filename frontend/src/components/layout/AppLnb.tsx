import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { HiArrowPath } from 'react-icons/hi2'
import { staticUrl } from '../../lib/api'
import type { MeData } from '../../hooks/useAuthMe'
import { MainNavSidebarBody } from './MainNavSidebarBody'

const LOGO_KEY = 'headerLogo'

type Props = {
  me: MeData
  hubTab: 'allyoung' | 'startup'
  onHubTab: (t: 'allyoung' | 'startup') => void
}

export function AppLnb({ me, hubTab, onHubTab }: Props) {
  const [logo2, setLogo2] = useState(false)

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
        <MainNavSidebarBody me={me} hubTab={hubTab} onHubTab={onHubTab} />
      </nav>
    </aside>
  )
}
