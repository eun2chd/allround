import { HiHashtag, HiSparkles, HiTrophy } from 'react-icons/hi2'

type Props = {
  onOpen: (id: string) => void
}

const infoIco = { className: 'btn-info-ico', 'aria-hidden': true as const }

export function MypageHeaderToolbar({ onOpen }: Props) {
  return (
    <div className="info-buttons">
      <button type="button" className="btn-profile-apply" title="프로필 테마 선택" onClick={() => onOpen('theme')}>
        프로필 적용
      </button>
      <button type="button" className="btn-info btn-info--tier" title="티어 시스템 안내" onClick={() => onOpen('tier')}>
        <HiTrophy {...infoIco} />
      </button>
      <button type="button" className="btn-info btn-info--hashtag" title="해시태그 선택" onClick={() => onOpen('hashtags')}>
        <HiHashtag {...infoIco} />
      </button>
      <button type="button" className="btn-info btn-info--headline" title="헤드라인 안내" onClick={() => onOpen('headline')}>
        <HiSparkles {...infoIco} />
      </button>
    </div>
  )
}
