import { useCallback, useEffect, useMemo, useState } from 'react'
import { HiXMark } from 'react-icons/hi2'
import { useConfirm } from '../context/ConfirmContext'
import { useAdminOutletContext } from '../components/admin/adminLayoutContext'
import { appToast } from '../lib/appToast'
import {
  deleteHashtagMaster,
  fetchHashtagMasterForAdmin,
  insertHashtagMaster,
  updateHashtagMaster,
  type HashtagMasterRow,
} from '../services/adminHashtagService'

export function AdminHashtagsPage() {
  const ctx = useAdminOutletContext()
  const confirm = useConfirm()

  const [rows, setRows] = useState<HashtagMasterRow[]>([])
  const [loading, setLoading] = useState(true)

  const [formOpen, setFormOpen] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [formTag, setFormTag] = useState('')
  const [formCategory, setFormCategory] = useState('')
  const [formSort, setFormSort] = useState('0')
  const [formBusy, setFormBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetchHashtagMasterForAdmin()
      if (!r.ok) {
        appToast(r.error, 'error')
        setRows([])
      } else {
        setRows(r.rows)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const categoryOptions = useMemo(() => {
    const s = new Set<string>()
    for (const r of rows) {
      if (r.category.trim()) s.add(r.category.trim())
    }
    s.add('기술·개발력 중심')
    s.add('문제해결력')
    s.add('데이터 특화')
    s.add('창의성')
    s.add('밈')
    return [...s].sort((a, b) => a.localeCompare(b, 'ko'))
  }, [rows])

  const openNew = () => {
    setEditId(null)
    setFormTag('')
    setFormCategory('기술·개발력 중심')
    const nextSort = rows.length ? Math.max(...rows.map((r) => r.sort_order)) + 1 : 1
    setFormSort(String(nextSort))
    setFormOpen(true)
  }

  const openEdit = (r: HashtagMasterRow) => {
    setEditId(r.id)
    setFormTag(r.tag_name)
    setFormCategory(r.category)
    setFormSort(String(r.sort_order))
    setFormOpen(true)
  }

  const submitForm = async () => {
    const sortNum = Number(formSort)
    if (!Number.isFinite(sortNum)) {
      appToast('정렬 순서는 숫자로 입력하세요.', 'error')
      return
    }
    setFormBusy(true)
    try {
      if (editId != null) {
        const r = await updateHashtagMaster(editId, {
          tag_name: formTag,
          category: formCategory,
          sort_order: sortNum,
        })
        if (!r.ok) {
          appToast(r.error, 'error')
          return
        }
        appToast('수정했습니다.')
      } else {
        const r = await insertHashtagMaster({
          tag_name: formTag,
          category: formCategory,
          sort_order: sortNum,
        })
        if (!r.ok) {
          appToast(r.error, 'error')
          return
        }
        appToast('등록했습니다.')
      }
      setFormOpen(false)
      void load()
    } finally {
      setFormBusy(false)
    }
  }

  const onDelete = async (r: HashtagMasterRow) => {
    const ok = await confirm({
      title: '해시태그 삭제',
      message: `「${r.tag_name}」을(를) 삭제할까요? 이 태그를 고른 회원의 선택에서도 제거됩니다.`,
      confirmText: '삭제',
      danger: true,
    })
    if (!ok) return
    const res = await deleteHashtagMaster(r.id)
    if (!res.ok) {
      appToast(res.error, 'error')
      return
    }
    appToast('삭제했습니다.')
    void load()
  }

  if (!ctx?.me) {
    return null
  }

  return (
    <div className="content-route-wrap admin-hashtags-page">
      <div className="content-page content-page--wide">
        <header className="content-page-header admin-users-header">
          <div>
            <h1>
              해시태그 <span>관리</span>
            </h1>
            <p className="admin-dashboard-lead">
              프로필에서 회원이 고를 수 있는 태그 목록입니다. 이름은 서비스 내에서 <strong>#태그명</strong>으로 표시됩니다. (#은 입력하지 않아도 됩니다)
            </p>
          </div>
          <div className="admin-notices-header-actions">
            <button type="button" className="btn-secondary" onClick={() => void load()} disabled={loading}>
              새로고침
            </button>
            <button type="button" className="btn-write" onClick={openNew}>
              새 해시태그
            </button>
          </div>
        </header>

        <div className="admin-users-table-wrap">
          {loading ? (
            <p className="admin-users-state">불러오는 중…</p>
          ) : rows.length === 0 ? (
            <p className="admin-users-state">등록된 해시태그가 없습니다.</p>
          ) : (
            <table className="admin-users-table admin-hashtags-table">
              <thead>
                <tr>
                  <th scope="col" className="admin-users-col-no">
                    No
                  </th>
                  <th scope="col">태그</th>
                  <th scope="col">카테고리</th>
                  <th scope="col" className="admin-exp-col-num">
                    정렬
                  </th>
                  <th scope="col">작업</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, index) => (
                  <tr key={r.id}>
                    <td className="admin-users-col-no">{index + 1}</td>
                    <td>
                      <span className="admin-hashtag-name">#{r.tag_name}</span>
                    </td>
                    <td>{r.category}</td>
                    <td className="admin-exp-col-num">{r.sort_order}</td>
                    <td>
                      <div className="admin-notices-row-actions">
                        <button type="button" className="btn-secondary" onClick={() => openEdit(r)}>
                          수정
                        </button>
                        <button type="button" className="btn-secondary btn-delete" onClick={() => void onDelete(r)}>
                          삭제
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {formOpen ? (
        <div className="cp-modal-overlay" role="presentation">
          <div className="cp-modal">
            <div className="cp-modal-header">
              <h2>{editId != null ? '해시태그 수정' : '해시태그 등록'}</h2>
              <button type="button" className="cp-modal-close" aria-label="닫기" onClick={() => setFormOpen(false)}>
                <HiXMark className="cp-modal-close-ico" aria-hidden />
              </button>
            </div>
            <div className="cp-modal-body">
              <div className="cp-form-group">
                <label htmlFor="admin-hashtag-tag">태그 이름 *</label>
                <input
                  id="admin-hashtag-tag"
                  value={formTag}
                  onChange={(e) => setFormTag(e.target.value.replace(/^#+/, ''))}
                  placeholder="예: 개발마스터"
                  autoComplete="off"
                />
              </div>
              <div className="cp-form-group">
                <label htmlFor="admin-hashtag-cat">카테고리 *</label>
                <input
                  id="admin-hashtag-cat"
                  list="admin-hashtag-cat-list"
                  value={formCategory}
                  onChange={(e) => setFormCategory(e.target.value)}
                  placeholder="카테고리"
                />
                <datalist id="admin-hashtag-cat-list">
                  {categoryOptions.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </div>
              <div className="cp-form-group">
                <label htmlFor="admin-hashtag-sort">정렬 순서 (낮을수록 먼저)</label>
                <input
                  id="admin-hashtag-sort"
                  type="number"
                  value={formSort}
                  onChange={(e) => setFormSort(e.target.value)}
                />
              </div>
            </div>
            <div className="cp-modal-footer">
              <button type="button" className="btn-secondary" onClick={() => setFormOpen(false)} disabled={formBusy}>
                취소
              </button>
              <button type="button" className="btn-write" onClick={() => void submitForm()} disabled={formBusy}>
                {formBusy ? '처리 중…' : editId != null ? '저장' : '등록'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
