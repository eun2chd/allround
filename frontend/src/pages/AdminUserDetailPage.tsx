import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAdminOutletContext } from '../components/admin/adminLayoutContext'
import { appToast } from '../lib/appToast'
import { fetchAdminProfileDetail, type AdminProfileDetail } from '../services/adminUsersService'

function roleLabel(role: string) {
  return role === 'admin' ? '관리자' : '팀원'
}

function formatDt(iso: string | null | undefined) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <tr className="admin-user-detail-row">
      <th scope="row" className="admin-user-detail-label">
        {label}
      </th>
      <td className="admin-user-detail-value">{value}</td>
    </tr>
  )
}

export function AdminUserDetailPage() {
  const { userId } = useParams<{ userId: string }>()
  const ctx = useAdminOutletContext()
  const me = ctx?.me

  const [detail, setDetail] = useState<AdminProfileDetail | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!userId) {
      setDetail(null)
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const r = await fetchAdminProfileDetail(userId)
      if (!r.success) {
        appToast(r.error, 'error')
        setDetail(null)
      } else {
        setDetail(r.data)
      }
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => {
    void load()
  }, [load])

  if (!ctx || !me) {
    return null
  }

  return (
    <div className="content-route-wrap admin-user-detail-page">
      <div className="content-page content-page--wide">
        <header className="content-page-header admin-user-detail-header">
          <div>
            <h1>
              사용자 <span>상세</span>
            </h1>
            <p className="admin-dashboard-lead">프로필 정보를 확인합니다.</p>
          </div>
          <div className="admin-user-detail-header-actions">
            <Link to="/admin/users" className="btn-secondary admin-user-detail-back">
              목록으로
            </Link>
            {detail ? (
              <Link to={`/mypage/${detail.id}`} className="btn-secondary">
                마이페이지(서비스)
              </Link>
            ) : null}
          </div>
        </header>

        {loading ? (
          <p className="admin-users-state">불러오는 중…</p>
        ) : !detail ? (
          <p className="admin-users-state">사용자를 찾을 수 없습니다.</p>
        ) : (
          <div className="admin-user-detail-card">
            <div className="admin-user-detail-profile-head">
              {detail.profile_url ? (
                <span className="admin-user-detail-avatar" style={{ backgroundImage: `url('${detail.profile_url}')` }} />
              ) : (
                <span className="admin-user-detail-avatar admin-user-detail-avatar-fallback">
                  {(detail.nickname || '?').slice(0, 1)}
                </span>
              )}
              <div className="admin-user-detail-profile-titles">
                <p className="admin-user-detail-display-name">{detail.nickname || '—'}</p>
              </div>
            </div>

            <table className="admin-user-detail-table">
              <tbody>
                <DetailRow label="닉네임" value={detail.nickname || '—'} />
                <DetailRow label="이메일" value={detail.email || '—'} />
                <DetailRow label="역할" value={roleLabel(detail.role)} />
                <DetailRow label="상태 메시지" value={detail.status_message.trim() ? detail.status_message : '—'} />
                <DetailRow label="레벨" value={String(detail.level)} />
                <DetailRow label="누적 EXP" value={detail.total_exp.toLocaleString('ko-KR')} />
                <DetailRow label="프로필 이미지" value={detail.profile_url ? '등록됨' : '—'} />
                <DetailRow label="가입일(생성)" value={formatDt(detail.created_at)} />
                <DetailRow label="최종 수정" value={formatDt(detail.updated_at)} />
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
