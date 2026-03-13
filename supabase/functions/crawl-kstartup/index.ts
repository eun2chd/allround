// Supabase Edge Function: K-Startup API 수집 → startup_business, startup_announcement upsert
// GitHub Actions: 전체 1일 2~3회, 증분 10분마다
//
// 호출: full=1 → 전체 페이지 수집, 기본 → page 1~3만 (증분)
// Secret: K_START_UP_SERVICE (공공데이터 인증키)
//
// npx supabase functions deploy crawl-kstartup --no-verify-jwt

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const BASE_URL = "https://apis.data.go.kr/B552735/kisedKstartupService01";
const PAGES_INCREMENTAL = 3;
const PER_PAGE = 10;
const SOURCE = "K-Startup";

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
  const m = url.match(/[?&]id=(\d+)/) || url.match(/id=(\d+)/);
  return m ? m[1] : null;
}

async function fetchApi(
  apiName: string,
  serviceKey: string,
  pageNo: number,
  numOfRows: number
): Promise<string> {
  const url = `${BASE_URL}/${apiName}?ServiceKey=${encodeURIComponent(serviceKey)}&pageNo=${pageNo}&numOfRows=${numOfRows}`;
  const res = await fetch(url, {
    headers: { Accept: "application/xml, text/xml, */*" },
  });
  if (!res.ok) throw new Error(`API ${apiName} HTTP ${res.status}`);
  return res.text();
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
  const detlPgUrl = col.detl_pg_url || "";
  const id = extractIdFromUrl(detlPgUrl) || col.id || "";
  if (!id) return null;
  let url = detlPgUrl.trim();
  if (url && !url.startsWith("http")) url = `https://${url}`;
  return {
    id,
    supt_biz_titl_nm: col.supt_biz_titl_nm || null,
    biz_category_cd: col.biz_category_cd || null,
    biz_yr: col.biz_yr || null,
    biz_supt_trgt_info: col.biz_supt_trgt_info || null,
    biz_supt_ctnt: col.biz_supt_ctnt || null,
    biz_supt_bdgt_info: col.biz_supt_bdgt_info || null,
    supt_biz_chrct: col.supt_biz_chrct || null,
    supt_biz_intrd_info: col.supt_biz_intrd_info || null,
    detl_pg_url: url || null,
  };
}

async function fetchAllBusiness(serviceKey: string, full: boolean): Promise<BusinessRow[]> {
  const xml = await fetchApi("getBusinessInformation01", serviceKey, 1, PER_PAGE);
  const { totalCount, perPage } = parsePagination(xml);
  const lastPage = Math.ceil(totalCount / perPage) || 1;
  const maxPage = full ? lastPage : Math.min(PAGES_INCREMENTAL, lastPage);

  const all: BusinessRow[] = [];
  const seen = new Set<string>();

  for (let p = 1; p <= maxPage; p++) {
    const pageXml = p === 1 ? xml : await fetchApi("getBusinessInformation01", serviceKey, p, PER_PAGE);
    const { currentCount } = parsePagination(pageXml);
    if (currentCount === 0) break;

    const items = parseColItems(pageXml);
    for (const col of items) {
      const row = mapBusinessItem(col);
      if (row && !seen.has(row.id)) {
        seen.add(row.id);
        all.push(row);
      }
    }
    if (p < maxPage) await new Promise((r) => setTimeout(r, 300));
  }
  return all;
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

async function fetchAllAnnouncement(serviceKey: string, full: boolean): Promise<AnnouncementRow[]> {
  const xml = await fetchApi("getAnnouncementInformation01", serviceKey, 1, PER_PAGE);
  const { totalCount, perPage } = parsePagination(xml);
  const lastPage = Math.ceil(totalCount / perPage) || 1;
  const maxPage = full ? lastPage : Math.min(PAGES_INCREMENTAL, lastPage);

  const all: AnnouncementRow[] = [];
  const seen = new Set<string>();

  for (let p = 1; p <= maxPage; p++) {
    const pageXml = p === 1 ? xml : await fetchApi("getAnnouncementInformation01", serviceKey, p, PER_PAGE);
    const { currentCount } = parsePagination(pageXml);
    if (currentCount === 0) break;

    const items = parseColItems(pageXml);
    for (const col of items) {
      const row = mapAnnouncementItem(col);
      if (row && !seen.has(row.pbanc_sn)) {
        seen.add(row.pbanc_sn);
        all.push(row);
      }
    }
    if (p < maxPage) await new Promise((r) => setTimeout(r, 300));
  }
  return all;
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

  let forceFull = false;
  try {
    const url = new URL(req.url);
    forceFull = url.searchParams.get("full") === "1" || url.searchParams.get("full") === "true";
    if (req.method === "POST" && !forceFull) {
      const body = await req.json().catch(() => ({}));
      forceFull = body?.full === true || body?.full === 1;
    }
  } catch {
    /* ignore */
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const serviceKey = getServiceKey();

    const [businessRows, announcementRows] = await Promise.all([
      fetchAllBusiness(serviceKey, forceFull),
      fetchAllAnnouncement(serviceKey, forceFull),
    ]);

    let bizUpsert = 0;
    let annUpsert = 0;
    let bizNew = 0;
    let annNew = 0;

    if (businessRows.length > 0) {
      const bizIds = businessRows.map((r) => r.id);
      const { data: existingBiz } = await supabase
        .from("startup_business")
        .select("id")
        .in("id", bizIds);
      const existingBizSet = new Set((existingBiz ?? []).map((r) => r.id));
      bizNew = businessRows.filter((r) => !existingBizSet.has(r.id)).length;

      const { error: bizErr } = await supabase.from("startup_business").upsert(businessRows, {
        onConflict: "id",
        ignoreDuplicates: false,
      });
      if (bizErr) throw new Error(`startup_business upsert: ${bizErr.message}`);
      bizUpsert = businessRows.length;
    }

    if (announcementRows.length > 0) {
      const annIds = announcementRows.map((r) => r.pbanc_sn);
      const { data: existingAnn } = await supabase
        .from("startup_announcement")
        .select("pbanc_sn")
        .in("pbanc_sn", annIds);
      const existingAnnSet = new Set((existingAnn ?? []).map((r) => r.pbanc_sn));
      annNew = announcementRows.filter((r) => !existingAnnSet.has(r.pbanc_sn)).length;

      const { error: annErr } = await supabase.from("startup_announcement").upsert(announcementRows, {
        onConflict: "pbanc_sn",
        ignoreDuplicates: false,
      });
      if (annErr) throw new Error(`startup_announcement upsert: ${annErr.message}`);
      annUpsert = announcementRows.length;
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

    return new Response(
      JSON.stringify({
        success: true,
        mode: forceFull ? "full" : "incremental",
        startup_business: bizUpsert,
        startup_announcement: annUpsert,
        message: `startup_business ${bizUpsert}건, startup_announcement ${annUpsert}건 upsert 완료`,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error(e);
    return new Response(
      JSON.stringify({ success: false, error: String(e) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
