// Supabase Edge Function: K-Startup API 수집 → startup_business, startup_announcement upsert
// 호출당 1페이지만 수집 후 저장 (10개 아이템). kstartup_crawl_state로 진행 페이지 기록, 반복 호출로 끝까지 수집.
//
// 호출: full=1 → page 1만 수집 (state 무시), 기본 → kstartup_crawl_state 다음 페이지 1장
// Secret: K_START_UP_SERVICE (공공데이터 인증키)
//
// npx supabase functions deploy crawl-kstartup --no-verify-jwt

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const BASE_URL = "https://apis.data.go.kr/B552735/kisedKstartupService01";
const PAGES_PER_CALL = 1; // 한 번 실행에 1페이지(10개 아이템)만 수집
const PER_PAGE = 10;
const SOURCE = "K-Startup";

const SOURCE_BIZ = "kstartup_business";
const SOURCE_ANN = "kstartup_announcement";

async function dispatchNotificationToMembers(
  supabase: ReturnType<typeof createClient>,
  notificationId: number
) {
  const { data: members } = await supabase.from("profiles").select("id");
  if (!members?.length) return;
  await supabase.from("notification_user_state").insert(
    members.map((m) => ({ user_id: m.id, notification_id: notificationId, read: false, deleted: false }))
  );
}

function getServiceKey(): string {
  const key = Deno.env.get("K_START_UP_SERVICE");
  if (!key) throw new Error("K_START_UP_SERVICE secret not set");
  return key;
}

function decodeXmlEntities(s: string): string {
  if (!s) return "";
  return s
    .replace(/&#xD;/g, "\r")
    .replace(/&#xA;/g, "\n")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function parseColItems(xml: string): Record<string, string>[] {
  const items: Record<string, string>[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  const colRegex = /<col\s+name="([^"]+)">([\s\S]*?)<\/col>/g;
  let m;
  while ((m = itemRegex.exec(xml)) !== null) {
    const itemXml = m[1];
    const row: Record<string, string> = {};
    let cm;
    colRegex.lastIndex = 0;
    while ((cm = colRegex.exec(itemXml)) !== null) {
      row[cm[1]] = decodeXmlEntities(cm[2].trim());
    }
    if (Object.keys(row).length > 0) items.push(row);
  }
  return items;
}

function parsePagination(xml: string): { currentCount: number; perPage: number; totalCount: number; page: number } {
  const currentCount = parseInt(xml.match(/<currentCount>(\d+)<\/currentCount>/)?.[1] ?? "0", 10);
  const perPage = parseInt(xml.match(/<perPage>(\d+)<\/perPage>/)?.[1] ?? "10", 10);
  const totalCount = parseInt(xml.match(/<totalCount>(\d+)<\/totalCount>/)?.[1] ?? "0", 10);
  const page = parseInt(xml.match(/<page>(\d+)<\/page>/)?.[1] ?? "1", 10);
  return { currentCount, perPage, totalCount, page };
}

function extractIdFromUrl(url: string): string | null {
  if (!url) return null;
  // XML 엔티티 디코딩 후 id 추출 (&amp; -> &)
  const decoded = url.replace(/&amp;/g, "&").replace(/&#38;/g, "&");
  // ?id= 또는 &id= 패턴으로 추출 (가장 명확한 패턴 우선)
  const m = decoded.match(/[?&]id=(\d+)/);
  if (m) return m[1];
  // ?id= 패턴이 없으면 id= 패턴 시도 (하지만 이건 덜 정확함)
  const m2 = decoded.match(/id=(\d+)/);
  return m2 ? m2[1] : null;
}

async function fetchApi(
  apiName: string,
  serviceKey: string,
  pageNo: number,
  numOfRows: number
): Promise<string> {
  // ServiceKey는 공공데이터포털에서 이미 URL 인코딩된 값으로 발급됨. encodeURIComponent 시 이중 인코딩 → 401 발생
  const url = `${BASE_URL}/${apiName}?ServiceKey=${serviceKey}&pageNo=${pageNo}&numOfRows=${numOfRows}`;
  console.log(`[crawl-kstartup] API 요청: ${apiName} pageNo=${pageNo} numOfRows=${numOfRows}`);
  const res = await fetch(url, {
    headers: { Accept: "application/xml, text/xml, */*" },
  });
  const body = await res.text();
  if (!res.ok) {
    console.error(`[crawl-kstartup] API 실패: ${apiName} HTTP ${res.status}`, body.slice(0, 500));
    throw new Error(`API ${apiName} HTTP ${res.status}`);
  }
  console.log(`[crawl-kstartup] API 응답: ${apiName} pageNo=${pageNo} HTTP ${res.status} body=${body.length}bytes`);
  return body;
}

// --- getBusinessInformation → startup_business ---
interface BusinessRow {
  id: string;
  supt_biz_titl_nm: string | null;
  biz_category_cd: string | null;
  biz_yr: string | null;
  biz_supt_trgt_info: string | null;
  biz_supt_ctnt: string | null;
  biz_supt_bdgt_info: string | null;
  supt_biz_chrct: string | null;
  supt_biz_intrd_info: string | null;
  detl_pg_url: string | null;
}

function mapBusinessItem(col: Record<string, string>): BusinessRow | null {
  // XML 엔티티 디코딩
  const detlPgUrlRaw = col.detl_pg_url || "";
  const detlPgUrl = decodeXmlEntities(detlPgUrlRaw);
  
  // detl_pg_url에서 id 추출 (예: ?id=171421)
  const idFromUrl = extractIdFromUrl(detlPgUrl);
  
  // col.id는 페이지 내 순번이므로 사용하지 않음
  const id = idFromUrl || "";
  
  if (!id) {
    console.warn(`[crawl-kstartup] mapBusinessItem: id 추출 실패, detl_pg_url="${detlPgUrlRaw.substring(0, 100)}", 추출시도결과="${idFromUrl}"`);
    return null;
  }
  
  let url = detlPgUrl.trim();
  if (url && !url.startsWith("http")) url = `https://${url}`;
  
  return {
    id,
    supt_biz_titl_nm: decodeXmlEntities(col.supt_biz_titl_nm || "") || null,
    biz_category_cd: decodeXmlEntities(col.biz_category_cd || "") || null,
    biz_yr: decodeXmlEntities(col.biz_yr || "") || null,
    biz_supt_trgt_info: decodeXmlEntities(col.biz_supt_trgt_info || "") || null,
    biz_supt_ctnt: decodeXmlEntities(col.biz_supt_ctnt || "") || null,
    biz_supt_bdgt_info: decodeXmlEntities(col.biz_supt_bdgt_info || "") || null,
    supt_biz_chrct: decodeXmlEntities(col.supt_biz_chrct || "") || null,
    supt_biz_intrd_info: decodeXmlEntities(col.supt_biz_intrd_info || "") || null,
    detl_pg_url: url || null,
  };
}

async function fetchBusinessPages(
  serviceKey: string,
  startPage: number,
  maxPages: number
): Promise<{ rows: BusinessRow[]; lastPage: number }> {
  const xml = await fetchApi("getBusinessInformation01", serviceKey, startPage, PER_PAGE);
  const { totalCount, perPage } = parsePagination(xml);
  const lastPage = Math.ceil(totalCount / perPage) || 1;
  const endPage = Math.min(startPage + maxPages - 1, lastPage);
  console.log(`[crawl-kstartup] 통합지원사업 fetch: totalCount=${totalCount} 페이지 ${startPage}~${endPage}/${lastPage}`);

  const all: BusinessRow[] = [];
  const seen = new Set<string>();
  const pageIds: Record<number, string[]> = {}; // 페이지별 ID 추적

  for (let p = startPage; p <= endPage; p++) {
    const pageXml = p === startPage ? xml : await fetchApi("getBusinessInformation01", serviceKey, p, PER_PAGE);
    const { currentCount } = parsePagination(pageXml);
    if (currentCount === 0) {
      console.log(`[crawl-kstartup] 통합지원사업 page ${p}: currentCount=0, 중단`);
      break;
    }
    const items = parseColItems(pageXml);
    let filtered = 0;
    const pageIdList: string[] = [];
    
    for (const col of items) {
      const row = mapBusinessItem(col);
      if (!row) {
        filtered++;
        if (filtered <= 3) {
          const detlPgUrl = col.detl_pg_url || "";
          const decodedUrl = decodeXmlEntities(detlPgUrl);
          const extractedId = extractIdFromUrl(decodedUrl);
          console.warn(`[crawl-kstartup] 통합지원사업 page ${p} 필터링된 항목: detl_pg_url="${detlPgUrl.substring(0, 100)}", 추출시도결과="${extractedId}", col.id="${col.id}"`);
        }
        continue;
      }
      pageIdList.push(row.id);
      if (row && !seen.has(row.id)) {
        seen.add(row.id);
        all.push(row);
      } else if (seen.has(row.id)) {
        // 어떤 페이지에서 이미 수집했는지 찾기
        let foundInPage = -1;
        for (const [pageNum, ids] of Object.entries(pageIds)) {
          if (ids.includes(row.id)) {
            foundInPage = parseInt(pageNum);
            break;
          }
        }
        console.warn(`[crawl-kstartup] 통합지원사업 page ${p} 중복 ID 스킵: ${row.id} (이미 page ${foundInPage > 0 ? foundInPage : '이전'}에서 수집됨)`);
      }
    }
    
    pageIds[p] = pageIdList;
    console.log(`[crawl-kstartup] 통합지원사업 page ${p}/${endPage}: items=${items.length} 필터링=${filtered} 수집ID=${pageIdList.length}개 (샘플: ${pageIdList.slice(0, 3).join(", ")}) 누적=${all.length}`);
    
    if (p < endPage) await new Promise((r) => setTimeout(r, 200));
  }
  
  // 페이지별 ID 비교 로그
  if (Object.keys(pageIds).length > 1) {
    const pages = Object.keys(pageIds).map(Number).sort((a, b) => a - b);
    for (let i = 1; i < pages.length; i++) {
      const prevPage = pages[i - 1];
      const currPage = pages[i];
      const prevIds = new Set(pageIds[prevPage]);
      const currIds = new Set(pageIds[currPage]);
      const overlap = pageIds[currPage].filter(id => prevIds.has(id));
      if (overlap.length > 0) {
        console.warn(`[crawl-kstartup] 통합지원사업 page ${prevPage}과 ${currPage} ID 겹침: ${overlap.length}개 (샘플: ${overlap.slice(0, 5).join(", ")})`);
      } else {
        console.log(`[crawl-kstartup] 통합지원사업 page ${prevPage}과 ${currPage} ID 겹침 없음 (정상)`);
      }
    }
  }
  return { rows: all, lastPage };
}

// --- getAnnouncementInformation → startup_announcement ---
interface AnnouncementRow {
  pbanc_sn: string;
  biz_pbanc_nm: string | null;
  intg_pbanc_biz_nm: string | null;
  pbanc_ntrp_nm: string | null;
  biz_prch_dprt_nm: string | null;
  prch_cnpl_no: string | null;
  supt_regin: string | null;
  supt_biz_clsfc: string | null;
  sprv_inst: string | null;
  pbanc_rcpt_bgng_dt: string | null;
  pbanc_rcpt_end_dt: string | null;
  rcrt_prgs_yn: string | null;
  intg_pbanc_yn: string | null;
  pbanc_ctnt: string | null;
  aply_trgt: string | null;
  aply_trgt_ctnt: string | null;
  aply_excl_trgt_ctnt: string | null;
  biz_enyy: string | null;
  biz_trgt_age: string | null;
  detl_pg_url: string | null;
  biz_aply_url: string | null;
  biz_gdnc_url: string | null;
  aply_mthd_onli_rcpt_istc: string | null;
  aply_mthd_eml_rcpt_istc: string | null;
  aply_mthd_fax_rcpt_istc: string | null;
  aply_mthd_vst_rcpt_istc: string | null;
  aply_mthd_pssr_rcpt_istc: string | null;
  aply_mthd_etc_istc: string | null;
  prfn_matr: string | null;
}

function mapAnnouncementItem(col: Record<string, string>): AnnouncementRow | null {
  const pbancSn = (col.pbanc_sn || "").trim();
  if (!pbancSn) return null;
  return {
    pbanc_sn: pbancSn,
    biz_pbanc_nm: col.biz_pbanc_nm || null,
    intg_pbanc_biz_nm: col.intg_pbanc_biz_nm || null,
    pbanc_ntrp_nm: col.pbanc_ntrp_nm || null,
    biz_prch_dprt_nm: col.biz_prch_dprt_nm || null,
    prch_cnpl_no: col.prch_cnpl_no || null,
    supt_regin: col.supt_regin || null,
    supt_biz_clsfc: col.supt_biz_clsfc || null,
    sprv_inst: col.sprv_inst || null,
    pbanc_rcpt_bgng_dt: col.pbanc_rcpt_bgng_dt || null,
    pbanc_rcpt_end_dt: col.pbanc_rcpt_end_dt || null,
    rcrt_prgs_yn: col.rcrt_prgs_yn || null,
    intg_pbanc_yn: col.intg_pbanc_yn || null,
    pbanc_ctnt: col.pbanc_ctnt || null,
    aply_trgt: col.aply_trgt || null,
    aply_trgt_ctnt: col.aply_trgt_ctnt || null,
    aply_excl_trgt_ctnt: col.aply_excl_trgt_ctnt || null,
    biz_enyy: col.biz_enyy || null,
    biz_trgt_age: col.biz_trgt_age || null,
    detl_pg_url: col.detl_pg_url || null,
    biz_aply_url: col.biz_aply_url || null,
    biz_gdnc_url: col.biz_gdnc_url || null,
    aply_mthd_onli_rcpt_istc: col.aply_mthd_onli_rcpt_istc || null,
    aply_mthd_eml_rcpt_istc: col.aply_mthd_eml_rcpt_istc || null,
    aply_mthd_fax_rcpt_istc: col.aply_mthd_fax_rcpt_istc || null,
    aply_mthd_vst_rcpt_istc: col.aply_mthd_vst_rcpt_istc || null,
    aply_mthd_pssr_rcpt_istc: col.aply_mthd_pssr_rcpt_istc || null,
    aply_mthd_etc_istc: col.aply_mthd_etc_istc || null,
    prfn_matr: col.prfn_matr || null,
  };
}

async function fetchAnnouncementPages(
  serviceKey: string,
  startPage: number,
  maxPages: number
): Promise<{ rows: AnnouncementRow[]; lastPage: number }> {
  const xml = await fetchApi("getAnnouncementInformation01", serviceKey, startPage, PER_PAGE);
  const { totalCount, perPage } = parsePagination(xml);
  const lastPage = Math.ceil(totalCount / perPage) || 1;
  const endPage = Math.min(startPage + maxPages - 1, lastPage);
  console.log(`[crawl-kstartup] 지원사업 공고 fetch: totalCount=${totalCount} 페이지 ${startPage}~${endPage}/${lastPage}`);

  const all: AnnouncementRow[] = [];
  const seen = new Set<string>();

  for (let p = startPage; p <= endPage; p++) {
    const pageXml = p === startPage ? xml : await fetchApi("getAnnouncementInformation01", serviceKey, p, PER_PAGE);
    const { currentCount } = parsePagination(pageXml);
    if (currentCount === 0) {
      console.log(`[crawl-kstartup] 지원사업 공고 page ${p}: currentCount=0, 중단`);
      break;
    }
    const items = parseColItems(pageXml);
    let filtered = 0;
    for (const col of items) {
      const row = mapAnnouncementItem(col);
      if (!row) {
        filtered++;
        continue;
      }
      if (row && !seen.has(row.pbanc_sn)) {
        seen.add(row.pbanc_sn);
        all.push(row);
      }
    }
    if (filtered > 0) {
      console.log(`[crawl-kstartup] 지원사업 공고 page ${p}/${endPage}: items=${items.length} 필터링=${filtered} 누적=${all.length}`);
    } else {
      console.log(`[crawl-kstartup] 지원사업 공고 page ${p}/${endPage}: items=${items.length} 누적=${all.length}`);
    }
    if (p < endPage) await new Promise((r) => setTimeout(r, 200));
  }
  return { rows: all, lastPage };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: { "Access-Control-Allow-Origin": "*" } });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !supabaseKey) {
    return new Response(
      JSON.stringify({ error: "Supabase env not configured" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  // 1. forceFull 체크 (전체 수집 모드)
  let forceFull = false;
  let urlParamFull = false;
  let bodyFull = false;
  try {
    const url = new URL(req.url);
    urlParamFull = url.searchParams.get("full") === "1" || url.searchParams.get("full") === "true";
    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      bodyFull = body?.full === true || body?.full === 1;
    }
    forceFull = urlParamFull || bodyFull;
    console.log(`[crawl-kstartup] forceFull 체크: URL파라미터=${urlParamFull}, Body=${bodyFull}, 최종=${forceFull}`);
  } catch (e) {
    console.error(`[crawl-kstartup] forceFull 체크 중 에러:`, e);
    // ignore
  }

  console.log(`[crawl-kstartup] ===== 실행 시작 ===== forceFull=${forceFull}`);

  try {
    const serviceKey = getServiceKey();

    // 2. crawl_state에서 다음 페이지 조회 (forceFull이 아닐 때만)
    let bizStartPage = 1;
    let annStartPage = 1;
    
    console.log(`[crawl-kstartup] [1단계] 시작: forceFull=${forceFull}`);
    
    if (!forceFull) {
      console.log(`[crawl-kstartup] [1단계] kstartup_crawl_state 조회 중...`);
      const { data: state, error: stateErr } = await supabase
        .from("kstartup_crawl_state")
        .select("business_next_page, announcement_next_page")
        .eq("id", 1)
        .maybeSingle();
      
      console.log(`[crawl-kstartup] [1단계] 조회 결과: state=${state ? JSON.stringify(state) : 'null'}, error=${stateErr ? JSON.stringify(stateErr) : 'null'}`);
      
      if (stateErr) {
        console.error(`[crawl-kstartup] [1단계] ❌ kstartup_crawl_state 조회 실패:`, JSON.stringify(stateErr));
        console.log(`[crawl-kstartup] [1단계] 기본값 사용: page 1부터 시작`);
        bizStartPage = 1;
        annStartPage = 1;
      } else if (!state) {
        console.warn(`[crawl-kstartup] [1단계] ⚠️ kstartup_crawl_state 데이터 없음 (id=1 row 없음)`);
        console.log(`[crawl-kstartup] [1단계] 기본값 사용: page 1부터 시작`);
        bizStartPage = 1;
        annStartPage = 1;
      } else {
        console.log(`[crawl-kstartup] [1단계] ✅ kstartup_crawl_state 조회 성공`);
        bizStartPage = Math.max(1, state.business_next_page ?? 1);
        annStartPage = Math.max(1, state.announcement_next_page ?? 1);
        console.log(`[crawl-kstartup] [1단계] 다음 페이지 결정: 통합지원사업 page ${bizStartPage}, 공고 page ${annStartPage}`);
      }
    } else {
      console.log(`[crawl-kstartup] [1단계] forceFull=true → page 1부터 시작 (kstartup_crawl_state 무시)`);
      bizStartPage = 1;
      annStartPage = 1;
    }
    
    console.log(`[crawl-kstartup] [1단계] 최종 결정: bizStartPage=${bizStartPage}, annStartPage=${annStartPage}`);

    // 3. API에서 데이터 수집
    console.log(`[crawl-kstartup] [2단계] API 수집 시작: 통합지원사업 page ${bizStartPage} (${PAGES_PER_CALL}페이지, ${PER_PAGE}개 아이템), 공고 page ${annStartPage} (${PAGES_PER_CALL}페이지, ${PER_PAGE}개 아이템)`);
    const [businessResult, announcementResult] = await Promise.all([
      fetchBusinessPages(serviceKey, bizStartPage, PAGES_PER_CALL),
      fetchAnnouncementPages(serviceKey, annStartPage, PAGES_PER_CALL),
    ]);

    const businessRows = businessResult.rows;
    const announcementRows = announcementResult.rows;
    console.log(`[crawl-kstartup] [2단계] API 수집 완료: startup_business=${businessRows.length}건, startup_announcement=${announcementRows.length}건`);

    let bizUpsert = 0;
    let annUpsert = 0;
    let bizNew = 0;
    let annNew = 0;

    // 4. DB 저장/업데이트
    if (businessRows.length > 0) {
      console.log(`[crawl-kstartup] [3단계] startup_business 저장 시작: ${businessRows.length}건`);
      const bizIds = businessRows.map((r) => r.id);
      
      // 기존 데이터 확인
      const { data: existingBiz } = await supabase
        .from("startup_business")
        .select("id")
        .in("id", bizIds);
      
      const existingBizSet = new Set((existingBiz ?? []).map((r) => r.id));
      bizNew = businessRows.filter((r) => !existingBizSet.has(r.id)).length;
      const bizUpdate = businessRows.length - bizNew;
      
      console.log(`[crawl-kstartup] [3단계] startup_business: 수집=${bizIds.length}건, 신규=${bizNew}건, 업데이트=${bizUpdate}건`);
      if (bizNew > 0) {
        const newIds = businessRows.filter((r) => !existingBizSet.has(r.id)).map((r) => r.id).slice(0, 5);
        console.log(`[crawl-kstartup] [3단계] startup_business 신규 ID: ${newIds.join(", ")}`);
      }

      // 저장/업데이트 (없으면 저장, 있으면 업데이트)
      const { error: bizErr } = await supabase
        .from("startup_business")
        .upsert(businessRows, {
          onConflict: "id",
          ignoreDuplicates: false,
        });
      
      if (bizErr) {
        console.error(`[crawl-kstartup] [3단계] startup_business 저장 실패:`, bizErr);
        throw new Error(`startup_business upsert: ${bizErr.message}`);
      }
      
      bizUpsert = businessRows.length;
      console.log(`[crawl-kstartup] [3단계] startup_business 저장 완료: ${bizUpsert}건 (신규 ${bizNew}, 업데이트 ${bizUpdate})`);
    } else {
      console.log(`[crawl-kstartup] [3단계] startup_business 저장할 데이터 없음`);
    }

    if (announcementRows.length > 0) {
      console.log(`[crawl-kstartup] [3단계] startup_announcement 저장 시작: ${announcementRows.length}건`);
      const annIds = announcementRows.map((r) => r.pbanc_sn);
      
      // 기존 데이터 확인
      const { data: existingAnn } = await supabase
        .from("startup_announcement")
        .select("pbanc_sn")
        .in("pbanc_sn", annIds);
      
      const existingAnnSet = new Set((existingAnn ?? []).map((r) => r.pbanc_sn));
      annNew = announcementRows.filter((r) => !existingAnnSet.has(r.pbanc_sn)).length;
      const annUpdate = announcementRows.length - annNew;
      
      console.log(`[crawl-kstartup] [3단계] startup_announcement: 수집=${annIds.length}건, 신규=${annNew}건, 업데이트=${annUpdate}건`);
      if (annNew > 0) {
        const newIds = announcementRows.filter((r) => !existingAnnSet.has(r.pbanc_sn)).map((r) => r.pbanc_sn).slice(0, 5);
        console.log(`[crawl-kstartup] [3단계] startup_announcement 신규 pbanc_sn: ${newIds.join(", ")}`);
      }

      // 저장/업데이트 (없으면 저장, 있으면 업데이트)
      const { error: annErr } = await supabase
        .from("startup_announcement")
        .upsert(announcementRows, {
          onConflict: "pbanc_sn",
          ignoreDuplicates: false,
        });
      
      if (annErr) {
        console.error(`[crawl-kstartup] [3단계] startup_announcement 저장 실패:`, annErr);
        throw new Error(`startup_announcement upsert: ${annErr.message}`);
      }
      
      annUpsert = announcementRows.length;
      console.log(`[crawl-kstartup] [3단계] startup_announcement 저장 완료: ${annUpsert}건 (신규 ${annNew}, 업데이트 ${annUpdate})`);
    } else {
      console.log(`[crawl-kstartup] [3단계] startup_announcement 저장할 데이터 없음`);
    }

    // 5. kstartup_crawl_state 업데이트 (다음 실행 시 다음 페이지부터 시작하도록)
    // 마지막 페이지 도달 시 1로 리셋
    const bizNextPage =
      bizStartPage + PAGES_PER_CALL > businessResult.lastPage ? 1 : bizStartPage + PAGES_PER_CALL;
    const annNextPage =
      annStartPage + PAGES_PER_CALL > announcementResult.lastPage ? 1 : annStartPage + PAGES_PER_CALL;
    
    if (bizNextPage === 1 && bizStartPage + PAGES_PER_CALL > businessResult.lastPage) {
      console.log(`[crawl-kstartup] [4단계] ✅ 통합지원사업 마지막 페이지 도달 (${businessResult.lastPage}페이지) → 다음 실행부터 page 1부터 다시 시작`);
    }
    if (annNextPage === 1 && annStartPage + PAGES_PER_CALL > announcementResult.lastPage) {
      console.log(`[crawl-kstartup] [4단계] ✅ 지원사업 공고 마지막 페이지 도달 (${announcementResult.lastPage}페이지) → 다음 실행부터 page 1부터 다시 시작`);
    }
    
    console.log(`[crawl-kstartup] [4단계] kstartup_crawl_state 업데이트: 통합지원사업 ${bizStartPage} → ${bizNextPage}, 공고 ${annStartPage} → ${annNextPage}`);
    
    const updateData = {
      id: 1,
      business_next_page: bizNextPage,
      announcement_next_page: annNextPage,
      updated_at: new Date().toISOString(),
    };
    console.log(`[crawl-kstartup] [4단계] 업데이트 데이터:`, JSON.stringify(updateData));
    
    const { data: updatedState, error: stateErr } = await supabase
      .from("kstartup_crawl_state")
      .upsert(updateData, { onConflict: "id" })
      .select();
    
    if (stateErr) {
      console.error(`[crawl-kstartup] [4단계] ❌ kstartup_crawl_state 업데이트 실패:`, JSON.stringify(stateErr));
    } else {
      console.log(`[crawl-kstartup] [4단계] ✅ kstartup_crawl_state 업데이트 완료`);
      if (updatedState && updatedState.length > 0) {
        console.log(`[crawl-kstartup] [4단계] 업데이트 후 상태:`, JSON.stringify(updatedState[0]));
      }
    }

    const totalNew = bizNew + annNew;
    const totalUpsert = bizUpsert + annUpsert;
    if (totalUpsert > 0) {
      try {
        const hasNew = totalNew > 0;
        let msg: string;
        if (hasNew) {
          if (bizNew > 0 && annNew > 0) {
            msg = `${SOURCE} 창업 정보 ${totalNew}건이 추가되었어요 (지원사업 ${bizNew}건, 공고 ${annNew}건)`;
          } else if (bizNew > 0) {
            msg = `${SOURCE} 통합공고 지원사업 ${bizNew}건이 추가되었어요`;
          } else {
            msg = `${SOURCE} 지원사업 공고 ${annNew}건이 추가되었어요`;
          }
        } else {
          msg =
            bizUpsert > 0 && annUpsert > 0
              ? `${SOURCE} 창업 정보 ${totalUpsert}건이 업데이트되었어요 (지원사업 ${bizUpsert}건, 공고 ${annUpsert}건)`
              : bizUpsert > 0
                ? `${SOURCE} 통합공고 지원사업 ${bizUpsert}건이 업데이트되었어요`
                : `${SOURCE} 지원사업 공고 ${annUpsert}건이 업데이트되었어요`;
        }
        const { data: notif } = await supabase
          .from("notifications")
          .insert({
            type: hasNew ? "insert" : "update",
            source: SOURCE,
            count: hasNew ? totalNew : totalUpsert,
            message: msg,
          })
          .select("id")
          .single();
        if (notif?.id) await dispatchNotificationToMembers(supabase, notif.id);
      } catch (notifErr) {
        console.warn("알림 생성 실패:", notifErr);
      }
    }

    console.log(`[crawl-kstartup] ===== 실행 완료 =====`);
    console.log(`[crawl-kstartup] 결과: startup_business=${bizUpsert}건 (신규 ${bizNew}), startup_announcement=${annUpsert}건 (신규 ${annNew})`);
    console.log(`[crawl-kstartup] 다음 실행: 통합지원사업 page ${bizNextPage}, 공고 page ${annNextPage}`);
    return new Response(
      JSON.stringify({
        success: true,
        mode: forceFull ? "full" : "incremental",
        startup_business: bizUpsert,
        startup_announcement: annUpsert,
        next_business_page: bizNextPage,
        next_announcement_page: annNextPage,
        message: `startup_business ${bizUpsert}건, startup_announcement ${annUpsert}건 upsert 완료 (다음 biz p.${bizNextPage} ann p.${annNextPage})`,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("[crawl-kstartup] 오류:", e);
    return new Response(
      JSON.stringify({ success: false, error: String(e) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
