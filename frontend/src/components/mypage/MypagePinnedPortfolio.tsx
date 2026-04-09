import { useEffect, useState } from 'react'
import {
  HiChevronLeft,
  HiChevronRight,
  HiPencilSquare,
  HiPlus,
  HiTrash,
  HiXMark,
} from 'react-icons/hi2'
import { useConfirm } from '../../context/ConfirmContext'
import { appToast } from '../../lib/appToast'
import {
  addRepresentativeWork,
  deleteRepresentativeWork,
  fetchRepWorkEligibleParticipations,
  reorderRepresentativeWorks,
  updateRepresentativeWork,
  type RepWorkEligibleRow,
} from '../../services/profileMutations'
import type { MypageSnapshotData } from '../../types/mypage'

type Work = MypageSnapshotData['representative_works'][number]

type Props = {
  data: MypageSnapshotData
  onChanged: () => void
}

const AWARD_OPTS = ['', '대상', '최우수상', '우수상'] as const

export function MypagePinnedPortfolio({ data, onChanged }: Props) {
  const confirm = useConfirm()
  const { representative_works, is_own_profile, profile } = data
  const works = [...(representative_works || [])].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
  const canAdd = is_own_profile && works.length < 3

  const [addOpen, setAddOpen] = useState(false)
  const [addStep, setAddStep] = useState<'pick' | 'form'>('pick')
  const [eligible, setEligible] = useState<RepWorkEligibleRow[]>([])
  const [pickRow, setPickRow] = useState<RepWorkEligibleRow | null>(null)
  const [addAward, setAddAward] = useState('')
  const [addResult, setAddResult] = useState('')
  const [addFile, setAddFile] = useState<File | null>(null)

  const [editItem, setEditItem] = useState<Work | null>(null)
  const [editAward, setEditAward] = useState('')
  const [editResult, setEditResult] = useState('')
  const [editFile, setEditFile] = useState<File | null>(null)

  useEffect(() => {
    if (!addOpen || addStep !== 'pick') return
    void (async () => {
      const rows = await fetchRepWorkEligibleParticipations()
      setEligible(rows)
    })()
  }, [addOpen, addStep])

  const resetAdd = () => {
    setAddStep('pick')
    setPickRow(null)
    setAddAward('')
    setAddResult('')
    setAddFile(null)
    setEligible([])
  }

  const closeAdd = () => {
    setAddOpen(false)
    resetAdd()
  }

  const submitAdd = async () => {
    if (!pickRow) return
    const r = await addRepresentativeWork({
      source: pickRow.source,
      contestId: pickRow.contest_id,
      awardStatus: addAward || undefined,
      resultAnnouncementMethod: addResult || undefined,
      file: addFile,
    })
    if (!r.success) {
      appToast(r.error || '오류', 'error')
      return
    }
    appToast('대표작이 추가되었습니다.')
    closeAdd()
    onChanged()
  }

  const openEdit = (item: Work) => {
    setEditItem(item)
    setEditAward(item.award_status || '')
    setEditResult(item.result_announcement_method || '')
    setEditFile(null)
  }

  const submitEdit = async () => {
    if (!editItem) return
    const r = await updateRepresentativeWork({
      source: editItem.source,
      contestId: editItem.contest_id,
      awardStatus: editAward,
      resultAnnouncementMethod: editResult,
      file: editFile,
    })
    if (!r.success) {
      appToast(r.error || '오류', 'error')
      return
    }
    appToast('수정되었습니다.')
    setEditItem(null)
    onChanged()
  }

  const moveWork = async (index: number, dir: -1 | 1) => {
    const j = index + dir
    if (j < 0 || j >= works.length) return
    const order = [...works]
    const tmp = order[index]
    order[index] = order[j]
    order[j] = tmp
    const r = await reorderRepresentativeWorks(order.map((w) => ({ source: w.source, contest_id: w.contest_id })))
    if (!r.success) {
      appToast(r.error || '오류', 'error')
      return
    }
    onChanged()
  }

  return (
    <>
      <section
        className="pinned-portfolio-section"
        id="representativeWorksSection"
        data-user-id={profile.id}
        data-own-profile={is_own_profile ? '1' : '0'}
      >
        <h3>대표 작품</h3>
        <div className="pinned-cards" id="representativeWorksCards">
          {works.map((item, idx) => (
            <div key={`${item.source}-${item.contest_id}`} className="pinned-card-wrap">
              <a
                href={item.url || '#'}
                className={'pinned-card' + (!item.image_path ? ' pinned-card-placeholder' : '')}
                target="_blank"
                rel="noreferrer"
                data-source={item.source}
                data-contest-id={item.contest_id}
              >
                <div
                  className="pinned-card-thumb"
                  style={item.image_path ? { backgroundImage: `url('${item.image_path}')` } : undefined}
                >
                  {!item.image_path ? <span className="pinned-card-thumb-no-image">대표이미지가 없습니다</span> : null}
                  <span className="pinned-card-badge">{item.award_status || '수상'}</span>
                </div>
                <div className="pinned-card-title">{item.title || '작품 제목'}</div>
              </a>
              {item.result_announcement_method ? (
                <div className="pinned-card-result-method">결과발표: {item.result_announcement_method}</div>
              ) : null}
              {is_own_profile ? (
                <div className="pinned-card-actions">
                  {works.length > 1 ? (
                    <>
                      <button
                        type="button"
                        className="pinned-card-move"
                        title="왼쪽으로"
                        disabled={idx === 0}
                        onClick={() => moveWork(idx, -1)}
                      >
                        <HiChevronLeft className="pinned-card-move-ico" aria-hidden />
                      </button>
                      <button
                        type="button"
                        className="pinned-card-move"
                        title="오른쪽으로"
                        disabled={idx === works.length - 1}
                        onClick={() => moveWork(idx, 1)}
                      >
                        <HiChevronRight className="pinned-card-move-ico" aria-hidden />
                      </button>
                    </>
                  ) : null}
                  <button type="button" className="pinned-card-edit" title="수정" onClick={() => openEdit(item)}>
                    <HiPencilSquare className="pinned-card-action-ico" aria-hidden />
                    <span className="btn-label">수정</span>
                  </button>
                  <button
                    type="button"
                    className="pinned-card-del"
                    title="삭제"
                    onClick={async () => {
                      const ok = await confirm({
                        title: '대표 작품',
                        message: `「${item.title || '작품'}」을 대표 작품에서 삭제할까요?`,
                        confirmText: '삭제',
                        danger: true,
                      })
                      if (!ok) return
                      const r = await deleteRepresentativeWork(item.source, item.contest_id)
                      if (!r.success) {
                        appToast(r.error || '오류', 'error')
                        return
                      }
                      onChanged()
                    }}
                  >
                    <HiTrash className="pinned-card-action-ico" aria-hidden />
                    <span className="btn-label">삭제</span>
                  </button>
                </div>
              ) : null}
            </div>
          ))}
          {canAdd ? (
            <button
              type="button"
              className="pinned-card pinned-card-add"
              title="대표작 추가"
              onClick={() => {
                resetAdd()
                setAddOpen(true)
              }}
            >
              <div className="pinned-card-thumb pinned-card-add-thumb">
                <HiPlus className="pinned-card-add-ico" aria-hidden />
              </div>
              <div className="pinned-card-title">추가하기</div>
            </button>
          ) : null}
        </div>
        {!works.length && is_own_profile ? (
          <p className="pinned-empty-hint" style={{ color: 'var(--gray-muted)', fontSize: '0.9rem', padding: '8px 0' }}>
            참가한 공모전 중에서 대표작을 골라 추가해 보세요.
          </p>
        ) : null}
        {!works.length && !is_own_profile ? (
          <p className="pinned-empty-hint" style={{ color: 'var(--gray-muted)', fontSize: '0.9rem', padding: 16 }}>
            대표 작품이 없습니다.
          </p>
        ) : null}
      </section>

      {addOpen ? (
        <div
          className="modal-overlay active"
          role="presentation"
        >
          <div className="modal-box modal-add-representative" role="dialog" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h4>대표작 추가</h4>
              <button type="button" className="modal-close" aria-label="닫기" onClick={closeAdd}>
                <HiXMark className="modal-close-ico" aria-hidden />
              </button>
            </div>
            <div className="modal-body">
              {addStep === 'pick' ? (
                <>
                  <p className="representative-modal-desc">참가한 공모전을 선택하세요.</p>
                  <div className="representative-add-list" style={{ maxHeight: 280, overflowY: 'auto' }}>
                    {eligible.length === 0 ? (
                      <p style={{ color: 'var(--gray-muted)' }}>추가할 수 있는 공모전이 없습니다.</p>
                    ) : (
                      eligible.map((r) => (
                        <button
                          key={`${r.source}-${r.contest_id}`}
                          type="button"
                          className="participation-detail-btn"
                          style={{ display: 'block', width: '100%', marginBottom: 8, textAlign: 'left' }}
                          onClick={() => {
                            setPickRow(r)
                            setAddStep('form')
                          }}
                        >
                          {r.title}
                        </button>
                      ))
                    )}
                  </div>
                </>
              ) : (
                <>
                  <p className="representative-form-title">{pickRow?.title}</p>
                  <div className="form-group">
                    <label>수상 등급</label>
                    <select className="form-control" value={addAward} onChange={(e) => setAddAward(e.target.value)}>
                      {AWARD_OPTS.map((o) => (
                        <option key={o || 'x'} value={o}>
                          {o || '수상을 선택해주세요'}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>결과 발표 (경로)</label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="예: 문자, SNS, 홈페이지, 전화통보, 이메일 등"
                      value={addResult}
                      onChange={(e) => setAddResult(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label>대표 이미지</label>
                    <input type="file" accept="image/*" className="rep-file-input" onChange={(e) => setAddFile(e.target.files?.[0] || null)} />
                  </div>
                  <div className="rep-form-actions">
                    <button type="button" className="btn-outline" onClick={() => setAddStep('pick')}>
                      뒤로
                    </button>
                    <button type="button" className="btn-primary" onClick={() => void submitAdd()}>
                      추가
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {editItem ? (
        <div
          className="modal-overlay active"
          role="presentation"
        >
          <div className="modal-box modal-edit-representative" role="dialog" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h4>대표작 수정</h4>
              <button type="button" className="modal-close" aria-label="닫기" onClick={() => setEditItem(null)}>
                <HiXMark className="modal-close-ico" aria-hidden />
              </button>
            </div>
            <div className="modal-body">
              <p style={{ fontWeight: 600, marginBottom: 12 }}>{editItem.title}</p>
              <div className="form-group">
                <label>수상 등급</label>
                <select className="form-control" value={editAward} onChange={(e) => setEditAward(e.target.value)}>
                  {AWARD_OPTS.map((o) => (
                    <option key={o || 'x'} value={o}>
                      {o || '수상을 선택해주세요'}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>결과 발표 (경로)</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="예: 문자, SNS, 홈페이지, 전화통보, 이메일 등"
                  value={editResult}
                  onChange={(e) => setEditResult(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label>대표 이미지</label>
                <div
                  className="edit-image-preview"
                  style={
                    editItem.image_path
                      ? {
                          minHeight: 120,
                          backgroundImage: `url('${editItem.image_path}')`,
                          backgroundSize: 'contain',
                          backgroundPosition: 'center',
                          backgroundRepeat: 'no-repeat',
                        }
                      : { minHeight: 40 }
                  }
                />
                <input type="file" accept="image/*" className="rep-file-input" onChange={(e) => setEditFile(e.target.files?.[0] || null)} />
              </div>
              <div className="rep-form-actions">
                <button type="button" className="btn-primary" onClick={() => void submitEdit()}>
                  저장
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
