// Supabase Edge Function: 위비티(wevity) 공모전 크롤링 → contests 테이블 upsert
// https://www.wevity.com/?c=find
//
// GitHub Actions에서 crawl-contests와 함께 호출

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { load } from "https://esm.sh/cheerio@1.0.0-rc.12";

const BASE_URL = "https://www.wevity.com";
const SOURCE = "위비티";
const PAGES_INCREMENTAL = 3;
const PAGES_FULL_DEFAULT = 10;
const PAGES_MAX_CAP = 100;  // 절대 상한 (과도한 크롤링 방지)

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
      created_at: now,
      first_seen_at: now,
    });
  });

  return results;
}

async function crawlWevityPages(
  maxPagesOrUntilEmpty: number,
  stopWhenEmpty: boolean
): Promise<{ rows: ContestRow[]; pagesCrawled: number }> {
  const all: ContestRow[] = [];
  const seenIds = new Set<string>();
  const headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "ko-KR,ko;q=0.9",
  };

  for (let p = 1; p <= maxPagesOrUntilEmpty; p++) {
    const url = `${BASE_URL}/?c=find&s=1&gbn=list&gp=${p}`;
    try {
      const res = await fetch(url, { headers });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const html = await res.text();
      const rows = parseWevityPage(html);
      let newCount = 0;
      for (const r of rows) {
        if (!seenIds.has(r.id)) {
          seenIds.add(r.id);
          all.push(r);
          newCount++;
        }
      }
      // 빈 페이지에서 중단 (단, 이미 수집된 데이터가 있을 때만 — 첫 페이지만 비어있으면 파싱/서버 오류 가능성)
      if (stopWhenEmpty && newCount === 0 && all.length > 0) {
        return { rows: all, pagesCrawled: p };
      }
      await new Promise((r) => setTimeout(r, 1200));
    } catch (e) {
      console.error(`Wevity page ${p} error:`, e);
      if (stopWhenEmpty) return { rows: all, pagesCrawled: p - 1 };
    }
  }
  return { rows: all, pagesCrawled: maxPagesOrUntilEmpty };
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
    let stopWhenEmpty: boolean;
    if (forceFull) {
      maxPages = PAGES_MAX_CAP;
      stopWhenEmpty = true;
      isFull = true;
    } else {
      const { count } = await supabase
        .from("contests")
        .select("*", { count: "exact", head: true })
        .eq("source", SOURCE);
      const isInitial = (count ?? 0) === 0;
      if (isInitial) {
        maxPages = PAGES_MAX_CAP;
        stopWhenEmpty = true;
      } else {
        maxPages = PAGES_INCREMENTAL;
        stopWhenEmpty = false;
      }
      isFull = isInitial;
    }

    const { rows: contests, pagesCrawled } = await crawlWevityPages(maxPages, stopWhenEmpty);
    if (contests.length === 0) {
      return new Response(
        JSON.stringify({ success: true, total: 0, source: SOURCE, message: "No data" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    const { error } = await supabase.from("contests").upsert(contests, {
      onConflict: "source,id",
      ignoreDuplicates: false,
    });

    if (error) {
      console.error("Wevity upsert error:", error);
      return new Response(
        JSON.stringify({ success: false, error: error.message }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        total: contests.length,
        source: SOURCE,
        mode: isFull ? "full" : "incremental",
        pages: pagesCrawled,
        message: `위비티 ${contests.length}건 upsert 완료 (${pagesCrawled}페이지)`,
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
