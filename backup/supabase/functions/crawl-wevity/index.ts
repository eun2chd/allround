// Supabase Edge Function: 위비티(wevity) 공모전 크롤링 → contests 테이블 upsert
// https://www.wevity.com/?c=find
//
// GitHub Actions에서 crawl-contests와 함께 호출

// npx supabase functions deploy crawl-wevity

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { load } from "https://esm.sh/cheerio@1.0.0-rc.12";

const BASE_URL = "https://www.wevity.com";
const SOURCE = "위비티";

async function dispatchNotificationToMembers(supabase: ReturnType<typeof createClient>, notificationId: string) {
  const { data: members } = await supabase.from("profiles").select("id").eq("role", "member");
  if (!members?.length) return;
  await supabase.from("notification_user_state").insert(
    members.map((m) => ({ user_id: m.id, notification_id: notificationId, read: false, deleted: false }))
  );
}
const PAGES_INCREMENTAL = 3;
const PAGES_MAX_CAP = 100;  // 절대 상한
const PAGES_PER_FULL = 2;  // full 실행당 크롤 페이지 수 (4시간마다 2페이지)
const DELAY_MS_INCREMENTAL = 1200;  // 증분 시 페이지 간 딜레이
const DELAY_MS_FULL = 400;  // full 시 페이지 간 딜레이 (2페이지만, ~1초)

interface ContestRow {
  source: string;
  id: string;
  title: string;
  d_day: string;
  host: string;
  url: string;
  category: string;
  content?: string;  // 본문
  created_at?: string;
  first_seen_at?: string | null;
  updated_at: string;
}

function parseWevityPage(html: string): ContestRow[] {
  const $ = load(html);
  const results: ContestRow[] = [];
  const seenIds = new Set<string>();
  const now = new Date().toISOString();

  $('ul.list > li').each((_, el) => {
    const li = $(el);
    if (li.hasClass("top")) return;

    const link = li.find('div.tit a[href*="gbn=view"][href*="ix="]').first();
    const href = link.attr("href") || "";
    const m = href.match(/ix=(\d+)/);
    if (!m) return;
    const contestId = m[1];
    if (seenIds.has(contestId)) return;

    seenIds.add(contestId);

    let title = link.clone().children().remove().end().text().trim()
      .replace(/\s+SPECIAL\s*$/i, "").replace(/\s+IDEA\s*$/i, "")
      .replace(/\s+/g, " ") || "(제목 없음)";

    let category = "공모전";
    const subTit = li.find("div.sub-tit").first().text().trim();
    const catMatch = subTit.match(/분야\s*:\s*(.+)/);
    if (catMatch) {
      category = catMatch[1].trim().replace(/\s+/g, " ").slice(0, 200) || category;
    }

    const host = li.find("div.organ").first().text().trim().replace(/\s+/g, " ") || "-";
    const dayEl = li.find("div.day").first();
    let dDay = dayEl.clone().children().remove().end().text().trim().replace(/\s+/g, " ") || "-";
    const dMatch = dDay.match(/(D-\d+|오늘\s*마감|마감)/);
    if (dMatch) dDay = dMatch[1].trim();

    const fullUrl = href.startsWith("http") ? href : href.startsWith("?") ? BASE_URL + href : BASE_URL + "/" + href;

    results.push({
      source: SOURCE,
      id: contestId,
      title,
      d_day: dDay || "-",
      host,
      url: fullUrl,
      category,
      updated_at: now,
    });
  });

  return results;
}

async function crawlWevityDetail(contestId: string): Promise<string | null> {
  const url = `${BASE_URL}/?c=find&s=1&gbn=view&ix=${contestId}`;
  try {
    await new Promise((r) => setTimeout(r, 500)); // 딜레이
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
        "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
        "Accept-Encoding": "gzip, deflate, br",
        Referer: "https://www.wevity.com/",
        Connection: "keep-alive",
        "Upgrade-Insecure-Requests": "1",
      },
    });
    if (!res.ok) {
      if (res.status === 403) {
        console.error(`403 차단: ${url}`);
        return null;
      }
      throw new Error(`HTTP ${res.status}`);
    }
    const html = await res.text();
    const $ = load(html);
    
    // 본문 추출 - div.ct, div.view-cont, #viewContents 등 (HTML 형식)
    let bodyEl = $("div.ct, div.view-cont, #viewContents, div.detail-cont, .board-cont").first();
    if (bodyEl.length === 0) {
      bodyEl = $("div").filter((_, el) => {
        const cls = $(el).attr("class") || "";
        return /view|content|body/i.test(cls);
      }).first();
    }
    
    if (bodyEl.length === 0) bodyEl = $("body");
    
    // 불필요한 요소 제거
    bodyEl.find("script, style, nav, header, footer, aside, .ad, .ads, [class*='ad']").remove();
    
    // HTML 형식으로 반환 (최대 50000자)
    let htmlContent = bodyEl.html() || "";
    if (htmlContent.length > 50000) {
      htmlContent = htmlContent.slice(0, 50000);
    }
    
    return htmlContent || null;
  } catch (e) {
    console.error(`상세 크롤링 실패 ${contestId}:`, e);
    return null;
  }
}

async function crawlWevityPage(page: number): Promise<ContestRow[]> {
  const headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "ko-KR,ko;q=0.9",
  };
  const url = `${BASE_URL}/?c=find&s=1&gbn=list&gp=${page}`;
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return parseWevityPage(await res.text());
}

async function crawlWevityPages(
  startPage: number,
  endPage: number,
  delayMs: number
): Promise<{ rows: ContestRow[]; pagesCrawled: number }> {
  const all: ContestRow[] = [];
  const seenIds = new Set<string>();

  for (let p = startPage; p <= endPage; p++) {
    try {
      const rows = await crawlWevityPage(p);
      for (const r of rows) {
        if (!seenIds.has(r.id)) {
          seenIds.add(r.id);
          all.push(r);
        }
      }
      if (p < endPage) await new Promise((r) => setTimeout(r, delayMs));
    } catch (e) {
      console.error(`Wevity page ${p} error:`, e);
    }
  }
  return { rows: all, pagesCrawled: endPage - startPage + 1 };
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

  try {
    const url = new URL(req.url);
    let forceFull = url.searchParams.get("full") === "1" || url.searchParams.get("full") === "true";
    if (req.method === "POST") {
      try {
        const body = await req.json().catch(() => ({}));
        if (body?.full === true || body?.full === 1) forceFull = true;
      } catch { /* ignore */ }
    }

    let contests: ContestRow[];
    let pagesCrawled: number;
    let isFull: boolean;
    let nextPage: number | null = null;

    if (forceFull) {
      // full: 2페이지만 크롤 (4시간마다), crawl_state로 다음 페이지 추적
      const { data: state } = await supabase
        .from("crawl_state")
        .select("next_page")
        .eq("source", SOURCE)
        .single();

      const startPage = Math.min(Math.max(1, state?.next_page ?? 1), PAGES_MAX_CAP);
      const endPage = Math.min(startPage + PAGES_PER_FULL - 1, PAGES_MAX_CAP);
      const { rows, pagesCrawled: n } = await crawlWevityPages(
        startPage, endPage, DELAY_MS_FULL
      );

      if (rows.length > 0) {
        const ids = [...new Set(rows.map((c) => c.id))];
        const { data: existing } = await supabase
          .from("contests")
          .select("id, created_at, first_seen_at, content")
          .eq("source", SOURCE)
          .in("id", ids);
        const existingMap = new Map(
          (existing ?? []).map((r) => [r.id, { 
            created_at: r.created_at, 
            first_seen_at: r.first_seen_at,
            content: r.content 
          }])
        );
        
        // 상세 페이지 크롤링 (content가 비어있으면 크롤링, 있으면 기존 값 유지)
        console.log(`상세 페이지 크롤링 시작: ${rows.length}건`);
        for (const contest of rows) {
          const ex = existingMap.get(contest.id);
          // content가 없거나 비어있으면 크롤링해서 채우기 (insert)
          // content가 이미 있으면 크롤링하지 않고 기존 값 유지 (update)
          if (!ex?.content || (typeof ex.content === 'string' && ex.content.trim() === '')) {
            const content = await crawlWevityDetail(contest.id);
            if (content) {
              contest.content = content;
            } else {
              // 크롤링 실패해도 빈 문자열로 저장 (다음에 다시 시도)
              contest.content = '';
            }
            await new Promise((r) => setTimeout(r, 300));
          } else {
            // 기존 content 유지 (update)
            contest.content = ex.content;
          }
        }
        
        const now = new Date().toISOString();
        const rowsToUpsert = rows.map((c) => {
          const ex = existingMap.get(c.id);
          return {
            ...c,
            created_at: ex?.created_at ?? now,
            first_seen_at: ex?.first_seen_at ?? now,
          };
        });
        const { error: upsertErr } = await supabase.from("contests").upsert(rowsToUpsert, {
          onConflict: "source,id",
          ignoreDuplicates: false,
        });
        if (upsertErr) throw upsertErr;
        const insertedCount = rowsToUpsert.filter((c) => !existingMap.has(c.id)).length;
        const updatedCount = rowsToUpsert.filter((c) => existingMap.has(c.id)).length;
        if (insertedCount > 0) {
          const { data: notif } = await supabase
            .from("notifications")
            .insert({
              type: "insert",
              source: SOURCE,
              count: insertedCount,
              message: `${SOURCE} 공모전의 ${insertedCount}개의 데이터가 새로 추가되었어요`,
            })
            .select("id")
            .single();
          if (notif?.id) await dispatchNotificationToMembers(supabase, notif.id);
        }
        if (updatedCount > 0) {
          const { data: notif } = await supabase
            .from("notifications")
            .insert({
              type: "update",
              source: SOURCE,
              count: updatedCount,
              message: `${SOURCE} 공모전의 ${updatedCount}개의 데이터가 새로 업데이트 했어요`,
            })
            .select("id")
            .single();
          if (notif?.id) await dispatchNotificationToMembers(supabase, notif.id);
        }
      }

      const lastHadData = rows.length > 0;
      nextPage = !lastHadData && startPage > 1
        ? 1  // 빈 페이지 도달 → 처음으로 리셋
        : endPage >= PAGES_MAX_CAP
          ? 1  // 100페이지 도달 → 처음으로 순환
          : endPage + 1;

      await supabase.from("crawl_state").upsert(
        { source: SOURCE, next_page: nextPage, updated_at: new Date().toISOString() },
        { onConflict: "source" }
      );

      contests = rows;
      pagesCrawled = n;
      isFull = true;
    } else {
      // 증분: 최근 3페이지만 (30분마다)
      const { rows, pagesCrawled: n } = await crawlWevityPages(
        1, PAGES_INCREMENTAL, DELAY_MS_INCREMENTAL
      );
      contests = rows;
      pagesCrawled = n;
      isFull = false;

      if (contests.length > 0) {
        const ids = [...new Set(contests.map((c) => c.id))];
        const { data: existing } = await supabase
          .from("contests")
          .select("id, created_at, first_seen_at, content")
          .eq("source", SOURCE)
          .in("id", ids);
        const existingMap = new Map(
          (existing ?? []).map((r) => [r.id, { 
            created_at: r.created_at, 
            first_seen_at: r.first_seen_at,
            content: r.content 
          }])
        );
        
        // 상세 페이지 크롤링 (content가 비어있으면 크롤링, 있으면 기존 값 유지)
        console.log(`상세 페이지 크롤링 시작: ${contests.length}건`);
        for (const contest of contests) {
          const ex = existingMap.get(contest.id);
          // content가 없거나 비어있으면 크롤링해서 채우기 (insert)
          // content가 이미 있으면 크롤링하지 않고 기존 값 유지 (update)
          if (!ex?.content || (typeof ex.content === 'string' && ex.content.trim() === '')) {
            const content = await crawlWevityDetail(contest.id);
            if (content) {
              contest.content = content;
            } else {
              // 크롤링 실패해도 빈 문자열로 저장 (다음에 다시 시도)
              contest.content = '';
            }
            await new Promise((r) => setTimeout(r, 300));
          } else {
            // 기존 content 유지 (update)
            contest.content = ex.content;
          }
        }
        
        const now = new Date().toISOString();
        const rowsToUpsert = contests.map((c) => {
          const ex = existingMap.get(c.id);
          return {
            ...c,
            created_at: ex?.created_at ?? now,
            first_seen_at: ex?.first_seen_at ?? now,
          };
        });
        const { error: upsertErr } = await supabase.from("contests").upsert(rowsToUpsert, {
          onConflict: "source,id",
          ignoreDuplicates: false,
        });
        if (upsertErr) throw upsertErr;
        const insertedCount = rowsToUpsert.filter((c) => !existingMap.has(c.id)).length;
        const updatedCount = rowsToUpsert.filter((c) => existingMap.has(c.id)).length;
        if (insertedCount > 0) {
          const { data: notif } = await supabase
            .from("notifications")
            .insert({
              type: "insert",
              source: SOURCE,
              count: insertedCount,
              message: `${SOURCE} 공모전의 ${insertedCount}개의 데이터가 새로 추가되었어요`,
            })
            .select("id")
            .single();
          if (notif?.id) await dispatchNotificationToMembers(supabase, notif.id);
        }
        if (updatedCount > 0) {
          const { data: notif } = await supabase
            .from("notifications")
            .insert({
              type: "update",
              source: SOURCE,
              count: updatedCount,
              message: `${SOURCE} 공모전의 ${updatedCount}개의 데이터가 새로 업데이트 했어요`,
            })
            .select("id")
            .single();
          if (notif?.id) await dispatchNotificationToMembers(supabase, notif.id);
        }
      }
    }
    const resBody: Record<string, unknown> = {
      success: true,
      total: contests.length,
      source: SOURCE,
      mode: isFull ? "full" : "incremental",
      pages: pagesCrawled,
      message: `위비티 ${contests.length}건 upsert 완료 (${pagesCrawled}페이지)`,
    };
    if (nextPage != null) resBody.nextPage = nextPage;

    return new Response(
      JSON.stringify(resBody),
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
