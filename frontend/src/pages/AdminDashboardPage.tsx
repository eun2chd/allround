import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AdminDashboardOverview } from '../components/admin/AdminDashboardOverview'
import { useAdminOutletContext } from '../components/admin/adminLayoutContext'
import { appToast } from '../lib/appToast'
import {
  fetchAdminDashboardBundle,
  type AdminDashboardBundle,
} from '../services/adminDashboardService'
import {
  HiMegaphone,
  HiChatBubbleLeftRight,
  HiHome,
  HiUsers,
  HiClipboardDocumentList,
  HiUserGroup,
  HiHashtag,
  HiAdjustmentsVertical,
  HiBuildingOffice,
  HiChatBubbleBottomCenterText,
  HiPhoto,
} from 'react-icons/hi2'

const EMPTY_BUNDLE: AdminDashboardBundle = {
  summary: {
    totalUsers: 0,
    newUsersToday: 0,
    newUsersYesterday: 0,
    expEventsToday: 0,
    expEventsYesterday: 0,
    feedbackPending: 0,
    contestsActive: 0,
    contestsTotal: 0,
  },
  tierDistribution: [],
  expEventsByDay: [],
  contestsByCategory: [],
  feedbackByStatus: [
    { status: 'pending', label: '대기', count: 0 },
    { status: 'processing', label: '처리 중', count: 0 },
    { status: 'done', label: '완료', count: 0 },
  ],
  expEventsChartTruncated: false,
}

export function AdminDashboardPage() {
  const ctx = useAdminOutletContext()
  const [bundle, setBundle] = useState<AdminDashboardBundle | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetchAdminDashboardBundle()
      if (r.ok === false) {
        appToast(r.error, 'error')
        setBundle(null)
      } else {
        setBundle(r.data)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  if (!ctx?.me) {
    return null
  }

  const data = bundle ?? EMPTY_BUNDLE
  const showCharts = bundle !== null

  return (
    <div className="content-route-wrap">
      <div className="content-page content-page--wide admin-dashboard">
        <header className="content-page-header admin-dashboard-header">
          <div>
            <h1>
              관리자 <span>대시보드</span>
            </h1>
            <p className="admin-dashboard-lead">
              서비스 지표와 차트로 현황을 확인하고, 아래 카드에서 메뉴로 이동할 수 있습니다.
            </p>
          </div>
          <button type="button" className="btn-secondary" onClick={() => void load()} disabled={loading}>
            새로고침
          </button>
        </header>

        {loading ? (
          <p className="admin-users-state">대시보드 데이터를 불러오는 중…</p>
        ) : !showCharts ? (
          <p className="admin-users-state">데이터를 불러오지 못했습니다. RLS·권한을 확인한 뒤 새로고침해 주세요.</p>
        ) : (
          <AdminDashboardOverview
            summary={data.summary}
            tierDistribution={data.tierDistribution}
            expEventsByDay={data.expEventsByDay}
            contestsByCategory={data.contestsByCategory}
            feedbackByStatus={data.feedbackByStatus}
            expEventsChartTruncated={data.expEventsChartTruncated}
          />
        )}

        <h2 className="admin-dashboard-shortcuts-title">바로가기</h2>
        <ul className="admin-dashboard-grid">
          <li>
            <Link to="/admin/users" className="admin-dashboard-card">
              <span className="admin-dashboard-card-icon" aria-hidden>
                <HiUsers />
              </span>
              <div className="admin-dashboard-card-body">
                <h2>사용자 관리</h2>
                <p>회원 목록, 역할(관리자 / 팀원) 변경</p>
              </div>
            </Link>
          </li>
          <li>
            <Link to="/admin/contests" className="admin-dashboard-card">
              <span className="admin-dashboard-card-icon" aria-hidden>
                <HiClipboardDocumentList />
              </span>
              <div className="admin-dashboard-card-body">
                <h2>공모전 게시글</h2>
                <p>contests 목록 수정·삭제</p>
              </div>
            </Link>
          </li>
          <li>
            <Link to="/admin/hashtags" className="admin-dashboard-card">
              <span className="admin-dashboard-card-icon" aria-hidden>
                <HiHashtag />
              </span>
              <div className="admin-dashboard-card-body">
                <h2>해시태그</h2>
                <p>프로필 태그 목록 등록·수정·삭제</p>
              </div>
            </Link>
          </li>
          <li>
            <Link to="/admin/level" className="admin-dashboard-card">
              <span className="admin-dashboard-card-icon" aria-hidden>
                <HiAdjustmentsVertical />
              </span>
              <div className="admin-dashboard-card-body">
                <h2>레벨·티어</h2>
                <p>level_config·level_tiers 밸런스 편집</p>
              </div>
            </Link>
          </li>
          <li>
            <Link to="/admin/startup" className="admin-dashboard-card">
              <span className="admin-dashboard-card-icon" aria-hidden>
                <HiBuildingOffice />
              </span>
              <div className="admin-dashboard-card-body">
                <h2>창업 허브</h2>
                <p>지원사업·공고 데이터 및 크롤 페이지</p>
              </div>
            </Link>
          </li>
          <li>
            <Link to="/admin/comments" className="admin-dashboard-card">
              <span className="admin-dashboard-card-icon" aria-hidden>
                <HiChatBubbleBottomCenterText />
              </span>
              <div className="admin-dashboard-card-body">
                <h2>댓글 관리</h2>
                <p>공모전·창업 댓글 삭제</p>
              </div>
            </Link>
          </li>
          <li>
            <Link to="/admin/representative-works" className="admin-dashboard-card">
              <span className="admin-dashboard-card-icon" aria-hidden>
                <HiPhoto />
              </span>
              <div className="admin-dashboard-card-body">
                <h2>대표작품</h2>
                <p>마이페이지 대표 슬롯 정리</p>
              </div>
            </Link>
          </li>
          <li>
            <Link to="/admin/notices" className="admin-dashboard-card">
              <span className="admin-dashboard-card-icon" aria-hidden>
                <HiMegaphone />
              </span>
              <div className="admin-dashboard-card-body">
                <h2>공지사항</h2>
                <p>공지 작성·수정·삭제 및 고정 관리</p>
              </div>
            </Link>
          </li>
          <li>
            <Link to="/admin/feedback" className="admin-dashboard-card">
              <span className="admin-dashboard-card-icon" aria-hidden>
                <HiChatBubbleLeftRight />
              </span>
              <div className="admin-dashboard-card-body">
                <h2>건의·신고</h2>
                <p>접수 목록 확인 및 관리자 답변</p>
              </div>
            </Link>
          </li>
          <li>
            <Link to="/admin/team-settings" className="admin-dashboard-card">
              <span className="admin-dashboard-card-icon" aria-hidden>
                <HiUserGroup />
              </span>
              <div className="admin-dashboard-card-body">
                <h2>팀 설정</h2>
                <p>연도별 팀 프로필·목표·달성액·마감 관리</p>
              </div>
            </Link>
          </li>
          <li>
            <Link to="/" className="admin-dashboard-card admin-dashboard-card-muted">
              <span className="admin-dashboard-card-icon" aria-hidden>
                <HiHome />
              </span>
              <div className="admin-dashboard-card-body">
                <h2>메인 홈</h2>
                <p>공모전·창업 허브로 돌아가기</p>
              </div>
            </Link>
          </li>
        </ul>
      </div>
    </div>
  )
}
