import { useEffect, useState } from 'react'
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
import {
  isParticipationEnded,
  type LifecycleFilter,
} from '../../features/participation/participationLifecycle'
import { ParticipationLifecycleBadge } from '../participation/ParticipationLifecycleBadge'
import { ParticipationLifecycleMetricGrid } from '../participation/ParticipationLifecycleMetricGrid'
import { TableActionDropdown, type TableActionMenuItem } from '../common/TableActionDropdown'
import {
  formatParticipationDateFull,
  formatParticipationDateTable,
  participationDateIso,
} from '../../features/participation/participationDates'
import { onParticipationTableRowClick } from '../../features/participation/participationTableRowClick'
import { TableEllipsis, TableEllipsisButton } from '../common/TableEllipsis'

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
  const [lifecycleFilter, setLifecycleFilter] = useState<LifecycleFilter>('all')
  const [titleInput, setTitleInput] = useState('')
  const [titleSearch, setTitleSearch] = useState('')
  const [page, setPage] = useState(1)
  const [rows, setRows] = useState<ParticipationRow[]>([])
  const [total, setTotal] = useState(0)
  const [lifecycleCounts, setLifecycleCounts] = useState({ ongoing: 0, ended: 0 })
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
  }, [titleSearch, detailRegistrationFilter, lifecycleFilter, filter])

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
          lifecycleFilter,
        })
        if (!cancelled) {
          setRows(j.data || [])
          setTotal(j.total ?? 0)
          setLifecycleCounts(j.lifecycleCounts ?? { ongoing: 0, ended: 0 })
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [profileId, filter, page, listVersion, detailRegistrationFilter, titleSearch, lifecycleFilter])

  const totalPages = Math.max(1, Math.ceil(total / perPage))

  const tableRowNo = (index: number) => (page - 1) * perPage + index + 1

  const participationModeLabel = (row: ParticipationRow): string => {
    if (row.status === 'pass') return '-'
    if (!row.participation_mode) return '-'
    return row.participation_mode === 'team'
      ? `팀${row.team_name ? ` ${row.team_name}` : ''}`
      : '개인'
  }

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
            행을 눌러 상대 방의 요약을 보거나, 「내 참가·패스」로 저장된 본문에서 바로 나도 참가·패스할 수 있습니다.
          </span>
        )}
      </div>
      <ParticipationLifecycleMetricGrid
        ongoing={lifecycleCounts.ongoing}
        ended={lifecycleCounts.ended}
        activeFilter={lifecycleFilter}
        onFilter={(f) => {
          setLifecycleFilter(f)
          setPage(1)
        }}
        hint="참가 공모전만 집계합니다. 패스는 제외됩니다."
      />
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
                if (f !== 'participate' && detailRegistrationFilter !== 'all') {
                  setDetailRegistrationFilter('all')
                }
              }}
            >
              {f === 'all' ? '전체' : f === 'participate' ? '참가만 보기' : '패스만 보기'}
            </button>
          ))}
        </div>
      </div>
      <div className="participation-subfilter-row">
        {isOwnProfile && (
          <>
            <label className="participation-detail-only-label">
              <input
                type="checkbox"
                className="participation-detail-only-check"
                checked={detailRegistrationFilter === 'detail'}
                onChange={(e) => {
                  if (e.target.checked) {
                    setDetailRegistrationFilter('detail')
                    if (filter !== 'participate') {
                      setFilter('participate')
                      setPage(1)
                    }
                  } else {
                    setDetailRegistrationFilter('all')
                  }
                }}
              />
              <span>상세등록만</span>
            </label>
            <label className="participation-detail-only-label">
              <input
                type="checkbox"
                className="participation-detail-only-check"
                checked={detailRegistrationFilter === 'nodetail'}
                onChange={(e) => {
                  if (e.target.checked) {
                    setDetailRegistrationFilter('nodetail')
                    if (filter !== 'participate') {
                      setFilter('participate')
                      setPage(1)
                    }
                  } else {
                    setDetailRegistrationFilter('all')
                  }
                }}
              />
              <span>미등록만</span>
            </label>
          </>
        )}
        <div className="participation-lifecycle-filter" role="group" aria-label="진행 상태 필터">
          <span className="participation-lifecycle-filter-label">진행 상태</span>
          {(
            [
              ['all', '전체'],
              ['ongoing', '진행중'],
              ['ended', '종료'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={
                'participation-filter-btn participation-lifecycle-filter-btn' +
                (lifecycleFilter === value ? ' active' : '')
              }
              onClick={() => {
                setLifecycleFilter(value)
                setPage(1)
              }}
            >
              {label}
            </button>
          ))}
        </div>
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
      <div className="participation-table-wrap" id="participationList">
        <table className="participation-table">
          <colgroup>
            <col className="participation-col-no" />
            <col className="participation-col-lifecycle" />
            <col className="participation-col-type" />
            <col className="participation-col-title" />
            <col className="participation-col-meta" />
            <col className="participation-col-date" />
            <col className="participation-col-date" />
            <col className="participation-col-date" />
            <col className="participation-col-mode" />
            <col className="participation-col-detail" />
            <col className="participation-col-status" />
            <col className="participation-col-actions" />
          </colgroup>
          <thead>
            <tr>
              <th scope="col" className="participation-table-no-col">
                No
              </th>
              <th scope="col">진행</th>
              <th scope="col">구분</th>
              <th scope="col">공모전</th>
              <th scope="col">D-day · 주최</th>
              <th scope="col">지원일</th>
              <th scope="col">제출일</th>
              <th scope="col">결과 발표</th>
              <th scope="col">모드</th>
              <th scope="col">상세등록</th>
              <th scope="col">지원·심사</th>
              <th scope="col">비고·링크</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={12} className="participation-list-msg">
                  불러오는 중...
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={12} className="participation-list-msg">
                  {detailRegistrationFilter === 'detail'
                    ? '상세 등록된 공모전이 없습니다. 비고·링크 메뉴의 「상세」 버튼으로 등록할 수 있습니다.'
                    : detailRegistrationFilter === 'nodetail'
                      ? '미등록 공모전이 없습니다.'
                      : '목록이 없습니다.'}
                </td>
              </tr>
            ) : (
              rows.map((row, i) => {
                const src = String(row.source || '')
                const cid = String(row.contest_id || '')
                const hasDetail = !!row.has_detail
                const rowKey = `${src}:${cid}`
                const statusLine = [row.participation_status, row.award_status ? `수상: ${row.award_status}` : null]
                  .filter(Boolean)
                  .join(' · ')
                const actionItems: TableActionMenuItem[] = [
                  { kind: 'button', label: '요약', onClick: () => openViewForRow(row) },
                ]
                if (isOwnProfile && src && cid) {
                  actionItems.push(
                    {
                      kind: 'button',
                      label: '상세',
                      disabled: deletingKey === rowKey,
                      onClick: () =>
                        setDetailCtx({
                          profileUserId: profileId,
                          source: src,
                          contestId: cid,
                          title: row.title || '',
                          rev: Date.now(),
                        }),
                    },
                    {
                      kind: 'button',
                      label: deletingKey === rowKey ? '삭제 중…' : '삭제',
                      danger: true,
                      disabled: deletingKey === rowKey,
                      onClick: async () => {
                        const ok = await confirm({
                          title: '참가·패스',
                          message:
                            '이 공모전의 참가/패스 기록을 삭제할까요? 등록한 참가 상세도 함께 지워집니다.',
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
                      },
                    },
                  )
                } else if (!isOwnProfile && src && cid) {
                  actionItems.push({
                    kind: 'link',
                    label: '공고 열기',
                    to: contestFocusPath(src, cid),
                  })
                }
                const lifecycleEnded =
                  row.status === 'participate' &&
                  isParticipationEnded({
                    lifecycle_status: row.lifecycle_status,
                    participation_status: row.participation_status,
                    result_announcement_date: row.result_announcement_date,
                  })
                return (
                  <tr
                    key={`${row.source}-${row.contest_id}-${i}`}
                    className={
                      'participation-table-row participation-table-row--clickable' +
                      (hasDetail ? ' has-detail' : ' no-detail') +
                      (row.status === 'participate'
                        ? lifecycleEnded
                          ? ' participation-table-row--lifecycle-ended'
                          : ' participation-table-row--lifecycle-ongoing'
                        : '')
                    }
                    onClick={(e) => onParticipationTableRowClick(e, () => openViewForRow(row))}
                  >
                    <td className="participation-table-no">{tableRowNo(i)}</td>
                    <td>
                      {row.status === 'participate' ? (
                        <ParticipationLifecycleBadge
                          lifecycle_status={row.lifecycle_status}
                          participation_status={row.participation_status}
                          result_announcement_date={row.result_announcement_date}
                        />
                      ) : (
                        <span className="participation-lifecycle-badge participation-lifecycle-badge--muted">
                          -
                        </span>
                      )}
                    </td>
                    <td>
                      <span className={`participation-badge ${row.status === 'pass' ? 'pass' : 'participate'}`}>
                        {row.status === 'pass' ? '패스' : '참가'}
                      </span>
                    </td>
                    <td className="participation-table-cell-clip participation-table-title">
                      <TableEllipsisButton
                        text={row.title || ''}
                        emptyLabel="제목 없음"
                        btnClassName="participation-table-title-btn"
                        onClick={() => openViewForRow(row)}
                      />
                    </td>
                    <td className="participation-table-cell-clip participation-table-meta">
                      <TableEllipsis text={[row.d_day, row.host].filter(Boolean).join(' · ')} />
                    </td>
                    <td
                      className="participation-table-cell-clip participation-table-date"
                      data-date={participationDateIso(row.participation_registered_at) ?? ''}
                    >
                      <TableEllipsis
                        text={formatParticipationDateTable(row.participation_registered_at)}
                        title={formatParticipationDateFull(row.participation_registered_at)}
                      />
                    </td>
                    <td
                      className="participation-table-cell-clip participation-table-date"
                      data-date={participationDateIso(row.submitted_at) ?? ''}
                    >
                      <TableEllipsis
                        text={formatParticipationDateTable(row.submitted_at)}
                        title={formatParticipationDateFull(row.submitted_at)}
                      />
                    </td>
                    <td
                      className="participation-table-cell-clip participation-table-date"
                      data-date={participationDateIso(row.result_announcement_date) ?? ''}
                    >
                      <TableEllipsis
                        text={formatParticipationDateTable(row.result_announcement_date)}
                        title={formatParticipationDateFull(row.result_announcement_date)}
                      />
                    </td>
                    <td className="participation-table-cell-clip">
                      <TableEllipsis text={participationModeLabel(row)} />
                    </td>
                    <td>
                      {hasDetail ? (
                        <span className="participation-detail-badge registered">등록</span>
                      ) : (
                        <span className="participation-detail-badge unregistered">미등록</span>
                      )}
                    </td>
                    <td className="participation-table-cell-clip">
                      <TableEllipsis text={statusLine} />
                    </td>
                    <td className="participation-table-actions">
                      <TableActionDropdown items={actionItems} disabled={deletingKey === rowKey} />
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
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
