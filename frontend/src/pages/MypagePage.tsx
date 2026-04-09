import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useMainLayoutOutletContext } from '../components/layout/mainLayoutContext'
import { MypageDashboardSummary } from '../components/mypage/MypageDashboardSummary'
import { MypageHeaderToolbar } from '../components/mypage/MypageHeaderToolbar'
import { MypageOverlayModals } from '../components/mypage/MypageOverlayModals'
import { MypageParticipationSection } from '../components/mypage/MypageParticipationSection'
import { MypagePinnedPortfolio } from '../components/mypage/MypagePinnedPortfolio'
import { MypageProfileSection } from '../components/mypage/MypageProfileSection'
import { fetchMypageSnapshot } from '../services/mypageSnapshotService'
import type { MypageSnapshotData } from '../types/mypage'

export function MypagePage() {
  const ctx = useMainLayoutOutletContext()
  const me = ctx?.me
  const { userId } = useParams<{ userId: string }>()
  const [snapshot, setSnapshot] = useState<MypageSnapshotData | null>(null)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [mypageModal, setMypageModal] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!userId) return
    const viewerId = me?.user_id
    if (!viewerId) return
    setLoadErr(null)
    try {
      const data = await fetchMypageSnapshot(userId, viewerId)
      if (data) setSnapshot(data)
      else setLoadErr('불러오지 못했습니다.')
    } catch {
      setLoadErr('오류가 발생했습니다.')
    }
  }, [userId, me?.user_id])

  useEffect(() => {
    const id = window.setTimeout(() => void load(), 0)
    return () => window.clearTimeout(id)
  }, [load])

  if (!me) {
    return null
  }

  if (!userId) {
    return (
      <div className="mypage-surface">
        <p className="mypage-state-msg">잘못된 경로입니다.</p>
      </div>
    )
  }

  if (loadErr || !snapshot) {
    return (
      <div className="mypage-surface">
        <p className="mypage-state-msg">{loadErr || '로딩 중…'}</p>
      </div>
    )
  }

  return (
    <div className="mypage-surface">
      <div className="main-wrap">
        <div className="container">
          <header className="page-header">
            <h1>{snapshot.is_own_profile ? '마이페이지' : '프로필'}</h1>
            {snapshot.is_own_profile ? <MypageHeaderToolbar onOpen={setMypageModal} /> : <div className="info-buttons" />}
          </header>
          <MypageOverlayModals
            snapshot={snapshot}
            openId={mypageModal}
            onClose={() => setMypageModal(null)}
            onSaved={() => void load()}
          />
          <MypageProfileSection data={snapshot} onStatusUpdated={() => void load()} onOpenModal={setMypageModal} />
          <MypagePinnedPortfolio data={snapshot} onChanged={() => void load()} />
          <MypageDashboardSummary data={snapshot} />
          <MypageParticipationSection profileId={String(snapshot.profile.id)} isOwnProfile={snapshot.is_own_profile} />
        </div>
      </div>
    </div>
  )
}
