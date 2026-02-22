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
        const { error: upsertErr } = await supabase.from("contests").upsert(rows, {
          onConflict: "source,id",
          ignoreDuplicates: false,
        });
        if (upsertErr) throw upsertErr;
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
        const { error: upsertErr } = await supabase.from("contests").upsert(contests, {
          onConflict: "source,id",
          ignoreDuplicates: false,
        });
        if (upsertErr) throw upsertErr;
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
