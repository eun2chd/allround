// Supabase Edge Function: 공모전 크롤링 → contests 테이블 upsert
// GitHub Actions 30분마다 호출
//
// - DB 비어있을 때: 전체 페이지(1~10) 한 번 크롤링
// - DB에 데이터 있으면: 1~3페이지만 (신규/최근 공고 + d-day 갱신)

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { load } from "https://esm.sh/cheerio@1.0.0-rc.12";

const BASE_URL = "https://www.allforyoung.com";
const SOURCE = "요즘것들";
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
  created_at: string;
  first_seen_at: string | null;
}

function parseContestPage(html: string, page: number): ContestRow[] {
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
      created_at: now,
      first_seen_at: now,
    });
  });

  return results;
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

    const { data, error } = await supabase.from("contests").upsert(contests, {
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

    return new Response(
      JSON.stringify({
        success: true,
        total: contests.length,
        mode: isFull ? "full" : "incremental",
        pages: maxPages,
        message: `${contests.length}건 upsert 완료 (${isFull ? "전체" : "1~3페이지만"})`,
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
