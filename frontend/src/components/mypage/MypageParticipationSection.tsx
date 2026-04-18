import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useConfirm } from '../../context/ConfirmContext'
import { contestFocusPath } from '../../features/contests/contestTypes'
import { appToast } from '../../lib/appToast'
import { deleteContestParticipation } from '../../services/contestService'
import {
  fetchUserParticipationPage,
  type ParticipationRow,
} from '../../services/userParticipationList'
import {
  MypageParticipationDetailModal,
  type ParticipationDetailModalCtx,
} from './MypageParticipationDetailModal'
import {
  MypageParticipationDetailViewModal,
  type ParticipationDetailViewCtx,
} from './MypageParticipationDetailViewModal'

type Props = {
  profileId: string
  isOwnProfile: boolean
}

export function MypageParticipationSection({ profileId, isOwnProfile }: Props) {
  const confirm = useConfirm()
  const [filter, setFilter] = useState<'all' | 'participate' | 'pass'>('all')
  const [detailRegistrationFilter, setDetailRegistrationFilter] = useState<
    'all' | 'detail' | 'nodetail'
  >('all')
  const [titleInput, setTitleInput] = useState('')
  const [titleSearch, setTitleSearch] = useState('')
  const [page, setPage] = useState(1)
  const [rows, setRows] = useState<ParticipationRow[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [listVersion, setListVersion] = useState(0)
  const [detailCtx, setDetailCtx] = useState<ParticipationDetailModalCtx | null>(null)
  const [viewCtx, setViewCtx] = useState<ParticipationDetailViewCtx | null>(null)
  const [deletingKey, setDeletingKey] = useState<string | null>(null)
  const perPage = 5

  useEffect(() => {
    const t = window.setTimeout(() => setTitleSearch(titleInput.trim()), 280)
    return () => window.clearTimeout(t)
  }, [titleInput])

  useEffect(() => {
    setPage(1)
  }, [titleSearch, detailRegistrationFilter])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const j = await fetchUserParticipationPage({
          profileId,
          page,
          perPage,
          filter: filter === 'all' ? 'all' : filter,
          detailOnly: detailRegistrationFilter === 'detail',
          noDetailOnly: detailRegistrationFilter === 'nodetail',
          titleSearch: titleSearch || undefined,
        })
        if (!cancelled) {
          setRows(j.data || [])
          setTotal(j.total ?? 0)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [profileId, filter, page, listVersion, detailRegistrationFilter, titleSearch])

  const totalPages = Math.max(1, Math.ceil(total / perPage))

  const bumpList = () => setListVersion((v) => v + 1)

  const openViewForRow = (row: ParticipationRow) => {
    const src = String(row.source || '')
    const cid = String(row.contest_id || '')
    if (!src || !cid) return
    setViewCtx({
      profileUserId: profileId,
      source: src,
      contestId: cid,
      title: row.title || '',
      contestUrl: String(row.url || ''),
      metaLine: [row.d_day, row.host].filter(Boolean).join(' · '),
      hasDetail: !!row.has_detail,
      rev: Date.now(),
    })
  }

  return (
    <section className="participation-section" id="participationSection" data-user-id={profileId} data-own-profile={isOwnProfile ? '1' : '0'}>
      <div className="participation-section-header">
        <h3>참가 / 패스 공모전</h3>
        {isOwnProfile ? (
          <span className="participation-section-hint">해당 목록의 상세 정보를 입력해보세요!</span>
        ) : (
          <span className="participation-section-hint">
            카드를 눌러 상대 방의 요약을 보거나, 「내 참가·패스」로 저장된 본문에서 바로 나도 참가·패스할 수 있습니다.
          </span>
        )}
      </div>
      <div className="participation-filter-row">
        <div className="participation-filter">
          {(['all', 'participate', 'pass'] as const).map((f) => (
            <button
              key={f}
              type="button"
              className={'participation-filter-btn' + (filter === f ? ' active' : '')}
              onClick={() => {
                setFilter(f)
                setPage(1)
              }}
            >
              {f === 'all' ? '전체' : f === 'participate' ? '참가만 보기' : '패스만 보기'}
            </button>
          ))}
        </div>
      </div>
      <div className="participation-subfilter-row">
        <label className="participation-detail-only-label">
          <input
            type="checkbox"
            className="participation-detail-only-check"
            checked={detailRegistrationFilter === 'detail'}
            onChange={(e) =>
              setDetailRegistrationFilter(e.target.checked ? 'detail' : 'all')
            }
          />
          <span>상세등록만</span>
        </label>
        <label className="participation-detail-only-label">
          <input
            type="checkbox"
            className="participation-detail-only-check"
            checked={detailRegistrationFilter === 'nodetail'}
            onChange={(e) =>
              setDetailRegistrationFilter(e.target.checked ? 'nodetail' : 'all')
            }
          />
          <span>미등록만</span>
        </label>
        <div className="participation-title-search-wrap">
          <label className="participation-title-search-label" htmlFor="participation-title-search-input">
            제목 검색
          </label>
          <input
            id="participation-title-search-input"
            type="search"
            className="participation-title-search-input"
            placeholder="공모전 제목"
            value={titleInput}
            onChange={(e) => setTitleInput(e.target.value)}
            autoComplete="off"
            enterKeyHint="search"
          />
        </div>
      </div>
      <div className="participation-list" id="participationList">
        {loading ? (
          <div className="participation-list-msg">불러오는 중...</div>
        ) : rows.length === 0 ? (
          <div className="participation-list-msg">목록이 없습니다.</div>
        ) : (
          rows.map((row, i) => {
            const src = String(row.source || '')
            const cid = String(row.contest_id || '')
            const hasDetail = !!row.has_detail
            const detailItems: string[] = []
            if (row.participation_status) detailItems.push(`지원·심사: ${row.participation_status}`)
            if (row.award_status) detailItems.push(`수상: ${row.award_status}`)
            return (
              <div
                key={`${row.source}-${row.contest_id}-${i}`}
                className={'participation-item-wrap' + (hasDetail ? ' has-detail' : ' no-detail')}
              >
                <div
                  className="participation-content is-clickable"
                  role="button"
                  tabIndex={0}
                  onClick={() => openViewForRow(row)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      openViewForRow(row)
                    }
                  }}
                >
                  <span className={`participation-badge ${row.status === 'pass' ? 'pass' : 'participate'}`}>
                    {row.status === 'pass' ? '패스' : '참가'}
                  </span>
                  {row.status === 'participate' && row.participation_mode ? (
                    <span className="participation-mode-text">
                      {row.participation_mode === 'team' ? ` · 팀${row.team_name ? ` ${row.team_name}` : ''}` : ' · 개인'}
                    </span>
                  ) : null}
                  {hasDetail ? (
                    <span className="participation-detail-badge registered">상세등록</span>
                  ) : (
                    <span className="participation-detail-badge unregistered">미등록</span>
                  )}
                  <div className="participation-info">
                    <div className="participation-title">
                      <span className="participation-title-text">{row.title || '제목 없음'}</span>
                    </div>
                    <div className="participation-meta">{[row.d_day, row.host].filter(Boolean).join(' · ')}</div>
                    {detailItems.length > 0 ? (
                      <div className="participation-card-detail">{detailItems.join(' \u00a0|\u00a0 ')}</div>
                    ) : null}
                    {!isOwnProfile && src && cid ? (
                      <div className="participation-open-self-wrap">
                        <Link
                          to={contestFocusPath(src, cid)}
                          className="participation-open-self-link"
                          onClick={(e) => e.stopPropagation()}
                          onKeyDown={(e) => e.stopPropagation()}
                        >
                          내 계정으로 이 공고 열기 (본문·참가/패스)
                        </Link>
                      </div>
                    ) : null}
                  </div>
                </div>
                {isOwnProfile && src && cid ? (
                  <div className="participation-item-actions">
                    <button
                      type="button"
                      className="participation-detail-btn"
                      disabled={deletingKey === `${src}:${cid}`}
                      onClick={(e) => {
                        e.stopPropagation()
                        setDetailCtx({
                          profileUserId: profileId,
                          source: src,
                          contestId: cid,
                          title: row.title || '',
                          rev: Date.now(),
                        })
                      }}
                    >
                      상세
                    </button>
                    <button
                      type="button"
                      className="participation-delete-btn"
                      disabled={deletingKey === `${src}:${cid}`}
                      onClick={async (e) => {
                        e.stopPropagation()
                        const rowKey = `${src}:${cid}`
                        const ok = await confirm({
                          title: '참가·패스',
                          message: '이 공모전의 참가/패스 기록을 삭제할까요? 등록한 참가 상세도 함께 지워집니다.',
                          confirmText: '삭제',
                          danger: true,
                        })
                        if (!ok) return
                        setDeletingKey(rowKey)
                        try {
                          const j = await deleteContestParticipation(src, cid)
                          if (!j.success) {
                            appToast(j.error || '삭제에 실패했습니다.', 'error')
                            return
                          }
                          appToast('참가/패스 기록을 삭제했습니다.')
                          bumpList()
                          setDetailCtx((prev) =>
                            prev?.source === src && prev?.contestId === cid ? null : prev,
                          )
                          setViewCtx((prev) =>
                            prev?.source === src && prev?.contestId === cid ? null : prev,
                          )
                        } finally {
                          setDeletingKey(null)
                        }
                      }}
                    >
                      {deletingKey === `${src}:${cid}` ? '삭제 중…' : '삭제'}
                    </button>
                  </div>
                ) : null}
              </div>
            )
          })
        )}
      </div>
      {totalPages > 1 ? (
        <div className="participation-pagination">
          <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            이전
          </button>
          <span className="participation-page-indicator">
            {page} / {totalPages}
          </span>
          <button type="button" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
            다음
          </button>
        </div>
      ) : null}
      <MypageParticipationDetailViewModal ctx={viewCtx} onClose={() => setViewCtx(null)} />
      <MypageParticipationDetailModal
        ctx={detailCtx}
        onClose={() => setDetailCtx(null)}
        onSaved={bumpList}
      />
    </section>
  )
}
