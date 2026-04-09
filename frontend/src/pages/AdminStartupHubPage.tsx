import { useCallback, useEffect, useState } from 'react'
import { HiXMark } from 'react-icons/hi2'
import { useConfirm } from '../context/ConfirmContext'
import { useAdminOutletContext } from '../components/admin/adminLayoutContext'
import { PaginationBar } from '../components/common/PaginationBar'
import { appToast } from '../lib/appToast'
import {
  deleteStartupAnnouncement,
  deleteStartupBusiness,
  fetchKstartupCrawlState,
  fetchStartupAnnouncementAdminPage,
  fetchStartupBusinessAdminPage,
  updateKstartupCrawlState,
  updateStartupAnnouncement,
  updateStartupBusiness,
  type KstartupCrawlStateRow,
} from '../services/adminStartupHubService'

const PAGE_SIZE = 20

type Tab = 'business' | 'announcement' | 'crawl'

function str(v: unknown): string {
  return v == null ? '' : String(v)
}

export function AdminStartupHubPage() {
  const ctx = useAdminOutletContext()
  const confirm = useConfirm()
  const [tab, setTab] = useState<Tab>('business')

  const [bizRows, setBizRows] = useState<Record<string, unknown>[]>([])
  const [bizTotal, setBizTotal] = useState(0)
  const [bizPage, setBizPage] = useState(1)
  const [bizQ, setBizQ] = useState('')
  const [bizSearch, setBizSearch] = useState('')
  const [annRows, setAnnRows] = useState<Record<string, unknown>[]>([])
  const [annTotal, setAnnTotal] = useState(0)
  const [annPage, setAnnPage] = useState(1)
  const [annQ, setAnnQ] = useState('')
  const [annSearch, setAnnSearch] = useState('')

  const [loading, setLoading] = useState(true)
  const [crawl, setCrawl] = useState<KstartupCrawlStateRow | null>(null)
  const [crawlBiz, setCrawlBiz] = useState('1')
  const [crawlAnn, setCrawlAnn] = useState('1')
  const [crawlBusy, setCrawlBusy] = useState(false)

  const [bizEdit, setBizEdit] = useState<Record<string, unknown> | null>(null)
  const [annEdit, setAnnEdit] = useState<Record<string, unknown> | null>(null)

  const loadBiz = useCallback(async () => {
    const r = await fetchStartupBusinessAdminPage({ page: bizPage, pageSize: PAGE_SIZE, q: bizSearch.trim() || undefined })
    if (!r.ok) {
      appToast(r.error, 'error')
      setBizRows([])
      setBizTotal(0)
      return
    }
    setBizRows(r.rows)
    setBizTotal(r.total)
  }, [bizPage, bizSearch])

  const loadAnn = useCallback(async () => {
    const r = await fetchStartupAnnouncementAdminPage({ page: annPage, pageSize: PAGE_SIZE, q: annSearch.trim() || undefined })
    if (!r.ok) {
      appToast(r.error, 'error')
      setAnnRows([])
      setAnnTotal(0)
      return
    }
    setAnnRows(r.rows)
    setAnnTotal(r.total)
  }, [annPage, annSearch])

  const loadCrawl = useCallback(async () => {
    const r = await fetchKstartupCrawlState()
    if (!r.ok) {
      appToast(r.error, 'error')
      setCrawl(null)
      return
    }
    setCrawl(r.row)
    if (r.row) {
      setCrawlBiz(String(r.row.business_next_page))
      setCrawlAnn(String(r.row.announcement_next_page))
    }
  }, [])

  useEffect(() => {
    let ok = true
    ;(async () => {
      setLoading(true)
      try {
        if (tab === 'business') await loadBiz()
        else if (tab === 'announcement') await loadAnn()
        else await loadCrawl()
      } finally {
        if (ok) setLoading(false)
      }
    })()
    return () => {
      ok = false
    }
  }, [tab, loadBiz, loadAnn, loadCrawl])

  const onSaveBiz = async () => {
    if (!bizEdit) return
    const id = str(bizEdit.id)
    if (!id) return
    const patch: Record<string, string | null> = {
      supt_biz_titl_nm: str(bizEdit.supt_biz_titl_nm).trim() || null,
      biz_yr: str(bizEdit.biz_yr).trim() || null,
      biz_category_cd: str(bizEdit.biz_category_cd).trim() || null,
      detl_pg_url: str(bizEdit.detl_pg_url).trim() || null,
      biz_supt_trgt_info: str(bizEdit.biz_supt_trgt_info).trim() || null,
      biz_supt_ctnt: str(bizEdit.biz_supt_ctnt).trim() || null,
      supt_biz_intrd_info: str(bizEdit.supt_biz_intrd_info).trim() || null,
      supt_biz_chrct: str(bizEdit.supt_biz_chrct).trim() || null,
      biz_supt_bdgt_info: str(bizEdit.biz_supt_bdgt_info).trim() || null,
    }
    const r = await updateStartupBusiness(id, patch)
    if (!r.ok) {
      appToast(r.error, 'error')
      return
    }
    appToast('저장했습니다.')
    setBizEdit(null)
    void loadBiz()
  }

  const onSaveAnn = async () => {
    if (!annEdit) return
    const pk = str(annEdit.pbanc_sn)
    if (!pk) return
    const patch: Record<string, string | null> = {
      biz_pbanc_nm: str(annEdit.biz_pbanc_nm).trim() || null,
      intg_pbanc_biz_nm: str(annEdit.intg_pbanc_biz_nm).trim() || null,
      pbanc_ntrp_nm: str(annEdit.pbanc_ntrp_nm).trim() || null,
      detl_pg_url: str(annEdit.detl_pg_url).trim() || null,
      pbanc_rcpt_bgng_dt: str(annEdit.pbanc_rcpt_bgng_dt).trim() || null,
      pbanc_rcpt_end_dt: str(annEdit.pbanc_rcpt_end_dt).trim() || null,
      supt_regin: str(annEdit.supt_regin).trim() || null,
      supt_biz_clsfc: str(annEdit.supt_biz_clsfc).trim() || null,
      rcrt_prgs_yn: str(annEdit.rcrt_prgs_yn).trim() || null,
      pbanc_ctnt: str(annEdit.pbanc_ctnt).trim() || null,
      biz_aply_url: str(annEdit.biz_aply_url).trim() || null,
    }
    const r = await updateStartupAnnouncement(pk, patch)
    if (!r.ok) {
      appToast(r.error, 'error')
      return
    }
    appToast('저장했습니다.')
    setAnnEdit(null)
    void loadAnn()
  }

  const onDelBiz = async (id: string, title: string) => {
    const ok = await confirm({
      title: '지원사업 삭제',
      message: `「${title}」 항목을 삭제할까요?`,
      confirmText: '삭제',
      danger: true,
    })
    if (!ok) return
    const r = await deleteStartupBusiness(id)
    if (!r.ok) {
      appToast(r.error, 'error')
      return
    }
    appToast('삭제했습니다.')
    void loadBiz()
  }

  const onDelAnn = async (sn: string, title: string) => {
    const ok = await confirm({
      title: '공고 삭제',
      message: `「${title}」 공고를 삭제할까요?`,
      confirmText: '삭제',
      danger: true,
    })
    if (!ok) return
    const r = await deleteStartupAnnouncement(sn)
    if (!r.ok) {
      appToast(r.error, 'error')
      return
    }
    appToast('삭제했습니다.')
    void loadAnn()
  }

  const saveCrawl = async () => {
    setCrawlBusy(true)
    try {
      const r = await updateKstartupCrawlState({
        business_next_page: Number(crawlBiz) || 1,
        announcement_next_page: Number(crawlAnn) || 1,
      })
      if (!r.ok) {
        appToast(r.error, 'error')
        return
      }
      appToast('크롤 페이지를 저장했습니다.')
      void loadCrawl()
    } finally {
      setCrawlBusy(false)
    }
  }

  if (!ctx?.me) return null

  return (
    <div className="content-route-wrap admin-startup-page">
      <div className="content-page content-page--wide">
        <header className="content-page-header admin-users-header">
          <div>
            <h1>
              창업 허브 <span>데이터</span>
            </h1>
            <p className="admin-dashboard-lead">K-Startup 연동 테이블 편집·삭제 및 크롤 다음 페이지 설정입니다. 서비스 롤 크롤러는 RLS를 우회합니다.</p>
          </div>
        </header>

        <div className="admin-exp-tabs" role="tablist">
          <button type="button" role="tab" className={'admin-exp-tab' + (tab === 'business' ? ' is-active' : '')} onClick={() => setTab('business')}>
            지원사업
          </button>
          <button type="button" role="tab" className={'admin-exp-tab' + (tab === 'announcement' ? ' is-active' : '')} onClick={() => setTab('announcement')}>
            공고
          </button>
          <button type="button" role="tab" className={'admin-exp-tab' + (tab === 'crawl' ? ' is-active' : '')} onClick={() => setTab('crawl')}>
            크롤 페이지
          </button>
        </div>

        {tab === 'business' ? (
          <>
            <div className="admin-users-toolbar admin-exp-list-toolbar">
              <input
                className="admin-users-search-input"
                value={bizQ}
                onChange={(e) => setBizQ(e.target.value)}
                placeholder="사업명 검색"
                onKeyDown={(e) => e.key === 'Enter' && (setBizSearch(bizQ), setBizPage(1))}
              />
              <button type="button" className="btn-secondary" onClick={() => (setBizSearch(bizQ), setBizPage(1))}>
                검색
              </button>
              <button type="button" className="btn-secondary" onClick={() => void loadBiz()} disabled={loading}>
                새로고침
              </button>
            </div>
            <div className="admin-users-table-wrap">
              {loading ? (
                <p className="admin-users-state">불러오는 중…</p>
              ) : (
                <table className="admin-users-table">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>사업명</th>
                      <th>연도</th>
                      <th>작업</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bizRows.map((r) => {
                      const id = str(r.id)
                      const title = str(r.supt_biz_titl_nm) || '—'
                      return (
                        <tr key={id}>
                          <td className="admin-exp-cell-code">{id}</td>
                          <td>{title}</td>
                          <td>{str(r.biz_yr) || '—'}</td>
                          <td>
                            <button type="button" className="btn-secondary" onClick={() => setBizEdit({ ...r })}>
                              수정
                            </button>{' '}
                            <button type="button" className="btn-secondary btn-delete" onClick={() => void onDelBiz(id, title)}>
                              삭제
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
            <div className="admin-exp-pagination-bar-wrap">
              <PaginationBar total={bizTotal} page={bizPage} pageSize={PAGE_SIZE} onGo={setBizPage} />
            </div>
          </>
        ) : null}

        {tab === 'announcement' ? (
          <>
            <div className="admin-users-toolbar admin-exp-list-toolbar">
              <input
                className="admin-users-search-input"
                value={annQ}
                onChange={(e) => setAnnQ(e.target.value)}
                placeholder="공고명 검색"
                onKeyDown={(e) => e.key === 'Enter' && (setAnnSearch(annQ), setAnnPage(1))}
              />
              <button type="button" className="btn-secondary" onClick={() => (setAnnSearch(annQ), setAnnPage(1))}>
                검색
              </button>
              <button type="button" className="btn-secondary" onClick={() => void loadAnn()} disabled={loading}>
                새로고침
              </button>
            </div>
            <div className="admin-users-table-wrap">
              {loading ? (
                <p className="admin-users-state">불러오는 중…</p>
              ) : (
                <table className="admin-users-table">
                  <thead>
                    <tr>
                      <th>pbanc_sn</th>
                      <th>공고명</th>
                      <th>마감</th>
                      <th>작업</th>
                    </tr>
                  </thead>
                  <tbody>
                    {annRows.map((r) => {
                      const pk = str(r.pbanc_sn)
                      const title = str(r.biz_pbanc_nm) || '—'
                      return (
                        <tr key={pk}>
                          <td className="admin-exp-cell-code">{pk}</td>
                          <td>{title}</td>
                          <td>{str(r.pbanc_rcpt_end_dt) || '—'}</td>
                          <td>
                            <button type="button" className="btn-secondary" onClick={() => setAnnEdit({ ...r })}>
                              수정
                            </button>{' '}
                            <button type="button" className="btn-secondary btn-delete" onClick={() => void onDelAnn(pk, title)}>
                              삭제
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
            <div className="admin-exp-pagination-bar-wrap">
              <PaginationBar total={annTotal} page={annPage} pageSize={PAGE_SIZE} onGo={setAnnPage} />
            </div>
          </>
        ) : null}

        {tab === 'crawl' ? (
          <div className="admin-startup-crawl-panel">
            {loading ? (
              <p className="admin-users-state">불러오는 중…</p>
            ) : !crawl ? (
              <p className="admin-users-state">kstartup_crawl_state 테이블이 없거나 권한이 없습니다. 마이그레이션을 적용해 주세요.</p>
            ) : (
              <form
                className="admin-exp-manual-form"
                onSubmit={(e) => {
                  e.preventDefault()
                  void saveCrawl()
                }}
              >
                <label className="admin-exp-manual-field">
                  <span>통합지원사업 다음 페이지</span>
                  <input type="number" min={1} value={crawlBiz} onChange={(e) => setCrawlBiz(e.target.value)} />
                </label>
                <label className="admin-exp-manual-field">
                  <span>지원사업 공고 다음 페이지</span>
                  <input type="number" min={1} value={crawlAnn} onChange={(e) => setCrawlAnn(e.target.value)} />
                </label>
                <p className="admin-exp-panel-lead">마지막 갱신: {crawl.updated_at ? new Date(crawl.updated_at).toLocaleString('ko-KR') : '—'}</p>
                <button type="submit" className="btn-secondary" disabled={crawlBusy}>
                  {crawlBusy ? '저장 중…' : '저장'}
                </button>
              </form>
            )}
          </div>
        ) : null}
      </div>

      {bizEdit ? (
        <div className="cp-modal-overlay" role="presentation">
          <div className="cp-modal cp-modal--wide">
            <div className="cp-modal-header">
              <h2>지원사업 수정 · {str(bizEdit.id)}</h2>
              <button type="button" className="cp-modal-close" aria-label="닫기" onClick={() => setBizEdit(null)}>
                <HiXMark className="cp-modal-close-ico" aria-hidden />
              </button>
            </div>
            <div className="cp-modal-body admin-startup-form-grid">
              {(
                [
                  ['supt_biz_titl_nm', '사업명'],
                  ['biz_yr', '사업연도'],
                  ['biz_category_cd', '카테고리코드'],
                  ['detl_pg_url', '상세 URL'],
                  ['biz_supt_trgt_info', '지원대상'],
                  ['biz_supt_ctnt', '지원내용'],
                  ['supt_biz_intrd_info', '소개'],
                  ['supt_biz_chrct', '특징'],
                  ['biz_supt_bdgt_info', '예산·규모'],
                ] as const
              ).map(([key, label]) => (
                <div key={key} className="cp-form-group">
                  <label>{label}</label>
                  {key.includes('ctnt') || key.includes('intrd') || key.includes('trgt_info') || key === 'supt_biz_chrct' ? (
                    <textarea
                      rows={3}
                      value={str(bizEdit[key])}
                      onChange={(e) => setBizEdit((p) => (p ? { ...p, [key]: e.target.value } : p))}
                    />
                  ) : (
                    <input
                      value={str(bizEdit[key])}
                      onChange={(e) => setBizEdit((p) => (p ? { ...p, [key]: e.target.value } : p))}
                    />
                  )}
                </div>
              ))}
            </div>
            <div className="cp-modal-footer">
              <button type="button" className="btn-secondary" onClick={() => setBizEdit(null)}>
                취소
              </button>
              <button type="button" className="btn-write" onClick={() => void onSaveBiz()}>
                저장
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {annEdit ? (
        <div className="cp-modal-overlay" role="presentation">
          <div className="cp-modal cp-modal--wide">
            <div className="cp-modal-header">
              <h2>공고 수정 · {str(annEdit.pbanc_sn)}</h2>
              <button type="button" className="cp-modal-close" aria-label="닫기" onClick={() => setAnnEdit(null)}>
                <HiXMark className="cp-modal-close-ico" aria-hidden />
              </button>
            </div>
            <div className="cp-modal-body admin-startup-form-grid">
              {(
                [
                  ['biz_pbanc_nm', '공고명'],
                  ['intg_pbanc_biz_nm', '통합공고명'],
                  ['pbanc_ntrp_nm', '기관명'],
                  ['detl_pg_url', '상세 URL'],
                  ['pbanc_rcpt_bgng_dt', '접수 시작(YYYYMMDD)'],
                  ['pbanc_rcpt_end_dt', '접수 마감(YYYYMMDD)'],
                  ['supt_regin', '지원지역'],
                  ['supt_biz_clsfc', '분류'],
                  ['rcrt_prgs_yn', '모집진행 Y/N'],
                  ['biz_aply_url', '신청 URL'],
                  ['pbanc_ctnt', '공고 내용'],
                ] as const
              ).map(([key, label]) => (
                <div key={key} className="cp-form-group">
                  <label>{label}</label>
                  {key === 'pbanc_ctnt' ? (
                    <textarea
                      rows={5}
                      value={str(annEdit[key])}
                      onChange={(e) => setAnnEdit((p) => (p ? { ...p, [key]: e.target.value } : p))}
                    />
                  ) : (
                    <input
                      value={str(annEdit[key])}
                      onChange={(e) => setAnnEdit((p) => (p ? { ...p, [key]: e.target.value } : p))}
                    />
                  )}
                </div>
              ))}
            </div>
            <div className="cp-modal-footer">
              <button type="button" className="btn-secondary" onClick={() => setAnnEdit(null)}>
                취소
              </button>
              <button type="button" className="btn-write" onClick={() => void onSaveAnn()}>
                저장
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
