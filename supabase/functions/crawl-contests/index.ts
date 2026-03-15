// Supabase Edge Function: 공모전 크롤링 → contests 테이블 upsert
// GitHub Actions 30분마다 호출
//
// - DB 비어있을 때: 전체 페이지(1~10) 한 번 크롤링
// - DB에 데이터 있으면: 1~3페이지만 (신규/최근 공고 + d-day 갱신)

// npx supabase functions deploy crawl-contests

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { load } from "https://esm.sh/cheerio@1.0.0-rc.12";

const BASE_URL = "https://www.allforyoung.com";
const SOURCE = "요즘것들";

async function dispatchNotificationToMembers(supabase: ReturnType<typeof createClient>, notificationId: string) {
  const { data: members } = await supabase.from("profiles").select("id").eq("role", "member");
  if (!members?.length) return;
  await supabase.from("notification_user_state").insert(
    members.map((m) => ({ user_id: m.id, notification_id: notificationId, read: false, deleted: false }))
  );
}
const PAGES_INCREMENTAL = 3;   // 30분마다: 신규/최근 위주
const PAGES_FULL = 10;          // 초기 또는 full 모드

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

function parseContestPage(html: string, _page: number): ContestRow[] {
  const $ = load(html);
  const results: ContestRow[] = [];
  const seenIds = new Set<string>();
  const now = new Date().toISOString();

  $('a[href*="/posts/"]').each((_, el) => {
    const href = $(el).attr("href") || "";
    const m = href.match(/\/posts\/(\d+)(?:\?|$)/);
    if (!m) return;
    const postId = m[1];
    if (seenIds.has(postId)) return;

    const li = $(el).closest("li");
    if (!li.length) return;
    seenIds.add(postId);

    const img = li.find("img[alt]").first();
    const title = img.attr("alt")?.trim() || "(제목 없음)";

    const badgeSpan = li.find("[data-slot=badge]").first();
    const dDay = badgeSpan.text().trim();

    const cardFooter = li.find("[data-slot=card-footer]").first();
    const host = cardFooter.text().trim();

    let category = "공모전";
    const cardContent = li.find("[data-slot=card-content]").first();
    const catBadge = cardContent.find("[data-slot=badge]").first();
    if (catBadge.length) {
      category = catBadge.text().trim() || category;
    }

    const fullUrl = href.startsWith("http") ? href : `${BASE_URL}${href}`;

    results.push({
      source: SOURCE,
      id: postId,
      title,
      d_day: dDay,
      host,
      url: fullUrl,
      category,
      updated_at: now,
    });
  });

  return results;
}

async function crawlPostDetail(postId: string): Promise<string | null> {
  const url = `${BASE_URL}/posts/${postId}`;
  try {
    await new Promise((r) => setTimeout(r, 500)); // 딜레이
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
        "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
        "Accept-Encoding": "gzip, deflate, br",
        Referer: "https://www.allforyoung.com/",
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
    
    // 본문 추출 (HTML 형식)
    let article = $("article").first();
    if (article.length === 0) {
      article = $("main").first();
      if (article.length === 0) {
        article = $("body");
      }
    }
    
    // prose, markdown, content 클래스 찾기
    let prose = article.find(".prose, .markdown, .content").first();
    if (prose.length === 0) prose = article;
    
    // 불필요한 요소 제거
    prose.find("script, style, nav, header, footer, aside, .ad, .ads, [class*='ad']").remove();
    
    // HTML 형식으로 반환 (최대 50000자)
    let htmlContent = prose.html() || "";
    if (htmlContent.length > 50000) {
      htmlContent = htmlContent.slice(0, 50000);
    }
    
    return htmlContent || null;
  } catch (e) {
    console.error(`상세 크롤링 실패 ${postId}:`, e);
    return null;
  }
}

async function crawlPages(maxPages: number): Promise<ContestRow[]> {
  const all: ContestRow[] = [];
  const seenIds = new Set<string>();

  for (let p = 1; p <= maxPages; p++) {
    const url = `${BASE_URL}/posts/contest?page=${p}`;
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "ko-KR,ko;q=0.9",
        },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const html = await res.text();
      const rows = parseContestPage(html, p);
      for (const r of rows) {
        if (!seenIds.has(r.id)) {
          seenIds.add(r.id);
          all.push(r);
        }
      }
      await new Promise((r) => setTimeout(r, 1000));
    } catch (e) {
      console.error(`Page ${p} error:`, e);
    }
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
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    // full=1 쿼리 또는 body { full: true } → 항상 전체 크롤링
    const url = new URL(req.url);
    let forceFull = url.searchParams.get("full") === "1" || url.searchParams.get("full") === "true";
    if (!forceFull && req.method === "POST") {
      try {
        const body = await req.json().catch(() => ({}));
        forceFull = body?.full === true || body?.full === 1;
      } catch {
        /* ignore */
      }
    }

    let maxPages: number;
    let isFull: boolean;
    if (forceFull) {
      maxPages = PAGES_FULL;
      isFull = true;
    } else {
      const { count } = await supabase
        .from("contests")
        .select("*", { count: "exact", head: true })
        .eq("source", SOURCE);
      const isInitial = (count ?? 0) === 0;
      maxPages = isInitial ? PAGES_FULL : PAGES_INCREMENTAL;
      isFull = isInitial;
    }

    const contests = await crawlPages(maxPages);
    if (contests.length === 0) {
      return new Response(
        JSON.stringify({ success: true, total: 0, message: "No data" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // 기존 레코드 조회 → created_at, first_seen_at, content 유지
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
        const content = await crawlPostDetail(contest.id);
        if (content) {
          contest.content = content;
        } else {
          // 크롤링 실패해도 빈 문자열로 저장 (다음에 다시 시도)
          contest.content = '';
        }
        await new Promise((r) => setTimeout(r, 300)); // 요청 간 딜레이
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

    const { error } = await supabase.from("contests").upsert(rowsToUpsert, {
      onConflict: "source,id",
      ignoreDuplicates: false,
    });

    if (error) {
      console.error("Upsert error:", error);
      return new Response(
        JSON.stringify({ success: false, error: error.message }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

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

    return new Response(
      JSON.stringify({
        success: true,
        total: rowsToUpsert.length,
        mode: isFull ? "full" : "incremental",
        pages: maxPages,
        message: `${rowsToUpsert.length}건 upsert 완료 (${isFull ? "전체" : "1~3페이지만"})`,
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
